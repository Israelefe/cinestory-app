import crypto from 'crypto';
import mongoose from 'mongoose';

const volumeJobSchema = new mongoose.Schema({
  publicId: { type: String, unique: true, index: true, default: () => crypto.randomBytes(18).toString('base64url') },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  organisation: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, enum: ['school', 'sports', 'corporate', 'other'], required: true },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  subjectCount: { type: Number, default: 0, min: 0, max: 1000 },
  assignedPhotoCount: { type: Number, default: 0, min: 0, max: 5000 },
  publishedAt: Date,
  archivedAt: Date,
  accessVersion: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

volumeJobSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('VolumeJob', volumeJobSchema);
