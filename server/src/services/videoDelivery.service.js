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
import { signedHlsMedia, verifyHlsToken, hlsFile, VIDEO_MEDIA_SECONDS } from './videoHls.service.js';
import { acquireVideoLease, releaseVideoLease } from './videoLease.service.js';
import { videoReadinessFilter } from './videoProcessingAuth.js';
import { originalVideoCompatible, originalPlaybackFile, originalVideoRange } from './videoOriginal.service.js';
import { VIDEO_QUALITY_VERSION, AUTOMATIC_QUALITY_MIN_VERSION, encodingVariants, playbackQualities } from './videoQuality.service.js';

export const videoError = (message, status = 400, code = 'VIDEO_REQUEST_FAILED') => Object.assign(new Error(message), { status, code });
export function videoId(value) {
  if (!/^[a-f\d]{24}$/i.test(String(value || ''))) throw videoError('Video not found.', 404);
  return String(value);
}
export async function videoContext(userId, { write = false, playback = false, hosting = false, maintenance = false, worker = false } = {}) {
  const [user, runtime] = await Promise.all([User.findById(userId), getRuntimeConfig()]);
  if (!user || (!maintenance && user.accountStatus !== 'active')) throw videoError('This photographer account is unavailable.', 410);
  const entitlements = await resolveEntitlements(user, { includeUsage: false });
  const settings = runtime.videoDelivery;
  if ((write || playback || hosting) && entitlements.plan !== 'pro') throw videoError(playback ? 'This video link is temporarily unavailable. Please contact your photographer.' : 'An active Pro plan is required for video delivery.', 403, 'VIDEO_PRO_REQUIRED');
  if ((write || playback || hosting) && (!settings.enabled || !publicVideoSettings(settings).configured)) throw videoError('Video delivery is not available yet.', 503, 'VIDEO_UNAVAILABLE');
  if (write && process.env.VIDEO_DELIVERY_QUALIFIED !== 'true' && !String(process.env.VIDEO_BETA_USER_IDS || '').split(',').map(value => value.trim()).includes(String(userId))) throw videoError('Video delivery is currently open to invited Pro accounts.', 403, 'VIDEO_BETA_ONLY');
  if (write && !worker && !await WorkerHeartbeat.exists(videoReadinessFilter())) throw videoError('Video preparation is temporarily unavailable. Your saved work is safe. Please try again shortly.', 503, 'VIDEO_WORKER_UNAVAILABLE');
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
  if (owner && posterUrl && asset.cover?.state === 'ready' && asset.cover.generation) {
    posterUrl += (posterUrl.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(asset.cover.generation);
  }
  return { id: String(asset._id), filename: owner ? asset.filename : undefined, bytes: asset.bytes,
    duration: asset.duration || 0, width: asset.width || 0, height: asset.height || 0,
    state: asset.state, posterUrl, qualities: playbackQualities(asset), autoPlayback: asset.hls?.ladderVersion >= AUTOMATIC_QUALITY_MIN_VERSION,
    ...(owner ? { playbackReady: asset.hls?.ladderVersion === VIDEO_QUALITY_VERSION, previewReady: Boolean(asset.hls?.version || asset.previewHls?.version), expectedQualities: asset.width && asset.height ? encodingVariants(asset).map(row => row.name) : [], originalCompatible: originalVideoCompatible(asset), hasAdaptive: Boolean(asset.hls?.version), adaptive: asset.adaptive, cover: asset.cover, errorCode: asset.errorCode, errorMessage: asset.errorMessage, analysis: asset.analysis ? { state: asset.analysis.state, includeSpeech: asset.analysis.includeSpeech, suggestions: asset.analysis.suggestions, frames: asset.analysis.frames, errorMessage: asset.analysis.errorMessage } : { state: 'idle' } } : {}) };
}
function safeVideoDetails(value) {
  const video = value?.toObject ? value.toObject() : structuredClone(value);
  for (const presentation of [video?.draft, video?.published]) for (const item of presentation?.items || []) delete item.posterKey;
  return video;
}
export function videoDashboardPresentation(delivery) {
  return ['draft', 'review'].includes(delivery.status) ? delivery.video?.draft : delivery.video?.published || delivery.video?.draft;
}
export function videoDashboardCover(delivery, assets) {
  const presentation = videoDashboardPresentation(delivery);
  const items = presentation?.items || [];
  const ordered = [...items.filter(item => String(item.assetId) === String(presentation?.featuredAssetId)), ...items];
  for (const item of ordered) {
    const asset = assets.get(String(item.assetId));
    const posterKey = item.posterKey || asset?.posterKey;
    if (asset && posterKey) return { asset, posterKey };
  }
  return null;
}
export async function videoDashboardSummaries(deliveries, userId) {
  const videos = deliveries.filter(delivery => delivery.kind === 'video');
  const ids = [...new Set(videos.flatMap(delivery => videoDashboardPresentation(delivery)?.items?.map(item => String(item.assetId)) || []))];
  const assets = ids.length ? await VideoAsset.find({ _id: { $in: ids }, userId, state: 'ready' }).select('_id posterKey').lean() : [];
  const byId = new Map(assets.map(asset => [String(asset._id), asset]));
  return new Map(videos.map(delivery => [String(delivery._id), {
    videoCount: videoDashboardPresentation(delivery)?.items?.length || 0,
    thumbnailUrl: videoDashboardCover(delivery, byId) ? `/api/v1/videos/deliveries/${delivery._id}/poster` : null
  }]));
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
  return { name: user.studio?.name || user.name || 'Your photographer', avatarUrl: user.avatar || user.studio?.logoUrl || '', logoUrl: user.studio?.logoUrl || user.avatar || '', website: /^https?:\/\//i.test(user.studio?.website || '') ? user.studio.website : '' };
}
export async function videoPresentationDTO(delivery, user, { preview = false } = {}) {
  const presentation = preview ? delivery.video.draft : delivery.video.published;
  const assets = await VideoAsset.find({ userId: user._id, _id: { $in: presentation.items.map(item => item.assetId) }, state: 'ready' }).lean();
  const byId = new Map(assets.map(asset => [String(asset._id), asset]));
  return { publicId: delivery.publicId, kind: 'video', title: presentation.title, introduction: presentation.introduction, playbackMode: presentation.playbackMode || 'original',
    featuredAssetId: String(presentation.featuredAssetId || presentation.items[0]?.assetId || ''), branding: videoBrand(user),
    items: presentation.items.flatMap(item => {
      const asset = byId.get(String(item.assetId));
      return asset ? [{ ...videoAssetDTO(asset, { posterUrl: preview ? `/api/v1/videos/assets/${asset._id}/poster` : `/api/v1/videos/public/${delivery.publicId}/assets/${asset._id}/poster` }), title: item.title || 'Film', description: item.description || '', allowDownload: item.allowDownload ?? presentation.allowDownloads }] : [];
    }) };
}
export function usageKey(userId, start) { return String(userId) + ':' + start.toISOString(); }
export async function reconcileVideoUsage(userId, { now = new Date(), periodDate = now } = {}) {
  const { start, end } = lagosMonthWindow(periodDate);
  // Usage reserves original byte ranges in proportion to duration, or adaptive
  // segment time. Buffering and repeats count; client watch events are not trusted.
  return VideoUsage.findOneAndUpdate({ _id: usageKey(userId, start) }, { $setOnInsert: { userId, periodStart: start, periodEnd: end }, $set: { reconciledAt: now } }, { new: true, upsert: true });
}
export async function assertVideoPlaybackUsage(userId, settings, now = new Date()) {
  const { start } = lagosMonthWindow(now);
  let usage = await VideoUsage.findById(usageKey(userId, start));
  if (!usage) {
    try { usage = await reconcileVideoUsage(userId, { now }); }
    catch { throw videoError('Video usage could not be checked. Please try again shortly.', 503, 'VIDEO_USAGE_UNAVAILABLE'); }
  }
  if (usage.deliveredMinutes >= settings.monthlyDeliveredMinutes) throw videoError('This account has reached its video playback allowance for this month. Contact your photographer for an original download.', 429, 'VIDEO_PLAYBACK_LIMIT');
  return usage;
}
export async function videoPlayback({ delivery, asset, settings, sessionId, preview = false }) {
  const presentation = preview ? delivery.video.draft : delivery.video.published;
  const availableHls = preview && asset.previewHls?.version ? asset.previewHls : asset.hls;
  let mode = presentation?.playbackMode === 'adaptive' || asset.hls?.ladderVersion >= AUTOMATIC_QUALITY_MIN_VERSION ? 'adaptive' : 'original';
  if (mode === 'adaptive' && !availableHls?.version) throw videoError('This film is preparing its first playback quality. Please try again shortly.', 409, 'VIDEO_NOT_READY');
  await assertVideoPlaybackUsage(delivery.userId, settings);
  let session = sessionId && /^[a-f\d-]{36}$/i.test(sessionId) ? await VideoPlayback.findOne({ _id: sessionId, deliveryId: delivery._id, assetId: asset._id, accessVersion: delivery.video.accessVersion, preview, expiresAt: { $gt: new Date() } }) : null;
  if (sessionId && !session) throw videoError('Open the video again to continue playback.', 401, 'VIDEO_SESSION_EXPIRED');
  if (session) {
    if (presentation?.playbackMode === 'adaptive' && session.playbackMode === 'original') throw videoError('Open the video again to continue playback.', 401, 'VIDEO_SESSION_EXPIRED');
    mode = session.playbackMode;
  }
  if (session?.mediaExpiresAt && session.mediaExpiresAt.getTime() <= Date.now() + 60_000) throw videoError('Open the video again to continue playback.', 401, 'VIDEO_SESSION_EXPIRED');
  const id = session?._id || crypto.randomUUID();
  const leaseId = await acquireVideoLease('view:' + delivery.userId, settings.accountViewers, { ownerId: delivery.userId, resourceId: id, ttlSeconds: settings.tokenSeconds });
  let media;
  try {
    const prepared = asset.originalPlayback?.state === 'ready' ? asset.originalPlayback : null;
    const format = session?.mediaFormat || (mode === 'adaptive' || prepared?.hls?.version ? 'hls' : 'file');
    const version = session?.mediaVersion || (mode === 'adaptive' ? availableHls.version : prepared?.version || 'original');
    const issuedAt = session?.mediaIssuedAt || new Date();
    media = signedHlsMedia({ assetId: asset._id, sessionId: id, version, format, original: mode === 'original', renewable: true, seconds: VIDEO_MEDIA_SECONDS, now: issuedAt.getTime() });
    const expiresAt = new Date(Math.min(Date.now() + settings.tokenSeconds * 1000, media.expiresAt.getTime()));
    session = await VideoPlayback.findOneAndUpdate({ _id: id }, { $set: { userId: delivery.userId, deliveryId: delivery._id, assetId: asset._id, accessVersion: delivery.video.accessVersion, playbackMode: mode, preview, leaseId, expiresAt,
      mediaVersion: version, mediaFormat: format, mediaIssuedAt: issuedAt, mediaExpiresAt: media.expiresAt } }, { upsert: true, new: true });
  } catch (error) { await releaseVideoLease(leaseId, id); throw error; }
  const issuedHls = mode === 'adaptive' && [availableHls, asset.hls, ...(asset.previousHls || [])].find(row => row?.version === session.mediaVersion);
  const qualities = issuedHls ? playbackQualities({ hls: issuedHls, frameRate: asset.frameRate }) : [];
  return { sessionId: session._id, ...media, qualities, expiresAt: session.expiresAt, playbackMode: mode, renewAfterSeconds: Math.floor(settings.tokenSeconds / 2), preview };
}
export async function authorizeHlsRequest({ token, file, method, range }) {
  const claims = verifyHlsToken(token);
  const original = claims.purpose === 'video-original';
  const filePlayback = (claims.format || (original ? 'file' : 'hls')) === 'file';
  if ((file === 'original') !== filePlayback) throw videoError('Playback file not found.', 404);
  const session = await VideoPlayback.findOne({ _id: claims.sessionId, assetId: claims.assetId, expiresAt: { $gt: new Date() } }).lean();
  if (!session) throw videoError('Reopen this film to continue playback.', 401, 'VIDEO_SESSION_EXPIRED');
  if (session.mediaVersion && (session.mediaVersion !== claims.version || session.mediaFormat !== (filePlayback ? 'file' : 'hls'))) throw videoError('Reopen this film to continue playback.', 401, 'VIDEO_SESSION_EXPIRED');
  const { settings } = await videoContext(session.userId, { playback: true });
  const delivery = await Delivery.findOne({ _id: session.deliveryId, userId: session.userId, kind: 'video', 'video.accessVersion': session.accessVersion }).lean();
  if (!delivery || delivery.status === 'archived' || (!session.preview && (delivery.status !== 'published' || delivery.access?.revokedAt || (delivery.access?.expiresAt && delivery.access.expiresAt <= new Date())))) throw videoError('This video link is no longer available.', 410, 'VIDEO_LINK_CLOSED');
  const presentation = session.preview ? delivery.video.draft : delivery.video.published;
  if (session.playbackMode !== (original ? 'original' : 'adaptive') || original && presentation?.playbackMode === 'adaptive') throw videoError('Reopen this film to use its current playback setting.', 401, 'VIDEO_SESSION_EXPIRED');
  if (!presentation?.items.some(item => String(item.assetId) === claims.assetId)) throw videoError('Video not found in this delivery.', 404);
  const asset = await VideoAsset.findOne({ _id: claims.assetId, userId: session.userId, state: 'ready', ...(original && claims.version !== 'original' ? { 'originalPlayback.version': claims.version, 'originalPlayback.state': 'ready' } : {}) }).lean();
  const selectedHls = !original && asset && (asset.hls?.version === claims.version ? asset.hls : session.preview && asset.previewHls?.version === claims.version ? asset.previewHls : asset.previousHls?.find(row => row.version === claims.version));
  const resource = asset && (filePlayback ? originalPlaybackFile(asset, claims.version) : hlsFile(!original ? { ...asset, hls: selectedHls } : asset, file, original));
  if (!resource || !Number.isSafeInteger(resource.bytes) || resource.bytes < 1) throw videoError('Playback file not found.', 404);
  const requestedRange = filePlayback ? originalVideoRange(range, resource.bytes) : null;
  const deliveredBytes = requestedRange?.length || resource.bytes;
  const { start, end } = lagosMonthWindow();
  if (!await VideoUsage.exists({ _id: usageKey(session.userId, start) })) await reconcileVideoUsage(session.userId);
  const minutes = method === 'GET' ? resource.seconds / 60 * (filePlayback ? deliveredBytes / resource.bytes : 1) : 0;
  const nextMinutes = { $round: [{ $add: ['$deliveredMinutes', minutes] }, 8] };
  const usage = await VideoUsage.findOneAndUpdate({ _id: usageKey(session.userId, start), $expr: { $lte: [nextMinutes, settings.monthlyDeliveredMinutes] } }, [{ $set: { deliveredMinutes: nextMinutes, deliveredBytes: { $add: [{ $ifNull: ['$deliveredBytes', 0] }, method === 'GET' ? deliveredBytes : 0] }, reconciledAt: new Date(), periodEnd: end } }], { new: true });
  if (!usage) throw videoError('This account has reached its video playback allowance for this month.', 429, 'VIDEO_PLAYBACK_LIMIT');
  return { ...resource, ...(filePlayback ? { range: requestedRange } : {}), origin: new URL(process.env.CLIENT_URL).origin };
}
export async function queueOriginalPlayback(asset) {
  if (asset.state !== 'ready' || !originalVideoCompatible(asset) || !asset.objectKey.endsWith('.mp4')) return;
  const generation = crypto.randomUUID();
  const queued = await VideoAsset.findOneAndUpdate({ _id: asset._id, userId: asset.userId, state: 'ready', 'originalPlayback.state': { $nin: ['ready', 'queued', 'running', 'failed'] } }, { $set: { originalPlayback: { state: 'queued', generation } } }, { new: true });
  if (queued) await queueVideoJob(queued, 'prepare', { originalPlayback: true, generation }, 'original-playback:' + generation);
}
export async function queueAdaptiveVideo(asset) {
  if (asset.hls?.ladderVersion === VIDEO_QUALITY_VERSION || asset.state !== 'ready') return;
  const generation = crypto.randomUUID();
  const queued = await VideoAsset.findOneAndUpdate({ _id: asset._id, userId: asset.userId, state: 'ready', 'hls.ladderVersion': { $ne: VIDEO_QUALITY_VERSION }, 'adaptive.state': { $nin: ['queued', 'running'] } }, { $set: { adaptive: { state: 'queued', generation, qualityVersion: VIDEO_QUALITY_VERSION, errorMessage: '', completed: [], total: asset.width && asset.height ? encodingVariants(asset).length : 0, updatedAt: new Date() } } }, { new: true });
  if (queued) await queueVideoJob(queued, 'prepare', { adaptive: true, generation }, 'adaptive:' + generation);
}
export async function queueVideoJob(asset, type, options = {}, keySuffix = '') {
  const key = `${type}:${asset._id}:${keySuffix || 'v1'}`;
  return VideoJob.findOneAndUpdate({ key }, { $setOnInsert: { userId: asset.userId, assetId: asset._id, type, options, runAfter: new Date(), state: 'queued' } }, { new: true, upsert: true });
}
