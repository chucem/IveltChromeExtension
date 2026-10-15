const preferencesOptions = [
	'hideUserName',
	'getBrowserNotifications',
	'warnOnLosingPost',
	'backgroundSync',
	'backgroundSyncPosts',
	'backgroundSyncNotif',
	'debugMode',
	"alwaysCopyTopic",
	'cachedTopicMappingExpire',
	'copyAttachments',
	'stickyPostButtons',
	'ShowMultiNotifs',
	'upDownArrowKeys',
	'imageResizer',
	'pasteImages',
	'driveUpload',
	'dropboxUpload',
	'driveButtonPlace',
	'driveFolderName',
	'openAttachmentsTab',
	'copyPostLink',
	'printShowLikes',
	'printLikesStyle'
];

// Listen to settings changes
function startListeners(){

	preferencesOptions.forEach(prefName => {
		document.getElementById(prefName).addEventListener('change', (e) => {
			var newSetting = {};

			if(e.currentTarget.type === 'checkbox')
				newSetting[prefName] = !!e.currentTarget.checked;
			else
				newSetting[prefName] = e.currentTarget.value;

			commitNewSetting(newSetting);
			postSettingChange(newSetting);
		});
	});

	document.getElementById('forceUpdateTopicMapCache').addEventListener('click', () => {
		chrome.storage.local.set({ forceUpdateTopicMapCache: true }, function () {
			notify();
		});
	});
	document.querySelector('.js-copy-logs').addEventListener('click', copyLogs);
}

// update fields after a related setting has been changed
function postSettingChange(items){
	if(items.hasOwnProperty('backgroundSync')){
		document.getElementById('backgroundSyncPosts').disabled = !items.backgroundSync;
		document.getElementById('backgroundSyncNotif').disabled = !items.backgroundSync;
	}

	if(items.hasOwnProperty('driveUpload') || items.hasOwnProperty('dropboxUpload')){
		const drive = document.getElementById('driveUpload').checked;
		const dropbox = document.getElementById('dropboxUpload').checked;
		document.getElementById('driveFolderName').disabled = !drive;
		document.getElementById('driveButtonPlace').disabled = !drive && !dropbox;
	}

	if(items.hasOwnProperty('printShowLikes')){
		document.getElementById('printLikesStyle').disabled = !items.printShowLikes;
	}

	if(items.hasOwnProperty('debugMode')){
		document.querySelector('.js-copy-logs').classList.toggle('hidden', !items.debugMode);
	}
}

function copyLogs(){
	chrome.storage.local.get(null, items => {
		chrome.storage.local.getBytesInUse(inUse => {
			let logs = [navigator.userAgent, `Bytes in use: ${inUse}, QUOTA_BYTES: ${chrome.storage.local.QUOTA_BYTES}, QUOTA_BYTES_PER_ITEM: ${chrome.storage.local.QUOTA_BYTES_PER_ITEM}`];
			Object.keys(items).forEach(key => {
				if(key.indexOf('debug-') === 0)
					logs.push(key + ' -> ' + items[key]);
			});
			navigator.clipboard.writeText(logs.join('\n'))
				.then(() => notify('די לאגס זענען קאפירט געווארן'));
		});
	});
}



// Saves settings to chrome.storage
function commitNewSetting(nameValue){

	chrome.storage.local.set(nameValue, function() {
		// Let user know options were saved.
		notify();
	});
}

function notify(message){
	const fadeTarget = document.getElementById('notify');
	fadeTarget.innerHTML = message || 'די אנשטעלונגען זענען געסעיווט געווארן';
	fadeTarget.classList.add('fade');
	setTimeout(function() {
		fadeTarget.classList.remove('fade');
	}, 3650);
}

function initSettings() {

	// Get all preferences from storage to set fields as needed
	chrome.storage.local.get(null, function(items) {

		preferencesOptions.forEach(prefName => {
			const element = document.getElementById(prefName);

			if(element.type === 'checkbox')
				element.checked = items[prefName];
			else
				element.value = items[prefName];
		});

		postSettingChange(items);

		initThemePicker(items.theme, items.customTheme);
		initThemesToggle(items.themesEnabled);

		startListeners();
	});
}

// The page has tabs, the hash picks one (settings.html#colors) so it can be linked to
function showTab(){
	const tabsShown = !document.querySelector('.page-tabs').classList.contains('hidden');
	const tabName = tabsShown && document.getElementById('tab-' + location.hash.slice(1)) ? location.hash.slice(1) : 'settings';

	document.querySelectorAll('.tab-panel').forEach(panel => {
		panel.classList.toggle('hidden', panel.id !== 'tab-' + tabName);
	});
	document.querySelectorAll('.page-tabs a').forEach(link => {
		link.classList.toggle('active', link.dataset.tab === tabName);
	});
}

window.addEventListener('hashchange', showTab);
document.addEventListener('DOMContentLoaded', showTab);
document.addEventListener('DOMContentLoaded', initSettings);
