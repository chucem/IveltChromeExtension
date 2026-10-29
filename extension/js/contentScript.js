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

// the page scripts can't reach Google Sheets (the forum's CSP), so js/addTopicButtons.js asks here and the background fetches it
window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.type !== "ivelt-helper-topic-mapping") return;

  chrome.runtime.sendMessage({ type: "topicMappingCsv" }, (response) => {
    if (chrome.runtime.lastError) response = { error: chrome.runtime.lastError.message };
    window.postMessage({ type: "ivelt-helper-topic-mapping-result", text: response.text, error: response.error }, location.origin);
  });
});
