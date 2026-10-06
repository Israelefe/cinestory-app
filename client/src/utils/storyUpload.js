import api from '../services/api.js';
import { uploadR2Object } from './r2Upload.js';

export async function uploadStoryMedia(file, resourceType = 'image', onProgress = () => {}) {
  const maxBytes = 30 * 1024 * 1024;
  if (!file?.size || file.size > maxBytes) throw new Error('Choose a file up to 30 MB.');
  const contentType = String(file.type || '').toLowerCase();
  const allowed = resourceType === 'image'
    ? ['image/jpeg', 'image/png', 'image/webp']
    : ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4'];
  if (!allowed.includes(contentType)) throw new Error(resourceType === 'image' ? 'Choose a JPEG, PNG, or WebP photograph.' : 'Choose an MP3, WAV, OGG, or M4A audio file.');
  const signature = (await api.post('/v1/stories/uploads/sign', { resourceType, contentType })).data.data;
  await uploadR2Object(signature, file, (loaded, total) => onProgress(Math.round((loaded / (total || file.size)) * 100)));
  const result = await api.post('/v1/stories/uploads/confirm', { objectKey: signature.objectKey, uploadToken: signature.uploadToken, resourceType });
  return result.data.data;
}
