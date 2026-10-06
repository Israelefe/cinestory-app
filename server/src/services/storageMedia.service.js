import crypto from 'crypto';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { signedImageUrl } from './deliveryMedia.service.js';

export const STORAGE_RAW_FORMATS = ['arw', 'cr2', 'cr3', 'dng', 'nef', 'nrw', 'orf', 'rw2', 'raf', 'pef', 'srw', '3fr', 'iiq', 'mos', 'mef', 'mrw', 'rwl', 'x3f'];

function ready() {
  if (!configureCloudinary()) throw Object.assign(new Error('Personal image storage is temporarily unavailable.'), { status: 503 });
}

export function storageFolder(userId) { return `veylo/users/${userId}/library`; }

export function createStorageUploadSignature(userId, { resourceType = 'image', format = '' } = {}) {
  if (!['image', 'raw'].includes(resourceType)) throw Object.assign(new Error('That file type is not supported.'), { status: 400 });
  const rawFormat = String(format || '').toLowerCase();
  if (resourceType === 'raw' && !STORAGE_RAW_FORMATS.includes(rawFormat)) throw Object.assign(new Error('That camera RAW format is not supported.'), { status: 400 });
  ready();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    folder: storageFolder(userId),
    public_id: `${crypto.randomUUID()}${resourceType === 'raw' ? `.${rawFormat}` : ''}`,
    type: 'authenticated',
    overwrite: false,
    unique_filename: false,
    allowed_formats: resourceType === 'raw'
      ? STORAGE_RAW_FORMATS
      : ['jpg', 'jpeg', 'png', 'webp'],
    ...(resourceType === 'image' ? { eager: 'c_limit,w_1600/f_auto,q_auto:good|c_fill,w_480,h_600,g_auto/f_auto,q_auto:eco' } : {})
  };
  return { ...params, resourceType, signature: cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET), apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME };
}

export async function confirmStorageUpload(userId, data, { resourceType = data.resourceType || 'image' } = {}) {
  ready();
  if (!String(data.publicId).startsWith(`${storageFolder(userId)}/`)) throw Object.assign(new Error('That upload does not belong to your image library.'), { status: 403 });
  const expected = cloudinary.utils.api_sign_request({ public_id: data.publicId, version: Number(data.version) }, process.env.CLOUDINARY_API_SECRET);
  const left = Buffer.from(expected); const right = Buffer.from(String(data.signature || ''));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw Object.assign(new Error('Cloudinary could not verify that upload.'), { status: 400 });
  return cloudinary.api.resource(data.publicId, { resource_type: resourceType, type: 'authenticated' });
}

export async function removeStorageAsset(publicId, resourceType = 'image') {
  ready();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true });
}

export function storageAssetUrls(publicId, { rawPublicId } = {}) {
  return {
    url: signedImageUrl(publicId),
    thumbnailUrl: signedImageUrl(publicId, { thumbnail: true }),
    downloadUrl: rawPublicId
      ? signedImageUrl(rawPublicId, { resourceType: 'raw', original: true })
      : signedImageUrl(publicId, { width: 8000, attachment: true, original: true })
  };
}
