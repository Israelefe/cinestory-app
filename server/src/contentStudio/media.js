import { Readable } from 'node:stream';
import sharp from 'sharp';
import { cloudinary, configureCloudinary } from '../services/cloudinary.service.js';

export function studioError(message, status = 400) { return Object.assign(new Error(message), { status, safe: true }); }
export function requireStorage() {
  if (!configureCloudinary()) throw studioError('Content storage is not configured yet.', 503);
}
export async function normalizeImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
  const meta = await image.metadata().catch(() => { throw studioError('That file is not a readable image.'); });
  if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) > 1) throw studioError('Use a still JPEG, PNG, or WebP image.');
  if (meta.width < 320 || meta.height < 320) throw studioError('Use images at least 320 pixels wide and tall.');
  const { data, info } = await image.rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}
export async function uploadMedia(source, { projectId, key, resourceType = 'image', format = 'png' }) {
  requireStorage();
  const options = { resource_type: resourceType, type: 'authenticated', public_id: `veylo/content-studio/${projectId}/${key}`, overwrite: true, invalidate: true, format, timeout: 120_000 };
  if (typeof source === 'string') return cloudinary.uploader.upload(source, options);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => error ? reject(error) : resolve(result));
    Readable.from(source).pipe(stream);
  });
}
export function mediaUrl(publicId, { resourceType = 'image', format = 'png', download = false } = {}) {
  requireStorage();
  return cloudinary.url(publicId, { secure: true, resource_type: resourceType, type: 'authenticated', sign_url: true, format, ...(download ? { flags: 'attachment' } : {}) });
}
export async function removeImage(publicId) {
  requireStorage();
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated', invalidate: true });
}

// Only provider-owned object storage can be fetched. Redirects cannot bypass this list.
export async function fetchGeneratedImage(value, signal) {
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
