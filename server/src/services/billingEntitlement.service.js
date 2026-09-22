import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import BillingEvent from '../models/BillingEvent.js';
import Payment from '../models/Payment.js';
import { getRuntimeConfig } from './runtimeConfig.service.js';

const PAID_SUBSCRIPTION_STATUSES = new Set(['active', 'canceling']);
const FAILURE_EVENTS = new Set(['invoice.payment_failed', 'charge.failed']);
const SUCCESS_EVENTS = new Set(['charge.success']);

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestByDate(items = [], field = 'createdAt') {
  return [...items].sort((left, right) => {
    const a = asDate(left?.[field])?.getTime() || 0;
    const b = asDate(right?.[field])?.getTime() || 0;
    return b - a;
  })[0] || null;
}

function maxDate(values = []) {
  const dates = values.map(asDate).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(date => date.getTime())));
}

export function manualProGrantIsActive(user, now = new Date()) {
  const grant = user?.planOverride;
  if (grant?.plan !== 'pro') return false;
  const expiresAt = asDate(grant.expiresAt);
  return !expiresAt || expiresAt > now;
}

export function subscriptionGrantsPro(subscription, now = new Date()) {
  if (!subscription) return false;
  if (PAID_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return Boolean(asDate(subscription.paidThrough)?.getTime() > now.getTime());
  }
  if (subscription.status === 'past_due') {
    return Boolean(asDate(subscription.graceEndsAt)?.getTime() > now.getTime());
  }
  return false;
}

function subscriptionState(subscription, now) {
  if (!subscription) return 'none';
  if (subscription.status === 'past_due' && subscriptionGrantsPro(subscription, now)) return 'grace_period';
  if (subscription.status === 'canceling' && subscriptionGrantsPro(subscription, now)) return 'canceling';
  if (subscriptionGrantsPro(subscription, now)) return 'pro';
  return subscription.status || 'unknown';
}

function issue(code, severity, message, subscription = null) {
  return {
    code,
    severity,
    message,
    subscriptionId: subscription?._id || null
  };
}

function subscriptionSummary(subscription, now) {
  if (!subscription) return null;
  return {
    id: subscription._id,
    provider: subscription.provider || 'paystack',
    status: subscription.status || 'unknown',
    paidThrough: subscription.paidThrough || null,
    graceEndsAt: subscription.graceEndsAt || null,
    cancelRequestedAt: subscription.cancelRequestedAt || null,
    canceledAt: subscription.canceledAt || null,
    lastPaymentAt: subscription.lastPaymentAt || null,
    lastPaymentReference: subscription.lastPaymentReference || null,
    createdAt: subscription.createdAt || null,
    updatedAt: subscription.updatedAt || null,
    state: subscriptionState(subscription, now),
    hasProviderSubscription: Boolean(subscription.subscriptionCode)
  };
}

function paymentSummary(payment) {
  if (!payment) return null;
  return {
    id: payment._id,
    reference: payment.reference || '',
    status: payment.status || 'unknown',
    amountKobo: Number(payment.amountKobo || 0),
    refundedAmountKobo: Number(payment.refundedAmountKobo || 0),
    refundPendingAmountKobo: Number(payment.refundPendingAmountKobo || 0),
    currency: payment.currency || 'NGN',
    channel: payment.channel || '',
    paidAt: payment.paidAt || null,
    createdAt: payment.createdAt || null,
    updatedAt: payment.updatedAt || null
  };
}

/**
 * Computes the access Veylo should grant without trusting User.plan alone.
 * This is used by admin health checks and repair actions. The customer-facing
 * entitlement service keeps the same subscription rules, but this snapshot
 * also explains why an account is Pro and lists data mismatches.
 */
export function buildBillingSnapshot(user, subscriptions = [], { billingEvents = [], payments = [], now = new Date() } = {}) {
  const orderedSubscriptions = [...subscriptions].sort((left, right) => (asDate(right?.createdAt)?.getTime() || 0) - (asDate(left?.createdAt)?.getTime() || 0));
  const latestSubscription = orderedSubscriptions[0] || null;
  const qualifyingSubscriptions = orderedSubscriptions.filter(subscription => subscriptionGrantsPro(subscription, now));
  const activeManualGrant = manualProGrantIsActive(user, now);
  const storedPlan = user?.plan || 'free';
  const storedPro = ['pro', 'studio'].includes(storedPlan);
  const effectivePro = activeManualGrant || qualifyingSubscriptions.length > 0;
  const accessReasons = [];

  if (qualifyingSubscriptions.some(subscription => subscription.status === 'past_due')) accessReasons.push('payment_grace');
  if (qualifyingSubscriptions.some(subscription => subscription.status === 'canceling')) accessReasons.push('canceling_subscription');
  if (qualifyingSubscriptions.some(subscription => subscription.status === 'active')) accessReasons.push('paid_subscription');
  if (activeManualGrant) accessReasons.push('manual_grant');

  const accessUntil = activeManualGrant && !asDate(user?.planOverride?.expiresAt)
    ? null
    : maxDate([
      ...qualifyingSubscriptions.map(subscription => subscription.status === 'past_due' ? subscription.graceEndsAt : subscription.paidThrough),
      activeManualGrant ? user?.planOverride?.expiresAt : null
    ]);

  const latestFailure = latestByDate(billingEvents.filter(event => FAILURE_EVENTS.has(event.eventType)), 'createdAt');
  const latestSuccess = latestByDate(billingEvents.filter(event => SUCCESS_EVENTS.has(event.eventType)), 'createdAt');
  const latestFailedWebhook = latestByDate(billingEvents.filter(event => event.status === 'failed'), 'createdAt');
  const latestPayment = latestByDate(payments, 'createdAt');
  const capturedPayments = payments.filter(payment => payment.status === 'success' && Number(payment.refundPendingAmountKobo || 0) <= 0 && Number(payment.refundedAmountKobo || 0) < Number(payment.amountKobo || 0));
  const latestSuccessfulPayment = latestByDate(capturedPayments, 'paidAt') || latestByDate(capturedPayments, 'createdAt');
  const issues = [];

  if (storedPro && !effectivePro) {
    issues.push(issue('pro_without_valid_access', 'high', 'The account is marked Pro, but no paid period, payment grace period, or active manual grant is valid.'));
  }
  if (!storedPro && effectivePro) {
    issues.push(issue('paid_access_marked_free', 'high', 'A valid subscription or manual Pro grant exists, but the account is marked Free.'));
  }
  if (user?.planOverride?.plan === 'pro' && asDate(user?.planOverride?.expiresAt)?.getTime() <= now.getTime()) {
    issues.push(issue('expired_manual_grant', 'medium', 'The manual Pro grant has expired but is still stored on the account.'));
  }

  for (const subscription of orderedSubscriptions.slice(0, 5)) {
    const paidThrough = asDate(subscription.paidThrough);
    const graceEndsAt = asDate(subscription.graceEndsAt);
    if (PAID_SUBSCRIPTION_STATUSES.has(subscription.status) && !paidThrough) {
      issues.push(issue('subscription_missing_paid_through', 'high', 'The subscription is active but has no paid-through date.', subscription));
    } else if (PAID_SUBSCRIPTION_STATUSES.has(subscription.status) && paidThrough && paidThrough <= now) {
      issues.push(issue(subscription.status === 'canceling' ? 'canceled_subscription_still_active' : 'active_subscription_expired', 'high', subscription.status === 'canceling' ? 'The cancellation date has passed but the subscription is still marked canceling.' : 'The subscription is marked active even though its paid-through date has passed.', subscription));
    }
    if (subscription.status === 'past_due' && !graceEndsAt) {
      issues.push(issue('past_due_missing_grace_end', 'high', 'The payment is past due but no grace-period end date is stored.', subscription));
    } else if (subscription.status === 'past_due' && graceEndsAt && graceEndsAt <= now) {
      issues.push(issue('past_due_grace_expired', 'high', 'The payment grace period has ended but the subscription still has a past-due status.', subscription));
    }
    if (subscription.status === 'checkout_pending' && asDate(subscription.createdAt) && asDate(subscription.createdAt).getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
      issues.push(issue('stale_checkout', 'medium', 'A payment checkout has been pending for more than 24 hours.', subscription));
    }
  }

  if (latestFailure && (!latestSuccess || asDate(latestFailure.createdAt) > asDate(latestSuccess.createdAt)) && latestSubscription?.status === 'active') {
    issues.push(issue('renewal_failure_not_reflected', 'high', 'A recent failed billing event exists while the subscription is still marked active.', latestSubscription));
  }
  if (latestFailedWebhook) {
    issues.push(issue('billing_webhook_failed', 'high', 'A billing webhook failed to process and needs review.', latestSubscription));
  }

  const capturedAt = asDate(latestSuccessfulPayment?.paidAt || latestSuccessfulPayment?.createdAt);
  const recentCapturedPayment = capturedAt && capturedAt > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (!effectivePro && latestSuccessfulPayment && recentCapturedPayment) {
    issues.push(issue('successful_payment_without_access', 'high', 'A recent successful payment exists, but this account has no active Pro access. Verify the payment before deciding whether to refund it.', latestSubscription));
  }
  const pendingAt = asDate(latestPayment?.createdAt);
  if (!effectivePro && latestPayment?.status === 'pending' && pendingAt && pendingAt <= new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
    issues.push(issue('pending_payment_without_access', 'high', 'A payment has been pending for more than 24 hours without active Pro access. Verify the payment with Paystack.', latestSubscription));
  }

  const uniqueIssues = [...new Map(issues.map(item => [`${item.code}:${String(item.subscriptionId || '')}`, item])).values()];
  const state = effectivePro
    ? (accessReasons.includes('payment_grace') ? 'grace_period' : accessReasons.includes('canceling_subscription') ? 'canceling' : activeManualGrant && accessReasons.length === 1 ? 'manual_pro' : 'pro')
    : 'free';

  return {
    userId: user?._id,
    storedPlan,
    effectivePlan: effectivePro ? 'pro' : 'free',
    state,
    accessReasons,
    accessUntil,
    effectivePro,
    proRetentionUntil: user?.proRetentionUntil || null,
    manualGrant: user?.planOverride?.plan === 'pro' ? {
      active: activeManualGrant,
      expiresAt: user.planOverride.expiresAt || null,
      reason: user.planOverride.reason || '',
      grantedBy: user.planOverride.grantedBy || null
    } : null,
    subscription: subscriptionSummary(latestSubscription, now),
    subscriptions: orderedSubscriptions.slice(0, 10).map(subscription => subscriptionSummary(subscription, now)),
    latestPayment: paymentSummary(latestPayment),
    paymentToVerify: paymentSummary(latestSuccessfulPayment || (latestPayment?.status === 'pending' ? latestPayment : null)),
    latestFailure: latestFailure ? { eventType: latestFailure.eventType, status: latestFailure.status, failure: latestFailure.failure || '', createdAt: latestFailure.createdAt || null } : null,
    latestWebhook: latestFailedWebhook ? { eventType: latestFailedWebhook.eventType, status: latestFailedWebhook.status, failure: latestFailedWebhook.failure || '', createdAt: latestFailedWebhook.createdAt || null } : null,
    issues: uniqueIssues,
    healthy: uniqueIssues.length === 0,
    checkedAt: now
  };
}

export async function loadBillingSnapshot(userId, now = new Date()) {
  const [user, subscriptions, billingEvents, payments] = await Promise.all([
    User.findById(userId).select('name email plan planOverride proRetentionUntil studio accountStatus').lean(),
    Subscription.find({ userId }).sort({ createdAt: -1 }).limit(50).select('provider status customerCode subscriptionCode planCode checkoutReference paidFrom paidThrough graceEndsAt cancelRequestedAt canceledAt lastPaymentAt lastPaymentReference createdAt updatedAt').lean(),
    BillingEvent.find({ userId }).sort({ createdAt: -1 }).limit(100).select('eventType provider status attempts processedAt failure createdAt').lean(),
    Payment.find({ userId }).sort({ createdAt: -1 }).limit(25).select('reference status amountKobo refundedAmountKobo refundPendingAmountKobo currency channel paidAt createdAt updatedAt').lean()
  ]);
  if (!user) return null;
  return { user, snapshot: buildBillingSnapshot(user, subscriptions, { billingEvents, payments, now }) };
}

export async function synchronizeBillingState(userId, { now = new Date(), reason = 'Billing entitlement resynchronised by administrator' } = {}) {
  const loaded = await loadBillingSnapshot(userId, now);
  if (!loaded) return null;
  const { user, snapshot } = loaded;
  const runtime = await getRuntimeConfig();
  const retentionDays = Math.max(1, Number(runtime.retention?.proRetentionDays) || 30);
  const update = {};
  const unset = {};

  // An expired support grant must not remain as a misleading billing record,
  // even when another valid subscription is keeping the account Pro.
  if (user.planOverride?.plan === 'pro' && user.planOverride.expiresAt && asDate(user.planOverride.expiresAt) <= now) {
    unset.planOverride = 1;
  }

  for (const subscription of loaded.snapshot.subscriptions || []) {
    const endsAt = subscription.status === 'past_due' ? asDate(subscription.graceEndsAt) : asDate(subscription.paidThrough);
    if (['active', 'past_due', 'canceling'].includes(subscription.status) && endsAt && endsAt <= now) {
      await Subscription.updateOne({ _id: subscription.id, status: subscription.status }, { $set: { status: 'expired', canceledAt: subscription.canceledAt || now } });
    }
  }

  if (snapshot.effectivePro) {
    if (user.plan !== 'pro' && user.plan !== 'studio') update.plan = 'pro';
    if (user.proRetentionUntil) unset.proRetentionUntil = 1;
  } else {
    if (user.plan === 'pro' || user.plan === 'studio') {
      update.plan = 'free';
      update.proRetentionUntil = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
    }
  }

  if (Object.keys(update).length || Object.keys(unset).length) {
    await User.updateOne({ _id: userId }, { ...(Object.keys(update).length ? { $set: update } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  }

  const refreshed = await loadBillingSnapshot(userId, now);
  return { before: { user, snapshot }, after: refreshed, reason };
}
