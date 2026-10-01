import mongoose from 'mongoose';
const schema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, required: true }, publicIds: { type: [String], required: true } }, { timestamps: true });
export default mongoose.model('PortfolioCleanup', schema);
