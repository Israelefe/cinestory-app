import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  owner: String, leaseUntil: Date,
  pendingReference: String
}, { timestamps: true });
export default mongoose.model('BillingLock', schema);
