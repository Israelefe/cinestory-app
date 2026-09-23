import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
  id: { type: String, required: true },
  publicId: { type: String, required: false },
  url: String,
  localPath: String,
  kind: { type: String, enum: ['photo', 'screenshot', 'generated', 'video', 'music'], required: true },
  name: String, width: Number, height: Number, bytes: Number, duration: Number,
  slotId: String,
  analysis: mongoose.Schema.Types.Mixed
}, { _id: false });

const jobSchema = new mongoose.Schema({
  id: String,
  status: { type: String, enum: ['idle', 'queued', 'running', 'ready', 'needs_assets', 'failed', 'cancelled'], default: 'idle' },
  kind: { type: String, enum: ['generate', 'revise', 'render'] },
  stage: String, progress: { type: Number, default: 0 },
  versionId: String, instruction: String, sceneId: String,
  attempts: { type: Number, default: 0 },
  error: String, lockedBy: String, heartbeatAt: Date,
  cancelRequested: { type: Boolean, default: false },
  queuedAt: Date, completedAt: Date
}, { _id: false });

const contentProjectSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  title: { type: String, required: true, maxlength: 100 },
  brief: { type: mongoose.Schema.Types.Mixed, required: true },
  assets: { type: [assetSchema], default: [] },
  // Each version holds a validated creative plan and checkpointed render assets.
  versions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  activeVersionId: String,
  job: { type: jobSchema, default: () => ({ status: 'idle' }) },
  editLock: { token: String, expiresAt: Date }
}, { timestamps: true });
contentProjectSchema.index({ 'job.status': 1, 'job.queuedAt': 1 });
export default mongoose.model('ContentProject', contentProjectSchema);
