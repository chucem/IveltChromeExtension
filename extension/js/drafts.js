(function () {
    'use strict';

    const SETTING_KEY = 'keepDrafts';
    const PREFIX = 'draft:';
    const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
    const SAVE_DELAY_MS = 800;
    const KEY_PARAMS = ['i', 'mode', 'action', 'f', 't', 'p', 'u'];

    function init() {
        const textarea = document.querySelector('#message-box textarea');
        const form = textarea && textarea.closest('form');
        if (!form || !chrome.storage || !chrome.storage.local) return;

        const key = draftKey(form);
        chrome.storage.local.get([SETTING_KEY, key], (items) => {
            if (items[SETTING_KEY] === false) return;

            dropOldDrafts();
            keepDraft(textarea, form, key, items[key]);
        });
    }

    function keepDraft(textarea, form, key, draft) {
        let offered = !!draft && draft.text.trim() !== textarea.value.trim();
        if (offered) offerDraft(textarea, key, draft, () => { offered = false; });

        let saveTimeout;
        let typed = false;
        const save = () => {
            clearTimeout(saveTimeout);
            if (offered && !typed) return;
            const text = textarea.value;
            store(key, text.trim() ? { text, savedAt: Date.now() } : null);
        };

        textarea.addEventListener('input', () => {
            typed = true;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(save, SAVE_DELAY_MS);
        });
        window.addEventListener('pagehide', save);
        form.addEventListener('submit', (event) => {
            if (event.submitter && event.submitter.name !== 'post') {
                save();
                return;
            }
            clearTimeout(saveTimeout);
            window.removeEventListener('pagehide', save);
            store(key, null);
        });
    }

    function draftKey(form) {
        const address = new URL(form.getAttribute('action') || '', location.href);
        if (address.searchParams.has('t') || address.searchParams.has('p')) address.searchParams.delete('f');
        const parts = KEY_PARAMS
            .filter((name) => address.searchParams.has(name))
            .map((name) => name + '=' + address.searchParams.get(name));
        return PREFIX + address.pathname.split('/').pop() + '?' + parts.join('&');
    }

    function offerDraft(textarea, key, draft, answered) {
        const bar = document.createElement('div');
        bar.className = 'ih-draft-bar';
        bar.innerHTML = `
            <i class="icon fa-history fa-fw ih-draft-icon" aria-hidden="true"></i>
            <span class="ih-draft-text"><span class="ih-draft-when"></span><span class="ih-draft-words"></span></span>
            <button type="button" class="button ih-draft-restore">צוריקשטעלן</button>
            <button type="button" class="button button-secondary ih-draft-drop">אויסמעקן</button>`;
        bar.querySelector('.ih-draft-when').textContent = 'א נישט-געשיקטע תגובה פון ' + timeAgo(draft.savedAt);
        bar.querySelector('.ih-draft-words').textContent = firstWords(draft.text);

        bar.querySelector('.ih-draft-restore').addEventListener('click', () => {
            answered();
            textarea.value = draft.text;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            bar.remove();
        });
        bar.querySelector('.ih-draft-drop').addEventListener('click', () => {
            answered();
            store(key, null);
            bar.remove();
        });

        textarea.before(bar);
    }

    function timeAgo(savedAt) {
        const minutes = Math.round((Date.now() - savedAt) / 60000);
        if (minutes < 1) return 'פאר א רגע';
        if (minutes < 60) return `פאר ${minutes} מינוט`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `פאר ${hours} שעה`;
        const days = Math.round(hours / 24);
        return days === 1 ? 'פאר א טאג' : `פאר ${days} טעג`;
    }

    function firstWords(text) {
        return text.replace(/\[[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 300);
    }

    function dropOldDrafts() {
        const oldest = Date.now() - KEEP_MS;
        chrome.storage.local.get(null, (items) => {
            const old = Object.keys(items).filter((key) => key.startsWith(PREFIX) && !(items[key].savedAt >= oldest));
            if (old.length) chrome.storage.local.remove(old);
        });
    }

    function store(key, draft) {
        try {
            if (draft) chrome.storage.local.set({ [key]: draft });
            else chrome.storage.local.remove(key);
        } catch (e) {}
    }

    init();
})();
