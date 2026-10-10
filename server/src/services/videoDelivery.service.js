import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import Delivery from '../models/Delivery.js';
import User from '../models/User.js';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';
import Subscription from '../models/Subscription.js';
import { VideoAsset, VideoUsage, VideoPlayback, VideoJob } from '../models/video.models.js';
import { resolveEntitlements, lagosMonthWindow } from './entitlement.service.js';
import { getRuntimeConfig } from './runtimeConfig.service.js';
import { publicVideoSettings } from '../config/videoDelivery.js';
import { getStreamMinutes, signedStreamMedia } from './videoProvider.service.js';
import { acquireVideoLease, releaseVideoLease } from './videoLease.service.js';

export const videoError = (message, status = 400, code = 'VIDEO_REQUEST_FAILED') => Object.assign(new Error(message), { status, code });
export function videoId(value) {
  if (!/^[a-f\d]{24}$/i.test(String(value || ''))) throw videoError('Video not found.', 404);
  return String(value);
}
export async function videoContext(userId, { write = false, playback = false, hosting = false, maintenance = false } = {}) {
  const [user, runtime] = await Promise.all([User.findById(userId), getRuntimeConfig()]);
  if (!user || (!maintenance && user.accountStatus !== 'active')) throw videoError('This photographer account is unavailable.', 410);
  const entitlements = await resolveEntitlements(user, { includeUsage: false });
  const settings = runtime.videoDelivery;
  if ((write || playback || hosting) && entitlements.plan !== 'pro') throw videoError(playback ? 'This video link is temporarily unavailable. Please contact your photographer.' : 'An active Pro plan is required for video delivery.', 403, 'VIDEO_PRO_REQUIRED');
  if ((write || playback || hosting) && (!settings.enabled || !publicVideoSettings(settings).configured)) throw videoError('Video delivery is not available yet.', 503, 'VIDEO_UNAVAILABLE');
  if (write && process.env.VIDEO_DELIVERY_QUALIFIED !== 'true' && !String(process.env.VIDEO_BETA_USER_IDS || '').split(',').map(value => value.trim()).includes(String(userId))) throw videoError('Video delivery is currently open to invited Pro accounts.', 403, 'VIDEO_BETA_ONLY');
  if (write && !await WorkerHeartbeat.exists({ workerName: 'video', heartbeatAt: { $gt: new Date(Date.now() - 120_000) }, status: { $in: ['idle', 'busy'] } })) throw videoError('The video worker is temporarily unavailable. Your saved work is safe.', 503, 'VIDEO_WORKER_UNAVAILABLE');
  if (playback && !settings.playbackEnabled) throw videoError('Video playback is temporarily paused. Please try again later.', 503, 'VIDEO_PLAYBACK_PAUSED');
  let recoveryUntil = null;
  if (entitlements.plan !== 'pro') {
    const subscriptions = await Subscription.find({ userId, $or: [{ paidThrough: { $lte: new Date() } }, { graceEndsAt: { $lte: new Date() } }] }).select('paidThrough graceEndsAt').lean();
    const dates = subscriptions.flatMap(item => [item.paidThrough, item.graceEndsAt]).filter(date => date && new Date(date) <= new Date()).map(date => new Date(date).getTime());
    if (user.planOverride?.expiresAt && user.planOverride.expiresAt <= new Date()) dates.push(user.planOverride.expiresAt.getTime());
    if (user.videoRetentionUntil) dates.push(user.videoRetentionUntil.getTime() - settings.recoveryDays * 86400_000);
    recoveryUntil = dates.length ? new Date(Math.max(...dates) + settings.recoveryDays * 86400_000) : user.proRetentionUntil ? new Date(user.proRetentionUntil.getTime() + (settings.recoveryDays - (Number(runtime.retention?.proRetentionDays) || 30)) * 86400_000) : null;
  }
  return { user, settings, entitlements, recoveryUntil };
}
export async function ownedVideoDelivery(id, userId, { withPin = false } = {}) {
  let query = Delivery.findOne({ _id: videoId(id), userId, kind: 'video' });
  if (withPin) query = query.select('+access.pinDigest');
  const delivery = await query;
  if (!delivery) throw videoError('Video delivery not found.', 404);
  return delivery;
}
export async function ownedVideoAsset(id, userId) {
  const asset = await VideoAsset.findOne({ _id: videoId(id), userId, state: { $nin: ['deleted', 'deleting'] } });
  if (!asset) throw videoError('Video not found.', 404);
  return asset;
}
export function videoAssetDTO(asset, { owner = false, posterUrl } = {}) {
  return { id: String(asset._id), filename: owner ? asset.filename : undefined, bytes: asset.bytes,
    duration: asset.duration || 0, width: asset.width || 0, height: asset.height || 0,
    state: asset.state, posterUrl, ...(owner ? { errorCode: asset.errorCode, errorMessage: asset.errorMessage, analysis: asset.analysis ? { state: asset.analysis.state, includeSpeech: asset.analysis.includeSpeech, suggestions: asset.analysis.suggestions, frames: asset.analysis.frames, errorMessage: asset.analysis.errorMessage } : { state: 'idle' } } : {}) };
}
function safeVideoDetails(value) {
  const video = value?.toObject ? value.toObject() : structuredClone(value);
  for (const presentation of [video?.draft, video?.published]) for (const item of presentation?.items || []) delete item.posterKey;
  return video;
}
export async function ownerVideoDTO(delivery) {
  const ids = [...new Set([...(delivery.video?.draft?.items || []), ...(delivery.video?.published?.items || [])].map(item => String(item.assetId)))];
  const assets = await VideoAsset.find({ _id: { $in: ids }, userId: delivery.userId, state: { $ne: 'deleted' } }).lean();
  return { _id: String(delivery._id), publicId: delivery.publicId, kind: 'video', schemaVersion: 3,
    status: delivery.status, title: delivery.title, clientName: delivery.clientName, brief: delivery.brief,
    video: safeVideoDetails(delivery.video),
    access: { hasPin: Boolean(delivery.access?.pinDigest), expiresAt: delivery.access?.expiresAt || null },
    assets: assets.map(asset => videoAssetDTO(asset, { owner: true, posterUrl: `/api/v1/videos/assets/${asset._id}/poster` })),
    updatedAt: delivery.updatedAt, publishedAt: delivery.publishedAt };
}
const cookieName = delivery => 'veylo_video_' + delivery.publicId;
export function setVideoGrant(res, delivery) {
  if (!process.env.JWT_SECRET) throw videoError('Secure video sharing is unavailable.', 503);
  const token = jwt.sign({ purpose: 'video-access', delivery: String(delivery._id), version: delivery.video.accessVersion }, process.env.JWT_SECRET, { issuer: 'veylo-video', audience: delivery.publicId, expiresIn: '12h' });
  res.cookie(cookieName(delivery), token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/api/v1/videos/public/' + delivery.publicId, maxAge: 12 * 60 * 60_000 });
}
export function hasVideoGrant(req, delivery) {
  if (!delivery.access?.pinDigest) return true;
  try {
    const payload = jwt.verify(req.cookies?.[cookieName(delivery)] || '', process.env.JWT_SECRET, { issuer: 'veylo-video', audience: delivery.publicId });
    return payload.purpose === 'video-access' && payload.delivery === String(delivery._id) && payload.version === delivery.video.accessVersion;
  } catch { return false; }
}
export async function publicVideoDelivery(req, { allowLocked = false, playback = false } = {}) {
  if (!/^[a-z\d_-]{20,64}$/i.test(req.params.publicId || '')) throw videoError('Video delivery not found.', 404);
  const delivery = await Delivery.findOne({ publicId: req.params.publicId, kind: 'video', status: 'published' }).select('+access.pinDigest');
  if (!delivery?.video?.published) throw videoError('This video link is no longer available.', 410, 'VIDEO_LINK_CLOSED');
  if (delivery.access?.revokedAt || (delivery.access?.expiresAt && delivery.access.expiresAt <= new Date())) throw videoError('This video link has expired.', 410, 'VIDEO_LINK_EXPIRED');
  const context = await videoContext(delivery.userId, { hosting: true, playback });
  const locked = !hasVideoGrant(req, delivery);
  if (locked && !allowLocked) throw videoError('Enter the PIN to open this video delivery.', 401, 'VIDEO_PIN_REQUIRED');
  return { ...context, delivery, locked };
}
export function videoBrand(user) {
  return { name: user.studio?.name || user.name || 'Your photographer', logoUrl: user.studio?.logoUrl || user.avatar || '', website: /^https?:\/\//i.test(user.studio?.website || '') ? user.studio.website : '' };
}
export async function videoPresentationDTO(delivery, user, { preview = false } = {}) {
  const presentation = preview ? delivery.video.draft : delivery.video.published;
  const assets = await VideoAsset.find({ userId: user._id, _id: { $in: presentation.items.map(item => item.assetId) }, state: 'ready' }).lean();
  const byId = new Map(assets.map(asset => [String(asset._id), asset]));
  return { publicId: delivery.publicId, kind: 'video', title: presentation.title, introduction: presentation.introduction,
    featuredAssetId: String(presentation.featuredAssetId || presentation.items[0]?.assetId || ''), branding: videoBrand(user),
    items: presentation.items.flatMap(item => {
      const asset = byId.get(String(item.assetId));
      return asset ? [{ ...videoAssetDTO(asset, { posterUrl: preview ? `/api/v1/videos/assets/${asset._id}/poster` : `/api/v1/videos/public/${delivery.publicId}/assets/${asset._id}/poster` }), title: item.title || 'Film', description: item.description || '', allowDownload: item.allowDownload ?? presentation.allowDownloads }] : [];
    }) };
}
export function usageKey(userId, start) { return String(userId) + ':' + start.toISOString(); }
export async function reconcileVideoUsage(userId, { now = new Date(), periodDate = now } = {}) {
  const { start, end } = lagosMonthWindow(periodDate);
  const minutes = await getStreamMinutes(userId, start, now < end ? now : end);
  // Provider totals may lag. Never reduce already observed delivery minutes.
  return VideoUsage.findOneAndUpdate({ _id: usageKey(userId, start) }, { $setOnInsert: { userId, periodStart: start, periodEnd: end }, $max: { deliveredMinutes: minutes }, $set: { reconciledAt: now } }, { new: true, upsert: true });
}
export async function assertVideoPlaybackUsage(userId, settings, now = new Date()) {
  const { start } = lagosMonthWindow(now);
  let usage = await VideoUsage.findById(usageKey(userId, start));
  if (!usage || !usage.reconciledAt || now - usage.reconciledAt > settings.usageMaxLagSeconds * 1000) {
    try { usage = await reconcileVideoUsage(userId, { now }); }
    catch { throw videoError('Video usage could not be checked. Please try again shortly.', 503, 'VIDEO_USAGE_UNAVAILABLE'); }
  }
  if (usage.deliveredMinutes >= settings.monthlyDeliveredMinutes) throw videoError('This account has reached its video playback allowance for this month. Contact your photographer for an original download.', 429, 'VIDEO_PLAYBACK_LIMIT');
  return usage;
}
export async function videoPlayback({ delivery, asset, settings, sessionId, preview = false }) {
  await assertVideoPlaybackUsage(delivery.userId, settings);
  let session = sessionId && /^[a-f\d-]{36}$/i.test(sessionId) ? await VideoPlayback.findOne({ _id: sessionId, deliveryId: delivery._id, assetId: asset._id, accessVersion: delivery.video.accessVersion, expiresAt: { $gt: new Date() } }) : null;
  if (sessionId && !session) throw videoError('Open the video again to continue playback.', 401, 'VIDEO_SESSION_EXPIRED');
  const id = session?._id || crypto.randomUUID();
  const leaseId = await acquireVideoLease('view:' + delivery.userId, settings.accountViewers, { ownerId: delivery.userId, resourceId: id, ttlSeconds: settings.tokenSeconds });
  const media = signedStreamMedia(asset.streamUid, { seconds: settings.tokenSeconds });
  try {
    session = await VideoPlayback.findOneAndUpdate({ _id: id }, { $set: { userId: delivery.userId, deliveryId: delivery._id, assetId: asset._id, accessVersion: delivery.video.accessVersion, leaseId, expiresAt: media.expiresAt } }, { upsert: true, new: true });
  } catch (error) { await releaseVideoLease(leaseId, id); throw error; }
  return { sessionId: session._id, ...media, renewAfterSeconds: Math.floor(settings.tokenSeconds / 2), preview };
}
export async function queueVideoJob(asset, type, options = {}, keySuffix = '') {
  const key = `${type}:${asset._id}:${keySuffix || 'v1'}`;
  return VideoJob.findOneAndUpdate({ key }, { $setOnInsert: { userId: asset.userId, assetId: asset._id, type, options, runAfter: new Date(), state: 'queued' } }, { new: true, upsert: true });
}
