// Quote a selection
//
// Select some words in a post and a small "ציטיר" button shows up above them.
// Clicking it adds just those words, as a quote of that post, at the top of the
// reply box, after the quotes that are already there - so a few parts can be quoted
// one after the other, in order, above what the user writes. It only shows where
// there is a reply box (the quick reply under a topic, or the full editor), and not
// for words inside a quote, since someone else wrote those.
//
// Runs as a content script (isolated world).

(function () {
    'use strict';

    const DONE_MS = 1200;

    let button = null;
    let doneTimeout;

    function init() {
        if (!getTextarea()) return;

        // after the mouse is let go, so a double or triple click has finished selecting
        document.addEventListener('mouseup', (event) => {
            if (!button || !button.contains(event.target)) setTimeout(showButton);
        });
        document.addEventListener('mousedown', (event) => {
            if (button && !button.contains(event.target)) button.remove();
        });
    }

    function getTextarea() {
        return document.querySelector('#message-box textarea');
    }

    function showButton() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        const content = text && getQuotableContent(selection);
        if (!content) return;

        if (!button) button = createButton();
        clearTimeout(doneTimeout);
        button.querySelector('span').textContent = 'ציטיר';
        button.onclick = () => {
            addQuote(content, text);
            selection.removeAllRanges();
            button.querySelector('span').textContent = 'צוגעלייגט ✓';
            doneTimeout = setTimeout(() => button.remove(), DONE_MS);
        };

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        button.style.top = `${window.scrollY + rect.top}px`;
        button.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
        document.body.appendChild(button);
    }

    function createButton() {
        const newButton = document.createElement('button');
        newButton.type = 'button';
        newButton.className = 'button ih-quote-selection';
        newButton.innerHTML = '<i class="icon fa-quote-left fa-fw" aria-hidden="true"></i><span></span>';
        // keep the words selected while the button is pressed
        newButton.addEventListener('mousedown', (event) => event.preventDefault());
        return newButton;
    }

    // The text of the post the selection starts in, when it starts in the post's own words
    // (not in a quote, and not in the preview of the user's own reply)
    function getQuotableContent(selection) {
        const start = selection.getRangeAt(0).startContainer;
        const element = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
        if (element.closest('blockquote') || element.closest('#preview')) return null;
        return element.closest('.postbody .content');
    }

    // The post's number ends the id of the text or of one of the boxes around it:
    // post_content123 in a topic, message_123 in the topic review under the full editor
    function getPostId(content) {
        for (let node = content; node; node = node.parentElement) {
            const match = node.id.match(/\d+$/);
            if (match) return match[0];
        }
        return '';
    }

    // The same quote the forum makes, so the poster gets a notification and it links to the post
    function addQuote(content, text) {
        const post = content.closest('.post') || content;
        const postId = getPostId(content);
        const usernameElm = post.querySelector('.username, .username-coloured');
        const username = usernameElm ? usernameElm.textContent.trim() : '';
        const userId = usernameElm && usernameElm.href ? new URL(usernameElm.href).searchParams.get('u') || '' : '';
        const timeElm = post.querySelector('time');
        const time = timeElm ? Date.parse(timeElm.dateTime) / 1000 : '';

        const quote = `[quote="${username}" user_id=${userId} time=${time} post_id=${postId}]\n${text}\n[/quote]`;

        const textarea = getTextarea();
        const at = endOfQuotesOnTop(textarea.value);
        // on its own line after the quotes on top; with none, first, with the reply under it
        const insert = at > 0 ? '\n' + quote : quote + '\n';
        textarea.setRangeText(insert, at, at, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Where the quotes at the top of the reply end (counting quotes inside quotes, like the
    // forum's own quote of a post that has quotes in it); 0 when the reply doesn't start with one
    function endOfQuotesOnTop(text) {
        const tag = /\[(\/?)quote\b[^\]]*\]/gi;
        let end = 0;
        let depth = 0;
        let match;

        while ((match = tag.exec(text))) {
            const closing = match[1] === '/';
            // at the top level only another quote may follow, anything else is the reply itself
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
