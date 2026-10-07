import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  copyR2Object, createR2Upload, deleteR2Object, deleteR2Prefix,
  headR2Object, imageVariantKey, prepareR2Image, presignedR2Get, r2Configured, verifyUploadToken
} from './r2.service.js';

export const MAX_DELIVERY_IMAGE_BYTES = 20_000_000;
const DELIVERY_IMAGE_WIDTHS = [400, 480, 640, 800, 960, 1024, 1200, 1600];

function deliveryImageWorkerConfig() {
  const baseUrl = String(process.env.R2_IMAGE_WORKER_URL || '').trim();
  const secret = String(process.env.R2_IMAGE_WORKER_SECRET || '');
  if (!baseUrl && !secret) return null;
  if (!baseUrl || secret.length < 32) {
    throw Object.assign(new Error('Delivery image previews are not configured correctly.'), { status: 503, code: 'DELIVERY_IMAGE_WORKER_CONFIG' });
  }
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw Object.assign(new Error('Delivery image previews are not configured correctly.'), { status: 503, code: 'DELIVERY_IMAGE_WORKER_CONFIG' }); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw Object.assign(new Error('Delivery image previews are not configured correctly.'), { status: 503, code: 'DELIVERY_IMAGE_WORKER_CONFIG' });
  }
  return { baseUrl: `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`, secret };
}

function signedDeliveryImageWorkerUrl(key, preset, lifetimeSeconds = 6 * 60 * 60) {
  const config = deliveryImageWorkerConfig();
  if (!config) return '';
  const claims = {
    iss: 'veylo-delivery-image',
    key: String(key || ''),
    preset,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', config.secret).update(payload).digest('base64url');
  return `${config.baseUrl}/v1/${payload}.${signature}`;
}

function normalizeImageFormat(value) {
  const format = String(value || '').toLowerCase().replace(/^image\//, '');
  if (format === 'jpg') return 'jpeg';
  return ['jpeg', 'png', 'webp'].includes(format) ? format : '';
}

async function getDeliveryImageInfo(key) {
  if (!deliveryImageWorkerConfig()) return null;
  const url = signedDeliveryImageWorkerUrl(key, 'info', 90);
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(45_000), headers: { Accept: 'application/json' } });
  } catch {
    throw Object.assign(new Error('Cloudflare could not check this photograph. Retry the upload.'), { status: 502, code: 'DELIVERY_IMAGE_INFO_FAILED' });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = /^[A-Z0-9_]{1,80}$/.test(result?.code || '') ? result.code : 'DELIVERY_IMAGE_INFO_FAILED';
    const message = typeof result?.message === 'string' ? result.message.slice(0, 180) : 'Cloudflare could not check this photograph. Retry the upload.';
    throw Object.assign(new Error(message), { status: response.status >= 400 && response.status <= 599 ? response.status : 502, code });
  }
  const format = normalizeImageFormat(result.format);
  const width = Number(result.width);
  const height = Number(result.height);
  if (!format || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw Object.assign(new Error('Use a still JPEG, PNG, or WebP photograph.'), { status: 400, code: 'UNSUPPORTED_IMAGE' });
  }
  return { format, width, height, bytes: Number(result.bytes) || 0 };
}

function unavailable() {
  return Object.assign(new Error('Photo uploads are temporarily unavailable.'), { status: 503, code: 'R2_NOT_CONFIGURED' });
}

export function storageProviderError(error) {
  const status = Number(error?.status);
  return { status: status >= 400 && status <= 599 ? status : undefined, code: /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'STORAGE_REQUEST_FAILED' };
}

export function deliveryFolder(userId, deliveryId) {
  return `veylo/users/${userId}/deliveries/${deliveryId}`;
}

function safeUploadId(value) {
  const candidate = String(value || crypto.randomUUID());
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(candidate)) throw Object.assign(new Error('That upload could not be prepared.'), { status: 400 });
  return candidate;
}

function defaultContentType(resourceType) {
  return resourceType === 'image' ? 'image/jpeg' : 'application/octet-stream';
}

export function createUploadSignature({ userId, deliveryId, resourceType = 'image', uploadId, contentType }) {
  if (!r2Configured()) throw unavailable();
  if (!['image', 'video'].includes(resourceType)) throw Object.assign(new Error('That file type is not supported.'), { status: 400 });
  const key = `${deliveryFolder(userId, deliveryId)}/${safeUploadId(uploadId)}`;
  const type = String(contentType || defaultContentType(resourceType)).trim().toLowerCase();
  if (resourceType === 'image' && !['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw Object.assign(new Error('Use a JPEG, PNG, or WebP photograph.'), { status: 400 });
  if (resourceType === 'video' && !/^audio\/(mpeg|wav|x-wav|mp4|ogg|aac|aiff|flac)$/.test(type)) throw Object.assign(new Error('Choose an MP3, WAV, M4A, OGG, or AAC music file.'), { status: 400 });
  const maxBytes = resourceType === 'image' ? MAX_DELIVERY_IMAGE_BYTES : 20 * 1024 * 1024;
  const maxConcurrentUploads = resourceType === 'image' && deliveryImageWorkerConfig() ? 6 : 2;
  return { ...createR2Upload({ key, userId, contentType: type, resourceType, maxBytes }), resourceType, maxConcurrentUploads };
}

export async function recoverImageUpload({ userId, deliveryId, uploadId, contentType }) {
  if (!r2Configured()) throw unavailable();
  const key = `${deliveryFolder(userId, deliveryId)}/${safeUploadId(uploadId)}`;
  try {
    const head = await headR2Object(key);
    const contentType = head.contentType || 'image/jpeg';
    const signature = createR2Upload({ key, userId, contentType, resourceType: 'image', maxBytes: MAX_DELIVERY_IMAGE_BYTES });
    return { uploaded: { public_id: key, objectKey: key }, signature };
  } catch (error) {
    if (error.status !== 404) throw error;
    return { uploaded: null, signature: createUploadSignature({ userId, deliveryId, uploadId, contentType, resourceType: 'image' }) };
  }
}

export async function confirmUploadedAsset({ userId, deliveryId, publicId, objectKey, uploadToken, signature, resourceType = 'image' }) {
  if (!r2Configured()) throw unavailable();
  const key = String(objectKey || publicId || '');
  const expectedPrefix = `${deliveryFolder(userId, deliveryId)}/`;
  if (!key.startsWith(expectedPrefix) || key.length > 1000) throw Object.assign(new Error('That upload does not belong to this delivery.'), { status: 403 });
  const token = uploadToken || signature;
  const claims = verifyUploadToken(token, { key, userId, resourceType });
  const metadata = await headR2Object(key);
  if (!metadata.bytes || metadata.bytes > Number(claims.maxBytes || 0)) {
    await deleteR2Object(key).catch(() => {});
    const maximumMb = Math.max(1, Math.floor(Number(claims.maxBytes || 0) / 1_000_000));
    throw Object.assign(new Error(resourceType === 'image' ? `Choose a photograph that is ${maximumMb} MB or smaller.` : `Choose a music file that is ${maximumMb} MB or smaller.`), { status: 413, code: 'UPLOAD_TOO_LARGE' });
  }
  if (metadata.contentType !== claims.contentType) throw Object.assign(new Error('The uploaded file type did not match the upload request.'), { status: 400, code: 'UPLOAD_TYPE_MISMATCH' });
  let imageInfo = {};
  let format = metadata.contentType.split('/').at(-1)?.replace('jpeg', 'jpg') || '';
  if (resourceType === 'image') {
    imageInfo = await getDeliveryImageInfo(key) || await prepareR2Image(key, { maxBytes: Number(claims.maxBytes) });
    format = imageInfo.format === 'jpeg' ? 'jpg' : imageInfo.format;
  } else {
    const mime = metadata.contentType.toLowerCase();
    format = ({ 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/aiff': 'aiff', 'audio/flac': 'flac' })[mime] || format;
  }
  const contentHash = resourceType === 'image' ? imageInfo.sha256 || metadata.etag : metadata.etag;
  return {
    public_id: key,
    objectKey: key,
    format,
    resource_type: resourceType,
    bytes: metadata.bytes,
    width: imageInfo.width,
    height: imageInfo.height,
    etag: contentHash,
    hashAlgorithm: resourceType === 'image' && imageInfo.sha256 ? 'sha256' : 'r2-etag',
    contentType: metadata.contentType
  };
}

export function signedImageUrl(publicId, { width = 1600, thumbnail = false, attachment = false, original = false, resourceType = 'image', format, downloadFilename } = {}) {
  if (!r2Configured()) throw unavailable();
  let key = String(publicId || '');
  if (!key) return '';
  if (resourceType === 'image' && !original) {
    const variant = thumbnail ? 'thumb' : DELIVERY_IMAGE_WIDTHS.find(candidate => candidate >= Number(width || 1600));
    if (variant) key = imageVariantKey(key, variant);
  }
  return presignedR2Get(key, { downloadFilename: attachment ? (downloadFilename || key.split('/').at(-1)) : '', expiresIn: 6 * 60 * 60 });
}

export function signedDeliveryImageUrl(publicId, { width = 1600, thumbnail = false, og = false, attachment = false, original = false, resourceType = 'image', format, downloadFilename } = {}) {
  if (resourceType !== 'image' || original || attachment) {
    return signedImageUrl(publicId, { width, thumbnail, attachment, original, resourceType, format, downloadFilename });
  }
  const workerConfig = deliveryImageWorkerConfig();
  if (!workerConfig) return signedImageUrl(publicId, { width, thumbnail, attachment, original, resourceType, format, downloadFilename });
  const preset = og ? 'og' : thumbnail ? 'thumb' : String(DELIVERY_IMAGE_WIDTHS.find(candidate => candidate >= Number(width || 1600)) || 1600);
  return signedDeliveryImageWorkerUrl(publicId, preset);
}

export function signedArchiveUrl(publicIds, filename = 'veylo-gallery') {
  if (!r2Configured()) throw unavailable();
  if (!Array.isArray(publicIds) || !publicIds.length || publicIds.length > 1000) throw Object.assign(new Error('No photographs are available for download.'), { status: 400 });
  const cleanName = String(filename).replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'veylo-gallery';
  const files = publicIds.map(item => typeof item === 'string'
    ? { key: item, name: item.split('/').at(-1) }
    : { key: String(item.key || item.publicId || ''), name: String(item.name || item.originalFilename || item.key || 'photograph') });
  const token = jwt.sign({ purpose: 'r2-gallery-archive', files, filename: cleanName }, process.env.JWT_SECRET, { expiresIn: '20m', issuer: 'veylo-r2-archive' });
  return `/api/v1/deliveries/public/archive?token=${encodeURIComponent(token)}`;
}

export function signedPreparedDeliveryImageUrl(publicId) { return signedDeliveryImageUrl(publicId, { width: 1600 }); }
export function signedOgImageUrl(publicId) {
  if (deliveryImageWorkerConfig()) return signedDeliveryImageWorkerUrl(publicId, 'og');
  return presignedR2Get(imageVariantKey(publicId, 'og'), { expiresIn: 6 * 60 * 60 });
}

export async function removeDeliveryMedia(userId, deliveryId) {
  return deleteR2Prefix(`${deliveryFolder(userId, deliveryId)}/`);
}
export async function removeDeliveryAudio(publicId) { return deleteR2Object(publicId); }
export async function removeDeliveryImage(publicId) {
  await Promise.all([deleteR2Object(publicId), deleteR2Prefix(`${publicId}.__veylo/`)]);
  return true;
}

export async function copyStorageImageToDelivery({ sourcePublicId, sourceUrl, userId, deliveryId }) {
  if (!r2Configured()) throw unavailable();
  const sourceKey = sourcePublicId || (() => {
    try { return new URL(sourceUrl).pathname.split('/').slice(2).join('/'); } catch { return ''; }
  })();
  if (!sourceKey) throw Object.assign(new Error('That library photograph could not be copied.'), { status: 400 });
  const sourceMetadata = await headR2Object(sourceKey);
  if (!sourceMetadata.bytes || sourceMetadata.bytes > MAX_DELIVERY_IMAGE_BYTES) {
    throw Object.assign(new Error('This library photograph is larger than 20 MB. Choose a smaller JPEG, PNG, or WebP copy to add it to a delivery.'), { status: 413, code: 'UPLOAD_TOO_LARGE' });
  }
  const key = `${deliveryFolder(userId, deliveryId)}/${crypto.randomUUID()}`;
  try {
    await copyR2Object(sourceKey, key);
    const prepared = await getDeliveryImageInfo(key) || await prepareR2Image(key);
    const copiedMetadata = await headR2Object(key);
    return { public_id: key, format: prepared.format === 'jpeg' ? 'jpg' : prepared.format, width: prepared.width, height: prepared.height, bytes: copiedMetadata.bytes, etag: prepared.sha256 || copiedMetadata.etag, resource_type: 'image' };
  } catch (error) {
    await Promise.all([deleteR2Object(key).catch(() => {}), deleteR2Prefix(`${key}.__veylo/`).catch(() => {})]);
    throw error;
  }
}

export async function createArchiveTokenData(token) {
  try {
    const payload = jwt.verify(String(token || ''), process.env.JWT_SECRET, { issuer: 'veylo-r2-archive' });
    if (payload.purpose !== 'r2-gallery-archive' || !Array.isArray(payload.files) || !payload.files.length || payload.files.length > 1000 || payload.files.some(file => typeof file?.key !== 'string' || !file.key.startsWith('veylo/users/'))) throw new Error('scope');
    return payload;
  } catch {
    throw Object.assign(new Error('This download link has expired. Return to the gallery and start the download again.'), { status: 401, code: 'ARCHIVE_TOKEN_INVALID' });
  }
}
