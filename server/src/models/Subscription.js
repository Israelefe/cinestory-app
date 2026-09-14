import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['paystack', 'admin'], default: 'paystack' },
  status: {
    type: String,
    enum: ['free', 'checkout_pending', 'active', 'canceling', 'past_due', 'expired', 'refunded', 'disputed'],
    default: 'checkout_pending',
    index: true
  },
  customerCode: { type: String, trim: true, index: true, sparse: true },
  subscriptionCode: { type: String, trim: true, unique: true, sparse: true },
  planCode: { type: String, trim: true },
  checkoutReference: { type: String, trim: true, unique: true, sparse: true },
  emailTokenEncrypted: { type: String, select: false },
  paidFrom: Date,
  paidThrough: Date,
  graceEndsAt: Date,
  cancelRequestedAt: Date,
  canceledAt: Date,
  lastPaymentAt: Date,
  lastPaymentReference: { type: String, trim: true },
  providerSnapshot: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

subscriptionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Subscription', subscriptionSchema);
