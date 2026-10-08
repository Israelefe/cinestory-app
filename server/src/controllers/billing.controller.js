import crypto from 'node:crypto';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import BillingEvent from '../models/BillingEvent.js';
import { publicPlans } from '../config/plans.js';
import { resolveEntitlements, subscriptionCanManageCard } from '../services/entitlement.service.js';
import { sendPaymentDisputeEmail, sendPaymentDisputeResolvedEmail, sendPaymentFailedEmail, sendPaymentReceiptEmail, sendProWelcomeEmail, sendRefundFailedEmail, sendRefundProcessedEmail, sendRenewalFailedEmail, sendSubscriptionCancellationEmail, sendSubscriptionResumedEmail } from '../services/email.service.js';
import { billingConfigured, decryptBillingToken, encryptBillingToken, paystackRequest, storedPlanMatchesProPrice, validateConfiguredPlan, verifyPaystackSignature } from '../services/paystack.service.js';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';
import { billingEventIdentity, LEGACY_PRO_PRICES_KOBO, PRO_PRICING, proPlanCode, proPricing, redactBillingSnapshot } from '../services/billingPricing.service.js';
import { withBillingLock } from '../services/billingLock.service.js';
import { stopRecurringSubscription, subscriptionCredentials, recoverSubscriptionLink, confirmScheduledResumption } from '../services/billingCancellation.service.js';
import { restartSubscriptionRenewals } from '../services/billingResumption.service.js';

export function addOneMonth(value = new Date()) {
  const result = new Date(value), day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + 1);
  result.setUTCDate(Math.min(day, new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()));
  return result;
}
const asDate = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; };
const fail = (message, status = 409, code) => Object.assign(new Error(message), { status, code });
const notify = promise => promise.catch(error => { if (!error.emailDeliveryRecorded) throw error; console.error('[email/billing]', error.message); });
const providerPlan = data => typeof data.plan === 'string' ? data.plan : data.plan?.plan_code || data.plan_object?.plan_code || data.subscription?.plan?.plan_code;
const referenceOf = data => data.transaction_reference || data.transaction?.reference || data.reference;

export async function syncBillingPlan(userId) {
  const owner = await User.findById(userId);
  if (!owner) return;
  const entitlement = await resolveEntitlements(owner, { includeUsage: false });
  if (entitlement.plan === 'pro') return User.updateOne({ _id: userId }, { $set: { plan: 'pro' }, $unset: { proRetentionUntil: 1 } });
  const runtime = await getRuntimeConfig();
  const days = Math.max(1, Number(runtime.retention?.proRetentionDays) || 30);
  await User.updateOne({ _id: userId }, { $set: { plan: 'free', proRetentionUntil: owner.proRetentionUntil || new Date(Date.now() + days * 86400000) } });
}
export async function billingStatusData(user, req = {}) {
  const cursor = typeof req.query?.paymentsBefore === 'string' && /^[a-f0-9]{24}$/i.test(req.query.paymentsBefore) ? req.query.paymentsBefore : null;
  const [entitlements, paymentRows, runtime, refunds] = await Promise.all([resolveEntitlements(user), Payment.find({ userId: user._id, ...(cursor ? { _id: { $lt: cursor } } : {}) }).sort({ _id: -1 }).limit(25).lean(), getRuntimeConfig(), Refund.find({ userId: user._id }).select('paymentId amountKobo currency status createdAt updatedAt').sort({ createdAt: -1 }).limit(100).lean()]);
  const payments = paymentRows.slice(0, 24);
  const pricing = proPricing();
  const recurring = await Subscription.find({ userId: user._id, provider: 'paystack', subscriptionCode: { $exists: true, $ne: '' }, providerCanceledAt: null }).select('status paidThrough cancelPendingAt resumePendingAt').lean();
  const unlinked = await Subscription.find({ userId: user._id, provider: 'paystack', subscriptionCode: { $exists: false }, customerCode: { $exists: true }, providerCanceledAt: null }).select('cancelPendingAt resumePendingAt').lean();
  return { ...entitlements, payments, refunds, paymentsNextCursor: paymentRows.length > 24 ? payments.at(-1)._id : null, pricing, billingAvailable: billingConfigured(), retentionDays: Math.max(1, Number(runtime.retention?.proRetentionDays) || 30), recurringSchedules: recurring.length, cancellationPending: [...recurring, ...unlinked].some(item => item.cancelPendingAt), resumptionPending: [...recurring, ...unlinked].some(item => item.resumePendingAt), canCancel: recurring.length + unlinked.length > 0, duplicateSchedules: recurring.length > 1 };
}
export async function activateSubscription({ data, user, subscription }) {
  if (!user || !subscription || subscription.accountDeletedAt) return null;
  return withBillingLock(user._id, async () => {
    const reference = referenceOf(data), recordedAmount = subscription.amountKobo || 2_500_000;
    const providerPlanCode = providerPlan(data);
    let expected = recordedAmount;
    if (Number(data.amount) !== recordedAmount) {
      if (Number(data.amount) !== PRO_PRICING.amountKobo || !LEGACY_PRO_PRICES_KOBO.includes(recordedAmount) || providerPlanCode !== subscription.planCode || !await storedPlanMatchesProPrice(subscription)) return null;
      expected = PRO_PRICING.amountKobo;
    }
    const code = data.subscription_code || data.subscription?.subscription_code, plan = providerPlan(data);
    if (!reference || String(subscription.userId) !== String(user._id) || (data.status && data.status !== 'success')) return null;
    if (Number(data.amount) !== expected || data.currency !== (subscription.currency || 'NGN') || (plan && plan !== subscription.planCode)) return null;
    if (typeof data.plan === 'number' && subscription.planProviderId && String(data.plan) !== subscription.planProviderId) return null;
    if (subscription.subscriptionCode && code && code !== subscription.subscriptionCode) return null;
    if (subscription.customerCode && data.customer?.customer_code !== subscription.customerCode) return null;
    if (String(data.customer?.email || '').trim().toLowerCase() !== user.email.toLowerCase()) return null;
    if (data.domain && data.domain !== (process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test')) return null;
    let payment = await Payment.findOne({ reference });
    if (payment && String(payment.userId) !== String(user._id)) return null;
    if (payment && ['refunded', 'partially_refunded', 'disputed'].includes(payment.status)) return subscription;
    const paidAt = asDate(data.paid_at || data.paidAt);
    if (!paidAt) throw fail('Paystack did not provide a valid payment date.', 502);
    const providerEnd = asDate(data.next_payment_date || data.subscription?.next_payment_date || data.period_end);
    const periodEnd = providerEnd && providerEnd > paidAt && providerEnd - paidAt <= 35 * 86400000 ? providerEnd : addOneMonth(paidAt);
    if (!payment) {
      if (!subscription.subscriptionCode || (!plan && !code)) return null;
      payment = await Payment.create({ userId: user._id, subscriptionId: subscription._id, reference, amountKobo: expected, currency: subscription.currency || 'NGN', pricingRegion: subscription.pricingRegion });
    }
    if (payment.amountKobo !== expected || payment.currency !== data.currency) return null;
    payment.status = 'success'; payment.paidAt = paidAt; payment.periodEnd = periodEnd;
    payment.providerTransactionId = data.id ? String(data.id) : payment.providerTransactionId;
    payment.channel = data.channel || data.authorization?.channel;
    payment.feesKobo = Number.isSafeInteger(Number(data.fees)) ? Number(data.fees) : undefined;
    payment.providerStatus = 'success'; payment.providerSnapshot = redactBillingSnapshot(data);
    await payment.save();
    if (!payment.fulfilledAt) {
      const update = { customerCode: data.customer?.customer_code, customerProviderId: data.customer?.id ? String(data.customer.id) : subscription.customerProviderId, amountKobo: expected, providerSnapshot: redactBillingSnapshot(data) };
      if (code) update.subscriptionCode = code;
      const token = data.email_token || data.subscription?.email_token;
      if (token) update.emailTokenEncrypted = encryptBillingToken(token);
      const fresh = await Subscription.findById(subscription._id);
      if (!fresh.lastPaymentAt || paidAt >= fresh.lastPaymentAt) {
        Object.assign(update, { paidFrom: paidAt, paidThrough: periodEnd, lastPaymentAt: paidAt, lastPaymentReference: reference, graceEndsAt: null });
        if (!['refunded', 'disputed'].includes(fresh.status) || (fresh.lastPaymentReference !== reference && paidAt > fresh.lastPaymentAt)) update.status = fresh.cancelRequestedAt || fresh.cancelPendingAt ? 'canceling' : 'active';
      }
      await Subscription.updateOne({ _id: subscription._id }, { $set: update });
      await syncBillingPlan(user._id);
    const previous = await Payment.exists({ userId: user._id, paidAt: { $exists: true }, reference: { $ne: reference } });
      const emailData = { to: user.email, name: user.name, amountKobo: expected, paidAt, paidThrough: periodEnd, reference, userId: user._id };
      await notify(previous ? sendPaymentReceiptEmail(emailData) : sendProWelcomeEmail(emailData));
      payment.fulfilledAt = new Date(); await payment.save();
    }
    return Subscription.findById(subscription._id);
  });
}
export function getPlans(req, res) {
  const pricing = proPricing();
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: publicPlans(), pricing, billingAvailable: billingConfigured() });
}
export async function getBillingStatus(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) throw fail('Account not found.', 404);
    res.set('Cache-Control', 'private, no-store');
    res.json({ success: true, data: await billingStatusData(user, req) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'We could not open your billing details.' }); }
}
export async function startCheckout(req, res) {
  try {
    const pricing = proPricing();
    if (!billingConfigured()) throw fail('Online billing is not available yet. Contact payment@veylo.com.ng.', 503);
    if (req.body?.quote !== pricing.quote) return res.status(409).json({ success: false, code: 'PRICE_CHANGED', pricing, message: 'Your checkout price has updated. Review it before continuing.' });
    const providerPlanData = await validateConfiguredPlan();
    const result = await withBillingLock(req.user.id, async lock => {
      const user = await User.findById(req.user.id);
      if (!user || user.accountStatus !== 'active') throw fail('This account is not available for checkout.', 403);
      const current = await resolveEntitlements(user, { includeUsage: false });
      if (current.plan === 'pro' && current.subscription.status !== 'past_due') throw fail('Your Veylo Pro subscription is already active.', 409, 'ALREADY_PRO');
      let subscription = lock.pendingReference ? await Subscription.findOne({ checkoutReference: lock.pendingReference, status: 'checkout_pending' }).select('+checkoutUrl') : null;
      if (!subscription) subscription = await Subscription.findOne({ userId: user._id, status: 'checkout_pending' }).sort({ createdAt: -1 }).select('+checkoutUrl');
      if (subscription) {
        if (subscription.amountKobo !== pricing.amountKobo) throw fail(`Your earlier checkout is for NGN ${(subscription.amountKobo || 2500000) / 100}. Check that payment before starting one at a different price.`, 409, 'PAYMENT_PENDING');
        if (subscription.checkoutUrl && subscription.checkoutExpiresAt > new Date()) return { authorizationUrl: subscription.checkoutUrl, reference: subscription.checkoutReference, amountKobo: subscription.amountKobo };
        throw fail('An earlier checkout still needs confirmation. Refresh billing or contact payment@veylo.com.ng before starting another payment.', 409, 'PAYMENT_PENDING');
      }
      const linking = await Subscription.find({ userId: user._id, provider: 'paystack', subscriptionCode: { $exists: false }, customerCode: { $exists: true } });
      for (const old of linking) await recoverSubscriptionLink(old);
      const oldSchedules = await Subscription.find({ userId: user._id, subscriptionCode: { $exists: true, $ne: '' }, providerCanceledAt: null }).select('+emailTokenEncrypted');
      for (const old of oldSchedules) await stopRecurringSubscription(old);
      const reference = `veylo_${crypto.randomUUID().replaceAll('-', '')}`;
      subscription = await Subscription.create({ userId: user._id, status: 'checkout_pending', billingPolicyVersion: '2026-10-06', billingPolicyAcceptedAt: new Date(), amountKobo: pricing.amountKobo, currency: 'NGN', planCode: proPlanCode(), planProviderId: String(providerPlanData.id), checkoutReference: reference });
      await Payment.create({ userId: user._id, subscriptionId: subscription._id, reference, amountKobo: pricing.amountKobo, currency: 'NGN' });
      lock.pendingReference = reference; await lock.save();
      try {
        const initialized = await paystackRequest('/transaction/initialize', { method: 'POST', body: { email: user.email, amount: pricing.amountKobo, currency: 'NGN', plan: subscription.planCode, reference,
          callback_url: process.env.PAYSTACK_CALLBACK_URL || `${String(process.env.CLIENT_URL).replace(/\/$/, '')}/billing`, metadata: { userId: String(user._id), product: 'veylo-pro-monthly' } } });
        if (initialized.reference && initialized.reference !== reference) throw fail('Paystack returned a different payment reference. Contact payment@veylo.com.ng before retrying.', 502);
        if (!/^https:\/\/checkout\.paystack\.com\//.test(initialized.authorization_url || '')) throw fail('Paystack returned an invalid checkout address.', 502);
        subscription.checkoutUrl = initialized.authorization_url; subscription.checkoutExpiresAt = new Date(Date.now() + 3600000); await subscription.save();
        return { authorizationUrl: initialized.authorization_url, reference, amountKobo: pricing.amountKobo };
      } catch (error) {
        if (error.providerStatus >= 400 && error.providerStatus < 500) { await Payment.updateOne({ reference }, { $set: { status: 'failed' } }); await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'expired' } }); }
        throw error;
      }
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) { console.error('[billing/checkout]', error.message); res.status(error.status || 502).json({ success: false, code: error.code, message: error.status ? error.message : 'The checkout result is uncertain. Refresh billing before trying another payment.' }); }
}
export async function reconcilePayment(payment) {
  let data;
  try { data = await paystackRequest(`/transaction/verify/${encodeURIComponent(payment.reference)}`); }
  catch (error) {
    if (error.providerStatus === 404 && payment.status === 'pending' && payment.createdAt < new Date(Date.now() - 120000)) {
      await withBillingLock(payment.userId, async () => {
        await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed', providerStatus: 'not-found' } });
        await Subscription.updateOne({ _id: payment.subscriptionId, status: 'checkout_pending' }, { $set: { status: 'expired' } });
      });
      return false;
    }
    throw error;
  }
  if (data.reference !== payment.reference) throw fail('Payment reference mismatch.', 502);
  if (data.status === 'reversed' && payment.status === 'success') {
    if (Number(data.amount) !== payment.amountKobo || data.currency !== payment.currency) throw fail('Reversed transaction mismatch.', 502);
    await withBillingLock(payment.userId, async () => {
      await Payment.updateOne({ _id: payment._id, status: 'success' }, { $set: { status: 'disputed', providerStatus: 'reversed', reversedAt: new Date() } });
      await Subscription.updateOne({ _id: payment.subscriptionId, lastPaymentReference: payment.reference }, { $set: { status: 'disputed' } });
      await syncBillingPlan(payment.userId);
    });
    return true;
  }
  if (payment.fulfilledAt && ['refunded', 'partially_refunded', 'disputed'].includes(payment.status)) return true;
  if (data.status === 'success') {
    const [user, subscription] = await Promise.all([User.findById(payment.userId), Subscription.findById(payment.subscriptionId)]);
    if (!await activateSubscription({ data, user, subscription })) throw fail('This payment did not match its saved checkout. Contact payment@veylo.com.ng.', 409);
    return true;
  }
  if (['abandoned', 'failed', 'reversed'].includes(data.status) && payment.status === 'pending') {
    await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed', providerStatus: data.status } });
    await Subscription.updateOne({ _id: payment.subscriptionId, status: 'checkout_pending' }, { $set: { status: 'expired' } });
  }
  return false;
}
export async function verifyCheckout(req, res) {
  try {
    const reference = String(req.params.reference || '').trim();
    if (!/^veylo_[a-f0-9]{32}$/i.test(reference)) throw fail('That payment reference is not valid.', 400);
    const payment = await Payment.findOne({ reference, userId: req.user.id });
    if (!payment) throw fail('We could not find that Veylo payment.', 404);
    const confirmed = await reconcilePayment(payment);
    res.status(confirmed ? 200 : 202).json({ success: true, confirmed, message: confirmed ? 'Payment confirmed.' : 'Paystack has not confirmed payment. No Pro access has been added.', data: await billingStatusData(await User.findById(req.user.id), req) });
  } catch (error) { res.status(error.status || 502).json({ success: false, message: error.status ? error.message : 'We could not confirm payment yet. Please refresh billing shortly.' }); }
}
async function currentPaystackSubscription(userId) {
  const now = new Date();
  return Subscription.findOne({ userId, provider: 'paystack', subscriptionCode: { $exists: true, $ne: '' }, $or: [{ paidThrough: { $gt: now } }, { status: 'past_due', graceEndsAt: { $gt: now } }, { status: 'active', resumesSubscriptionId: { $exists: true }, renewalStartsAt: { $gt: now }, providerCanceledAt: null, resumePendingAt: null }] }).sort({ renewalStartsAt: -1, paidThrough: -1 }).select('+emailTokenEncrypted');
}
export async function cancelSubscription(req, res) {
  try {
    await withBillingLock(req.user.id, async () => {
      const linking = await Subscription.find({ userId: req.user.id, provider: 'paystack', subscriptionCode: { $exists: false }, customerCode: { $exists: true } });
      for (const item of linking) { item.cancelPendingAt ||= new Date(); await item.save(); await recoverSubscriptionLink(item); }
      const schedules = await Subscription.find({ userId: req.user.id, provider: 'paystack', subscriptionCode: { $exists: true, $ne: '' }, providerCanceledAt: null }).select('+emailTokenEncrypted');
      const owner = await User.findById(req.user.id);
      for (const subscription of schedules) {
        await stopRecurringSubscription(subscription);
        await notify(sendSubscriptionCancellationEmail({ to: owner.email, name: owner.name, paidThrough: subscription.paidThrough, userId: owner._id, eventKey: `billing:subscription:${subscription._id}:canceled:${subscription.cancelRequestedAt.toISOString()}` }));
      }
      await syncBillingPlan(req.user.id);
    });
    res.json({ success: true, message: 'Future renewals have stopped. Access continues through any remaining paid time.', data: await billingStatusData(await User.findById(req.user.id), req) });
  } catch (error) { res.status(error.status || 502).json({ success: false, message: `Cancellation has not been confirmed for every schedule. ${error.status ? error.message : 'Please try again or email payment@veylo.com.ng.'}` }); }
}
export async function resumeSubscription(req, res) {
  try {
    const pricing = proPricing();
    if (req.body?.quote !== pricing.quote) return res.status(409).json({ success: false, code: 'PRICE_CHANGED', pricing, message: 'Your renewal price has updated. Review it before continuing.' });
    await withBillingLock(req.user.id, async () => {
      const owner = await User.findById(req.user.id);
      const subscription = await restartSubscriptionRenewals(owner);
      await notify(sendSubscriptionResumedEmail({ to: owner.email, name: owner.name, paidThrough: subscription.renewalStartsAt, userId: owner._id, eventKey: `billing:subscription:${subscription._id}:resumed` }));
    });
    res.json({ success: true, message: 'Monthly renewals are back on. No payment was taken today.', data: await billingStatusData(await User.findById(req.user.id), req) });
  } catch (error) { res.status(error.status || 502).json({ success: false, code: error.code, message: error.status ? error.message : 'We could not confirm renewal setup. Check renewal status before trying again.', data: await billingStatusData(await User.findById(req.user.id), req) }); }
}
export async function getManageLink(req, res) {
  try {
    const subscription = await currentPaystackSubscription(req.user.id);
    if (!subscription) throw fail('No paid Paystack subscription was found.', 404);
    if (!subscriptionCanManageCard(subscription)) throw fail('Payment methods are only available for a renewing Pro subscription.');
    const data = await paystackRequest(`/subscription/${encodeURIComponent(subscription.subscriptionCode)}/manage/link`), url = new URL(data.link);
    if (url.protocol !== 'https:' || !(url.hostname === 'paystack.com' || url.hostname.endsWith('.paystack.com'))) throw fail('Invalid Paystack management link.', 502);
    res.json({ success: true, data: { link: url.toString() } });
  } catch (error) { res.status(error.status || 502).json({ success: false, message: error.status ? error.message : 'We could not open Paystack billing.' }); }
}
export async function processWebhookEvent(event, eventKey = '', accountLocked = false) {
  const data = event.data || {}, reference = referenceOf(data);
  if (data.domain && data.domain !== (process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test')) return null;
  let payment = reference ? await Payment.findOne({ reference }) : null;
  const code = data.subscription_code || data.subscription?.subscription_code || (typeof data.subscription === 'string' ? data.subscription : '');
  let subscription = code ? await Subscription.findOne({ subscriptionCode: code }).select('+emailTokenEncrypted') : null;
  if (!subscription && payment) subscription = await Subscription.findById(payment.subscriptionId).select('+emailTokenEncrypted');
  if (!subscription && event.event === 'charge.success' && data.customer?.customer_code && providerPlan(data)) {
    const candidates = await Subscription.find({ customerCode: data.customer.customer_code, planCode: providerPlan(data), subscriptionCode: { $exists: true, $ne: '' }, providerCanceledAt: null });
    if (candidates.length === 1) subscription = candidates[0];
    else if (candidates.length > 1) throw fail('Multiple recurring schedules need review before applying this charge.', 503);
  }
  if (!subscription && event.event === 'subscription.create') {
    const candidates = data.customer?.customer_code && providerPlan(data) ? await Subscription.find({ customerCode: data.customer.customer_code, planCode: providerPlan(data), subscriptionCode: { $exists: false }, status: { $in: ['active', 'canceling'] } }) : [];
    if (candidates.length === 1) subscription = candidates[0];
    else if (process.env.PAYSTACK_PRO_PLAN_CODE === providerPlan(data)) throw fail('Subscription linking awaits its verified charge.', 503);
  }
  if (payment && subscription && String(payment.subscriptionId) !== String(subscription._id)) throw fail('The payment and provider subscription mapping did not match.', 503);
  const user = subscription ? await User.findById(subscription.userId) : payment ? await User.findById(payment.userId) : null;
  if (subscription && ((providerPlan(data) && providerPlan(data) !== subscription.planCode) || (data.customer?.customer_code && subscription.customerCode && data.customer.customer_code !== subscription.customerCode))) return null;
  if (user && !accountLocked && event.event !== 'charge.success' && !event.event?.startsWith('refund.')) return withBillingLock(user._id, () => processWebhookEvent(event, eventKey, true));
  if (event.event === 'charge.success') return activateSubscription({ data, user, subscription });
  if (event.event === 'subscription.create') {
    if (!subscription) return null;
    subscription.subscriptionCode = code; subscription.customerCode = data.customer?.customer_code;
    if (data.email_token) subscription.emailTokenEncrypted = encryptBillingToken(data.email_token);
    subscription.providerSnapshot = redactBillingSnapshot(data); await subscription.save();
    if (subscription.cancelRequestedAt || subscription.cancelPendingAt || subscription.accountDeletedAt) await stopRecurringSubscription(subscription);
    else if (subscription.resumesSubscriptionId && subscription.resumePendingAt) await confirmScheduledResumption(subscription);
    return subscription;
  }
  if (event.event === 'invoice.payment_failed') {
    if (!subscription || ['canceling', 'refunded', 'disputed'].includes(subscription.status) || subscription.cancelRequestedAt) return null;
    const invoiceDue = asDate(data.period_start || data.due_date);
    const due = subscription.paidThrough && invoiceDue ? new Date(Math.min(subscription.paidThrough.getTime(), invoiceDue.getTime())) : subscription.paidThrough;
    if (!due || (subscription.lastPaymentAt && due < subscription.lastPaymentAt)) return null;
    subscription.status = 'past_due'; subscription.graceEndsAt = new Date(due.getTime() + 3 * 86400000);
    subscription.providerSnapshot = redactBillingSnapshot(data); await subscription.save(); await syncBillingPlan(subscription.userId);
    if (user) await notify(sendRenewalFailedEmail({ to: user.email, name: user.name, graceEndsAt: subscription.graceEndsAt, userId: user._id, eventKey: `billing:subscription:${subscription._id}:renewal-failed:${due.toISOString()}` }));
    return subscription;
  }
  if (['subscription.not_renew', 'subscription.disable'].includes(event.event)) {
    if (!subscription) return null;
    if (['refunded', 'disputed'].includes(subscription.status)) return subscription;
    const { data: currentProvider } = await subscriptionCredentials(subscription);
    if (currentProvider.status === 'active' && !subscription.cancelPendingAt) return subscription;
    subscription.status = subscription.paidThrough > new Date() ? 'canceling' : 'expired';
    subscription.cancelRequestedAt ||= new Date(); subscription.providerCanceledAt = new Date(); subscription.cancelPendingAt = null;
    await subscription.save(); await syncBillingPlan(subscription.userId);
    if (user) await notify(sendSubscriptionCancellationEmail({ to: user.email, name: user.name, paidThrough: subscription.paidThrough, userId: user._id, eventKey: `billing:subscription:${subscription._id}:canceled:${subscription.cancelRequestedAt.toISOString()}` }));
    return subscription;
  }
  if (event.event === 'charge.dispute.create') {
    if (!payment) return null;
    if (payment.disputeResolvedAt && String(payment.disputeId) === String(data.id)) return payment;
    await Payment.updateOne({ _id: payment._id }, { $set: { status: 'disputed', disputeId: data.id ? String(data.id) : undefined } });
    if (subscription?.lastPaymentReference === reference) await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'disputed' } });
    await syncBillingPlan(payment.userId);
    if (user) await notify(sendPaymentDisputeEmail({ to: user.email, name: user.name, reference, userId: user._id, eventKey: `billing:${eventKey}:dispute` }));
    return payment;
  }
  if (event.event === 'charge.dispute.resolve') {
    if (!payment || !data.id || payment.status === 'disputed' && payment.disputeId && payment.disputeId !== String(data.id)) return null;
    const current = await paystackRequest(`/dispute/${encodeURIComponent(data.id)}`);
    if (referenceOf(current) !== reference || current.status !== 'resolved') throw fail('Dispute resolution did not match this payment.', 502);
    const verified = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (verified.reference !== reference || Number(verified.amount) !== payment.amountKobo || verified.currency !== payment.currency) throw fail('Disputed transaction mismatch.', 502);
    payment.disputeId = String(data.id); payment.disputeResolution = current.resolution; payment.disputeResolvedAt = new Date();
    // Declining a claim alone is insufficient: also require provider confirmation that the charge remains successful.
    if (current.resolution === 'declined' && verified.status === 'success' && payment.status === 'disputed') {
      payment.status = payment.refundedAmountKobo ? 'partially_refunded' : 'success';
      await payment.save();
      if (subscription?.lastPaymentReference === reference && subscription.status === 'disputed') await Subscription.updateOne({ _id: subscription._id }, { $set: { status: subscription.cancelRequestedAt ? 'canceling' : 'active' } });
    } else { payment.reversedAt = verified.status === 'reversed' ? new Date() : payment.reversedAt; await payment.save(); }
    await syncBillingPlan(payment.userId);
    if (user) await notify(sendPaymentDisputeResolvedEmail({ to: user.email, name: user.name, reference, paymentSuccessful: ['success', 'partially_refunded'].includes(payment.status), userId: user._id, eventKey: `billing:dispute:${data.id}:resolved` }));
    return payment;
  }
  if (event.event === 'charge.failed') {
    if (!payment || payment.status !== 'pending') return null;
    await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed', providerSnapshot: redactBillingSnapshot(data) } });
    await Subscription.updateOne({ _id: payment.subscriptionId, status: 'checkout_pending' }, { $set: { status: 'expired' } });
    if (user) await notify(sendPaymentFailedEmail({ to: user.email, name: user.name, reference, amountKobo: payment.amountKobo, userId: user._id }));
    return payment;
  }
  if (event.event?.startsWith('refund.')) {
    if (!payment) return null;
    // Documented refund webhooks can have a null refund_reference and no ID.
    // Resolve provider IDs from the transaction's refund list instead of inventing an identity.
    const recordedProcessed = data.id && !accountLocked && payment.refundedAmountKobo > 0 ? await Refund.aggregate([{ $match: { paymentId: payment._id, status: 'processed' } }, { $group: { _id: null, amount: { $sum: '$amountKobo' } } }]) : null;
    if (!data.id || recordedProcessed && (recordedProcessed[0]?.amount || 0) < payment.refundedAmountKobo) {
      let transactionId = payment.providerTransactionId;
      if (!transactionId) {
        const verified = await paystackRequest(`/transaction/verify/${encodeURIComponent(payment.reference)}`);
        if (verified.reference !== payment.reference || Number(verified.amount) !== payment.amountKobo || verified.currency !== payment.currency || !verified.id) throw fail('Refund transaction mismatch.', 502);
        transactionId = String(verified.id);
        await Payment.updateOne({ _id: payment._id }, { $set: { providerTransactionId: transactionId } });
      }
      let matched = false;
      for (let page = 1; page <= 100; page++) {
        const rows = await paystackRequest(`/refund?transaction=${encodeURIComponent(transactionId)}&perPage=100&page=${page}`);
        if (!Array.isArray(rows)) throw fail('Invalid refund list.', 502);
        for (const refund of rows) {
          if (String(refund.transaction?.id || refund.transaction) !== transactionId) continue;
          await processWebhookEvent({ event: `refund.${refund.status}`, data: { ...refund, transaction_reference: reference } }, `refund:${refund.id}:${refund.status}`, true);
          matched = true;
        }
        if (rows.length < 100) break;
        if (page === 100) throw fail('Refund reconciliation limit reached.', 502);
      }
      if (!matched) throw fail('Refund identity is not available yet.', 503);
      return payment;
    }
    const providerId = data.id, amountKobo = Number(data.amount);
    if (!providerId || !Number.isSafeInteger(amountKobo) || amountKobo <= 0 || amountKobo > payment.amountKobo || data.currency !== payment.currency) throw fail('Invalid refund identity, amount or currency.', 502);
    return withBillingLock(payment.userId, async () => {
      let refund = await Refund.findOne({ providerId: String(providerId) });
      if (!refund) {
        const pending = await Refund.find({ paymentId: payment._id, amountKobo, providerId: { $exists: false }, status: { $in: ['requested', 'uncertain'] } });
        if (pending.length === 1) { refund = pending[0]; refund.providerId = String(providerId); }
        else refund = new Refund({ userId: payment.userId, paymentId: payment._id, providerId: String(providerId), amountKobo, currency: payment.currency });
      }
      if (String(refund.paymentId) !== String(payment._id) || refund.amountKobo !== amountKobo) throw fail('Refund did not match its payment.', 502);
      const status = event.event.slice(7);
      if (!['pending', 'processing', 'needs-attention', 'failed', 'processed'].includes(status)) return null;
      // Stale pending messages cannot reopen a terminal or more advanced refund.
      const stale = status === 'pending' && ['processing', 'needs-attention', 'failed'].includes(refund.status) || refund.status === 'failed' && status !== 'processed';
      if (refund.status !== 'processed' && !stale) { refund.status = status; refund.providerSnapshot = redactBillingSnapshot(data); if (status === 'processed') refund.processedAt = new Date(); await refund.save(); }
      const refunds = await Refund.find({ paymentId: payment._id }).lean();
      const refunded = refunds.filter(item => item.status === 'processed').reduce((sum, item) => sum + item.amountKobo, 0);
      const pendingAmount = refunds.filter(item => !['processed', 'failed'].includes(item.status)).reduce((sum, item) => sum + item.amountKobo, 0);
      if (refunded > payment.amountKobo) throw fail('Refund total exceeds the original payment.', 502);
      payment = await Payment.findById(payment._id);
      payment.refundedAmountKobo = refunded; payment.refundPendingAmountKobo = pendingAmount;
      if (payment.status !== 'disputed') payment.status = refunded >= payment.amountKobo ? 'refunded' : refunded > 0 ? 'partially_refunded' : payment.status;
      await payment.save();
      if (payment.status === 'refunded' && subscription?.lastPaymentReference === reference) { await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'refunded' } }); await syncBillingPlan(payment.userId); }
      if (user && refund.status === 'processed') await notify(sendRefundProcessedEmail({ to: user.email, name: user.name, amountKobo, reference, userId: user._id, eventKey: `billing:refund:${refund._id}:processed` }));
      if (user && refund.status === 'failed') await notify(sendRefundFailedEmail({ to: user.email, name: user.name, reference, userId: user._id, eventKey: `billing:refund:${refund._id}:failed` }));
      return payment;
    });
  }
  return null;
}
export async function processStoredBillingEvent(id) {
  const leaseOwner = crypto.randomUUID(), now = new Date();
  const record = await BillingEvent.findOneAndUpdate({ _id: id, $or: [{ status: { $in: ['received', 'failed'] } }, { status: 'processing', leaseUntil: { $lte: now } }] }, { $set: { status: 'processing', leaseOwner, leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { new: true }).select('+payloadEncrypted +payload');
  if (!record) return;
  try {
    const event = record.payloadEncrypted ? JSON.parse(decryptBillingToken(record.payloadEncrypted)) : record.payload;
    const handled = await processWebhookEvent(event, record.eventKey);
    await BillingEvent.updateOne({ _id: id, leaseOwner }, { $set: { status: handled ? 'processed' : 'ignored', processedAt: new Date(), ...(handled?.userId ? { userId: handled.userId } : {}) }, $unset: { leaseUntil: 1, failure: 1, ...(record.accountDeletedAt ? { payloadEncrypted: 1 } : {}) } });
  } catch (error) {
    await BillingEvent.updateOne({ _id: id, leaseOwner }, { $set: { status: 'failed', failure: String(error.message).slice(0, 500) }, $unset: { leaseUntil: 1 } }); throw error;
  }
}
export async function paystackWebhook(req, res) {
  if (!verifyPaystackSignature(req.body, req.get('x-paystack-signature'))) return res.status(401).send('Invalid signature');
  try {
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).send('Invalid JSON'); }
    if (!event || typeof event.event !== 'string' || !event.data || typeof event.data !== 'object') return res.status(400).send('Invalid event');
    const eventKey = billingEventIdentity(event);
    let record;
    try { record = await BillingEvent.create({ eventKey, eventType: event.event, payload: redactBillingSnapshot(event), payloadEncrypted: encryptBillingToken(JSON.stringify(event)) }); }
    catch (error) { if (error.code !== 11000) throw error; record = await BillingEvent.findOne({ eventKey }); }
    // Equal partial refunds can produce byte-identical notifications with a null ID.
    // Recheck the provider list even when this notification was handled previously.
    if (event.event.startsWith('refund.') && !event.data.id) await BillingEvent.updateOne({ _id: record._id, status: { $in: ['processed', 'ignored'] } }, { $set: { status: 'received', payloadEncrypted: encryptBillingToken(JSON.stringify(event)) } });
    await processStoredBillingEvent(record._id); res.sendStatus(200);
  } catch (error) { console.error('[billing/webhook]', error.message); res.sendStatus(500); }
}
