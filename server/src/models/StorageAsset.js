import { preservePaidUsageOnDelete } from './paidUsageEvidence.js';
import crypto from 'crypto';
import mongoose from 'mongoose';

const storageAssetSchema = new mongoose.Schema({
  assetId: { type: String, unique: true, default: () => crypto.randomUUID() },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  publicId: { type: String, required: true, unique: true },
  // A camera original is kept as a separate authenticated RAW resource. The
  // publicId remains an image so delivery and portfolio reuse stay compatible.
  rawPublicId: { type: String, trim: true, unique: true, sparse: true },
  rawFormat: { type: String, trim: true, lowercase: true, maxlength: 12 },
  rawBytes: { type: Number, min: 0, default: 0 },
  originalFilename: { type: String, trim: true, maxlength: 180 },
  format: { type: String, enum: ['jpg', 'jpeg', 'png', 'webp'], required: true },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 },
  bytes: { type: Number, min: 1 },
  // Cloudinary returns an etag for the uploaded bytes. Keep the algorithm
  // explicit so this is never mistaken for an application-generated hash.
  contentHash: { type: String, trim: true, maxlength: 200 },
  hashAlgorithm: { type: String, enum: ['cloudinary-etag', 'sha256'] },
  hashVerifiedAt: Date,
  folder: { type: String, trim: true, maxlength: 100, default: 'All photographs' },
  tags: [{ type: String, trim: true, maxlength: 40 }],
  caption: { type: String, trim: true, maxlength: 180, default: '' }
}, { timestamps: true });

storageAssetSchema.index({ userId: 1, createdAt: -1 });
storageAssetSchema.index({ userId: 1, _id: -1 });
storageAssetSchema.index({ userId: 1, originalFilename: 1 });

preservePaidUsageOnDelete(storageAssetSchema, 'storage');
export default mongoose.model('StorageAsset', storageAssetSchema);
