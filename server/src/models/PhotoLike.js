import mongoose from 'mongoose';

const photoLikeSchema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true, index: true },
  assetId: { type: String, required: true },
  visitorDigest: { type: String, required: true }
}, { timestamps: true });

photoLikeSchema.index({ deliveryId: 1, assetId: 1, visitorDigest: 1 }, { unique: true });

export default mongoose.model('PhotoLike', photoLikeSchema);
