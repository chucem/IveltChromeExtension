let scripts = [
  "js/keyboardShortcuts.js",
  "js/newResponseNotification.js",
  "js/pageEnhancements.js",
  "js/addTopicButtons.js",
  "js/addGoogleSearch.js"
];

scripts.forEach((s) => {
  let e = document.createElement("script");
  e.src = chrome.runtime.getURL(s);
  (document.head || document.documentElement).appendChild(e);
  e.onload = function () {
    e.parentNode.removeChild(e);
  };
});