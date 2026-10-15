import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import BlogAsset from '../models/BlogAsset.js';
import BlogPost from '../models/BlogPost.js';
import { BLOG_COVER_PHOTOS } from '../constants/blogCoverPhotos.js';
import { getR2ObjectBuffer } from './r2.service.js';
import { blogError } from './blogContent.service.js';

const xml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
const photoCache = new Map();
export const blogCoverPhotoList = () => BLOG_COVER_PHOTOS.map(({ id, label, path, alt }) => ({ id, label, alt, url: `https://veylo.com.ng${path}`, thumbnailUrl: `https://veylo.com.ng${path.replace('-1440.webp', '-480.webp')}` }));
function defaultPhoto(title) {
  const category = /wedding|bridal|bride/i.test(title) ? 'wedding' : /fashion|lookbook|campaign/i.test(title) ? 'fashion' : /graduat/i.test(title) ? 'graduation' : /family|album/i.test(title) ? 'family' : /portrait|birthday/i.test(title) ? 'portrait' : '';
  const choices = category ? BLOG_COVER_PHOTOS.filter(photo => photo.category === category) : BLOG_COVER_PHOTOS;
  return choices[crypto.createHash('sha256').update(title).digest()[0] % choices.length];
}
async function publicPhoto(id) {
  const photo = BLOG_COVER_PHOTOS.find(item => item.id === id);
  if (!photo) throw blogError('Choose a photograph from the Veylo cover collection.');
  if (!photoCache.has(id)) {
    const pending = (async () => {
      try { return await readFile(new URL(`../../../client/public${photo.path}`, import.meta.url)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // Fixed host and allowlisted path. Never accept arbitrary remote URLs.
        const response = await fetch(`https://veylo.com.ng${photo.path}`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!response.ok || !/^image\//.test(response.headers.get('content-type') || '')) throw blogError('This Veylo photograph could not load. Choose another photo or upload your own.', 502);
        const parts = []; let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > 12 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw blogError('This cover photograph is too large.'); }
          parts.push(chunk);
        }
        return Buffer.concat(parts);
      }
    })().catch(error => { photoCache.delete(id); throw error; });
    photoCache.set(id, pending);
  }
  return photoCache.get(id);
}
function lineUnits(value) {
  return Array.from(value).reduce((sum, c) => sum + (/\s/.test(c) ? .28 : /[MW@]/.test(c) ? 1 : /[ilI.,'!:;]/.test(c) ? .32 : /[A-Z]/.test(c) ? .76 : /[^\x00-\x7f]/.test(c) ? 1 : .59), 0);
}
function wrapTitle(title, maxWidth, fontSize) {
  const parts = [];
  for (const word of title.trim().split(/\s+/)) {
    if (lineUnits(word) * fontSize <= maxWidth) parts.push(word);
    else {
      let part = '';
      for (const character of Array.from(word)) { if (part && lineUnits(part + character) * fontSize > maxWidth) { parts.push(part); part = ''; } part += character; }
      if (part) parts.push(part);
    }
  }
  const lines = [];
  for (const word of parts) {
    if (!lines.length || lineUnits(`${lines.at(-1)} ${word}`) * fontSize > maxWidth) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines;
}
export function blogCoverSvg(title, share = false) {
  const width = share ? 1200 : 1440, height = share ? 630 : 900, padding = share ? 62 : 80;
  const photoX = Math.round(width * .56), maxWidth = photoX - padding - 42;
  let fontSize = share ? 59 : 76, lines = wrapTitle(title, maxWidth, fontSize);
  while (lines.length * fontSize * 1.12 > height - (share ? 240 : 340) && fontSize > 32) { fontSize -= 3; lines = wrapTitle(title, maxWidth, fontSize); }
  const lineHeight = Math.round(fontSize * 1.12), blockHeight = lines.length * lineHeight;
  const start = Math.max(share ? 186 : 250, (height - blockHeight) / 2 + fontSize * .5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="edge"><stop stop-color="#070709"/><stop offset="1" stop-color="#070709" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="${photoX}" height="${height}" fill="#070709"/><rect x="${photoX - 1}" width="52" height="${height}" fill="url(#edge)"/><text x="${padding}" y="${share ? 76 : 102}" fill="#f4efe9" font-family="Georgia,DejaVu Serif,serif" font-size="${share ? 33 : 42}">veylo.</text><text x="${padding}" y="${share ? 119 : 157}" fill="#ff9b8e" font-family="Arial,DejaVu Sans,sans-serif" font-size="12" letter-spacing="3">THE VEYLO BLOG</text>${lines.map((line, index) => `<text x="${padding}" y="${start + index * lineHeight}" fill="#f4efe9" font-family="Georgia,DejaVu Serif,serif" font-size="${fontSize}">${xml(line)}</text>`).join('')}<line x1="${padding}" x2="${photoX - 48}" y1="${height - 108}" y2="${height - 108}" stroke="#ff9b8e" stroke-opacity=".45"/><text x="${padding}" y="${height - 65}" fill="#b1aaa4" font-family="Arial,DejaVu Sans,sans-serif" font-size="${share ? 15 : 18}">For photographers &amp; studios</text><text x="${padding}" y="${height - 35}" fill="#ff9b8e" font-family="Arial,DejaVu Sans,sans-serif" font-size="${share ? 13 : 15}">veylo.com.ng</text></svg>`;
}
export async function renderBlogCover(title, variant, photograph = null) {
  const share = variant === 'og', width = share ? 1200 : 1440, height = share ? 630 : 900, photoX = Math.round(width * .56);
  const source = photograph || await publicPhoto(defaultPhoto(title).id);
  const photo = await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: width - photoX, height, fit: 'cover', position: sharp.strategy.attention }).png().toBuffer();
  const composed = await sharp({ create: { width, height, channels: 4, background: '#070709' } }).composite([{ input: photo, left: photoX, top: 0 }, { input: Buffer.from(blogCoverSvg(title, share)), left: 0, top: 0 }]).png().toBuffer();
  return sharp(composed).resize(share ? { width: 1200, height: 630 } : { width: Number(variant) }).webp({ quality: 86 }).toBuffer();
}
export async function renderStoredBlogCover(asset, variant) {
  let photograph;
  if (asset.design.uploadedAssetId) {
    const original = await BlogAsset.findOne({ _id: asset.design.uploadedAssetId, postId: asset.postId }).lean();
    if (!original?.originalKey) throw blogError('The uploaded source photograph is unavailable.', 404);
    photograph = (await getR2ObjectBuffer(original.originalKey, { maxBytes: 5 * 1024 * 1024 })).buffer;
  } else photograph = await publicPhoto(asset.design.photoId || defaultPhoto(asset.design.title).id);
  return renderBlogCover(asset.design.title, variant, photograph);
}
export async function createBlogCover(postId, adminId, title, { photoId } = {}) {
  let design = { title, photoId: photoId || defaultPhoto(title).id }, alt = '', credit = 'Veylo';
  if (photoId && !BLOG_COVER_PHOTOS.some(photo => photo.id === photoId)) throw blogError('Choose a photograph from the Veylo cover collection.');
  if (!photoId) {
    const post = await BlogPost.findById(postId).select('draft.coverId draft.coverAlt draft.coverCredit').lean();
    const selected = post?.draft.coverId ? await BlogAsset.findOne({ _id: post.draft.coverId, postId }).lean() : null;
    if (selected?.originalKey || selected?.design?.uploadedAssetId) {
      design = { title, uploadedAssetId: selected.originalKey ? selected._id : selected.design.uploadedAssetId };
      alt = post.draft.coverAlt; credit = post.draft.coverCredit;
    } else if (selected?.design?.photoId) design.photoId = selected.design.photoId;
  }
  const asset = await BlogAsset.create({ postId, createdBy: adminId, source: 'generated', design, width: 1440, height: 900 });
  const photo = BLOG_COVER_PHOTOS.find(item => item.id === design.photoId);
  return { id: String(asset._id), alt: alt || `${photo?.alt || 'Photographic cover'} — ${title}`, credit };
}
export async function prepareGeneratedBlogCover(job, title) {
  if (!await BlogPost.exists({ _id: job.postId, activeJobId: job._id })) return null;
  return createBlogCover(job.postId, job.ownerId, title);
}
