import mongoose from 'mongoose';

const billingEventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  eventType: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  provider: { type: String, default: 'paystack' },
  status: { type: String, enum: ['received', 'processed', 'ignored', 'failed'], default: 'received' },
  attempts: { type: Number, default: 0 },
  processedAt: Date,
  failure: { type: String, maxlength: 500 },
  payload: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

export default mongoose.model('BillingEvent', billingEventSchema);
