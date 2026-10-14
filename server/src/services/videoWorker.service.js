import crypto from 'node:crypto';
import sharp from 'sharp';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import { VideoAsset, VideoUpload, VideoJob, VideoLease, VideoAnalysisPart, VideoUsage, VideoPlayback, VideoQuota, VideoAIUsage } from '../models/video.models.js';
import { getRuntimeConfig } from './runtimeConfig.service.js';
import { withBillingLock } from './billingLock.service.js';
import { recordWorkerHeartbeat } from './workerHeartbeat.service.js';
import { sendOnce } from './email.service.js';
import { videoContext, queueVideoJob, queueAdaptiveVideo, queueOriginalPlayback, reconcileVideoUsage } from './videoDelivery.service.js';
import { acquireVideoLease, releaseVideoLease } from './videoLease.service.js';
import { reserveVideoDuration, commitVideoDuration, releaseVideoQuota, reconcileVideoQuota, videoTransaction } from './videoQuota.service.js';
import { abortR2Multipart, deleteR2Object, deleteR2Prefix, putR2Object } from './r2.service.js';
import { deleteLegacyStreamVideo } from './videoProvider.service.js';
import { encodeAdaptiveVideo } from './videoEncode.service.js';
import { packageOriginalVideo } from './videoPackage.service.js';
import { VIDEO_QUALITY_VERSION, encodingVariants } from './videoQuality.service.js';
import { VIDEO_MEDIA_SECONDS } from './videoHls.service.js';
import { withLocalVideo, inspectLocalVideo, extractVideoFrame, runMediaTool, cleanupVideoTemps } from './videoMedia.service.js';

export async function prepareVideo(asset, settings, job) {
  if (job.options?.originalPlayback) return prepareOriginalPlayback(asset, settings, job);
  if (job.options?.adaptive) return prepareAdaptiveVideo(asset, settings, job);
  await videoContext(asset.userId, { write: true, worker: true });
  if (asset.state === 'ready') return;
  const version = crypto.randomUUID();
  const prefix = asset.objectKey.replace(/original\.(mp4|mov|webm)$/, '') + 'hls/' + version + '/';
  if (!prefix.endsWith(`/${asset._id}/hls/${version}/`)) throw new Error('Invalid playback directory.');
  const current = await VideoAsset.findOneAndUpdate({ _id: asset._id, state: { $in: ['queued', 'verifying', 'processing'] } }, { $set: { state: 'verifying', encodingId: version } }, { new: true });
  if (!current) return;
  const guard = async () => {
    if (!await VideoJob.exists({ _id: job._id, leaseToken: job.leaseToken, state: 'running', leaseUntil: { $gt: new Date() } }) || !await VideoAsset.exists({ _id: asset._id, encodingId: version, state: { $in: ['verifying', 'processing'] } })) throw Object.assign(new Error('Video preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
  };
  try {
    // Inspection and a poster do not create a replacement video.
    await withLocalVideo(asset, async ({ file, directory, checksum }) => {
      await guard();
      const metadata = await inspectLocalVideo(file, settings.maxDurationSeconds);
      await reserveVideoDuration(asset._id, metadata.duration, settings.storedSeconds);
      const poster = await extractVideoFrame(file, directory, Math.min(metadata.duration * .1, 5));
      const buffer = await sharp(poster).webp({ quality: 84 }).toBuffer();
      const posterKey = asset.posterKey || asset.objectKey.replace(/original\.[^.]+$/, 'poster.webp');
      if (!asset.posterKey) await putR2Object(posterKey, buffer, { contentType: 'image/webp' });
      await VideoAsset.updateOne({ _id: asset._id, encodingId: version, state: 'verifying' }, { $set: { ...metadata, checksum, posterKey, state: 'processing' } });
      await guard(); await videoContext(asset.userId, { write: true, worker: true });
      await videoTransaction(async session => {
        const active = await VideoJob.exists({ _id: job._id, leaseToken: job.leaseToken, state: 'running', leaseUntil: { $gt: new Date() } }).session(session);
        if (!active) throw Object.assign(new Error('Video preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
        const saved = await VideoAsset.updateOne({ _id: asset._id, encodingId: version, state: 'processing' }, { $set: { state: 'ready', errorCode: '', errorMessage: '' } }, { session });
        if (!saved.modifiedCount) throw Object.assign(new Error('Video preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
        await commitVideoDuration(asset._id, session);
      });
    });
    const prepared = await VideoAsset.findById(asset._id);
    await queueAdaptiveVideo(prepared);
  } catch (error) {
    // Only remove this attempt's immutable outputs; another attempt may be live.
    await deleteR2Prefix(prefix).catch(() => {});
    throw error;
  }
}
async function prepareOriginalPlayback(asset, settings, job) {
  await videoContext(asset.userId, { write: true, worker: true });
  const generation = job.options.generation;
  if (asset.state !== 'ready' || asset.originalPlayback?.state === 'ready' || asset.originalPlayback?.generation !== generation) return;
  const version = crypto.randomUUID();
  const prefix = asset.objectKey.replace(/original\.mp4$/, '') + 'original-playback/' + version + '/';
  if (!prefix.endsWith(`/${asset._id}/original-playback/${version}/`)) throw new Error('Invalid original playback directory.');
  const current = await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'originalPlayback.generation': generation }, { $set: { 'originalPlayback.state': 'running' } });
  if (!current.matchedCount) return;
  const guard = async () => {
    if (!await VideoJob.exists({ _id: job._id, leaseToken: job.leaseToken, state: 'running', leaseUntil: { $gt: new Date() } }) || !await VideoAsset.exists({ _id: asset._id, state: 'ready', 'originalPlayback.generation': generation })) throw Object.assign(new Error('Original playback preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
  };
  try {
    await withLocalVideo(asset, async ({ file, directory }) => {
      await guard(); const metadata = await inspectLocalVideo(file, settings.maxDurationSeconds);
      const playback = await packageOriginalVideo({ file, directory, metadata, bytes: asset.bytes, prefix, guard });
      await guard(); await videoContext(asset.userId, { write: true, worker: true });
      await videoTransaction(async session => {
        if (!await VideoJob.exists({ _id: job._id, leaseToken: job.leaseToken, state: 'running', leaseUntil: { $gt: new Date() } }).session(session)) throw Object.assign(new Error('Original playback preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
        const readyAt = new Date();
        if (playback.hls) Object.assign(playback.hls, { version, readyAt });
        const saved = await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'originalPlayback.generation': generation }, { $set: { originalPlayback: { ...playback, version, generation, state: 'ready', readyAt } } }, { session });
        if (!saved.modifiedCount) throw Object.assign(new Error('Original playback preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
      });
    });
  } catch (error) { await deleteR2Prefix(prefix).catch(() => {}); throw error; }
}
async function prepareAdaptiveVideo(asset, settings, job) {
  await videoContext(asset.userId, { write: true, worker: true });
  const generation = job.options.generation;
  if (asset.state !== 'ready' || asset.hls?.ladderVersion === VIDEO_QUALITY_VERSION || asset.adaptive?.generation !== generation) return;
  const version = crypto.randomUUID();
  const prefix = asset.objectKey.replace(/original\.(mp4|mov|webm)$/, '') + 'hls/' + version + '/';
  if (!prefix.endsWith(`/${asset._id}/hls/${version}/`)) throw new Error('Invalid playback directory.');
  await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'adaptive.generation': generation }, { $set: { 'adaptive.state': 'running' } });
  const guard = async () => {
    if (!await VideoJob.exists({ _id: job._id, leaseToken: job.leaseToken, state: 'running', leaseUntil: { $gt: new Date() } }) || !await VideoAsset.exists({ _id: asset._id, state: 'ready', 'adaptive.generation': generation })) throw Object.assign(new Error('Video preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
  };
  let lastReport = 0;
  const onProgress = async progress => {
    if (progress.percent !== 0 && progress.percent !== 100 && Date.now() - lastReport < 1000) return;
    lastReport = Date.now(); await guard();
    await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'adaptive.generation': generation }, { $set: {
      'adaptive.quality': progress.quality, 'adaptive.percent': progress.percent, 'adaptive.completed': progress.completed,
      'adaptive.total': encodingVariants(asset).length, 'adaptive.updatedAt': new Date(),
    } });
  };
  try {
    await withLocalVideo(asset, async ({ file, directory }) => {
      await guard(); const metadata = await inspectLocalVideo(file, settings.maxDurationSeconds);
      const onRendition = async playback => {
        await guard();
        await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'adaptive.generation': generation }, { $set: { previewHls: { ...playback, version, readyAt: new Date() } } });
      };
      const hls = await encodeAdaptiveVideo({ file, directory, metadata, prefix, guard, onProgress, onRendition });
      await guard(); await videoContext(asset.userId, { write: true, worker: true });
      await videoTransaction(async session => {
        if (!await VideoJob.exists({ _id: job._id, leaseToken: job.leaseToken, state: 'running', leaseUntil: { $gt: new Date() } }).session(session)) throw Object.assign(new Error('Video preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
        const saved = await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'adaptive.generation': generation }, { $set: { hls: { ...hls, version, readyAt: new Date() }, 'adaptive.state': 'ready', 'adaptive.percent': 100, 'adaptive.completed': hls.variants.map(row => row.name), 'adaptive.updatedAt': new Date(), 'adaptive.errorMessage': '' },
          $unset: { previewHls: 1 }, ...(asset.hls?.version ? { $push: { previousHls: { ...(asset.hls.toObject ? asset.hls.toObject() : asset.hls), retiredAt: new Date() } } } : {}) }, { session });
        if (!saved.modifiedCount) throw Object.assign(new Error('Video preparation was superseded.'), { code: 'VIDEO_JOB_SUPERSEDED' });
      });
    });
  } catch (error) {
    await VideoAsset.updateOne({ _id: asset._id, 'adaptive.generation': generation, 'previewHls.version': version }, { $unset: { previewHls: 1 } });
    await deleteR2Prefix(prefix).catch(() => {}); throw error;
  }
}
async function preparePoster(asset, job) {
  await videoContext(asset.userId, { write: true, worker: true });
  const generation = job.options?.generation;
  if (asset.state !== 'ready' || asset.cover?.generation !== generation) return;
  await VideoAsset.updateOne({ _id: asset._id, 'cover.generation': generation }, { $set: { 'cover.state': 'running' } });
  await withLocalVideo(asset, async ({ file, directory }) => {
    const image = await extractVideoFrame(file, directory, Math.min(asset.duration - .05, job.options.seconds));
    const buffer = await sharp(image).webp({ quality: 84 }).toBuffer();
    const key = asset.objectKey.replace(/original\.[^.]+$/, `cover-${generation}.webp`);
    await putR2Object(key, buffer, { contentType: 'image/webp' });
    const saved = await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'cover.generation': generation }, { $set: { posterKey: key, 'cover.state': 'ready', 'cover.errorMessage': '' }, $addToSet: { posterKeys: key } });
    if (!saved.modifiedCount) await deleteR2Object(key);
  });
}
export async function deleteVideoOriginal(asset, { force = false } = {}) {
  if (asset.state === 'deleted') return;
  if (!force && await Delivery.exists({ userId: asset.userId, kind: 'video', status: 'published', 'video.published.items.assetId': asset._id })) throw Object.assign(new Error('This video is still in a published delivery.'), { code: 'VIDEO_IN_USE' });
  await VideoAsset.updateOne({ _id: asset._id }, { $set: { state: 'deleting' } });
  // Wait for running encoding/analysis to finish. Its final state update is
  // conditional, so it cannot resurrect the asset after deletion is requested.
  if (await VideoJob.exists({ assetId: asset._id, type: { $ne: 'delete' }, state: 'running', leaseUntil: { $gt: new Date() } })) throw Object.assign(new Error('Video cleanup is waiting for current work.'), { code: 'VIDEO_WORK_PENDING' });
  const uploads = await VideoUpload.find({ assetId: asset._id });
  for (const upload of uploads) {
    if (upload.uploadId && upload.state !== 'completed') await abortR2Multipart(asset.objectKey, upload.uploadId);
    await Promise.all([releaseVideoLease(upload.leaseId, String(upload._id)), releaseVideoLease(upload.accountLeaseId, String(upload._id))]);
    await VideoUpload.updateOne({ _id: upload._id }, { $set: { state: 'aborted' } });
  }
  if (asset.streamUid) await deleteLegacyStreamVideo(asset.streamUid);
  await deleteR2Object(asset.objectKey);
  for (const key of new Set([asset.objectKey.replace(/original\.[^.]+$/, 'poster.webp'), asset.posterKey, ...(asset.posterKeys || [])].filter(Boolean))) await deleteR2Object(key);
  // Also clear a cover uploaded just before a database write/process failed.
  // The prefix must belong to this one server-created asset directory.
  const prefix = asset.objectKey.replace(/original\.(mp4|mov|webm)$/, '');
  if (!prefix.endsWith(`/${asset._id}/`)) throw new Error('Video cleanup could not verify its storage directory.');
  await deleteR2Prefix(prefix);
  await releaseVideoQuota(asset._id);
  await VideoAnalysisPart.deleteMany({ assetId: asset._id });
  await VideoAsset.updateOne({ _id: asset._id, state: 'deleting' }, { $set: { state: 'deleted', deletedAt: new Date() }, $unset: { analysis: 1, posterKey: 1, streamUid: 1, hls: 1, previewHls: 1, previousHls: 1, originalPlayback: 1, encodingId: 1, cover: 1 } });
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
  const runnable = { runAfter: { $lte: new Date() }, $or: [{ state: 'queued' }, { state: 'running', leaseUntil: { $lte: new Date() } }] };
  if (!settings.enabled) runnable.type = 'delete';
  const job = await VideoJob.findOneAndUpdate(runnable, { $set: { state: 'running', leaseToken: token, leaseUntil: new Date(Date.now() + 120_000) }, $inc: { attempts: 1 } }, { new: true, sort: { type: -1, runAfter: 1 } });
  if (!job) return false;
  let globalLease; let accountLease; let encodingLease;
  const renew = setInterval(() => { void Promise.all([VideoJob.updateOne({ _id: job._id, leaseToken: token }, { $set: { leaseUntil: new Date(Date.now() + 120_000) } }), VideoLease.updateMany({ _id: { $in: [globalLease, accountLease, encodingLease].filter(Boolean) }, resourceId: String(job._id) }, { $set: { expiresAt: new Date(Date.now() + 120_000) } })]).catch(() => {}); }, 30_000); renew.unref?.();
  try {
    if (['analyze', 'present'].includes(job.type)) throw Object.assign(new Error('Video writing suggestions have been removed.'), { code: 'VIDEO_AI_UNAVAILABLE' });
    if (job.type !== 'delete' && job.attempts > 6) throw Object.assign(new Error('Video preparation reached its retry limit.'), { code: 'VIDEO_RETRY_LIMIT' });
    globalLease = await acquireVideoLease('media:platform', settings.workerConcurrency, { ownerId: job.userId, resourceId: job._id, ttlSeconds: 120 });
    accountLease = await acquireVideoLease('media:' + job.userId, 1, { ownerId: job.userId, resourceId: job._id, ttlSeconds: 120 });
    if (job.type === 'prepare') encodingLease = await acquireVideoLease('encode:platform', settings.platformEncodes, { ownerId: job.userId, resourceId: job._id, ttlSeconds: 120 });
    const asset = await VideoAsset.findById(job.assetId);
    if (asset && asset.state !== 'deleted') {
      if (job.type === 'delete') await deleteVideoOriginal(asset);
      else if (!['deleting', 'deleted'].includes(asset.state)) {
        if (job.type === 'prepare') await prepareVideo(asset, settings, job);
        else if (job.type === 'poster') await preparePoster(asset, job);
      }
    }
    await VideoJob.updateOne({ _id: job._id, leaseToken: token }, { $set: { state: 'done', leaseUntil: new Date(0) } });
  } catch (error) {
    const retryable = ['VIDEO_JOB_SUPERSEDED', 'VIDEO_CAPACITY_BUSY', 'VIDEO_DISK_BUSY', 'VIDEO_WORK_PENDING', 'VIDEO_PROVIDER_NETWORK', 'VIDEO_PROVIDER_FAILED', 'R2_NETWORK_ERROR', 'R2_REQUEST_FAILED', 'VIDEO_PRO_REQUIRED', 'VIDEO_UNAVAILABLE', 'VIDEO_WORKER_UNAVAILABLE'].includes(error.code);
    // Cleanup keeps retrying until providers confirm deletion. Failed assets
    // stay charged and downloadable; their bytes are never silently released.
    const admission = ['VIDEO_CAPACITY_BUSY', 'VIDEO_PRO_REQUIRED', 'VIDEO_UNAVAILABLE', 'VIDEO_WORKER_UNAVAILABLE', 'VIDEO_WORK_PENDING'].includes(error.code);
    const retry = job.type === 'delete' || (retryable && (admission || job.attempts < 6));
    const retryDelay = ['VIDEO_PRO_REQUIRED', 'VIDEO_UNAVAILABLE', 'VIDEO_WORKER_UNAVAILABLE'].includes(error.code) ? 3600_000 : Math.min(3600_000, 15_000 * Math.max(1, job.attempts));
    await VideoJob.updateOne({ _id: job._id, leaseToken: token }, { $set: { state: retry ? 'queued' : 'failed', errorCode: error.code || 'VIDEO_JOB_FAILED', leaseUntil: new Date(0), runAfter: new Date(Date.now() + retryDelay) }, ...(admission ? { $inc: { attempts: -1 } } : {}) });
    if (!retry && job.options?.originalPlayback) await VideoAsset.updateOne({ _id: job.assetId, state: 'ready', 'originalPlayback.generation': job.options.generation }, { $set: { 'originalPlayback.state': 'failed' } });
    else if (!retry && job.options?.adaptive) await VideoAsset.updateOne({ _id: job.assetId, 'adaptive.generation': job.options.generation }, { $set: { 'adaptive.state': 'failed', 'adaptive.errorMessage': error.code === 'VIDEO_RESOLUTION_TOO_SMALL' ? 'Upload a video at 720p or higher for automatic playback.' : 'Playback qualities could not finish preparing. Your original is safe. Retry preparation.' } });
    else if (!retry && job.type === 'poster') await VideoAsset.updateOne({ _id: job.assetId, 'cover.generation': job.options?.generation }, { $set: { 'cover.state': 'failed', 'cover.errorMessage': 'This cover could not be prepared. Try again or upload a cover image.' } });
    else if (!retry && job.type !== 'present') await VideoAsset.updateOne({ _id: job.assetId, state: { $nin: ['deleting', 'deleted'] } }, { $set: job.type === 'analyze' ? { 'analysis.state': 'failed', 'analysis.errorMessage': error.code === 'VIDEO_AI_BUDGET' ? error.message : 'Suggestions could not be completed. Your own titles and descriptions are unchanged.' } : { state: 'failed', errorCode: error.code || 'VIDEO_PREPARATION_FAILED', errorMessage: 'This video could not be prepared. You can retry or download the original.' } });
  } finally { clearInterval(renew); await Promise.all([releaseVideoLease(globalLease, String(job._id)), releaseVideoLease(accountLease, String(job._id)), releaseVideoLease(encodingLease, String(job._id))]); }
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
  for (const asset of await VideoAsset.find({ state: 'queued' }).limit(100)) {
    if (!await VideoJob.exists({ assetId: asset._id, type: 'prepare', state: { $in: ['running', 'queued'] } })) await queueVideoJob(asset, 'prepare', {}, crypto.randomUUID());
  }
  for (const asset of await VideoAsset.find({ state: 'deleting' }).limit(100)) await queueVideoJob(asset, 'delete');
  for (const upload of await VideoUpload.find({ state: 'aborting' }).limit(100)) await queueVideoJob({ _id: upload.assetId, userId: upload.userId }, 'delete');
  // Old grants have an absolute six-hour lifetime. Keep their files through that
  // lifetime plus a renewal grace, then remove only this asset's retired version.
  const retiredBefore = new Date(Date.now() - (VIDEO_MEDIA_SECONDS + 900) * 1000);
  for (const asset of await VideoAsset.find({ state: 'ready', 'previousHls.retiredAt': { $lt: retiredBefore } }).limit(100)) {
    for (const previous of asset.previousHls || []) {
      if (!previous.retiredAt || previous.retiredAt >= retiredBefore || previous.version === asset.hls?.version || previous.version === asset.previewHls?.version) continue;
      if (await VideoPlayback.exists({ assetId: asset._id, mediaVersion: previous.version, expiresAt: { $gt: new Date() } })) continue;
      const prefix = asset.objectKey.replace(/original\.(mp4|mov|webm)$/, '') + `hls/${previous.version}/`;
      if (previous.prefix !== prefix || !prefix.endsWith(`/${asset._id}/hls/${previous.version}/`)) continue;
      await deleteR2Prefix(prefix);
      await VideoAsset.updateOne({ _id: asset._id, 'hls.version': { $ne: previous.version }, 'previewHls.version': { $ne: previous.version } }, { $pull: { previousHls: { version: previous.version } } });
    }
  }
  // Original-only assets are ready without HLS. Recover interrupted inspection.
  for (const asset of await VideoAsset.find({ state: { $in: ['processing', 'verifying'] } }).limit(100)) {
    if (!await VideoJob.exists({ assetId: asset._id, type: 'prepare', state: { $in: ['running', 'queued'] } })) {
      await VideoAsset.updateOne({ _id: asset._id, state: asset.state }, { $set: { state: 'queued' } });
      await queueVideoJob(asset, 'prepare', {}, crypto.randomUUID());
    }
  }
  // Backfill without taking a published original offline or changing its bytes.
  const legacyOriginals = await Delivery.distinct('video.published.items.assetId', { kind: 'video', status: 'published', 'video.published.playbackMode': 'original' });
  for (const asset of await VideoAsset.find({ _id: { $in: legacyOriginals }, state: 'ready', 'hls.ladderVersion': { $ne: VIDEO_QUALITY_VERSION }, videoCodec: 'h264', objectKey: /\.mp4$/, pixelFormat: { $in: [null, '', 'yuv420p', 'yuvj420p'] }, audioCodec: { $in: [null, '', 'aac', 'mp3'] }, $or: [{ 'originalPlayback.state': { $exists: false } }, { 'originalPlayback.state': { $in: ['queued', 'running'] } }] }).limit(100)) {
    if (['queued', 'running'].includes(asset.originalPlayback?.state)) {
      if (!await VideoJob.exists({ assetId: asset._id, 'options.originalPlayback': true, 'options.generation': asset.originalPlayback.generation, state: { $in: ['running', 'queued'] } })) await queueVideoJob(asset, 'prepare', { originalPlayback: true, generation: asset.originalPlayback.generation }, 'original-playback:' + asset.originalPlayback.generation + ':recover:' + crypto.randomUUID());
    } else await queueOriginalPlayback(asset);
  }
  for (const asset of await VideoAsset.find({ state: 'ready', 'hls.ladderVersion': { $ne: VIDEO_QUALITY_VERSION }, 'adaptive.state': { $ne: 'failed' } }).limit(100)) {
    if (['queued', 'running'].includes(asset.adaptive?.state)) {
      if (!await VideoJob.exists({ assetId: asset._id, 'options.adaptive': true, 'options.generation': asset.adaptive.generation, state: { $in: ['running', 'queued'] } })) await queueVideoJob(asset, 'prepare', { adaptive: true, generation: asset.adaptive.generation }, 'adaptive:' + asset.adaptive.generation);
    } else if (asset.adaptive?.state !== 'failed') await queueAdaptiveVideo(asset);
  }
  for (const asset of await VideoAsset.find({ state: 'ready', 'cover.state': { $in: ['queued', 'running'] } }).limit(100)) {
    const job = await VideoJob.findOne({ assetId: asset._id, type: 'poster', 'options.generation': asset.cover.generation });
    if (!job && Number.isFinite(asset.cover.seconds)) await queueVideoJob(asset, 'poster', { seconds: asset.cover.seconds, generation: asset.cover.generation }, asset.cover.generation);
    if (job?.state === 'done' || job?.state === 'failed') await VideoAsset.updateOne({ _id: asset._id, 'cover.generation': asset.cover.generation }, { $set: { 'cover.state': 'failed', 'cover.errorMessage': 'This cover could not be prepared. Try again or upload a cover image.' } });
  }
  for (const asset of await VideoAsset.find({ state: 'failed', 'hls.version': { $exists: false } }).limit(100)) {
    if (!await VideoJob.exists({ assetId: asset._id, state: { $in: ['running', 'queued'] } })) {
      const prefix = asset.objectKey.replace(/original\.(mp4|mov|webm)$/, '');
      if (prefix.endsWith(`/${asset._id}/`)) await deleteR2Prefix(prefix + 'hls/').catch(() => {});
    }
  }
  for (const asset of await VideoAsset.find({ state: 'ready', 'hls.version': { $exists: true }, streamUid: { $exists: true, $ne: '' } }).limit(100)) {
    try { await deleteLegacyStreamVideo(asset.streamUid); await VideoAsset.updateOne({ _id: asset._id, streamUid: asset.streamUid }, { $unset: { streamUid: 1, streamImportedAt: 1, streamReadyAt: 1 } }); } catch { /* Keep the legacy reference until provider cleanup succeeds. */ }
  }
  const owners = await VideoAsset.distinct('userId', { state: { $nin: ['deleted', 'reserved', 'uploading'] } });
  for (const userId of owners) {
    const user = await User.findById(userId); if (!user) continue;
    await reconcileVideoQuota(userId);
    const { entitlements, recoveryUntil } = await videoContext(userId, { maintenance: true });
    if (entitlements.plan === 'pro') {
      try {
        const usage = await reconcileVideoUsage(userId);
        for (const percent of [80, 95]) {
          if (usage.deliveredMinutes < settings.monthlyDeliveredMinutes * percent / 100) continue;
          await sendOnce({ eventKey: `video-usage:${userId}:${usage.periodStart.toISOString()}:${percent}`, kind: 'video-usage', userId, to: user.email, subject: `You have used ${percent}% of your monthly video playback allowance`, text: `Your films have delivered ${Math.ceil(usage.deliveredMinutes)} of ${settings.monthlyDeliveredMinutes} playback minutes this month. This includes requested segments, buffering, repeat requests and your previews. New playback is paused when the requested playback allowance is reached; original downloads remain available where you enabled them. Check your video library: ${process.env.CLIENT_URL}/videos/library` });
        }
      } catch { /* Usage warnings retry during the next maintenance pass. */ }
    } else if (recoveryUntil) {
      const days = Math.ceil((recoveryUntil - Date.now()) / 86400_000);
      if (days >= 0) for (const threshold of [days <= 1 ? 1 : days <= 7 ? 7 : 30]) await sendOnce({ eventKey: `video-retention:${userId}:${recoveryUntil.toISOString()}:${threshold}`, kind: 'video-retention', userId, to: user.email, subject: threshold === 30 ? 'Your video links are paused' : 'Download your video originals before the recovery period ends', text: `Your Pro access has ended and client video links are paused. Your originals are kept privately until ${recoveryUntil.toISOString().slice(0, 10)}. Download them from ${process.env.CLIENT_URL}/videos/library or renew Pro before that date to restore hosting. After the recovery period, stored video originals and playback copies are removed.` });
      if (recoveryUntil <= new Date()) await withBillingLock(userId, async () => { const current = await videoContext(userId, { maintenance: true }); if (current.recoveryUntil && current.recoveryUntil <= new Date() && current.entitlements.plan !== 'pro') await purgeUserVideos(userId); });
    }
  }
}
export async function verifyVideoMediaTools() {
  // A missing decoder must keep the readiness check red; do not accept large
  // originals into an infrastructure that cannot inspect them.
  await runMediaTool('ffmpeg', ['-version']); await runMediaTool('ffprobe', ['-version']);
  const muxers = await runMediaTool('ffmpeg', ['-hide_banner', '-muxers']);
  const encoders = await runMediaTool('ffmpeg', ['-hide_banner', '-encoders']);
  const filters = await runMediaTool('ffmpeg', ['-hide_banner', '-filters']);
  if (!/\bE\s+hls\s/.test(muxers) || !/\blibx264\b/.test(encoders) || !/\baac\b/.test(encoders) || !/\bsetsar\b/.test(filters)) throw new Error('Video preparation requires full FFmpeg with HLS, libx264, AAC and setsar support.');
}
export async function startVideoWorker() {
  await verifyVideoMediaTools();
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
