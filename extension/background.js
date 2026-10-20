const notificationUrl = "https://www.ivelt.com/forum/ucp.php?i=ucp_notifications";

const defualtPreferences = {
  hideUserName: false,
  alwaysCopyTopic: false,
  copyAttachments: true,
  getBrowserNotifications: false,
  warnOnLosingPost: true,
  debugMode: false,
  backgroundSync: true,
  backgroundSyncPosts: 20000,
  backgroundSyncNotifMinutes: 10, // minutes, checking less often goes easy on the server
  cachedTopicMappingExpire: 3600,
  forceUpdateTopicMapCache: false,
  stickyPostButtons: false,
  titleOpensUnread: true,
  ShowMultiNotifs: true,
  upDownArrowKeys: true,
  imageResizer: true,
  pasteImages: true,
  driveUpload: true,
  driveButtonPlace: 'attachments',
  dropboxUpload: true,
  driveFolderName: 'iVelt Helper',
  openAttachmentsTab: true,
  copyPostLink: true,
  printShowLikes: false,
  printLikesStyle: 'names',
  theme: 'default'
};

let debugQueue = {};
let debugQueueTimeout;
const debugLogPrefix = 'debug-';

let checkNewNotification = function () {
    fetch(notificationUrl, { headers: { 'X-Requested-With': chrome.runtime.id } })
      .then((response) => {
        if (!response.ok) throw new Error(response.status);
        return response.text();
      })
      .then((data) => {

      let matches =
        data.match(/id="notification_list_button"\D*(\d{1,4})/) || [];
      let newCount = matches.length === 2 ? matches[1] : "0";

      if (newCount !== "0") {
        chrome.action.setBadgeText({ text: newCount });
      } else {
        chrome.action.setBadgeText({ text: "" });
      }

      // triggere browser notifications
      chrome.storage.local.get(['getBrowserNotifications'], function(items){
        if(items.getBrowserNotifications){
          parseAndSendNotifications(data);
        }
      });

      const debugDate = new Date();
      debugLog('backgroundSync', `checkNewNotification: newCount(${newCount}), ${debugDate.getUTCMinutes()}:${debugDate.getUTCSeconds()})`);
    })
    .catch((e) => debugLog('backgroundSync', `checkNewNotification failed: ${e.message}`));
};

chrome.alarms.onAlarm.addListener(() => {
  checkNewNotification();
});

// Themes used to have an on/off switch of their own (themesEnabled). Now "אריגינעל" in the
// colors tab is "off", so whoever had them turned off is moved to it, and the switch is removed.
// It runs before the defaults are filled in, so nothing writes the old theme back
async function moveThemesSwitch(){
  const { themesEnabled } = await chrome.storage.local.get('themesEnabled');
  if (themesEnabled === undefined)
    return;

  if (themesEnabled === false)
    await chrome.storage.local.set({ theme: 'default' });
  await chrome.storage.local.remove('themesEnabled');
}

chrome.runtime.onInstalled.addListener(async (details) => {

  // before the defaults, so a new computer starts with the user's synced settings
  await settingsSyncOnInstall(details.reason);

  await moveThemesSwitch();

  if (details.reason === "update" || details.reason === "install") {
    // Get current settings in local storage
    chrome.storage.local.get(null, (currentSettings) => {
      const updatedSettings = { ...currentSettings };
      const addedSettings = []; // Track added settings

      // Add missing settings from defaultPreferences
      Object.keys(defualtPreferences).forEach((key) => {
        if (!(key in currentSettings)) {
          updatedSettings[key] = defualtPreferences[key];
          addedSettings.push(key); // Track the key being added
        }
      });

      // Save updated settings back to local storage
      chrome.storage.local.set(updatedSettings, () => {
        if (addedSettings.length > 0) {
          console.log(`The following settings were added: ${addedSettings.join(', ')}`);
        } else {
          console.log("No new settings were added. All settings are up-to-date.");
        }
      });
    });
  }

  // Set default settings to storage if not already present (fresh install or otherwise)
  chrome.storage.local.get({
    ...defualtPreferences,
    isFreshInstall: true, // needed for initial notifications
    backgroundSyncNotif: null // the old name of backgroundSyncNotifMinutes
  }, function(items){
    // move the old setting to the new name, and users off the old 1 minute default, to go easy on the server
    if(items.backgroundSyncNotif !== null){
      items.backgroundSyncNotifMinutes = parseInt(items.backgroundSyncNotif) === 1 ? defualtPreferences.backgroundSyncNotifMinutes : items.backgroundSyncNotif;
      chrome.storage.local.remove('backgroundSyncNotif');
    }
    delete items.backgroundSyncNotif;

    if(items && Object.keys(items).length)
      chrome.storage.local.set(items);

    alarmToFetch(items.backgroundSync, parseInt(items.backgroundSyncNotifMinutes));
  });
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if(request.type === 'resetSettings'){
    chrome.storage.local.set(defualtPreferences, () => {
      alarmToFetch(defualtPreferences.backgroundSync, defualtPreferences.backgroundSyncNotifMinutes);
      sendResponse();
    });
    return true;
  }

  if(request.type === 'badgeText'){
    chrome.action.setBadgeText({ text: request.text });
  }

  // global method to send a notification
  if(request.type === 'browserNotification'){
    queueNotification(request);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  // settings live in local storage since the migration from sync
  if(area !== 'local')
    return;

  // clean debug logs when turned off
  if(changes.debugMode && changes.debugMode.newValue === false){
    chrome.storage.local.get(null, items => {
      Object.keys(items).forEach(key => {
        if(key.indexOf(debugLogPrefix) === 0)
          chrome.storage.local.remove(key);
      })
    })
  }

  if(changes.backgroundSync || changes.backgroundSyncNotifMinutes){
    chrome.storage.local.get(['backgroundSync', 'backgroundSyncNotifMinutes'], items => {
      alarmToFetch(items.backgroundSync, parseInt(items.backgroundSyncNotifMinutes));
    });
  }
});

function alarmToFetch(create, frequency){
  debugLog('backgroundSync', `alarmToFetch(${create}, ${frequency})`);
  // "dont check" saves an empty frequency
  if(create && frequency > 0){
    chrome.alarms.create("alarm", { periodInMinutes: frequency });
  }
  else {
    chrome.alarms.clear("alarm");
  }
}

// will create a storage entry and keep on adding values
function debugLog(name, valueToPush){
  debugQueue[name] = debugQueue[name] ? debugQueue[name].push(valueToPush) && debugQueue[name] : [valueToPush];

  if(debugQueueTimeout)
    clearTimeout(debugQueueTimeout);

  debugQueueTimeout = setTimeout(() => {
    chrome.storage.local.get('debugMode', items => {
      if(items.debugMode){
        // log all from the queue
        Object.keys(debugQueue).forEach(key => {
          commitDebugLog(key, debugQueue[key]);
          delete debugQueue[key];
        });
      }
    });
  }, 1000);
}

function commitDebugLog(name, values){
  name = debugLogPrefix + name;
  chrome.storage.local.get(name, ({[name]: item}) => {
    if(item)
      chrome.storage.local.set({[name]: item.concat(values)});
    else
      chrome.storage.local.set({[name]: values});
  })
}

importScripts('./background.notifications.js', './background.drive.js', './background.dropbox.js', './background.settingsSync.js')
