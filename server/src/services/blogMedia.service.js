import mongoose from 'mongoose';
import sharp from 'sharp';
import BlogAsset from '../models/BlogAsset.js';
import { putR2Object, getR2ObjectBuffer, deleteR2Object } from './r2.service.js';
import { blogError } from './blogContent.service.js';
import { renderBlogCover, renderStoredBlogCover } from './blogCover.service.js';

export const BLOG_IMAGE_VARIANTS = ['480', '960', '1440', 'og'];
export async function uploadBlogCover(file, postId, adminId, { title = '' } = {}) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw blogError('Choose a JPEG, PNG, or WebP photo.');
  const image = sharp(file.buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
  const meta = await image.metadata().catch(() => { throw blogError('This file is not a readable photo.'); });
  if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1 || meta.width < 480 || meta.height < 320) throw blogError('Use a still JPEG, PNG, or WebP photo at least 480 pixels wide and 320 pixels tall.');
  const normalized = await image.rotate().toBuffer({ resolveWithObject: true });
  const id = new mongoose.Types.ObjectId(), variants = {}, uploaded = [];
  try {
    const originalKey = `veylo/blog/${postId}/${id}/original`;
    await putR2Object(originalKey, file.buffer, { contentType: file.mimetype });
    uploaded.push(originalKey);
    for (const variant of BLOG_IMAGE_VARIANTS) {
      const key = `veylo/blog/${postId}/${id}/${variant}.webp`;
      const prepared = sharp(normalized.data, { limitInputPixels: 40_000_000 }).resize(variant === 'og' ? { width: 1200, height: 630, fit: 'cover' } : { width: Number(variant), withoutEnlargement: true });
      const buffer = title ? await renderBlogCover(title, variant, normalized.data) : await prepared.webp({ quality: 82 }).toBuffer();
      await putR2Object(key, buffer, { contentType: 'image/webp' });
      uploaded.push(key); variants[variant] = key;
    }
    return await BlogAsset.create({ _id: id, postId, createdBy: adminId, originalKey, variants, design: { title }, width: title ? 1440 : normalized.info.width, height: title ? 900 : normalized.info.height });
  } catch (error) {
    await Promise.allSettled(uploaded.map(deleteR2Object));
    throw error;
  }
}
export async function sendBlogImage(res, asset, variant, privateImage = false) {
  if (!BLOG_IMAGE_VARIANTS.includes(variant) || !asset || asset.source !== 'generated' && !asset.variants?.[variant]) throw blogError('Photo not found.', 404);
  const buffer = asset.source === 'generated' ? await renderStoredBlogCover(asset, variant) : (await getR2ObjectBuffer(asset.variants[variant], { maxBytes: 8 * 1024 * 1024 })).buffer;
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': privateImage ? 'no-store' : 'public, max-age=300, must-revalidate', 'X-Content-Type-Options': 'nosniff' }).send(buffer);
}
