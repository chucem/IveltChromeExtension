// Google Drive Upload
//
// Adds a "Drive" button to the post editor toolbar. Picked files are uploaded to a
// folder in the user's Google Drive (name set in the settings), shared as
// "anyone with the link can view", and a link to each one is inserted into the post.
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
        // chrome.identity.getAuthToken only works in Google Chrome
        if (isEdge()) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] !== false) mount();
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[SETTING_KEY]) return;
            if (changes[SETTING_KEY].newValue === false) unmount();
            else mount();
        });
    }

    function isEdge() {
        const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
        return brands.some(b => /edge/i.test(b.brand)) || /\bEdg\//.test(navigator.userAgent);
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

    function getUploadTarget(staleToken) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'driveUploadTarget', staleToken }, (response) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!response || response.error) return reject(new Error((response && response.error) || 'No response'));
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
        const wrap = el('span');
        wrap.id = 'ivd-wrap';

        const button = el('button', 'button button-secondary');
        button.id = 'ivd-button';
        button.type = 'button';
        button.title = 'Upload files to Google Drive and insert a public link';
        button.setAttribute('aria-label', button.title);
        button.innerHTML = DRIVE_ICON;

        const status = el('span', 'ivd-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const input = el('input');
        input.type = 'file';
        input.multiple = true;
        input.hidden = true;

        wrap.append(button, status, input);

        // Next to the BBCode buttons when the page has them, otherwise above the textarea
        const toolbar = findToolbar();
        if (toolbar) toolbar.append(wrap);
        else findTextarea().before(wrap);

        let busy = false;
        let statusTimer = null;

        function showStatus(text, kind, holdMs) {
            clearTimeout(statusTimer);
            status.textContent = text || '';
            status.className = 'ivd-status' + (kind ? ' ivd-' + kind : '');
            if (text && holdMs) statusTimer = setTimeout(() => showStatus(''), holdMs);
        }

        button.addEventListener('click', () => {
            if (busy) return;
            input.value = '';
            input.click();
        });

        input.addEventListener('change', () => {
            const files = Array.from(input.files || []);
            if (files.length) uploadAll(files);
        });

        async function uploadAll(files) {
            busy = true;
            button.disabled = true;
            const links = [];
            let shareFailed = false;

            try {
                showStatus('Connecting to Google Drive…');
                let target = await getUploadTarget();

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const prefix = files.length > 1 ? `(${i + 1}/${files.length}) ` : '';
                    const onProgress = (p) => showStatus(`${prefix}Uploading ${file.name}… ${Math.round(p * 100)}%`);
                    onProgress(0);

                    let uploaded;
                    try {
                        uploaded = await uploadFile(file, target.token, target.folderId, onProgress);
                    } catch (err) {
                        if (err.status !== 401) throw err;
                        // Token expired between files - refresh and retry this one
                        target = await getUploadTarget(target.token);
                        uploaded = await uploadFile(file, target.token, target.folderId, onProgress);
                    }

                    try {
                        await makePublic(uploaded.id, target.token);
                    } catch (err) {
                        // e.g. a work account whose admin blocks public sharing
                        shareFailed = true;
                    }

                    links.push(linkBBCode(uploaded));
                }

                if (shareFailed) {
                    showStatus('⚠️ Uploaded, but Google did not allow making some files public', 'warn', HOLD_STATUS_MS * 2);
                } else {
                    showStatus(`✅ Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`, 'ok', HOLD_STATUS_MS);
                }
            } catch (err) {
                showStatus('❌ ' + err.message, 'error', HOLD_STATUS_MS * 2);
            } finally {
                // Insert whatever made it up, even if a later file failed
                const textarea = findTextarea();
                if (links.length && textarea) insertAtCursor(textarea, links.join('\n'));
                busy = false;
                button.disabled = false;
            }
        }

        return {
            destroy() {
                clearTimeout(statusTimer);
                wrap.remove();
            }
        };
    }

    init();
})();
