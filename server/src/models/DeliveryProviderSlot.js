import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String,
  token: String,
  leaseUntil: { type: Date, default: () => new Date(0) },
  nextStartAt: { type: Date, default: () => new Date(0) }
}, { versionKey: false });
export default mongoose.model('DeliveryProviderSlot', schema);
