import BillingEvent from '../models/BillingEvent.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import Refund from '../models/Refund.js';
import { withBillingLock } from './billingLock.service.js';
import PaidUsage from '../models/PaidUsage.js';
import { processStoredBillingEvent, processWebhookEvent, reconcilePayment, syncBillingPlan } from '../controllers/billing.controller.js';
import { billingConfigured, paystackRequest } from './paystack.service.js';
import { retryBillingEmails } from './email.service.js';
import { stopRecurringSubscription, recoverSubscriptionLink } from './billingCancellation.service.js';
let running = false, timer;
export async function runBillingMaintenance() {
  if (running) return;
  running = true;
  const now = new Date();
  const attempt = async operation => { try { await operation(); } catch (error) { console.error('[billing/recovery]', error.message); } };
  try {
    for (const model of [Payment, Subscription, Refund, BillingEvent, PaidUsage]) await model.deleteMany({ accountDeletedAt: { $ne: null }, retainUntil: { $lte: now } });
    if (!billingConfigured()) return;
    // A crash before creating the payment cannot have contacted Paystack.
    const orphaned = await Subscription.find({ status: 'checkout_pending', createdAt: { $lt: new Date(Date.now() - 120000) }, accountDeletedAt: null }).limit(20);
    for (const subscription of orphaned) await attempt(() => withBillingLock(subscription.userId, async () => {
      if (!await Payment.exists({ subscriptionId: subscription._id })) await Subscription.updateOne({ _id: subscription._id, status: 'checkout_pending' }, { $set: { status: 'expired' } });
    }));
    const events = await BillingEvent.find({ $or: [{ status: { $in: ['received', 'failed'] } }, { status: 'processing', leaseUntil: { $lte: now } }] }).sort({ updatedAt: 1 }).limit(20).select('_id');
    for (const event of events) await attempt(() => processStoredBillingEvent(event._id));
    const payments = await Payment.find({ $or: [{ status: 'pending' }, { status: 'success', fulfilledAt: null }, { status: 'success', periodEnd: { $gt: now } }], createdAt: { $lte: new Date(Date.now() - 60000) }, accountDeletedAt: null }).sort({ updatedAt: 1 }).limit(10);
    for (const payment of payments) await attempt(async () => { try { await reconcilePayment(payment); } finally { await Payment.updateOne({ _id: payment._id }, { $set: { updatedAt: new Date() } }); } });
    const linking = await Subscription.find({ provider: 'paystack', subscriptionCode: { $exists: false }, customerProviderId: { $exists: true }, accountDeletedAt: null }).sort({ updatedAt: 1 }).limit(10);
    for (const item of linking) await attempt(async () => {
      try { await withBillingLock(item.userId, async () => { const current = await Subscription.findById(item._id); if (!current) return; await recoverSubscriptionLink(current); if (current.cancelPendingAt) await stopRecurringSubscription(current); }); }
      finally { await Subscription.updateOne({ _id: item._id }, { $set: { updatedAt: new Date() } }); }
    });
    const cancellations = await Subscription.find({ cancelPendingAt: { $ne: null }, subscriptionCode: { $exists: true, $ne: '' } }).select('+emailTokenEncrypted').sort({ updatedAt: 1 }).limit(10);
    for (const subscription of cancellations) await attempt(async () => {
      try { await withBillingLock(subscription.userId, async () => { const current = await Subscription.findById(subscription._id).select('+emailTokenEncrypted'); if (current?.cancelPendingAt) await stopRecurringSubscription(current); }); }
      finally { await Subscription.updateOne({ _id: subscription._id }, { $set: { updatedAt: new Date() } }); }
    });
    const ended = await Subscription.find({ $or: [{ status: { $in: ['active', 'canceling'] }, paidThrough: { $lte: now } }, { status: 'past_due', graceEndsAt: { $lte: now } }] }).limit(30);
    for (const subscription of ended) await attempt(() => withBillingLock(subscription.userId, async () => {
      await Subscription.updateOne({ _id: subscription._id, status: subscription.status, ...(subscription.status === 'past_due' ? { graceEndsAt: subscription.graceEndsAt } : { paidThrough: subscription.paidThrough }) }, { $set: { status: 'expired' } });
      await syncBillingPlan(subscription.userId);
    }));
    const refunds = await Refund.find({ status: { $nin: ['processed', 'failed'] } }).sort({ updatedAt: 1 }).limit(10);
    for (const refund of refunds) await attempt(async () => {
      try {
      const payment = await Payment.findById(refund.paymentId);
      let provider;
      if (refund.providerId) provider = await paystackRequest(`/refund/${encodeURIComponent(refund.providerId)}`);
      else if (payment?.providerTransactionId) {
        const rows = await paystackRequest(`/refund?transaction=${encodeURIComponent(payment.providerTransactionId)}&perPage=100`);
        const matches = (rows || []).filter(row => Number(row.amount) === refund.amountKobo && row.merchant_note?.includes(refund.requestKey));
        if (matches.length === 1) provider = matches[0];
      }
      if (!payment) return;
      if (provider) await processWebhookEvent({ event: `refund.${provider.status}`, data: { ...provider, transaction_reference: payment.reference } }, `refund-recovery:${refund._id}:${provider.status}`);
      } finally { await Refund.updateOne({ _id: refund._id }, { $set: { updatedAt: new Date() } }); }
    });
    await retryBillingEmails();
  } finally { running = false; }
}
export function startBillingWorker() {
  if (timer) return;
  const run = () => void runBillingMaintenance().catch(error => console.error('[billing/worker]', error.message));
  setTimeout(run, 15000).unref?.(); timer = setInterval(run, 60000); timer.unref?.();
}
