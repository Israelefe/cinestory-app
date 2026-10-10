import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import Delivery from '../models/Delivery.js';
import { VideoAsset, VideoUpload, VideoUsage, VideoPlayback, VideoJob } from '../models/video.models.js';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';
import { publicVideoSettings } from '../config/videoDelivery.js';
import { videoTransaction, reserveVideoBytes, commitVideoBytes } from '../services/videoQuota.service.js';
import { acquireVideoLease, releaseVideoLease } from '../services/videoLease.service.js';
import { presignR2Object, createR2Multipart, listR2Parts, completeR2Multipart, headR2Object, getR2ObjectStream, getR2ObjectBuffer, putR2Object } from '../services/r2.service.js';
import { signedStreamMedia } from '../services/videoProvider.service.js';
import { lagosMonthWindow } from '../services/entitlement.service.js';
import { recordPaidUsage } from '../services/paidUsage.service.js';
import { videoEvent, recordVideoVisit } from '../services/videoEvents.service.js';
import { videoContext, videoId, videoError, ownedVideoDelivery, ownedVideoAsset, ownerVideoDTO, videoAssetDTO, publicVideoDelivery, setVideoGrant, videoBrand, videoPresentationDTO, videoPlayback, usageKey, queueVideoJob } from '../services/videoDelivery.service.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const itemSchema = z.object({ assetId: id, title: z.string().trim().max(100).default(''), description: z.string().trim().max(2000).default(''), posterSeconds: z.number().finite().min(0).max(10800).default(0), allowDownload: z.boolean().nullable().default(null) }).strict();
const presentationSchema = z.object({ title: z.string().trim().max(120), introduction: z.string().trim().max(1500).default(''), items: z.array(itemSchema).max(10), featuredAssetId: id.nullable().optional(), allowDownloads: z.boolean().default(false) }).strict();
const draftSchema = z.object({ revision: z.number().int().nonnegative(), clientName: z.string().trim().max(100), brief: z.string().trim().max(3000), presentation: presentationSchema }).strict();
const initSchema = z.object({ filename: z.string().trim().min(5).max(180).refine(value => !/[\\/\x00-\x1f]/.test(value) && /\.(mp4|mov|webm)$/i.test(value), 'Choose an MP4, MOV or WebM video.'), bytes: z.number().int().positive().max(5_000_000_000), fingerprint: z.string().regex(/^[a-f\d]{64}$/i), requestKey: z.string().uuid() }).strict();
const parse = (schema, value) => { const result = schema.safeParse(value); if (!result.success) throw videoError(result.error.issues[0]?.message || 'Check the video details.'); return result.data; };
export const videoAction = handler => async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  try { await handler(req, res); }
  catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    const status = error.status || (error.name === 'ValidationError' ? 400 : 500);
    res.status(status).json({ success: false, code: error.code && typeof error.code === 'string' ? error.code : 'VIDEO_REQUEST_FAILED', message: status < 500 ? error.message : (status === 503 ? error.message : 'We could not complete this video request. Please try again.') });
  }
};
const ok = (res, data) => res.json({ success: true, data });
const writable = req => videoContext(req.user.id, { write: true });
function editable(delivery) { if (delivery.status === 'archived') throw videoError('Restore this delivery before making changes.', 409); }

export const getVideoConfig = videoAction(async (req, res) => ok(res, publicVideoSettings((await getRuntimeConfig()).videoDelivery)));
export const createVideoDelivery = videoAction(async (req, res) => {
  const { settings } = await writable(req);
  if (!settings.uploadsEnabled) throw videoError('New video uploads are temporarily paused.', 503);
  parse(z.object({}).strict(), req.body);
  const delivery = await Delivery.create({ userId: req.user.id, kind: 'video', schemaVersion: 3, video: { draft: { title: '', items: [], allowDownloads: false } } });
  res.status(201); ok(res, await ownerVideoDTO(delivery));
});
export const getVideoDelivery = videoAction(async (req, res) => {
  await videoContext(req.user.id);
  ok(res, await ownerVideoDTO(await ownedVideoDelivery(req.params.id, req.user.id, { withPin: true })));
});
export const saveVideoDraft = videoAction(async (req, res) => {
  const { settings } = await writable(req);
  const input = parse(draftSchema, req.body);
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id); editable(delivery);
  const ids = input.presentation.items.map(item => item.assetId);
  if (new Set(ids).size !== ids.length || ids.length > settings.maxVideos) throw videoError('Choose each video once, up to ' + settings.maxVideos + ' videos.');
  const assets = await VideoAsset.find({ _id: { $in: ids }, userId: req.user.id, state: { $nin: ['deleted', 'deleting'] } }).select('_id duration');
  if (assets.length !== ids.length) throw videoError('Choose videos from your own library.');
  if (input.presentation.featuredAssetId && !ids.includes(input.presentation.featuredAssetId)) throw videoError('Choose a featured video from this delivery.');
  for (const item of input.presentation.items) { const asset = assets.find(row => String(row._id) === item.assetId); if (asset.duration && item.posterSeconds > asset.duration) throw videoError('Choose a cover frame within the video.'); }
  const updated = await Delivery.findOneAndUpdate({ _id: delivery._id, userId: req.user.id, kind: 'video', 'video.revision': input.revision }, { $set: { clientName: input.clientName, brief: input.brief, title: input.presentation.title, 'video.draft': { ...input.presentation, featuredAssetId: input.presentation.featuredAssetId || ids[0] || undefined } }, $inc: { 'video.revision': 1 } }, { new: true, runValidators: true }).select('+access.pinDigest');
  if (!updated) throw videoError('This draft changed in another tab. Reload it before saving.', 409, 'VIDEO_DRAFT_CONFLICT');
  ok(res, await ownerVideoDTO(updated));
});
export const saveVideoAccess = videoAction(async (req, res) => {
  await writable(req);
  const input = parse(z.object({ pin: z.string().regex(/^\d{6}$/).or(z.literal('')).optional(), expiresAt: z.string().datetime().nullable() }).strict(), req.body);
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id); editable(delivery);
  if (input.expiresAt && new Date(input.expiresAt) <= new Date()) throw videoError('Choose an expiry date in the future.');
  const fields = { 'access.expiresAt': input.expiresAt ? new Date(input.expiresAt) : null };
  if (input.pin !== undefined) fields['access.pinDigest'] = input.pin ? await bcrypt.hash(input.pin, 12) : null;
  const updated = await Delivery.findOneAndUpdate({ _id: delivery._id }, { $set: fields, $inc: { 'video.accessVersion': 1 } }, { new: true }).select('+access.pinDigest');
  ok(res, await ownerVideoDTO(updated));
});
export const publishVideoDelivery = videoAction(async (req, res) => {
  const { settings } = await writable(req);
  if (!settings.publishingEnabled) throw videoError('Video publishing is temporarily paused.', 503);
  const { revision } = parse(z.object({ revision: z.number().int().nonnegative() }).strict(), req.body);
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id, { withPin: true }); editable(delivery);
  const draft = delivery.video.draft;
  if (!draft?.title?.trim() || draft.items.length < 1 || draft.items.length > settings.maxVideos || draft.items.some(item => !item.title?.trim())) throw videoError('Add a delivery title and a title for every video before publishing.');
  if (delivery.access?.expiresAt && delivery.access.expiresAt <= new Date()) throw videoError('Update the expired access date before publishing.');
  // The snapshot and asset states are read and committed in one transaction.
  await videoTransaction(async session => {
    const readyAssets = await VideoAsset.find({ _id: { $in: draft.items.map(item => item.assetId) }, userId: req.user.id, state: 'ready', duration: { $lte: settings.maxDurationSeconds }, bytes: { $lte: settings.maxFileBytes } }).select('_id posterKey').session(session).lean();
    const snapshot = draft.toObject();
    snapshot.items = snapshot.items.map(item => ({ ...item, posterKey: readyAssets.find(asset => String(asset._id) === String(item.assetId))?.posterKey }));
    if (readyAssets.length !== draft.items.length) throw videoError('Wait for every video to finish preparing before publishing.', 409);
    const updated = await Delivery.updateOne({ _id: delivery._id, userId: req.user.id, 'video.revision': revision }, { $set: { 'video.published': snapshot, status: 'published', publishedAt: delivery.publishedAt || new Date(), 'access.revokedAt': null }, $inc: { 'video.accessVersion': 1, 'video.revision': 1 } }, { session });
    if (!updated.modifiedCount) throw videoError('The draft changed. Save your latest changes and publish again.', 409, 'VIDEO_DRAFT_CONFLICT');
    // Updating assets participates in the deletion/reuse race without changing them visually.
    await VideoAsset.updateMany({ _id: { $in: draft.items.map(item => item.assetId) }, userId: req.user.id, state: 'ready' }, { $set: { updatedAt: new Date() } }, { session });
  });
  await recordPaidUsage(req.user.id, 'delivery', delivery._id);
  videoEvent('delivery.publish.succeeded', { userId: req.user.id, deliveryId: delivery._id });
  ok(res, await ownerVideoDTO(await ownedVideoDelivery(delivery._id, req.user.id, { withPin: true })));
});
export const closeVideoDelivery = videoAction(async (req, res) => {
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id);
  await Delivery.updateOne({ _id: delivery._id }, { $set: { status: 'draft', 'access.revokedAt': new Date() }, $inc: { 'video.accessVersion': 1 } });
  ok(res, { closed: true });
});

async function transferLeases(upload, settings) {
  const resourceId = String(upload._id);
  const accountLeaseId = await acquireVideoLease('transfer:' + upload.userId, settings.accountTransfers, { ownerId: upload.userId, resourceId, ttlSeconds: 900 });
  let leaseId;
  try { leaseId = await acquireVideoLease('transfer:platform', settings.platformTransfers, { ownerId: upload.userId, resourceId, ttlSeconds: 900 }); }
  catch (error) { await releaseVideoLease(accountLeaseId, resourceId); throw error; }
  await VideoUpload.updateOne({ _id: upload._id, state: { $in: ['initializing', 'uploading', 'paused'] } }, { $set: { leaseId, accountLeaseId, expiresAt: new Date(Date.now() + settings.reservationHours * 3600_000) } });
  return { leaseId, accountLeaseId };
}
export async function releaseVideoTransfer(upload) {
  await Promise.all([releaseVideoLease(upload.leaseId, String(upload._id)), releaseVideoLease(upload.accountLeaseId, String(upload._id))].filter(Boolean));
}
const uploadDTO = (upload, parts = []) => ({ id: String(upload._id), assetId: String(upload.assetId), partBytes: upload.partBytes, partCount: upload.partCount, fingerprint: upload.fingerprint, state: upload.state, expiresAt: upload.expiresAt, parts });
async function ownerUpload(req) {
  const upload = await VideoUpload.findOne({ _id: videoId(req.params.uploadId), userId: req.user.id });
  if (!upload) throw videoError('Upload not found.', 404);
  const asset = await VideoAsset.findOne({ _id: upload.assetId, userId: req.user.id });
  if (!asset || ['deleted', 'deleting'].includes(asset.state) || ['aborting', 'aborted'].includes(upload.state)) throw videoError('This upload was closed. Start a new upload.', 410);
  return { upload, asset };
}
export const initializeVideoUpload = videoAction(async (req, res) => {
  const { settings, entitlements } = await writable(req);
  if (!settings.uploadsEnabled) throw videoError('New video uploads are temporarily paused.', 503);
  const input = parse(initSchema, req.body);
  if (input.bytes > settings.maxFileBytes) throw videoError('Each video must be 5 GB or smaller.', 413);
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id); editable(delivery);
  let upload = await VideoUpload.findOne({ userId: req.user.id, requestKey: input.requestKey });
  if (upload) {
    const asset = await VideoAsset.findById(upload.assetId);
    if (String(upload.deliveryId) !== String(delivery._id) || upload.fingerprint !== input.fingerprint || asset?.bytes !== input.bytes || asset.filename !== input.filename) throw videoError('This upload request belongs to a different file.', 409);
    if (upload.state === 'initializing') throw videoError('This upload is being opened. Try again shortly.', 409, 'VIDEO_UPLOAD_INITIALIZING');
    return ok(res, uploadDTO(upload));
  }
  const assetId = new mongoose.Types.ObjectId();
  const extension = input.filename.split('.').pop().toLowerCase();
  const contentType = ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' })[extension];
  const objectKey = `veylo/video/${req.user.id}/${assetId}/original.${extension}`;
  try {
    await videoTransaction(async session => {
      await reserveVideoBytes({ assetId, userId: req.user.id, bytes: input.bytes, limit: entitlements.limits.personalStorageBytes }, session);
      await VideoAsset.create([{ _id: assetId, userId: req.user.id, filename: input.filename, bytes: input.bytes, contentType, objectKey }], { session });
      upload = (await VideoUpload.create([{ userId: req.user.id, assetId, deliveryId: delivery._id, requestKey: input.requestKey, fingerprint: input.fingerprint, partBytes: settings.partBytes, partCount: Math.ceil(input.bytes / settings.partBytes), expiresAt: new Date(Date.now() + settings.reservationHours * 3600_000) }], { session }))[0];
      const added = await Delivery.updateOne({ _id: delivery._id, userId: req.user.id, status: { $ne: 'archived' }, $expr: { $lt: [{ $size: { $ifNull: ['$video.draft.items', []] } }, settings.maxVideos] } }, { $push: { 'video.draft.items': { assetId, title: input.filename.replace(/\.[^.]+$/, '').slice(0, 100) } }, $inc: { 'video.revision': 1 } }, { session });
      if (!added.modifiedCount) throw videoError('This delivery already has ' + settings.maxVideos + ' videos.');
    });
  } catch (error) {
    if (error.code === 11000) throw videoError('This upload is already being opened. Retry with the same request.', 409, 'VIDEO_UPLOAD_INITIALIZING');
    throw error;
  }
  try {
    const uploadId = await createR2Multipart(objectKey, contentType);
    upload.uploadId = uploadId; upload.state = 'paused'; await upload.save();
    await VideoAsset.updateOne({ _id: assetId, state: 'reserved' }, { $set: { state: 'uploading' } });
  } catch (error) { await queueVideoJob({ _id: assetId, userId: req.user.id }, 'delete'); throw error; }
  ok(res, uploadDTO(upload));
});
export const getVideoUpload = videoAction(async (req, res) => {
  const { upload, asset } = await ownerUpload(req);
  const parts = ['uploading', 'paused', 'completing'].includes(upload.state) && upload.uploadId ? await listR2Parts(asset.objectKey, upload.uploadId).catch(error => { if (error.status === 404 && upload.state === 'completing') return []; throw error; }) : [];
  ok(res, uploadDTO(upload, parts));
});
export const signVideoPart = videoAction(async (req, res) => {
  const { settings } = await writable(req);
  if (!settings.uploadsEnabled) throw videoError('Video uploads are temporarily paused.', 503);
  const { partNumber } = parse(z.object({ partNumber: z.number().int().positive().max(1000) }).strict(), req.body);
  const { upload, asset } = await ownerUpload(req);
  if (!['paused', 'uploading'].includes(upload.state) || !upload.uploadId) throw videoError('This upload is no longer accepting parts.', 409);
  if (upload.expiresAt <= new Date()) throw videoError('This upload reservation expired. Start the upload again.', 410);
  if (partNumber > upload.partCount) throw videoError('Invalid upload part.');
  await transferLeases(upload, settings);
  const active = await VideoUpload.updateOne({ _id: upload._id, state: { $in: ['paused', 'uploading'] } }, { $set: { state: 'uploading' } });
  if (!active.matchedCount) throw videoError('This upload was closed.', 409);
  const bytes = partNumber === upload.partCount ? asset.bytes - (partNumber - 1) * upload.partBytes : upload.partBytes;
  const signed = presignR2Object(asset.objectKey, { method: 'PUT', expiresIn: 600, query: { uploadId: upload.uploadId, partNumber }, signedHeaders: { 'content-length': bytes } });
  // Browsers set Content-Length from the Blob. It must not be set manually.
  ok(res, { url: signed.url, expiresAt: signed.expiresAt, bytes });
});
export const pauseVideoUpload = videoAction(async (req, res) => {
  const { upload } = await ownerUpload(req);
  await VideoUpload.updateOne({ _id: upload._id, state: 'uploading' }, { $set: { state: 'paused' } });
  await releaseVideoTransfer(upload); ok(res, { paused: true });
});
export const completeVideoUpload = videoAction(async (req, res) => {
  const { settings } = await writable(req);
  const { upload, asset } = await ownerUpload(req);
  if (upload.state === 'completed') return ok(res, { asset: videoAssetDTO(asset, { owner: true }) });
  if (!['uploading', 'paused', 'completing'].includes(upload.state)) throw videoError('This upload is not ready to finish.', 409);
  await VideoUpload.updateOne({ _id: upload._id, state: { $in: ['uploading', 'paused'] } }, { $set: { state: 'completing' } });
  let head;
  try { head = await headR2Object(asset.objectKey); } catch (error) { if (error.status !== 404) throw error; }
  if (!head) {
    const parts = (await listR2Parts(asset.objectKey, upload.uploadId)).sort((a, b) => a.partNumber - b.partNumber);
    if (parts.length !== upload.partCount || parts.some((part, index) => part.partNumber !== index + 1 || part.bytes !== Math.min(upload.partBytes, asset.bytes - index * upload.partBytes))) {
      await VideoUpload.updateOne({ _id: upload._id, state: 'completing' }, { $set: { state: 'paused' } });
      throw videoError('Some video parts are missing. Resume the upload to finish it.', 409);
    }
    await completeR2Multipart(asset.objectKey, upload.uploadId, parts);
    head = await headR2Object(asset.objectKey);
  }
  if (head.bytes !== asset.bytes || head.bytes > settings.maxFileBytes) { await queueVideoJob(asset, 'delete'); throw videoError('The uploaded size did not match the reserved file.', 413); }
  await videoTransaction(async session => {
    const current = await VideoUpload.findOne({ _id: upload._id, state: 'completing' }).session(session);
    if (!current) return;
    await commitVideoBytes(asset._id, session);
    await VideoAsset.updateOne({ _id: asset._id, state: 'uploading' }, { $set: { state: 'queued' } }, { session });
    await VideoUpload.updateOne({ _id: upload._id }, { $set: { state: 'completed' } }, { session });
  });
  await releaseVideoTransfer(upload);
  await queueVideoJob(asset, 'prepare');
  await recordPaidUsage(req.user.id, 'storage', asset._id);
  videoEvent('upload.completed', { userId: req.user.id, deliveryId: upload.deliveryId, assetId: asset._id, bytes: asset.bytes });
  ok(res, { asset: videoAssetDTO(await VideoAsset.findById(asset._id), { owner: true }) });
});
export const abortVideoUpload = videoAction(async (req, res) => {
  const { upload, asset } = await ownerUpload(req);
  if (upload.state === 'completed') throw videoError('Remove this video from your library instead.', 409);
  await VideoUpload.updateOne({ _id: upload._id }, { $set: { state: 'aborting' } });
  await releaseVideoTransfer(upload); await queueVideoJob(asset, 'delete'); ok(res, { removing: true });
});
export const listVideoAssets = videoAction(async (req, res) => {
  const { user, settings, entitlements, recoveryUntil } = await videoContext(req.user.id);
  const { start, end } = lagosMonthWindow();
  const cursor = req.query.cursor ? videoId(req.query.cursor) : null;
  const [assets, usage] = await Promise.all([VideoAsset.find({ userId: user._id, state: { $ne: 'deleted' }, ...(cursor ? { _id: { $lt: cursor } } : {}) }).sort({ _id: -1 }).limit(61).lean(), VideoUsage.findById(usageKey(user._id, start)).lean()]);
  const page = assets.slice(0, 60);
  ok(res, { assets: page.map(asset => videoAssetDTO(asset, { owner: true, posterUrl: `/api/v1/videos/assets/${asset._id}/poster` })), nextCursor: assets.length > 60 ? String(page.at(-1)._id) : null, storage: { usedBytes: user.storageUsedBytes || 0, reservedBytes: user.storageReservedBytes || 0, videoBytes: user.videoUsedBytes || 0, limitBytes: entitlements.limits.personalStorageBytes }, videoUsage: { storedSeconds: user.videoStoredSeconds || 0, reservedSeconds: user.videoReservedSeconds || 0, limitSeconds: settings.storedSeconds, deliveredMinutes: usage?.deliveredMinutes || 0, limitMinutes: settings.monthlyDeliveredMinutes, reconciledAt: usage?.reconciledAt || null, periodStart: start, periodEnd: end }, recoveryUntil, readOnly: entitlements.plan !== 'pro', canCreate: entitlements.plan === 'pro' && publicVideoSettings(settings).writeAvailable });
});
export const deleteVideoAsset = videoAction(async (req, res) => {
  const asset = await ownedVideoAsset(req.params.assetId, req.user.id);
  await videoTransaction(async session => {
    const references = await Delivery.countDocuments({ userId: req.user.id, kind: 'video', $or: [{ 'video.draft.items.assetId': asset._id }, { 'video.published.items.assetId': asset._id }] }).session(session);
    if (references) throw videoError('Remove this video from its deliveries, including saved published versions, before deleting the original.', 409, 'VIDEO_IN_USE');
    await VideoAsset.updateOne({ _id: asset._id, userId: req.user.id }, { $set: { state: 'deleting' } }, { session });
  });
  await queueVideoJob(asset, 'delete'); ok(res, { removing: true });
});
export const retryVideoAsset = videoAction(async (req, res) => {
  await writable(req);
  const asset = await ownedVideoAsset(req.params.assetId, req.user.id);
  if (asset.state !== 'failed') throw videoError('Only a failed video can be retried.', 409);
  asset.state = 'queued'; asset.errorCode = undefined; asset.errorMessage = undefined; await asset.save();
  await queueVideoJob(asset, 'prepare', {}, crypto.randomUUID()); ok(res, { queued: true });
});
export const requestVideoAnalysis = videoAction(async (req, res) => {
  const { settings } = await writable(req);
  if (!settings.aiEnabled || !publicVideoSettings(settings).aiAvailable) throw videoError('Video suggestions are unavailable. You can still write your own titles and descriptions.', 503, 'VIDEO_AI_UNAVAILABLE');
  const { includeSpeech, regenerate } = parse(z.object({ includeSpeech: z.boolean().default(false), regenerate: z.boolean().default(false) }).strict(), req.body);
  const asset = await ownedVideoAsset(req.params.assetId, req.user.id);
  if (asset.state !== 'ready') throw videoError('Wait for this video to finish preparing.', 409);
  if (['queued', 'running'].includes(asset.analysis?.state)) return ok(res, { queued: true });
  if (asset.analysis?.state === 'ready' && asset.analysis.includeSpeech === includeSpeech && !regenerate) return ok(res, { cached: true, suggestions: asset.analysis.suggestions });
  const generation = crypto.randomUUID();
  const queued = await VideoAsset.updateOne({ _id: asset._id, state: 'ready', 'analysis.state': { $nin: ['queued', 'running'] } }, { $set: { 'analysis.state': 'queued', 'analysis.includeSpeech': includeSpeech, 'analysis.generation': generation, 'analysis.errorMessage': '' } });
  if (queued.modifiedCount) await queueVideoJob(asset, 'analyze', { includeSpeech, generation }, generation);
  ok(res, { queued: true });
});
export const getVideoPreview = videoAction(async (req, res) => {
  const { user } = await writable(req);
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id);
  videoEvent('delivery.preview.opened', { userId: req.user.id, deliveryId: delivery._id, status: 'opened' });
  ok(res, await videoPresentationDTO(delivery, user, { preview: true }));
});
export const requestVideoPresentation = videoAction(async (req, res) => {
  const { settings } = await writable(req);
  if (!settings.aiEnabled || !publicVideoSettings(settings).aiAvailable) throw videoError('Video suggestions are unavailable.', 503);
  const { useNotes } = parse(z.object({ useNotes: z.boolean().default(false) }).strict(), req.body);
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id);
  const ids = delivery.video.draft.items.map(item => item.assetId);
  if (!ids.length || await VideoAsset.countDocuments({ _id: { $in: ids }, userId: req.user.id, state: 'ready', 'analysis.state': 'ready' }) !== ids.length) throw videoError('Request footage suggestions for every film before suggesting the full presentation.', 409);
  const asset = await ownedVideoAsset(ids[0], req.user.id);
  const analyzed = await VideoAsset.find({ _id: { $in: ids }, userId: req.user.id }).select('analysis.inputHash').lean();
  const evidenceVersion = crypto.createHash('sha256').update(analyzed.map(row => row.analysis?.inputHash || '').sort().join(':')).digest('hex').slice(0, 20);
  const job = await queueVideoJob(asset, 'present', { deliveryId: String(delivery._id), revision: delivery.video.revision, useNotes }, `${delivery._id}:${delivery.video.revision}:${useNotes}:${evidenceVersion}`);
  ok(res, { jobId: String(job._id) });
});
export const getVideoPresentationJob = videoAction(async (req, res) => {
  const job = await VideoJob.findOne({ _id: videoId(req.params.jobId), userId: req.user.id, type: 'present' }).lean();
  if (!job) throw videoError('Suggestions not found.', 404);
  ok(res, { state: job.state, result: job.result, errorCode: job.errorCode });
});
export const getPublicVideo = videoAction(async (req, res) => {
  const { delivery, user, locked } = await publicVideoDelivery(req, { allowLocked: true });
  if (!locked) await recordVideoVisit(req, res, delivery, user);
  ok(res, locked ? { requiresPin: true, branding: videoBrand(user) } : await videoPresentationDTO(delivery, user));
});
export const unlockPublicVideo = videoAction(async (req, res) => {
  const { pin } = parse(z.object({ pin: z.string().regex(/^\d{6}$/) }).strict(), req.body);
  const { delivery, user } = await publicVideoDelivery(req, { allowLocked: true });
  if (delivery.access?.pinDigest && !await bcrypt.compare(pin, delivery.access.pinDigest)) throw videoError('That PIN is not correct. Please try again.', 401, 'VIDEO_PIN_INCORRECT');
  setVideoGrant(res, delivery); await recordVideoVisit(req, res, delivery, user); ok(res, await videoPresentationDTO(delivery, user));
});
async function selectedVideo(req, preview = false, playback = true) {
  const context = preview ? { ...(await videoContext(req.user.id, { playback: true })), delivery: await ownedVideoDelivery(req.params.id, req.user.id) } : await publicVideoDelivery(req, { playback });
  const presentation = preview ? context.delivery.video.draft : context.delivery.video.published;
  const item = presentation.items.find(row => String(row.assetId) === videoId(req.params.assetId));
  if (!item) throw videoError('Video not found in this delivery.', 404);
  const asset = await VideoAsset.findOne({ _id: item.assetId, userId: context.user._id, state: 'ready' });
  if (!asset) throw videoError('This video is not ready to play.', 409);
  return { ...context, asset, item, presentation };
}
export const startPublicVideo = videoAction(async (req, res) => {
  const context = await selectedVideo(req);
  const { sessionId } = parse(z.object({ sessionId: z.string().uuid().optional() }).strict(), req.body);
  const playback = await videoPlayback({ ...context, sessionId });
  if (!sessionId) videoEvent('client.experience.started', { deliveryId: context.delivery._id, assetId: context.asset._id, status: 'started' });
  ok(res, playback);
});
export const startPreviewVideo = videoAction(async (req, res) => {
  const context = await selectedVideo(req, true);
  const { sessionId } = parse(z.object({ sessionId: z.string().uuid().optional() }).strict(), req.body);
  ok(res, await videoPlayback({ ...context, sessionId, preview: true }));
});
export const endVideoPlayback = videoAction(async (req, res) => {
  const { delivery } = await publicVideoDelivery(req);
  const { sessionId } = parse(z.object({ sessionId: z.string().uuid() }).strict(), req.body);
  const session = await VideoPlayback.findOneAndDelete({ _id: sessionId, deliveryId: delivery._id });
  if (session) await releaseVideoLease(session.leaseId, session._id);
  ok(res, { closed: true });
});
export const endPreviewPlayback = videoAction(async (req, res) => {
  const delivery = await ownedVideoDelivery(req.params.id, req.user.id);
  const { sessionId } = parse(z.object({ sessionId: z.string().uuid() }).strict(), req.body);
  const session = await VideoPlayback.findOneAndDelete({ _id: sessionId, deliveryId: delivery._id, userId: req.user.id });
  if (session) await releaseVideoLease(session.leaseId, session._id);
  ok(res, { closed: true });
});
export function validatedVideoRange(value, bytes) {
  if (!value) return '';
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw videoError('Invalid download range.', 416);
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes - Number(match[2]));
  const end = match[1] ? (match[2] ? Number(match[2]) : bytes - 1) : bytes - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= bytes || end < start || (!match[1] && Number(match[2]) < 1)) throw videoError('Download range is outside this video.', 416);
  return `bytes=${start}-${Math.min(end, bytes - 1)}`;
}
async function originalResponse(req, res, asset) {
  let range;
  try { range = validatedVideoRange(req.get('range'), asset.bytes); }
  catch (error) { if (error.status === 416) res.set('Content-Range', `bytes */${asset.bytes}`); throw error; }
  const edgeKey = process.env.VEYLO_EDGE_KEY;
  const suppliedKey = req.get('x-veylo-edge-key') || '';
  if (edgeKey && req.get('x-veylo-video-download-proxy') === '1' && Buffer.byteLength(edgeKey) === Buffer.byteLength(suppliedKey) && crypto.timingSafeEqual(Buffer.from(edgeKey), Buffer.from(suppliedKey))) {
    const method = req.get('x-veylo-video-download-method') === 'HEAD' ? 'HEAD' : 'GET';
    const signed = presignR2Object(asset.objectKey, { method, expiresIn: 6 * 3600, ...(range ? { signedHeaders: { range } } : {}) });
    return ok(res, { url: signed.url, range, method, bytes: asset.bytes, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename.replace(/[\r\n]/g, '_'))}` });
  }
  const original = await getR2ObjectStream(asset.objectKey, { range, method: req.method, timeoutMs: 6 * 3600_000 });
  res.status(original.status).set({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(original.bytes), 'Accept-Ranges': 'bytes', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename.replace(/[\r\n]/g, '_'))}` });
  if (original.contentRange) res.set('Content-Range', original.contentRange);
  if (req.method === 'HEAD') return res.end();
  await pipeline(Readable.fromWeb(original.body), res);
}
export const downloadPublicVideo = videoAction(async (req, res) => {
  // Original downloads still work when the observed playback allowance is full.
  const { delivery, asset, item, presentation } = await selectedVideo(req, false, false);
  if (!(item.allowDownload ?? presentation.allowDownloads)) throw videoError('Original downloads are turned off for this video.', 403, 'VIDEO_DOWNLOAD_DISABLED');
  if (req.method === 'GET' && req.get('x-veylo-video-download-method') !== 'HEAD' && (!req.get('range') || /^bytes=0-/.test(req.get('range')))) {
    await Delivery.updateOne({ _id: delivery._id }, { $inc: { downloadsCount: 1 } });
    videoEvent('client.video.download.started', { deliveryId: delivery._id, assetId: asset._id, bytes: asset.bytes, status: 'started' });
  }
  await originalResponse(req, res, asset);
});
export const downloadOwnerVideo = videoAction(async (req, res) => {
  const { entitlements, recoveryUntil } = await videoContext(req.user.id);
  if (entitlements.plan !== 'pro' && (!recoveryUntil || recoveryUntil <= new Date())) throw videoError('The recovery period for these originals has ended.', 410);
  const asset = await ownedVideoAsset(req.params.assetId, req.user.id);
  if (!['ready', 'failed', 'queued', 'processing'].includes(asset.state)) throw videoError('Finish this upload before downloading the original.', 409);
  await originalResponse(req, res, asset);
});
async function posterResponse(res, asset, posterKey = asset.posterKey) {
  if (!posterKey) return res.status(404).end();
  const { buffer } = await getR2ObjectBuffer(posterKey, { maxBytes: 2_000_000 });
  res.type('image/webp').send(buffer);
}
export const getOwnerVideoPoster = videoAction(async (req, res) => {
  const asset = await ownedVideoAsset(req.params.assetId, req.user.id);
  await posterResponse(res, asset);
});
export const getPublicVideoPoster = videoAction(async (req, res) => { const { asset, item } = await selectedVideo(req, false, false); await posterResponse(res, asset, item.posterKey || asset.posterKey); });
export const setVideoPoster = videoAction(async (req, res) => {
  await writable(req);
  const asset = await ownedVideoAsset(req.params.assetId, req.user.id);
  if (asset.state !== 'ready') throw videoError('Wait for this video to finish preparing.', 409);
  let source = req.file?.buffer;
  if (!source) {
    const { seconds } = parse(z.object({ seconds: z.number().finite().min(0).max(asset.duration) }).strict(), req.body);
    const { posterUrl } = signedStreamMedia(asset.streamUid, { seconds: 300, posterSeconds: seconds });
    const response = await fetch(posterUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || Number(response.headers.get('content-length')) > 10_000_000) throw videoError('This cover frame could not be loaded.', 502);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 10_000_000) throw videoError('Cover image is too large.', 413); chunks.push(Buffer.from(chunk)); }
    source = Buffer.concat(chunks);
  }
  const image = sharp(source, { limitInputPixels: 40_000_000, failOn: 'error' });
  const metadata = await image.metadata().catch(() => { throw videoError('Choose a JPEG, PNG or WebP cover.'); });
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw videoError('Choose a still JPEG, PNG or WebP cover.');
  const buffer = await image.rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  const key = asset.objectKey.replace(/original\.[^.]+$/, `cover-${crypto.randomUUID()}.webp`);
  await putR2Object(key, buffer, { contentType: 'image/webp' });
  await VideoAsset.updateOne({ _id: asset._id, state: 'ready' }, { $set: { posterKey: key }, $addToSet: { posterKeys: key } });
  ok(res, { posterUrl: `/api/v1/videos/assets/${asset._id}/poster?v=${Date.now()}` });
});
