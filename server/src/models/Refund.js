import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  providerId: { type: String, unique: true, sparse: true },
  requestKey: { type: String, unique: true, sparse: true },
  amountKobo: { type: Number, required: true, min: 1 }, currency: { type: String, default: 'NGN' },
  status: { type: String, enum: ['requested', 'pending', 'processing', 'needs-attention', 'failed', 'processed', 'uncertain'], default: 'requested', index: true },
  reason: { type: String, maxlength: 500 },
  customerNote: { type: String, maxlength: 1000 },
  policyReason: { type: String, maxlength: 80 },
  refundRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundRequest' },
  evidence: { type: mongoose.Schema.Types.Mixed },
  processedAt: Date, accountDeletedAt: Date, retainUntil: Date,
  providerSnapshot: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });
export default mongoose.model('Refund', schema);
