import mongoose from 'mongoose';
import { studioError } from './media.js';

const schema = new mongoose.Schema({ _id: String, used: { type: Number, default: 0 }, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Allowance = mongoose.models.ContentAllowance || mongoose.model('ContentAllowance', schema);
export function dailyLimit() { return Math.max(1, Math.min(10000, Number(process.env.CONTENT_DAILY_UNITS) || 150)); }
export async function allowance() {
  const record = await Allowance.findById(new Date().toISOString().slice(0, 10)).lean();
  return { used: record?.used || 0, limit: dailyLimit(), resets: '00:00 UTC' };
}
export async function consumeUnits(units) {
  const day = new Date().toISOString().slice(0, 10);
  try { await Allowance.updateOne({ _id: day }, { $setOnInsert: { used: 0, expiresAt: new Date(Date.now() + 7 * 86400000) } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const result = await Allowance.findOneAndUpdate({ _id: day, used: { $lte: dailyLimit() - units } }, { $inc: { used: units } }, { new: true });
  if (!result) throw studioError('The daily generation allowance is used up. Retry after 00:00 UTC or increase CONTENT_DAILY_UNITS.', 429);
}
