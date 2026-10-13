// Google Drive Upload
//
// Adds a Google Drive button to the attachments panel (or, if chosen in the
// settings, to the post editor toolbar). It opens a small popup that always
// shows which Google account the files will go to, so nobody uploads to their
// own account by mistake. Picked files are uploaded to a folder in that Drive
// (name set in the settings), shared as "anyone with the link can view", and a
// link to each one is inserted into the post. When a regular attachment is
// rejected for being too big, it offers to upload that file to Drive instead.
//
// Sign-in and the folder lookup happen in the background (background.drive.js);
// the upload itself runs here so the file never has to pass through messaging.
//
// Runs as a content script (isolated world) and is controlled by the
// "driveUpload" and "driveButtonPlace" settings, which apply without a reload.

(function () {
    'use strict';

    const SETTING_KEY = 'driveUpload';
    const PLACE_KEY = 'driveButtonPlace'; // 'attachments' (default) or 'toolbar'
    const DRIVE_API = 'https://www.googleapis.com/drive/v3';
    const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
    const HOLD_STATUS_MS = 4000;
    const TOO_BIG_WINDOW_MS = 30000; // how long after picking a file a failure is blamed on its size

    // Single color, so it sits quietly next to the forum's own grey icons
    const DRIVE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
        + '<path fill="currentColor" d="M7.71 3.5 1.15 15l3.43 6 6.55-11.5M9.73 15 6.3 21h13.12l3.43-6M22.28 14 15.42 2H8.58l6.85 12z"/>'
        + '</svg>';

    let widget = null;
    let enabled = false;
    let place = 'attachments';

    // ---------------------------------------------------------------------
    // Setting handling: on unless the user explicitly turned it off
    // ---------------------------------------------------------------------

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY, PLACE_KEY], (items) => {
            enabled = items[SETTING_KEY] !== false;
            place = items[PLACE_KEY] === 'toolbar' ? 'toolbar' : 'attachments';
            if (enabled) mount();
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || (!changes[SETTING_KEY] && !changes[PLACE_KEY])) return;
            if (changes[SETTING_KEY]) enabled = changes[SETTING_KEY].newValue !== false;
            if (changes[PLACE_KEY]) place = changes[PLACE_KEY].newValue === 'toolbar' ? 'toolbar' : 'attachments';
            unmount();
            if (enabled) mount();
        });
    }

    function mount() {
        if (widget || !findTextarea()) return;
        widget = createWidget();
    }

    function unmount() {
        if (!widget) return;
        widget.destroy();
        widget = null;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function findTextarea() {
        return document.querySelector('textarea[name="message"]');
    }

    // The forum uses the ABBC3 toolbar and hides phpBB's own #format-buttons,
    // so prefer the last visible ABBC3 row and only fall back to the stock toolbar
    function findToolbar() {
        const isVisible = (node) => node && node.getClientRects().length > 0;
        const rows = Array.from(document.querySelectorAll('#abbc3_buttons .abbc3_buttons_row')).filter(isVisible);
        if (rows.length) return rows[rows.length - 1];
        const stock = document.getElementById('format-buttons');
        return isVisible(stock) ? stock : null;
    }

    // The row with phpBB's "add files" button; missing when the user can't attach here
    function findAttachButtons() {
        return document.getElementById('attach-panel-multi');
    }

    // The forum's limit as printed in the attachments panel, e.g. "... 400 KiB."
    function readAttachLimit() {
        const panel = document.getElementById('attach-panel');
        const match = panel && panel.textContent.match(/(\d+(?:[.,]\d+)?)\s*(KiB|MiB|GiB|KB|MB|GB)\b/i);
        if (!match) return null;
        const power = { k: 1, m: 2, g: 3 }[match[2][0].toLowerCase()];
        return parseFloat(match[1].replace(',', '.')) * Math.pow(1024, power);
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function formatSize(bytes) {
        if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    function sendToBackground(type, extra) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, ...extra }, (response) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!response || response.error) {
                    const error = new Error((response && response.error) || 'No response');
                    error.code = response && response.code;
                    return reject(error);
                }
                resolve(response);
            });
        });
    }

    function httpError(status, what) {
        const error = new Error(`${what} failed (${status})`);
        error.status = status;
        return error;
    }

    // Resumable upload: one request to create the file, one PUT with the bytes
    // (a plain XHR so we can report progress)
    async function uploadFile(file, token, folderId, onProgress) {
        const start = await fetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id,name,webViewLink`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': file.type || 'application/octet-stream'
            },
            body: JSON.stringify({ name: file.name, parents: [folderId] })
        });
        if (!start.ok) throw httpError(start.status, 'Upload');

        const sessionUrl = start.headers.get('Location');
        if (!sessionUrl) throw new Error('Google Drive did not return an upload address');

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', sessionUrl);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(e.loaded / e.total);
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
                else reject(httpError(xhr.status, 'Upload'));
            };
            xhr.onerror = () => reject(new Error('Network error while uploading'));
            xhr.send(file);
        });
    }

    async function makePublic(fileId, token) {
        const response = await fetch(`${DRIVE_API}/files/${fileId}/permissions`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
        if (!response.ok) throw httpError(response.status, 'Sharing');
    }

    // Square brackets in the name would break the BBCode
    function linkBBCode(file) {
        const url = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
        const label = (file.name || 'file').replace(/\[/g, '(').replace(/\]/g, ')');
        return `[url=${url}]${label}[/url]`;
    }

    function insertAtCursor(textarea, text) {
        const start = textarea.selectionStart != null ? textarea.selectionStart : textarea.value.length;
        const end = textarea.selectionEnd != null ? textarea.selectionEnd : start;
        const before = textarea.value.slice(0, start);
        const prefix = before && !before.endsWith('\n') ? '\n' : '';
        textarea.setRangeText(prefix + text + '\n', start, end, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    }

    // ---------------------------------------------------------------------
    // The widget
    // ---------------------------------------------------------------------

    function createWidget() {
        const cleanups = [];

        const wrap = el('span');
        wrap.id = 'ivd-wrap';

        // Next to phpBB's "add files" button by default, or with the BBCode buttons.
        // Falls back to whichever exists, and finally to above the textarea.
        const attachButtons = findAttachButtons();
        const toolbar = place === 'toolbar' || !attachButtons ? findToolbar() : null;
        const inToolbar = !!toolbar;

        // Styled like its neighbours: a bare ABBC3 icon, or a phpBB button with a label
        const button = el('button', inToolbar ? 'abbc3_button' : 'button2');
        button.id = 'ivd-button';
        button.type = 'button';
        button.title = 'Google Drive';
        button.setAttribute('aria-label', 'Google Drive');
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = DRIVE_ICON;
        if (!inToolbar) button.append(el('span', '', 'Google Drive'));

        // --- Popup: shows the connected account before anything is uploaded ---
        const popup = el('div', 'ivd-popup');
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Google Drive');
        popup.dir = 'rtl';
        popup.hidden = true;

        const heading = el('div', 'ivd-heading');

        const accountBox = el('div', 'ivd-account');
        const avatar = el('img', 'ivd-avatar');
        avatar.alt = '';
        avatar.referrerPolicy = 'no-referrer';
        const accountText = el('div', 'ivd-account-text');
        const accountName = el('div', 'ivd-account-name');
        const accountEmail = el('bdi', 'ivd-account-email');
        accountText.append(accountName, accountEmail);
        accountBox.append(avatar, accountText);

        const quotaBox = el('div', 'ivd-quota');
        const quotaBar = el('div', 'ivd-quota-bar');
        const quotaFill = el('div', 'ivd-quota-fill');
        quotaBar.append(quotaFill);
        const quotaText = el('div', 'ivd-quota-text');
        quotaBox.append(quotaBar, quotaText);

        const pickBtn = el('button', 'ivd-btn ivd-primary', '⬆ קלייבט אויס פיילס');
        pickBtn.type = 'button';
        const connectBtn = el('button', 'ivd-btn ivd-primary', 'פארבינד א Google אקאונט');
        connectBtn.type = 'button';
        const switchBtn = el('button', 'ivd-btn', 'טויש אקאונט');
        switchBtn.type = 'button';
        const disconnectBtn = el('button', 'ivd-link', 'ארויסלאגן');
        disconnectBtn.type = 'button';

        const actions = el('div', 'ivd-actions');
        actions.append(pickBtn, connectBtn, switchBtn);

        const status = el('div', 'ivd-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const input = el('input');
        input.type = 'file';
        input.multiple = true;
        input.hidden = true;

        popup.append(heading, accountBox, quotaBox, actions, status, disconnectBtn);
        wrap.append(button, popup, input);

        if (inToolbar) toolbar.append(wrap);
        else if (attachButtons) attachButtons.append(wrap);
        else findTextarea().before(wrap);
        wrap.classList.add(inToolbar ? 'ivd-in-toolbar' : 'ivd-in-attach');

        // --- Offer shown when a regular attachment is too big for the forum ---
        const offer = el('div');
        offer.id = 'ivd-offer';
        offer.dir = 'rtl';
        offer.hidden = true;
        const offerText = el('span', 'ivd-offer-text');
        const offerBtn = el('button', 'button2');
        offerBtn.type = 'button';
        offerBtn.innerHTML = DRIVE_ICON;
        const offerBtnText = el('span');
        offerBtn.append(offerBtnText);
        const offerClose = el('button', 'ivd-offer-close', '×');
        offerClose.type = 'button';
        offerClose.title = 'פארמאך';
        offerClose.setAttribute('aria-label', 'פארמאך');
        offer.append(offerText, offerBtn, offerClose);
        if (attachButtons) attachButtons.after(offer);
        else wrap.after(offer);

        // --- State ---
        let account = null;
        let quota = null;
        let busy = false;
        let statusTimer = null;
        let pending = null; // too-big attachments waiting to go to Drive instead

        function showStatus(text, kind, holdMs) {
            clearTimeout(statusTimer);
            status.textContent = text || '';
            status.className = 'ivd-status' + (kind ? ' ivd-' + kind : '');
            if (text && holdMs) statusTimer = setTimeout(() => showStatus(''), holdMs);
        }

        // Single place that decides what the popup shows
        function render() {
            const connected = !!account;
            heading.textContent = connected ? 'די פיילס וועלן ארויפגיין צו:' : 'ארויפלייגן פיילס אויף Google Drive';
            accountBox.hidden = !connected;
            renderQuota();
            pickBtn.hidden = !connected;
            switchBtn.hidden = !connected;
            disconnectBtn.hidden = !connected;
            connectBtn.hidden = connected;
            pickBtn.textContent = pending
                ? '⬆ לייגט ארויף: ' + (pending.length > 1 ? `${pending.length} פיילס` : pending[0].name)
                : '⬆ קלייבט אויס פיילס';

            if (connected) {
                accountName.textContent = account.name || account.email;
                accountEmail.textContent = account.email;
                avatar.hidden = !account.photo;
                if (account.photo) avatar.src = account.photo;
                button.title = 'Google Drive: ' + account.email;
            } else {
                button.title = 'Google Drive';
            }

            [pickBtn, connectBtn, switchBtn, disconnectBtn].forEach(b => { b.disabled = busy; });
        }

        function freeSpace() {
            return quota && quota.limit != null ? Math.max(0, quota.limit - quota.usage) : null;
        }

        function renderQuota() {
            const free = freeSpace();
            quotaBox.hidden = !account || free === null;
            if (quotaBox.hidden) return;

            const used = Math.min(1, quota.usage / quota.limit);
            quotaFill.style.width = (used * 100).toFixed(1) + '%';
            quotaBox.classList.toggle('ivd-quota-low', used >= 0.9);
            quotaText.textContent = `פריי: ${formatSize(free)} פון ${formatSize(quota.limit)}`;
        }

        // Quietly in the background - if it can't be read, the bar just stays hidden
        async function refreshQuota() {
            if (!account) {
                quota = null;
                renderQuota();
                return;
            }
            try {
                quota = (await sendToBackground('driveQuota')).quota;
            } catch (err) {
                quota = null;
            }
            renderQuota();
        }

        function setBusy(on) {
            busy = on;
            popup.classList.toggle('ivd-busy', on);
            render();
        }

        async function refreshAccount() {
            try {
                account = (await sendToBackground('driveAccount')).account;
            } catch (err) {
                account = null;
            }
            render();
            refreshQuota();
        }

        function setOpen(open) {
            popup.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
            if (open) {
                refreshAccount();
                popup.scrollIntoView({ block: 'nearest' });
            } else if (pending) {
                pending = null;
                render();
            }
        }

        button.addEventListener('click', () => setOpen(popup.hidden));

        // Close on outside click / Escape, but never in the middle of an upload
        const onDocClick = (e) => {
            if (!popup.hidden && !busy && !wrap.contains(e.target) && !offer.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape' && !popup.hidden && !busy) setOpen(false);
        };
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onKeyDown);
        cleanups.push(() => {
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('keydown', onKeyDown);
        });

        // Another tab connected / switched / signed out - stay in sync
        const onStorage = (changes, area) => {
            if (area === 'local' && changes.driveAccount) {
                account = changes.driveAccount.newValue || null;
                render();
            }
        };
        chrome.storage.onChanged.addListener(onStorage);
        cleanups.push(() => chrome.storage.onChanged.removeListener(onStorage));

        async function chooseAccount() {
            setBusy(true);
            showStatus('ווארט אויפן Google פענצטער…');
            try {
                account = (await sendToBackground('driveConnect')).account;
                quota = null;
                showStatus('');
                refreshQuota();
            } catch (err) {
                showStatus('❌ ' + err.message, 'error', HOLD_STATUS_MS * 2);
            } finally {
                setBusy(false);
            }
        }

        connectBtn.addEventListener('click', chooseAccount);
        switchBtn.addEventListener('click', chooseAccount);

        disconnectBtn.addEventListener('click', async () => {
            setBusy(true);
            try {
                await sendToBackground('driveDisconnect');
                account = null;
                showStatus('');
            } catch (err) {
                showStatus('❌ ' + err.message, 'error', HOLD_STATUS_MS * 2);
            } finally {
                setBusy(false);
            }
        });

        pickBtn.addEventListener('click', () => {
            if (busy || !account) return;
            if (pending) {
                const files = pending;
                pending = null;
                uploadAll(files);
                return;
            }
            input.value = '';
            input.click();
        });

        // --- Too-big attachments: remember what was just picked for the forum's own
        // uploader, and when the forum then reports an error, offer Drive instead ---
        const attachLimit = readAttachLimit();
        let tooBig = [];
        let tooBigAt = 0;
        let errorRowsAtPick = 0;
        let offerFiles = null;
        const countErrorRows = () => document.querySelectorAll('#file-list .file-error').length;

        const notePicked = (files) => {
            const big = Array.from(files || []).filter(f => f.size > attachLimit);
            if (!big.length) return;
            tooBig = big;
            tooBigAt = Date.now();
            errorRowsAtPick = countErrorRows();
        };
        const onPickChange = (e) => {
            const target = e.target;
            if (target.type === 'file' && !wrap.contains(target) && target.closest('#attach-panel')) notePicked(target.files);
        };
        const onDrop = (e) => {
            if (e.dataTransfer) notePicked(e.dataTransfer.files);
        };

        // phpBB reports a size error either in its alert box (checked in the browser)
        // or on the file's row in the attachment list (rejected by the server)
        const isVisible = (node) => node && node.getClientRects().length > 0;
        const onPageChange = () => {
            if (!tooBig.length) return;
            if (Date.now() - tooBigAt > TOO_BIG_WINDOW_MS) {
                tooBig = [];
                return;
            }
            const alertShown = isVisible(document.getElementById('phpbb_alert'));
            const rowFailed = countErrorRows() > errorRowsAtPick;
            if (alertShown || rowFailed) {
                showOffer(tooBig);
                tooBig = [];
            }
        };

        if (attachLimit) {
            document.addEventListener('change', onPickChange, true);
            document.addEventListener('drop', onDrop, true);
            const observer = new MutationObserver(onPageChange);
            observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
            cleanups.push(() => {
                document.removeEventListener('change', onPickChange, true);
                document.removeEventListener('drop', onDrop, true);
                observer.disconnect();
            });
        }

        function showOffer(files) {
            offerFiles = files;
            const what = files.length > 1 ? `${files.length} פיילס זענען` : `"${files[0].name}" איז`;
            offerText.textContent = `⚠️ ${what} צו גרויס פאר אן אטעטשמענט (ביז ${formatSize(attachLimit)}).`;
            offerBtnText.textContent = files.length > 1 ? 'לייגט זיי ארויף אויף Google Drive' : 'לייגט עס ארויף אויף Google Drive';
            offer.hidden = false;
        }

        offerBtn.addEventListener('click', () => {
            if (busy || !offerFiles) return;
            pending = offerFiles;
            offer.hidden = true;
            // The button lives in the attachments tab - bring it into view first
            if (!isVisible(button)) {
                const tab = document.querySelector('#attach-panel-tab a, a[data-subpanel="attach-panel"]');
                if (tab) tab.click();
            }
            setOpen(true);
            render();
        });

        offerClose.addEventListener('click', () => {
            offer.hidden = true;
        });

        input.addEventListener('change', () => {
            const files = Array.from(input.files || []);
            if (files.length) uploadAll(files);
        });

        async function uploadAll(files) {
            const total = files.reduce((sum, f) => sum + f.size, 0);
            const free = freeSpace();
            if (free !== null && total > free) {
                showStatus(`❌ נישט גענוג פלאץ אויף Google Drive: די פיילס זענען ${formatSize(total)}, און עס איז נאר דא ${formatSize(free)}`, 'error', HOLD_STATUS_MS * 3);
                return;
            }

            setBusy(true);
            let shareFailed = false;

            try {
                showStatus('פארבינדט מיט Google Drive…');
                let target = await sendToBackground('driveUploadTarget');

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const prefix = files.length > 1 ? `(${i + 1}/${files.length}) ` : '';
                    const onProgress = (p) => showStatus(`${prefix}לייגט ארויף ${file.name}… ${Math.round(p * 100)}%`);
                    onProgress(0);

                    let uploaded;
                    try {
                        uploaded = await uploadFile(file, target.token, target.folderId, onProgress);
                    } catch (err) {
                        if (err.status !== 401) throw err;
                        // Token expired between files - refresh and retry this one
                        target = await sendToBackground('driveUploadTarget', { staleToken: target.token });
                        uploaded = await uploadFile(file, target.token, target.folderId, onProgress);
                    }

                    try {
                        await makePublic(uploaded.id, target.token);
                    } catch (err) {
                        // e.g. a work account whose admin blocks public sharing
                        shareFailed = true;
                    }

                    // Into the post right away, so a later failure never loses it
                    const textarea = findTextarea();
                    if (textarea) insertAtCursor(textarea, linkBBCode(uploaded));
                }

                if (shareFailed) {
                    showStatus('⚠️ ארויפגעלייגט, אבער Google האט נישט ערלויבט צו מאכן אלע פיילס פובליק', 'warn', HOLD_STATUS_MS * 2);
                } else {
                    showStatus(`✅ ארויפגעלייגט ${files.length} ${files.length > 1 ? 'פיילס' : 'פייל'}, דער לינק איז אריינגעלייגט אין דער תגובה`, 'ok', HOLD_STATUS_MS);
                }
            } catch (err) {
                if (err.code === 'not_connected' || err.code === 'account_mismatch') await refreshAccount();
                showStatus('❌ ' + err.message, 'error', HOLD_STATUS_MS * 3);
            } finally {
                setBusy(false);
                refreshQuota();
            }
        }

        render();

        return {
            destroy() {
                clearTimeout(statusTimer);
                cleanups.forEach(fn => fn());
                wrap.remove();
                offer.remove();
            }
        };
    }

    init();
})();
