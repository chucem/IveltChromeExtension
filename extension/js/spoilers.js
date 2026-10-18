// Spoilers like on Telegram
//
// The forum's spoiler is a small "◄ ווייז ספוילער" bar that slides the content open.
// Instead, the content stays in its place, covered (css/spoilers.css): the words with
// moving dust right where they are - so a few spoiled words stay in the middle of their
// line - and the pictures blurred with sparkling dots over them, like Telegram's hidden
// photos. A long spoiler shows only its first three lines. A click, or Enter / Space,
// reveals it for good and opens it to its full height. While it's hidden the links and
// pictures in it can't be clicked, so the first click only reveals.
//
// Runs as a content script (isolated world).

(function () {
    'use strict';

    const MAX_LINES = 3;
    const EXPAND_MS = 400; // as long as the max-height transition in css/spoilers.css
    // anything that can't sit in the middle of a line of text
    const BLOCKS = 'div, p, blockquote, dl, ul, ol, table, pre, hr, iframe, video, audio';

    function init() {
        document.querySelectorAll('.spoilwrapper').forEach(hideSpoiler);
    }

    function hideSpoiler(spoiler) {
        const content = spoiler.querySelector('.spoilcontent');
        if (!content) return;

        coverWords(spoiler, content);
        ownElements(spoiler, content, 'img').forEach(coverPicture);

        spoiler.classList.add('ih-spoiler', 'ih-spoiler-hidden');
        if (!content.querySelector(BLOCKS)) {
            spoiler.classList.add('ih-spoiler-inline');
            // an inline spoiler has a box for each of its lines
            if (content.getClientRects().length > MAX_LINES) spoiler.classList.add('ih-spoiler-long');
        } else if (wordsPastLines(spoiler, MAX_LINES)) {
            spoiler.classList.add('ih-spoiler-long');
        }

        spoiler.tabIndex = 0;
        spoiler.setAttribute('role', 'button');
        spoiler.title = 'ספוילער';

        const reveal = (event) => {
            if (!spoiler.classList.contains('ih-spoiler-hidden')) return;
            event.preventDefault();
            event.stopPropagation(); // a spoiler inside a spoiler opens one at a time
            if (spoiler.classList.contains('ih-spoiler-long')) expand(spoiler);
            spoiler.classList.remove('ih-spoiler-hidden');
            spoiler.removeAttribute('tabindex');
            spoiler.removeAttribute('role');
            spoiler.removeAttribute('title');
        };

        spoiler.addEventListener('click', reveal);
        spoiler.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') reveal(event);
        });
    }

    // The elements of this spoiler, not of a spoiler inside it (that one covers its own)
    function ownElements(spoiler, content, selector) {
        return [...content.querySelectorAll(selector)].filter((el) => el.closest('.spoilwrapper') === spoiler);
    }

    // Each run of words gets its own dust, so the dust follows the text line by line
    function coverWords(spoiler, content) {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const texts = [];
        while (walker.nextNode()) {
            const text = walker.currentNode;
            if (text.textContent.trim() && text.parentElement.closest('.spoilwrapper') === spoiler) texts.push(text);
        }

        texts.forEach((text) => {
            const words = document.createElement('span');
            words.className = 'ih-spoiler-words';
            text.replaceWith(words);
            words.appendChild(text);
        });
    }

    // A spoiler with a quote, a list... in it is long when its words go past its first lines
    // (a spoiler of just a picture isn't, so the whole blurred picture shows)
    function wordsPastLines(spoiler, lines) {
        const style = getComputedStyle(spoiler);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        const limit = spoiler.getBoundingClientRect().top + lines * lineHeight;
        return [...spoiler.querySelectorAll('.ih-spoiler-words')]
            .some((words) => words.getBoundingClientRect().bottom > limit + 1);
    }

    // The picture stays where it is, the dots go over it
    function coverPicture(img) {
        const picture = document.createElement('span');
        picture.className = 'ih-spoiler-picture';
        img.replaceWith(picture);
        picture.appendChild(img);
    }

    // Grows smoothly from the first lines to the full height, then lets go of the height
    function expand(spoiler) {
        spoiler.style.overflow = 'hidden';
        spoiler.style.maxHeight = spoiler.scrollHeight + 'px';
        setTimeout(() => {
            spoiler.style.maxHeight = '';
            spoiler.style.overflow = '';
        }, EXPAND_MS);
    }

    init();
})();
