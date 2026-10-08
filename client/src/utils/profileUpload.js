import api from '../services/api.js';
import { uploadR2Object } from './r2Upload.js';

export async function uploadProfileImage(file) {
  const signed = await api.post('/v1/onboarding/logo/sign', { contentType: file.type });
  const uploaded = await uploadR2Object(signed.data.data, file);
  return api.post('/v1/onboarding/logo/confirm', uploaded, { timeout: 120000 });
}
