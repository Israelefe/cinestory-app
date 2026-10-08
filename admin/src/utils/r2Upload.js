export function uploadR2File(upload, file) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(upload.uploadUrl); } catch { return reject(new Error('This upload could not be prepared.')); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.r2.cloudflarestorage.com')) return reject(new Error('This upload could not be prepared.'));
    const request = new XMLHttpRequest();
    request.open('PUT', url.toString());
    request.timeout = 15 * 60 * 1000;
    for (const [name, value] of Object.entries(upload.uploadHeaders || {})) request.setRequestHeader(name, value);
    request.onerror = () => reject(new Error('The upload connection was interrupted. Please retry.'));
    request.ontimeout = () => reject(new Error('The upload took too long. Please retry.'));
    request.onabort = () => reject(new Error('The upload was cancelled.'));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('Storage could not accept this file. Please retry.'));
    request.send(file);
  });
}
