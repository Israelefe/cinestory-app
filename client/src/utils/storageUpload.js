import api from '../services/api.js';

async function uploadOne(file, signature) {
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
  return result;
}

export async function uploadLibraryPhotos(files, { folder = 'All photographs', onProgress = () => {} } = {}) {
  const completed = [];
  for (let index = 0; index < files.length; index += 1) {
    const signResponse = await api.post('/v1/storage/uploads/sign');
    const uploaded = await uploadOne(files[index], signResponse.data.data);
    const response = await api.post('/v1/storage/uploads/confirm', {
      publicId: uploaded.public_id,
      version: uploaded.version,
      signature: uploaded.signature,
      originalFilename: files[index].name,
      folder,
      tags: []
    });
    completed.push(response.data.data);
    onProgress(Math.round(((index + 1) / files.length) * 100), files[index].name);
  }
  return completed;
}
