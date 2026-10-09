import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, enum: ['api', 'website'], required: true, unique: true },
  healthy: Boolean, latencyMs: Number, checkedAt: Date, receivedAt: Date,
  failures: { type: Number, default: 0 }
});
export default mongoose.model('MonitorCheck', schema);
