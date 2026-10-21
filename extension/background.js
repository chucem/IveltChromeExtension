const notificationUrl = "https://www.ivelt.com/forum/ucp.php?i=ucp_notifications";

const defualtPreferences = {
  hideUserName: false,
  alwaysCopyTopic: false,
  copyAttachments: true,
  getBrowserNotifications: false,
  popupSameTab: false,
  warnOnLosingPost: true,
  keepDrafts: true,
  debugMode: false,
  // both checks are off until the user turns them on, which goes easy on the server
  backgroundSync: false, // checking an open topic for new replies
  backgroundSyncPosts: 60000, // every minute, once it's turned on
  backgroundSyncNotifMinutes: '', // the notification check, '' is off
  cachedTopicMappingExpire: 3600,
  forceUpdateTopicMapCache: false,
  stickyPostButtons: false,
  titleOpensUnread: true,
  doubleClickLike: false,
  ShowMultiNotifs: true,
  upDownArrowKeys: true,
  spoilerPolish: false,
  imageResizer: true,
  pasteImages: true,
  driveUpload: true,
  driveButtonPlace: 'attachments',
  dropboxUpload: true,
  driveFolderName: 'iVelt Helper',
  openAttachmentsTab: true,
  copyPostLink: true,
  whoLiked: true,
  printShowLikes: false,
  printLikesStyle: 'names',
  themesEnabled: false,
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

chrome.runtime.onInstalled.addListener(async (details) => {

  // before the defaults, so a new computer starts with the user's synced settings
  await settingsSyncOnInstall(details.reason);

  await moveToNewCheckTiming(details.reason);
  markWhatsNew(details.reason);

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

    alarmToFetch(parseInt(items.backgroundSyncNotifMinutes));
  });
});

// The settings for the checks were reorganized: each check (an open topic's new replies, and
// the notifications) now has its own on/off and its own choices of how often. Many users had
// the old checks running without meaning to, which loaded the site for nothing, so once, on the
// update, both are turned off. Whoever had one of them on is told so in the "what's new" pop-up
// (js/whatsNew.js), with a button to the settings to turn them back on
const CHECK_TIMING_MIGRATED = 'checkTimingMigrated';

async function moveToNewCheckTiming(reason){
  if(reason !== 'install' && reason !== 'update')
    return;

  const items = await chrome.storage.local.get([CHECK_TIMING_MIGRATED, 'backgroundSync', 'backgroundSyncPosts', 'backgroundSyncNotifMinutes', 'backgroundSyncNotif']);
  if(items[CHECK_TIMING_MIGRATED])
    return;

  if(reason === 'update'){
    const minutes = items.backgroundSyncNotifMinutes !== undefined ? items.backgroundSyncNotifMinutes : items.backgroundSyncNotif;
    const wasChecking = items.backgroundSync !== false && (parseInt(minutes) > 0 || items.backgroundSyncPosts !== '');

    await chrome.storage.local.set({
      backgroundSync: false,
      backgroundSyncPosts: defualtPreferences.backgroundSyncPosts,
      backgroundSyncNotifMinutes: '',
      whatsNewCheckTiming: wasChecking
    });
    // the old name would be moved over the new setting further down
    await chrome.storage.local.remove('backgroundSyncNotif');
  }

  await chrome.storage.local.set({ [CHECK_TIMING_MIGRATED]: true });
}

// After an update, the next forum page shows what's new in this version (js/whatsNew.js)
function markWhatsNew(reason){
  if(reason === 'update'){
    chrome.storage.local.set({ whatsNewVersion: chrome.runtime.getManifest().version });
    // a "remind me later" from the last version's pop-up doesn't hold back this one
    chrome.storage.local.remove('whatsNewLaterUntil');
  }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if(request.type === 'resetSettings'){
    chrome.storage.local.set(defualtPreferences, () => {
      alarmToFetch(parseInt(defualtPreferences.backgroundSyncNotifMinutes));
      sendResponse();
    });
    return true;
  }

  if(request.type === 'openSettings'){
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html' + (request.hash ? '#' + request.hash : '')) });
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

  if(changes.backgroundSyncNotifMinutes){
    alarmToFetch(parseInt(changes.backgroundSyncNotifMinutes.newValue));
  }
});

// The notification check has its own on/off (an empty frequency is off); backgroundSync is
// only for checking an open topic for new replies (js/newResponseNotification.js)
function alarmToFetch(frequency){
  debugLog('backgroundSync', `alarmToFetch(${frequency})`);
  if(frequency > 0){
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
