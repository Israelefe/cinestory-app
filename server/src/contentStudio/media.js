import { Readable } from 'node:stream';
import sharp from 'sharp';
import { mediaOffloadEnabled, mediaWorkerRequest, signedMediaUrl } from '../services/cloudflareMedia.service.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deleteR2Object, deleteR2Prefix, imageVariantKey, prepareR2Image, presignedR2Get, putR2Object, r2Configured } from '../services/r2.service.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const localMediaDir = path.resolve(root, '.runtime/content-studio/media');

export function studioError(message, status = 400) { return Object.assign(new Error(message), { status, safe: true }); }
export function requireStorage() { return r2Configured(); }

export async function saveLocalMedia(source, { projectId, key, format = 'png' }) {
  const dir = path.join(localMediaDir, String(projectId), path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${path.basename(key)}.${format}`;
  const filePath = path.join(dir, filename);
  const buffer = await sourceBuffer(source);
  await fs.writeFile(filePath, buffer);
  return { filePath, filename, public_id: `local:${projectId}/${key}.${format}`, bytes: buffer.byteLength, url: `/api/v1/admin/content-studio/media/${projectId}/${key}.${format}` };
}

async function sourceBuffer(source, maxBytes = 500 * 1024 * 1024) {
  if (Buffer.isBuffer(source)) return source;
  if (typeof source === 'string') return fs.readFile(source);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of source instanceof Readable ? source : Readable.from(source)) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw studioError('This file is too large to store.', 413);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, bytes);
}

export async function normalizeImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
  const meta = await image.metadata().catch(() => { throw studioError('That file is not a readable image.'); });
  if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) > 1) throw studioError('Use a still JPEG, PNG, or WebP image.');
  if (meta.width < 320 || meta.height < 320) throw studioError('Use images at least 320 pixels wide and tall.');
  const { data, info } = await image.rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

function contentTypeFor(resourceType, format) {
  if (resourceType === 'image') return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[format] || 'image/png';
  return ({ mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm', aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac' })[format] || 'application/octet-stream';
}

export async function uploadMedia(source, { projectId, key, resourceType = 'image', format = 'png' }) {
  if (process.env.CONTENT_STORAGE_LOCAL === 'true') return saveLocalMedia(source, { projectId, key, format });
  if (!r2Configured()) throw studioError('Image storage is temporarily unavailable.', 503);
  const buffer = await sourceBuffer(source);
  const objectKey = `veylo/content-studio/${projectId}/${key}`;
  const contentType = contentTypeFor(resourceType, format);
  const uploaded = await putR2Object(objectKey, buffer, { contentType });
  let image = {};
  if (resourceType === 'image') image = await prepareR2Image(objectKey);
  return {
    public_id: objectKey,
    bytes: uploaded.bytes,
    format,
    width: image.width,
    height: image.height,
    etag: uploaded.etag,
    url: mediaUrl(objectKey, { resourceType, format })
  };
}

export function mediaUrl(publicId, { resourceType = 'image', format = 'png', download = false } = {}) {
  if (!publicId) return '';
  if (String(publicId).startsWith('local:')) {
    const clean = String(publicId).replace(/^local:/, '');
    return `/api/v1/admin/content-studio/media/${clean}`;
  }
  if (/^https:\/\//i.test(String(publicId))) return publicId;
  const filename = `${String(publicId).split('/').at(-1) || 'media'}.${format}`;
  if (mediaOffloadEnabled()) return signedMediaUrl(publicId, { preset: resourceType === 'image' && !download ? '1600' : '', downloadFilename: download ? filename : '' });
  const key = resourceType === 'image' && !download ? imageVariantKey(publicId, '1600') : publicId;
  return presignedR2Get(key, { downloadFilename: download ? filename : '', expiresIn: 6 * 60 * 60 });
}

export async function removeImage(publicId) {
  if (!publicId || String(publicId).startsWith('local:') || /^https?:\/\//i.test(String(publicId))) return true;
  await Promise.all([deleteR2Object(publicId), deleteR2Prefix(`${publicId}.__veylo/`)]);
  return true;
}

// Only provider-owned object storage can be fetched. Redirects cannot bypass this list.
export async function fetchGeneratedImage(value, signal, destination) {
  if (mediaOffloadEnabled() && process.env.CONTENT_STORAGE_LOCAL !== 'true') {
    signal?.throwIfAborted();
    if (!destination?.projectId || !destination?.key) throw studioError('The campaign image destination is missing.', 500);
    return mediaWorkerRequest('import-image', { url: value, key: `veylo/content-studio/${destination.projectId}/${destination.key}` });
  }
  let url;
  try { url = new URL(value); } catch { throw studioError('The image provider returned an invalid image URL.', 502); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    !(/\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname) || /\.oss\.aliyuncs\.com$/.test(url.hostname) || url.hostname.endsWith('.alicdn.com'))) {
    throw studioError('The image provider returned an unsupported storage address.', 502);
  }
  const response = await fetch(url, { signal, redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > 20_000_000) throw studioError('The generated image could not be downloaded.', 502);
  const parts = []; let bytes = 0;
  for await (const part of response.body) {
    bytes += part.length;
    if (bytes > 20_000_000) { await response.body.cancel().catch(() => {}); throw studioError('The generated image is too large.', 502); }
    parts.push(part);
  }
  return normalizeImage(Buffer.concat(parts));
}
