import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true }, width: Number, height: Number,
  variants: { type: Map, of: String, default: {} }
}, { timestamps: true });
export default mongoose.model('PortfolioMedia', schema);
