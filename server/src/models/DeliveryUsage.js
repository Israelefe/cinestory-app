import mongoose from 'mongoose';

const deliveryUsageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  publishedDeliveries: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

deliveryUsageSchema.index({ userId: 1, periodStart: -1 });

export default mongoose.model('DeliveryUsage', deliveryUsageSchema);
