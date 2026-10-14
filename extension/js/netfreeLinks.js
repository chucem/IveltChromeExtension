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
// Runs as a content script on every forum page.

(function () {
    'use strict';

    const MASKED = /^(https?:\/\/)dr123ive\.google\.com\//i;

    function fixLink(link) {
        if (!link || !link.href || !MASKED.test(link.href)) return;
        link.href = link.href.replace(MASKED, '$1drive.google.com/');
        link.title = link.title || 'נעטפרי לינק (dr123ive): עפנט זיך אן די 123';
    }

    function fixAll(root) {
        root.querySelectorAll('a[href*="dr123ive.google.com"]').forEach(fixLink);
    }

    fixAll(document);

    // Posts that show up later (quick reply preview, new replies) - and, just in case,
    // anything that is about to be clicked, opened in a new tab or copied
    const fixTarget = (e) => fixLink(e.target.closest && e.target.closest('a'));
    ['mousedown', 'focusin', 'contextmenu'].forEach(type => document.addEventListener(type, fixTarget, true));

    new MutationObserver((mutations) => {
        for (const m of mutations) {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.matches('a')) fixLink(node);
                    else fixAll(node);
                }
            });
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
})();
