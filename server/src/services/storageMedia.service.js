import crypto from 'node:crypto';
import { createR2Upload, deleteR2Object, deleteR2Prefix, getR2ObjectBuffer, headR2Object, prepareR2Image, presignedR2Get, r2Configured, verifyUploadToken, MAX_IMAGE_BYTES } from './r2.service.js';
import { signedImageUrl } from './deliveryMedia.service.js';

export const STORAGE_RAW_FORMATS = ['arw', 'cr2', 'cr3', 'dng', 'nef', 'nrw', 'orf', 'rw2', 'raf', 'pef', 'srw', '3fr', 'iiq', 'mos', 'mef', 'mrw', 'rwl', 'x3f'];

function ready() {
  if (!r2Configured()) throw Object.assign(new Error('Personal image storage is temporarily unavailable.'), { status: 503, code: 'R2_NOT_CONFIGURED' });
}

export function storageFolder(userId) { return `veylo/users/${userId}/library`; }

export function createStorageUploadSignature(userId, { resourceType = 'image', format = '', contentType = '' } = {}) {
  if (!['image', 'raw'].includes(resourceType)) throw Object.assign(new Error('That file type is not supported.'), { status: 400 });
  const rawFormat = String(format || '').toLowerCase();
  if (resourceType === 'raw' && !STORAGE_RAW_FORMATS.includes(rawFormat)) throw Object.assign(new Error('That camera RAW format is not supported.'), { status: 400 });
  ready();
  const key = `${storageFolder(userId)}/${crypto.randomUUID()}`;
  const mime = resourceType === 'raw' ? 'application/octet-stream' : String(contentType || 'image/jpeg').toLowerCase();
  if (resourceType === 'image' && !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw Object.assign(new Error('Use a JPEG, PNG, or WebP photograph.'), { status: 400 });
  const signature = createR2Upload({ key, userId, contentType: mime, resourceType, maxBytes: MAX_IMAGE_BYTES });
  return { ...signature, resourceType, format: rawFormat, maxBytes: MAX_IMAGE_BYTES };
}

export async function confirmStorageUpload(userId, data, { resourceType = data.resourceType || 'image' } = {}) {
  ready();
  const key = String(data.objectKey || data.publicId || '');
  if (!key.startsWith(`${storageFolder(userId)}/`) || key.length > 1000) throw Object.assign(new Error('That upload does not belong to your image library.'), { status: 403 });
  const claims = verifyUploadToken(data.uploadToken || data.signature, { key, userId, resourceType });
  const head = await headR2Object(key);
  if (!head.bytes || head.bytes > Number(claims.maxBytes || MAX_IMAGE_BYTES)) {
    await removeStorageAsset(key, resourceType).catch(() => {});
    throw Object.assign(new Error(resourceType === 'raw' ? 'Choose a supported camera RAW file that is 100 MB or smaller.' : 'Choose a JPEG, PNG, or WebP photograph that is 100 MB or smaller.'), { status: 413, code: 'UPLOAD_TOO_LARGE' });
  }
  if (head.contentType !== claims.contentType) throw Object.assign(new Error('The uploaded file type did not match the upload request.'), { status: 400, code: 'UPLOAD_TYPE_MISMATCH' });
  const format = resourceType === 'raw'
    ? String(data.format || '').toLowerCase()
    : head.contentType.split('/').at(-1)?.replace('jpeg', 'jpg');
  if (resourceType === 'raw' && !STORAGE_RAW_FORMATS.includes(format)) throw Object.assign(new Error('That camera RAW format is not supported.'), { status: 400 });
  if (resourceType === 'image' && !['jpg', 'png', 'webp'].includes(format)) throw Object.assign(new Error('Use a JPEG, PNG, or WebP photograph.'), { status: 400 });
  let image = {};
  let etag = head.etag;
  let hashAlgorithm = head.etag ? 'r2-etag' : undefined;
  if (resourceType === 'image') {
    image = await prepareR2Image(key, { maxBytes: Number(claims.maxBytes || MAX_IMAGE_BYTES) });
    const source = await getR2ObjectBuffer(key, { maxBytes: Number(claims.maxBytes || MAX_IMAGE_BYTES) });
    etag = crypto.createHash('sha256').update(source.buffer).digest('hex');
    hashAlgorithm = 'sha256';
  }
  return { public_id: key, objectKey: key, format, rawFormat: resourceType === 'raw' ? format : undefined, bytes: head.bytes, width: image.width, height: image.height, etag, hashAlgorithm, contentType: head.contentType };
}

export async function removeStorageAsset(publicId, resourceType = 'image') {
  if (!publicId) return true;
  await deleteR2Object(publicId);
  if (resourceType === 'image') await deleteR2Prefix(`${publicId}.__veylo/`);
  return true;
}

export function storageAssetUrls(publicId, { rawPublicId, originalFilename = 'photograph', format = 'jpg', rawFormat } = {}) {
  const filename = String(originalFilename || 'photograph').replace(/[\r\n"\\]/g, '_').slice(0, 150);
  const originalName = filename.includes('.') ? filename : `${filename}.${rawPublicId ? rawFormat || 'raw' : format || 'jpg'}`;
  return {
    url: signedImageUrl(publicId),
    thumbnailUrl: signedImageUrl(publicId, { thumbnail: true }),
    downloadUrl: rawPublicId
      ? presignedR2Get(rawPublicId, { downloadFilename: originalName })
      : signedImageUrl(publicId, { original: true, attachment: true, downloadFilename: originalName })
  };
}
