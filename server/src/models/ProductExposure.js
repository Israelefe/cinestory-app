import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  experiment: { type: String, required: true, enum: ['dashboard-guidance-v1'] },
  variant: { type: String, required: true, enum: ['control', 'guided'] },
  exposedAt: { type: Date, default: Date.now, required: true }
});
schema.index({ userId: 1, experiment: 1 }, { unique: true });
schema.index({ experiment: 1, exposedAt: 1 });
export default mongoose.model('ProductExposure', schema);
