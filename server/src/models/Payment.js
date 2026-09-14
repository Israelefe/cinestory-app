import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', index: true },
  provider: { type: String, default: 'paystack' },
  reference: { type: String, required: true, unique: true, trim: true },
  providerTransactionId: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'success', 'failed', 'refunded', 'partially_refunded', 'disputed'], default: 'pending' },
  amountKobo: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'NGN' },
  channel: { type: String, trim: true },
  paidAt: Date,
  refundedAmountKobo: { type: Number, default: 0, min: 0 },
  refundPendingAmountKobo: { type: Number, default: 0, min: 0 },
  providerSnapshot: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

export default mongoose.model('Payment', paymentSchema);
