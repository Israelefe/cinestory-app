import PhotoStory from '../models/PhotoStory.js';
import Subscription from '../models/Subscription.js';
import DeliveryUsage from '../models/DeliveryUsage.js';
import Delivery from '../models/Delivery.js';
import { PLAN_DEFINITIONS } from '../config/plans.js';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

export function lagosMonthWindow(now = new Date()) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - LAGOS_OFFSET_MS);
  const end = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - LAGOS_OFFSET_MS);
  return { start, end };
}

function overrideIsPro(user, now) {
  return user?.planOverride?.plan === 'pro' && (!user.planOverride.expiresAt || user.planOverride.expiresAt > now);
}

export function subscriptionGrantsPro(subscription, now = new Date()) {
  if (!subscription) return false;
  if (['active', 'canceling'].includes(subscription.status)) return Boolean(subscription.paidThrough && subscription.paidThrough > now);
  if (subscription.status === 'past_due') return Boolean(subscription.graceEndsAt && subscription.graceEndsAt > now);
  return false;
}

export async function resolveEntitlements(user, { includeUsage = true, now = new Date() } = {}) {
  const subscription = await Subscription.findOne({ userId: user._id }).sort({ createdAt: -1 });
  // Both the paid Pro plan and the legacy Studio plan receive studio branding.
  // Billing writes `pro` to User.plan, so treating only `studio` as paid made
  // current Pro deliveries fall back to the Veylo mark.
  const pro = ['pro', 'studio'].includes(user?.plan) || overrideIsPro(user, now) || subscriptionGrantsPro(subscription, now);
  const plan = pro ? PLAN_DEFINITIONS.pro : PLAN_DEFINITIONS.free;
  const { start, end } = lagosMonthWindow(now);
  let usedThisMonth = 0;
  if (includeUsage) {
    const key = `${user._id}:${start.toISOString().slice(0, 7)}`;
    const [legacyCount, deliveryCount, usage] = await Promise.all([
      PhotoStory.countDocuments({ userId: user._id, status: 'published', createdAt: { $gte: start, $lt: end } }),
      Delivery.countDocuments({ userId: user._id, status: 'published', publishedAt: { $gte: start, $lt: end } }),
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
      personalStorageBytes: plan.personalStorageBytes
    },
    features: {
      formats: plan.formats,
      branding: plan.branding,
      portfolio: plan.portfolio,
      portfolioMode: pro ? 'public' : user.proRetentionUntil > now ? 'private' : 'unavailable',
      storageMode: pro ? 'read-write' : user.proRetentionUntil > now ? 'read-only' : 'unavailable',
      music: true,
      narration: true,
      accessControls: true,
      clientLikes: true,
      downloads: true
    },
    usage: { deliveriesThisMonth: usedThisMonth, deliveriesRemaining: remaining, periodStart: start, periodEnd: end },
    subscription: subscription ? {
      status: subscription.status,
      paidThrough: subscription.paidThrough,
      graceEndsAt: subscription.graceEndsAt,
      cancelRequestedAt: subscription.cancelRequestedAt,
      canResume: subscription.status === 'canceling' && Boolean(subscription.subscriptionCode),
      canManageCard: Boolean(subscription.subscriptionCode)
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
    const error = new Error('You have published all three Free deliveries for this month. Move to Pro or publish again next month.');
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
      { key, publishedDeliveries: { $lt: PLAN_DEFINITIONS.free.deliveriesPerMonth } },
      { $inc: { publishedDeliveries: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  if (!reservation) {
    const limitError = new Error('You have published all three Free deliveries for this month. Move to Pro or publish again next month.');
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
