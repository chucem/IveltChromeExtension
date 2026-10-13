// Google Drive Upload
//
// Adds a Google Drive button to the post editor toolbar. It opens a small popup
// that always shows which Google account the files will go to, so nobody uploads
// to their own account by mistake. Picked files are uploaded to a folder in that
// Drive (name set in the settings), shared as "anyone with the link can view",
// and a link to each one is inserted into the post.
//
// Sign-in and the folder lookup happen in the background (background.drive.js);
// the upload itself runs here so the file never has to pass through messaging.
//
// Runs as a content script (isolated world) and is controlled by the
// "driveUpload" setting, which can be switched on and off without a reload.

(function () {
    'use strict';

    const SETTING_KEY = 'driveUpload';
    const DRIVE_API = 'https://www.googleapis.com/drive/v3';
    const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
    const HOLD_STATUS_MS = 4000;

    const DRIVE_ICON = '<svg viewBox="0 0 87.3 78" width="16" height="16" aria-hidden="true">'
        + '<path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>'
        + '<path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>'
        + '<path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>'
        + '<path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>'
        + '<path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>'
        + '<path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>'
        + '</svg>';

    let widget = null;

    // ---------------------------------------------------------------------
    // Setting handling: on unless the user explicitly turned it off
    // ---------------------------------------------------------------------

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] !== false) mount();
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[SETTING_KEY]) return;
            if (changes[SETTING_KEY].newValue === false) unmount();
            else mount();
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

        const button = el('button', 'button button-secondary');
        button.id = 'ivd-button';
        button.type = 'button';
        button.title = 'Google Drive';
        button.setAttribute('aria-label', 'Google Drive');
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = DRIVE_ICON;

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

        // Next to the BBCode buttons when the page has them, otherwise above the textarea
        const toolbar = findToolbar();
        if (toolbar) toolbar.append(wrap);
        else findTextarea().before(wrap);

        // --- State ---
        let account = null;
        let quota = null;
        let busy = false;
        let statusTimer = null;

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
            if (open) refreshAccount();
        }

        button.addEventListener('click', () => setOpen(popup.hidden));

        // Close on outside click / Escape, but never in the middle of an upload
        const onDocClick = (e) => {
            if (!popup.hidden && !busy && !wrap.contains(e.target)) setOpen(false);
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
            input.value = '';
            input.click();
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
            }
        };
    }

    init();
})();
