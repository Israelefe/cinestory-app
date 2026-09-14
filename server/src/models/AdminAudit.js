import mongoose from 'mongoose';

const adminAuditSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, trim: true },
  resourceType: { type: String, trim: true },
  resourceId: { type: String, trim: true },
  details: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

export default mongoose.model('AdminAudit', adminAuditSchema);
