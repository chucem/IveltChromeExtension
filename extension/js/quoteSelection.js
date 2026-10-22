(function () {
    'use strict';

    const DONE_MS = 1200;

    let button = null;
    let doneTimeout;

    function init() {
        if (!getTextarea()) return;

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
            goToReply();
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
        newButton.addEventListener('mousedown', (event) => event.preventDefault());
        return newButton;
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

        const quote = `[quote="${username}" user_id=${userId} time=${time} post_id=${postId}]\n${text}\n[/quote]`;

        const textarea = getTextarea();
        const at = endOfQuotesOnTop(textarea.value);
        const insert = at > 0 ? '\n' + quote : quote + '\n';
        textarea.setRangeText(insert, at, at, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function goToReply() {
        const textarea = getTextarea();
        const end = endOfQuotesOnTop(textarea.value);
        const caret = textarea.value[end] === '\n' ? end + 1 : end;
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(caret, caret);
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
