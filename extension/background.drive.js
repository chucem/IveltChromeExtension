// Google Drive upload support
//
// The content script (js/driveUpload.js) can't use chrome.identity, so it asks the
// background for an OAuth token and the ID of the upload folder, then uploads the
// file itself (a File can't be passed through extension messaging).
//
// Uses the drive.file scope: the extension only ever sees files and folders it
// created itself, never the rest of the user's Drive.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_DEFAULT_FOLDER = 'Shared on iVelt';

function getDriveToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const token = typeof result === 'string' ? result : result && result.token;
      if (chrome.runtime.lastError || !token) {
        reject(new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Google sign-in failed'));
        return;
      }
      resolve(token);
    });
  });
}

function dropDriveToken(token) {
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}

async function driveFetch(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) {
    const error = new Error(`Google Drive error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Returns the ID of the upload folder, creating it when it doesn't exist (or was deleted)
async function ensureDriveFolder(token, name) {
  const { driveFolder } = await chrome.storage.local.get('driveFolder');

  if (driveFolder && driveFolder.name === name) {
    try {
      const folder = await driveFetch(token, `${DRIVE_API}/files/${driveFolder.id}?fields=id,trashed`);
      if (!folder.trashed) return folder.id;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }

  const query = `mimeType='${DRIVE_FOLDER_MIME}' and name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed=false`;
  const list = await driveFetch(token, `${DRIVE_API}/files?fields=files(id)&q=${encodeURIComponent(query)}`);
  let id = list.files && list.files.length ? list.files[0].id : null;

  if (!id) {
    const created = await driveFetch(token, `${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME })
    });
    id = created.id;
  }

  await chrome.storage.local.set({ driveFolder: { id, name } });
  return id;
}

async function getDriveUploadTarget(staleToken) {
  if (staleToken) await dropDriveToken(staleToken);

  const { driveFolderName } = await chrome.storage.local.get('driveFolderName');
  const name = (driveFolderName || '').trim() || DRIVE_DEFAULT_FOLDER;

  let token = await getDriveToken(true);
  try {
    return { token, folderId: await ensureDriveFolder(token, name) };
  } catch (err) {
    if (err.status !== 401) throw err;
    // Cached token expired or was revoked - get a fresh one and try once more
    await dropDriveToken(token);
    token = await getDriveToken(true);
    return { token, folderId: await ensureDriveFolder(token, name) };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== 'driveUploadTarget') return;

  getDriveUploadTarget(request.staleToken)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true; // keep the channel open for the async response
});
