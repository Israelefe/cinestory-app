import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import BillingEvent from '../models/BillingEvent.js';
import Refund from '../models/Refund.js';
import User from '../models/User.js';
import { encryptBillingToken } from './paystack.service.js';
import { redactBillingSnapshot } from './billingPricing.service.js';

const validAmount = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
function monthEnd(value) {
  const date = new Date(value), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return date;
}

// Uses raw collections so schema defaults do not hide absent legacy fields.
// No provider calls, emails, access grants, charges or cancellations occur here.
export async function migrateBillingRecords({ apply = false } = {}) {
  const report = { mode: apply ? 'apply' : 'read-only', subscriptionsUpdated: 0, paymentsUpdated: 0, eventsUpdated: 0, snapshotsRedacted: 0, tokensEncrypted: 0, issues: [] };
  const issue = (kind, row, reason) => report.issues.push({ kind, id: String(row._id), reason });
  const save = async (model, row, patch, counter) => {
    if (!Object.keys(patch).length) return;
    report[counter]++;
    if (apply) await model.collection.updateOne({ _id: row._id }, { $set: patch });
  };
  for await (const row of Subscription.collection.find({})) {
    const patch = {}, snapshot = row.providerSnapshot || {};
    const payment = await Payment.collection.findOne({ subscriptionId: row._id, paidAt: { $exists: true }, status: { $in: ['success', 'partially_refunded', 'refunded', 'disputed'] } }, { sort: { paidAt: -1 } });
    const amount = validAmount(row.amountKobo) ? Number(row.amountKobo) : validAmount(payment?.amountKobo) ? Number(payment.amountKobo) : validAmount(snapshot.plan?.amount) ? Number(snapshot.plan.amount) : 2500000;
    const currency = row.currency || payment?.currency || snapshot.plan?.currency || 'NGN';
    if (row.provider !== 'admin' && (currency !== 'NGN' || ![2500000, 3000000].includes(amount))) issue('unsupported-price', row, 'Review the existing contracted price; it was not changed.');
    if (row.amountKobo === undefined) patch.amountKobo = row.provider === 'admin' ? 0 : amount;
    if (!row.currency) patch.currency = currency;
    if (!row.pricingRegion && currency === 'NGN' && [2500000, 3000000].includes(amount)) patch.pricingRegion = amount === 3000000 ? 'international' : 'nigeria';
    const customerId = snapshot.customer?.id || payment?.providerSnapshot?.customer?.id;
    const planId = snapshot.plan?.id || payment?.providerSnapshot?.plan_object?.id || payment?.providerSnapshot?.plan?.id;
    if (!row.customerProviderId && customerId) patch.customerProviderId = String(customerId);
    if (!row.planProviderId && planId) patch.planProviderId = String(planId);
    const token = snapshot.email_token || snapshot.subscription?.email_token;
    if (!row.emailTokenEncrypted && token && !row.accountDeletedAt) {
      report.tokensEncrypted++;
      patch.emailTokenEncrypted = apply ? encryptBillingToken(token) : '<encryption-required>';
    }
    if (row.providerSnapshot) {
      const safe = redactBillingSnapshot(snapshot);
      if (JSON.stringify(safe) !== JSON.stringify(snapshot)) { patch.providerSnapshot = safe; report.snapshotsRedacted++; }
    }
    if (!row.subscriptionCode && row.customerCode && !row.customerProviderId && !patch.customerProviderId) issue('missing-provider-link', row, 'Provider customer ID must be verified before recovering the recurring schedule.');
    if (row.status === 'checkout_pending') issue('pending-checkout', row, 'Verify this payment with Paystack; do not expire a possible charge based on age alone.');
    if (row.provider !== 'admin' && ['active', 'canceling', 'past_due'].includes(row.status) && !row.paidThrough) issue('missing-paid-through', row, 'Verify the paid period before granting or extending access.');
    await save(Subscription, row, patch, 'subscriptionsUpdated');
  }
  for await (const row of Payment.collection.find({})) {
    const patch = {}, snapshot = row.providerSnapshot || {};
    const subscription = row.subscriptionId ? await Subscription.collection.findOne({ _id: row.subscriptionId }) : null;
    if (!row.currency) patch.currency = 'NGN';
    if (!row.pricingRegion && (row.currency || 'NGN') === 'NGN' && [2500000, 3000000].includes(row.amountKobo)) patch.pricingRegion = row.amountKobo === 3000000 ? 'international' : 'nigeria';
    if (!row.providerTransactionId && snapshot.id) patch.providerTransactionId = String(snapshot.id);
    if (row.feesKobo === undefined && snapshot.fees != null && Number.isSafeInteger(Number(snapshot.fees))) patch.feesKobo = Number(snapshot.fees);
    if (row.paidAt && !row.periodEnd) patch.periodEnd = subscription?.lastPaymentReference === row.reference && subscription.paidThrough > row.paidAt ? subscription.paidThrough : monthEnd(row.paidAt);
    if (!row.fulfilledAt && row.status === 'success' && row.paidAt && subscription?.lastPaymentReference === row.reference && subscription.paidThrough > row.paidAt) patch.fulfilledAt = row.updatedAt || row.paidAt;
    if (row.providerSnapshot) {
      const safe = redactBillingSnapshot(snapshot);
      if (JSON.stringify(safe) !== JSON.stringify(snapshot)) { patch.providerSnapshot = safe; report.snapshotsRedacted++; }
    }
    if (row.refundedAmountKobo > 0 || row.refundPendingAmountKobo > 0) {
      const refunds = await Refund.collection.find({ paymentId: row._id }).toArray();
      const completed = refunds.filter(item => item.status === 'processed').reduce((sum, item) => sum + item.amountKobo, 0);
      if (completed < (row.refundedAmountKobo || 0) || row.refundPendingAmountKobo > 0 && !refunds.length) issue('legacy-refund', row, 'Resolve individual refund IDs and statuses in Paystack before issuing another refund. No synthetic refund record was created.');
    }
    await save(Payment, row, patch, 'paymentsUpdated');
  }
  for await (const row of BillingEvent.collection.find({ payload: { $exists: true } })) {
    const patch = {}, safe = redactBillingSnapshot(row.payload);
    if (['received', 'failed', 'processing'].includes(row.status) && !row.payloadEncrypted) {
      patch.payloadEncrypted = apply ? encryptBillingToken(JSON.stringify(row.payload)) : '<encryption-required>';
      if (!row.payload?.data) issue('unrecoverable-event', row, 'The stored event lacks its original provider data; fetch provider state rather than inventing a replay.');
    }
    if (JSON.stringify(safe) !== JSON.stringify(row.payload)) { patch.payload = safe; report.snapshotsRedacted++; }
    await save(BillingEvent, row, patch, 'eventsUpdated');
  }
  const duplicates = await Subscription.collection.aggregate([
    { $match: { provider: 'paystack', subscriptionCode: { $exists: true, $ne: '' }, providerCanceledAt: null } },
    { $group: { _id: '$userId', count: { $sum: 1 }, schedules: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  for (const row of duplicates) issue('duplicate-schedules', row, 'More than one local recurring schedule needs provider review.');
  for await (const user of User.collection.find({ plan: { $in: ['pro', 'studio'] } })) {
    const now = new Date(), grant = user.planOverride;
    if (grant?.plan === 'pro' && (!grant.expiresAt || new Date(grant.expiresAt) > now)) continue;
    if (!await Subscription.collection.findOne({ userId: user._id, $or: [{ status: { $in: ['active', 'canceling'] }, paidThrough: { $gt: now } }, { status: 'past_due', graceEndsAt: { $gt: now } }] })) issue('unbacked-pro', user, 'No current paid period or support grant backs this account. Review it before rollout; this script does not grant free indefinite access.');
  }
  return report;
}
