import crypto from 'node:crypto';
import sharp from 'sharp';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import { VideoAsset, VideoUpload, VideoJob, VideoLease, VideoAnalysisPart, VideoUsage, VideoPlayback, VideoQuota, VideoAIUsage } from '../models/video.models.js';
import { getRuntimeConfig } from './runtimeConfig.service.js';
import { resolveEntitlements } from './entitlement.service.js';
import { lagosMonthWindow } from './entitlement.service.js';
import { withBillingLock } from './billingLock.service.js';
import { recordWorkerHeartbeat } from './workerHeartbeat.service.js';
import { sendOnce } from './email.service.js';
import { videoContext, queueVideoJob, reconcileVideoUsage } from './videoDelivery.service.js';
import { acquireVideoLease, releaseVideoLease } from './videoLease.service.js';
import { reserveVideoDuration, commitVideoDuration, releaseVideoQuota, reconcileVideoQuota } from './videoQuota.service.js';
import { abortR2Multipart, deleteR2Object, deleteR2Prefix, putR2Object } from './r2.service.js';
import { importStreamVideo, listOwnedStreamVideos, streamDetails, deleteStreamVideo, verifyStreamWebhook } from './videoProvider.service.js';
import { withLocalVideo, inspectLocalVideo, extractVideoFrame, runMediaTool, cleanupVideoTemps } from './videoMedia.service.js';
import { analyzeVideo, suggestVideoPresentation } from './videoAnalysis.service.js';

export async function syncStreamAsset(asset, settings) {
  if (!asset.streamUid || ['deleting', 'deleted', 'failed'].includes(asset.state)) return;
  const details = await streamDetails(asset.streamUid);
  if (details.requireSignedURLs !== true) {
    await VideoAsset.updateOne({ _id: asset._id, state: { $nin: ['deleting', 'deleted'] } }, { $set: { state: 'failed', errorCode: 'VIDEO_PRIVATE_IMPORT_FAILED', errorMessage: 'Private playback could not be verified. Please retry preparation.' } });
    await deleteStreamVideo(asset.streamUid);
    return;
  }
  if (details.status?.state === 'error') {
    await VideoAsset.updateOne({ _id: asset._id, state: { $in: ['queued', 'processing'] } }, { $set: { state: 'failed', errorCode: 'VIDEO_ENCODING_FAILED', errorMessage: 'This export could not be prepared for playback. Try an H.264 MP4 export.' } });
    await VideoLease.updateMany({ resourceId: String(asset._id), _id: /^encode:platform:/ }, { $set: { expiresAt: new Date(0) } });
    return;
  }
  if (details.readyToStream && details.status?.state === 'ready') {
    const duration = Number(details.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > settings.maxDurationSeconds || Math.abs(duration - asset.duration) > Math.max(3, asset.duration * .01)) {
      await VideoAsset.updateOne({ _id: asset._id, state: { $in: ['processing', 'queued'] } }, { $set: { state: 'failed', errorCode: 'VIDEO_DURATION_MISMATCH', errorMessage: 'The playback duration did not match your original. Download your original or try a new H.264 MP4 export.' } });
      await VideoLease.updateMany({ resourceId: String(asset._id), _id: /^encode:platform:/ }, { $set: { expiresAt: new Date(0) } });
      return;
    }
    await commitVideoDuration(asset._id);
    await VideoAsset.updateOne({ _id: asset._id, streamUid: asset.streamUid, state: { $in: ['processing', 'queued'] } }, { $set: { state: 'ready', streamReadyAt: new Date(), errorCode: '', errorMessage: '' } });
    await VideoLease.updateMany({ resourceId: String(asset._id), _id: /^encode:platform:/ }, { $set: { expiresAt: new Date(0) } });
  } else await acquireVideoLease('encode:platform', settings.platformEncodes, { ownerId: asset.userId, resourceId: asset._id, ttlSeconds: 3600 });
}
export async function streamWebhook(req, res) {
  if (!verifyStreamWebhook(req.body, req.get('Webhook-Signature'))) return res.status(401).json({ success: false });
  let payload; try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ success: false }); }
  if (!/^[a-f\d]{32}$/i.test(payload.uid || '')) return res.status(400).json({ success: false });
  try {
    const asset = await VideoAsset.findOne({ streamUid: payload.uid });
    if (asset) await syncStreamAsset(asset, (await getRuntimeConfig()).videoDelivery);
    // Unknown or already deleted assets cannot be resurrected by a callback.
    return res.json({ success: true });
  } catch { return res.status(503).json({ success: false }); }
}
async function recoverStreamUid(asset) {
  const videos = await listOwnedStreamVideos(asset.userId);
  if (!Array.isArray(videos)) throw new Error('Provider video reconciliation is unavailable.');
  const matches = videos.filter(video => video.meta?.assetId === String(asset._id));
  if (matches.length > 1) for (const duplicate of matches.slice(1)) await deleteStreamVideo(duplicate.uid);
  return matches[0]?.uid || '';
}
async function prepareVideo(asset, settings) {
  await videoContext(asset.userId, { write: true });
  if (asset.state === 'ready') return;
  if (asset.streamUid) { await syncStreamAsset(asset, settings); return; }
  // Recover an accepted copy before making another one after a timeout.
  if (asset.streamImportedAt) {
    const uid = await recoverStreamUid(asset);
    if (uid) { await VideoAsset.updateOne({ _id: asset._id }, { $set: { streamUid: uid, state: 'processing' } }); return; }
    // Stream's list is eventually consistent; never immediately duplicate a copy.
    if (Date.now() - asset.streamImportedAt < 10 * 60_000) throw Object.assign(new Error('Waiting for video preparation.'), { code: 'VIDEO_IMPORT_PENDING' });
  }
  await acquireVideoLease('encode:platform', settings.platformEncodes, { ownerId: asset.userId, resourceId: asset._id, ttlSeconds: 3600 });
  await VideoAsset.updateOne({ _id: asset._id, state: { $in: ['queued', 'verifying', 'processing'] } }, { $set: { state: 'verifying' } });
  await withLocalVideo(asset, async ({ file, directory, checksum }) => {
    const metadata = await inspectLocalVideo(file, settings.maxDurationSeconds);
    await reserveVideoDuration(asset._id, metadata.duration, settings.storedSeconds);
    const poster = await extractVideoFrame(file, directory, Math.min(metadata.duration * .1, 5));
    const buffer = await sharp(poster).webp({ quality: 84 }).toBuffer();
    const posterKey = asset.objectKey.replace(/original\.[^.]+$/, 'poster.webp');
    await putR2Object(posterKey, buffer, { contentType: 'image/webp' });
    const current = await VideoAsset.findOneAndUpdate({ _id: asset._id, state: 'verifying' }, { $set: { ...metadata, checksum, posterKey, state: 'processing', streamImportedAt: new Date() } }, { new: true });
    if (!current) return;
    // Recheck Pro immediately before the paid import operation.
    await videoContext(asset.userId, { write: true });
    const uid = await importStreamVideo(current);
    const saved = await VideoAsset.updateOne({ _id: asset._id, state: 'processing' }, { $set: { streamUid: uid } });
    if (!saved.matchedCount) await deleteStreamVideo(uid);
  });
}
export async function deleteVideoOriginal(asset, { force = false } = {}) {
  if (asset.state === 'deleted') return;
  if (!force && await Delivery.exists({ userId: asset.userId, kind: 'video', status: 'published', 'video.published.items.assetId': asset._id })) throw Object.assign(new Error('This video is still in a published delivery.'), { code: 'VIDEO_IN_USE' });
  await VideoAsset.updateOne({ _id: asset._id }, { $set: { state: 'deleting' } });
  // Wait for a running import/analysis to finish. Its final state update is
  // conditional, so it cannot resurrect the asset after deletion is requested.
  if (await VideoJob.exists({ assetId: asset._id, type: { $ne: 'delete' }, state: 'running', leaseUntil: { $gt: new Date() } })) throw Object.assign(new Error('Video cleanup is waiting for current work.'), { code: 'VIDEO_WORK_PENDING' });
  const uploads = await VideoUpload.find({ assetId: asset._id });
  for (const upload of uploads) {
    if (upload.uploadId && upload.state !== 'completed') await abortR2Multipart(asset.objectKey, upload.uploadId);
    await Promise.all([releaseVideoLease(upload.leaseId, String(upload._id)), releaseVideoLease(upload.accountLeaseId, String(upload._id))]);
    await VideoUpload.updateOne({ _id: upload._id }, { $set: { state: 'aborted' } });
  }
  let uid = asset.streamUid;
  if (!uid && asset.streamImportedAt) uid = await recoverStreamUid(asset);
  if (!uid && asset.streamImportedAt && Date.now() - asset.streamImportedAt < 10 * 60_000) throw Object.assign(new Error('Waiting to confirm the video import before cleanup.'), { code: 'VIDEO_IMPORT_PENDING' });
  if (uid) await deleteStreamVideo(uid);
  await deleteR2Object(asset.objectKey);
  for (const key of new Set([asset.objectKey.replace(/original\.[^.]+$/, 'poster.webp'), asset.posterKey, ...(asset.posterKeys || [])].filter(Boolean))) await deleteR2Object(key);
  // Also clear a cover uploaded just before a database write/process failed.
  // The prefix must belong to this one server-created asset directory.
  const prefix = asset.objectKey.replace(/original\.(mp4|mov|webm)$/, '');
  if (!prefix.endsWith(`/${asset._id}/`)) throw new Error('Video cleanup could not verify its storage directory.');
  await deleteR2Prefix(prefix);
  await releaseVideoQuota(asset._id);
  await VideoAnalysisPart.deleteMany({ assetId: asset._id });
  await VideoAsset.updateOne({ _id: asset._id, state: 'deleting' }, { $set: { state: 'deleted', deletedAt: new Date() }, $unset: { analysis: 1, posterKey: 1, streamUid: 1 } });
  await Delivery.updateMany({ userId: asset.userId, kind: 'video', 'video.draft.items.assetId': asset._id }, { $pull: { 'video.draft.items': { assetId: asset._id } }, $inc: { 'video.revision': 1 } });
  await VideoLease.updateMany({ resourceId: String(asset._id), _id: /^encode:platform:/ }, { $set: { expiresAt: new Date(0) } });
}
export async function purgeUserVideos(userId) {
  // Called under the billing lock, after active Pro has been checked centrally.
  await Delivery.updateMany({ userId, kind: 'video' }, { $set: { status: 'archived', 'access.revokedAt': new Date() }, $inc: { 'video.accessVersion': 1 } });
  const assets = await VideoAsset.find({ userId, state: { $ne: 'deleted' } });
  for (const asset of assets) await deleteVideoOriginal(asset, { force: true });
}
export async function deleteVideoAccountRecords(userId, options = {}) {
  for (const model of [VideoAsset, VideoUpload, VideoQuota, VideoJob, VideoAnalysisPart, VideoUsage, VideoPlayback]) await model.deleteMany({ userId }, options);
  await VideoLease.deleteMany({ ownerId: String(userId) }, options);
  await VideoAIUsage.deleteMany({ _id: { $regex: '^account:' + String(userId) + ':' } }, options);
}
export async function runVideoJob() {
  const settings = (await getRuntimeConfig()).videoDelivery;
  const token = crypto.randomUUID();
  const job = await VideoJob.findOneAndUpdate({ runAfter: { $lte: new Date() }, $or: [{ state: 'queued' }, { state: 'running', leaseUntil: { $lte: new Date() } }] }, { $set: { state: 'running', leaseToken: token, leaseUntil: new Date(Date.now() + 120_000) }, $inc: { attempts: 1 } }, { new: true, sort: { type: -1, runAfter: 1 } });
  if (!job) return false;
  let globalLease; let accountLease;
  const renew = setInterval(() => { void Promise.all([VideoJob.updateOne({ _id: job._id, leaseToken: token }, { $set: { leaseUntil: new Date(Date.now() + 120_000) } }), VideoLease.updateMany({ _id: { $in: [globalLease, accountLease].filter(Boolean) }, resourceId: String(job._id) }, { $set: { expiresAt: new Date(Date.now() + 120_000) } })]).catch(() => {}); }, 30_000); renew.unref?.();
  try {
    globalLease = await acquireVideoLease('media:platform', settings.workerConcurrency, { ownerId: job.userId, resourceId: job._id, ttlSeconds: 120 });
    accountLease = await acquireVideoLease('media:' + job.userId, 1, { ownerId: job.userId, resourceId: job._id, ttlSeconds: 120 });
    const asset = await VideoAsset.findById(job.assetId);
    if (asset && asset.state !== 'deleted') {
      if (job.type === 'delete') await deleteVideoOriginal(asset);
      else if (!['deleting', 'deleted'].includes(asset.state)) {
        if (job.type === 'prepare') await prepareVideo(asset, settings);
        else if (job.type === 'analyze' || job.type === 'present') {
          await videoContext(asset.userId, { write: true }); if (!settings.aiEnabled) throw Object.assign(new Error('Video suggestions are temporarily paused.'), { code: 'VIDEO_AI_PAUSED' });
          if (job.type === 'analyze') await analyzeVideo(asset, settings, job.options);
          else { const result = await suggestVideoPresentation(job, settings); await VideoJob.updateOne({ _id: job._id, leaseToken: token }, { $set: { result } }); }
        }
      }
    }
    await VideoJob.updateOne({ _id: job._id, leaseToken: token }, { $set: { state: 'done', leaseUntil: new Date(0) } });
  } catch (error) {
    const retryable = ['VIDEO_CAPACITY_BUSY', 'VIDEO_DISK_BUSY', 'VIDEO_IMPORT_PENDING', 'VIDEO_WORK_PENDING', 'VIDEO_PROVIDER_NETWORK', 'VIDEO_PROVIDER_FAILED', 'R2_NETWORK_ERROR', 'R2_REQUEST_FAILED', 'VIDEO_PRO_REQUIRED', 'VIDEO_UNAVAILABLE', 'VIDEO_WORKER_UNAVAILABLE'].includes(error.code);
    // Cleanup keeps retrying until providers confirm deletion. Failed assets
    // stay charged and downloadable; their bytes are never silently released.
    const retry = job.type === 'delete' || retryable;
    await VideoJob.updateOne({ _id: job._id, leaseToken: token }, { $set: { state: retry ? 'queued' : 'failed', errorCode: error.code || 'VIDEO_JOB_FAILED', leaseUntil: new Date(0), runAfter: new Date(Date.now() + Math.min(3600_000, 15_000 * Math.max(1, job.attempts))) } });
    if (!retry && job.type !== 'present') await VideoAsset.updateOne({ _id: job.assetId, state: { $nin: ['deleting', 'deleted'] } }, { $set: job.type === 'analyze' ? { 'analysis.state': 'failed', 'analysis.errorMessage': error.code === 'VIDEO_AI_BUDGET' ? error.message : 'Suggestions could not be completed. Your own titles and descriptions are unchanged.' } : { state: 'failed', errorCode: error.code || 'VIDEO_PREPARATION_FAILED', errorMessage: 'This video could not be prepared. You can retry or download the original.' } });
  } finally { clearInterval(renew); await Promise.all([releaseVideoLease(globalLease, String(job._id)), releaseVideoLease(accountLease, String(job._id))]); }
  return true;
}

export async function reconcileVideoLibrary() {
  await cleanupVideoTemps();
  const settings = (await getRuntimeConfig()).videoDelivery;
  const expired = await VideoUpload.find({ state: { $in: ['initializing', 'paused', 'uploading', 'completing'] }, expiresAt: { $lte: new Date() } }).limit(100);
  for (const upload of expired) {
    const closed = await VideoUpload.updateOne({ _id: upload._id, state: upload.state, expiresAt: { $lte: new Date() } }, { $set: { state: 'aborting' } });
    if (closed.modifiedCount) await queueVideoJob({ _id: upload.assetId, userId: upload.userId }, 'delete');
  }
  // Recover the gap between an upload commit and enqueue after a process crash.
  for (const asset of await VideoAsset.find({ state: 'queued' }).limit(100)) await queueVideoJob(asset, 'prepare');
  for (const asset of await VideoAsset.find({ state: 'deleting' }).limit(100)) await queueVideoJob(asset, 'delete');
  for (const upload of await VideoUpload.find({ state: 'aborting' }).limit(100)) await queueVideoJob({ _id: upload.assetId, userId: upload.userId }, 'delete');
  for (const asset of await VideoAsset.find({ state: 'ready', 'analysis.state': { $in: ['queued', 'running'] }, updatedAt: { $lt: new Date(Date.now() - 180_000) } }).limit(100)) {
    if (!await VideoJob.exists({ assetId: asset._id, type: 'analyze', state: { $in: ['running', 'queued'] } })) await queueVideoJob(asset, 'analyze', { includeSpeech: Boolean(asset.analysis.includeSpeech), generation: asset.analysis.generation }, asset.analysis.generation || 'recovery:' + asset.updatedAt.getTime());
  }
  for (const asset of await VideoAsset.find({ state: 'processing', streamUid: { $exists: true, $ne: '' } }).limit(200)) {
    try { await syncStreamAsset(asset, settings); } catch { /* Retry without resetting quota or publishing the asset. */ }
  }
  const owners = await VideoAsset.distinct('userId', { state: { $nin: ['deleted', 'reserved', 'uploading'] } });
  for (const userId of owners) {
    const user = await User.findById(userId); if (!user) continue;
    await reconcileVideoQuota(userId);
    const { entitlements, recoveryUntil } = await videoContext(userId, { maintenance: true });
    if (entitlements.plan === 'pro') {
      try {
        const usage = await reconcileVideoUsage(userId);
        // Catch late provider segments across the Lagos month boundary.
        if (Date.now() - usage.periodStart.getTime() < 7 * 86400_000) {
          const previousDate = new Date(usage.periodStart.getTime() - 1);
          const previousWindow = lagosMonthWindow(previousDate);
          const previous = await VideoUsage.findById(`${userId}:${previousWindow.start.toISOString()}`);
          if (previous && (!previous.reconciledAt || Date.now() - previous.reconciledAt > 86400_000)) await reconcileVideoUsage(userId, { periodDate: previousDate });
        }
        for (const percent of [80, 95]) {
          if (usage.deliveredMinutes < settings.monthlyDeliveredMinutes * percent / 100) continue;
          await sendOnce({ eventKey: `video-usage:${userId}:${usage.periodStart.toISOString()}:${percent}`, kind: 'video-usage', userId, to: user.email, subject: `You have used ${percent}% of your monthly video playback allowance`, text: `Your films have delivered ${Math.ceil(usage.deliveredMinutes)} of ${settings.monthlyDeliveredMinutes} playback minutes this month. This includes buffering and your previews. New playback is paused when the observed allowance is reached; original downloads remain available where you enabled them. Check your video library: ${process.env.CLIENT_URL}/videos/library` });
        }
      } catch { /* Stale usage denies new playback until a later successful reconciliation. */ }
    } else if (recoveryUntil) {
      const days = Math.ceil((recoveryUntil - Date.now()) / 86400_000);
      if (days >= 0) for (const threshold of [days <= 1 ? 1 : days <= 7 ? 7 : 30]) await sendOnce({ eventKey: `video-retention:${userId}:${recoveryUntil.toISOString()}:${threshold}`, kind: 'video-retention', userId, to: user.email, subject: threshold === 30 ? 'Your video links are paused' : 'Download your video originals before the recovery period ends', text: `Your Pro access has ended and client video links are paused. Your originals are kept privately until ${recoveryUntil.toISOString().slice(0, 10)}. Download them from ${process.env.CLIENT_URL}/videos/library or renew Pro before that date to restore hosting. After the recovery period, stored video originals and playback copies are removed.` });
      if (recoveryUntil <= new Date()) await withBillingLock(userId, async () => { const current = await videoContext(userId, { maintenance: true }); if (current.recoveryUntil && current.recoveryUntil <= new Date() && current.entitlements.plan !== 'pro') await purgeUserVideos(userId); });
    }
  }
}
export async function startVideoWorker() {
  // A missing decoder must keep the readiness check red; do not accept large
  // originals into an infrastructure that cannot inspect them.
  await runMediaTool('ffmpeg', ['-version']); await runMediaTool('ffprobe', ['-version']);
  let stopping = false; let maintenanceAt = 0;
  const heartbeat = setInterval(() => { void recordWorkerHeartbeat('video', { status: 'idle', stage: 'video-jobs' }); }, 30_000);
  heartbeat.unref?.(); await recordWorkerHeartbeat('video', { status: 'idle', stage: 'video-jobs' });
  const loop = async () => {
    while (!stopping) {
      try {
        const worked = await runVideoJob();
        if (Date.now() - maintenanceAt > 10 * 60_000) { maintenanceAt = Date.now(); await reconcileVideoLibrary(); }
        if (!worked) await new Promise(resolve => setTimeout(resolve, 2000));
      } catch { await recordWorkerHeartbeat('video', { status: 'error', stage: 'video-jobs' }); await new Promise(resolve => setTimeout(resolve, 5000)); }
    }
  };
  const { workerConcurrency } = (await getRuntimeConfig()).videoDelivery;
  const loops = Array.from({ length: workerConcurrency }, loop);
  return async () => { stopping = true; clearInterval(heartbeat); await Promise.all(loops); };
}
