import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, trim: true, required: true, maxlength: 100 }
}, { timestamps: true });
schema.index({ userId: 1, name: 1 }, { unique: true });
export default mongoose.model('LibraryShoot', schema);
