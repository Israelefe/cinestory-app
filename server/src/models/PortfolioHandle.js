import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  handle: { type: String, required: true, unique: true }, portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
  reservedUntil: Date
}, { timestamps: true });
export default mongoose.model('PortfolioHandle', schema);
