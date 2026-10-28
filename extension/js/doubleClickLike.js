(function () {
    'use strict';

    const SETTING_KEY = 'doubleClickLike';
    const IGNORED = 'a, button, input, textarea, select, .post-buttons, .spoilwrapper';

    let hadSelection = false;

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] !== true) return;

            // whether words were already selected when the double-click began: then the
            // double-click is about that selection (like quoting it), not a like. Checked at its
            // first press, since the double-click itself changes the selection
            document.addEventListener('mousedown', (event) => {
                if (event.detail === 1) hadSelection = !!window.getSelection().toString().trim();
            }, true);
            document.addEventListener('dblclick', onDoubleClick);
        });
    }

    function onDoubleClick(event) {
        const post = event.target.closest('.post');
        if (!post || hadSelection || event.target.closest(IGNORED) || window.getSelection().toString().trim()) return;

        // a post that can't be liked (your own, or when logged out) has a plain <span> with no
        // data-ajax, so there's nothing to click and no thumb to show
        const likeButton = post.querySelector('.postlove-button[data-ajax]');
        if (!likeButton) return;

        // the forum's like button toggles, so a double-click on a liked post takes the like back
        const unliking = !!likeButton.querySelector('.liked');
        likeButton.click();
        showThumb(event.clientX, event.clientY, unliking);
    }

    function showThumb(x, y, unliking) {
        const thumb = document.createElement('span');
        thumb.className = 'ih-double-click-like' + (unliking ? ' ih-double-click-unlike' : '');
        thumb.textContent = '👍';
        thumb.style.left = x + 'px';
        thumb.style.top = y + 'px';
        thumb.addEventListener('animationend', () => thumb.remove());
        document.body.appendChild(thumb);
    }

    init();
})();
