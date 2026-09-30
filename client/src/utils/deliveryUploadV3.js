import api from '../services/api.js';

const MAX_SIMULTANEOUS_PHOTO_UPLOADS = 6;

function transfer(url, fields, file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', fields.apiKey);
    ['timestamp', 'signature', 'folder', 'public_id', 'type', 'overwrite', 'unique_filename', 'allowed_formats', 'eager'].forEach(key => {
      const value = fields[key];
      if (value !== undefined && value !== null) form.append(key, Array.isArray(value) ? value.join(',') : String(value));
    });
    request.open('POST', url);
    request.responseType = 'json';
    request.timeout = 120000;
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded); };
    request.onerror = () => reject(new Error('The upload connection was interrupted.'));
    request.ontimeout = () => reject(new Error('The upload took too long.'));
    request.onload = () => {
      const data = request.response || {};
      if (request.status < 200 || request.status >= 300) reject(new Error(data.error?.message || 'The photograph did not upload.'));
      else resolve(data);
    };
    request.send(form);
  });
}

export async function uploadDeliveryPhotosV3(deliveryId, files, onProgress = () => {}) {
  const outcomes = new Array(files.length);
  const loaded = new Array(files.length).fill(0);
  const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
  let cursor = 0;
  function report(index, value, status) {
    loaded[index] = Math.max(0, Math.min(files[index].size, value));
    onProgress(Math.round(loaded.reduce((sum, part) => sum + part, 0) / total * 100), { index, file: files[index], status, loaded: loaded[index], total: files[index].size });
  }
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index];
      const uploadId = crypto.randomUUID();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          report(index, loaded[index], 'starting');
          let payload;
          let signature;
          if (attempt === 0) {
            const signed = await api.post('/v1/deliveries/' + deliveryId + '/uploads/sign', { uploadId });
            signature = signed.data.data;
          } else {
            const recovered = await api.post('/v1/deliveries/' + deliveryId + '/uploads/recover', { uploadId });
            if (recovered.data.data.asset) {
              outcomes[index] = { file, asset: recovered.data.data.asset };
              report(index, file.size, 'complete');
              break;
            }
            payload = recovered.data.data.uploaded;
            signature = recovered.data.data.signature;
          }
          if (!payload) payload = await transfer('https://api.cloudinary.com/v1_1/' + signature.cloudName + '/image/upload', signature, file, amount => report(index, Math.min(amount, file.size * .98), 'uploading'));
          const confirmed = await api.post('/v1/deliveries/' + deliveryId + '/uploads/confirm', { publicId: payload.public_id, version: payload.version, signature: payload.signature, resourceType: 'image', originalFilename: file.name, uploadId });
          outcomes[index] = { file, asset: confirmed.data.data };
          report(index, file.size, 'complete');
          break;
        } catch (error) {
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
          else { outcomes[index] = { file, error }; report(index, 0, 'failed'); }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_SIMULTANEOUS_PHOTO_UPLOADS, files.length) }, worker));
  const errors = outcomes.map((item, index) => item.error ? { file: item.file, index, error: item.error } : null).filter(Boolean);
  return { errors, successfulAssets: outcomes.filter(item => item.asset).map(item => item.asset), completed: outcomes.length - errors.length, total: outcomes.length };
}
