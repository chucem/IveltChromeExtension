(function () {
    'use strict';

    const PICTURES = '.postbody .content img:not(.smilies)';
    const PICTURE_ADDRESS = /\.(jpe?g|png|gif|webp|bmp|avif)([?#]|$)|\/download\/file\.php\?/i;

    let viewer = null;
    let pictures = [];
    let index = 0;

    function init() {
        document.addEventListener('click', onClick, true);
        window.addEventListener('keydown', onKey, true);
    }

    function onClick(event) {
        const img = event.target.closest('img');
        if (!img || !isViewable(img)) return;
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        event.stopPropagation();
        pictures = [...document.querySelectorAll(PICTURES)].filter(isViewable);
        show(pictures.indexOf(img));
    }

    function isViewable(img) {
        if (!img.matches(PICTURES) || !img.offsetParent || getComputedStyle(img).pointerEvents === 'none') return false;
        const link = img.closest('a');
        return !link || PICTURE_ADDRESS.test(link.href);
    }

    function fullAddress(img) {
        const link = img.closest('a');
        return link && PICTURE_ADDRESS.test(link.href) ? link.href : img.currentSrc || img.src;
    }

    function show(newIndex) {
        if (!viewer) viewer = createViewer();
        index = (newIndex + pictures.length) % pictures.length;

        const address = fullAddress(pictures[index]);
        viewer.querySelector('.ih-viewer-picture').src = address;
        viewer.querySelector('.ih-viewer-open').href = address;
        viewer.querySelector('.ih-viewer-count').textContent = `${index + 1} / ${pictures.length}`;
        viewer.classList.toggle('ih-viewer-single', pictures.length === 1);

        document.documentElement.classList.add('ih-viewer-open');
        document.body.appendChild(viewer);
    }

    function close() {
        viewer.remove();
        document.documentElement.classList.remove('ih-viewer-open');
    }

    function isOpen() {
        return viewer && viewer.isConnected;
    }

    function onKey(event) {
        if (!isOpen()) return;

        const actions = {
            Escape: close,
            ArrowLeft: () => show(index + 1),
            ArrowRight: () => show(index - 1),
            ArrowUp: () => {},
            ArrowDown: () => {}
        };
        if (!actions[event.key]) return;

        event.preventDefault();
        event.stopPropagation();
        actions[event.key]();
    }

    function createViewer() {
        const newViewer = document.createElement('div');
        newViewer.className = 'ih-viewer';
        newViewer.innerHTML = `
            <img class="ih-viewer-picture" alt="">
            <button type="button" class="ih-viewer-close" title="פארמאך"><i class="icon fa-times fa-fw" aria-hidden="true"></i></button>
            <button type="button" class="ih-viewer-previous" title="פריערדיגע"><i class="icon fa-chevron-right fa-fw" aria-hidden="true"></i></button>
            <button type="button" class="ih-viewer-next" title="קומענדיגע"><i class="icon fa-chevron-left fa-fw" aria-hidden="true"></i></button>
            <div class="ih-viewer-bar">
                <span class="ih-viewer-count" dir="ltr"></span>
                <a class="ih-viewer-open" target="_blank" rel="noopener" title="עפן אין א נייע טעב"><i class="icon fa-external-link fa-fw" aria-hidden="true"></i></a>
            </div>`;

        newViewer.querySelector('.ih-viewer-close').addEventListener('click', close);
        newViewer.querySelector('.ih-viewer-previous').addEventListener('click', () => show(index - 1));
        newViewer.querySelector('.ih-viewer-next').addEventListener('click', () => show(index + 1));
        newViewer.addEventListener('click', (event) => {
            if (event.target === newViewer) close();
        });

        return newViewer;
    }

    init();
})();
