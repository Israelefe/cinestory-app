import api from '../services/api.js';
import { uploadR2Object } from './r2Upload.js';

const MAX_SIMULTANEOUS_PHOTO_UPLOADS = 2;

function uploadErrorMessage(error) {
  const message = error?.response?.data?.message || error?.message || 'The upload could not be completed.';
  return String(message).trim().slice(0, 180);
}

export async function uploadDeliveryPhotosV3(deliveryId, files, onProgress = () => {}) {
  const outcomes = new Array(files.length);
  const loaded = new Array(files.length).fill(0);
  const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
  let highestPercent = 0;
  let cursor = 0;
  function report(index, value, status, details = {}) {
    loaded[index] = Math.max(0, Math.min(files[index].size, value));
    const currentPercent = Math.round(loaded.reduce((sum, part) => sum + part, 0) / total * 100);
    highestPercent = Math.max(highestPercent, currentPercent);
    onProgress(highestPercent, { index, file: files[index], status, loaded: loaded[index], total: files[index].size, ...details });
  }
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index];
      const uploadId = crypto.randomUUID();
      let lastError = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          report(index, loaded[index], attempt === 0 ? 'starting' : 'retrying', attempt === 0 ? { attempt: 1 } : { attempt: attempt + 1, error: lastError });
          let payload;
          let signature;
          if (attempt === 0) {
            const signed = await api.post('/v1/deliveries/' + deliveryId + '/uploads/sign', { uploadId, contentType: file.type });
            signature = signed.data.data;
          } else {
            const recovered = await api.post('/v1/deliveries/' + deliveryId + '/uploads/recover', { uploadId, contentType: file.type });
            if (recovered.data.data.asset) {
              outcomes[index] = { file, asset: recovered.data.data.asset };
              report(index, file.size, 'complete');
              break;
            }
            payload = recovered.data.data.uploaded;
            signature = recovered.data.data.signature;
          }
          if (!payload) payload = await uploadR2Object(signature, file, amount => report(index, Math.min(amount, file.size * .98), 'uploading'));
          const confirmed = await api.post('/v1/deliveries/' + deliveryId + '/uploads/confirm', { objectKey: payload.objectKey || payload.public_id || signature.objectKey, uploadToken: signature.uploadToken, resourceType: 'image', originalFilename: file.name, uploadId });
          outcomes[index] = { file, asset: confirmed.data.data };
          report(index, file.size, 'complete');
          break;
        } catch (error) {
          lastError = uploadErrorMessage(error);
          loaded[index] = 0;
          if (attempt < 2) {
            report(index, 0, 'retrying', { attempt: attempt + 2, error: lastError });
            await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
          } else {
            outcomes[index] = { file, error };
            report(index, 0, 'failed', { attempt: attempt + 1, error: lastError });
          }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_SIMULTANEOUS_PHOTO_UPLOADS, files.length) }, worker));
  const errors = outcomes.map((item, index) => item.error ? { file: item.file, index, error: item.error } : null).filter(Boolean);
  return { errors, successfulAssets: outcomes.filter(item => item.asset).map(item => item.asset), completed: outcomes.length - errors.length, total: outcomes.length };
}
