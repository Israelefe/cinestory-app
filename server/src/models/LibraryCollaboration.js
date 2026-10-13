import mongoose from 'mongoose';

const returnedAssetSchema = new mongoose.Schema({
  sourceAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset', required: true },
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset', required: true },
  uploadedAt: { type: Date, default: Date.now },
  variationId: { type: String, default: 'main', maxlength: 64 },
  variationName: { type: String, default: 'Main edit', trim: true, maxlength: 80 },
  reviewStatus: { type: String, enum: ['pending', 'accepted', 'changes-requested'], default: 'pending' },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
  reviewedAt: Date
}, { _id: false });

const libraryCollaborationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  publicId: { type: String, required: true, unique: true, index: true },
  kind: { type: String, enum: ['preselection', 'editor-handoff'], required: true },
  status: { type: String, enum: ['draft', 'active', 'submitted', 'revoked', 'deleted'], default: 'active', index: true },
  deletedAt: Date,
  recipientEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  coverAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' },
  acceptedFolder: { type: String, maxlength: 100 },
  acceptedFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryShoot' },
  creationKey: { type: String, maxlength: 80 },
  revision: { type: Number, default: 1, min: 1 },
  accessVersion: { type: Number, default: 0, min: 0 },
  selectionRule: {
    mode: { type: String, enum: ['exactly', 'up-to', 'unlimited'], default: 'unlimited' },
    count: { type: Number, min: 1, max: 500 }
  },
  selectionDraft: {
    selectedAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' }],
    reviewedAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' }],
    cursor: { type: Number, default: 0, min: 0, max: 500 },
    version: { type: Number, default: 0, min: 0 },
    updatedAt: Date
  },
  submissions: { type: [new mongoose.Schema({ revision: Number, selectedAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' }], submittedAt: Date }, { _id: false })], default: [] },
  editorState: { type: String, enum: ['awaiting-edits', 'ready-for-review', 'changes-requested', 'complete'], default: 'awaiting-edits' },
  editorVersion: { type: Number, default: 0, min: 0 },
  dueAt: Date,
  editsSubmittedAt: Date,
  openedAt: Date,
  title: { type: String, trim: true, maxlength: 100, required: true },
  clientName: { type: String, trim: true, maxlength: 100, default: '' },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  assetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset', required: true }],
  selectedAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' }],
  returnedAssets: { type: [returnedAssetSchema], default: [] },
  approvedReturns: { type: [new mongoose.Schema({ sourceAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' }, assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorageAsset' }, variationId: { type: String, default: 'main' } }, { _id: false })], default: undefined },
  pinDigest: { type: String, select: false },
  passwordDigest: { type: String, select: false },
  expiresAt: { type: Date, required: true, index: true },
  submittedAt: Date,
  revokedAt: Date
}, { timestamps: true });

libraryCollaborationSchema.index({ userId: 1, createdAt: -1 });
libraryCollaborationSchema.index({ status: 1, expiresAt: 1 });
libraryCollaborationSchema.index({ userId: 1, creationKey: 1 }, { unique: true, partialFilterExpression: { creationKey: { $type: 'string' } } });

export default mongoose.model('LibraryCollaboration', libraryCollaborationSchema);
