import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  variants: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  source: { type: String, enum: ['uploaded', 'generated'], default: 'uploaded' },
  originalKey: String,
  design: { title: String, photoId: String, uploadedAssetId: mongoose.Schema.Types.ObjectId },
  width: Number,
  height: Number
}, { timestamps: true });
export default mongoose.model('BlogAsset', schema);
