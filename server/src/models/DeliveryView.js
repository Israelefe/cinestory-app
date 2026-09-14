import mongoose from 'mongoose';

const deliveryViewSchema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true, index: true },
  visitorDigest: { type: String, required: true, maxlength: 128 }
}, { timestamps: true });

deliveryViewSchema.index({ deliveryId: 1, visitorDigest: 1 }, { unique: true });
export default mongoose.model('DeliveryView', deliveryViewSchema);
