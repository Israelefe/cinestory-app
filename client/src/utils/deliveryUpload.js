import api from '../services/api.js';
import { uploadR2Object } from './r2Upload.js';
import { uploadDeliveryPhotosV3 } from './deliveryUploadV3.js';

export async function uploadDeliveryPhotos(deliveryId, files, onProgress = () => {}) {
  const result = await uploadDeliveryPhotosV3(deliveryId, files, onProgress);
  if (result.errors.length && !result.completed) throw result.errors[0].error;
  return result;
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
