import { preservePaidUsageOnDelete } from './paidUsageEvidence.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { cleanDeliveryAccess } from '../utils/deliveryAccess.js';

const assetSchema = new mongoose.Schema({
  assetId: { type: String, required: true },
  publicId: { type: String, required: true },
  resourceType: { type: String, enum: ['image', 'video'], default: 'image' },
  format: { type: String, trim: true },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 },
  bytes: { type: Number, min: 0 },
  contentHash: { type: String, trim: true, maxlength: 200 },
  hashAlgorithm: { type: String, enum: ['cloudinary-etag', 'r2-etag', 'sha256'] },
  hashVerifiedAt: Date,
  originalFilename: { type: String, trim: true, maxlength: 180 },
  alt: { type: String, maxlength: 180 },
  caption: { type: String, trim: true, maxlength: 320 },
  // Optional context carried over when a photograph is reused from the Pro library.
  libraryTags: [{ type: String, trim: true, maxlength: 40 }],
  libraryCaption: { type: String, trim: true, maxlength: 180 },
  sortOrder: { type: Number, default: 0 },
  uploadId: { type: String, maxlength: 100 },
  analysis: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const accessSchema = new mongoose.Schema({
  pinDigest: { type: String, select: false },
  expiresAt: Date,
  allowIndividualDownloads: { type: Boolean, default: true },
  allowDownloadAll: { type: Boolean, default: true },
  allowLikes: { type: Boolean, default: true },
  revokedAt: Date
}, { _id: false, toObject: { transform: (_doc, access) => cleanDeliveryAccess(access) }, toJSON: { transform: (_doc, access) => cleanDeliveryAccess(access) } });

const videoItemSchema = new mongoose.Schema({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAsset', required: true },
  title: { type: String, trim: true, maxlength: 100, default: '' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  posterSeconds: { type: Number, min: 0, default: 0 },
  // Internal immutable cover reference captured when publishing.
  posterKey: String,
  allowDownload: { type: Boolean, default: null }
}, { _id: false });
const videoPresentationSchema = new mongoose.Schema({
  title: { type: String, maxlength: 120 }, introduction: { type: String, maxlength: 1500, default: '' },
  items: { type: [videoItemSchema], default: [] }, featuredAssetId: mongoose.Schema.Types.ObjectId,
  allowDownloads: { type: Boolean, default: false }
}, { _id: false });
const videoSchema = new mongoose.Schema({
  draft: { type: videoPresentationSchema, default: () => ({}) },
  published: videoPresentationSchema, revision: { type: Number, default: 0 },
  accessVersion: { type: Number, default: 0 }
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  publicId: { type: String, unique: true, index: true, default: () => crypto.randomBytes(24).toString('base64url') },
  legacyStoryId: { type: String, index: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  schemaVersion: { type: Number, default: 2 },
  v3: { type: mongoose.Schema.Types.Mixed },
  kind: { type: String, enum: ['showcase', 'pinboard', 'photoswap', 'volume', 'video'], default: 'showcase', index: true },
  format: { type: String, enum: ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'] },
  status: { type: String, enum: ['draft', 'analyzing', 'directing', 'review', 'published', 'archived'], default: 'draft', index: true },
  clientName: { type: String, trim: true, maxlength: 100, default: '' },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  shootType: { type: String, trim: true, maxlength: 80, default: '' },
  brief: { type: String, trim: true, required() { return (this.kind || this.getQuery?.().kind) !== 'video'; }, default: '' },
  video: videoSchema,
  assets: { type: [assetSchema], default: [] },
  collectionAnalysis: { type: mongoose.Schema.Types.Mixed },
  formatRecommendations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  creativeDirection: { type: mongoose.Schema.Types.Mixed },
  formatConfig: { type: mongoose.Schema.Types.Mixed },
  // Pinboard keeps every uploaded final photo and stores its chosen board
  // composition, moment groups, and display settings separately from Showcase.
  pinboard: { type: mongoose.Schema.Types.Mixed },
  // Photo Swap stores its background mode, typography, and presentation config.
  photoswap: { type: mongoose.Schema.Types.Mixed },
  presentationOrder: { type: [String], default: [] },
  galleryOrder: { type: [String], default: [] },
  curatedAssetIds: { type: [String], default: [] },
  galleryAssetIds: { type: [String], default: [] },
  soundtrack: { type: mongoose.Schema.Types.Mixed },
  narration: { type: mongoose.Schema.Types.Mixed },
  access: { type: accessSchema, default: () => ({}) },
  publishedAt: Date,
  archivedAt: Date,
  archivedFromStatus: { type: String, enum: ['draft', 'analyzing', 'directing', 'review', 'published'] },
  reviewApprovedAt: Date,
  viewsCount: { type: Number, default: 0, min: 0 },
  downloadsCount: { type: Number, default: 0, min: 0 },
  likesCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

deliverySchema.index({ userId: 1, updatedAt: -1 });
deliverySchema.index({ userId: 1, status: 1, _id: -1 });

preservePaidUsageOnDelete(deliverySchema, 'delivery');
export default mongoose.model('Delivery', deliverySchema);
