// Quote a selection, with the post's own ציטיר button
//
// While words in a post are selected, that post's ציטיר button changes (its icon, its text and
// its color) to "ציטיר אנגעצייכנט", and a click on it quotes just those words where the cursor
// is in the reply box, instead of the whole post. With nothing selected it's the forum's own
// button again. Nothing pops up over the text, so it doesn't get in the way of double-clicking
// or copying. Only where there's a reply box on the page, and not for words inside a quote.
//
// Runs as a content script (isolated world), controlled by the "quoteSelection" setting.

(function () {
    'use strict';

    const SETTING_KEY = 'quoteSelection';
    const JUMP_KEY = 'quoteJumpToReply'; // after quoting, go down to the reply box (on by default)
    const DONE_MS = 1200;
    const MARKED_ICON = 'fa-i-cursor';
    const MARKED_TEXT = 'ציטיר אנגעצייכנט';

    // The post's quote button while it's marked: { link, icon, label, iconClass, labelText, title }
    let marked = null;
    // What the marked button would quote: { content, text }
    let pending = null;
    let doneUntil = 0;
    // Where the user left the cursor in the reply box, once they clicked or typed in it: a quote goes
    // there. Kept as they go, since selecting text in the page can reset the box's own cursor
    let caret = null;
    let jumpToReply = false;

    function init() {
        if (!getTextarea() || !chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY, JUMP_KEY], (items) => {
            jumpToReply = items[JUMP_KEY] !== false;
            if (items[SETTING_KEY] !== false) start();
        });
    }

    function start() {
        const textarea = getTextarea();

        ['mouseup', 'keyup', 'input'].forEach((type) => {
            textarea.addEventListener(type, (event) => {
                if (event.isTrusted) caret = textarea.selectionEnd;
            });
        });

        let updateTimeout;
        document.addEventListener('selectionchange', () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(update, 60);
        });

        // in the capture phase, before the forum's own handlers on the button
        document.addEventListener('mousedown', (event) => {
            // pressing the marked button mustn't clear the selection it's about to quote
            if (marked && marked.link.contains(event.target)) event.preventDefault();
        }, true);
        document.addEventListener('click', (event) => {
            if (!marked || !pending || !marked.link.contains(event.target)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const end = addQuote(pending.content, pending.text);
            showDone();
            window.getSelection().removeAllRanges();
            if (jumpToReply) goToReply(end);
        }, true);
    }

    function getTextarea() {
        return document.querySelector('#message-box textarea');
    }

    // Marks the quote button of the post the selection is in, or puts it back when there's none
    function update() {
        if (Date.now() < doneUntil) return;

        const selection = window.getSelection();
        const text = selection.toString().trim();
        const content = text && selection.rangeCount && getQuotableContent(selection);
        const link = content && findQuoteLink(content);
        if (!link) {
            unmark();
            return;
        }

        if (marked && marked.link !== link) unmark();
        if (!marked) mark(link);
        pending = { content, text };
    }

    // The forum's own ציטיר button of the post (not the extension's "ציטיר לעצטע", which has "last")
    function findQuoteLink(content) {
        const post = content.closest('.post');
        if (!post) return null;
        return [...post.querySelectorAll('.post-buttons a[href*="mode=quote"]')]
            .find((link) => !link.querySelector('.last')) || null;
    }

    function mark(link) {
        const icon = link.querySelector('i.icon');
        const label = link.querySelector('span');
        marked = {
            link, icon, label,
            iconClass: icon ? icon.className : '',
            labelText: label ? label.textContent : '',
            title: link.getAttribute('title')
        };
        if (icon) icon.className = `icon ${MARKED_ICON} fa-fw`;
        if (label) label.textContent = MARKED_TEXT;
        link.setAttribute('title', MARKED_TEXT);
        link.classList.add('ih-quote-marked');
    }

    function unmark() {
        pending = null;
        if (!marked) return;
        const { link, icon, label, iconClass, labelText, title } = marked;
        if (icon) icon.className = iconClass;
        if (label) label.textContent = labelText;
        if (title === null) link.removeAttribute('title');
        else link.setAttribute('title', title);
        link.classList.remove('ih-quote-marked');
        marked = null;
    }

    // "צוגעלייגט ✓" on the button for a moment, then it's the forum's own button again
    function showDone() {
        if (!marked) return;
        doneUntil = Date.now() + DONE_MS;
        if (marked.icon) marked.icon.className = 'icon fa-check fa-fw';
        if (marked.label) marked.label.textContent = 'צוגעלייגט';
        marked.link.setAttribute('title', 'צוגעלייגט');
        setTimeout(() => {
            doneUntil = 0;
            unmark();
            update();
        }, DONE_MS);
    }

    function getQuotableContent(selection) {
        const start = selection.getRangeAt(0).startContainer;
        const element = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
        if (element.closest('blockquote') || element.closest('#preview')) return null;
        return element.closest('.postbody .content');
    }

    function getPostId(content) {
        for (let node = content; node; node = node.parentElement) {
            const match = node.id.match(/\d+$/);
            if (match) return match[0];
        }
        return '';
    }

    function addQuote(content, text) {
        const post = content.closest('.post') || content;
        const postId = getPostId(content);
        const usernameElm = post.querySelector('.username, .username-coloured');
        const username = usernameElm ? usernameElm.textContent.trim() : '';
        const userId = usernameElm && usernameElm.href ? new URL(usernameElm.href).searchParams.get('u') || '' : '';
        const timeElm = post.querySelector('time');
        const time = timeElm ? Date.parse(timeElm.dateTime) / 1000 : '';

        // The topic review under the reply box shows the date as plain text, without a <time>:
        // what isn't known is left out rather than written empty
        const attributes = [`user_id=${userId}`, `time=${time}`, `post_id=${postId}`].filter((a) => !a.endsWith('='));
        const quote = `[quote="${username}" ${attributes.join(' ')}]\n${text}\n[/quote]`;

        const textarea = getTextarea();
        let at, insert;
        if (caret !== null) {
            // On a line of its own, where the cursor was in the text
            at = Math.min(caret, textarea.value.length);
            const before = textarea.value.slice(0, at);
            const after = textarea.value.slice(at);
            insert = (before && !before.endsWith('\n') ? '\n' : '') + quote + (after && !after.startsWith('\n') ? '\n' : '');
        } else {
            at = endOfQuotesOnTop(textarea.value);
            insert = at > 0 ? '\n' + quote : quote + '\n';
        }
        textarea.setRangeText(insert, at, at, 'end');
        if (caret !== null) caret = at + insert.length;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return at + insert.length;
    }

    // Down to the reply box, ready to type right after the quote that was just added
    // (the "quoteJumpToReply" setting)
    function goToReply(end) {
        const textarea = getTextarea();
        const at = textarea.value[end] === '\n' ? end + 1 : end;
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(at, at);
        caret = at;
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function endOfQuotesOnTop(text) {
        const tag = /\[(\/?)quote\b[^\]]*\]/gi;
        let end = 0;
        let depth = 0;
        let match;

        while ((match = tag.exec(text))) {
            const closing = match[1] === '/';
            if (depth === 0 && (closing || text.slice(end, match.index).trim()))
                break;

            depth += closing ? -1 : 1;
            if (depth === 0)
                end = tag.lastIndex;
        }

        return end;
    }

    init();
})();
