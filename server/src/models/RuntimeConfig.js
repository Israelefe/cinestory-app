import mongoose from 'mongoose';

const runtimeConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true, default: 'global' },
  plans: { type: mongoose.Schema.Types.Mixed, default: {} },
  formats: { type: mongoose.Schema.Types.Mixed, default: {} },
  featureFlags: { type: mongoose.Schema.Types.Mixed, default: {} },
  maintenance: { type: mongoose.Schema.Types.Mixed, default: {} },
  narration: { type: mongoose.Schema.Types.Mixed, default: {} },
  retention: { type: mongoose.Schema.Types.Mixed, default: {} },
  rateLimits: { type: mongoose.Schema.Types.Mixed, default: {} },
  emailTemplates: { type: mongoose.Schema.Types.Mixed, default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, { timestamps: true });

export default mongoose.model('RuntimeConfig', runtimeConfigSchema);
