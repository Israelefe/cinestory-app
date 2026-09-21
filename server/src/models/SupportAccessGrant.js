import mongoose from 'mongoose';

const supportAccessGrantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  tokenDigest: { type: String, required: true, unique: true, select: false },
  reason: { type: String, required: true, trim: true, maxlength: 240 },
  status: { type: String, enum: ['active', 'used', 'revoked', 'expired'], default: 'active', index: true },
  readOnly: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: Date,
  revokedAt: Date
}, { timestamps: true });

supportAccessGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('SupportAccessGrant', supportAccessGrantSchema);
