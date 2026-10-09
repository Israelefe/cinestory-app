import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  mailbox: { type: String, enum: ['general', 'billing'], required: true, unique: true },
  uidValidity: String, lastUid: { type: Number, default: 0 },
  leaseUntil: Date, leaseOwner: String, lastAttemptAt: Date, lastSuccessAt: Date,
  status: { type: String, enum: ['not-configured', 'syncing', 'connected', 'error'], default: 'not-configured' },
  failureCode: String, importedCount: { type: Number, default: 0 }, skippedCount: { type: Number, default: 0 }
}, { timestamps: true });
export default mongoose.model('SupportMailbox', schema);
