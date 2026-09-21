import mongoose from 'mongoose';

const adminLoginAttemptSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', index: true },
  username: { type: String, trim: true, lowercase: true, maxlength: 80, index: true },
  success: { type: Boolean, required: true, index: true },
  reason: { type: String, trim: true, maxlength: 80 },
  ipAddress: { type: String, trim: true, maxlength: 100 },
  userAgent: { type: String, trim: true, maxlength: 500 },
  twoFactorRequired: { type: Boolean, default: false },
  twoFactorVerified: { type: Boolean, default: false }
}, { timestamps: true });

adminLoginAttemptSchema.index({ createdAt: -1 });

export default mongoose.model('AdminLoginAttempt', adminLoginAttemptSchema);
