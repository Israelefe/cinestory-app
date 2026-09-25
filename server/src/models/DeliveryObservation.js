import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  observation: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });
export default mongoose.model('DeliveryObservation', schema);
