import DeliveryPreviewFile from '../models/DeliveryPreviewFile.js';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';

// Retain cleanup for preview files saved before watermarking was retired.
// No preview generation or background preparation runs in the API anymore.
export async function removeStoredPreviews(deliveryId, assetId) {
  const query = { deliveryId, ...(assetId ? { assetId } : {}) };
  const files = await DeliveryPreviewFile.find(query).lean();
  if (files.length && !configureCloudinary()) throw new Error('Photo storage is temporarily unavailable.');
  await Promise.allSettled(files.flatMap(file => file.variants || []).map(variant => cloudinary.uploader.destroy(variant.publicId, { resource_type: 'image', type: 'authenticated', invalidate: true })));
  await DeliveryPreviewFile.deleteMany(query);
}
