import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'failed', 'uncertain'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 }, leaseUntil: Date, retryAfter: Date,
  emailMessageId: String, failureCode: String, sentAt: Date,
  sentCopyStatus: { type: String, enum: ['pending', 'saved', 'failed', 'unavailable'], default: 'pending' }
}, { timestamps: true });
export default mongoose.model('SupportOutbox', schema);
