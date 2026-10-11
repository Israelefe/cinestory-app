import crypto from 'node:crypto';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';
import { VideoAsset, VideoJob } from '../models/video.models.js';
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
    const [jobs, jobStates, assetStates, failures, nextJob] = await Promise.all([
      VideoJob.find(runnable).select('userId').limit(100).lean(),
      VideoJob.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]),
      VideoAsset.aggregate([{ $match: { state: { $ne: 'deleted' } } }, { $group: { _id: '$state', count: { $sum: 1 } } }]),
      VideoJob.find({ errorCode: { $exists: true, $ne: '' } }).sort({ updatedAt: -1 }).limit(5).select('type state errorCode attempts runAfter updatedAt').lean(),
      VideoJob.findOne({ state: 'queued' }).sort({ runAfter: 1 }).select('runAfter').lean()
    ]);
    const owners = new Set(jobs.map(job => String(job.userId))).size;
    // Only the authenticated coordinator receives these operational summaries.
    // Never include account IDs, filenames, object keys or raw provider errors.
    const diagnostics = {
      jobs: Object.fromEntries(jobStates.map(row => [row._id, row.count])),
      assets: Object.fromEntries(assetStates.map(row => [row._id, row.count])),
      nextRunAt: nextJob?.runAfter || null,
      failures: failures.map(row => ({ type: row.type, state: row.state, attempts: row.attempts, runAfter: row.runAfter, updatedAt: row.updatedAt,
        code: /^VIDEO_[A-Z_]{1,60}$|^R2_[A-Z_]{1,60}$/.test(row.errorCode) ? row.errorCode : 'VIDEO_JOB_FAILED' }))
    };
    res.set('Cache-Control', 'no-store').json({ success: true, data: { pending: owners, concurrency: settings.workerConcurrency, cleanupOnly: !settings.enabled, diagnostics } });
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
