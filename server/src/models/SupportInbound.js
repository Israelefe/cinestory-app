import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  sourceKey: { type: String, required: true, unique: true },
  mailbox: { type: String, required: true }, emailMessageId: String,
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket' },
  status: { type: String, enum: ['imported', 'skipped'], default: 'imported' }, reason: String
}, { timestamps: true });
schema.index({ mailbox: 1, emailMessageId: 1 });
export default mongoose.model('SupportInbound', schema);
