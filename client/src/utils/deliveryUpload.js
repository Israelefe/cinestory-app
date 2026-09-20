import api from '../services/api.js';

async function pool(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function uploadDeliveryPhotos(deliveryId, files, onProgress = () => {}) {
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0) || files.length;
  const loadedBytes = new Array(files.length).fill(0);
  const report = (index, loaded) => {
    loadedBytes[index] = Math.max(0, Math.min(Number(files[index].size || 0), loaded));
    const uploaded = loadedBytes.reduce((sum, value) => sum + value, 0);
    onProgress(Math.round((uploaded / totalBytes) * 100), { index, loaded: loadedBytes[index], total: Number(files[index].size || 0) });
  };
  let completed = 0;
  return pool(files, 3, async (file, index) => {
    onProgress(Math.round((loadedBytes.reduce((sum, value) => sum + value, 0) / totalBytes) * 100), { index, file, status: 'starting', loaded: 0, total: file.size });
    const signResponse = await api.post(`/v1/deliveries/${deliveryId}/uploads/sign`);
    const signature = signResponse.data.data;
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signature.apiKey);
    form.append('timestamp', signature.timestamp);
    form.append('signature', signature.signature);
    form.append('folder', signature.folder);
    form.append('public_id', signature.public_id);
    form.append('type', signature.type);
    form.append('overwrite', String(signature.overwrite));
    form.append('unique_filename', String(signature.unique_filename));
    if (signature.allowed_formats) form.append('allowed_formats', signature.allowed_formats.join(','));
    if (signature.eager) form.append('eager', signature.eager);
    const result = await uploadToCloudinary(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, form, progress => {
      const transferProgress = Math.min(progress, Math.max(0, file.size * 0.98));
      report(index, transferProgress);
      onProgress(Math.round((loadedBytes.reduce((sum, value) => sum + value, 0) / totalBytes) * 100), { index, file, status: 'uploading', loaded: transferProgress, total: file.size });
    });
    const response = result.response;
    const payload = result.body;
    if (!response.ok) throw new Error(payload?.error?.message || `Upload failed for ${file.name}.`);
    const confirmed = await api.post(`/v1/deliveries/${deliveryId}/uploads/confirm`, { publicId: payload.public_id, version: payload.version, signature: payload.signature, resourceType: 'image', originalFilename: file.name });
    report(index, file.size);
    completed += 1;
    onProgress(Math.round((loadedBytes.reduce((sum, value) => sum + value, 0) / totalBytes) * 100), { index, file, status: 'complete', loaded: file.size, total: file.size, completed, count: files.length });
    return confirmed.data.data;
  });
}

function uploadToCloudinary(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.timeout = 120000;
    request.responseType = 'json';
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onerror = () => reject(new Error('The upload connection was interrupted.'));
    request.ontimeout = () => reject(new Error('The upload took too long.'));
    request.onload = () => {
      const body = request.response || (() => { try { return JSON.parse(request.responseText || '{}'); } catch { return {}; } })();
      resolve({ response: request, body });
    };
    request.send(form);
  });
}

export async function uploadDeliverySoundtrack(deliveryId, file, title) {
  const signResponse = await api.post(`/v1/deliveries/${deliveryId}/soundtrack/sign`);
  const signature = signResponse.data.data;
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', signature.timestamp);
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.public_id);
  form.append('type', signature.type);
  form.append('overwrite', String(signature.overwrite));
  form.append('unique_filename', String(signature.unique_filename));
  if (signature.allowed_formats) form.append('allowed_formats', signature.allowed_formats.join(','));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/video/upload`, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || 'The soundtrack upload did not finish.');
  const confirmed = await api.post(`/v1/deliveries/${deliveryId}/soundtrack/confirm`, { publicId: result.public_id, version: result.version, signature: result.signature, originalFilename: file.name, title: title || file.name.replace(/\.[^.]+$/, ''), rightsConfirmed: true });
  return confirmed.data.data;
}
