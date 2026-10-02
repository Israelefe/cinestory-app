import PaidUsage from '../models/PaidUsage.js';
import Payment from '../models/Payment.js';
import Delivery from '../models/Delivery.js';
import PhotoStory from '../models/PhotoStory.js';
import StorageAsset from '../models/StorageAsset.js';
import Portfolio from '../models/Portfolio.js';
export async function recordPaidUsage(userId, kind, id, usedAt = new Date()) {
  const key = `${kind}:${id}:${new Date(usedAt).toISOString()}`;
  await PaidUsage.updateOne({ key }, { $setOnInsert: { key, userId, kind, usedAt } }, { upsert: true });
}
export async function refundEvidence(payment, now = new Date()) {
  const start = payment.paidAt || payment.createdAt;
  const end = payment.periodEnd || new Date(new Date(start).getTime() + 32 * 86400000);
  const [first, usage, deliveries, stories, storage, portfolio] = await Promise.all([
    Payment.findOne({ userId: payment.userId, paidAt: { $exists: true } }).sort({ paidAt: 1 }).lean(),
    PaidUsage.find({ userId: payment.userId, usedAt: { $gte: start, $lt: end } }).lean(),
    Delivery.countDocuments({ userId: payment.userId, publishedAt: { $gte: start, $lt: end } }),
    PhotoStory.countDocuments({ userId: payment.userId, status: 'published', createdAt: { $gte: start, $lt: end } }),
    StorageAsset.exists({ userId: payment.userId, createdAt: { $gte: start, $lt: end } }),
    Portfolio.exists({ userId: payment.userId, $or: [{ createdAt: { $gte: start, $lt: end } }, { publishedAt: { $gte: start, $lt: end } }, { updatedAt: { $gte: start, $lt: end } }] })
  ]);
  const used = usage.length > 0 || deliveries + stories > 0 || Boolean(storage || portfolio);
  return { firstPayment: String(first?._id) === String(payment._id), withinSevenDays: now - new Date(start) <= 7 * 86400000,
    usageCounts: { recorded: usage.length, deliveries, stories, storage: Boolean(storage), portfolio: Boolean(portfolio) },
    eligibleForChangeOfMind: String(first?._id) === String(payment._id) && now - new Date(start) <= 7 * 86400000 && !used,
    reviewRequired: true, checkedAt: now };
}
