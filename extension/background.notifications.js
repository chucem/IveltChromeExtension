const origin = 'https://www.ivelt.com/';

var queue = [];
var queueTimer = null;

chrome.notifications.onClicked.addListener(function(notifId) {

  if(!notifId.includes('-'))
    return;

  const paramValues = notifId.split('-');
  const link = `${origin}forum/index.php?mark_notification=${paramValues[0]}&hash=${paramValues[1]}`;
  
  // open tab to url
  chrome.tabs.create({url: link}, tab => {
    // focus window
    chrome.windows.update(tab.windowId, {focused: true});
    // remove notification from feed
    chrome.notifications.clear(notifId);
  });
});

function parseAndSendNotifications(unreadNotifications) {
  var storeOnly = false;

  chrome.storage.local.get(['notificationsSent', 'isFreshInstall'], items => {

    debugLog('isFreshInstall', items.isFreshInstall);

    if(items.isFreshInstall){
      chrome.storage.local.remove('isFreshInstall');
      storeOnly = true;
    }

    if(!unreadNotifications.length){
      return;
    }

    let unread = unreadNotifications.map(item => {

      let id;
      // not all notifications have a link
      if(item.link){
        const url = new URL(item.link.replace('./', origin + 'forum/')); // to text for htmlized "&"
        id = url.searchParams.get('mark_notification') + '-' + url.searchParams.get('hash');
      }
      // else {
      //   id = getAttrValue(item, 'input', 'value');
      // }

      debugLog(id, item.threadTitle);

      return {
        title: htmlToText(item.title),
        message: htmlToText(item.threadTitle),
        subMessage: item.timestamp,
        id: id
      }
    });
    
    // filter sent items
    if(items.notificationsSent){
      unread = unread.filter(u => {
        debugLog(u.id, 'Was already sent: ' + !!items.notificationsSent.includes(u.id));
        return !items.notificationsSent.includes(u.id)
      });
    }

    if(!unread.length)
      return;

    var saveNewIds = unread.map(u => {
      debugLog(u.id, 'storeOnly: ' + storeOnly);
      return u.id;
    }).join(',');

    var notificationsSent = (items.notificationsSent ? items.notificationsSent + ',' : '') + saveNewIds;

    debugLog(unread[0].id, 'savingBytes: ' + notificationsSent.length);

    // save sent items in storage
    // TODO: prune old ids to avoid storage quota errors
    chrome.storage.local.set({
      'notificationsSent': notificationsSent
    }, () => {
      // dont send the initial batch
      if(storeOnly){
        storeOnly = false;
        return;
      }

      unread.forEach(u => queueNotification(u));
    });
  });
}

// send one browser notification at a time, every 10 seconds
function queueNotification(notification){

  debugLog(notification.id, 'Queing notification');

  queue.push(notification);

  if(!queueTimer){
    queueTimer = setInterval(function(){
      if(queue.length)
        sendBrowserNotification(queue.shift());
      else{
        clearInterval(queueTimer);
        queueTimer = null;
      }
    }, 10000);
  }
}

function sendBrowserNotification(item){
  debugLog(item.id, 'Sending notification');
  chrome.notifications.create(item.id, {
    type: 'basic',
    iconUrl: 'img/site_logo.png',
    title: item.title,
    message: item.message,
    contextMessage: item.subMessage,
    priority: 2
  });
}


function htmlToText(string){
  return string.replace(/<[^>]*>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, '')
    .trim();
}