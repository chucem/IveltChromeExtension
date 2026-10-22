let scripts = [
  "js/print.js",
  "js/keyboardShortcuts.js",
  "js/newResponseNotification.js",
  "js/pageEnhancements.js",
  "js/splitNotifications.js",
  "js/addTopicButtons.js",
  "js/editorUndo.js",
  "js/addGoogleSearch.js"
];

// skip pages that aren't the forum, like Cloudflare's challenge page, the scripts expect the forum's elements
if (document.getElementById("page-body")) scripts.forEach((s) => {
  let e = document.createElement("script");
  e.src = chrome.runtime.getURL(s);
  (document.head || document.documentElement).appendChild(e);
  e.onload = function () {
    e.parentNode.removeChild(e);
  };
});