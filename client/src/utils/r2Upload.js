import { PHOTO_UPLOAD_TIMEOUT_MS } from './adaptivePhotoUpload.js';

function uploadError(message, code, status) {
  return Object.assign(new Error(message), { code, ...(status ? { status } : {}) });
}

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
    request.timeout = PHOTO_UPLOAD_TIMEOUT_MS;
    for (const [name, value] of Object.entries(upload.uploadHeaders || {})) request.setRequestHeader(name, value);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded, event.total); };
    request.onerror = () => reject(uploadError('The upload connection was interrupted.', 'UPLOAD_CONNECTION_INTERRUPTED'));
    request.ontimeout = () => reject(uploadError('The upload took too long. Check your connection and try again.', 'UPLOAD_TIMED_OUT'));
    request.onabort = () => reject(uploadError('The upload was cancelled.', 'UPLOAD_CANCELLED'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        if (request.status === 413) {
          reject(uploadError('This file is too large to upload.', 'UPLOAD_TOO_LARGE', 413));
          return;
        }
        const code = request.responseText?.match(/<Code>([^<]{1,100})<\/Code>/i)?.[1]?.trim();
        const status = request.status ? `HTTP ${request.status}` : 'an unknown response';
        reject(uploadError(code ? `Storage rejected the upload (${status}: ${code}).` : `Storage rejected the upload (${status}).`, 'UPLOAD_STORAGE_REJECTED', request.status));
        return;
      }
      resolve({ objectKey: upload.objectKey, uploadToken: upload.uploadToken, contentType: upload.contentType });
    };
    request.send(file);
  });
}
