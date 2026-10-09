import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  title: { type: String, required: true, maxlength: 180 },
  severity: { type: String, enum: ['warning', 'critical'], default: 'warning' },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
  firstSeenAt: Date, lastSeenAt: Date, resolvedAt: Date,
  occurrences: { type: Number, default: 0 },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  notifiedAt: Date, notificationStatus: { type: String, default: 'not-configured' },
  notificationLeaseUntil: Date,
  history: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });
export default mongoose.model('OperationalAlert', schema);
