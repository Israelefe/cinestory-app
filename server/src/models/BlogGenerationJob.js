import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, default: null },
  kind: { type: String, enum: ['topics', 'article'], required: true },
  status: { type: String, enum: ['queued', 'running', 'ready', 'failed', 'cancelled'], default: 'queued' },
  active: { type: Boolean, default: true },
  input: { type: mongoose.Schema.Types.Mixed, required: true },
  inputRevision: Number,
  result: mongoose.Schema.Types.Mixed,
  error: { type: String, default: '' },
  errorCode: { type: String, default: '' },
  conflicts: { type: [{ id: String, title: String, url: String, _id: false }], default: [] },
  stage: { type: String, default: '' },
  cover: mongoose.Schema.Types.Mixed,
  leaseId: String,
  heartbeatAt: Date,
  completedAt: Date
}, { timestamps: true, minimize: false });
schema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ status: 1, createdAt: 1 });
export default mongoose.model('BlogGenerationJob', schema);
