import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  instance: { type: String, required: true, index: true },
  observedAt: { type: Date, default: Date.now },
  process: { type: mongoose.Schema.Types.Mixed },
  requests: { type: mongoose.Schema.Types.Mixed }
});
schema.index({ observedAt: 1 }, { expireAfterSeconds: 7 * 86400 });
export default mongoose.model('OperationalSample', schema);
