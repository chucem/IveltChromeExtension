(function () {
    'use strict';

    const SETTING_KEY = 'doubleClickLike';
    const IGNORED = 'a, button, input, textarea, select, .post-buttons, .spoilwrapper';

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] !== true) return;

            document.addEventListener('dblclick', onDoubleClick);
        });
    }

    function onDoubleClick(event) {
        const post = event.target.closest('.post');
        if (!post || event.target.closest(IGNORED) || window.getSelection().toString().trim()) return;

        const likeButton = post.querySelector('.postlove-button');
        if (!likeButton) return;

        if (!likeButton.querySelector('.liked')) likeButton.click();
        showThumb(event.clientX, event.clientY);
    }

    function showThumb(x, y) {
        const thumb = document.createElement('span');
        thumb.className = 'ih-double-click-like';
        thumb.textContent = '👍';
        thumb.style.left = x + 'px';
        thumb.style.top = y + 'px';
        thumb.addEventListener('animationend', () => thumb.remove());
        document.body.appendChild(thumb);
    }

    init();
})();
