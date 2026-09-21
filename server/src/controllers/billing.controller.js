import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import BillingEvent from '../models/BillingEvent.js';
import { PRO_PRICE_KOBO, publicPlans } from '../config/plans.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { billingConfigured, decryptBillingToken, encryptBillingToken, paystackRequest, validateConfiguredPlan, verifyPaystackSignature } from '../services/paystack.service.js';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';

function addOneMonth(value = new Date()) {
  const date = new Date(value);
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function asDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function safeSnapshot(data) {
  if (!data || typeof data !== 'object') return {};
  const { authorization, ...rest } = data;
  return { ...rest, authorization: authorization ? { channel: authorization.channel, brand: authorization.brand, reusable: authorization.reusable } : undefined };
}

async function grantPro(userId) {
  await User.updateOne({ _id: userId }, { $set: { plan: 'pro' }, $unset: { proRetentionUntil: 1 } });
}

async function beginProRetention(userId) {
  const runtime = await getRuntimeConfig();
  const days = Math.max(1, Number(runtime.retention?.proRetentionDays) || 30);
  await User.updateOne({ _id: userId }, { $set: { plan: 'free', proRetentionUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000) } });
}

async function syncPlanAfterSubscriptionEnds(userId, endedSubscriptionId) {
  const now = new Date();
  const query = { userId, $or: [
    { status: { $in: ['active', 'canceling'] }, paidThrough: { $gt: now } },
    { status: 'past_due', graceEndsAt: { $gt: now } }
  ] };
  if (endedSubscriptionId) query._id = { $ne: endedSubscriptionId };
  const another = await Subscription.exists(query);
  if (another) return grantPro(userId);
  return beginProRetention(userId);
}

async function userFromPaystackData(data) {
  const id = data?.metadata?.userId || data?.metadata?.user_id;
  if (id && mongoose.isValidObjectId(id)) {
    const user = await User.findById(id);
    if (user) return user;
  }
  const email = data?.customer?.email || data?.email;
  return email ? User.findOne({ email: String(email).trim().toLowerCase() }) : null;
}

async function findSubscription(data, user) {
  const code = data?.subscription_code || data?.subscription?.subscription_code;
  if (code) {
    const existing = await Subscription.findOne({ subscriptionCode: code }).select('+emailTokenEncrypted');
    if (existing) return existing;
  }
  const reference = data?.reference || data?.transaction?.reference;
  if (reference) {
    const existing = await Subscription.findOne({ checkoutReference: reference }).select('+emailTokenEncrypted');
    if (existing) return existing;
  }
  return user ? Subscription.findOne({ userId: user._id }).sort({ createdAt: -1 }).select('+emailTokenEncrypted') : null;
}

async function activateSubscription({ data, user, subscription }) {
  if (!user || Number(data.amount) !== PRO_PRICE_KOBO || String(data.currency || 'NGN') !== 'NGN') return null;
  const paidAt = asDate(data.paid_at || data.paidAt) || new Date();
  const periodEnd = asDate(data.next_payment_date || data.subscription?.next_payment_date || data.plan?.next_payment_date || data.period_end) || addOneMonth(paidAt);
  const code = data.subscription_code || data.subscription?.subscription_code || subscription?.subscriptionCode;
  const customerCode = data.customer?.customer_code || subscription?.customerCode;
  const emailToken = data.email_token || data.subscription?.email_token;
  const update = {
    userId: user._id,
    provider: 'paystack',
    status: 'active',
    planCode: process.env.PAYSTACK_PRO_PLAN_CODE,
    paidFrom: paidAt,
    paidThrough: periodEnd,
    graceEndsAt: null,
    cancelRequestedAt: null,
    lastPaymentAt: paidAt,
    lastPaymentReference: data.reference || data.transaction?.reference,
    providerSnapshot: safeSnapshot(data)
  };
  if (code) update.subscriptionCode = code;
  if (customerCode) update.customerCode = customerCode;
  if (emailToken) update.emailTokenEncrypted = encryptBillingToken(emailToken);
  const record = subscription
    ? await Subscription.findByIdAndUpdate(subscription._id, update, { new: true })
    : await Subscription.create(update);
  await grantPro(user._id);
  const reference = data.reference || data.transaction?.reference;
  if (reference) {
    await Payment.findOneAndUpdate({ reference }, {
      userId: user._id,
      subscriptionId: record._id,
      reference,
      providerTransactionId: data.id ? String(data.id) : undefined,
      status: 'success',
      amountKobo: Number(data.amount),
      currency: data.currency || 'NGN',
      channel: data.channel || data.authorization?.channel,
      paidAt,
      providerSnapshot: safeSnapshot(data)
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  return record;
}

export function getPlans(req, res) {
  res.json({ success: true, data: publicPlans(), billingAvailable: billingConfigured() });
}

export async function getBillingStatus(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const entitlements = await resolveEntitlements(user);
    const payments = await Payment.find({ userId: user._id }).sort({ createdAt: -1 }).limit(12).select('-providerSnapshot').lean();
    res.json({ success: true, data: { ...entitlements, billingAvailable: billingConfigured(), payments } });
  } catch (error) {
    console.error('[billing/status]', error.message);
    res.status(500).json({ success: false, message: 'We could not open your billing details.' });
  }
}

export async function startCheckout(req, res) {
  try {
    if (!billingConfigured()) return res.status(503).json({ success: false, message: 'Online billing is not available yet.' });
    await validateConfiguredPlan();
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const current = await resolveEntitlements(user, { includeUsage: false });
    if (current.plan === 'pro' && current.subscription.status !== 'past_due') {
      return res.status(409).json({ success: false, code: 'ALREADY_PRO', message: 'Your Veylo Pro subscription is already active.' });
    }
    const reference = `veylo_${crypto.randomUUID().replaceAll('-', '')}`;
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${String(process.env.CLIENT_URL).replace(/\/$/, '')}/billing`;
    const initialized = await paystackRequest('/transaction/initialize', {
      method: 'POST',
      body: {
        email: user.email,
        amount: PRO_PRICE_KOBO,
        currency: 'NGN',
        plan: process.env.PAYSTACK_PRO_PLAN_CODE,
        reference,
        callback_url: callbackUrl,
        channels: ['card', 'direct_debit'],
        metadata: { userId: String(user._id), product: 'veylo-pro-monthly' }
      }
    });
    const subscription = await Subscription.create({ userId: user._id, status: 'checkout_pending', planCode: process.env.PAYSTACK_PRO_PLAN_CODE, checkoutReference: reference });
    await Payment.create({ userId: user._id, subscriptionId: subscription._id, reference, status: 'pending', amountKobo: PRO_PRICE_KOBO, currency: 'NGN' });
    res.status(201).json({ success: true, data: { authorizationUrl: initialized.authorization_url, reference } });
  } catch (error) {
    console.error('[billing/checkout]', error.message);
    res.status(error.status || 500).json({ success: false, message: error.status === 503 ? error.message : 'We could not open Paystack. Please try again.' });
  }
}

export async function verifyCheckout(req, res) {
  try {
    const reference = String(req.params.reference || '').trim();
    if (!/^veylo_[a-f0-9]{32}$/i.test(reference)) return res.status(400).json({ success: false, message: 'That payment reference is not valid.' });
    const payment = await Payment.findOne({ reference, userId: req.user.id });
    if (!payment) return res.status(404).json({ success: false, message: 'We could not find that Veylo payment.' });
    const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
    const user = await User.findById(req.user.id);
    if (data.status !== 'success' || Number(data.amount) !== PRO_PRICE_KOBO || data.currency !== 'NGN' || String(data.customer?.email || '').toLowerCase() !== user.email) {
      return res.status(400).json({ success: false, message: 'Paystack has not confirmed this ₦25,000 payment.' });
    }
    const subscription = await Subscription.findById(payment.subscriptionId).select('+emailTokenEncrypted');
    await activateSubscription({ data, user, subscription });
    res.json({ success: true, data: await resolveEntitlements(user) });
  } catch (error) {
    console.error('[billing/verify]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not confirm that payment yet. Your account will update when Paystack confirms it.' });
  }
}

async function currentPaystackSubscription(userId) {
  return Subscription.findOne({ userId, provider: 'paystack', subscriptionCode: { $exists: true } }).sort({ createdAt: -1 }).select('+emailTokenEncrypted');
}

export async function cancelSubscription(req, res) {
  try {
    const subscription = await currentPaystackSubscription(req.user.id);
    if (!subscription || !['active', 'past_due'].includes(subscription.status)) return res.status(409).json({ success: false, message: 'There is no active Pro subscription to cancel.' });
    const token = decryptBillingToken(subscription.emailTokenEncrypted);
    if (!token) return res.status(409).json({ success: false, message: 'Open Paystack billing to manage this subscription.' });
    await paystackRequest('/subscription/disable', { method: 'POST', body: { code: subscription.subscriptionCode, token } });
    subscription.status = 'canceling';
    subscription.cancelRequestedAt = new Date();
    await subscription.save();
    res.json({ success: true, message: 'Your Pro plan will end after the current paid month.', data: await resolveEntitlements(await User.findById(req.user.id)) });
  } catch (error) {
    console.error('[billing/cancel]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not cancel the subscription. Please try again.' });
  }
}

export async function resumeSubscription(req, res) {
  try {
    const subscription = await currentPaystackSubscription(req.user.id);
    if (!subscription || subscription.status !== 'canceling') return res.status(409).json({ success: false, message: 'This subscription is not scheduled to end.' });
    const token = decryptBillingToken(subscription.emailTokenEncrypted);
    await paystackRequest('/subscription/enable', { method: 'POST', body: { code: subscription.subscriptionCode, token } });
    subscription.status = 'active';
    subscription.cancelRequestedAt = null;
    await subscription.save();
    res.json({ success: true, message: 'Your Veylo Pro subscription will continue.', data: await resolveEntitlements(await User.findById(req.user.id)) });
  } catch (error) {
    console.error('[billing/resume]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not resume the subscription. Please try again.' });
  }
}

export async function getManageLink(req, res) {
  try {
    const subscription = await currentPaystackSubscription(req.user.id);
    if (!subscription) return res.status(404).json({ success: false, message: 'No Paystack subscription was found.' });
    const data = await paystackRequest(`/${['subscription', encodeURIComponent(subscription.subscriptionCode), 'manage', 'link'].join('/')}`, { method: 'GET' });
    res.json({ success: true, data: { link: data.link } });
  } catch (error) {
    console.error('[billing/manage-link]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not open Paystack billing. Please try again.' });
  }
}

async function processWebhookEvent(event) {
  const data = event.data || {};
  let user = await userFromPaystackData(data);
  const subscription = await findSubscription(data, user);
  if (!user && subscription?.userId) user = await User.findById(subscription.userId);
  if (event.event === 'charge.success') return activateSubscription({ data, user, subscription });
  if (event.event === 'subscription.create') {
    if (!user || !subscription) return null;
    subscription.subscriptionCode = data.subscription_code || subscription.subscriptionCode;
    subscription.customerCode = data.customer?.customer_code || subscription.customerCode;
    subscription.planCode = data.plan?.plan_code || subscription.planCode;
    subscription.emailTokenEncrypted = data.email_token ? encryptBillingToken(data.email_token) : subscription.emailTokenEncrypted;
    subscription.providerSnapshot = safeSnapshot(data);
    await subscription.save();
    return subscription;
  }
  if (event.event === 'invoice.payment_failed') {
    if (!subscription) return null;
    subscription.status = 'past_due';
    subscription.graceEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    subscription.providerSnapshot = safeSnapshot(data);
    await subscription.save();
    return subscription;
  }
  if (event.event === 'subscription.not_renew' || event.event === 'subscription.disable') {
    if (!subscription) return null;
    const stillPaid = subscription.paidThrough && subscription.paidThrough > new Date();
    subscription.status = stillPaid ? 'canceling' : 'expired';
    subscription.cancelRequestedAt ||= new Date();
    if (!stillPaid) {
      subscription.canceledAt = new Date();
      if (user) await syncPlanAfterSubscriptionEnds(user._id, subscription._id);
    }
    await subscription.save();
    return subscription;
  }
  if (event.event === 'charge.dispute.create') {
    if (subscription) await Subscription.updateOne({ _id: subscription._id }, { status: 'disputed' });
    const reference = data.transaction?.reference || data.reference;
    if (reference) await Payment.updateOne({ reference }, { status: 'disputed' });
    if (user) await syncPlanAfterSubscriptionEnds(user._id, subscription?._id);
    return subscription;
  }
  if (event.event === 'charge.failed') {
    const reference = data.reference || data.transaction?.reference;
    if (reference) await Payment.updateOne({ reference }, { status: 'failed', providerSnapshot: safeSnapshot(data) });
    return subscription || (user ? { userId: user._id } : null);
  }
  if (event.event === 'refund.failed') {
    const reference = data.transaction?.reference || data.reference;
    const payment = reference ? await Payment.findOne({ reference }) : null;
    if (!payment) return null;
    payment.refundPendingAmountKobo = 0;
    await payment.save();
    return { userId: payment.userId };
  }
  if (event.event === 'refund.processed') {
    const reference = data.transaction?.reference || data.reference;
    const payment = reference ? await Payment.findOne({ reference }) : null;
    if (!payment) return null;
    const refunded = Number(data.amount || payment.amountKobo);
    payment.refundedAmountKobo = Math.min(payment.amountKobo, payment.refundedAmountKobo + refunded);
    payment.refundPendingAmountKobo = Math.max(0, payment.refundPendingAmountKobo - refunded);
    payment.status = payment.refundedAmountKobo >= payment.amountKobo ? 'refunded' : 'partially_refunded';
    await payment.save();
    if (payment.status === 'refunded') {
      const current = await Subscription.findById(payment.subscriptionId);
      if (current) {
        current.status = 'refunded';
        await current.save();
      }
      await syncPlanAfterSubscriptionEnds(payment.userId, current?._id || payment.subscriptionId);
    }
    return { userId: payment.userId };
  }
  return null;
}

export async function paystackWebhook(req, res) {
  const raw = req.body;
  if (!verifyPaystackSignature(raw, req.get('x-paystack-signature'))) return res.status(401).send('Invalid signature');
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('Invalid JSON'); }
  const eventKey = crypto.createHash('sha256').update(raw).digest('hex');
  let record;
  try {
    record = await BillingEvent.create({ eventKey, eventType: String(event.event || 'unknown'), payload: event });
  } catch (error) {
    if (error.code === 11000) return res.sendStatus(200);
    throw error;
  }
  try {
    const handled = await processWebhookEvent(event);
    if (handled?.userId) record.userId = handled.userId;
    record.status = handled ? 'processed' : 'ignored';
    record.processedAt = new Date();
    record.attempts = 1;
    await record.save();
    res.sendStatus(200);
  } catch (error) {
    record.status = 'failed';
    record.attempts = 1;
    record.failure = String(error.message).slice(0, 500);
    await record.save();
    console.error('[billing/webhook]', error.message);
    res.sendStatus(500);
  }
}
