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
        if (request.status === 413) {
          reject(new Error('This file is too large to upload.'));
          return;
        }
        const code = request.responseText?.match(/<Code>([^<]{1,100})<\/Code>/i)?.[1]?.trim();
        const status = request.status ? `HTTP ${request.status}` : 'an unknown response';
        reject(new Error(code ? `Storage rejected the upload (${status}: ${code}).` : `Storage rejected the upload (${status}).`));
        return;
      }
      resolve({ objectKey: upload.objectKey, uploadToken: upload.uploadToken, contentType: upload.contentType });
    };
    request.send(file);
  });
}
