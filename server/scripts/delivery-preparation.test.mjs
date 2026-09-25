import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Delivery from '../src/models/Delivery.js';
import Run from '../src/models/DeliveryPreparation.js';
import Task from '../src/models/DeliveryTask.js';
import Revision from '../src/models/DeliveryRevision.js';
import Observation from '../src/models/DeliveryObservation.js';
import Slot from '../src/models/DeliveryProviderSlot.js';
import User from '../src/models/User.js';
import DeliveryUsage from '../src/models/DeliveryUsage.js';
import { cloudinary } from '../src/services/cloudinary.service.js';
import { assemblePresentation, observationKey, FORMATS } from '../src/services/deliveryPresentation.js';
import { observeUploads, startPreparation, startRevisionTask, processTaskBatch, finishPreparations, recoverTasks, preparationStatus, cancelPreparation, createRevision } from '../src/services/deliveryPreparation.service.js';
import { prepareDelivery, editPresentation, publishPresentation } from '../src/controllers/deliveryPreparation.controller.js';
import { getPublicDelivery, confirmDeliveryUpload, recoverDeliveryUpload } from '../src/controllers/delivery.controller.js';
import { captionSegments } from '../src/services/narration.service.js';

// This suite only connects to its own temporary database. It never reads .env.
Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'delivery-test', CLOUDINARY_API_KEY: 'test', CLOUDINARY_API_SECRET: 'test-secret', JWT_SECRET: 'test-secret-for-isolated-delivery-tests-only', ALIBABA_MODEL_STUDIO_API_KEY: 'test', ALIBABA_BASE_URL: 'https://test.aliyuncs.com/v1', DELIVERY_AI_START_INTERVAL_MS: '100', CLIENT_URL: 'https://test.example', DELIVERY_AI_CONCURRENCY: '4' });
let mongo, stats, behavior;
const realFetch = globalThis.fetch;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: resolve('../.runtime/mongodb') } });
  await mongoose.connect(mongo.getUri(), { dbName: 'delivery_rebuild_test' });
  await Promise.all([Delivery, Run, Task, Revision, Observation, Slot, User, DeliveryUsage].map(model => model.init()));
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/test\.aliyuncs\.com\//, 'No external network calls in the integration suite');
    const body = JSON.parse(options.body), content = body.messages[1].content;
    if (Array.isArray(content)) {
      const ids = JSON.parse(content[0].text).ids;
      stats.visionImages += ids.length; stats.visionCalls++;
      const photographs = ids.map(id => ({ id, description: 'A person in a studio portrait.', group: 'Studio portraits', emphasis: 3 }));
      if (behavior === 'missing-one' && !stats.omitted) { photographs.pop(); stats.omitted = true; }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ photographs }) } }] }));
    }
    stats.textCalls++;
    const input = JSON.parse(content);
    if (behavior === 'writing-down') return new Response('{}', { status: 503 });
    const output = input.caption !== undefined ? { caption: 'A birthday celebration for Ada as she turns 30.' } : { title: 'Ada at 30', openingLine: '', closingLine: '', beats: [{ position: 0, text: 'Celebrating Ada and her 30th birthday.' }] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  };
});
beforeEach(async () => {
  await Promise.all([Delivery, Run, Task, Revision, Observation, Slot, User, DeliveryUsage].map(model => model.deleteMany({})));
  stats = { visionImages: 0, visionCalls: 0, textCalls: 0 }; behavior = 'normal';
});
after(async () => { globalThis.fetch = realFetch; await delay(100); await mongoose.disconnect(); await mongo?.stop(); });
async function fixture(count = 10, userId = new mongoose.Types.ObjectId()) {
  await User.updateOne({ _id: userId }, { $setOnInsert: { name: 'Test photographer', email: `${userId}@test.example`, plan: 'pro', planOverride: { plan: 'pro' }, accountStatus: 'active' } }, { upsert: true });
  const _id = new mongoose.Types.ObjectId();
  return Delivery.create({ _id, userId, schemaVersion: 3, clientName: 'Ada', shootType: 'Birthday', brief: 'Ada’s 30th birthday shoot', sourceVersion: 1,
    assets: Array.from({ length: count }, (_, i) => ({ assetId: crypto.randomUUID(), publicId: `veylo/users/${userId}/deliveries/${_id}/${i}`, width: i % 2 ? 1600 : 1000, height: i % 2 ? 1000 : 1600, bytes: 1000, format: 'jpg', sortOrder: i, contentHash: `photo-${i}`, hashAlgorithm: 'sha256', hashVerifiedAt: new Date() })) });
}
async function drain(run) {
  for (let i = 0; i < 120; i++) {
    await Task.updateMany({ state: 'queued' }, { availableAt: new Date() });
    await Promise.all(Array.from({ length: 4 }, () => processTaskBatch()));
    await finishPreparations();
    const updated = await Run.findById(run._id);
    if (updated.state !== 'working') return updated;
    await delay(110);
  }
  assert.fail('Preparation did not reach a terminal state');
}
async function invoke(handler, delivery, body = {}, userId = delivery.userId, extra = {}) {
  const req = { user: { id: String(userId) }, params: { id: String(delivery._id), publicId: delivery.publicId }, body, query: {}, cookies: {}, originalUrl: '/test', get: name => name === 'user-agent' ? 'whatsapp' : '', ...extra };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, set() { return this; }, cookie() { return this; } };
  await handler(req, res); return res;
}

test('all formats bound presentation size and retain all original photographs; ten-photo stories use ten', async () => {
  const delivery = await fixture(100);
  for (const format of FORMATS) {
    const result = assemblePresentation({ ...delivery.toObject(), format });
    assert.equal(result.assets.length, 100); assert.equal(result.galleryOrder.length, 100);
    assert.ok(result.presentationOrder.length <= 30);
    assert.equal(new Set(result.presentationOrder).size, result.presentationOrder.length);
    assert.ok(result.creativeDirection.frames.every(frame => frame.caption === ''));
  }
  const ten = assemblePresentation({ ...(await fixture(10)).toObject(), format: 'photo-story' });
  assert.equal(ten.presentationOrder.length, 10);
});
test('100-photo preparation scans originals once and caption regeneration reuses observations', async () => {
  let delivery = await fixture(100);
  await Promise.all([observeUploads(delivery), observeUploads(delivery)]);
  assert.equal(await Task.countDocuments({ kind: 'observe' }), 100);
  const run = await startPreparation(delivery, 'photo-story');
  assert.equal((await drain(run)).state, 'ready');
  delivery = await Delivery.findById(delivery._id);
  assert.equal(delivery.presentationOrder.length, 12); assert.equal(stats.visionImages, 100);
  const count = stats.visionImages;
  const captionRun = await startRevisionTask(delivery, 'caption', { revisionId: String(delivery.draftRevisionId), assetId: delivery.presentationOrder[0] });
  assert.equal((await drain(captionRun)).state, 'ready'); assert.equal(stats.visionImages, count);
  const switchRun = await startPreparation(await Delivery.findById(delivery._id), 'editorial', String((await Delivery.findById(delivery._id)).draftRevisionId));
  await drain(switchRun); assert.equal(stats.visionImages, count);
});
test('partial vision output retries only the missing photograph', async () => {
  behavior = 'missing-one';
  const delivery = await fixture(8), run = await startPreparation(delivery, 'photo-story');
  await drain(run); assert.equal(stats.visionImages, 9); assert.equal(await Observation.countDocuments({}), 8);
});
test('provider failure leaves a complete reviewable presentation without canned captions or raw errors', async () => {
  behavior = 'writing-down';
  const delivery = await fixture(10), run = await startPreparation(delivery, 'photo-story');
  assert.equal((await drain(run)).state, 'available');
  const updated = await Delivery.findById(delivery._id);
  assert.equal(updated.assets.length, 10); assert.ok(updated.creativeDirection.frames.every(frame => !frame.caption));
  const status = await preparationStatus(updated);
  assert.doesNotMatch(JSON.stringify(status), /AI_HTTP|leaseToken|diagnostic|publicId/);
});
test('old worker results cannot overwrite a newer brief, edit, or cancelled run', async () => {
  const delivery = await fixture(1), run = await startPreparation(delivery, 'photo-story');
  await Delivery.updateOne({ _id: delivery._id }, { $inc: { sourceVersion: 1 }, $set: { brief: 'Ada’s 30th birthday, with a quiet personal tone.' } });
  await finishPreparations(); assert.equal((await Run.findById(run._id)).state, 'superseded');
  const latest = await Delivery.findById(delivery._id);
  await assert.rejects(createRevision(delivery, assemblePresentation({ ...delivery.toObject(), format: 'album' }), 'ai'), /newer changes/);
  const again = await startPreparation(latest, 'photo-story', String(latest.draftRevisionId));
  await cancelPreparation(await Delivery.findById(delivery._id));
  await finishPreparations(); assert.equal((await Run.findById(again._id)).state, 'cancelled');
});
test('expired task leases recover once and then settle unavailable', async () => {
  const delivery = await fixture(1); await observeUploads(delivery);
  await Task.updateOne({}, { state: 'running', attempts: 1, leaseToken: 'old-worker', leaseUntil: new Date(0) });
  await recoverTasks(); assert.equal((await Task.findOne({})).state, 'queued');
  await Task.updateOne({}, { state: 'running', attempts: 2, leaseUntil: new Date(0) });
  await recoverTasks(); assert.equal((await Task.findOne({})).state, 'unavailable');
});
test('publication remains on its approved snapshot after draft edits and private data stays private', async () => {
  let delivery = await fixture(10); await drain(await startPreparation(delivery, 'photo-story'));
  delivery = await Delivery.findById(delivery._id);
  const response = await invoke(publishPresentation, delivery, { revisionId: String(delivery.draftRevisionId), narration: false });
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  const published = await Delivery.findById(delivery._id); const publishedId = published.publishedRevisionId;
  const snapshot = (await Revision.findById(published.draftRevisionId)).snapshot;
  snapshot.title = 'Private draft title';
  await createRevision(published, snapshot, 'edited', { draftRevisionId: published.draftRevisionId });
  const publicResponse = await invoke(getPublicDelivery, published);
  assert.equal(publicResponse.body.data.title, 'Ada at 30');
  assert.equal(publicResponse.body.data.brief, undefined); assert.equal(publicResponse.body.data.draftRevisionId, undefined);
  assert.equal(String((await Delivery.findById(delivery._id)).publishedRevisionId), String(publishedId));
  assert.equal((await invoke(prepareDelivery, published, { format: 'album' }, new mongoose.Types.ObjectId())).statusCode, 404);
});
test('duplicate upload confirmations are idempotent, including concurrent confirmations', async () => {
  const delivery = await fixture(1), publicId = `veylo/users/${delivery.userId}/deliveries/${delivery._id}/new`;
  const signature = cloudinary.utils.api_sign_request({ public_id: publicId, version: 1 }, process.env.CLOUDINARY_API_SECRET);
  const originalResource = cloudinary.api.resource;
  cloudinary.api.resource = async () => ({ public_id: publicId, format: 'jpg', width: 1000, height: 1500, bytes: 1000, etag: 'new-photo' });
  try {
    const body = { publicId, version: 1, signature, sortOrder: 10, uploadId: 'file-10' };
    const results = await Promise.all([invoke(confirmDeliveryUpload, delivery, body), invoke(confirmDeliveryUpload, delivery, body)]);
    assert.ok(results.every(result => result.statusCode < 300), JSON.stringify(results));
    const updated = await Delivery.findById(delivery._id);
    assert.equal(updated.assets.filter(a => a.publicId === publicId).length, 1);
    assert.equal(updated.assets.find(a => a.publicId === publicId).sortOrder, 10);
  } finally { cloudinary.api.resource = originalResource; }
});
test('blank captions are intentional and narration follows the approved presentation order', () => {
  const segments = captionSegments({ schemaVersion: 3, assets: [{ assetId: 'a', sortOrder: 0 }, { assetId: 'b', sortOrder: 1 }], creativeDirection: { frames: [{ assetId: 'b', caption: 'Ada celebrates turning thirty.' }, { assetId: 'a', caption: '' }] } });
  assert.equal(segments.length, 1); assert.deepEqual(segments[0].assetIds, ['b']);
});
test('cache identity is scoped to the photographer', async () => {
  const delivery = await fixture(1), asset = delivery.assets[0];
  assert.notEqual(observationKey(delivery.userId, asset), observationKey(new mongoose.Types.ObjectId(), asset));
});

test('a queued text task cannot hold preparation beyond its deadline', async () => {
  const delivery = await fixture(3), run = await startPreparation(delivery, 'photo-story');
  await Run.collection.updateOne({ _id: run._id }, { $set: { createdAt: new Date(Date.now() - 56000) } });
  await finishPreparations();
  const result = await Run.findById(run._id);
  assert.equal(result.state, 'available'); assert.equal(result.metrics.fullyPrepared, false);
  assert.equal((await Task.findOne({ runId: run._id })).state, 'cancelled');
  assert.equal((await Delivery.findById(delivery._id)).presentationOrder.length, 3);
});

test('sparse stories can narrate their approved opening and closing without filling empty captions', () => {
  const segments = captionSegments({ schemaVersion: 3, creativeDirection: { openingLine: 'Happy 30th birthday, Ada.', closingLine: '', frames: [{ assetId: 'a', caption: '' }, { assetId: 'b', caption: '' }] } });
  assert.deepEqual(segments.map(segment => ({ text: segment.text, ids: segment.assetIds })), [{ text: 'Happy 30th birthday, Ada.', ids: ['a'] }]);
});

test('an interrupted enqueue is recovered from the durable run without duplicating tasks', async () => {
  const delivery = await fixture(2), run = await startPreparation(delivery, 'photo-story');
  await Task.deleteMany({ runId: run._id });
  await Run.collection.updateOne({ _id: run._id }, { $set: { createdAt: new Date(Date.now() - 6000) } });
  await Promise.all([recoverTasks(), recoverTasks()]);
  assert.equal(await Task.countDocuments({ runId: run._id }), 1);
  assert.equal((await drain(run)).state, 'ready');
});

test('editing a reviewed version preserves the edit when AI finishes in the background', async () => {
  let delivery = await fixture(3); const run = await startPreparation(delivery, 'photo-story');
  const baseline = await Revision.findById(run.baseRevisionId);
  await drain(run); delivery = await Delivery.findById(delivery._id);
  const response = await invoke(editPresentation, delivery, { revisionId: String(baseline._id), title: 'Ada, thirty', openingLine: 'Happy birthday, Ada.', closingLine: '', frames: baseline.snapshot.creativeDirection.frames.map(frame => ({ assetId: frame.assetId, caption: '', durationSec: 4.2 })) });
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.equal((await Delivery.findById(delivery._id)).title, 'Ada, thirty');
  const again = await invoke(editPresentation, delivery, { revisionId: String(baseline._id), title: 'Another tab', openingLine: '', closingLine: '', frames: baseline.snapshot.creativeDirection.frames.map(frame => ({ assetId: frame.assetId, caption: '' })) });
  assert.equal(again.statusCode, 409, 'A newer manual edit cannot be silently replaced');
});

test('publishing uses exactly the reviewed revision and preserves a previously set PIN', async () => {
  let delivery = await fixture(3); const run = await startPreparation(delivery, 'photo-story');
  const baseline = await Revision.findById(run.baseRevisionId);
  await drain(run); delivery = await Delivery.findById(delivery._id);
  const result = await invoke(publishPresentation, delivery, { revisionId: String(baseline._id), pin: '123456' });
  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  const saved = await Delivery.findById(delivery._id).select('+access.pinDigest');
  assert.equal(String(saved.publishedRevisionId), String(baseline._id));
  const pinDigest = saved.access.pinDigest;
  const repeated = await invoke(publishPresentation, saved, { revisionId: String(baseline._id) });
  assert.equal(repeated.statusCode, 200);
  assert.equal((await Delivery.findById(delivery._id).select('+access.pinDigest')).access.pinDigest, pinDigest);
});

test('concurrent publication reserves the free-plan quota once', async () => {
  let delivery = await fixture(3); await drain(await startPreparation(delivery, 'photo-story'));
  await User.updateOne({ _id: delivery.userId }, { $set: { plan: 'free' }, $unset: { planOverride: 1 } });
  delivery = await Delivery.findById(delivery._id);
  const responses = await Promise.all([invoke(publishPresentation, delivery, { revisionId: String(delivery.draftRevisionId), pin: '123456' }), invoke(publishPresentation, delivery, { revisionId: String(delivery.draftRevisionId) })]);
  assert.equal(responses.filter(response => response.statusCode === 200).length, 1);
  assert.equal(responses.filter(response => response.statusCode === 409).length, 1);
  assert.equal((await DeliveryUsage.findOne({ userId: delivery.userId })).publishedDeliveries, 1);
});

test('caption requests validate the frame before attaching a run', async () => {
  let delivery = await fixture(2); await drain(await startPreparation(delivery, 'photo-story'));
  delivery = await Delivery.findById(delivery._id); const original = delivery.activePreparationId;
  await assert.rejects(startRevisionTask(delivery, 'caption', { revisionId: String(delivery.draftRevisionId), assetId: 'someone-else' }), /Choose a photograph/);
  assert.equal(String((await Delivery.findById(delivery._id)).activePreparationId), String(original));
});

test('a lost upload response can be recovered only by the delivery owner', async () => {
  const delivery = await fixture(1), uploadId = crypto.randomUUID();
  const resource = cloudinary.api.resource;
  cloudinary.api.resource = async publicId => ({ public_id: publicId, version: 9 });
  try {
    const recovered = await invoke(recoverDeliveryUpload, delivery, { uploadId });
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.body.data.uploaded.public_id, `veylo/users/${delivery.userId}/deliveries/${delivery._id}/${uploadId}`);
    assert.equal((await invoke(recoverDeliveryUpload, delivery, { uploadId }, new mongoose.Types.ObjectId())).statusCode, 404);
    assert.equal((await invoke(recoverDeliveryUpload, delivery, { uploadId: '../another' })).statusCode, 400);
  } finally { cloudinary.api.resource = resource; }
});

test('ten simultaneous 100-photo deliveries settle without duplicate observations or lost jobs', async () => {
  const deliveries = await Promise.all(Array.from({ length: 10 }, () => fixture(100)));
  const runs = await Promise.all(deliveries.map(delivery => startPreparation(delivery, 'photo-story')));
  const start = Date.now();
  while (await Run.countDocuments({ state: 'working' })) {
    await Task.updateMany({ state: 'queued' }, { availableAt: new Date() });
    await Promise.all(Array.from({ length: 6 }, () => processTaskBatch()));
    await finishPreparations();
    assert.ok(Date.now() - start < 45000, 'Local queue failed to drain in 45 seconds');
    await delay(100);
  }
  assert.equal(await Run.countDocuments({ _id: { $in: runs.map(run => run._id) }, state: 'ready' }), 10);
  assert.equal(stats.visionImages, 1000);
  assert.equal(await Observation.countDocuments({}), 1000);
  assert.equal(await Task.countDocuments({ state: { $in: ['queued', 'running'] } }), 0);
});
