import mongoose from 'mongoose';

const emailDeliverySchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 240 },
  kind: { type: String, required: true, trim: true, maxlength: 80, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', index: true, sparse: true },
  recipientEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'skipped'], default: 'pending', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  providerId: { type: String, trim: true, maxlength: 200 },
  failure: { type: String, trim: true, maxlength: 500 },
  leaseUntil: Date,
  sentAt: Date,
  skippedAt: Date
}, { timestamps: true });

emailDeliverySchema.index({ userId: 1, createdAt: -1 });
emailDeliverySchema.index({ deliveryId: 1, createdAt: -1 });

export default mongoose.model('EmailDelivery', emailDeliverySchema);
