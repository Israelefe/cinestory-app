import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  refreshTokenDigest: { type: String, required: true, unique: true, select: false },
  csrfTokenDigest: { type: String, required: true, select: false },
  userAgent: { type: String, maxlength: 500 },
  ipAddress: { type: String, maxlength: 100 },
  persistent: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date }
}, { timestamps: true });
export default mongoose.model('Session', sessionSchema);
