import mongoose from 'mongoose';

const accountDeletionRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'processing', 'completed'], default: 'pending', index: true },
  source: { type: String, enum: ['user', 'support', 'admin'], default: 'user' },
  reason: { type: String, trim: true, maxlength: 1000, default: '' },
  resolutionNote: { type: String, trim: true, maxlength: 1000, default: '' },
  requestedAt: { type: Date, default: Date.now, index: true },
  resolvedAt: Date,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, index: true }
}, { timestamps: true });

accountDeletionRequestSchema.index({ status: 1, requestedAt: -1 });

export default mongoose.model('AccountDeletionRequest', accountDeletionRequestSchema);
