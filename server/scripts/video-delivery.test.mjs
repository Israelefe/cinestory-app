import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import Delivery from '../src/models/Delivery.js';
import WorkerHeartbeat from '../src/models/WorkerHeartbeat.js';
import { VideoAsset, VideoQuota, VideoUsage, VideoPlayback, ensureVideoIndexes } from '../src/models/video.models.js';
import { videoTransaction, reserveVideoBytes, commitVideoBytes, reserveVideoDuration, commitVideoDuration, releaseVideoQuota, storageCapacityFilter, reconcileVideoQuota } from '../src/services/videoQuota.service.js';
import { acquireVideoLease, releaseVideoLease } from '../src/services/videoLease.service.js';
import { normalizeVideoSettings, publicVideoSettings } from '../src/config/videoDelivery.js';
import { updateRuntimeConfig } from '../src/services/runtimeConfig.service.js';
import { videoContext, ownedVideoAsset, publicVideoDelivery, ownerVideoDTO, videoPresentationDTO, hasVideoGrant, setVideoGrant, videoPlayback, usageKey } from '../src/services/videoDelivery.service.js';
import { publishVideoDelivery, saveVideoDraft, saveVideoAccess, validatedVideoRange, deleteVideoAsset, downloadOwnerVideo, initializeVideoUpload, completeVideoUpload } from '../src/controllers/video.controller.js';
import { signedStreamMedia, verifyStreamWebhook, getStreamMinutes, streamCreator } from '../src/services/videoProvider.service.js';
import { frameTimestamps } from '../src/services/videoMedia.service.js';
import { lagosMonthWindow } from '../src/services/entitlement.service.js';
import { chargeVideoAIBudget } from '../src/services/videoAnalysis.service.js';
import { deleteVideoOriginal } from '../src/services/videoWorker.service.js';
import { handleVideoDownload } from '../../client/worker/videoDownload.js';
import { VideoUpload } from '../src/models/video.models.js';

let database, owner, outsider;
const settings = normalizeVideoSettings({ enabled: true });
const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const previousEnv = { ...process.env };
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'video-tests-only-not-a-production-secret', R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test', CLOUDFLARE_STREAM_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_STREAM_API_TOKEN: 'test', CLOUDFLARE_STREAM_CUSTOMER_CODE: 'test', CLOUDFLARE_STREAM_KEY_ID: 'testkey', CLOUDFLARE_STREAM_PRIVATE_KEY: key.privateKey.export({ type: 'pkcs8', format: 'pem' }), CLOUDFLARE_STREAM_WEBHOOK_SECRET: 'test-webhook', VIDEO_MEDIA_WORKER_ENABLED: 'true' });
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
async function asset() { const id = new mongoose.Types.ObjectId(); return VideoAsset.create({ _id: id, userId: owner._id, objectKey: `test/${id}/original.mp4`, filename: 'finished-film.mp4', bytes: 100, duration: 60, width: 1920, height: 1080, state: 'ready', streamUid: 'b'.repeat(32), posterKey: `test/${id}/poster.webp` }); }
async function delivery(film) { return Delivery.create({ userId: owner._id, kind: 'video', video: { draft: { title: 'Wedding films', items: [{ assetId: film._id, title: 'The ceremony', description: 'The complete ceremony.', allowDownload: null }], featuredAssetId: film._id, allowDownloads: false } } }); }

test('limits stay within the approved upload ceiling and availability fails closed', () => {
  assert.throws(() => normalizeVideoSettings({ maxFileBytes: 5_000_000_001 }));
  assert.throws(() => normalizeVideoSettings({ maxVideos: 11 }));
  assert.equal(publicVideoSettings({ ...settings, publicAvailable: true }).available, false);
  assert.equal(publicVideoSettings(settings).aiAvailable, false);
  assert.equal(publicVideoSettings(settings).maxFileBytes, 5_000_000_000);
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
test('ownership and active entitlement checks reject another owner and Free accounts', async () => {
  const film = await asset();
  await assert.rejects(ownedVideoAsset(film._id, outsider._id), { status: 404 });
  await assert.rejects(videoContext(outsider._id, { write: true }), { code: 'VIDEO_PRO_REQUIRED' });
  assert.equal((await videoContext(owner._id, { write: true })).entitlements.plan, 'pro');
});
test('publishing snapshots titles, descriptions and covers; conflicting saves cannot overwrite it', async () => {
  const film = await asset(); const project = await delivery(film);
  const published = response(); await publishVideoDelivery(request(project._id, { revision: 0 }), published);
  assert.equal(published.statusCode, 200, JSON.stringify(published.body));
  let saved = await Delivery.findById(project._id);
  assert.equal(saved.video.published.items[0].posterKey, film.posterKey);
  await VideoAsset.updateOne({ _id: film._id }, { $set: { posterKey: 'test/new-cover.webp' } });
  const input = { revision: saved.video.revision, clientName: '', brief: '', presentation: { title: 'Changed draft', introduction: '', items: [{ assetId: String(film._id), title: 'Changed draft film', description: 'Changed draft caption.', posterSeconds: 0, allowDownload: false }], allowDownloads: false, featuredAssetId: String(film._id) } };
  const edit = response(); await saveVideoDraft(request(project._id, input), edit); assert.equal(edit.statusCode, 200, JSON.stringify(edit.body));
  const conflict = response(); await saveVideoDraft(request(project._id, input), conflict); assert.equal(conflict.statusCode, 409);
  saved = await Delivery.findById(project._id);
  assert.equal(saved.video.published.title, 'Wedding films'); assert.equal(saved.video.published.items[0].description, 'The complete ceremony.'); assert.equal(saved.video.published.items[0].posterKey, film.posterKey);
  const dto = await ownerVideoDTO(saved); assert.doesNotMatch(JSON.stringify(dto), /objectKey|posterKey|streamUid|pinDigest/);
  const client = await videoPresentationDTO(saved, owner); assert.equal(client.items[0].allowDownload, false); assert.doesNotMatch(JSON.stringify(client), /finished-film.mp4|test\//);
  const remove = response(); await deleteVideoAsset({ ...request(project._id), params: { assetId: String(film._id) } }, remove); assert.equal(remove.statusCode, 409);
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
test('provider usage caps prevent new playback but do not change download settings', async () => {
  const film = await asset(); const project = await delivery(film); const { start, end } = lagosMonthWindow();
  await VideoUsage.create({ _id: usageKey(owner._id, start), userId: owner._id, periodStart: start, periodEnd: end, deliveredMinutes: 5000, reconciledAt: new Date() });
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
test('signed credentials forbid Stream downloads and expire within the configured window', () => {
  const now = Date.now(); const media = signedStreamMedia('b'.repeat(32), { now, seconds: 600 });
  const token = new URL(media.hlsUrl).pathname.split('/')[1];
  const payload = jwt.verify(token, key.publicKey, { algorithms: ['RS256'] });
  assert.equal(payload.downloadable, false); assert.equal(payload.sub, 'b'.repeat(32)); assert.equal(payload.exp, Math.floor(now / 1000) + 600);
});
test('webhook authentication uses exact raw bytes and rejects old or altered events', () => {
  const now = Date.now(); const time = String(Math.floor(now / 1000)); const body = Buffer.from('{"uid":"test"}');
  const sig = crypto.createHmac('sha256', 'test-webhook').update(time + '.').update(body).digest('hex'); const header = `time=${time},sig1=${sig}`;
  assert.equal(verifyStreamWebhook(body, header, 'test-webhook', now), true);
  assert.equal(verifyStreamWebhook(Buffer.from('{}'), header, 'test-webhook', now), false);
  assert.equal(verifyStreamWebhook(body, header, 'test-webhook', now + 301_000), false);
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
  const orphan = `test/${film._id}/cover-orphan.webp`; const removed = [];
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
    if (url instanceof Request) return Response.json({ success: true, data: { url: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com/private/original.mp4?signed=test', method: 'GET', range: 'bytes=10-19', bytes: 100, disposition: 'attachment; filename="film.mp4"' } });
    return new Response('0123456789', { status: 206, headers: { 'Content-Length': '10', 'Content-Range': 'bytes 10-19/100' } });
  });
  const req = new Request('https://veylo.example/api/v1/videos/assets/abc/download', { headers: { Cookie: 'private-session', Range: 'bytes=10-19' } });
  const result = await handleVideoDownload(req, new URL('https://api.example/download'), new Headers({ Cookie: 'private-session', 'x-veylo-edge-key': 'private-edge-key' }));
  assert.equal(result.status, 206); assert.equal(await result.text(), '0123456789'); assert.equal(result.headers.get('Content-Range'), 'bytes 10-19/100'); assert.equal(calls[1].options.headers.get('cookie'), null); assert.equal(calls[1].options.headers.get('x-veylo-edge-key'), null); assert.equal(calls[1].options.headers.get('range'), 'bytes=10-19');
});

test('provider usage uses creator-scoped delivered minutes and rejects malformed analytics', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.query, /\$account: string!/);
    assert.match(body.query, /datetime_geq: \$start, datetime_lt: \$end, creator: \$creator/);
    assert.equal(body.variables.creator, streamCreator(owner._id));
    return Response.json({ data: { viewer: { accounts: [{ streamMinutesViewedAdaptiveGroups: [{ sum: { minutesViewed: 82.5 } }] }] } } });
  });
  assert.equal(await getStreamMinutes(owner._id, new Date('2026-09-30T23:00:00Z'), new Date('2026-10-31T23:00:00Z')), 82.5);
  fetch.mock.mockImplementation(async () => Response.json({ data: { viewer: { accounts: [{ streamMinutesViewedAdaptiveGroups: [{}] }] } } }));
  await assert.rejects(getStreamMinutes(owner._id, new Date(), new Date()), /could not be verified/);
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
