import mongoose from 'mongoose';

const adminSessionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  tokenDigest: { type: String, required: true, unique: true, select: false },
  userAgent: { type: String, trim: true, maxlength: 500 },
  ipAddress: { type: String, trim: true, maxlength: 100 },
  deviceLabel: { type: String, trim: true, maxlength: 120 },
  twoFactorVerified: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date }
}, { timestamps: true });

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
adminSessionSchema.index({ adminId: 1, revokedAt: 1, expiresAt: 1 });

export default mongoose.model('AdminSession', adminSessionSchema);
