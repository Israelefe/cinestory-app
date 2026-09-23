import mongoose from 'mongoose';

const deliveryJobSchema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['analyze', 'direct', 'revise', 'narrate'], required: true },
  status: { type: String, enum: ['queued', 'running', 'needs_input', 'review', 'failed', 'cancelled'], default: 'queued', index: true },
  stage: { type: String, trim: true, default: 'queued' },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  attempts: { type: Number, default: 0, min: 0 },
  input: { type: mongoose.Schema.Types.Mixed, select: false },
  result: { type: mongoose.Schema.Types.Mixed },
  cursor: { type: Number, default: 0, min: 0 },
  errorCode: { type: String, trim: true },
  errorMessage: { type: String, trim: true, maxlength: 500 },
  provider: { type: String, trim: true, maxlength: 80, default: 'Alibaba Model Studio' },
  promptVersion: { type: String, trim: true, maxlength: 80 },
  renderVersion: { type: String, trim: true, maxlength: 100 },
  providerLatencyMs: { type: Number, min: 0 },
  stageTimings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  captionFailures: { type: Number, min: 0, default: 0 },
  timingFailures: { type: Number, min: 0, default: 0 },
  cancelRequestedAt: Date,
  cancelledAt: Date,
  lockedAt: Date,
  heartbeatAt: Date,
  lockedBy: { type: String, trim: true },
  completedAt: Date
}, { timestamps: true });

deliveryJobSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('DeliveryJob', deliveryJobSchema);
