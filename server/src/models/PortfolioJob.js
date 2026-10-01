import mongoose from 'mongoose';

const portfolioJobSchema = new mongoose.Schema({
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  active: { type: Boolean, default: true }, inputRevision: { type: Number, default: 0 }, input: mongoose.Schema.Types.Mixed,
  reviewDecision: { type: String, enum: ['accepted', 'dismissed'] },
  status: { type: String, enum: ['queued', 'running', 'review', 'failed', 'cancelled'], default: 'queued', index: true },
  stage: { type: String, default: 'queued' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  attempts: { type: Number, min: 0, default: 0 },
  provider: { type: String, trim: true, maxlength: 80, default: 'Alibaba Model Studio' },
  promptVersion: { type: String, trim: true, maxlength: 80 },
  providerLatencyMs: { type: Number, min: 0 },
  cancelRequestedAt: Date,
  cancelledAt: Date,
  cursor: { type: Number, min: 0, default: 0 },
  result: mongoose.Schema.Types.Mixed,
  errorCode: { type: String, trim: true, maxlength: 120 },
  errorMessage: { type: String, maxlength: 500 },
  lockedAt: Date,
  leaseId: String,
  completedAt: Date
}, { timestamps: true });

portfolioJobSchema.index({ status: 1, createdAt: 1 });
portfolioJobSchema.index({ portfolioId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_portfolio_job' });
export default mongoose.model('PortfolioJob', portfolioJobSchema);
