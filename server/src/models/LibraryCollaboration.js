import mongoose from 'mongoose';

const returnedAssetSchema = new mongoose.Schema({
  sourceAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset', required: true },
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset', required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const libraryCollaborationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  publicId: { type: String, required: true, unique: true, index: true },
  kind: { type: String, enum: ['preselection', 'editor-handoff'], required: true },
  status: { type: String, enum: ['active', 'submitted', 'revoked'], default: 'active', index: true },
  title: { type: String, trim: true, maxlength: 100, required: true },
  clientName: { type: String, trim: true, maxlength: 100, default: '' },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  assetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset', required: true }],
  selectedAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' }],
  returnedAssets: { type: [returnedAssetSchema], default: [] },
  pinDigest: { type: String, select: false },
  passwordDigest: { type: String, select: false },
  expiresAt: { type: Date, required: true, index: true },
  submittedAt: Date,
  revokedAt: Date
}, { timestamps: true });

libraryCollaborationSchema.index({ userId: 1, createdAt: -1 });
libraryCollaborationSchema.index({ status: 1, expiresAt: 1 });

export default mongoose.model('LibraryCollaboration', libraryCollaborationSchema);
