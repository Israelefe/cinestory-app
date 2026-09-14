import crypto from 'crypto';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { signedImageUrl } from './deliveryMedia.service.js';

function ready() {
  if (!configureCloudinary()) throw Object.assign(new Error('Personal image storage is temporarily unavailable.'), { status: 503 });
}

function folder(userId) { return `veylo/users/${userId}/library`; }

export function createStorageUploadSignature(userId) {
  ready();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, folder: folder(userId), public_id: crypto.randomUUID(), type: 'authenticated', overwrite: false, unique_filename: false, allowed_formats: ['jpg', 'jpeg', 'png', 'webp'], eager: 'c_limit,w_1600/f_auto,q_auto:good|c_fill,w_480,h_600,g_auto/f_auto,q_auto:eco' };
  return { ...params, signature: cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET), apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME };
}

export async function confirmStorageUpload(userId, data) {
  ready();
  if (!String(data.publicId).startsWith(`${folder(userId)}/`)) throw Object.assign(new Error('That upload does not belong to your image library.'), { status: 403 });
  const expected = cloudinary.utils.api_sign_request({ public_id: data.publicId, version: Number(data.version) }, process.env.CLOUDINARY_API_SECRET);
  const left = Buffer.from(expected); const right = Buffer.from(String(data.signature || ''));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw Object.assign(new Error('Cloudinary could not verify that upload.'), { status: 400 });
  return cloudinary.api.resource(data.publicId, { resource_type: 'image', type: 'authenticated' });
}

export async function removeStorageAsset(publicId) {
  ready();
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated', invalidate: true });
}

export function storageAssetUrls(publicId) {
  return { url: signedImageUrl(publicId), thumbnailUrl: signedImageUrl(publicId, { thumbnail: true }), downloadUrl: signedImageUrl(publicId, { width: 8000, attachment: true }) };
}
