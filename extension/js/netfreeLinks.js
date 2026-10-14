// NetFree links
//
// NetFree's robot blocks every Google Drive link it finds on a public site, so on
// ivelt Drive links are posted with "123" inside "drive":
//     https://dr123ive.google.com/file/d/...
// This makes such links work with a normal click by taking the 123 out - only in
// this browser, on the fly. The page itself keeps the 123, so the robot never sees
// a real Drive link. Works for links in any post, not just ones made by this
// extension.
//
// The opened-up links also send no Referer: otherwise a click would tell NetFree
// (which sees all traffic) that the Drive file was linked from a public site -
// exactly what its robot looks for. This way a click looks the same as pasting the
// link by hand, which is what people already do.
//
// Runs as a content script on every forum page and is controlled by the
// "netfreeLinks" setting, which can be switched on and off without a reload
// (switching it off puts the links back as they were).

(function () {
    'use strict';

    const SETTING_KEY = 'netfreeLinks';
    const MASKED = /^(https?:\/\/)dr123ive\.google\.com\//i;
    const ORIGINAL = 'ivhNetfreeHref'; // data-ivh-netfree-href keeps the posted address
    const ORIGINAL_REL = 'ivhNetfreeRel';

    let enabled = false;
    let observer = null;

    function fixLink(link) {
        if (!enabled || !link || !link.href || !MASKED.test(link.href)) return;
        link.dataset[ORIGINAL] = link.getAttribute('href');
        link.dataset[ORIGINAL_REL] = link.getAttribute('rel') || '';
        link.rel = (link.dataset[ORIGINAL_REL] + ' noreferrer noopener').trim();
        link.referrerPolicy = 'no-referrer';
        link.href = link.href.replace(MASKED, '$1drive.google.com/');
    }

    function fixAll(root) {
        root.querySelectorAll('a[href*="dr123ive.google.com"]').forEach(fixLink);
    }

    function restoreAll() {
        document.querySelectorAll('a[data-ivh-netfree-href]').forEach(link => {
            link.setAttribute('href', link.dataset[ORIGINAL]);
            if (link.dataset[ORIGINAL_REL]) link.setAttribute('rel', link.dataset[ORIGINAL_REL]);
            else link.removeAttribute('rel');
            link.removeAttribute('referrerpolicy');
            delete link.dataset[ORIGINAL];
            delete link.dataset[ORIGINAL_REL];
        });
    }

    // Posts that show up later (quick reply preview, new replies) - and, just in case,
    // anything that is about to be clicked, opened in a new tab or copied
    const fixTarget = (e) => fixLink(e.target.closest && e.target.closest('a'));
    const EVENTS = ['mousedown', 'focusin', 'contextmenu'];

    function start() {
        if (enabled) return;
        enabled = true;
        fixAll(document);
        EVENTS.forEach(type => document.addEventListener(type, fixTarget, true));
        observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches('a')) fixLink(node);
                    else fixAll(node);
                });
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function stop() {
        if (!enabled) return;
        enabled = false;
        EVENTS.forEach(type => document.removeEventListener(type, fixTarget, true));
        if (observer) observer.disconnect();
        observer = null;
        restoreAll();
    }

    // On unless the user explicitly turned it off
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get([SETTING_KEY], (items) => {
        if (items[SETTING_KEY] !== false) start();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[SETTING_KEY]) return;
        if (changes[SETTING_KEY].newValue === false) stop();
        else start();
    });
})();
