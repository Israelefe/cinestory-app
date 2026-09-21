import mongoose from 'mongoose';

const analyticsEventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120, index: true },
  version: { type: Number, default: 1, min: 1 },
  source: { type: String, enum: ['client', 'server', 'system'], default: 'server', index: true },
  actorType: { type: String, enum: ['photographer', 'client', 'guest', 'admin', 'system', 'anonymous'], default: 'system', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', index: true },
  sessionDigest: { type: String, trim: true, maxlength: 128, index: true },
  visitorDigest: { type: String, trim: true, maxlength: 128, index: true },
  format: { type: String, trim: true, maxlength: 60, index: true },
  status: { type: String, trim: true, maxlength: 60, index: true },
  errorCode: { type: String, trim: true, maxlength: 120, index: true },
  route: { type: String, trim: true, maxlength: 200 },
  deviceType: { type: String, trim: true, maxlength: 30 },
  browser: { type: String, trim: true, maxlength: 80 },
  operatingSystem: { type: String, trim: true, maxlength: 80 },
  viewport: { type: String, trim: true, maxlength: 30 },
  connection: { type: String, trim: true, maxlength: 30 },
  trafficSource: { type: String, trim: true, maxlength: 80, index: true },
  trafficMedium: { type: String, trim: true, maxlength: 80, index: true },
  trafficCampaign: { type: String, trim: true, maxlength: 100, index: true },
  trafficTerm: { type: String, trim: true, maxlength: 100 },
  trafficContent: { type: String, trim: true, maxlength: 100 },
  referrerHost: { type: String, trim: true, maxlength: 100, index: true },
  landingPath: { type: String, trim: true, maxlength: 200, index: true },
  countryCode: { type: String, trim: true, uppercase: true, maxlength: 3, index: true },
  regionCode: { type: String, trim: true, maxlength: 80 },
  durationMs: { type: Number, min: 0, max: 86_400_000 },
  count: { type: Number, min: 0, max: 1_000_000 },
  bytes: { type: Number, min: 0, max: 10_000_000_000_000 },
  metadata: { type: mongoose.Schema.Types.Mixed },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

analyticsEventSchema.index({ name: 1, occurredAt: -1 });
analyticsEventSchema.index({ userId: 1, occurredAt: -1 });
analyticsEventSchema.index({ deliveryId: 1, occurredAt: -1 });
analyticsEventSchema.index({ sessionDigest: 1, occurredAt: 1 });
analyticsEventSchema.index({ visitorDigest: 1, occurredAt: 1 });
analyticsEventSchema.index({ source: 1, name: 1, occurredAt: -1 });

export default mongoose.model('AnalyticsEvent', analyticsEventSchema);
