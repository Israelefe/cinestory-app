import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Delivery from '../src/models/Delivery.js';
import { VideoAsset, VideoJob, VideoUpload, VideoPreparationSchedule, ensureVideoIndexes } from '../src/models/video.models.js';
import { normalizeVideoSettings } from '../src/config/videoDelivery.js';
import { claimVideoPreparationJob, videoPreparationSummary, backfillVideoPreparations, videoPreparationIdentity } from '../src/services/videoPreparation.service.js';
import { queueVideoJob } from '../src/services/videoDelivery.service.js';

const settings = normalizeVideoSettings({ enabled: true });
const oid = () => new mongoose.Types.ObjectId();
let database;
before(async () => {
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri());
  await ensureVideoIndexes();
  await Delivery.init();
});
after(async () => { await mongoose.disconnect(); await database?.stop(); });
beforeEach(async () => {
  await Promise.all([VideoJob.deleteMany({}), VideoAsset.deleteMany({}), VideoUpload.deleteMany({}), Delivery.deleteMany({}), VideoPreparationSchedule.deleteMany({})]);
});

function files(userId, deliveryId, count = 10) {
  return Array.from({ length: count }, () => {
    const assetId = oid();
    return { key: 'test:' + assetId, userId, deliveryId, preparationId: 'delivery:' + deliveryId,
      assetId, type: 'prepare', state: 'queued', priority: 60, runAfter: new Date(0) };
  });
}
async function claimMany(count, options = settings) {
  // Concurrent calls use the same Mongo transaction boundary as independent
  // encoder processes, rather than a mocked queue or process-local counter.
  return Promise.all(Array.from({ length: count }, () => claimVideoPreparationJob(options)));
}

test('100 deliveries with 10 videos each occupy 100 delivery slots and never exceed 100 encoders', { timeout: 120000 }, async () => {
  const rows = Array.from({ length: 100 }, () => files(oid(), oid())).flat();
  await VideoJob.insertMany(rows);
  const before = await videoPreparationSummary(settings);
  assert.equal(before.activeDeliveries, 0, 'A status read must not admit deliveries.');
  assert.equal(before.waitingDeliveries, 100);
  assert.equal(before.queuedVideos, 1000);
  const claims = await claimMany(100);
  assert.ok(claims.every(Boolean));
  assert.equal(new Set(claims.map(job => String(job.deliveryId))).size, 100, 'Every delivery gets one encoder before another receives a second.');
  assert.equal(new Set(claims.map(job => String(job.assetId))).size, 100);
  assert.equal(await claimVideoPreparationJob(settings), null);
  const summary = await videoPreparationSummary(settings);
  assert.equal(summary.activeDeliveries, 100);
  assert.equal(summary.processingVideos, 100);
  assert.equal(summary.queuedVideos, 900);
  assert.equal(summary.waitingDeliveries, 0);
  assert.equal((await VideoPreparationSchedule.findById('platform')).deliveries.length, 100);
  await VideoJob.updateMany({ _id: { $in: claims.map(job => job._id) } }, { $set: { state: 'done' } });
  const next = await claimMany(100);
  assert.equal(new Set(next.map(job => String(job.deliveryId))).size, 100);
  assert.ok(next.every(job => !claims.some(old => String(old.assetId) === String(job.assetId))), 'Finished files are not encoded again.');
});

test('one delivery can borrow ten spare encoders while occupying only one preparation slot', async () => {
  await VideoJob.insertMany(files(oid(), oid()));
  const claims = await claimMany(10);
  assert.ok(claims.every(Boolean));
  const summary = await videoPreparationSummary(settings);
  assert.equal(summary.activePreparations, 1);
  assert.equal(summary.activeDeliveries, 1);
  assert.equal(summary.processingVideos, 10);
  assert.equal(summary.pending, 0);
});

test('delivery admission remains bounded until a delivery finishes, fails or pauses for retry', async () => {
  const options = { ...settings, preparationConcurrency: 2 };
  const rows = Array.from({ length: 3 }, () => files(oid(), oid(), 2)).flat();
  await VideoJob.insertMany(rows);
  const first = await claimMany(4, options);
  assert.ok(first.every(Boolean));
  assert.equal(new Set(first.map(job => String(job.deliveryId))).size, 2);
  assert.equal(await claimVideoPreparationJob(options), null);
  assert.equal((await videoPreparationSummary(options)).waitingDeliveries, 1);
  await VideoJob.updateMany({ deliveryId: first[0].deliveryId }, { $set: { state: 'failed' } });
  const next = await claimVideoPreparationJob(options);
  assert.ok(next);
  assert.ok(!first.some(job => String(job.deliveryId) === String(next.deliveryId)));
  const summary = await videoPreparationSummary(options);
  assert.equal(summary.activeDeliveries, 2);
  await VideoJob.updateMany({}, { $set: { state: 'queued', runAfter: new Date(Date.now() + 3600000) } });
  assert.equal(await claimVideoPreparationJob(options), null);
  assert.equal((await videoPreparationSummary(options)).activeDeliveries, 0, 'Delayed retries do not hold an idle preparation slot.');
  assert.equal((await videoPreparationSummary(options)).queuedVideos, 6, 'Delayed videos remain visible as waiting work.');
});

test('many deliveries from one photographer cannot hide another photographer and borrowed encoders finish naturally', async () => {
  const busyOwner = oid();
  const otherOwner = oid();
  const rows = Array.from({ length: 20 }, () => files(busyOwner, oid(), 10)).flat();
  rows.push(...files(otherOwner, oid(), 10));
  await VideoJob.insertMany(rows);
  const first = await claimVideoPreparationJob(settings);
  const second = await claimVideoPreparationJob(settings);
  assert.notEqual(String(first.userId), String(second.userId));
  const rest = (await claimMany(25)).filter(Boolean);
  const all = [first, second, ...rest];
  assert.equal(all.filter(job => String(job.userId) === String(busyOwner)).length, 10);
  assert.equal(all.filter(job => String(job.userId) === String(otherOwner)).length, 10);
  const newcomer = files(oid(), oid(), 10);
  await VideoJob.insertMany(newcomer);
  const next = await claimVideoPreparationJob(settings);
  assert.equal(String(next.deliveryId), String(newcomer[0].deliveryId));
});

test('expired file claims recover with a new token without repeating another live file', async () => {
  await VideoJob.insertMany(files(oid(), oid(), 1));
  const original = await claimVideoPreparationJob(settings);
  assert.equal(await claimVideoPreparationJob(settings), null);
  await VideoJob.updateOne({ _id: original._id }, { $set: { leaseUntil: new Date(0) } });
  const recovered = await claimVideoPreparationJob(settings);
  assert.equal(String(recovered._id), String(original._id));
  assert.notEqual(recovered.leaseToken, original.leaseToken);
  assert.equal(recovered.attempts, 2);
  assert.equal((await videoPreparationSummary(settings)).activeDeliveries, 1);
});

test('waiting deliveries from a busy photographer cannot reserve every delivery slot in advance', async () => {
  const owner = oid();
  await VideoJob.insertMany(Array.from({ length: 100 }, () => files(owner, oid(), 2)).flat());
  assert.ok((await claimMany(10)).every(Boolean));
  assert.equal((await videoPreparationSummary(settings)).activeDeliveries, 10);
  const newcomer = files(oid(), oid(), 1);
  await VideoJob.insertMany(newcomer);
  const next = await claimVideoPreparationJob(settings);
  assert.equal(String(next.deliveryId), String(newcomer[0].deliveryId));
});

test('inspection, playback and cover jobs share one parent and cannot process the same asset together', async () => {
  const [file] = files(oid(), oid(), 1);
  await VideoJob.create(file);
  await VideoJob.create({ ...file, key: file.key + ':cover', type: 'poster' });
  assert.equal((await videoPreparationSummary(settings)).pending, 1);
  const first = await claimVideoPreparationJob(settings);
  assert.equal(await claimVideoPreparationJob(settings), null);
  await VideoJob.updateOne({ _id: first._id }, { $set: { state: 'done' } });
  const cover = await claimVideoPreparationJob(settings);
  assert.equal(cover.type, 'poster');
  await VideoJob.updateOne({ _id: cover._id }, { $set: { state: 'done' } });
  await VideoJob.create({ ...file, key: file.key + ':playback', options: { adaptive: true, generation: 'test' }, priority: 20 });
  const playback = await claimVideoPreparationJob(settings);
  assert.equal(String(playback.deliveryId), String(first.deliveryId));
  assert.equal((await videoPreparationSummary(settings)).activeDeliveries, 1);
});

test('encoding limits are separate from delivery slots and cleanup runs while preparation is disabled', async () => {
  await VideoJob.insertMany([files(oid(), oid(), 2), files(oid(), oid(), 2)].flat());
  const options = { ...settings, platformEncodes: 1 };
  assert.ok(await claimVideoPreparationJob(options));
  assert.equal(await claimVideoPreparationJob(options), null);
  const assetId = oid();
  await VideoJob.create({ key: 'cleanup:' + assetId, userId: oid(), assetId, type: 'delete', state: 'queued', runAfter: new Date(0) });
  const cleanup = await claimVideoPreparationJob({ ...options, enabled: false });
  assert.equal(cleanup.type, 'delete');
  assert.equal(await claimVideoPreparationJob({ ...options, enabled: false }), null);
  assert.equal((await videoPreparationSummary({ ...options, enabled: false })).activeDeliveries, 1, 'Only the already running delivery retains its slot during a pause.');
});

test('legacy jobs retain progress and use an owned delivery; cross-account associations are rejected', async () => {
  const owner = oid(); const outsider = oid(); const assetId = oid();
  const delivery = await Delivery.create({ userId: owner, kind: 'video', video: { draft: { items: [{ assetId }] } } });
  const other = await Delivery.create({ userId: outsider, kind: 'video' });
  await VideoUpload.create({ userId: owner, deliveryId: other._id, assetId, requestKey: 'legacy', state: 'completed' });
  const asset = { _id: assetId, userId: owner };
  assert.equal(String((await videoPreparationIdentity(asset)).deliveryId), String(delivery._id));
  const job = await VideoJob.create({ key: 'legacy:' + assetId, userId: owner, assetId, type: 'prepare', state: 'queued', attempts: 3, options: { adaptive: true, generation: 'saved' }, runAfter: new Date(0) });
  await backfillVideoPreparations();
  const saved = await VideoJob.findById(job._id);
  assert.equal(String(saved.deliveryId), String(delivery._id));
  assert.equal(saved.attempts, 3);
  assert.equal(saved.options.generation, 'saved');
  const first = await queueVideoJob(asset, 'prepare', { adaptive: true, generation: 'reuse' }, 'reuse');
  const reused = await queueVideoJob(asset, 'prepare', { adaptive: true, generation: 'reuse' }, 'reuse');
  assert.equal(String(first._id), String(reused._id));
  assert.equal(first.preparationId, 'delivery:' + delivery._id);
  await VideoUpload.updateOne({ assetId }, { $set: { deliveryId: delivery._id } });
  await Delivery.updateOne({ _id: delivery._id }, { $set: { 'video.draft.items': [] } });
  const current = await Delivery.create({ userId: owner, kind: 'video', video: { draft: { items: [{ assetId }] } } });
  assert.equal(String((await videoPreparationIdentity(asset)).deliveryId), String(current._id), 'A removed video belongs to its current delivery, rather than the old upload destination.');
});
