import mongoose from 'mongoose';

const volumeSubjectSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'VolumeJob', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipientCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  displayName: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, select: false },
  assetIds: { type: [String], default: [], validate: value => value.length <= 500 }
}, { timestamps: true });

volumeSubjectSchema.index({ jobId: 1, recipientCode: 1 }, { unique: true });
volumeSubjectSchema.index({ jobId: 1, email: 1 });

export default mongoose.model('VolumeSubject', volumeSubjectSchema);
