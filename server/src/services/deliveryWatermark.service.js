import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { signedImageUrl } from './deliveryMedia.service.js';

const audience = 'veylo-watermarked-preview';
const MAX_SOURCE_BYTES = 18 * 1024 * 1024;
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

export async function renderDeliveryWatermark(input, text) {
  // Work on a separate preview buffer; uploaded originals are never overwritten.
  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const words = String(text || 'PREVIEW').slice(0, 40).trim().split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const next = `${lines.at(-1)} ${word}`.trim();
    if (next.length <= 24 || !lines.at(-1)) lines[lines.length - 1] = next;
    else lines.push(word);
  }
  // Long studio names wrap so their watermark remains readable on a phone.
  const labels = lines.flatMap(line => line.match(/.{1,24}/gu) || []).slice(0, 2);
  const characters = Math.max(10, ...labels.map(line => Array.from(line).length));
  const fontSize = Math.max(10, Math.min(width * .055, width * .72 / (characters * .68)));
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" text-anchor="middle" fill="white" fill-opacity=".68" stroke="#111111" stroke-opacity=".48" stroke-width="${Math.max(1, fontSize * .065)}" paint-order="stroke fill">${[.28, .5, .72].map(position => labels.map((label, index) => `<text x="${width / 2}" y="${height * position + (index - (labels.length - 1) / 2) * fontSize * 1.25}" dominant-baseline="middle">${xmlText(label)}</text>`).join('')).join('')}</g></svg>`);
  return sharp(data).composite([{ input: svg }]).webp({ quality: 86 }).toBuffer();
}

async function sourceBuffer(url) {
  const upstream = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!upstream.ok || !/^image\//i.test(upstream.headers.get('content-type') || '')) throw new Error('The photograph could not be loaded.');
  if (Number(upstream.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) throw new Error('The photograph is too large to preview.');
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

export async function deliveryWatermarkedPreview(asset, text, options) {
  const key = crypto.createHash('sha256').update(JSON.stringify([asset.publicId, asset.version, text, options])).digest('hex');
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.buffer;
  if (existing) { cacheBytes -= existing.buffer.length; cache.delete(key); }
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    // Only a stored asset ID can become a source URL. Request parameters cannot supply a remote URL.
    const input = await sourceBuffer(signedImageUrl(asset.publicId, options));
    const buffer = await renderDeliveryWatermark(input, text);
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
