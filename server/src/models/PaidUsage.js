import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  key: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['delivery', 'storage', 'portfolio'], required: true },
  usedAt: { type: Date, default: Date.now, index: true }, accountDeletedAt: Date, retainUntil: Date
}, { timestamps: true });
export default mongoose.model('PaidUsage', schema);
