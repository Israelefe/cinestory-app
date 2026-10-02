import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import Subscription from '../models/Subscription.js';
import AdminAudit from '../models/AdminAudit.js';
import { paystackRequest } from './paystack.service.js';
import { withBillingLock } from './billingLock.service.js';
import { stopRecurringSubscription } from './billingCancellation.service.js';
import { refundEvidence } from './paidUsage.service.js';
import { redactBillingSnapshot } from './billingPricing.service.js';
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function requestReviewedRefund({ paymentId, amountKobo, reason, requestKey, cancelRenewal = false, adminId }) {
  const initial = await Payment.findById(paymentId);
  if (!initial) throw fail('Payment not found.', 404);
  if (typeof requestKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestKey)) throw fail('Refresh the refund form before submitting.', 400);
  reason = String(reason || '').trim().slice(0, 500);
  if (reason.length < 10) throw fail('Record the reason for approval, including any payment error or service failure.', 400);
  return withBillingLock(initial.userId, async () => {
    const prior = await Refund.findOne({ requestKey });
    if (prior) { if (String(prior.paymentId) !== String(paymentId)) throw fail('Refund request mismatch.'); return prior.toObject(); }
    const payment = await Payment.findById(paymentId);
    if (!['success', 'partially_refunded'].includes(payment.status)) throw fail('This payment is not refundable.');
    if (payment.refundPendingAmountKobo > 0 || await Refund.exists({ paymentId, status: { $nin: ['failed', 'processed'] } })) throw fail('A refund already needs review or is processing.');
    const amount = amountKobo === undefined ? payment.amountKobo - payment.refundedAmountKobo : Number(amountKobo);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > payment.amountKobo - payment.refundedAmountKobo) throw fail('Enter an amount within the remaining payment balance.', 400);
    const evidence = await refundEvidence(payment);
    const refund = await Refund.create({ paymentId, userId: payment.userId, requestKey, amountKobo: amount, currency: payment.currency, reason, evidence });
    payment.refundPendingAmountKobo = amount; await payment.save();
    await AdminAudit.create({ adminId, userId: payment.userId, action: 'payment.refund_reviewed', resourceType: 'Refund', resourceId: String(refund._id), details: { reason, evidence, amountKobo: amount, cancelRenewal } });
    try {
      const result = await paystackRequest('/refund', { method: 'POST', body: { transaction: payment.reference, amount, currency: payment.currency, customer_note: reason.slice(0, 240), merchant_note: `Veylo refund ${requestKey}; approved by ${adminId}` } });
      if (!result.id) throw new Error('Refund provider identity missing.');
      refund.providerId = String(result.id);
      // Completion is reconciled through the same idempotent event handler.
      refund.status = ['pending', 'processing', 'needs-attention', 'failed'].includes(result.status) ? result.status : 'processing';
      refund.providerSnapshot = redactBillingSnapshot(result); await refund.save();
      if (refund.status === 'failed') { payment.refundPendingAmountKobo = 0; await payment.save(); }
    } catch (error) {
      refund.status = error.providerStatus >= 400 && error.providerStatus < 500 ? 'failed' : 'uncertain'; await refund.save();
      if (refund.status === 'failed') { payment.refundPendingAmountKobo = 0; await payment.save(); throw fail('Paystack rejected the refund. Review the failed request.', 502); }
    }
    let cancellationPending = false;
    if (cancelRenewal) {
      const subscription = await Subscription.findById(payment.subscriptionId).select('+emailTokenEncrypted');
      if (subscription?.subscriptionCode) {
        try { await stopRecurringSubscription(subscription); } catch { cancellationPending = true; }
      }
    }
    return { ...refund.toObject(), cancellationPending };
  });
}
