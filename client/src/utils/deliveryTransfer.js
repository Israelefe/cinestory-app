import api from '../services/api.js';

const keyFor = file => `${file.name}:${file.size}:${file.lastModified}`;
function readManifest(deliveryId) { try { return JSON.parse(sessionStorage.getItem(`delivery-upload:${deliveryId}`) || '{}'); } catch { return {}; } }
function storeManifest(deliveryId, manifest) { try { sessionStorage.setItem(`delivery-upload:${deliveryId}`, JSON.stringify(manifest)); } catch { /* Transfers can continue if session storage is full. */ } }
function transfer(file, signed, progress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries({ api_key: signed.apiKey, timestamp: signed.timestamp, signature: signed.signature, folder: signed.folder, public_id: signed.public_id, type: signed.type, overwrite: signed.overwrite, unique_filename: signed.unique_filename, allowed_formats: signed.allowed_formats?.join(','), eager: signed.eager })) {
      if (value !== undefined) form.append(key, String(value));
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`);
    xhr.timeout = 120000; xhr.responseType = 'json';
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.min(file.size * .98, event.loaded)); };
    xhr.onerror = xhr.ontimeout = () => reject(new Error('The upload connection was interrupted.'));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response) : reject(new Error('The photograph could not finish uploading.'));
    xhr.send(form);
  });
}
export async function transferDeliveryPhotos(deliveryId, files, { startOrder = 0, onProgress = () => {}, onConfirmed = () => {} } = {}) {
  const manifest = readManifest(deliveryId);
  const loaded = files.map(() => 0);
  const statuses = files.map(() => 'waiting');
  const totalBytes = files.reduce((n, file) => n + file.size, 0) || 1;
  const errors = [];
  const report = (index, status, bytes = loaded[index]) => {
    statuses[index] = status; loaded[index] = bytes;
    onProgress({ percent: Math.round(loaded.reduce((n, size) => n + size, 0) / totalBytes * 100), completed: statuses.filter(s => s === 'complete').length, total: files.length, files: files.map((file, i) => ({ name: file.name, status: statuses[i] })) });
  };
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++; const file = files[index]; const key = keyFor(file);
      const record = manifest[key] || { uploadId: crypto.randomUUID(), sortOrder: startOrder + index };
      manifest[key] = record;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (record.confirmed) { report(index, 'complete', file.size); break; }
          report(index, 'uploading');
          if (!record.uploaded && record.attempted) {
            const recovered = (await api.post(`/v1/deliveries/${deliveryId}/uploads/recover`, { uploadId: record.uploadId })).data.data;
            record.uploaded = recovered.uploaded;
            if (recovered.signature) record.signature = recovered.signature;
          }
          if (!record.signature && !record.uploaded) { record.signature = (await api.post(`/v1/deliveries/${deliveryId}/uploads/sign`, { uploadId: record.uploadId })).data.data; storeManifest(deliveryId, manifest); }
          if (!record.uploaded) { record.attempted = true; storeManifest(deliveryId, manifest); record.uploaded = await transfer(file, record.signature, bytes => report(index, 'uploading', bytes)); storeManifest(deliveryId, manifest); }
          report(index, 'saving', file.size * .98);
          const uploaded = record.uploaded;
          const result = await api.post(`/v1/deliveries/${deliveryId}/uploads/confirm`, { publicId: uploaded.public_id, version: uploaded.version, signature: uploaded.signature, resourceType: 'image', originalFilename: file.name, uploadId: record.uploadId, sortOrder: record.sortOrder });
          record.confirmed = true; delete record.signature; delete record.uploaded; storeManifest(deliveryId, manifest);
          report(index, 'complete', file.size); onConfirmed(result.data.data); break;
        } catch (error) {
          if (attempt === 2) { errors.push({ file, message: 'This file has not finished uploading.' }); report(index, 'needs-upload', 0); }
          else await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  return errors;
}
