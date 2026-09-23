import { Readable } from 'node:stream';
import sharp from 'sharp';
import { cloudinary, configureCloudinary } from '../services/cloudinary.service.js';

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const localMediaDir = path.resolve(root, '.runtime/content-studio/media');

export function studioError(message, status = 400) { return Object.assign(new Error(message), { status, safe: true }); }
export function requireStorage() { return true; }

export async function saveLocalMedia(source, { projectId, key, format = 'png' }) {
  const dir = path.join(localMediaDir, String(projectId), path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${path.basename(key)}.${format}`;
  const filePath = path.join(dir, filename);
  let buffer;
  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else if (typeof source === 'string') {
    buffer = await fs.readFile(source);
  } else {
    const chunks = [];
    for await (const chunk of source) chunks.push(chunk);
    buffer = Buffer.concat(chunks);
  }
  await fs.writeFile(filePath, buffer);
  return {
    filePath,
    filename,
    public_id: `local:${projectId}/${key}.${format}`,
    bytes: buffer.byteLength,
    url: `/api/v1/admin/content-studio/media/${projectId}/${key}.${format}`
  };
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
  const hasCloudinary = configureCloudinary();
  if (!hasCloudinary || process.env.CONTENT_STORAGE_LOCAL === 'true') {
    return saveLocalMedia(source, { projectId, key, format });
  }
  try {
    const options = { resource_type: resourceType, type: 'authenticated', public_id: `veylo/content-studio/${projectId}/${key}`, overwrite: true, invalidate: true, format, timeout: 120_000 };
    if (typeof source === 'string') return await cloudinary.uploader.upload(source, options);
    return await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => error ? reject(error) : resolve(result));
      Readable.from(source).pipe(stream);
    });
  } catch (error) {
    // Graceful fallback to local PC storage if Cloudinary rejects
    return saveLocalMedia(source, { projectId, key, format });
  }
}

export function mediaUrl(publicId, { resourceType = 'image', format = 'png', download = false } = {}) {
  if (!publicId) return '';
  if (publicId.startsWith('http://') || publicId.startsWith('https://') || publicId.startsWith('/') || publicId.startsWith('data:')) {
    return publicId;
  }
  if (publicId.startsWith('local:')) {
    const clean = publicId.replace(/^local:/, '');
    return `/api/v1/admin/content-studio/media/${clean}`;
  }
  if (!configureCloudinary()) {
    return `/api/v1/admin/content-studio/media/${publicId}`;
  }
  try {
    return cloudinary.url(publicId, { secure: true, resource_type: resourceType, type: 'authenticated', sign_url: true, format, ...(download ? { flags: 'attachment' } : {}) });
  } catch {
    return `/api/v1/admin/content-studio/media/${publicId}`;
  }
}

export async function removeImage(publicId) {
  if (publicId?.startsWith('local:')) return true;
  if (!configureCloudinary()) return true;
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated', invalidate: true });
  } catch {
    return true;
  }
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
