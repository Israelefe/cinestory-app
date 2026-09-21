import mongoose from 'mongoose';

const deliveryShareGrantSchema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['organizer', 'vendor', 'guest'], required: true },
  label: { type: String, required: true, trim: true, maxlength: 100 },
  tokenDigest: { type: String, required: true, unique: true, select: false },
  assetIds: { type: [String], default: [], validate: value => value.length <= 500 },
  sectionIds: { type: [String], default: [], validate: value => value.length <= 12 },
  allowIndividualDownloads: { type: Boolean, default: false },
  allowDownloadAll: { type: Boolean, default: false },
  usageTerms: { type: String, trim: true, maxlength: 1000, default: '' },
  expiresAt: Date,
  revokedAt: Date,
  openCount: { type: Number, min: 0, default: 0 },
  downloadCount: { type: Number, min: 0, default: 0 },
  lastUsedAt: Date,
  lastDownloadAt: Date
}, { timestamps: true });

deliveryShareGrantSchema.index({ deliveryId: 1, revokedAt: 1 });

export default mongoose.model('DeliveryShareGrant', deliveryShareGrantSchema);
