export function uploadR2Object(upload, file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(upload?.uploadUrl); } catch { reject(new Error('Veylo could not prepare this upload.')); return; }
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.r2.cloudflarestorage.com')) {
      reject(new Error('Veylo could not prepare this upload.'));
      return;
    }
    const request = new XMLHttpRequest();
    request.open('PUT', target.toString());
    request.timeout = 15 * 60 * 1000;
    for (const [name, value] of Object.entries(upload.uploadHeaders || {})) request.setRequestHeader(name, value);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded, event.total); };
    request.onerror = () => reject(new Error('The upload connection was interrupted.'));
    request.ontimeout = () => reject(new Error('The upload took too long. Check your connection and try again.'));
    request.onabort = () => reject(new Error('The upload was cancelled.'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(request.status === 413 ? 'This file is too large to upload.' : 'The file did not finish uploading. Check your connection and try again.'));
        return;
      }
      resolve({ objectKey: upload.objectKey, uploadToken: upload.uploadToken, contentType: upload.contentType });
    };
    request.send(file);
  });
}
