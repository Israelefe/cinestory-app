import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  sessionDigest: { type: String, required: true, unique: true },
  actorType: { type: String, enum: ['photographer', 'anonymous'], required: true },
  lastSeenAt: { type: Date, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});
export default mongoose.model('ActiveSession', schema);
