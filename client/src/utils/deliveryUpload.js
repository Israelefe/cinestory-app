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
  let completed = 0;
  return pool(files, 3, async file => {
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
    const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || `Upload failed for ${file.name}.`);
    const confirmed = await api.post(`/v1/deliveries/${deliveryId}/uploads/confirm`, { publicId: result.public_id, version: result.version, signature: result.signature, resourceType: 'image', originalFilename: file.name });
    completed += 1;
    onProgress(Math.round((completed / files.length) * 100));
    return confirmed.data.data;
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
