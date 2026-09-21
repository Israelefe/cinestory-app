import mongoose from 'mongoose';

const analyticsEventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120, index: true },
  version: { type: Number, default: 1, min: 1 },
  source: { type: String, enum: ['client', 'server', 'system'], default: 'server', index: true },
  actorType: { type: String, enum: ['photographer', 'client', 'guest', 'admin', 'system', 'anonymous'], default: 'system', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', index: true },
  sessionDigest: { type: String, trim: true, maxlength: 128, index: true },
  format: { type: String, trim: true, maxlength: 60, index: true },
  status: { type: String, trim: true, maxlength: 60, index: true },
  errorCode: { type: String, trim: true, maxlength: 120, index: true },
  route: { type: String, trim: true, maxlength: 200 },
  deviceType: { type: String, trim: true, maxlength: 30 },
  browser: { type: String, trim: true, maxlength: 80 },
  operatingSystem: { type: String, trim: true, maxlength: 80 },
  viewport: { type: String, trim: true, maxlength: 30 },
  connection: { type: String, trim: true, maxlength: 30 },
  durationMs: { type: Number, min: 0, max: 86_400_000 },
  count: { type: Number, min: 0, max: 1_000_000 },
  bytes: { type: Number, min: 0, max: 10_000_000_000_000 },
  metadata: { type: mongoose.Schema.Types.Mixed },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

analyticsEventSchema.index({ name: 1, occurredAt: -1 });
analyticsEventSchema.index({ userId: 1, occurredAt: -1 });
analyticsEventSchema.index({ deliveryId: 1, occurredAt: -1 });

export default mongoose.model('AnalyticsEvent', analyticsEventSchema);
