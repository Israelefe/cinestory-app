import api from '../services/api.js';
import { uploadR2Object } from './r2Upload.js';

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
  const errors = [];
  const successfulAssets = [];
  let firstSignature = null;
  let concurrency = 2;
  if (files.length) {
    onProgress(0, { index: 0, file: files[0], status: 'starting', loaded: 0, total: files[0].size });
    try {
      const signed = await api.post(`/v1/deliveries/${deliveryId}/uploads/sign`, { contentType: files[0].type });
      firstSignature = signed.data.data;
      const serverLimit = Number(firstSignature.maxConcurrentUploads);
      concurrency = Number.isInteger(serverLimit) ? Math.max(1, Math.min(6, serverLimit)) : 2;
    } catch {
      // Let the normal per-file retry path request a fresh signature.
    }
  }

  await pool(files, concurrency, async (file, index) => {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        onProgress(Math.round((loadedBytes.reduce((sum, value) => sum + value, 0) / totalBytes) * 100), { index, file, status: attempt > 0 ? 'starting' : 'starting', loaded: 0, total: file.size });
        let signature;
        if (index === 0 && attempt === 0 && firstSignature) signature = firstSignature;
        else {
          const signResponse = await api.post(`/v1/deliveries/${deliveryId}/uploads/sign`, { contentType: file.type });
          signature = signResponse.data.data;
        }
        await uploadR2Object(signature, file, progress => {
          const transferProgress = Math.min(progress, Math.max(0, file.size * 0.98));
          report(index, transferProgress);
          onProgress(Math.round((loadedBytes.reduce((sum, value) => sum + value, 0) / totalBytes) * 100), { index, file, status: 'uploading', loaded: transferProgress, total: file.size });
        });
        const confirmed = await api.post(`/v1/deliveries/${deliveryId}/uploads/confirm`, { objectKey: signature.objectKey, uploadToken: signature.uploadToken, resourceType: 'image', originalFilename: file.name });
        report(index, file.size);
        completed += 1;
        onProgress(Math.round((loadedBytes.reduce((sum, value) => sum + value, 0) / totalBytes) * 100), { index, file, status: 'complete', loaded: file.size, total: file.size, completed, count: files.length });
        successfulAssets.push(confirmed.data.data);
        return confirmed.data.data;
      } catch (err) {
        if (attempt < maxRetries) {
          console.warn(`[upload] Retrying ${file.name} (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        console.error(`[upload] Failed ${file.name}:`, err.message);
        errors.push({ file, index, error: err });
        onProgress(Math.round((loadedBytes.reduce((sum, value) => sum + value, 0) / totalBytes) * 100), { index, file, status: 'failed', error: err.message, loaded: 0, total: file.size });
      }
    }
  });

  if (errors.length && successfulAssets.length === 0) {
    throw new Error(errors[0].error?.message || 'Could not upload any photographs. Check your connection and try again.');
  }

  return { successfulAssets, errors, completed, total: files.length };
}

export async function uploadDeliverySoundtrack(deliveryId, file, title) {
  if (!/\.(mp3|wav|m4a|ogg|aac)$/i.test(file?.name || '')) throw new Error('Choose an MP3, WAV, M4A, OGG, or AAC music file.');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a music file no larger than 20 MB.');
  const signResponse = await api.post(`/v1/deliveries/${deliveryId}/soundtrack/sign`, { contentType: file.type || 'audio/mpeg' });
  const signature = signResponse.data.data;
  await uploadR2Object(signature, file);
  const confirmed = await api.post(`/v1/deliveries/${deliveryId}/soundtrack/confirm`, { objectKey: signature.objectKey, uploadToken: signature.uploadToken, originalFilename: file.name, title: title || file.name.replace(/\.[^.]+$/, ''), rightsConfirmed: true });
  return confirmed.data.data;
}
