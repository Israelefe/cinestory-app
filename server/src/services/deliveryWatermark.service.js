import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { setTimeout as delay } from 'node:timers/promises';
import { signedImageUrl, signedPreparedDeliveryImageUrl } from './deliveryMedia.service.js';

const audience = 'veylo-watermarked-preview';
// The delivery uploader accepts finished photographs up to 50 MB.
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const cache = new Map();
const pending = new Map();
let cacheBytes = 0;

export function watermarkMediaToken(claims) {
  return jwt.sign({ ...claims, scope: 'watermarked-preview' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h', issuer: 'veylo-api', audience });
}

export function verifyWatermarkMediaToken(token) {
  const claims = jwt.verify(String(token || ''), process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'veylo-api', audience });
  if (claims.scope !== 'watermarked-preview' || !/^[a-f0-9]{24}$/i.test(claims.deliveryId || '')) throw new Error('Invalid photo preview link.');
  return claims;
}

export function watermarkedAssetMedia(asset, token, deliveryId) {
  const base = `/api/v1/deliveries/media/${encodeURIComponent(deliveryId)}/photos/${encodeURIComponent(asset.assetId)}?token=${encodeURIComponent(token)}`;
  return {
    url: `${base}&width=1600`,
    thumbnailUrl: `${base}&thumbnail=1`,
    srcSet: [480, 960, 1600].map(width => `${base}&width=${width} ${width}w`).join(', ')
  };
}

function xmlText(value) {
  return String(value || 'PREVIEW').slice(0, 40).replace(/[\u0000-\u001f]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

export async function renderDeliveryWatermark(input, text, { width: requestedWidth = 1600, thumbnail = false } = {}) {
  // Work on a separate preview buffer; uploaded originals are never overwritten.
  const image = sharp(input, { limitInputPixels: 100_000_000 }).rotate();
  const resized = thumbnail
    ? image.resize(800, 1000, { fit: 'cover', position: 'attention', withoutEnlargement: true })
    : image.resize({ width: requestedWidth, withoutEnlargement: true });
  // Resolve resized pixels before compositing, with only one final WebP encode.
  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const label = String(text || 'PREVIEW').slice(0, 40).trim() || 'PREVIEW';
  const angle = -Math.min(32, Math.atan2(height, width) * 180 / Math.PI * .65);
  const radians = Math.abs(angle) * Math.PI / 180;
  const lineLength = Math.min(width * .86 / Math.cos(radians), height * .7 / Math.sin(radians));
  const fontSize = Math.min(Math.min(width, height) * .14, lineLength / (Math.max(7, Array.from(label).length) * .68));
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g transform="translate(${width / 2} ${height / 2}) rotate(${angle})"><text x="0" y="0" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" text-anchor="middle" fill="white" fill-opacity=".58" stroke="#111111" stroke-opacity=".4" stroke-width="${Math.max(.5, fontSize * .05)}" paint-order="stroke fill">${xmlText(label)}</text></g></svg>`);
  return sharp(data, { raw: { width, height, channels: info.channels } }).composite([{ input: svg }]).webp({ quality: 86 }).toBuffer();
}

async function sourceBuffer(url) {
  let upstream;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      upstream = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error', headers: { Accept: 'image/webp,image/jpeg,image/png' } });
    } catch (error) {
      if (attempt) throw error;
      await delay(200);
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(upstream.status) || attempt) break;
    await upstream.body?.cancel().catch(() => {});
    await delay(200);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {});
    throw Object.assign(new Error('The photograph could not be loaded.'), { upstreamStatus: upstream.status });
  }
  if (!/^image\//i.test(upstream.headers.get('content-type') || '')) {
    await upstream.body?.cancel().catch(() => {});
    throw new Error('The photograph could not be loaded.');
  }
  if (Number(upstream.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) {
    await upstream.body?.cancel().catch(() => {});
    throw new Error('The photograph is too large to preview.');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of upstream.body) {
    bytes += chunk.length;
    if (bytes > MAX_SOURCE_BYTES) {
      await upstream.body.cancel().catch(() => {});
      throw new Error('The photograph is too large to preview.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function cachedBuffer(key, create) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.buffer;
  if (existing) { cacheBytes -= existing.buffer.length; cache.delete(key); }
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    const buffer = await create();
    while (cacheBytes + buffer.length > MAX_CACHE_BYTES && cache.size) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).buffer.length;
      cache.delete(oldest);
    }
    if (buffer.length <= MAX_CACHE_BYTES) { cache.set(key, { buffer, expiresAt: Date.now() + 30 * 60_000 }); cacheBytes += buffer.length; }
    return buffer;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

export async function deliveryWatermarkedPreview(asset, text, options = {}) {
  const assetKey = crypto.createHash('sha256').update(JSON.stringify([asset.publicId, asset.contentHash, asset.bytes])).digest('hex');
  const key = crypto.createHash('sha256').update(JSON.stringify(['single-diagonal', assetKey, text, options])).digest('hex');
  return cachedBuffer(key, async () => {
    // All responsive sizes share one prepared source, not a separate provider transformation.
    // Only stored asset IDs can become source URLs; request parameters cannot supply one.
    const input = await cachedBuffer(`source:${assetKey}`, async () => {
      try {
        return await sourceBuffer(signedPreparedDeliveryImageUrl(asset.publicId));
      } catch (error) {
        if (![400, 401, 403, 404].includes(error.upstreamStatus)) throw error;
        const original = await sourceBuffer(signedImageUrl(asset.publicId, { original: true }));
        // Cache a preview-sized source, not a potentially 50 MB original, for the other sizes.
        return sharp(original, { limitInputPixels: 100_000_000 }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
      }
    });
    return renderDeliveryWatermark(input, text, options);
  });
}
