import mongoose from 'mongoose';

const deliveryJobSchema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['analyze', 'direct', 'revise', 'narrate'], required: true },
  status: { type: String, enum: ['queued', 'running', 'needs_input', 'review', 'failed'], default: 'queued', index: true },
  stage: { type: String, trim: true, default: 'queued' },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  attempts: { type: Number, default: 0, min: 0 },
  input: { type: mongoose.Schema.Types.Mixed, select: false },
  result: { type: mongoose.Schema.Types.Mixed },
  cursor: { type: Number, default: 0, min: 0 },
  errorCode: { type: String, trim: true },
  errorMessage: { type: String, trim: true, maxlength: 500 },
  lockedAt: Date,
  heartbeatAt: Date,
  lockedBy: { type: String, trim: true },
  completedAt: Date
}, { timestamps: true });

deliveryJobSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('DeliveryJob', deliveryJobSchema);
