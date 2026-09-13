import mongoose from 'mongoose';

const authCodeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purpose: { type: String, enum: ['verify-email', 'reset-password'], required: true },
  codeDigest: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  resendAvailableAt: { type: Date, required: true }
}, { timestamps: true });

authCodeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
export default mongoose.model('AuthCode', authCodeSchema);
