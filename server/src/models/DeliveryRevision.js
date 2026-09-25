import mongoose from 'mongoose';

// Append-only snapshots. A delivery changes pointers, never a saved presentation.
const schema = new mongoose.Schema({
  deliveryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceVersion: { type: Number, required: true },
  parentRevisionId: mongoose.Schema.Types.ObjectId,
  origin: { type: String, enum: ['supplied', 'ai', 'edited'], required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });
export default mongoose.model('DeliveryRevision', schema);
