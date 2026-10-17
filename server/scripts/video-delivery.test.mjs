import { VIDEO_QUALITY_VERSION } from '../src/services/videoQuality.service.js';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import Delivery from '../src/models/Delivery.js';
import WorkerHeartbeat from '../src/models/WorkerHeartbeat.js';
import { VideoAsset, VideoQuota, VideoUsage, VideoPlayback, VideoJob, ensureVideoIndexes } from '../src/models/video.models.js';
import { videoTransaction, reserveVideoBytes, commitVideoBytes, reserveVideoDuration, commitVideoDuration, releaseVideoQuota, storageCapacityFilter, reconcileVideoQuota } from '../src/services/videoQuota.service.js';
import { acquireVideoLease, releaseVideoLease } from '../src/services/videoLease.service.js';
import { normalizeVideoSettings, publicVideoSettings } from '../src/config/videoDelivery.js';
import { updateRuntimeConfig } from '../src/services/runtimeConfig.service.js';
import { videoContext, ownedVideoAsset, publicVideoDelivery, ownerVideoDTO, videoPresentationDTO, hasVideoGrant, setVideoGrant, videoPlayback, queueAdaptiveVideo, queueOriginalPlayback, usageKey } from '../src/services/videoDelivery.service.js';
import { createVideoDelivery, publishVideoDelivery, saveVideoDraft, saveVideoAccess, validatedVideoRange, deleteVideoAsset, downloadOwnerVideo, initializeVideoUpload, completeVideoUpload, getVideoDownloadSettings, updateVideoDownloadSettings, getVideoDeliveryPoster, downloadPublicVideo, requestVideoAnalysis, requestVideoPresentation } from '../src/controllers/video.controller.js';
import { videoDashboardSummaries, videoDashboardCover } from '../src/services/videoDelivery.service.js';
import { signedHlsMedia, verifyHlsToken, hlsFile } from '../src/services/videoHls.service.js';
import { authorizeHlsRequest } from '../src/services/videoDelivery.service.js';
import { handleVideoHls, verifyVideoToken } from '../../cloudflare/delivery-images/video-hls.js';
import { frameTimestamps, runMediaTool } from '../src/services/videoMedia.service.js';
import { originalVideoRange, ORIGINAL_RANGE_BYTES } from '../src/services/videoOriginal.service.js';
import { lagosMonthWindow } from '../src/services/entitlement.service.js';
import { chargeVideoAIBudget } from '../src/services/videoAnalysis.service.js';
import { deleteVideoOriginal, prepareVideo, runVideoJob, reconcileVideoLibrary } from '../src/services/videoWorker.service.js';
import { requireVideoProcessing, videoProcessingStatus } from '../src/controllers/videoProcessing.controller.js';
import { getVideoProcessingCapacity } from '../src/services/videoProcessingCapacity.service.js';
import { handleVideoDownload } from '../../client/worker/videoDownload.js';
import { VideoUpload } from '../src/models/video.models.js';

let database, owner, outsider;
const settings = normalizeVideoSettings({ enabled: true });
const playbackSecret = crypto.randomBytes(32).toString('hex');
const previousEnv = { ...process.env };
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'video-tests-only-not-a-production-secret', R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test', CLIENT_URL: 'https://veylo.example', VIDEO_PLAYBACK_WORKER_URL: 'https://media.veylo.example', VIDEO_PLAYBACK_SECRET: playbackSecret, VIDEO_MEDIA_WORKER_ENABLED: 'true' });
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ storageEngine: 'wiredTiger' }] });
  await mongoose.connect(database.getUri());
  await Promise.all([User.init(), Delivery.init(), ensureVideoIndexes()]);
  owner = await User.create({ name: 'Test photographer', email: 'video-owner@example.test', accountStatus: 'active', planOverride: { plan: 'pro' }, studio: { name: 'Test studio' } });
  process.env.VIDEO_BETA_USER_IDS = String(owner._id);
  outsider = await User.create({ name: 'Other photographer', email: 'video-other@example.test', accountStatus: 'active' });
  await updateRuntimeConfig({ videoDelivery: settings });
  await WorkerHeartbeat.create({ workerName: 'video', instance: 'video-test-worker', heartbeatAt: new Date(), status: 'idle' });
});
after(async () => { await mongoose.disconnect(); await database?.stop(); for (const name of Object.keys(process.env)) if (!(name in previousEnv)) delete process.env[name]; Object.assign(process.env, previousEnv); });
function response() { return { statusCode: 200, set() { return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } }; }
const request = (id, body = {}) => ({ user: { id: String(owner._id) }, params: { id: String(id) }, body });
async function asset() {
  const id = new mongoose.Types.ObjectId(); const version = crypto.randomUUID();
  return VideoAsset.create({ _id: id, userId: owner._id, objectKey: `veylo/video/${owner._id}/${id}/original.mp4`, filename: 'finished-film.mp4', videoCodec: 'h264', audioCodec: 'aac', bytes: 100, duration: 60, width: 1920, height: 1080, state: 'ready', posterKey: `veylo/video/${owner._id}/${id}/poster.webp`,
    hls: { version, prefix: `veylo/video/${owner._id}/${id}/hls/${version}/`, bytes: 1234, masterBytes: 100, variants: [{ name: 'q360', width: 640, height: 360, bandwidth: 1000000, playlistBytes: 100, segments: Array.from({ length: 10 }, () => ({ bytes: 20, seconds: 6 })) }] } });
}
async function automaticAsset() { const film = await asset(); film.hls.ladderVersion = VIDEO_QUALITY_VERSION; await film.save(); return film; }
async function delivery(film) { return Delivery.create({ userId: owner._id, kind: 'video', video: { draft: { title: 'Wedding films', items: [{ assetId: film._id, title: 'The ceremony', description: 'The complete ceremony.', allowDownload: null }], featuredAssetId: film._id, allowDownloads: false } } }); }

test('limits stay within the approved upload ceiling and availability fails closed', () => {
  assert.throws(() => normalizeVideoSettings({ maxFileBytes: 5_000_000_001 }));
  assert.throws(() => normalizeVideoSettings({ maxVideos: 11 }));
  assert.equal(settings.workerConcurrency, 100);
  assert.equal(settings.platformEncodes, 100);
  assert.equal(settings.accountTransfers, 10);
  assert.equal(settings.platformTransfers, 1000);
  assert.throws(() => normalizeVideoSettings({ workerConcurrency: 101 }));
  assert.throws(() => normalizeVideoSettings({ platformEncodes: 101 }));
  assert.throws(() => normalizeVideoSettings({ accountTransfers: 11 }));
  assert.throws(() => normalizeVideoSettings({ platformTransfers: 1001 }));
  assert.equal(publicVideoSettings({ ...settings, publicAvailable: true }).available, false);
  assert.equal(publicVideoSettings(settings).aiAvailable, false);
  assert.equal(publicVideoSettings(settings).maxFileBytes, 5_000_000_000);
});

test('removed video AI rejects requests and retires queued jobs without calling a provider', async () => {
  const film = await asset(); const project = await delivery(film);
  assert.equal(publicVideoSettings({ ...settings, aiEnabled: true }).aiAvailable, false);
  const analysis = response();
  await requestVideoAnalysis({ ...request(project._id), params: { assetId: String(film._id) } }, analysis);
  assert.equal(analysis.statusCode, 410, JSON.stringify(analysis.body));
  const writing = response(); await requestVideoPresentation(request(project._id), writing);
  assert.equal(writing.statusCode, 410, JSON.stringify(writing.body));
  assert.equal(await VideoJob.countDocuments({ assetId: film._id }), 0);
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No provider should be called'); };
  try {
    for (const type of ['analyze', 'present']) {
      const job = await VideoJob.create({ userId: owner._id, assetId: film._id, type, key: `removed-${type}`, state: 'queued', runAfter: new Date(0) });
      assert.equal(await runVideoJob(), true);
      const result = await VideoJob.findById(job._id);
      assert.equal(result.state, 'failed'); assert.equal(result.errorCode, 'VIDEO_AI_UNAVAILABLE');
    }
    assert.equal(calls, 0);
    assert.equal((await VideoAsset.findById(film._id)).state, 'ready');
  } finally { globalThis.fetch = originalFetch; }
});
test('concurrent reservations share one atomic storage ceiling with image uploads', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => videoTransaction(session => reserveVideoBytes({ assetId: new mongoose.Types.ObjectId(), userId: owner._id, bytes: 200, limit: 500 }, session))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal((await User.findById(owner._id)).storageReservedBytes, 400);
  const image = await User.updateOne({ _id: owner._id, ...storageCapacityFilter(101, 500) }, { $inc: { storageUsedBytes: 101 } });
  assert.equal(image.modifiedCount, 0);
  for (const quota of await VideoQuota.find({ userId: owner._id })) await releaseVideoQuota(quota.assetId);
});
test('byte and duration commits and duplicate cleanup charge exactly once', async () => {
  const id = new mongoose.Types.ObjectId();
  await videoTransaction(session => reserveVideoBytes({ assetId: id, userId: owner._id, bytes: 300, limit: 1000 }, session));
  await Promise.all([videoTransaction(session => commitVideoBytes(id, session)), videoTransaction(session => commitVideoBytes(id, session))]);
  await Promise.all([reserveVideoDuration(id, 60.2, 100), reserveVideoDuration(id, 60.2, 100)]);
  await Promise.all([commitVideoDuration(id), commitVideoDuration(id)]);
  const charged = await User.findById(owner._id);
  assert.equal(charged.storageUsedBytes, 300); assert.equal(charged.storageReservedBytes, 0); assert.equal(charged.videoStoredSeconds, 61); assert.equal(charged.videoReservedSeconds, 0);
  await Promise.all([releaseVideoQuota(id), releaseVideoQuota(id)]);
  const cleaned = await User.findById(owner._id);
  assert.equal(cleaned.storageUsedBytes, 0); assert.equal(cleaned.videoUsedBytes, 0); assert.equal(cleaned.videoStoredSeconds, 0);
});
test('fixed capacity leases reject overflow and can be released only by their resource', async () => {
  const attempts = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => acquireVideoLease('test-transfer', 2, { ownerId: owner._id, resourceId: String(index) })));
  const accepted = attempts.map((value, index) => ({ ...value, index })).filter(value => value.status === 'fulfilled');
  assert.equal(accepted.length, 2);
  await releaseVideoLease(accepted[0].value, 'wrong-resource');
  await assert.rejects(acquireVideoLease('test-transfer', 2, { ownerId: owner._id, resourceId: 'new' }), { code: 'VIDEO_CAPACITY_BUSY' });
  await releaseVideoLease(accepted[0].value, String(accepted[0].index));
  assert.ok(await acquireVideoLease('test-transfer', 2, { ownerId: owner._id, resourceId: 'new' }));
});
test('100 photographers can reserve separate processing slots without exceeding the platform cap', async () => {
  const scope = '100-encoders:' + crypto.randomUUID();
  const owners = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId());
  const results = await Promise.allSettled(owners.map((id, index) => acquireVideoLease(scope, settings.workerConcurrency, { ownerId: id, resourceId: String(index), ttlSeconds: 120 })));
  const accepted = results.flatMap((row, index) => row.status === 'fulfilled' ? [{ lease: row.value, resource: String(index) }] : []);
  assert.equal(accepted.length, 100);
  assert.equal(new Set(accepted.map(row => row.lease)).size, 100);
  const rejected = results.filter(row => row.status === 'rejected');
  assert.equal(rejected.length, 1); assert.equal(rejected[0].reason.code, 'VIDEO_CAPACITY_BUSY');
  await Promise.all(accepted.map(row => releaseVideoLease(row.lease, row.resource)));
});

test('ownership and active entitlement checks reject another owner and Free accounts', async () => {
  const film = await asset();
  await assert.rejects(ownedVideoAsset(film._id, outsider._id), { status: 404 });
  await assert.rejects(videoContext(outsider._id, { write: true }), { code: 'VIDEO_PRO_REQUIRED' });
  assert.equal((await videoContext(owner._id, { write: true })).entitlements.plan, 'pro');
});

test('new video deliveries enable downloads while omitted settings preserve an existing opt-out', async () => {
  const created = response();
  await createVideoDelivery({ user: { id: String(owner._id) }, body: {} }, created);
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.video.draft.allowDownloads, true);
  assert.equal(created.body.data.video.draft.playbackMode, 'adaptive');
  const film = await asset(); const project = await delivery(film);
  assert.equal(project.video.draft.allowDownloads, false);
  const presentation = project.video.draft.toObject(); delete presentation.allowDownloads;
  presentation.items = presentation.items.map(item => ({ assetId: String(item.assetId), title: item.title, description: item.description }));
  presentation.featuredAssetId = String(film._id);
  const saved = response();
  await saveVideoDraft(request(project._id, { revision: 0, clientName: '', brief: '', presentation }), saved);
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data.video.draft.allowDownloads, false);
});
test('private original playback supports seeking, counts requested bytes and rejects cross-mode or revoked grants', async t => {
  const film = await asset(); await VideoAsset.updateOne({ _id: film._id }, { $unset: { hls: 1 } });
  const project = await delivery(film); project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const { start } = lagosMonthWindow(); await VideoUsage.updateOne({ _id: usageKey(owner._id, start) }, { $set: { deliveredMinutes: 0, deliveredBytes: 0 } }, { upsert: true });
  const media = await videoPlayback({ delivery: project, asset: await VideoAsset.findById(film._id), settings });
  assert.equal(media.playbackMode, 'original'); assert.match(media.hlsUrl, /\/original$/);
  const token = new URL(media.hlsUrl).pathname.split('/')[2];
  assert.equal((await verifyVideoToken(token, playbackSecret)).purpose, 'video-original');
  const input = { token, file: 'original', method: 'GET', range: 'bytes=10-29' };
  await authorizeHlsRequest({ ...input, method: 'HEAD' });
  assert.equal((await VideoUsage.findById(usageKey(owner._id, start))).deliveredMinutes, 0);
  await assert.rejects(authorizeHlsRequest({ ...input, file: 'master.m3u8' }), { status: 404 });
  await assert.rejects(authorizeHlsRequest({ ...input, range: 'bytes=200-' }), { status: 416 });
  let reads = 0; const original = Uint8Array.from({ length: 100 }, (_, index) => index);
  t.mock.method(globalThis, 'fetch', async (url, options) => Response.json({ data: await authorizeHlsRequest(JSON.parse(options.body)) }));
  const env = { VIDEO_PLAYBACK_SECRET: playbackSecret, VEYLO_WEB_ORIGIN: process.env.CLIENT_URL, VEYLO_API_ORIGIN: 'https://api.example', DELIVERY_MEDIA: { async get(key, options) { reads++; assert.equal(key, film.objectKey); return { size: original.length, body: new Blob([options?.range ? original.slice(options.range.offset, options.range.offset + options.range.length) : original]).stream() }; } } };
  const response = await handleVideoHls(new Request(media.hlsUrl, { headers: { Range: input.range } }), env);
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Type'), 'video/mp4'); assert.equal(response.headers.get('Content-Range'), 'bytes 10-29/100');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), original.slice(10, 30));
  const usage = await VideoUsage.findById(usageKey(owner._id, start)); assert.equal(usage.deliveredMinutes, .2); assert.equal(usage.deliveredBytes, 20);
  await Delivery.updateOne({ _id: project._id }, { $inc: { 'video.accessVersion': 1 } });
  await assert.rejects(authorizeHlsRequest(input), { code: 'VIDEO_LINK_CLOSED' });
  assert.equal(reads, 1);
});
test('automatic preparation queues without an opt-in and deduplicates requests', async () => {
  const film = await asset(); await VideoAsset.updateOne({ _id: film._id }, { $set: { videoCodec: 'prores', filename: 'finished.mov' }, $unset: { hls: 1 } });
  const project = await delivery(film);
  const pending = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), pending);
  assert.equal(pending.statusCode, 409);
  await queueAdaptiveVideo(await VideoAsset.findById(film._id));
  await queueAdaptiveVideo(await VideoAsset.findById(film._id));
  assert.equal(await VideoJob.countDocuments({ assetId: film._id, 'options.adaptive': true }), 1);
  assert.equal((await VideoAsset.findById(film._id)).adaptive.state, 'queued');
  assert.equal((await Delivery.findById(project._id)).video.draft.playbackMode, 'original', 'A legacy preference does not prevent automatic preparation.');
});

test('partial qualities allow an owner preview while public creation waits for the complete ladder', async () => {
  const film = await asset(); const partial = { ...film.hls.toObject(), version: crypto.randomUUID(), ladderVersion: VIDEO_QUALITY_VERSION };
  partial.prefix = `veylo/video/${owner._id}/${film._id}/hls/${partial.version}/`;
  await VideoAsset.updateOne({ _id: film._id }, { $set: { previewHls: partial, adaptive: { state: 'running', quality: 'q1080', percent: 36, completed: ['q720'] } }, $unset: { hls: 1 } });
  const project = await delivery(film); project.video.draft.playbackMode = 'adaptive'; await project.save();
  const dto = await ownerVideoDTO(project);
  assert.equal(dto.assets[0].previewReady, true); assert.equal(dto.assets[0].playbackReady, false); assert.equal(dto.assets[0].adaptive.percent, 36);
  const media = await videoPlayback({ delivery: project, asset: await VideoAsset.findById(film._id), settings, preview: true });
  const token = new URL(media.hlsUrl).pathname.split('/')[2];
  assert.equal((await authorizeHlsRequest({ token, file: 'q360/s000000.ts', method: 'HEAD' })).bytes, 20);
  const publish = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), publish); assert.equal(publish.statusCode, 409);
  const clientView = { ...project.toObject(), video: { ...project.video.toObject(), published: project.video.draft.toObject() } };
  await assert.rejects(videoPlayback({ delivery: clientView, asset: await VideoAsset.findById(film._id), settings }), { code: 'VIDEO_NOT_READY' });
});
test('automatic preparation recovers a completed stale-processor job without resetting a failed generation', async () => {
  const film = await asset(); await queueAdaptiveVideo(film);
  const queued = await VideoAsset.findById(film._id), generation = queued.adaptive.generation;
  await VideoJob.updateMany({ assetId: film._id, 'options.generation': generation }, { $set: { state: 'done' } });
  await reconcileVideoLibrary();
  const recovered = await VideoJob.find({ assetId: film._id, 'options.generation': generation });
  assert.equal(recovered.length, 2); assert.equal(recovered.filter(row => row.state === 'queued').length, 1);
  await VideoJob.updateMany({ assetId: film._id, 'options.generation': generation }, { $set: { state: 'failed' } });
  await reconcileVideoLibrary();
  assert.equal((await VideoAsset.findById(film._id)).adaptive.state, 'failed');
  assert.equal(await VideoJob.countDocuments({ assetId: film._id, 'options.generation': generation }), 2);
});

test('background ladder upgrades retain issued sessions and start new viewers on Auto', async () => {
  const film = await asset(); const project = await delivery(film); project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const old = await videoPlayback({ delivery: project, asset: film, settings }); assert.equal(old.playbackMode, 'original');
  const upgraded = { ...film.hls.toObject(), version: crypto.randomUUID(), ladderVersion: VIDEO_QUALITY_VERSION };
  upgraded.prefix = `veylo/video/${owner._id}/${film._id}/hls/${upgraded.version}/`;
  await VideoAsset.updateOne({ _id: film._id }, { $set: { hls: upgraded } });
  const current = await VideoAsset.findById(film._id);
  const renewed = await videoPlayback({ delivery: project, asset: current, settings, sessionId: old.sessionId }); assert.equal(renewed.hlsUrl, old.hlsUrl);
  const automatic = await videoPlayback({ delivery: project, asset: current, settings }); assert.equal(automatic.playbackMode, 'adaptive');
  await authorizeHlsRequest({ token: new URL(automatic.hlsUrl).pathname.split('/')[2], file: 'q360/s000000.ts', method: 'HEAD' });
  await authorizeHlsRequest({ token: new URL(old.hlsUrl).pathname.split('/')[2], file: 'original', method: 'HEAD' });
});

test('a retained adaptive version stays authorized only for its issued session', async () => {
  const film = await asset(); const project = await delivery(film); project.video.draft.playbackMode = 'adaptive'; project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const old = await videoPlayback({ delivery: project, asset: film, settings });
  const previous = film.hls.toObject(); const next = { ...previous, ladderVersion: VIDEO_QUALITY_VERSION, version: crypto.randomUUID() };
  next.prefix = `veylo/video/${owner._id}/${film._id}/hls/${next.version}/`;
  next.variants = [{ ...previous.variants[0], name: 'q720', width: 1280, height: 720 }];
  await VideoAsset.updateOne({ _id: film._id }, { $set: { hls: next, previousHls: [previous] } });
  const renewed = await videoPlayback({ delivery: project, asset: await VideoAsset.findById(film._id), settings, sessionId: old.sessionId });
  assert.deepEqual(renewed.qualities.map(row => row.name), ['q360']); assert.equal(renewed.hlsUrl, old.hlsUrl);
  const token = new URL(old.hlsUrl).pathname.split('/')[2];
  assert.equal((await authorizeHlsRequest({ token, file: 'q360/s000000.ts', method: 'HEAD' })).bytes, 20);
  await Delivery.updateOne({ _id: project._id }, { $inc: { 'video.accessVersion': 1 } });
  await assert.rejects(authorizeHlsRequest({ token, file: 'q360/s000000.ts', method: 'HEAD' }), { code: 'VIDEO_LINK_CLOSED' });
});

test('publishing snapshots titles, descriptions and covers; conflicting saves cannot overwrite it', async () => {
  const film = await automaticAsset(); const project = await delivery(film);
  const published = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), published);
  assert.equal(published.statusCode, 200, JSON.stringify(published.body));
  let saved = await Delivery.findById(project._id);
  assert.equal(saved.video.published.items[0].posterKey, film.posterKey);
  await VideoAsset.updateOne({ _id: film._id }, { $set: { posterKey: 'test/new-cover.webp' } });
  const input = { revision: saved.video.revision, clientName: '', brief: '', presentation: { title: 'Changed draft', introduction: '', items: [{ assetId: String(film._id), title: 'Changed draft film', description: 'Changed draft caption.', posterSeconds: 0, allowDownload: false }], allowDownloads: false, featuredAssetId: String(film._id) } };
  const edit = response(); await saveVideoDraft(request(project._id, input), edit); assert.equal(edit.statusCode, 409); assert.equal(edit.body.code, 'VIDEO_DELIVERY_COMPLETE');
  const conflict = response(); await saveVideoDraft(request(project._id, input), conflict); assert.equal(conflict.statusCode, 409);
  const upload = response(); await initializeVideoUpload(request(project._id, { filename: 'new-film.mp4', bytes: 100, fingerprint: 'a'.repeat(64), requestKey: crypto.randomUUID() }), upload);
  assert.equal(upload.statusCode, 409); assert.equal(upload.body.code, 'VIDEO_DELIVERY_COMPLETE');
  saved = await Delivery.findById(project._id);
  assert.equal(saved.video.published.title, 'Wedding films'); assert.equal(saved.video.published.items[0].description, 'The complete ceremony.'); assert.equal(saved.video.published.items[0].posterKey, film.posterKey);
  const dto = await ownerVideoDTO(saved); assert.doesNotMatch(JSON.stringify(dto), /objectKey|posterKey|streamUid|pinDigest/);
  const client = await videoPresentationDTO(saved, owner); assert.equal(client.items[0].allowDownload, false); assert.doesNotMatch(JSON.stringify(client), /finished-film.mp4|test\//);
  const remove = response(); await deleteVideoAsset({ ...request(project._id), params: { assetId: String(film._id) } }, remove); assert.equal(remove.statusCode, 409);
  await Delivery.updateOne({ _id: project._id }, { $set: { status: 'draft', 'access.revokedAt': new Date() } });
  const closed = response(); await saveVideoDraft(request(project._id, input), closed); assert.equal(closed.body.code, 'VIDEO_DELIVERY_COMPLETE');
  const reopen = response(); await publishVideoDelivery(request(project._id, { revision: saved.video.revision }), reopen); assert.equal(reopen.body.code, 'VIDEO_DELIVERY_COMPLETE');
});
test('dashboard covers use the published featured cover and stay private to the owner', async t => {
  const first = await automaticAsset(), featured = await automaticAsset(); const project = await delivery(first);
  project.video.draft.items.push({ assetId: featured._id, title: 'Highlights' });
  project.video.draft.featuredAssetId = featured._id;
  await project.save();
  const publish = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), publish);
  assert.equal(publish.statusCode, 200);
  await VideoAsset.updateOne({ _id: featured._id }, { $set: { posterKey: 'new-draft-cover.webp' } });
  const savedProject = await Delivery.findById(project._id);
  savedProject.video.draft.featuredAssetId = first._id; await savedProject.save();
  const summaries = await videoDashboardSummaries([savedProject.toObject()], owner._id);
  assert.equal(summaries.get(String(project._id)).videoCount, 2);
  assert.equal(summaries.get(String(project._id)).thumbnailUrl, `/api/v1/videos/deliveries/${project._id}/poster`);
  assert.doesNotMatch(JSON.stringify([...summaries]), /posterKey|objectKey|cloudflarestorage/);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async url => { requests.push(String(url)); return new Response(Buffer.from('test-cover'), { headers: { 'content-type': 'image/webp' } }); });
  const poster = response(); poster.type = () => poster; poster.send = buffer => { poster.buffer = buffer; return poster; };
  await getVideoDeliveryPoster(request(project._id), poster);
  assert.equal(poster.buffer.toString(), 'test-cover');
  assert.equal(new URL(requests[0]).pathname, '/test/' + featured.posterKey);
  const forbidden = response(); await getVideoDeliveryPoster({ ...request(project._id), user: { id: String(outsider._id) } }, forbidden);
  assert.equal(forbidden.statusCode, 404); assert.equal(requests.length, 1);
  const fallback = videoDashboardCover(savedProject, new Map([[String(first._id), first]]));
  assert.equal(String(fallback.asset._id), String(first._id));
  assert.equal(videoDashboardCover(savedProject, new Map()), null);
  savedProject.status = 'draft';
  assert.equal(String(videoDashboardCover(savedProject, new Map([[String(first._id), first], [String(featured._id), featured]])).asset._id), String(first._id));
  const draft = await delivery(first);
  assert.ok((await videoDashboardSummaries([draft.toObject()], owner._id)).get(String(draft._id)).thumbnailUrl);
});

test('dashboard download settings update live permissions without publishing draft edits or interrupting playback', async () => {
  const film = await automaticAsset(); const project = await delivery(film);
  const published = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), published); assert.equal(published.statusCode, 200);
  await Delivery.updateOne({ _id: project._id }, { $set: { 'video.draft.title': 'Unpublished title', 'video.draft.items.0.description': 'Unpublished caption', 'video.draft.playbackMode': 'adaptive' } });
  const original = await Delivery.findById(project._id);
  const load = response(); await getVideoDownloadSettings(request(project._id), load);
  assert.equal(load.body.data.allowDownloads, false);
  assert.equal(load.body.data.title, 'Wedding films');
  assert.doesNotMatch(JSON.stringify(load.body), /posterKey|objectKey|pinDigest/);
  const body = { revision: original.video.revision, allowDownloads: true, items: [{ assetId: String(film._id), allowDownload: false }] };
  const save = response(); await updateVideoDownloadSettings(request(project._id, body), save);
  assert.equal(save.statusCode, 200, JSON.stringify(save.body));
  let latest = await Delivery.findById(project._id);
  assert.equal(latest.video.revision, original.video.revision + 1);
  assert.equal(latest.video.accessVersion, original.video.accessVersion);
  assert.equal(latest.video.published.title, 'Wedding films');
  assert.equal(latest.video.published.items[0].description, 'The complete ceremony.');
  assert.equal(latest.video.draft.title, 'Unpublished title');
  assert.equal(latest.video.draft.items[0].description, 'Unpublished caption');
  assert.equal(latest.video.published.playbackMode, 'adaptive');
  assert.equal(latest.video.draft.playbackMode, 'adaptive');
  assert.equal(latest.video.draft.items[0].allowDownload, false);
  assert.equal((await videoPresentationDTO(latest, owner)).items[0].allowDownload, false);
  const clientDownload = response(); await downloadPublicVideo({ params: { publicId: project.publicId, assetId: String(film._id) }, cookies: {} }, clientDownload);
  assert.equal(clientDownload.statusCode, 403); assert.equal(clientDownload.body.code, 'VIDEO_DOWNLOAD_DISABLED');
  const conflict = response(); await updateVideoDownloadSettings(request(project._id, body), conflict); assert.equal(conflict.statusCode, 409);
  const inherit = response(); await updateVideoDownloadSettings(request(project._id, { ...body, revision: latest.video.revision, items: [{ assetId: String(film._id), allowDownload: null }] }), inherit);
  assert.equal(inherit.statusCode, 200);
  latest = await Delivery.findById(project._id); assert.equal((await videoPresentationDTO(latest, owner)).items[0].allowDownload, true);
  const staleDraft = response(); await saveVideoDraft(request(project._id, { revision: original.video.revision, clientName: '', brief: '', presentation: { title: 'Old tab', items: [{ assetId: String(film._id), title: 'Old tab', allowDownload: false }] } }), staleDraft);
  assert.equal(staleDraft.statusCode, 409);
});

test('dashboard download settings reject cross-owner, wrong video lists, invalid input and archived deliveries', async () => {
  const film = await automaticAsset(), unrelated = await automaticAsset(); const project = await delivery(film);
  const unpublished = response(); await getVideoDownloadSettings(request(project._id), unpublished); assert.equal(unpublished.statusCode, 409);
  const published = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), published);
  const body = { revision: published.body.data.video.revision, allowDownloads: true, items: [{ assetId: String(film._id), allowDownload: null }] };
  for (const action of [getVideoDownloadSettings, updateVideoDownloadSettings]) {
    const denied = response(); await action({ ...request(project._id, body), user: { id: String(outsider._id) } }, denied); assert.equal(denied.statusCode, 404);
  }
  for (const items of [[{ assetId: String(unrelated._id), allowDownload: true }], [...body.items, ...body.items]]) {
    const denied = response(); await updateVideoDownloadSettings(request(project._id, { ...body, items }), denied); assert.equal(denied.statusCode, 409);
  }
  const invalid = response(); await updateVideoDownloadSettings(request(project._id, { ...body, allowDownloads: 'true' }), invalid); assert.equal(invalid.statusCode, 400);
  const extra = response(); await updateVideoDownloadSettings(request(project._id, { ...body, title: 'Sneaky rename' }), extra); assert.equal(extra.statusCode, 400);
  await Delivery.updateOne({ _id: project._id }, { $set: { status: 'archived' } });
  const archived = response(); await updateVideoDownloadSettings(request(project._id, body), archived); assert.equal(archived.statusCode, 409);
});

test('PIN grants are scoped to a delivery and invalidated immediately by access changes', async () => {
  const film = await asset(); const project = await delivery(film);
  project.status = 'published'; project.video.published = project.video.draft.toObject(); await project.save();
  const access = response(); await saveVideoAccess(request(project._id, { pin: '123456', expiresAt: null }), access); assert.equal(access.statusCode, 200);
  const secured = await Delivery.findById(project._id).select('+access.pinDigest'); let cookie;
  setVideoGrant({ cookie(name, value) { cookie = { [name]: value }; } }, secured);
  assert.equal(hasVideoGrant({ cookies: cookie }, secured), true);
  assert.equal(hasVideoGrant({ cookies: cookie }, { ...secured.toObject(), access: { pinDigest: 'present' }, video: { accessVersion: secured.video.accessVersion + 1 } }), false);
  const req = { params: { publicId: project.publicId }, cookies: {} };
  const locked = await publicVideoDelivery(req, { allowLocked: true }); assert.equal(locked.locked, true);
  await assert.rejects(publicVideoDelivery(req), { code: 'VIDEO_PIN_REQUIRED' });
});
test('playback allowance caps prevent new playback but do not change download settings', async () => {
  const film = await asset(); const project = await delivery(film); const { start, end } = lagosMonthWindow();
  await VideoUsage.findOneAndUpdate({ _id: usageKey(owner._id, start) }, { $set: { userId: owner._id, periodStart: start, periodEnd: end, deliveredMinutes: 5000, reconciledAt: new Date() } }, { upsert: true });
  await assert.rejects(videoPlayback({ delivery: project, asset: film, settings }), { code: 'VIDEO_PLAYBACK_LIMIT' });
  await VideoUsage.updateOne({ _id: usageKey(owner._id, start) }, { $set: { deliveredMinutes: 1 } });
  const first = await videoPlayback({ delivery: project, asset: film, settings });
  const second = await videoPlayback({ delivery: project, asset: film, settings, sessionId: first.sessionId });
  assert.equal(first.sessionId, second.sessionId); assert.equal(await VideoPlayback.countDocuments({ deliveryId: project._id }), 1);
  project.video.accessVersion += 1;
  await assert.rejects(videoPlayback({ delivery: project, asset: film, settings, sessionId: first.sessionId }), { code: 'VIDEO_SESSION_EXPIRED' });
});
test('AI spending reservations stay inside account and platform limits under contention', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => chargeVideoAIBudget(owner._id, .1, { ...settings, aiMonthlyBudgetUsd: .25, aiPlatformDailyBudgetUsd: 1 })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.code === 'VIDEO_AI_BUDGET'));
});
test('HLS credentials scope one asset, session and immutable version, with bounded expiry', async () => {
  const film = await asset(); const sessionId = crypto.randomUUID(); const now = Date.now();
  const media = signedHlsMedia({ assetId: film._id, sessionId, version: film.hls.version, now, seconds: 600 });
  const token = new URL(media.hlsUrl).pathname.split('/')[2];
  const payload = verifyHlsToken(token);
  assert.equal(payload.assetId, String(film._id)); assert.equal(payload.sessionId, sessionId); assert.equal(payload.version, film.hls.version); assert.equal(payload.exp, Math.floor(now / 1000) + 600);
  assert.ok(await verifyVideoToken(token, playbackSecret));
  assert.equal(await verifyVideoToken(token, 'wrong-secret'.repeat(4)), null);
  assert.equal(await verifyVideoToken(token, playbackSecret, now + 601000), null);
  assert.equal(hlsFile(film, 'original.mp4'), null); assert.equal(hlsFile(film, '../poster.webp'), null); assert.equal(hlsFile(film, 'q360/s000010.ts'), null);
});

test('original range requests and full-timeline sampling stay bounded', () => {
  assert.equal(validatedVideoRange('bytes=100-', 1000), 'bytes=100-999'); assert.equal(validatedVideoRange('bytes=-100', 1000), 'bytes=900-999'); assert.equal(validatedVideoRange('bytes=0-999999', 1000), 'bytes=0-999');
  for (const value of ['bytes=1000-', 'bytes=5-4', 'bytes=-0', 'bytes=0-2,4-6', 'bytes=999999999999999999999-']) assert.throws(() => validatedVideoRange(value, 1000), { status: 416 });
  for (const [duration, count] of [[60, 12], [600, 24], [3600, 60], [10800, 120]]) { const frames = frameTimestamps(duration); assert.equal(frames.length, count); assert.ok(frames[0] < duration * .05); assert.ok(frames.at(-1) > duration * .95); assert.ok(frames.every(value => value >= 0 && value < duration)); }
});
test('quota repair keeps image bytes and uses ledger states rather than guessed deletion', async () => {
  const id = new mongoose.Types.ObjectId();
  await videoTransaction(session => reserveVideoBytes({ assetId: id, userId: owner._id, bytes: 300, limit: 1000 }, session));
  await videoTransaction(session => commitVideoBytes(id, session));
  await User.updateOne({ _id: owner._id }, { $set: { videoUsedBytes: 200, storageUsedBytes: 700, storageReservedBytes: 123 } });
  await reconcileVideoQuota(owner._id);
  const user = await User.findById(owner._id); assert.equal(user.videoUsedBytes, 300); assert.equal(user.storageUsedBytes, 800); assert.equal(user.storageReservedBytes, 0);
  await releaseVideoQuota(id); await User.updateOne({ _id: owner._id }, { $set: { storageUsedBytes: 0 } });
});
test('failed provider cleanup retains charges; a duplicate successful cleanup releases them once', async t => {
  const film = await asset(); await videoTransaction(session => reserveVideoBytes({ assetId: film._id, userId: owner._id, bytes: film.bytes, limit: 1000 }, session)); await videoTransaction(session => commitVideoBytes(film._id, session));
  const fetch = t.mock.method(globalThis, 'fetch', async url => { if (String(url).includes('r2.cloudflarestorage.com')) throw new Error('Simulated connection failure'); return Response.json({ success: true, result: {} }); });
  await assert.rejects(deleteVideoOriginal(film)); assert.equal((await VideoQuota.findById(String(film._id))).byteState, 'committed'); assert.equal((await User.findById(owner._id)).videoUsedBytes, film.bytes);
  const orphan = `veylo/video/${owner._id}/${film._id}/cover-orphan.webp`; const removed = [];
  fetch.mock.mockImplementation(async (url, options) => {
    if (!String(url).includes('r2.cloudflarestorage.com')) return Response.json({ success: true, result: {} });
    if (!options.method || options.method === 'GET') return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>${orphan}</Key><Size>100</Size></Contents></ListBucketResult>`);
    removed.push(new URL(url).pathname); return new Response(null, { status: 204 });
  });
  await deleteVideoOriginal(await VideoAsset.findById(film._id)); await deleteVideoOriginal(await VideoAsset.findById(film._id)); assert.equal((await User.findById(owner._id)).videoUsedBytes, 0);
  assert.ok(removed.some(value => value.endsWith(orphan)));
});
test('multipart initialisation and duplicate completion reserve and charge only one original', async t => {
  const project = await Delivery.create({ userId: owner._id, kind: 'video', video: { draft: { title: 'Uploads', items: [] } } }); let completed = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    if (target.searchParams.has('uploads')) return new Response('<InitiateMultipartUploadResult><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>');
    if (options.method === 'HEAD') return new Response(null, { status: completed ? 200 : 404, headers: completed ? { 'Content-Length': '100', 'Content-Type': 'video/mp4' } : {} });
    if (options.method === 'GET') return new Response('<ListPartsResult><Part><PartNumber>1</PartNumber><ETag>"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"</ETag><Size>100</Size></Part></ListPartsResult>');
    completed = true; return new Response('<CompleteMultipartUploadResult><ETag>"done"</ETag></CompleteMultipartUploadResult>');
  });
  const body = { filename: 'film.mp4', bytes: 100, fingerprint: 'a'.repeat(64), requestKey: crypto.randomUUID() }; const opened = response(); await initializeVideoUpload(request(project._id, body), opened); assert.equal(opened.statusCode, 200, JSON.stringify(opened.body));
  const repeat = response(); await initializeVideoUpload(request(project._id, body), repeat); assert.equal(repeat.body.data.id, opened.body.data.id); assert.equal(await VideoUpload.countDocuments({ deliveryId: project._id }), 1); assert.equal((await User.findById(owner._id)).storageReservedBytes, 100);
  const finishRequest = { ...request(project._id), params: { uploadId: opened.body.data.id } }; const first = response(); await completeVideoUpload(finishRequest, first); assert.equal(first.statusCode, 200, JSON.stringify(first.body)); const second = response(); await completeVideoUpload(finishRequest, second); assert.equal(second.statusCode, 200);
  assert.equal((await User.findById(owner._id)).videoUsedBytes, 100); assert.equal((await User.findById(owner._id)).storageReservedBytes, 0);
  await releaseVideoQuota(opened.body.data.assetId);
});
test('trusted edge grants avoid streaming original bytes through the API', async () => {
  const film = await asset(); process.env.VEYLO_EDGE_KEY = 'test-edge-trust-key';
  const headers = { range: 'bytes=10-19', 'x-veylo-edge-key': process.env.VEYLO_EDGE_KEY, 'x-veylo-video-download-proxy': '1', 'x-veylo-video-download-method': 'GET' };
  const res = response(); await downloadOwnerVideo({ ...request('unused'), params: { assetId: String(film._id) }, method: 'GET', get: name => headers[name] }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.range, 'bytes=10-19'); assert.equal(new URL(res.body.data.url).hostname, 'a'.repeat(32) + '.r2.cloudflarestorage.com'); assert.equal(res.body.data.method, 'GET');
});
test('edge range downloads never forward account cookies or trust headers to storage', async t => {
  const calls = []; t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    assert.equal(url instanceof Request ? url.redirect : options.redirect, 'manual');
    if (url instanceof Request) return Response.json({ success: true, data: { url: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com/private/original.mp4?signed=test', method: 'GET', range: 'bytes=10-19', bytes: 100, disposition: 'attachment; filename="film.mp4"' } });
    return new Response('0123456789', { status: 206, headers: { 'Content-Length': '10', 'Content-Range': 'bytes 10-19/100' } });
  });
  const req = new Request('https://veylo.example/api/v1/videos/assets/abc/download', { headers: { Cookie: 'private-session', Range: 'bytes=10-19' } });
  const result = await handleVideoDownload(req, new URL('https://api.example/download'), new Headers({ Cookie: 'private-session', 'x-veylo-edge-key': 'private-edge-key' }));
  assert.equal(result.status, 206); assert.equal(await result.text(), '0123456789'); assert.equal(result.headers.get('Content-Range'), 'bytes 10-19/100'); assert.equal(calls[1].options.headers.get('cookie'), null); assert.equal(calls[1].options.headers.get('x-veylo-edge-key'), null); assert.equal(calls[1].options.headers.get('range'), 'bytes=10-19');
});

test('original download rejects storage redirects without forwarding signed URLs', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url instanceof Request ? url.redirect : options.redirect, 'manual');
    if (url instanceof Request) return Response.json({ data: { url: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com/private/original.mp4?signed=test', method: 'GET', bytes: 100, disposition: 'attachment; filename="film.mp4"' } });
    return new Response(null, { status: 302, headers: { Location: 'https://other.example/collect' } });
  });
  const result = await handleVideoDownload(new Request('https://veylo.example/download'), new URL('https://api.example/download'), new Headers());
  assert.equal(result.status, 502);
  assert.equal(result.headers.get('Location'), null);
  assert.equal(calls, 2);
});

test('HLS requests enforce access and atomically reserve requested segment minutes', async () => {
  const film = await asset(); const project = await delivery(film); project.video.draft.playbackMode = 'adaptive'; project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const { start } = lagosMonthWindow(); await VideoUsage.updateOne({ _id: usageKey(owner._id, start) }, { $set: { deliveredMinutes: 4999.8 } });
  const media = await videoPlayback({ delivery: project, asset: film, settings });
  const token = new URL(media.hlsUrl).pathname.split('/')[2];
  const input = { token, file: 'q360/s000000.ts', method: 'GET' };
  await authorizeHlsRequest({ ...input, method: 'HEAD' });
  assert.equal((await VideoUsage.findById(usageKey(owner._id, start))).deliveredMinutes, 4999.8);
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => authorizeHlsRequest(input)));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 2);
  assert.ok(results.filter(row => row.status === 'rejected').every(row => row.reason.code === 'VIDEO_PLAYBACK_LIMIT'));
  await VideoUsage.updateOne({ _id: usageKey(owner._id, start) }, { $set: { deliveredMinutes: 1 } });
  assert.match((await authorizeHlsRequest(input)).key, /hls/);
  await assert.rejects(authorizeHlsRequest({ ...input, file: 'original.mp4' }), { status: 404 });
  await assert.rejects(authorizeHlsRequest({ ...input, file: '../q360/s000000.ts' }), { status: 404 });
  await Delivery.updateOne({ _id: project._id }, { $inc: { 'video.accessVersion': 1 } });
  await assert.rejects(authorizeHlsRequest(input), { code: 'VIDEO_LINK_CLOSED' });
});

test('private HLS edge validates tokens and permissions before any R2 read, with CORS and ranges', async t => {
  const film = await asset(); const project = await delivery(film); project.video.draft.playbackMode = 'adaptive'; project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const media = await videoPlayback({ delivery: project, asset: film, settings });
  let reads = 0; let denied = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v1/videos/media/authorize');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers['x-veylo-video-secret'], playbackSecret);
    assert.equal(options.headers.Cookie, undefined);
    if (denied) return new Response(null, { status: denied });
    return Response.json({ data: await authorizeHlsRequest(JSON.parse(options.body)) });
  });
  const env = { VIDEO_PLAYBACK_SECRET: playbackSecret, VEYLO_WEB_ORIGIN: process.env.CLIENT_URL, VEYLO_API_ORIGIN: 'https://api.example', DELIVERY_MEDIA: { async get(key, options) { reads++; const bytes = new Uint8Array(20); return { size: 20, body: new Blob([options?.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes]).stream() }; } } };
  const url = media.hlsUrl.replace('master.m3u8', 'q360/s000000.ts');
  const result = await handleVideoHls(new Request(url, { headers: { Origin: process.env.CLIENT_URL, Range: 'bytes=5-9' } }), env);
  assert.equal(result.status, 206); assert.equal((await result.arrayBuffer()).byteLength, 5); assert.equal(result.headers.get('Content-Range'), 'bytes 5-9/20'); assert.equal(result.headers.get('Access-Control-Allow-Origin'), process.env.CLIENT_URL); assert.match(result.headers.get('Cache-Control'), /no-store/);
  const head = await handleVideoHls(new Request(url, { method: 'HEAD' }), env); assert.equal(head.status, 200); assert.equal(reads, 1);
  denied = 410;
  assert.equal((await handleVideoHls(new Request(url), env)).status, 410); assert.equal(reads, 1);
  denied = 302;
  assert.equal((await handleVideoHls(new Request(url), env)).status, 503); assert.equal(reads, 1);
  assert.equal((await handleVideoHls(new Request(url.replace('q360/s000000.ts', 'original.mp4')), env)).status, 401); assert.equal(reads, 1);
  assert.equal((await handleVideoHls(new Request(url, { headers: { Origin: 'https://other.example' } }), env)).status, 403);
});

test('video recovery starts at actual Pro expiry and renewal restores hosting', async () => {
  const endedAt = new Date(Date.now() - 86400_000);
  try {
    await User.updateOne({ _id: owner._id }, { $set: { plan: 'free', planOverride: { plan: 'pro', expiresAt: endedAt } } });
    const expired = await videoContext(owner._id);
    assert.equal(expired.entitlements.plan, 'free');
    assert.equal(expired.recoveryUntil.getTime(), endedAt.getTime() + settings.recoveryDays * 86400_000);
    await assert.rejects(videoContext(owner._id, { hosting: true }), { code: 'VIDEO_PRO_REQUIRED' });
    // The retention scan can clear an expired manual grant without moving its deadline.
    await User.updateOne({ _id: owner._id }, { $set: { videoRetentionUntil: expired.recoveryUntil }, $unset: { planOverride: 1 } });
    assert.equal((await videoContext(owner._id)).recoveryUntil.getTime(), expired.recoveryUntil.getTime());
    await User.updateOne({ _id: owner._id }, { $set: { planOverride: { plan: 'pro' } } });
    assert.equal((await videoContext(owner._id, { hosting: true })).entitlements.plan, 'pro');
    assert.equal((await videoContext(owner._id)).recoveryUntil, null);
  } finally {
    await User.updateOne({ _id: owner._id }, { $set: { planOverride: { plan: 'pro' } }, $unset: { videoRetentionUntil: 1 } });
  }
});


test('creation waits for all qualities and covers, then publishes once', async () => {
  const film = await asset(); const project = await delivery(film);
  const beforeCover = (await ownerVideoDTO(project)).assets[0].posterUrl;
  await VideoAsset.updateOne({ _id: film._id }, { $set: { 'cover.state': 'queued' } });
  const pending = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), pending); assert.equal(pending.statusCode, 409);
  await VideoAsset.updateOne({ _id: film._id }, { $set: { 'cover.state': 'ready', 'cover.generation': crypto.randomUUID() }, $unset: { hls: 1 } });
  assert.notEqual((await ownerVideoDTO(project)).assets[0].posterUrl, beforeCover);
  const missing = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), missing); assert.equal(missing.statusCode, 409);
  await VideoAsset.updateOne({ _id: film._id }, { $set: { hls: { ...film.hls.toObject(), ladderVersion: VIDEO_QUALITY_VERSION } } });
  const published = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), published); assert.equal(published.statusCode, 200);
  assert.equal(published.body.data.video.published.playbackMode, 'adaptive');
  const duplicate = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), duplicate); assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.data.video.revision, published.body.data.video.revision);
});

test('media access stops on link expiry, playback pause and Pro expiry; preview grants stay scoped', async () => {
  const film = await asset(); const project = await delivery(film); project.video.draft.playbackMode = 'adaptive'; project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const media = await videoPlayback({ delivery: project, asset: film, settings });
  const input = { token: new URL(media.hlsUrl).pathname.split('/')[2], file: 'master.m3u8', method: 'GET' };
  await Delivery.updateOne({ _id: project._id }, { $set: { 'access.expiresAt': new Date(Date.now() - 1000) } });
  await assert.rejects(authorizeHlsRequest(input), { code: 'VIDEO_LINK_CLOSED' });
  await Delivery.updateOne({ _id: project._id }, { $set: { 'access.expiresAt': null } });
  try {
    await updateRuntimeConfig({ videoDelivery: { ...settings, playbackEnabled: false } });
    await assert.rejects(authorizeHlsRequest(input), { code: 'VIDEO_PLAYBACK_PAUSED' });
    await updateRuntimeConfig({ videoDelivery: settings });
    await User.updateOne({ _id: owner._id }, { $set: { planOverride: { plan: 'free' } } });
    await assert.rejects(authorizeHlsRequest(input), { code: 'VIDEO_PRO_REQUIRED' });
  } finally { await User.updateOne({ _id: owner._id }, { $set: { planOverride: { plan: 'pro' } } }); await updateRuntimeConfig({ videoDelivery: settings }); }
  const preview = await videoPlayback({ delivery: project, asset: film, settings, preview: true });
  await assert.rejects(videoPlayback({ delivery: project, asset: film, settings, sessionId: preview.sessionId, preview: false }), { code: 'VIDEO_SESSION_EXPIRED' });
  await VideoPlayback.deleteOne({ _id: media.sessionId });
  await assert.rejects(authorizeHlsRequest(input), { code: 'VIDEO_SESSION_EXPIRED' });
});

const encoder = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-muxers'], { encoding: 'utf8', windowsHide: true });
test('upload inspection queues automatic qualities and keeps originals safe throughout preparation', { skip: !(encoder.status === 0 && /\bE\s+hls\s/.test(encoder.stdout)) && 'Requires full FFmpeg and FFprobe.', timeout: 180000 }, async t => {
  const source = new URL('../../.visual-review/video-hls/auto-worker-source.mp4', import.meta.url);
  await mkdir(new URL('./', source), { recursive: true });
  await runMediaTool('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '48', '-threads', '2', '-c:a', 'aac', '-y', fileURLToPath(source)]);
  const original = await readFile(source);
  const film = await asset(); await VideoAsset.updateOne({ _id: film._id }, { $set: { state: 'queued', bytes: original.length }, $unset: { hls: 1, posterKey: 1 } });
  await videoTransaction(session => reserveVideoBytes({ assetId: film._id, userId: owner._id, bytes: original.length, limit: 100 * 1024 ** 3 }, session));
  await videoTransaction(session => commitVideoBytes(film._id, session));
  const stored = new Map();
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = new URL(url);
    assert.match(target.hostname, /r2\.cloudflarestorage\.com$/);
    if (target.searchParams.has('list-type')) return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>');
    if (options.method === 'PUT') { stored.set(decodeURIComponent(target.pathname.slice('/test/'.length)), Buffer.from(await new Response(options.body).arrayBuffer())); return new Response(null, { status: 200 }); }
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(original, { headers: { 'Content-Length': String(original.length) } });
  });
  const job = await VideoJob.create({ key: 'real-prepare:' + film._id, assetId: film._id, userId: owner._id, type: 'prepare', state: 'running', leaseToken: crypto.randomUUID(), leaseUntil: new Date(Date.now() + 120000) });
  await prepareVideo(await VideoAsset.findById(film._id), settings, job);
  let ready = await VideoAsset.findById(film._id);
  assert.equal(ready.state, 'ready'); assert.equal(ready.hls?.version, undefined);
  assert.ok([...stored.keys()].every(key => !key.includes('/hls/')));
  assert.equal((await VideoQuota.findById(String(film._id))).durationState, 'committed');
  const adaptiveJob = await VideoJob.findOneAndUpdate({ assetId: film._id, 'options.adaptive': true }, { $set: { state: 'running', leaseToken: crypto.randomUUID(), leaseUntil: new Date(Date.now() + 120000) } }, { new: true });
  await prepareVideo(await VideoAsset.findById(film._id), settings, adaptiveJob);
  ready = await VideoAsset.findById(film._id);
  assert.equal(ready.state, 'ready'); assert.equal(ready.adaptive.state, 'ready'); assert.equal(ready.hls.variants.length, 1); assert.equal(ready.hls.ladderVersion, VIDEO_QUALITY_VERSION); assert.ok(stored.has(ready.hls.prefix + 'master.m3u8'));
  assert.equal((await VideoQuota.findById(String(film._id))).durationState, 'committed');
  for (const variant of ready.hls.variants) for (let index = 0; index < variant.segments.length; index++) assert.equal(stored.get(ready.hls.prefix + variant.name + '/s' + String(index).padStart(6, '0') + '.ts').length, variant.segments[index].bytes);
  const stale = await asset(); await VideoAsset.updateOne({ _id: stale._id }, { $set: { state: 'queued', bytes: original.length }, $unset: { hls: 1 } });
  const expired = await VideoJob.create({ key: 'expired:' + stale._id, assetId: stale._id, userId: owner._id, type: 'prepare', state: 'running', leaseToken: crypto.randomUUID(), leaseUntil: new Date(Date.now() - 1000) });
  await assert.rejects(prepareVideo(await VideoAsset.findById(stale._id), settings, expired), { code: 'VIDEO_JOB_SUPERSEDED' });
  assert.notEqual((await VideoAsset.findById(stale._id)).state, 'ready');
  await VideoJob.updateMany({ _id: { $in: [job._id, adaptiveJob._id] } }, { $set: { state: 'done' } });
  await deleteVideoOriginal(ready); assert.equal((await VideoQuota.findById(String(film._id))).byteState, 'released');
});

test('Cloudflare readiness accepts sleeping encoders only with a fresh verified coordinator and budget', async () => {
  const oldMode = process.env.VIDEO_PROCESSING_MODE;
  const oldSecret = process.env.VIDEO_PROCESSING_SECRET;
  process.env.VIDEO_PROCESSING_MODE = 'cloudflare-containers';
  process.env.VIDEO_PROCESSING_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    const denied = response(); let authenticated = false;
    requireVideoProcessing({ headers: {} }, denied, () => { authenticated = true; });
    assert.equal(denied.statusCode, 401); assert.equal(authenticated, false);
    requireVideoProcessing({ headers: { authorization: 'Bearer ' + process.env.VIDEO_PROCESSING_SECRET } }, response(), () => { authenticated = true; });
    assert.equal(authenticated, true);
    await assert.rejects(videoContext(owner._id, { write: true }), { code: 'VIDEO_WORKER_UNAVAILABLE' });
    const report = async (verifiedAt, remainingSeconds) => {
      const res = response();
      await videoProcessingStatus({ body: { verifiedAt, remainingSeconds, reservedSeconds: 90 } }, res, error => { throw error; });
      assert.equal(res.body.success, true);
      assert.equal(typeof res.body.data.pending, 'number');
      assert.ok(res.body.data.diagnostics.jobs);
      assert.ok(res.body.data.diagnostics.assets);
      for (const row of res.body.data.diagnostics.failures) assert.deepEqual(Object.keys(row).sort(), ['attempts', 'code', 'runAfter', 'state', 'type', 'updatedAt']);
      assert.doesNotMatch(JSON.stringify(res.body.data.diagnostics), /userId|assetId|objectKey|filename|leaseToken/);
      assert.equal(JSON.stringify(res.body).includes(process.env.VIDEO_PROCESSING_SECRET), false);
    };
    await report(Date.now() - 25 * 3600_000, 1000);
    await assert.rejects(videoContext(owner._id, { write: true }), { code: 'VIDEO_WORKER_UNAVAILABLE' });
    await report(Date.now(), 1000);
    assert.equal((await videoContext(owner._id, { write: true })).entitlements.plan, 'pro');
    await report(Date.now(), 0);
    await assert.rejects(videoContext(owner._id, { write: true }), { code: 'VIDEO_WORKER_UNAVAILABLE' });
    // An already admitted job may commit while new-upload admission is paused.
    assert.equal((await videoContext(owner._id, { write: true, worker: true })).entitlements.plan, 'pro');
    await assert.rejects(videoContext(outsider._id, { write: true, worker: true }), { code: 'VIDEO_PRO_REQUIRED' });
    await report(Date.now(), 1000);
    await WorkerHeartbeat.updateOne({ workerName: 'video-coordinator', instance: 'cloudflare' }, { $set: { heartbeatAt: new Date(Date.now() - 121_000) } });
    await assert.rejects(videoContext(owner._id, { write: true }), { code: 'VIDEO_WORKER_UNAVAILABLE' });
  } finally {
    await WorkerHeartbeat.deleteMany({ workerName: 'video-coordinator', instance: 'cloudflare' });
    if (oldMode === undefined) delete process.env.VIDEO_PROCESSING_MODE; else process.env.VIDEO_PROCESSING_MODE = oldMode;
    if (oldSecret === undefined) delete process.env.VIDEO_PROCESSING_SECRET; else process.env.VIDEO_PROCESSING_SECRET = oldSecret;
  }
});

test('a six-video batch can wake six workers for the same photographer without exposing account details', async () => {
  const waiting = await VideoJob.find({ state: { $in: ['queued', 'running'] } }).select('_id runAfter').lean();
  await VideoJob.updateMany({ _id: { $in: waiting.map(row => row._id) } }, { $set: { runAfter: new Date(Date.now() + 86400_000) } });
  const keys = Array.from({ length: 6 }, (_, index) => 'parallel-batch-' + index + ':' + crypto.randomUUID());
  try {
    await VideoJob.insertMany(keys.map(key => ({ key, userId: owner._id, assetId: new mongoose.Types.ObjectId(), type: 'prepare', runAfter: new Date(0) })));
    const res = response();
    await videoProcessingStatus({ body: { verifiedAt: Date.now(), remainingSeconds: 1000 } }, res, error => { throw error; });
    assert.equal(res.body.data.pending, 6);
    assert.equal(res.body.data.concurrency, 100);
    assert.doesNotMatch(JSON.stringify(res.body.data), /userId|assetId|filename|objectKey/);
  } finally {
    await VideoJob.deleteMany({ key: { $in: keys } });
    for (const row of waiting) await VideoJob.updateOne({ _id: row._id }, { $set: { runAfter: row.runAfter } });
  }
});

test('100 photographers remain visible behind a large queue and occupied account slots do not wake extra workers', async () => {
  const waiting = await VideoJob.find({ state: { $in: ['queued', 'running'] } }).select('_id runAfter').lean();
  await VideoJob.updateMany({ _id: { $in: waiting.map(row => row._id) } }, { $set: { runAfter: new Date(Date.now() + 86400_000) } });
  const prefix = 'hundred-photographers:' + crypto.randomUUID() + ':';
  const rows = Array.from({ length: 150 }, (_, index) => ({ key: prefix + index, userId: owner._id, assetId: new mongoose.Types.ObjectId(), type: 'prepare', runAfter: new Date(0) }));
  for (let index = 0; index < 100; index++) rows.push({ key: prefix + 'other-' + index, userId: new mongoose.Types.ObjectId(), assetId: new mongoose.Types.ObjectId(), type: 'prepare', runAfter: new Date(0) });
  try {
    await VideoJob.insertMany(rows);
    const report = async () => { const res = response(); await videoProcessingStatus({ body: { verifiedAt: Date.now(), remainingSeconds: 8640000 } }, res, error => { throw error; }); return res.body.data; };
    assert.equal((await report()).pending, 100);
    await VideoJob.updateMany({ key: { $in: rows.slice(0, 10).map(row => row.key) } }, { $set: { state: 'running', leaseUntil: new Date(Date.now() + 120000) } });
    assert.equal((await report()).pending, 100, 'A busy account must not hide other photographers behind the first hundred jobs.');
    await VideoJob.deleteMany({ key: { $in: rows.slice(150).map(row => row.key) } });
    assert.equal((await report()).pending, 0, 'A full account has no spare slots even when it has many queued jobs.');
    await VideoJob.deleteMany({ key: { $in: rows.slice(0, 10).map(row => row.key) } });
    assert.equal((await report()).pending, 10);
    const duplicate = { key: prefix + 'duplicate', userId: owner._id, assetId: rows[10].assetId, type: 'poster', runAfter: new Date(0) };
    await VideoJob.deleteMany({ key: { $in: rows.slice(11, 150).map(row => row.key) } });
    await VideoJob.create(duplicate);
    const result = await report(); assert.equal(result.pending, 1, 'Two jobs for one asset need only one worker.');
    assert.doesNotMatch(JSON.stringify(result), /userId|assetId|filename|objectKey/);
  } finally {
    await VideoJob.deleteMany({ key: { $regex: '^' + prefix } });
    for (const row of waiting) await VideoJob.updateOne({ _id: row._id }, { $set: { runAfter: row.runAfter } });
  }
});

test('processing status applies the measured database limit before returning worker admission', async t => {
  const admin = t.mock.method(mongoose.connection.db, 'admin', () => ({ serverStatus: async () => ({ connections: { current: 27, available: 473 } }) }));
  try {
    await getVideoProcessingCapacity(settings, { fresh: true });
    const res = response();
    await videoProcessingStatus({ body: { verifiedAt: Date.now(), remainingSeconds: 1000 } }, res, error => { throw error; });
    assert.equal(res.body.data.concurrency, 100);
    assert.ok(res.body.data.pending <= 100);
    assert.equal(res.body.data.diagnostics.capacity.configuredConcurrency, 100);
    assert.equal(res.body.data.diagnostics.capacity.databaseConnections, 500);
    assert.equal(res.body.data.diagnostics.capacity.limitedBy, null);
    const heartbeat = await WorkerHeartbeat.findOne({ workerName: 'video-coordinator', instance: 'cloudflare' }).lean();
    assert.equal(heartbeat.details.capacity.concurrency, 100);
    assert.doesNotMatch(JSON.stringify(res.body.data), /userId|assetId|filename|objectKey|mongodb:/);
  } finally {
    admin.mock.restore();
    await getVideoProcessingCapacity(settings, { fresh: true });
  }
});

test('a repeatedly crashed encode stops at its attempt limit before another expensive preparation', async () => {
  // Isolate the due queue from jobs retained by the preceding integration cases.
  await VideoJob.updateMany({}, { $set: { runAfter: new Date(Date.now() + 86400_000) } });
  const film = await asset();
  await VideoAsset.updateOne({ _id: film._id }, { $set: { state: 'queued' } });
  const job = await VideoJob.create({ key: 'crash-limit:' + film._id, userId: owner._id, assetId: film._id, type: 'prepare', state: 'running', leaseToken: 'expired-owner', leaseUntil: new Date(0), attempts: 6, runAfter: new Date(0) });
  assert.equal(await runVideoJob(), true);
  const result = await VideoJob.findById(job._id);
  assert.equal(result.state, 'failed');
  assert.equal(result.errorCode, 'VIDEO_RETRY_LIMIT');
  assert.equal(result.attempts, 7);
  assert.equal((await VideoAsset.findById(film._id)).state, 'failed');
});

for (const mode of ['original', 'adaptive']) for (const preview of [false, true]) test(`${mode} ${preview ? 'preview' : 'client'} session renews its lease without changing the media URL`, async () => {
  const film = await asset(); const project = await delivery(film);
  project.video.draft.playbackMode = mode; project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const media = await videoPlayback({ delivery: project, asset: film, settings, preview });
  const token = new URL(media.hlsUrl).pathname.split('/')[2];
  assert.ok(await verifyVideoToken(token, playbackSecret));
  await VideoPlayback.updateOne({ _id: media.sessionId }, { $set: { expiresAt: new Date(Date.now() + 20000) } });
  const renewed = await videoPlayback({ delivery: project, asset: film, settings, preview, sessionId: media.sessionId });
  assert.equal(renewed.hlsUrl, media.hlsUrl); assert.equal(renewed.sessionId, media.sessionId);
  assert.ok(renewed.expiresAt.getTime() > Date.now() + 500000);
  const input = { token, file: mode === 'original' ? 'original' : 'master.m3u8', method: 'HEAD' };
  await authorizeHlsRequest(input);
  await VideoPlayback.updateOne({ _id: media.sessionId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.ok(await verifyVideoToken(token, playbackSecret), 'The stable URL alone must not grant access.');
  await assert.rejects(authorizeHlsRequest(input), { code: 'VIDEO_SESSION_EXPIRED' });
});

test('lossless original HLS uses its own immutable files and counts segment time', async t => {
  const film = await asset(); const version = crypto.randomUUID();
  film.originalPlayback = { state: 'ready', version, bytes: 1234, hls: { ...film.hls.toObject(), version, prefix: `veylo/video/${owner._id}/${film._id}/original-playback/${version}/` } }; await film.save();
  const project = await delivery(film); project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const media = await videoPlayback({ delivery: project, asset: film, settings });
  const token = new URL(media.hlsUrl).pathname.split('/')[2]; const claims = verifyHlsToken(token);
  assert.equal(claims.purpose, 'video-original'); assert.equal(claims.format, 'hls'); assert.equal(claims.version, version);
  assert.ok(await verifyVideoToken(token, playbackSecret));
  const before = (await VideoUsage.findById(usageKey(owner._id, lagosMonthWindow().start))).deliveredMinutes;
  const grant = await authorizeHlsRequest({ token, file: 'q360/s000000.ts', method: 'GET' });
  assert.equal(grant.key, film.originalPlayback.hls.prefix + 'q360/s000000.ts');
  const after = (await VideoUsage.findById(usageKey(owner._id, lagosMonthWindow().start))).deliveredMinutes;
  assert.ok(Math.abs(after - before - .1) < .000001);
  await assert.rejects(authorizeHlsRequest({ token, file: 'original', method: 'GET' }), { status: 404 });
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: grant }));
  const env = { VIDEO_PLAYBACK_SECRET: playbackSecret, VEYLO_WEB_ORIGIN: process.env.CLIENT_URL, VEYLO_API_ORIGIN: 'https://api.example', DELIVERY_MEDIA: { async get(key) { reads++; assert.equal(key, grant.key); return { size: grant.bytes, body: new Blob([new Uint8Array(grant.bytes)]).stream() }; } } };
  const response = await handleVideoHls(new Request(media.hlsUrl.replace('master.m3u8', 'q360/s000000.ts')), env);
  assert.equal(response.status, 200); await response.body.cancel(); assert.equal(reads, 1);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: { ...grant, key: film.hls.prefix + 'q360/s000000.ts' } }));
  assert.equal((await handleVideoHls(new Request(media.hlsUrl.replace('master.m3u8', 'q360/s000000.ts')), env)).status, 503); assert.equal(reads, 1);
});

test('native lossless playback bills its actual copy bytes and preserves an already active original session', async () => {
  const film = await asset(); const project = await delivery(film); project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const active = await videoPlayback({ delivery: project, asset: film, settings });
  await Promise.all([queueOriginalPlayback(film), queueOriginalPlayback(film)]);
  assert.equal(await VideoJob.countDocuments({ assetId: film._id, 'options.originalPlayback': true }), 1);
  assert.equal((await VideoAsset.findById(film._id)).state, 'ready');
  const version = crypto.randomUUID();
  film.originalPlayback = { state: 'ready', version, key: `veylo/video/${owner._id}/${film._id}/original-playback/${version}/playback.mp4`, bytes: 200, contentType: 'video/mp4' }; await film.save();
  assert.equal((await videoPlayback({ delivery: project, asset: film, settings, sessionId: active.sessionId })).hlsUrl, active.hlsUrl);
  const media = await videoPlayback({ delivery: project, asset: film, settings });
  const token = new URL(media.hlsUrl).pathname.split('/')[2];
  const before = (await VideoUsage.findById(usageKey(owner._id, lagosMonthWindow().start))).deliveredMinutes;
  const grant = await authorizeHlsRequest({ token, file: 'original', method: 'GET', range: 'bytes=0-19' });
  assert.equal(grant.bytes, 200); assert.equal(grant.key, film.originalPlayback.key);
  const after = (await VideoUsage.findById(usageKey(owner._id, lagosMonthWindow().start))).deliveredMinutes;
  assert.ok(Math.abs(after - before - .1) < .000001);
  assert.equal(originalVideoRange('bytes=0-', 100 * 1024 ** 2).length, ORIGINAL_RANGE_BYTES);
  assert.deepEqual(originalVideoRange('bytes=10-19', 100), { offset: 10, length: 10 });
});

test('an exhausted lossless preparation retry leaves the original ready and downloadable', async () => {
  await VideoJob.updateMany({}, { $set: { runAfter: new Date(Date.now() + 86400_000) } });
  const film = await asset(); const generation = crypto.randomUUID();
  await VideoAsset.updateOne({ _id: film._id }, { $set: { originalPlayback: { state: 'running', generation } } });
  const job = await VideoJob.create({ key: 'original-crash:' + film._id, userId: owner._id, assetId: film._id, type: 'prepare', options: { originalPlayback: true, generation }, state: 'running', leaseUntil: new Date(0), attempts: 6, runAfter: new Date(0) });
  assert.equal(await runVideoJob(), true);
  assert.equal((await VideoJob.findById(job._id)).state, 'failed');
  const ready = await VideoAsset.findById(film._id); assert.equal(ready.state, 'ready'); assert.equal(ready.originalPlayback.state, 'failed');
});

test('original playback backfill skips incompatible files before its batch limit and recovers an enqueue gap', async () => {
  // Keep previous cases out of this maintenance batch without deleting records.
  await VideoAsset.updateMany({ state: 'ready' }, { $set: { 'originalPlayback.state': 'failed' } });
  const incompatible = Array.from({ length: 100 }, (_, index) => {
    const id = new mongoose.Types.ObjectId();
    return { _id: id, userId: owner._id, objectKey: `veylo/video/${owner._id}/${id}/original.mp4`, filename: 'incompatible.mp4', state: 'ready', bytes: 1, duration: 1, videoCodec: 'h264', pixelFormat: index < 50 ? 'yuv420p10le' : 'yuv420p', audioCodec: index < 50 ? 'aac' : 'flac' };
  });
  await VideoAsset.insertMany(incompatible);
  const film = await asset(); const project = await delivery(film); project.status = 'published'; project.video.published = project.video.draft; await project.save();
  await reconcileVideoLibrary();
  const job = await VideoJob.findOne({ assetId: film._id, 'options.originalPlayback': true });
  assert.ok(job); assert.equal(job.state, 'queued');
  assert.equal(await VideoJob.countDocuments({ assetId: { $in: incompatible.map(row => row._id) }, 'options.originalPlayback': true }), 0);
  // A completed stale job must not prevent recovery of the durable queued state.
  await VideoJob.updateOne({ _id: job._id }, { $set: { state: 'done' } });
  await reconcileVideoLibrary();
  assert.equal(await VideoJob.countDocuments({ assetId: film._id, 'options.originalPlayback': true, state: 'queued' }), 1);
  assert.equal((await VideoAsset.findById(film._id)).state, 'ready');
});
test('retired playback cleanup keeps active sessions and removes only expired asset-owned versions', async t => {
  const film = await automaticAsset(), project = await delivery(film); const activeVersion = crypto.randomUUID(), expiredVersion = crypto.randomUUID(), unsafeVersion = crypto.randomUUID();
  const base = film.objectKey.replace(/original\.mp4$/, 'hls/'); const retiredAt = new Date(Date.now() - 7 * 3600_000);
  await VideoAsset.updateOne({ _id: film._id }, { $set: { previousHls: [
    { version: activeVersion, prefix: base + activeVersion + '/', retiredAt },
    { version: expiredVersion, prefix: base + expiredVersion + '/', retiredAt },
    { version: unsafeVersion, prefix: 'another-account/hls/', retiredAt },
  ] } });
  await VideoPlayback.create({ _id: crypto.randomUUID(), userId: owner._id, deliveryId: project._id, assetId: film._id, mediaVersion: activeVersion, expiresAt: new Date(Date.now() + 600000) });
  const prefixes = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.method || 'GET', 'GET'); prefixes.push(new URL(url).searchParams.get('prefix'));
    return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>');
  });
  await reconcileVideoLibrary();
  assert.deepEqual(prefixes, [base + expiredVersion + '/']);
  const saved = await VideoAsset.findById(film._id);
  assert.deepEqual(saved.previousHls.map(row => row.version), [activeVersion, unsafeVersion]); assert.equal(saved.hls.version, film.hls.version);
});
test('a new quality version keeps earlier Auto playback available and retries an old failure once behind existing jobs', async () => {
  const film = await asset(); film.hls.ladderVersion = 2; film.adaptive = { state: 'failed', qualityVersion: 2 }; await film.save();
  const project = await delivery(film); project.status = 'published'; project.video.published = project.video.draft; await project.save();
  const playing = await videoPlayback({ delivery: project, asset: film, settings }); assert.equal(playing.playbackMode, 'adaptive');
  const dto = await ownerVideoDTO(project); assert.equal(dto.assets[0].autoPlayback, true); assert.equal(dto.assets[0].playbackReady, false);
  await reconcileVideoLibrary();
  const queued = await VideoAsset.findById(film._id); assert.equal(queued.adaptive.state, 'queued'); assert.equal(queued.adaptive.qualityVersion, VIDEO_QUALITY_VERSION);
  assert.equal(await VideoJob.countDocuments({ assetId: film._id, 'options.adaptive': true }), 1);
  await VideoAsset.updateOne({ _id: film._id }, { $set: { 'adaptive.state': 'failed' } });
  await VideoJob.updateMany({ assetId: film._id, 'options.adaptive': true }, { $set: { state: 'failed' } });
  await reconcileVideoLibrary(); assert.equal(await VideoJob.countDocuments({ assetId: film._id, 'options.adaptive': true }), 1);
  await authorizeHlsRequest({ token: new URL(playing.hlsUrl).pathname.split('/')[2], file: 'q360/s000000.ts', method: 'HEAD' });
});
