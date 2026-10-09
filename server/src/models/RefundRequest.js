import mongoose from 'mongoose';
export const REFUND_REASONS = ['change-of-mind', 'duplicate-charge', 'charged-after-cancellation', 'paid-access-missing', 'service-failure', 'other'];
export const REFUND_POLICY_VERSION = '2026-10-09';
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true, unique: true },
  reason: { type: String, enum: REFUND_REASONS, required: true },
  receivedAt: { type: Date, required: true, default: Date.now, immutable: true },
  policyVersion: { type: String, default: REFUND_POLICY_VERSION, immutable: true },
  status: { type: String, enum: ['open', 'needs-information', 'approved', 'declined'], default: 'open', index: true },
  evidence: mongoose.Schema.Types.Mixed,
  decisionNote: { type: String, maxlength: 1000 },
  customerNote: { type: String, maxlength: 1000 },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  decidedAt: Date,
  refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund' },
  accountDeletedAt: Date, retainUntil: Date
}, { timestamps: true });
export default mongoose.model('RefundRequest', schema);
