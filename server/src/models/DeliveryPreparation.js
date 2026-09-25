import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  sourceVersion: { type: Number, required: true },
  baseRevisionId: mongoose.Schema.Types.ObjectId,
  kind: { type: String, enum: ['prepare', 'caption', 'narration'], default: 'prepare' },
  state: { type: String, enum: ['working', 'ready', 'available', 'cancelled', 'superseded'], default: 'working', index: true },
  input: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  taskInput: { type: mongoose.Schema.Types.Mixed, select: false },
  completedAt: Date,
  durationMs: Number,
  metrics: mongoose.Schema.Types.Mixed
}, { timestamps: true });
export default mongoose.model('DeliveryPreparation', schema);
