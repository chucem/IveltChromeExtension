// Image Resizer
//
// Adds a small floating button on the post editor that shrinks images under the
// forum's attachment size limit before they are attached, and can pack a whole
// folder into a single ZIP attachment. Everything runs locally in the browser -
// no file ever leaves the page except through the forum's own attachment upload.
//
// Runs as a content script (isolated world) and is controlled by the
// "imageResizer" setting, which can be switched on and off without a reload.

(function () {
    'use strict';

    const SETTING_KEY = 'imageResizer';

    const MAX_ATTACHMENTS = 3;
    const MAX_BYTES = 390 * 1024;          // the attachment limit we have to stay under
    const ZIP_SOURCE_LIMIT = 100 * 1024 * 1024; // refuse folders bigger than this - they can never fit anyway
    const ZIP_MIN_IMAGE_BYTES = 30 * 1024;  // never squeeze a single image below this inside a ZIP
    const ZIP_MAX_IMAGE_BYTES = 400 * 1024;
    const HOLD_STATUS_MS = 2500;

    // Formats the forum accepts as they are. Anything else has to be converted;
    // anything on this list is only touched when it is over the size limit.
    const FORUM_SAFE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
    const SKIP_NAMES = ['.ds_store', 'thumbs.db', 'desktop.ini'];
    const SKIP_FOLDERS = ['__macosx'];

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
        if (widget || !document.body) return;
        widget = createWidget();
    }

    function unmount() {
        if (!widget) return;
        widget.destroy();
        widget = null;
    }

    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // Rows that don't carry an error are attached or still uploading
    function getAttachedFilesCount() {
        let count = 0;
        for (const row of document.querySelectorAll('.attach-row')) {
            if (!row.querySelector('.file-error')) count++;
        }
        return count;
    }

    function isImageFile(file) {
        return (file.type || '').startsWith('image/') || (!file.type && IMAGE_EXTENSION.test(file.name));
    }

    function hasFiles(event) {
        return !!event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
    }

    // ---------------------------------------------------------------------
    // The widget
    // ---------------------------------------------------------------------

    function createWidget() {
        const cleanups = [];

        // --- Mini button ---
        const mini = el('button', '', '📷');
        mini.id = 'ivr-mini';
        mini.type = 'button';
        mini.title = 'Open Image Resizer, or drop images / folders here';
        mini.setAttribute('aria-label', 'Open Image Resizer');

        // --- Main box ---
        const floater = el('div');
        floater.id = 'ivr-floater';
        floater.setAttribute('role', 'dialog');
        floater.setAttribute('aria-label', 'Image Resizer');

        const closeBtn = el('button', 'ivr-close', '×');
        closeBtn.type = 'button';
        closeBtn.title = 'Minimize';
        closeBtn.setAttribute('aria-label', 'Minimize');

        const title = el('div', 'ivr-title', 'Ivelt Image Resizer');

        const pickBtn = el('button', 'ivr-btn');
        pickBtn.type = 'button';

        const zipBtn = el('button', 'ivr-btn ivr-zip', '🗂️ Folder → ZIP');
        zipBtn.type = 'button';
        zipBtn.title = 'Pick a folder, zip it in the browser and attach the ZIP';

        const option = el('label', 'ivr-option');
        const shrinkChk = el('input');
        shrinkChk.type = 'checkbox';
        shrinkChk.checked = true;
        option.append(shrinkChk, el('span', '', 'Shrink big images inside ZIP'));

        const status = el('div', 'ivr-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        // Hidden pickers (the image picker allows several files at once)
        const imageInput = el('input');
        imageInput.type = 'file';
        imageInput.accept = 'image/*';
        imageInput.multiple = true;
        imageInput.hidden = true;

        const folderInput = el('input');
        folderInput.type = 'file';
        folderInput.multiple = true;
        folderInput.setAttribute('webkitdirectory', '');
        folderInput.hidden = true;

        floater.append(closeBtn, title, pickBtn, zipBtn, option, status, imageInput, folderInput);
        document.body.append(mini, floater);

        // --- State ---
        let busy = false;
        let statusTimer = null;
        let renderTimer = null;

        function findAttachmentInput() {
            for (const input of document.querySelectorAll('input[type="file"]')) {
                if (!floater.contains(input)) return input;
            }
            return null;
        }

        function slotsLeft() {
            return Math.max(0, MAX_ATTACHMENTS - getAttachedFilesCount());
        }

        function setOpen(open) {
            floater.classList.toggle('ivr-open', open);
            mini.style.display = open ? 'none' : '';
        }

        function showStatus(text, kind, holdMs) {
            clearTimeout(statusTimer);
            status.textContent = text || '';
            status.className = 'ivr-status' + (text ? ' ivr-show' : '') + (kind ? ' ivr-' + kind : '');
            if (text && holdMs) {
                statusTimer = setTimeout(() => showStatus(''), holdMs);
            }
        }

        function setBusy(on) {
            busy = on;
            floater.classList.toggle('ivr-busy', on);
            render();
        }

        // Single place that decides what every control looks like
        function render() {
            const hasInput = !!findAttachmentInput();
            const slots = slotsLeft();
            const full = slots === 0;

            mini.classList.toggle('ivr-full', full);

            if (busy) {
                pickBtn.disabled = true;
                zipBtn.disabled = true;
                return;
            }

            if (full) {
                pickBtn.textContent = `Max ${MAX_ATTACHMENTS} Attachments Reached`;
            } else if (!hasInput) {
                pickBtn.textContent = 'Open Attachments Tab';
            } else {
                pickBtn.textContent = slots === MAX_ATTACHMENTS
                    ? `📸 Select Images (Max ${MAX_ATTACHMENTS})`
                    : `📸 Select Images (${slots} of ${MAX_ATTACHMENTS} left)`;
            }

            const ready = hasInput && !full;
            pickBtn.disabled = !ready;
            zipBtn.disabled = !ready;
        }

        function scheduleRender() {
            clearTimeout(renderTimer);
            renderTimer = setTimeout(render, 150);
        }

        // The attachments tab and its rows are built by the page on demand, so watch
        // for changes instead of polling. Our own widget's changes are ignored.
        const observer = new MutationObserver((mutations) => {
            if (mutations.every(m => floater.contains(m.target) || m.target === mini)) return;
            scheduleRender();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'disabled']
        });

        // --- Open / close ---
        mini.addEventListener('click', () => {
            if (slotsLeft() === 0) return;
            setOpen(true);
            render();
        });
        closeBtn.addEventListener('click', () => setOpen(false));

        const onKeyDown = (e) => {
            if (e.key === 'Escape' && floater.classList.contains('ivr-open') && !busy) setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        cleanups.push(() => document.removeEventListener('keydown', onKeyDown));

        pickBtn.addEventListener('click', () => {
            if (pickBtn.disabled) return;
            imageInput.value = '';
            imageInput.click();
        });

        zipBtn.addEventListener('click', () => {
            if (zipBtn.disabled) return;
            folderInput.value = '';
            folderInput.click();
        });

        function minimizeSoon() {
            setTimeout(() => {
                if (!busy) setOpen(false);
            }, HOLD_STATUS_MS);
        }

        function attach(files) {
            const input = findAttachmentInput();
            if (!input) throw new Error('No attachment input found on the page.');
            const dt = new DataTransfer();
            files.forEach(f => dt.items.add(f));
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // --- Images ---
        async function handleFiles(fileList) {
            if (busy) return;
            if (!findAttachmentInput()) {
                showStatus('Open the Attachments tab first.', 'warn', 4000);
                return;
            }

            const slots = slotsLeft();
            if (slots === 0) {
                showStatus(`Maximum of ${MAX_ATTACHMENTS} attachments reached. Delete one before adding more.`, 'error', 5000);
                return;
            }

            const dropped = Array.from(fileList);
            let files = dropped.filter(isImageFile);
            if (files.length === 0) {
                if (dropped.length) showStatus('Only images are supported here. To attach other files, use Folder → ZIP.', 'warn', 5000);
                return;
            }

            let note = '';
            if (files.length > slots) {
                note = `Only ${slots} slot(s) left - the first ${slots} image(s) were used. `;
                files = files.slice(0, slots);
            }

            // An oversized animated image can only be shrunk by flattening it to a
            // still, so let the user decide before the animation is destroyed
            const animated = [];
            for (const file of files) {
                if (needsWork(file, MAX_BYTES) && await isAnimated(file)) animated.push(file);
            }
            if (animated.length) {
                const ok = confirm(
                    `${animated.length} animated image(s) are over ${formatSize(MAX_BYTES)} or in a format the forum doesn't accept.\n\n` +
                    `Shrinking turns them into a still image and the animation is lost.\n\n` +
                    `Shrink them anyway? (Cancel skips them.)`
                );
                if (!ok) {
                    files = files.filter(f => !animated.includes(f));
                    if (files.length === 0) return;
                }
            }

            setBusy(true);
            const ready = [];
            const failed = [];
            const stillTooBig = [];

            try {
                for (let i = 0; i < files.length; i++) {
                    showStatus(`⏳ Processing ${i + 1}/${files.length}...`);
                    try {
                        const prepared = await prepareForUpload(files[i]);
                        if (prepared.size > MAX_BYTES) stillTooBig.push(prepared.name);
                        ready.push(prepared);
                    } catch (err) {
                        console.warn('Image Resizer: could not process ' + files[i].name, err);
                        failed.push(files[i].name);
                    }
                }

                if (ready.length) attach(ready);
            } catch (err) {
                console.error(err);
                setBusy(false);
                showStatus('❌ ' + err.message, 'error', 6000);
                return;
            }

            setBusy(false);

            if (!ready.length) {
                showStatus('❌ Could not read: ' + failed.join(', '), 'error', 6000);
                return;
            }

            const problems = [];
            if (failed.length) problems.push('skipped (unreadable): ' + failed.join(', '));
            if (stillTooBig.length) problems.push('still over ' + formatSize(MAX_BYTES) + ': ' + stillTooBig.join(', '));

            if (problems.length) {
                showStatus(`${note}Attached ${ready.length}, but ${problems.join('; ')}`, 'warn', 8000);
            } else {
                showStatus(`✅ ${note}${ready.length} image(s) ready (${ready.map(f => formatSize(f.size)).join(', ')})`, 'ok', HOLD_STATUS_MS);
                minimizeSoon();
            }
        }

        imageInput.addEventListener('change', () => handleFiles(imageInput.files));

        // --- Folder -> ZIP ---
        function isSkipped(path) {
            const parts = path.toLowerCase().split('/');
            return SKIP_NAMES.includes(parts[parts.length - 1]) || parts.some(p => SKIP_FOLDERS.includes(p));
        }

        // Files picked through the folder input already carry webkitRelativePath
        folderInput.addEventListener('change', () => {
            const picked = Array.from(folderInput.files || []);
            if (!picked.length) return;

            const entries = picked
                .map(f => ({ path: f.webkitRelativePath || f.name, file: f }))
                .filter(e => !isSkipped(e.path));

            const first = entries[0];
            const root = first && first.path.includes('/') ? first.path.split('/')[0] : 'files';
            zipAndAttach(stripCommonRoot(entries), root);
        });

        // Dropping a real folder gives us filesystem entries instead of files
        async function handleDroppedEntries(fsEntries) {
            if (busy) return;
            const collected = [];

            setBusy(true);
            showStatus('⏳ Reading folder...');
            try {
                for (const entry of fsEntries) {
                    await readEntryRecursive(entry, '', collected);
                }
            } catch (err) {
                console.error(err);
                setBusy(false);
                showStatus('❌ Could not read the folder: ' + err.message, 'error', 6000);
                return;
            }
            setBusy(false);
            showStatus('');

            const usable = collected.filter(e => !isSkipped(e.path));
            const dir = fsEntries.find(e => e.isDirectory);
            zipAndAttach(stripCommonRoot(usable), dir ? dir.name : 'files');
        }

        async function zipAndAttach(entries, zipBaseName) {
            if (busy) return;

            if (!findAttachmentInput()) {
                showStatus('Open the Attachments tab first.', 'warn', 4000);
                return;
            }
            if (slotsLeft() === 0) {
                showStatus(`Maximum of ${MAX_ATTACHMENTS} attachments reached. Delete one before adding more.`, 'error', 5000);
                return;
            }
            if (!entries.length) {
                showStatus('That folder is empty - nothing to zip.', 'warn', 4000);
                return;
            }

            const sourceBytes = entries.reduce((sum, e) => sum + e.file.size, 0);
            if (sourceBytes > ZIP_SOURCE_LIMIT) {
                showStatus(`That folder is ${formatSize(sourceBytes)} - far too big to fit in one attachment.`, 'error', 6000);
                return;
            }

            setBusy(true);

            try {
                let list = entries;

                // Only touch the images when the archive would not fit as it is
                if (shrinkChk.checked && sourceBytes > MAX_BYTES) {
                    list = await shrinkEntriesForZip(list, (n, total) => showStatus(`⏳ Shrinking ${n}/${total}...`));
                }

                const blob = await buildZip(list, (done, total) => showStatus(`🗂️ Zipping ${done}/${total}...`));

                const zipFile = new File([blob], sanitizeName(zipBaseName) + '.zip', {
                    type: 'application/zip',
                    lastModified: Date.now()
                });

                if (zipFile.size > MAX_BYTES) {
                    setBusy(false);
                    showStatus('');
                    const ok = confirm(
                        `The ZIP is ${formatSize(zipFile.size)} (${list.length} files).\n\n` +
                        `Ivelt usually rejects attachments over ${formatSize(MAX_BYTES)}, so the upload may fail.\n\n` +
                        `Attach it anyway?`
                    );
                    if (!ok) return;
                    setBusy(true);
                }

                attach([zipFile]);
                setBusy(false);
                showStatus(`✅ ${formatSize(zipFile.size)} ZIP attached`, 'ok', HOLD_STATUS_MS);
                minimizeSoon();
            } catch (err) {
                console.error(err);
                setBusy(false);
                showStatus('❌ Could not build the ZIP: ' + err.message, 'error', 6000);
            }
        }

        // --- Drag and drop ---
        function bindDropZone(zone) {
            let depth = 0;

            const onOver = (e) => {
                if (!hasFiles(e)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = (slotsLeft() === 0 || busy) ? 'none' : 'copy';
                if (slotsLeft() > 0 && !busy) zone.classList.add('ivr-dragover');
            };
            const onEnter = (e) => { if (hasFiles(e)) depth++; };
            const onLeave = (e) => {
                if (!hasFiles(e)) return;
                depth = Math.max(0, depth - 1);
                if (depth === 0) zone.classList.remove('ivr-dragover');
            };
            const onDrop = (e) => {
                if (!hasFiles(e)) return;
                e.preventDefault();
                e.stopPropagation();
                depth = 0;
                mini.classList.remove('ivr-dragover');
                floater.classList.remove('ivr-dragover');

                if (busy) return;
                if (slotsLeft() === 0) {
                    showStatus(`Maximum of ${MAX_ATTACHMENTS} attachments reached. Delete one before adding more.`, 'error', 5000);
                    setOpen(true);
                    return;
                }

                // The item list is only readable inside this handler, so grab the entries now
                const fsEntries = [];
                for (const item of e.dataTransfer.items || []) {
                    if (item.kind !== 'file' || !item.webkitGetAsEntry) continue;
                    const entry = item.webkitGetAsEntry();
                    if (entry) fsEntries.push(entry);
                }

                if (fsEntries.some(en => en.isDirectory)) {
                    setOpen(true);
                    handleDroppedEntries(fsEntries);
                } else {
                    handleFiles(e.dataTransfer.files);
                }
            };

            zone.addEventListener('dragenter', onEnter);
            zone.addEventListener('dragover', onOver);
            zone.addEventListener('dragleave', onLeave);
            zone.addEventListener('drop', onDrop);
        }

        bindDropZone(mini);
        bindDropZone(floater);

        // A file dropped anywhere else would make the browser navigate away from the
        // post being written, so swallow stray file drops while the widget is active
        const stopStrayDrop = (e) => { if (hasFiles(e)) e.preventDefault(); };
        document.addEventListener('dragover', stopStrayDrop);
        document.addEventListener('drop', stopStrayDrop);
        cleanups.push(() => {
            document.removeEventListener('dragover', stopStrayDrop);
            document.removeEventListener('drop', stopStrayDrop);
        });

        setOpen(false);
        render();

        return {
            destroy() {
                observer.disconnect();
                clearTimeout(statusTimer);
                clearTimeout(renderTimer);
                cleanups.forEach(fn => fn());
                mini.remove();
                floater.remove();
            }
        };
    }

    // ---------------------------------------------------------------------
    // Image handling
    //
    // A file is only touched when the forum would actually refuse it: an unknown
    // format, or a file over the size limit. A small PNG or GIF is attached exactly
    // as it is - no needless re-encoding, no lost transparency, no lost animation.
    // ---------------------------------------------------------------------

    function isForumSafe(file) {
        return FORUM_SAFE_TYPES.includes((file.type || '').toLowerCase());
    }

    function needsWork(file, maxBytes) {
        return !isForumSafe(file) || file.size > maxBytes;
    }

    // A GIF holds one graphic control block per frame - two of them means animation;
    // an animated WebP carries an ANIM chunk in its header
    async function isAnimated(file) {
        const type = (file.type || '').toLowerCase();
        try {
            if (type === 'image/gif') {
                const bytes = new Uint8Array(await file.arrayBuffer());
                let frames = 0;
                for (let i = 0; i < bytes.length - 3; i++) {
                    if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9 && bytes[i + 2] === 0x04 && ++frames > 1) return true;
                }
            } else if (type === 'image/webp') {
                const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
                const text = String.fromCharCode(...head);
                return text.includes('ANIM');
            }
        } catch (e) {
            console.warn('Image Resizer: could not inspect ' + file.name, e);
        }
        return false;
    }

    // Decode without a detour through a base64 data URL
    async function decodeImage(file) {
        if (typeof createImageBitmap === 'function') {
            try {
                return { source: await createImageBitmap(file), release() { this.source.close(); } };
            } catch (e) {
                // fall through to the <img> route
            }
        }

        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('Could not open ' + file.name + ' as an image'));
                image.src = url;
            });
            return { source: img, release() {} };
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    // Draw onto a canvas whose longest side is at most `max` (never enlarges)
    function drawScaled(source, max, opaque) {
        let w = source.width, h = source.height;
        const longest = Math.max(w, h);
        if (longest > max) {
            const ratio = max / longest;
            w = Math.max(1, Math.round(w * ratio));
            h = Math.max(1, Math.round(h * ratio));
        }

        const cvs = document.createElement('canvas');
        cvs.width = w;
        cvs.height = h;
        const ctx = cvs.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // JPG has no alpha channel, so transparent areas need a white backdrop
        if (opaque) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(source, 0, 0, w, h);
        return cvs;
    }

    function canvasToBlob(cvs, type, quality) {
        return new Promise(resolve => cvs.toBlob(resolve, type, quality));
    }

    function freeCanvas(cvs) {
        cvs.width = 0;
        cvs.height = 0;
    }

    function withExtension(blob, originalName, ext, type) {
        const dot = originalName.lastIndexOf('.');
        const stem = dot > 0 ? originalName.substring(0, dot) : originalName;
        return new File([blob], stem + ext, { type, lastModified: Date.now() });
    }

    // Candidate sizes from `top` downwards, skipping ones that would not change anything
    function sizeLadder(longest, top, steps) {
        const first = Math.min(longest, top);
        return [first, ...steps.filter(s => s < first)];
    }

    // Best JPEG for one canvas size: highest quality that still fits, or null if even
    // the lowest quality is too big at this size
    async function jpegAtSize(source, size, maxBytes) {
        const cvs = drawScaled(source, size, true);
        try {
            let blob = await canvasToBlob(cvs, 'image/jpeg', 0.85);
            if (!blob) return { blob: null, fits: false };
            if (blob.size <= maxBytes) return { blob, fits: true };

            const floor = await canvasToBlob(cvs, 'image/jpeg', 0.5);
            if (!floor) return { blob, fits: false };
            if (floor.size > maxBytes) return { blob: floor, fits: false };

            // somewhere between 0.5 and 0.85 - home in on the best quality that fits
            let best = floor, lo = 0.5, hi = 0.85;
            for (let i = 0; i < 4; i++) {
                const mid = (lo + hi) / 2;
                const candidate = await canvasToBlob(cvs, 'image/jpeg', mid);
                if (candidate && candidate.size <= maxBytes) { best = candidate; lo = mid; }
                else hi = mid;
            }
            return { blob: best, fits: true };
        } finally {
            freeCanvas(cvs);
        }
    }

    // Bring a file under maxBytes, keeping its own format when that is enough.
    // PNG first stays PNG (transparency survives); otherwise we land on JPG.
    // If nothing fits, the smallest attempt is returned and the caller can tell by its size.
    async function shrinkImage(file, maxBytes) {
        const decoded = await decodeImage(file);
        try {
            const source = decoded.source;
            const longest = Math.max(source.width, source.height);

            if ((file.type || '').toLowerCase() === 'image/png') {
                for (const size of sizeLadder(longest, 1600, [1280, 1024, 800])) {
                    const cvs = drawScaled(source, size, false);
                    const blob = await canvasToBlob(cvs, 'image/png');
                    freeCanvas(cvs);
                    if (!blob) break;
                    if (blob.size <= maxBytes) return withExtension(blob, file.name, '.png', 'image/png');
                    // a photo saved as PNG will never get close - stop wasting time on it
                    if (size === Math.min(longest, 1600) && blob.size > maxBytes * 3) break;
                }
            }

            let smallest = null;
            for (const size of sizeLadder(longest, 2000, [1600, 1280, 1024, 800, 640, 480])) {
                const result = await jpegAtSize(source, size, maxBytes);
                if (result.blob && (!smallest || result.blob.size < smallest.size)) smallest = result.blob;
                if (result.fits) return withExtension(result.blob, file.name, '.jpg', 'image/jpeg');
            }

            if (!smallest) throw new Error('Could not re-encode ' + file.name);
            return withExtension(smallest, file.name, '.jpg', 'image/jpeg');
        } finally {
            decoded.release();
        }
    }

    // Convert only what the forum would not take, otherwise hand the file back untouched
    async function prepareForUpload(file) {
        if (!needsWork(file, MAX_BYTES)) return file;
        const smaller = await shrinkImage(file, MAX_BYTES);
        // never hand back something bigger than what we started with
        return (isForumSafe(file) && smaller.size >= file.size) ? file : smaller;
    }

    // Inside a ZIP the image format doesn't matter to the forum. The images share
    // whatever room the rest of the archive leaves, so a folder with two photos gets
    // more per photo than a folder with twenty.
    async function shrinkEntriesForZip(entries, onProgress) {
        const images = [];
        let otherBytes = 0;

        for (const item of entries) {
            if (isImageFile(item.file) && !(await isAnimated(item.file))) images.push(item);
            else otherBytes += item.file.size;
        }
        if (!images.length) return entries;

        const share = (MAX_BYTES * 0.92 - otherBytes) / images.length;
        const budget = Math.min(ZIP_MAX_IMAGE_BYTES, Math.max(ZIP_MIN_IMAGE_BYTES, share));

        const replaced = new Map();
        let n = 0;
        for (const item of images) {
            n++;
            onProgress(n, images.length);
            if (item.file.size <= budget) continue;
            try {
                const smaller = await shrinkImage(item.file, budget);
                if (smaller.size < item.file.size) {
                    const dir = item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/') + 1) : '';
                    replaced.set(item, { path: dir + smaller.name, file: smaller });
                }
            } catch (e) {
                console.warn('Image Resizer: could not shrink ' + item.path + ', keeping original', e);
            }
        }

        return entries.map(item => replaced.get(item) || item);
    }

    // ---------------------------------------------------------------------
    // Folder reading + ZIP writer (no external library - everything runs locally)
    // ---------------------------------------------------------------------

    function sanitizeName(name) {
        const clean = String(name || 'files').replace(/[\\/:*?"<>|]+/g, '_').trim();
        return clean.length ? clean : 'files';
    }

    // Everything picked sits under the folder that was picked, and the ZIP already
    // carries that name - so drop the wrapper and let the archive open straight
    // onto its files. A ZIP of an extension folder is only installable that way.
    // If several items were dropped at once the roots differ and we leave them be.
    function stripCommonRoot(entries) {
        if (!entries.length) return entries;

        const slash = entries[0].path.indexOf('/');
        if (slash === -1) return entries;

        const root = entries[0].path.substring(0, slash + 1);
        if (!entries.every(e => e.path.startsWith(root))) return entries;

        return entries.map(e => ({ path: e.path.substring(root.length), file: e.file }));
    }

    // Walk a dropped FileSystemEntry tree into a flat [{ path, file }] list
    async function readEntryRecursive(entry, basePath, out) {
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            out.push({ path: basePath + entry.name, file });
            return;
        }

        if (!entry.isDirectory) return;

        const reader = entry.createReader();
        const children = [];
        // readEntries hands back at most ~100 entries per call, so keep asking until it's empty
        while (true) {
            const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            if (!batch.length) break;
            children.push(...batch);
        }

        for (const child of children) {
            await readEntryRecursive(child, basePath + entry.name + '/', out);
        }
    }

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    async function deflateRaw(bytes) {
        if (typeof CompressionStream === 'undefined') return null;
        try {
            const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            return new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (e) {
            return null; // fall back to storing the file uncompressed
        }
    }

    function dosDateTime(ms) {
        const d = new Date(ms || Date.now());
        if (d.getFullYear() < 1980) return { time: 0, date: 33 }; // 1980-01-01
        return {
            time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
            date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
        };
    }

    // Minimal ZIP writer: deflate when it helps, store otherwise, UTF-8 file names
    async function buildZip(entries, onProgress) {
        if (entries.length > 0xFFFF) {
            throw new Error('Too many files in that folder (max 65535).');
        }

        const encoder = new TextEncoder();
        const parts = [];
        const central = [];
        const seen = new Set();
        let offset = 0;
        let done = 0;

        for (const entry of entries) {
            // Shrinking can turn a.png and a.jpg into the same a.jpg - keep names unique
            let path = entry.path;
            if (seen.has(path)) {
                const dot = path.lastIndexOf('.');
                const hasExt = dot > path.lastIndexOf('/');
                const stem = hasExt ? path.substring(0, dot) : path;
                const ext = hasExt ? path.substring(dot) : '';
                let n = 2;
                while (seen.has(stem + ' (' + n + ')' + ext)) n++;
                path = stem + ' (' + n + ')' + ext;
            }
            seen.add(path);

            const nameBytes = encoder.encode(path);
            const raw = new Uint8Array(await entry.file.arrayBuffer());
            const crc = crc32(raw);

            let method = 0;
            let data = raw;
            const deflated = await deflateRaw(raw);
            if (deflated && deflated.length < raw.length) {
                method = 8;
                data = deflated;
            }

            const { time, date } = dosDateTime(entry.file.lastModified);

            const local = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true);  // local file header signature
            lv.setUint16(4, 20, true);          // version needed
            lv.setUint16(6, 0x0800, true);      // flags: UTF-8 file name
            lv.setUint16(8, method, true);
            lv.setUint16(10, time, true);
            lv.setUint16(12, date, true);
            lv.setUint32(14, crc, true);
            lv.setUint32(18, data.length, true);
            lv.setUint32(22, raw.length, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);          // extra field length
            local.set(nameBytes, 30);

            parts.push(local, data);

            const cd = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(cd.buffer);
            cv.setUint32(0, 0x02014b50, true);  // central directory signature
            cv.setUint16(4, 20, true);          // version made by
            cv.setUint16(6, 20, true);          // version needed
            cv.setUint16(8, 0x0800, true);
            cv.setUint16(10, method, true);
            cv.setUint16(12, time, true);
            cv.setUint16(14, date, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, data.length, true);
            cv.setUint32(24, raw.length, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint32(42, offset, true);     // relative offset of local header
            cd.set(nameBytes, 46);
            central.push(cd);

            offset += local.length + data.length;
            if (offset > 0xFFFFFFFF) {
                throw new Error('That folder is too big to zip (over 4 GB).');
            }

            done++;
            if (onProgress) onProgress(done, entries.length);
        }

        const centralSize = central.reduce((sum, c) => sum + c.length, 0);
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);      // end of central directory
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, offset, true);

        return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
    }

    init();
})();
