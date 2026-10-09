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
export async function refundEvidence(payment, now = new Date(), { requestedAt } = {}) {
  const start = payment.paidAt || payment.createdAt;
  const end = payment.periodEnd || new Date(new Date(start).getTime() + 32 * 86400000);
  const [first, usage, deliveries, stories, storage, portfolio] = await Promise.all([
    Payment.findOne({ userId: payment.userId, paidAt: { $type: 'date' }, status: { $in: ['success', 'partially_refunded', 'refunded', 'disputed'] } }).sort({ paidAt: 1, _id: 1 }).lean(),
    PaidUsage.find({ userId: payment.userId, usedAt: { $gte: start, $lt: end } }).sort({ usedAt: 1 }).lean(),
    Delivery.countDocuments({ userId: payment.userId, publishedAt: { $gte: start, $lt: end } }),
    PhotoStory.countDocuments({ userId: payment.userId, status: 'published', createdAt: { $gte: start, $lt: end } }),
    StorageAsset.exists({ userId: payment.userId, createdAt: { $gte: start, $lt: end } }),
    Portfolio.exists({ userId: payment.userId, $or: [{ createdAt: { $gte: start, $lt: end } }, { publishedAt: { $gte: start, $lt: end } }, { updatedAt: { $gte: start, $lt: end } }] })
  ]);
  const used = usage.length > 0 || deliveries + stories > 0 || Boolean(storage || portfolio);
  const firstPayment = String(first?._id) === String(payment._id);
  const receivedAt = new Date(requestedAt || now);
  const elapsed = receivedAt - new Date(start);
  const withinSevenDays = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 7 * 86400000 && receivedAt <= now;
  const ledgerStart = new Date(process.env.PAID_USAGE_LEDGER_STARTED_AT || 'invalid');
  const coverageKnown = Number.isFinite(ledgerStart.getTime()) && new Date(start) >= ledgerStart && Boolean(payment.paidAt && payment.periodEnd);
  return { firstPayment, withinSevenDays, requestedAt: requestedAt ? receivedAt : null,
    period: { start, end, estimated: !payment.periodEnd },
    coverage: coverageKnown ? 'recorded-period' : 'manual-review',
    coverageNote: coverageKnown ? 'Recorded activity is retained when a delivery or file is deleted.' : 'Historical activity may be incomplete. No recorded use is not proof that the paid service was unused.',
    usageByKind: Object.fromEntries(['delivery', 'storage', 'portfolio'].map(kind => [kind, usage.filter(item => item.kind === kind).length])),
    timeline: usage.slice(0, 100).map(item => ({ id: item._id, kind: item.kind, usedAt: item.usedAt, retainedAfterDeletion: true })),
    timelineTruncated: usage.length > 100,
    usageCounts: { recorded: usage.length, deliveries, stories, storage: Boolean(storage), portfolio: Boolean(portfolio) },
    eligibleForChangeOfMind: firstPayment && withinSevenDays && !used && ['success', 'partially_refunded'].includes(payment.status),
    reviewRequired: true, checkedAt: now };
}
