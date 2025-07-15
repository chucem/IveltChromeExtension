const notificationUrl = "https://www.ivelt.com/*";

const defualtPreferences = {
    hideUserName: false,
    alwaysCopyTopic: false,
    copyAttachments: true,
    getBrowserNotifications: false,
    warnOnLosingPost: true,
    debugMode: false,
    backgroundSync: true,
    backgroundSyncPosts: 20000,
    backgroundSyncNotif: 1,
    cachedTopicMappingExpire: 3600,
    forceUpdateTopicMapCache: false,
    stickyPostButtons: false
};

let debugQueue = {};
let debugQueueTimeout;
const debugLogPrefix = 'debug-';
let checkNewNotification = async function () {
    let data = null;
    const tabs = await chrome.tabs.query({ url: notificationUrl });

    if (tabs.length > 0) {
        try {
            // Check if content script is already injected
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    return {
                        isInjected: window.iveltNotificationScriptInjected === true
                    };
                }
            });

            // Inject content script if not already injected
            if (!result?.result?.isInjected) {
                console.error('Content script not injected!');
                return;
            }

            const fetchResult = await chrome.tabs.sendMessage(tabs[0].id, {
                type: "fetchNotifications"
            });

            if (fetchResult && fetchResult.success) {
                data = fetchResult.data;

                // update all tabs notifications
                const tabs = await chrome.tabs.query({ url: "*://www.ivelt.com/*" });

                for (const tab of tabs) {
                    try {
                        await chrome.tabs.sendMessage(tab.id, {
                            type: "notificationsUpdated",
                            data: data
                        });
                    } catch (e) {
                        if (e.message.includes("Receiving end does not exist")) {
                            console.warn(`Tab ${tab.id} does not have the content script injected. Skipping.`);
                        } else {
                            console.error(`Error sending message to tab ${tab.id}:`, e);
                        }
                    }
                }

                const prefs = await new Promise(resolve => {
                    chrome.storage.local.get(['getBrowserNotifications'], resolve);
                });

                // If notifications are enabled, parse and send them
                if (prefs.getBrowserNotifications && data) {
                    parseAndSendNotifications(data);
                }

                if (fetchResult.data.length.toString() !== "0") {
                    chrome.action.setBadgeText({ text: fetchResult.data.length.toString() });
                } else {
                    chrome.action.setBadgeText({ text: "" });
                }

                const debugDate = new Date();
                debugLog('backgroundSync', `checkNewNotification: newCount(${fetchResult.data.length}), ${debugDate.getUTCMinutes()}:${debugDate.getUTCSeconds()})`);

            }

        } catch (e) {
            console.error("Error checking notifications:", e);
        }
    } else {
        console.log("iVelt tab not open. Will check again later.");
    }

};

// Set up the interval for checking notifications
function setupNotificationCheck() {
    // Clear any existing alarms
    chrome.alarms.clear('notificationCheck');

    chrome.storage.local.get(['backgroundSyncNotif'], function(items){
        if(items.backgroundSyncNotif){
            chrome.alarms.create('notificationCheck', {
                periodInMinutes: items.backgroundSyncNotif
    
            });
        }
    });
}

// Listen for alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'notificationCheck') {
        checkNewNotification();
    }
});

// Initial setup when the extension loads
chrome.runtime.onStartup.addListener(setupNotificationCheck);
chrome.runtime.onInstalled.addListener(setupNotificationCheck);

// Also run immediately when the background script loads
// checkNewNotification();

// Listen for tab updates to check notifications when the user navigates to iVelt
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ivelt.com')) {
        checkNewNotification();
    }
});

chrome.runtime.onInstalled.addListener((details) => {

    // Migrate settings from sync storage to local storage
    chrome.storage.sync.get(null, function (items) {
        if (Object.keys(items).length > 0) {
            Object.keys(items).forEach((key) => {
                chrome.storage.local.set({ [key]: items[key] });
                chrome.storage.sync.remove(key);
                console.log(`Migrated ${key}`);
            });
        }
    });

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
        isFreshInstall: true // needed for initial notifications
    }, function(items){
        if(items && Object.keys(items).length)
            chrome.storage.local.set(items);

        alarmToFetch(items.backgroundSync, parseInt(items.backgroundSyncNotif));
    });
});

// not in use i think
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === 'badgeText') {
        chrome.action.setBadgeText({ text: request.text });
    }
    if (request.type === 'browserNotification') {
        queueNotification(request);
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'sync')
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

    if(changes.backgroundSync || changes.backgroundSyncNotif){
        chrome.storage.local.get(['backgroundSync', 'backgroundSyncNotif'], items => {
            alarmToFetch(items.backgroundSync, parseInt(items.backgroundSyncNotif));
        });
    }
});

function alarmToFetch(create, frequency){
    debugLog('backgroundSync', `alarmToFetch(${create}, ${frequency})`);
    if(create){
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

importScripts('./background.notifications.js')
