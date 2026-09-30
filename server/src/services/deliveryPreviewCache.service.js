import crypto from 'node:crypto';
import sharp from 'sharp';
import Delivery from '../models/Delivery.js';
import DeliveryPreviewFile from '../models/DeliveryPreviewFile.js';
import User from '../models/User.js';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { deliveryFolder, signedImageUrl } from './deliveryMedia.service.js';
import { deliveryWatermarkedPreview } from './deliveryWatermark.service.js';

const running = new Map();
const warming = new Set();
export function previewRenderKey(asset, text) {
  return crypto.createHash('sha256').update(JSON.stringify(['diagonal-cdn-v1', asset.publicId, asset.contentHash, asset.bytes, String(text || 'PREVIEW').trim().slice(0, 40)])).digest('hex');
}

export function storedPreviewMedia(file) {
  const variants = [...file.variants].sort((a, b) => a.width - b.width);
  const url = variant => signedImageUrl(variant.publicId, { original: true, format: 'webp' });
  return { url: url(variants.at(-1)), thumbnailUrl: url(variants[0]), srcSet: variants.map(variant => `${url(variant)} ${variant.width}w`).join(', ') };
}

export async function storedDeliveryPreviews(delivery, text) {
  const assets = delivery.assets || [];
  const keys = new Map(assets.map(asset => [asset.assetId, previewRenderKey(asset, text)]));
  const files = await DeliveryPreviewFile.find({ deliveryId: delivery._id, renderKey: { $in: [...keys.values()] } }).lean();
  return new Map(files.filter(file => keys.get(file.assetId) === file.renderKey && file.variants?.length).map(file => [file.assetId, storedPreviewMedia(file)]));
}

export async function findStoredWatermark(delivery, asset, text) {
  const file = await DeliveryPreviewFile.findOne({ deliveryId: delivery._id, assetId: asset.assetId, renderKey: previewRenderKey(asset, text) }).lean();
  return file?.variants?.length ? file : null;
}

function uploadPreview(buffer, folder, publicId) {
  if (!configureCloudinary()) throw new Error('Photo storage is temporarily unavailable.');
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({ folder, public_id: publicId, resource_type: 'image', type: 'authenticated', format: 'webp', overwrite: false, unique_filename: false, timeout: 60_000 }, (error, result) => error ? reject(error) : resolve(result));
    upload.end(buffer);
  });
}

export async function ensureStoredWatermark(delivery, asset, text) {
  const renderKey = previewRenderKey(asset, text);
  const query = { deliveryId: delivery._id, assetId: asset.assetId, renderKey };
  const existing = await findStoredWatermark(delivery, asset, text);
  if (existing) return existing;
  const key = `${delivery._id}:${asset.assetId}:${renderKey}`;
  if (running.has(key)) return running.get(key);
  const work = (async () => {
    if (!await Delivery.exists({ _id: delivery._id, 'assets.assetId': asset.assetId })) throw new Error('This photograph is no longer available.');
    // Draw once in Veylo, then resize that finished preview. Cloudinary only stores the files.
    const main = await deliveryWatermarkedPreview(asset, text, { width: 1600 });
    const metadata = await sharp(main).metadata();
    const widths = [...new Set([Math.min(480, metadata.width), Math.min(960, metadata.width), metadata.width])];
    const ownerId = delivery.userId?._id || delivery.userId;
    const folder = `${deliveryFolder(String(ownerId), String(delivery._id))}/previews`;
    const variants = [];
    for (const width of widths) {
      const buffer = width === metadata.width ? main : await sharp(main).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const saved = await uploadPreview(buffer, folder, `${asset.assetId}-${renderKey}-${width}`);
      variants.push({ publicId: saved.public_id, width: saved.width, height: saved.height });
    }
    if (!await Delivery.exists({ _id: delivery._id, 'assets.assetId': asset.assetId })) {
      await Promise.allSettled(variants.map(variant => cloudinary.uploader.destroy(variant.publicId, { resource_type: 'image', type: 'authenticated', invalidate: true })));
      throw new Error('This photograph is no longer available.');
    }
    try {
      return await DeliveryPreviewFile.findOneAndUpdate(query, { $set: { variants } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } catch (error) {
      // Another process may have prepared the same deterministic files concurrently.
      if (error.code === 11000) {
        const saved = await DeliveryPreviewFile.findOne(query).lean();
        if (saved?.variants?.length) return saved;
      }
      throw error;
    }
  })();
  running.set(key, work);
  try { return await work; } finally { running.delete(key); }
}

export function warmDeliveryPreviews(delivery, text, existing = new Map()) {
  if (Delivery.db.readyState !== 1) return;
  const key = `${delivery._id}:${String(text).trim().slice(0, 40)}`;
  if (warming.has(key)) return;
  warming.add(key);
  // Start while the photographer reviews access settings, rather than at each client visit.
  void (async () => {
    for (const asset of delivery.assets || []) {
      if (existing.has(asset.assetId)) continue;
      try { await ensureStoredWatermark(delivery, asset, text); }
      catch (error) { console.warn('[delivery-preview-preparation]', { deliveryId: String(delivery._id), assetId: asset.assetId, code: error.code || 'PREVIEW_PREPARATION_FAILED' }); }
    }
  })().finally(() => warming.delete(key));
}

export async function warmLockedDeliveryPreviews(delivery) {
  if (Delivery.db.readyState !== 1 || !delivery.access?.downloadsLocked || !delivery.access?.watermarkEnabled) return;
  const owner = delivery.userId?.name ? delivery.userId : await User.findById(delivery.userId).select('name studio');
  const text = delivery.access.watermarkText || owner?.studio?.name || owner?.name || 'PREVIEW';
  warmDeliveryPreviews(delivery, text);
}

export async function removeStoredPreviews(deliveryId, assetId) {
  const query = { deliveryId, ...(assetId ? { assetId } : {}) };
  const files = await DeliveryPreviewFile.find(query).lean();
  if (files.length && !configureCloudinary()) throw new Error('Photo storage is temporarily unavailable.');
  await Promise.allSettled(files.flatMap(file => file.variants || []).map(variant => cloudinary.uploader.destroy(variant.publicId, { resource_type: 'image', type: 'authenticated', invalidate: true })));
  await DeliveryPreviewFile.deleteMany(query);
}
