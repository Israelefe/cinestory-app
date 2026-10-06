import PortfolioHandle from '../models/PortfolioHandle.js';
import PortfolioMedia from '../models/PortfolioMedia.js';
import PortfolioJob from '../models/PortfolioJob.js';
import PortfolioEnquiry from '../models/PortfolioEnquiry.js';
import { withBillingLock } from './billingLock.service.js';
import { resolveEntitlements } from './entitlement.service.js';
import { processPortfolioRemovals } from './portfolioLifecycle.service.js';
import Portfolio from '../models/Portfolio.js';
import StorageAsset from '../models/StorageAsset.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Delivery from '../models/Delivery.js';
import DeliveryPreviewFile from '../models/DeliveryPreviewFile.js';
import PhotoStory from '../models/PhotoStory.js';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { removeStorageAsset } from './storageMedia.service.js';
import { deleteR2Object, deleteR2Prefix, listR2ObjectRecords, r2Configured } from './r2.service.js';
import { recordWorkerHeartbeat } from './workerHeartbeat.service.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';
import { sendProEndedEmail } from './email.service.js';
import { getRuntimeConfig } from './runtimeConfig.service.js';

let timer;
let running = false;
let lastRunAt = 0;

export async function referencedMedia(ids, resourceType) {
  const referenced = new Set();
  if (resourceType === 'image' || resourceType === 'raw') {
    const [deliveries, stored, previews] = await Promise.all([
      Delivery.find({ 'assets.publicId': { $in: ids } }).select('assets.publicId').lean(),
      StorageAsset.find({ publicId: { $in: ids } }).select('publicId').lean(),
      DeliveryPreviewFile.find({ 'variants.publicId': { $in: ids } }).select('variants.publicId').lean()
    ]);
    for (const delivery of deliveries) for (const asset of delivery.assets) if (ids.includes(asset.publicId)) referenced.add(asset.publicId);
    for (const asset of stored) referenced.add(asset.publicId);
    for (const preview of previews) for (const variant of preview.variants || []) if (ids.includes(variant.publicId)) referenced.add(variant.publicId);
    const storedRaw = await StorageAsset.find({ rawPublicId: { $in: ids } }).select('rawPublicId').lean();
    for (const asset of storedRaw) if (asset.rawPublicId) referenced.add(asset.rawPublicId);
  }
  if (resourceType !== 'raw') {
    const deliveries = await Delivery.find({ $or: [
      { 'soundtrack.publicId': { $in: ids } }, { 'narration.publicId': { $in: ids } },
      { 'narration.opening.publicId': { $in: ids } }, { 'narration.closing.publicId': { $in: ids } }
    ] }).select('soundtrack.publicId narration.publicId narration.opening.publicId narration.closing.publicId').lean();
    for (const delivery of deliveries) {
      if (delivery.soundtrack?.publicId) referenced.add(delivery.soundtrack.publicId);
      if (delivery.narration?.publicId) referenced.add(delivery.narration.publicId);
      if (delivery.narration?.opening?.publicId) referenced.add(delivery.narration.opening.publicId);
      if (delivery.narration?.closing?.publicId) referenced.add(delivery.narration.closing.publicId);
    }
    const stories = await PhotoStory.find({ $or: [{ 'photos.storageKey': { $in: ids } }, { 'soundtrack.storageKey': { $in: ids } }] }).select('photos.storageKey soundtrack.storageKey').lean();
    for (const story of stories) {
      for (const photo of story.photos || []) if (photo.storageKey) referenced.add(photo.storageKey);
      if (story.soundtrack?.storageKey) referenced.add(story.soundtrack.storageKey);
    }
  }
  return referenced;
}

async function purgeOrphanedUploads(now, orphanUploadHours = 2) {
  if (!r2Configured()) return;
  const cutoff = now.getTime() - Math.max(1, Number(orphanUploadHours) || 2) * 60 * 60 * 1000;
  const oldObjects = (await listR2ObjectRecords('veylo/users/', { maxObjects: 20_000 })).filter(object => object.lastModified && new Date(object.lastModified).getTime() <= cutoff);
  const roots = [...new Set(oldObjects.map(object => object.key.includes('.__veylo/') ? object.key.split('.__veylo/')[0] : object.key))];
  for (let offset = 0; offset < roots.length; offset += 200) {
    const chunk = roots.slice(offset, offset + 200);
    const referenced = await referencedMedia(chunk, 'image');
    const orphanRoots = chunk.filter(key => !referenced.has(key));
    for (const key of orphanRoots) await Promise.all([deleteR2Object(key), deleteR2Prefix(`${key}.__veylo/`)]);
  }
}

export async function purgeExpiredProData(now = new Date()) {
  if (running) return;
  running = true;
  try {
    await processPortfolioRemovals();
    const runtime = await getRuntimeConfig();
    const retention = runtime.retention || {};
    const retentionDays = Math.max(1, Number(retention.proRetentionDays) || 30);
    const analyticsRetentionDays = Math.max(30, Number(retention.analyticsRetentionDays) || 365);
    const analyticsCutoff = new Date(now.getTime() - analyticsRetentionDays * 24 * 60 * 60 * 1000);
    const analyticsPurge = await AnalyticsEvent.deleteMany({ occurredAt: { $lt: analyticsCutoff } });
    await recordWorkerHeartbeat('retention', { status: 'busy', stage: 'retention-scan', details: { analyticsEventsRemoved: Number(analyticsPurge.deletedCount || 0), analyticsRetentionDays } });
    const expiredOverrides = await User.find({ 'planOverride.expiresAt': { $lte: now } }).select('_id').limit(100).lean();
    for (const account of expiredOverrides) {
      await withBillingLock(account._id, async () => {
      const owner = await User.findById(account._id).select('planOverride').lean();
      if (!owner?.planOverride?.expiresAt || owner.planOverride.expiresAt > now) return;
      const paid = await Subscription.exists({ userId: account._id, $or: [
        { status: { $in: ['active', 'canceling'] }, paidThrough: { $gt: now } },
        { status: 'past_due', graceEndsAt: { $gt: now } }
      ] });
      await User.updateOne(
        { _id: account._id },
        paid
          ? { $set: { plan: 'pro' }, $unset: { planOverride: 1, proRetentionUntil: 1 } }
          : { $set: { plan: 'free', proRetentionUntil: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000) }, $unset: { planOverride: 1 } }
      );
      });
    }
    const endedSubscriptions = await Subscription.find({ $or: [{ status: 'past_due', graceEndsAt: { $lte: now } }, { status: { $in: ['active', 'canceling'] }, paidThrough: { $lte: now } }] });
    for (const subscription of endedSubscriptions) {
      await withBillingLock(subscription.userId, async () => {
      const expired = await Subscription.updateOne({ _id: subscription._id, status: subscription.status, ...(subscription.status === 'past_due' ? { graceEndsAt: subscription.graceEndsAt } : { paidThrough: subscription.paidThrough }) }, { $set: { status: 'expired', canceledAt: subscription.canceledAt || now } });
      if (!expired.modifiedCount) return;
      const [anotherPaidSubscription, owner] = await Promise.all([
        Subscription.exists({
          userId: subscription.userId,
          _id: { $ne: subscription._id },
          $or: [
            { status: { $in: ['active', 'canceling'] }, paidThrough: { $gt: now } },
            { status: 'past_due', graceEndsAt: { $gt: now } }
          ]
        }),
        User.findById(subscription.userId).select('name email planOverride').lean()
      ]);
      const manualGrant = owner?.planOverride?.plan === 'pro' && (!owner.planOverride.expiresAt || new Date(owner.planOverride.expiresAt) > now);
      const retentionUntil = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
      await User.updateOne(
        { _id: subscription.userId },
        anotherPaidSubscription || manualGrant
          ? { $set: { plan: 'pro' }, $unset: { proRetentionUntil: 1 } }
          : { $set: { plan: 'free', proRetentionUntil: retentionUntil } }
      );
      if (!anotherPaidSubscription && !manualGrant && owner?.email) sendProEndedEmail({ to: owner.email, name: owner.name, retentionUntil, userId: owner._id, eventKey: `billing:subscription:${subscription._id}:ended` }).catch(error => console.error('[email/pro-ended]', error.message));
      });
    }
    const users = await User.find({ proRetentionUntil: { $lte: now } }).select('_id').limit(50).lean();
    for (const user of users) {
      await withBillingLock(user._id, async () => {
      const currentOwner = await User.findById(user._id);
      if (!currentOwner || !currentOwner.proRetentionUntil || currentOwner.proRetentionUntil > now || (await resolveEntitlements(currentOwner, { includeUsage: false, now })).plan !== 'free') return;
      const portfolios = await Portfolio.find({ userId: user._id }).select('_id items.publicId draft.items.publicId profileMedia.publicId draft.profileMedia.publicId').lean();
      await PortfolioHandle.deleteMany({ portfolioId: { $in: portfolios.map(item => item._id) } });
      await PortfolioJob.deleteMany({ userId: user._id });
      await PortfolioMedia.deleteMany({ $or: [{ publicId: { $in: portfolios.flatMap(item => [...(item.items || []), ...(item.draft?.items || []), ...(item.profileMedia || []), ...(item.draft?.profileMedia || [])].map(photo => photo.publicId)) } }, { publicId: { $regex: `^veylo/users/${user._id}/` } }] });
      const assets = await StorageAsset.find({ userId: user._id }).select('publicId rawPublicId').lean();
      for (const asset of assets) {
        for (const [publicId, resourceType] of [[asset.publicId, 'image'], [asset.rawPublicId, 'raw']]) {
          if (!publicId) continue;
          await removeStorageAsset(publicId, resourceType).catch(error => {
            recordAnalyticsEventAsync({ name: 'storage.delete.failed', source: 'system', actorType: 'system', userId: user._id, status: 'failed', errorCode: error.code || 'RETENTION_LIBRARY_DELETE_FAILED', metadata: { surface: 'retention', publicId: String(publicId).slice(0, 180), resourceType } });
            console.error('[retention/r2]', error.code || error.message);
          });
        }
      }
      await Promise.all([
        StorageAsset.deleteMany({ userId: user._id }),
        LibraryCollaboration.deleteMany({ userId: user._id }),
        Portfolio.deleteMany({ userId: user._id }),
        PortfolioEnquiry.deleteMany({ userId: user._id }),
        User.updateOne({ _id: user._id }, { $set: { storageUsedBytes: 0 }, $unset: { proRetentionUntil: 1 } })
      ]);
      });
    }
    await purgeOrphanedUploads(now, retention.orphanUploadHours);
  } catch (error) {
    console.error('[retention]', error.message);
    recordAnalyticsEventAsync({ name: 'storage.retention.failed', source: 'system', actorType: 'system', status: 'failed', errorCode: error.code || 'RETENTION_FAILED', metadata: { surface: 'retention' } });
    await recordWorkerHeartbeat('retention', { status: 'error', stage: 'retention-scan', details: { errorCode: error.code || 'RETENTION_FAILED' } });
  }
  finally {
    running = false;
    await recordWorkerHeartbeat('retention', { status: 'idle', stage: 'retention-scan' });
  }
}

export function startRetentionWorker() {
  if (timer) return;
  const run = async () => {
    const runtime = await getRuntimeConfig();
    const intervalHours = Math.max(1, Number(runtime.retention?.workerIntervalHours) || 6);
    if (lastRunAt && Date.now() - lastRunAt < intervalHours * 60 * 60 * 1000) return;
    lastRunAt = Date.now();
    await purgeExpiredProData();
  };
  // A failure before the scan's own try/catch must not become an unhandled
  // rejection from a timer callback and terminate the API process.
  const scheduledRun = () => { void run().catch(() => console.error('[retention]', 'RETENTION_SCAN_FAILED')); };
  setTimeout(scheduledRun, 15_000).unref?.();
  timer = setInterval(scheduledRun, 15 * 60 * 1000);
  timer.unref?.();
}
