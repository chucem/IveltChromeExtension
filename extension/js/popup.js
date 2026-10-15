let logout_url;

function getUserId(domain, name) {
    chrome.cookies.get({"url": domain, "name": name}, function (cookie) {
        if (cookie !== null) {
            id = cookie.value;
            checkLoginState();
        }
    });
}

function checkLoginState() {
    if (id.length > 1) {

        function getLogOutCookie(domain, name) {
            chrome.cookies.get({'url': domain, 'name': name}, function (cookie) {
                logout_url = cookie.value;
                setLogOutState();
            });
        }

        function setLogOutState() {
        }

        getLogOutCookie('https://www.ivelt.com', 'phpbb3_sw7kk_sid');
        document.getElementById('emergency_sign_out').style.display = 'block';
    } else {
        document.getElementById('quick_sign_in').style.display = 'block';
    }
}

getUserId('https://www.ivelt.com', 'phpbb3_sw7kk_u');

// The forum's addresses; the extension can see the address of a tab on one of them
const FORUM_HOSTS = /(^|\.)(ivelt\.com|yiddishworld\.com|198\.153\.76\.147)$/;

function isForumUrl(url) {
    try {
        return FORUM_HOSTS.test(new URL(url).hostname);
    } catch (e) {
        return false;
    }
}

// A link to the forum opens in the current tab when that tab is already on the forum,
// anything else in a new tab
function openLink(url) {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        const tab = tabs[0];
        if (tab && tab.url && isForumUrl(tab.url) && isForumUrl(url))
            chrome.tabs.update(tab.id, {url: url});
        else
            chrome.tabs.create({url: url});
        window.close();
    });
}

function open_home_page() {
    openLink('https://www.ivelt.com/forum/');
}

function open_pm_inbox() {
    openLink('https://www.ivelt.com/forum/ucp.php?i=pm&folder=inbox');
}

function open_active_topics() {
    openLink('https://www.ivelt.com/forum/search.php?search_id=active_topics');
}

function quick_sign_in() {
    chrome.tabs.create({url: 'https://www.ivelt.com/forum/ucp.php?mode=login', active: true});
    chrome.storage.local.set({'logged_in': '0'});
    window.close();
}

function emergency_sign_out() {
    chrome.tabs.create({url: 'https://www.ivelt.com/forum/ucp.php?mode=logout&sid=' + logout_url, active: false});
    chrome.storage.local.set({'logged_in': '0'});
    window.close();
}

function open_settings() {
    chrome.tabs.create({url: chrome.runtime.getURL('settings.html')});
    window.close();
}

// The user's own links, added on the settings page
function initCustomLinks() {
    const section = document.getElementById('customLinksSection');

    chrome.storage.local.get(['customLinks'], function (items) {
        (items.customLinks || []).forEach(function (link) {
            const option = document.createElement('div');
            option.className = 'popup_options';
            option.innerHTML = '<span class="popup_icon">🔗</span>';
            option.append(link.name);
            option.addEventListener('click', function () {
                openLink(link.url);
            });
            section.appendChild(option);
        });
    });
}

function showVersion() {
    document.getElementById('popup_version').textContent = 'v' + chrome.runtime.getManifest().version;
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('open_home_page').addEventListener('click', open_home_page);
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('open_pm_inbox').addEventListener('click', open_pm_inbox);
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('open_active_topics').addEventListener('click', open_active_topics);
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('quick_sign_in').addEventListener('click', quick_sign_in);
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('emergency_sign_out').addEventListener('click', emergency_sign_out);
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('open_settings').addEventListener('click', open_settings);
});

document.addEventListener('DOMContentLoaded', initCustomLinks);

document.addEventListener('DOMContentLoaded', showVersion);
