import mongoose from 'mongoose';
const enquirySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true },
  requestId: { type: String, required: true, maxlength: 80, select: false },
  fingerprint: { type: String, required: true, select: false },
  name: { type: String, required: true, maxlength: 100 },
  replyMethod: { type: String, enum: ['email', 'whatsapp'], required: true },
  replyTo: { type: String, required: true, maxlength: 254 },
  shootType: { type: String, required: true, maxlength: 100 },
  message: { type: String, required: true, maxlength: 2000 },
  consentedAt: { type: Date, default: Date.now },
  date: { type: String, maxlength: 10, default: '' }, location: { type: String, maxlength: 120, default: '' }, budget: { type: String, maxlength: 100, default: '' },
  projectId: { type: String, maxlength: 80, default: '' }, categoryId: { type: String, maxlength: 80, default: '' }, serviceId: { type: String, maxlength: 80, default: '' }, sourceLabel: { type: String, maxlength: 180, default: '' },
  status: { type: String, enum: ['new', 'replied', 'closed'], default: 'new' },
  notification: { status: { type: String, enum: ['pending', 'sending', 'sent', 'skipped'], default: 'pending' }, attempts: { type: Number, default: 0 }, retryAt: { type: Date, default: Date.now }, leaseUntil: Date }
}, { timestamps: true });
enquirySchema.index({ portfolioId: 1, requestId: 1 }, { unique: true });
enquirySchema.index({ userId: 1, status: 1, createdAt: -1 });
enquirySchema.index({ 'notification.status': 1, 'notification.retryAt': 1 });
export default mongoose.model('PortfolioEnquiry', enquirySchema);
