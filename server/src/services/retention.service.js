import Portfolio from '../models/Portfolio.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Delivery from '../models/Delivery.js';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { removeStorageAsset } from './storageMedia.service.js';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { recordWorkerHeartbeat } from './workerHeartbeat.service.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';
import { getRuntimeConfig } from './runtimeConfig.service.js';

let timer;
let running = false;
let lastRunAt = 0;

async function referencedMedia(ids, resourceType) {
  const referenced = new Set();
  if (resourceType === 'image') {
    const [deliveries, stored] = await Promise.all([
      Delivery.find({ 'assets.publicId': { $in: ids } }).select('assets.publicId').lean(),
      StorageAsset.find({ publicId: { $in: ids } }).select('publicId').lean()
    ]);
    for (const delivery of deliveries) for (const asset of delivery.assets) if (ids.includes(asset.publicId)) referenced.add(asset.publicId);
    for (const asset of stored) referenced.add(asset.publicId);
  } else {
    const deliveries = await Delivery.find({ $or: [{ 'soundtrack.publicId': { $in: ids } }, { 'narration.publicId': { $in: ids } }] }).select('soundtrack.publicId narration.publicId').lean();
    for (const delivery of deliveries) {
      if (delivery.soundtrack?.publicId) referenced.add(delivery.soundtrack.publicId);
      if (delivery.narration?.publicId) referenced.add(delivery.narration.publicId);
    }
  }
  return referenced;
}

async function purgeOrphanedUploads(now, orphanUploadHours = 2) {
  if (!configureCloudinary()) return;
  const cutoff = now.getTime() - Math.max(1, Number(orphanUploadHours) || 2) * 60 * 60 * 1000;
  for (const resourceType of ['image', 'video']) {
    let nextCursor;
    let pages = 0;
    do {
      const page = await cloudinary.api.resources({ resource_type: resourceType, type: 'authenticated', prefix: 'veylo/users/', max_results: 500, ...(nextCursor ? { next_cursor: nextCursor } : {}) });
      const candidates = (page.resources || []).filter(resource => new Date(resource.created_at).getTime() <= cutoff).map(resource => resource.public_id);
      if (candidates.length) {
        const referenced = await referencedMedia(candidates, resourceType);
        const orphaned = candidates.filter(id => !referenced.has(id));
        for (let offset = 0; offset < orphaned.length; offset += 100) await cloudinary.api.delete_resources(orphaned.slice(offset, offset + 100), { resource_type: resourceType, type: 'authenticated', invalidate: true });
      }
      nextCursor = page.next_cursor;
      pages += 1;
    } while (nextCursor && pages < 20);
  }
}

export async function purgeExpiredProData(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const runtime = await getRuntimeConfig();
    const retention = runtime.retention || {};
    const retentionDays = Math.max(1, Number(retention.proRetentionDays) || 30);
    const analyticsRetentionDays = Math.max(30, Number(retention.analyticsRetentionDays) || 365);
    const analyticsCutoff = new Date(now.getTime() - analyticsRetentionDays * 24 * 60 * 60 * 1000);
    const analyticsPurge = await AnalyticsEvent.deleteMany({ occurredAt: { $lt: analyticsCutoff } });
    await recordWorkerHeartbeat('retention', { status: 'busy', stage: 'retention-scan', details: { analyticsEventsRemoved: Number(analyticsPurge.deletedCount || 0), analyticsRetentionDays } });
    const expiredOverrides = await User.find({ 'planOverride.expiresAt': { $lte: now } }).select('_id').limit(100).lean();
    for (const account of expiredOverrides) {
      const paid = await Subscription.exists({ userId: account._id, $or: [
        { status: { $in: ['active', 'canceling'] }, paidThrough: { $gt: now } },
        { status: 'past_due', graceEndsAt: { $gt: now } }
      ] });
      await User.updateOne({ _id: account._id }, { $set: { plan: paid ? 'pro' : 'free' }, $unset: { planOverride: 1 } });
    }
    const endedSubscriptions = await Subscription.find({ status: { $in: ['past_due', 'canceling'] }, $or: [{ status: 'past_due', graceEndsAt: { $lte: now } }, { status: 'canceling', paidThrough: { $lte: now } }] }).select('userId');
    for (const subscription of endedSubscriptions) {
      subscription.status = 'expired'; subscription.canceledAt ||= now; await subscription.save();
      await User.updateOne({ _id: subscription.userId }, { $set: { plan: 'free', proRetentionUntil: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000) } });
    }
    const users = await User.find({ proRetentionUntil: { $lte: now } }).select('_id').limit(50).lean();
    for (const user of users) {
      const assets = await StorageAsset.find({ userId: user._id }).select('publicId').lean();
      for (const asset of assets) await removeStorageAsset(asset.publicId).catch(error => {
        recordAnalyticsEventAsync({ name: 'storage.delete.failed', source: 'system', actorType: 'system', userId: user._id, status: 'failed', errorCode: error.code || 'RETENTION_LIBRARY_DELETE_FAILED', metadata: { surface: 'retention', publicId: String(asset.publicId).slice(0, 180) } });
        console.error('[retention/cloudinary]', error.http_code || error.message);
      });
      await Promise.all([
        StorageAsset.deleteMany({ userId: user._id }),
        Portfolio.deleteMany({ userId: user._id }),
        User.updateOne({ _id: user._id }, { $set: { storageUsedBytes: 0 }, $unset: { proRetentionUntil: 1 } })
      ]);
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
  setTimeout(run, 15_000).unref?.();
  timer = setInterval(run, 15 * 60 * 1000);
  timer.unref?.();
}
