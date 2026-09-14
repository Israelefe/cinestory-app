import mongoose from 'mongoose';

const portfolioJobSchema = new mongoose.Schema({
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['queued', 'running', 'review', 'failed'], default: 'queued', index: true },
  stage: { type: String, default: 'queued' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  attempts: { type: Number, min: 0, default: 0 },
  cursor: { type: Number, min: 0, default: 0 },
  result: mongoose.Schema.Types.Mixed,
  errorMessage: { type: String, maxlength: 500 },
  lockedAt: Date,
  completedAt: Date
}, { timestamps: true });

portfolioJobSchema.index({ status: 1, createdAt: 1 });
export default mongoose.model('PortfolioJob', portfolioJobSchema);
