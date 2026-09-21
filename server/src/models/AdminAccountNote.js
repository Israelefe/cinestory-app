import mongoose from 'mongoose';

const adminAccountNoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  category: { type: String, enum: ['general', 'support', 'billing', 'privacy', 'technical'], default: 'general' },
  note: { type: String, required: true, trim: true, maxlength: 2000 }
}, { timestamps: true });

adminAccountNoteSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('AdminAccountNote', adminAccountNoteSchema);
