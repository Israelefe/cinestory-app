import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  survey: { type: String, enum: ['dashboard-ease-v1'], required: true },
  score: { type: Number, min: 1, max: 5, required: true },
  submittedAt: { type: Date, default: Date.now }
});
schema.index({ userId: 1, survey: 1 }, { unique: true });
export default mongoose.model('ProductFeedback', schema);
