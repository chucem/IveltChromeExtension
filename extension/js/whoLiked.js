(function () {
    'use strict';

    const SETTING_KEY = 'whoLiked';
    const PROFILE_BY_NAME = '/forum/memberlist.php?mode=viewprofile&un=';

    let openList = null;

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] === false) return;

            document.querySelectorAll('.post-buttons .postlove-li').forEach(addArrow);

            document.addEventListener('click', (event) => {
                const arrow = event.target.closest('.ih-likes-arrow');
                if (arrow) toggleList(arrow.closest('.postlove-li'));
                else if (openList && !openList.contains(event.target)) closeList();
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') closeList();
            });
        });
    }

    function addArrow(likeItem) {
        const count = likeItem.querySelector('.postlove-count');
        const likeButton = likeItem.querySelector('.postlove-button');
        if (!count || !likeButton || !readLikes(count).names.length) return;

        const arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.className = 'button button-icon-only ih-likes-arrow';
        arrow.title = 'ווער האט באדאנקט';
        arrow.setAttribute('aria-expanded', 'false');
        arrow.innerHTML = '<i class="icon fa-caret-down" aria-hidden="true"></i>';
        likeButton.after(arrow);
        likeItem.classList.add('ih-likes-joined');
    }

    function readLikes(count) {
        const title = count.getAttribute('title') || '';
        const colon = title.indexOf(':');
        if (colon < 0) return { heading: '', names: [] };
        return {
            heading: title.slice(0, colon).trim(),
            names: title.slice(colon + 1).split(', ').map((name) => name.trim()).filter(Boolean)
        };
    }

    function toggleList(likeItem) {
        const wasOpen = openList && openList.parentElement === likeItem;
        closeList();
        if (wasOpen) return;

        const likes = readLikes(likeItem.querySelector('.postlove-count'));
        const names = withMyLike(likes.names, likeItem);

        const list = document.createElement('div');
        list.className = 'ih-likes';
        const heading = document.createElement('div');
        heading.className = 'ih-likes-heading';
        heading.textContent = `${likes.heading} (${names.length})`;
        const links = document.createElement('div');
        links.className = 'ih-likes-names';
        names.forEach((name) => {
            const link = document.createElement('a');
            link.href = PROFILE_BY_NAME + encodeURIComponent(name);
            link.textContent = name;
            links.appendChild(link);
        });
        list.append(heading, links);

        likeItem.appendChild(list);
        likeItem.querySelector('.ih-likes-arrow').setAttribute('aria-expanded', 'true');
        openList = list;
    }

    function withMyLike(names, likeItem) {
        const me = document.querySelector('.header-avatar .username, .header-avatar .username-coloured');
        const icon = likeItem.querySelector('.like, .liked');
        if (!me || !icon) return names;

        const myName = (me.dataset.name || me.textContent).trim();
        const liked = icon.classList.contains('liked');
        if (liked && !names.includes(myName)) return [...names, myName];
        if (!liked) return names.filter((name) => name !== myName);
        return names;
    }

    function closeList() {
        if (!openList) return;
        openList.parentElement.querySelector('.ih-likes-arrow').setAttribute('aria-expanded', 'false');
        openList.remove();
        openList = null;
    }

    init();
})();
