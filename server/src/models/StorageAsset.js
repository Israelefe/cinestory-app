import crypto from 'crypto';
import mongoose from 'mongoose';

const storageAssetSchema = new mongoose.Schema({
  assetId: { type: String, unique: true, default: () => crypto.randomUUID() },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  publicId: { type: String, required: true, unique: true },
  originalFilename: { type: String, trim: true, maxlength: 180 },
  format: { type: String, enum: ['jpg', 'jpeg', 'png', 'webp'], required: true },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 },
  bytes: { type: Number, min: 1 },
  folder: { type: String, trim: true, maxlength: 100, default: 'All photographs' },
  tags: [{ type: String, trim: true, maxlength: 40 }],
  caption: { type: String, trim: true, maxlength: 180, default: '' }
}, { timestamps: true });

storageAssetSchema.index({ userId: 1, createdAt: -1 });
storageAssetSchema.index({ userId: 1, originalFilename: 1 });

export default mongoose.model('StorageAsset', storageAssetSchema);
