import PhotoStory from '../models/PhotoStory.js';
import Subscription from '../models/Subscription.js';
import DeliveryUsage from '../models/DeliveryUsage.js';
import Delivery from '../models/Delivery.js';
import { PLAN_DEFINITIONS } from '../config/plans.js';
import { getRuntimeConfig } from './runtimeConfig.service.js';
import { publicVideoSettings } from '../config/videoDelivery.js';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

export function lagosMonthWindow(now = new Date()) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - LAGOS_OFFSET_MS);
  const end = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - LAGOS_OFFSET_MS);
  return { start, end };
}

export function manualProGrantIsActive(user, now = new Date()) {
  const expiresAt = user?.planOverride?.expiresAt ? new Date(user.planOverride.expiresAt) : null;
  return user?.planOverride?.plan === 'pro' && (!expiresAt || expiresAt > now);
}

export function subscriptionGrantsPro(subscription, now = new Date()) {
  if (!subscription) return false;
  if (['active', 'canceling'].includes(subscription.status)) return Boolean(subscription.paidThrough && new Date(subscription.paidThrough) > now);
  if (subscription.status === 'past_due') return Boolean(subscription.graceEndsAt && new Date(subscription.graceEndsAt) > now);
  return false;
}

export function subscriptionCanManageCard(subscription, now = new Date()) {
  return Boolean(subscription?.provider === 'paystack' && subscription.subscriptionCode
    && ['active', 'past_due'].includes(subscription.status)
    && (subscriptionGrantsPro(subscription, now) || (subscription.resumesSubscriptionId && subscription.renewalStartsAt > now))
    && !subscription.resumePendingAt
    && !subscription.cancelRequestedAt && !subscription.providerCanceledAt && !subscription.cancelPendingAt);
}

export async function resolveEntitlements(user, { includeUsage = true, now = new Date() } = {}) {
  // Both the paid Pro plan and the legacy Studio plan receive studio branding.
  // Billing writes `pro` to User.plan, so treating only `studio` as paid made
  // current Pro deliveries fall back to the Veylo mark.
  const subscriptions = await Subscription.find({ userId: user._id }).sort({ paidThrough: -1, createdAt: -1 }).lean();
  const paidSubscription = subscriptions.find(item => subscriptionGrantsPro(item, now));
  const renewalSubscription = paidSubscription && subscriptions.find(item => String(item.resumesSubscriptionId || '') === String(paidSubscription._id)
    && item.status === 'active' && !item.resumePendingAt && !item.cancelRequestedAt && !item.providerCanceledAt && !item.cancelPendingAt);
  const subscription = renewalSubscription || paidSubscription || (manualProGrantIsActive(user, now) ? null : subscriptions[0]);
  const pro = manualProGrantIsActive(user, now) || subscriptions.some(item => subscriptionGrantsPro(item, now));
  const runtime = await getRuntimeConfig();
  const plan = (pro ? runtime.plans?.pro : runtime.plans?.free) || (pro ? PLAN_DEFINITIONS.pro : PLAN_DEFINITIONS.free);
  const enabledFormats = new Set(Object.values(runtime.formats || {}).filter(format => format?.enabled !== false).map(format => format.id));
  const featureFlags = runtime.featureFlags || {};
  const { start, end } = lagosMonthWindow(now);
  let usedThisMonth = 0;
  if (includeUsage) {
    const key = `${user._id}:${start.toISOString().slice(0, 7)}`;
    const [legacyCount, deliveryCount, usage] = await Promise.all([
      PhotoStory.countDocuments({ userId: user._id, status: 'published', createdAt: { $gte: start, $lt: end } }),
      Delivery.countDocuments({ userId: user._id, kind: { $ne: 'video' }, status: 'published', publishedAt: { $gte: start, $lt: end } }),
      DeliveryUsage.findOne({ key }).lean()
    ]);
    usedThisMonth = Math.max(legacyCount + deliveryCount, usage?.publishedDeliveries || 0);
  }
  const remaining = plan.deliveriesPerMonth === null ? null : Math.max(0, plan.deliveriesPerMonth - usedThisMonth);

  return {
    plan: plan.id,
    planName: plan.name,
    limits: {
      deliveriesPerMonth: plan.deliveriesPerMonth,
      photosPerDelivery: plan.photosPerDelivery,
      personalStorageBytes: plan.personalStorageBytes,
      videoDelivery: publicVideoSettings(runtime.videoDelivery)
    },
    features: {
      formats: (plan.formats || []).filter(format => enabledFormats.has(format)),
      branding: plan.branding,
      portfolio: Boolean(plan.portfolio && featureFlags.portfolio !== false),
      portfolioMode: featureFlags.portfolio !== false ? (pro && plan.portfolio ? 'public' : user.proRetentionUntil > now ? 'private' : 'unavailable') : 'unavailable',
      storageMode: pro ? 'read-write' : user.proRetentionUntil > now ? 'read-only' : 'unavailable',
      music: featureFlags.music !== false,
      narration: featureFlags.narration !== false,
      volumeDeliveries: featureFlags.volumeDeliveries !== false,
      accessControls: true,
      clientLikes: true,
      downloads: true,
      videoDelivery: Boolean(pro && publicVideoSettings(runtime.videoDelivery).available)
    },
    usage: { deliveriesThisMonth: usedThisMonth, deliveriesRemaining: remaining, periodStart: start, periodEnd: end },
    subscription: subscription ? {
      status: subscription.status,
      amountKobo: subscription.amountKobo || (subscription.provider === 'paystack' ? 2500000 : 0),
      currency: subscription.currency || 'NGN',
      pricingRegion: subscription.pricingRegion,
      paidThrough: subscription.paidThrough || (renewalSubscription ? paidSubscription.paidThrough : undefined),
      renewalStartsAt: subscription.renewalStartsAt,
      graceEndsAt: subscription.graceEndsAt,
      cancelRequestedAt: subscription.cancelRequestedAt,
      canResume: subscription.status === 'canceling' && subscription.paidThrough > now && Boolean(subscription.subscriptionCode) && Boolean(subscription.providerCanceledAt) && !subscription.cancelPendingAt,
      canManageCard: subscriptionCanManageCard(subscription, now)
    } : { status: 'free', canResume: false, canManageCard: false }
  };
}

export async function assertCanPublish(user, photoCount) {
  const entitlements = await resolveEntitlements(user);
  if (!Number.isInteger(photoCount) || photoCount < 1) {
    const error = new Error('Add at least one finished photograph before publishing.');
    error.status = 400;
    throw error;
  }
  if (photoCount > entitlements.limits.photosPerDelivery) {
    const error = new Error(`${entitlements.planName} allows up to ${entitlements.limits.photosPerDelivery} photographs in one delivery.`);
    error.status = 403;
    error.code = 'PHOTO_LIMIT_REACHED';
    throw error;
  }
  if (entitlements.usage.deliveriesRemaining === 0) {
    const error = new Error(`You have published all ${entitlements.limits.deliveriesPerMonth} Free deliveries for this month. Move to Pro or publish again next month.`);
    error.status = 403;
    error.code = 'MONTHLY_DELIVERY_LIMIT_REACHED';
    throw error;
  }
  return entitlements;
}

export async function reservePublishSlot(user, photoCount) {
  const entitlements = await assertCanPublish(user, photoCount);
  if (entitlements.plan === 'pro') return { entitlements, async release() {} };
  const { start, end } = lagosMonthWindow();
  const key = `${user._id}:${start.toISOString().slice(0, 7)}`;
  const existing = await DeliveryUsage.findOne({ key });
  if (!existing) {
    const [legacyCount, deliveryCount] = await Promise.all([
      PhotoStory.countDocuments({ userId: user._id, status: 'published', createdAt: { $gte: start, $lt: end } }),
      Delivery.countDocuments({ userId: user._id, status: 'published', publishedAt: { $gte: start, $lt: end } })
    ]);
    const published = legacyCount + deliveryCount;
    await DeliveryUsage.updateOne({ key }, { $setOnInsert: { key, userId: user._id, periodStart: start, periodEnd: end, publishedDeliveries: published } }, { upsert: true });
  }
  let reservation;
  try {
    reservation = await DeliveryUsage.findOneAndUpdate(
      { key, publishedDeliveries: { $lt: entitlements.limits.deliveriesPerMonth } },
      { $inc: { publishedDeliveries: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  if (!reservation) {
    const limitError = new Error(`You have published all ${entitlements.limits.deliveriesPerMonth} Free deliveries for this month. Move to Pro or publish again next month.`);
    limitError.status = 403;
    limitError.code = 'MONTHLY_DELIVERY_LIMIT_REACHED';
    throw limitError;
  }
  return {
    entitlements,
    async release() {
      await DeliveryUsage.updateOne({ _id: reservation._id, publishedDeliveries: { $gt: 0 } }, { $inc: { publishedDeliveries: -1 } });
    }
  };
}
