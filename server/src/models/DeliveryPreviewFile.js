import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  assetId: { type: String, required: true },
  renderKey: { type: String, required: true },
  variants: [{ width: Number, height: Number, publicId: String, _id: false }]
}, { timestamps: true });
schema.index({ deliveryId: 1, assetId: 1, renderKey: 1 }, { unique: true });
export default mongoose.model('DeliveryPreviewFile', schema);
