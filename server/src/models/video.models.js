import mongoose from 'mongoose';

const { Schema } = mongoose;
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true };
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
const assetSchema = new Schema({
  userId: owner, objectKey: { type: String, required: true, unique: true },
  filename: { type: String, maxlength: 180, required: true }, contentType: String,
  bytes: { type: Number, min: 1, required: true }, checksum: String,
  duration: Number, width: Number, height: Number, rotation: Number, videoCodec: String, audioCodec: String,
  state: { type: String, enum: ['reserved', 'uploading', 'verifying', 'queued', 'processing', 'ready', 'failed', 'deleting', 'deleted'], default: 'reserved', index: true },
  errorCode: String, errorMessage: String, streamUid: { type: String, index: true },
  streamImportedAt: Date, streamReadyAt: Date, posterKey: String, posterKeys: [String],
  analysis: { state: { type: String, enum: ['idle', 'queued', 'running', 'ready', 'failed'], default: 'idle' },
    includeSpeech: Boolean, generation: String, version: String, frames: [Number], suggestions: Schema.Types.Mixed,
    inputHash: String, costUsd: Number, errorMessage: String, completedAt: Date },
  deletedAt: Date, purgeAt: { type: Date, index: true }
}, { timestamps: true });
assetSchema.index({ userId: 1, state: 1, createdAt: -1 });

const uploadSchema = new Schema({
  userId: owner, deliveryId: { type: Schema.Types.ObjectId, ref: 'Delivery', required: true },
  assetId: { type: Schema.Types.ObjectId, ref: 'VideoAsset', required: true, unique: true },
  requestKey: { type: String, required: true }, uploadId: String,
  partBytes: Number, partCount: Number, fingerprint: { type: String, maxlength: 200 },
  state: { type: String, enum: ['initializing', 'uploading', 'paused', 'completing', 'completed', 'aborting', 'aborted'], default: 'initializing' },
  expiresAt: { type: Date, index: true }, leaseId: String, accountLeaseId: String
}, { timestamps: true });
uploadSchema.index({ userId: 1, requestKey: 1 }, { unique: true });

const quotaSchema = new Schema({
  _id: String, userId: owner, assetId: { type: Schema.Types.ObjectId, required: true },
  bytes: Number, byteState: { type: String, enum: ['reserved', 'committed', 'released'], default: 'reserved' },
  seconds: { type: Number, default: 0 }, durationState: { type: String, enum: ['none', 'reserved', 'committed', 'released'], default: 'none' }
}, { timestamps: true });

const jobSchema = new Schema({
  key: { type: String, unique: true, required: true }, userId: owner,
  assetId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, enum: ['prepare', 'analyze', 'present', 'delete'], required: true },
  state: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
  attempts: { type: Number, default: 0 }, leaseUntil: Date, leaseToken: String,
  runAfter: { type: Date, default: Date.now }, errorCode: String, options: Schema.Types.Mixed, result: Schema.Types.Mixed
}, { timestamps: true });
jobSchema.index({ state: 1, runAfter: 1, leaseUntil: 1 });

const leaseSchema = new Schema({ _id: String, ownerId: String, resourceId: String, expiresAt: { type: Date, index: true } }, { timestamps: true });
const usageSchema = new Schema({
  _id: String, userId: owner, periodStart: Date, periodEnd: Date,
  deliveredMinutes: { type: Number, default: 0 }, reconciledAt: Date,
  warned80At: Date, warned95At: Date
}, { timestamps: true });
const playbackSchema = new Schema({
  _id: String, userId: owner, deliveryId: { type: Schema.Types.ObjectId, required: true },
  assetId: { type: Schema.Types.ObjectId, required: true }, accessVersion: Number,
  leaseId: String, expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });
const aiUsageSchema = new Schema({ _id: String, reservedUsd: { type: Number, default: 0 }, spentUsd: { type: Number, default: 0 } }, { timestamps: true });

export const VideoAsset = model('VideoAsset', assetSchema);
export const VideoUpload = model('VideoUpload', uploadSchema);
export const VideoQuota = model('VideoQuota', quotaSchema);
export const VideoJob = model('VideoJob', jobSchema);
export const VideoLease = model('VideoLease', leaseSchema);
export const VideoUsage = model('VideoUsage', usageSchema);
export const VideoPlayback = model('VideoPlayback', playbackSchema);
export const VideoAIUsage = model('VideoAIUsage', aiUsageSchema);
export const VideoAnalysisPart = model('VideoAnalysisPart', new Schema({
  _id: String, userId: owner, assetId: Schema.Types.ObjectId, kind: String,
  seconds: Number, text: String, segments: [Schema.Types.Mixed], version: String
}, { timestamps: true }));

export async function ensureVideoIndexes() {
  for (const item of [VideoAsset, VideoUpload, VideoQuota, VideoJob, VideoLease, VideoUsage, VideoPlayback, VideoAIUsage, VideoAnalysisPart]) await item.createIndexes();
}
