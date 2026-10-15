// Media player
//
// A link in a post to a video or audio file on Google Drive or Dropbox gets a
// player right under it, with a download button, so it can be played without
// leaving the topic. A video starts small and grows to the full width of the post
// once it's clicked or played. The link itself stays as it is. Links inside quotes
// are skipped, so a quoted video isn't shown twice.
//
// Runs as a content script (isolated world).

(function () {
    'use strict';

    const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm)$/i;
    const AUDIO_EXTENSION = /\.(mp3|m4a|wav|ogg)$/i;

    function init() {
        document.querySelectorAll('.postbody .content a[href]').forEach(addPlayer);
    }

    function addPlayer(link) {
        if (link.closest('blockquote')) return;

        const media = getDriveMedia(link) || getDropboxMedia(link);
        if (!media) return;

        const download = document.createElement('a');
        download.className = 'button ih-media-download';
        download.href = media.downloadUrl;
        download.target = '_blank';
        download.rel = 'noopener';
        download.innerHTML = '<i class="icon fa-download fa-fw" aria-hidden="true"></i><span>דאנלאוד</span>';

        const box = document.createElement('div');
        box.className = 'ih-media';
        box.append(download, media.player);
        link.after(box);
    }

    // https://drive.google.com/file/d/<id>/view - played in Drive's own preview player.
    // The link text is usually the file name (that's how the Drive upload button inserts
    // it); when it shows the file is something else (a PDF, a ZIP...) it gets no player
    function getDriveMedia(link) {
        const match = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/.exec(link.href);
        if (!match) return null;

        const name = link.textContent.trim();
        if (/\.\w{2,4}$/.test(name) && !VIDEO_EXTENSION.test(name) && !AUDIO_EXTENSION.test(name)) return null;

        const frame = document.createElement('iframe');
        frame.src = `https://drive.google.com/file/d/${match[1]}/preview`;
        frame.allow = 'autoplay; fullscreen';
        frame.loading = 'lazy';

        return {
            player: createVideoBox(frame),
            downloadUrl: `https://drive.google.com/uc?export=download&id=${match[1]}`
        };
    }

    // https://www.dropbox.com/scl/fi/<id>/<name>?rlkey=...&dl=0 (or the older /s/<id>/<name>).
    // raw=1 makes Dropbox send the file itself, so the browser's own player can play it;
    // dl=1 downloads it
    function getDropboxMedia(link) {
        const url = new URL(link.href);
        if (url.hostname !== 'www.dropbox.com' || !/^\/(scl\/fi|s)\//.test(url.pathname)) return null;

        const isVideo = VIDEO_EXTENSION.test(url.pathname);
        const isAudio = AUDIO_EXTENSION.test(url.pathname);
        if (!isVideo && !isAudio) return null;

        const fileUrl = (param) => {
            const fileLink = new URL(url);
            fileLink.searchParams.delete('dl');
            fileLink.searchParams.set(param, '1');
            return fileLink.href;
        };

        const media = document.createElement(isVideo ? 'video' : 'audio');
        media.src = fileUrl('raw');
        media.controls = true;
        media.preload = 'metadata';

        if (isAudio) media.className = 'ih-media-audio';

        return {
            player: isVideo ? createVideoBox(media) : media,
            downloadUrl: fileUrl('dl')
        };
    }

    // Starts small; a click on it, or playing it, makes it as wide as the post.
    // Drive's player is an iframe, which would swallow the click, so while the video
    // is small the iframe ignores clicks (css/mediaPlayer.css) and the box gets them
    function createVideoBox(player) {
        const box = document.createElement('div');
        box.className = 'ih-media-video';
        box.appendChild(player);

        const expand = () => box.classList.add('ih-media-expanded');
        box.addEventListener('click', expand);
        player.addEventListener('play', expand);

        return box;
    }

    init();
})();
