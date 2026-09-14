import crypto from 'crypto';
import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
  assetId: { type: String, required: true },
  publicId: { type: String, required: true },
  resourceType: { type: String, enum: ['image', 'video'], default: 'image' },
  format: { type: String, trim: true },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 },
  bytes: { type: Number, min: 0 },
  originalFilename: { type: String, trim: true, maxlength: 180 },
  sortOrder: { type: Number, default: 0 },
  analysis: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const accessSchema = new mongoose.Schema({
  pinDigest: { type: String, select: false },
  expiresAt: Date,
  allowIndividualDownloads: { type: Boolean, default: true },
  allowDownloadAll: { type: Boolean, default: true },
  allowLikes: { type: Boolean, default: true }
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  publicId: { type: String, unique: true, index: true, default: () => crypto.randomBytes(24).toString('base64url') },
  legacyStoryId: { type: String, index: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  schemaVersion: { type: Number, default: 1 },
  format: { type: String, enum: ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album'] },
  status: { type: String, enum: ['draft', 'analyzing', 'directing', 'review', 'published', 'archived'], default: 'draft', index: true },
  clientName: { type: String, trim: true, maxlength: 100, default: '' },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  shootType: { type: String, trim: true, maxlength: 80, default: '' },
  brief: { type: String, trim: true, maxlength: 2000, default: '' },
  assets: { type: [assetSchema], default: [] },
  collectionAnalysis: { type: mongoose.Schema.Types.Mixed },
  formatRecommendations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  creativeDirection: { type: mongoose.Schema.Types.Mixed },
  formatConfig: { type: mongoose.Schema.Types.Mixed },
  soundtrack: { type: mongoose.Schema.Types.Mixed },
  narration: { type: mongoose.Schema.Types.Mixed },
  access: { type: accessSchema, default: () => ({}) },
  publishedAt: Date,
  reviewApprovedAt: Date,
  viewsCount: { type: Number, default: 0, min: 0 },
  downloadsCount: { type: Number, default: 0, min: 0 },
  likesCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

deliverySchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('Delivery', deliverySchema);
