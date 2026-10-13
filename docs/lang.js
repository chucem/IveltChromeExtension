// English / Yiddish switch. Elements carry data-l="en" or data-l="yi"; the CSS hides
// whichever language isn't active. The choice is remembered per browser.
(function () {
    var KEY = 'ivelt-site-lang';
    var root = document.documentElement;

    function stored() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }

    function initial() {
        var fromUrl = new URLSearchParams(location.search).get('lang');
        if (fromUrl === 'en' || fromUrl === 'yi') return fromUrl;
        var saved = stored();
        if (saved === 'en' || saved === 'yi') return saved;
        return /^(yi|he)\b/i.test(navigator.language || '') ? 'yi' : 'en';
    }

    function apply(lang) {
        root.setAttribute('data-lang', lang);
        root.setAttribute('lang', lang);
        root.setAttribute('dir', lang === 'yi' ? 'rtl' : 'ltr');
    }

    apply(initial());

    document.addEventListener('DOMContentLoaded', function () {
        var button = document.querySelector('.lang-toggle');
        if (!button) return;
        button.addEventListener('click', function () {
            var next = root.getAttribute('data-lang') === 'yi' ? 'en' : 'yi';
            apply(next);
            try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
        });
    });
})();
