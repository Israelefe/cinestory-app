import crypto from 'crypto';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';

function ready() {
  if (!configureCloudinary()) {
    const error = new Error('Photo uploads are temporarily unavailable.');
    error.status = 503;
    throw error;
  }
}

export function deliveryFolder(userId, deliveryId) {
  return `veylo/users/${userId}/deliveries/${deliveryId}`;
}

export function createUploadSignature({ userId, deliveryId, resourceType = 'image' }) {
  ready();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = deliveryFolder(userId, deliveryId);
  const publicId = crypto.randomUUID();
  const params = resourceType === 'image'
    ? { timestamp, folder, public_id: publicId, type: 'authenticated', overwrite: false, unique_filename: false, allowed_formats: ['jpg', 'jpeg', 'png', 'webp'], eager: 'c_limit,w_1600/f_auto,q_auto:good|c_fill,w_800,h_1000,g_auto/f_auto,q_auto:good' }
    : { timestamp, folder: `${folder}/audio`, public_id: publicId, type: 'authenticated', overwrite: false, unique_filename: false, allowed_formats: ['mp3', 'wav', 'm4a', 'ogg', 'aac'] };
  return { ...params, signature: cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET), apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME, resourceType };
}

export async function confirmUploadedAsset({ userId, deliveryId, publicId, version, signature, resourceType = 'image' }) {
  ready();
  const expectedPrefix = `${deliveryFolder(userId, deliveryId)}/`;
  if (!String(publicId).startsWith(expectedPrefix)) {
    const error = new Error('That upload does not belong to this delivery.');
    error.status = 403;
    throw error;
  }
  const expected = cloudinary.utils.api_sign_request({ public_id: publicId, version: Number(version) }, process.env.CLOUDINARY_API_SECRET);
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature || ''));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    const error = new Error('Cloudinary could not verify that upload.');
    error.status = 400;
    throw error;
  }
  return cloudinary.api.resource(publicId, { resource_type: resourceType, type: 'authenticated' });
}

export function signedImageUrl(publicId, { width = 1600, thumbnail = false, attachment = false, original = false, resourceType = 'image', format } = {}) {
  ready();
  const transformation = resourceType !== 'image' ? undefined : original
    ? undefined
    : thumbnail
      ? [{ crop: 'fill', width: 800, height: 1000, gravity: 'auto', quality: 'auto:good', fetch_format: 'auto' }]
      : [{ crop: 'limit', width, quality: 'auto:good', fetch_format: 'auto' }];
  const audioFormat = resourceType === 'video' ? (format || 'mp3') : format;
  return cloudinary.url(publicId, { secure: true, resource_type: resourceType, type: 'authenticated', sign_url: true, transformation, flags: attachment ? 'attachment' : undefined, format: audioFormat });
}

export function signedArchiveUrl(publicIds, filename = 'veylo-gallery', prefix = '') {
  ready();
  const selection = prefix ? { prefixes: [prefix] } : { public_ids: publicIds };
  return cloudinary.utils.download_zip_url({ ...selection, resource_type: 'image', type: 'authenticated', target_format: 'zip', flatten_folders: true, use_original_filename: true, target_public_id: String(filename).replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) });
}

export function signedOgImageUrl(publicId) {
  ready();
  return cloudinary.url(publicId, { secure: true, resource_type: 'image', type: 'authenticated', sign_url: true, transformation: [{ crop: 'fill', width: 1200, height: 630, gravity: 'auto', quality: 'auto:good', fetch_format: 'jpg' }] });
}

export async function removeDeliveryMedia(userId, deliveryId) {
  ready();
  const prefix = deliveryFolder(userId, deliveryId);
  await Promise.all([
    cloudinary.api.delete_resources_by_prefix(prefix, { resource_type: 'image', type: 'authenticated', invalidate: true }),
    cloudinary.api.delete_resources_by_prefix(prefix, { resource_type: 'video', type: 'authenticated', invalidate: true })
  ]);
  const folders = [`${prefix}/narration`, `${prefix}/audio`, prefix];
  for (const folder of folders) await cloudinary.api.delete_folder(folder).catch(error => { if (error?.http_code !== 404) throw error; });
}

export async function removeDeliveryAudio(publicId) {
  ready();
  return cloudinary.uploader.destroy(publicId, { resource_type: 'video', type: 'authenticated', invalidate: true });
}

export async function removeDeliveryImage(publicId) {
  ready();
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated', invalidate: true });
}

export async function copyStorageImageToDelivery({ sourceUrl, userId, deliveryId }) {
  ready();
  return cloudinary.uploader.upload(sourceUrl, { resource_type: 'image', type: 'authenticated', folder: deliveryFolder(userId, deliveryId), overwrite: false, unique_filename: true, eager: 'c_limit,w_1600/f_auto,q_auto:good|c_fill,w_480,h_600,g_auto/f_auto,q_auto:eco' });
}
