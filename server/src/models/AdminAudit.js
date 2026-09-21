import mongoose from 'mongoose';
import crypto from 'crypto';

const adminAuditSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, trim: true },
  resourceType: { type: String, trim: true },
  resourceId: { type: String, trim: true },
  details: { type: mongoose.Schema.Types.Mixed },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String, trim: true, maxlength: 100 },
  userAgent: { type: String, trim: true, maxlength: 500 },
  previousHash: { type: String, trim: true, maxlength: 64 },
  // Sparse keeps existing pre-V2 audit rows indexable while every new row is
  // assigned a hash by the save hook below.
  eventHash: { type: String, required: true, unique: true, sparse: true, trim: true, maxlength: 64 },
  immutable: { type: Boolean, default: true, immutable: true }
}, { timestamps: true });

adminAuditSchema.pre(['validate', 'save'], async function () {
  if (this.eventHash) return;
  if (this.before === undefined && this.details && typeof this.details === 'object' && this.details.before !== undefined) this.before = this.details.before;
  if (this.after === undefined && this.details && typeof this.details === 'object' && this.details.after !== undefined) this.after = this.details.after;
  try {
    const previous = await this.constructor.findOne({ eventHash: { $exists: true } }).sort({ createdAt: -1, _id: -1 }).select('eventHash').lean();
    this.previousHash = previous?.eventHash || null;
  } catch {
    this.previousHash = null;
  }
  const payload = {
    adminId: String(this.adminId),
    userId: this.userId ? String(this.userId) : null,
    action: this.action,
    resourceType: this.resourceType || null,
    resourceId: this.resourceId || null,
    details: this.details || null,
    before: this.before || null,
    after: this.after || null,
    ipAddress: this.ipAddress || null,
    userAgent: this.userAgent || null,
    previousHash: this.previousHash,
    createdAt: this.createdAt || new Date()
  };
  this.eventHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
});

adminAuditSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error('Administrator audit records are immutable.'));
});

export default mongoose.model('AdminAudit', adminAuditSchema);
