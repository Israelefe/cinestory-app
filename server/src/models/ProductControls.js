import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, default: 'product' },
  replayEnabled: { type: Boolean, default: false },
  replaySamplePercent: { type: Number, default: 10, min: 0, max: 100 },
  feedbackEnabled: { type: Boolean, default: false },
  guidanceEnabled: { type: Boolean, default: false },
  guidanceRolloutPercent: { type: Number, default: 10, min: 0, max: 100 },
  guidanceExperimentEnabled: { type: Boolean, default: false },
  alertEmail: { type: String, default: '', maxlength: 254 },
  revision: { type: Number, default: 0 }
}, { timestamps: true });
export default mongoose.model('ProductControls', schema);
