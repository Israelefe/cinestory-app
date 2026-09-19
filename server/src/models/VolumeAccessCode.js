import mongoose from 'mongoose';

const volumeAccessCodeSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'VolumeJob', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'VolumeSubject', required: true, index: true },
  codeDigest: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0, min: 0, max: 6 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: Date
}, { timestamps: true });

export default mongoose.model('VolumeAccessCode', volumeAccessCodeSchema);
