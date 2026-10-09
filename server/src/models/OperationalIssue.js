import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true },
  source: { type: String, enum: ['api', 'browser', 'worker'], required: true },
  code: { type: String, maxlength: 80, required: true },
  route: { type: String, maxlength: 160 },
  frames: { type: [String], default: [] },
  occurrences: { type: Number, default: 0 },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
  assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  resolution: { type: String, maxlength: 1000 },
  resolvedAt: Date,
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('OperationalIssue', schema);
