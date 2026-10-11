import crypto from 'node:crypto';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';
import { VideoJob } from '../models/video.models.js';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';
import { acquireVideoLease, releaseVideoLease } from '../services/videoLease.service.js';
import { reconcileVideoLibrary } from '../services/videoWorker.service.js';
import { cloudflareVideoProcessing, processingAuthorized } from '../services/videoProcessingAuth.js';

export function requireVideoProcessing(req, res, next) {
  if (!cloudflareVideoProcessing() || !processingAuthorized(req.headers.authorization)) return res.status(401).json({ success: false, message: 'Unauthorised.' });
  next();
}

export async function videoProcessingStatus(req, res, next) {
  try {
    const body = req.body || {};
    const verified = typeof body.verifiedAt === 'number' ? body.verifiedAt : 0;
    const verifiedAt = verified > Date.now() - 86400_000 && verified <= Date.now() + 30_000 ? new Date(Math.min(verified, Date.now())) : null;
    const budget = Number.isSafeInteger(body.remainingSeconds) && body.remainingSeconds >= 0 ? body.remainingSeconds : 0;
    await WorkerHeartbeat.findOneAndUpdate({ workerName: 'video-coordinator', instance: 'cloudflare' }, {
      $set: { status: verifiedAt && budget >= 90 ? 'idle' : 'disabled', heartbeatAt: new Date(), stage: 'cloudflare-containers',
        details: { verifiedAt, remainingSeconds: budget, reservedSeconds: Number.isSafeInteger(body.reservedSeconds) ? Math.max(0, body.reservedSeconds) : 0 } }
    }, { upsert: true });
    const settings = (await getRuntimeConfig()).videoDelivery;
    const runnable = { runAfter: { $lte: new Date() }, $or: [{ state: 'queued' }, { state: 'running', leaseUntil: { $lte: new Date() } }] };
    // Cleanup must still run when uploads/AI are paused.
    if (!settings.enabled) runnable.type = 'delete';
    const jobs = await VideoJob.find(runnable).select('userId').limit(100).lean();
    const owners = new Set(jobs.map(job => String(job.userId))).size;
    res.set('Cache-Control', 'no-store').json({ success: true, data: { pending: owners, concurrency: settings.workerConcurrency, cleanupOnly: !settings.enabled } });
  } catch (error) { next(error); }
}

export async function maintainVideoProcessing(req, res, next) {
  let lease;
  const resourceId = crypto.randomUUID();
  try {
    // API-side reconciliation wakes no FFmpeg container for an empty library.
    lease = await acquireVideoLease('video:maintenance', 1, { ownerId: 'system', resourceId, ttlSeconds: 600 });
    await reconcileVideoLibrary();
    res.set('Cache-Control', 'no-store').json({ success: true });
  } catch (error) {
    if (error.code === 'VIDEO_CAPACITY_BUSY') return res.status(202).json({ success: true });
    next(error);
  } finally { await releaseVideoLease(lease, resourceId); }
}
