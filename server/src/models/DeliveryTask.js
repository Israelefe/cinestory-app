import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  runId: { type: mongoose.Schema.Types.ObjectId, index: true },
  kind: { type: String, enum: ['observe', 'writing', 'caption', 'narration'], required: true },
  state: { type: String, enum: ['queued', 'running', 'done', 'unavailable', 'cancelled'], default: 'queued' },
  input: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  output: mongoose.Schema.Types.Mixed,
  attempts: { type: Number, default: 0 },
  priority: { type: Number, default: 0 },
  availableAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  leaseToken: String,
  startedAt: Date,
  completedAt: Date,
  diagnostic: { type: String, select: false }
}, { timestamps: true });
schema.index({ state: 1, priority: -1, availableAt: 1, createdAt: 1 });
export default mongoose.model('DeliveryTask', schema);
