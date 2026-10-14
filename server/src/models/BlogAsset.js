import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  variants: { type: mongoose.Schema.Types.Mixed, required: true },
  width: Number,
  height: Number
}, { timestamps: true });
export default mongoose.model('BlogAsset', schema);
