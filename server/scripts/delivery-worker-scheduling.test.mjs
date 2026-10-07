import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Delivery from '../src/models/Delivery.js';
import DeliveryJob from '../src/models/DeliveryJob.js';
import WorkerHeartbeat from '../src/models/WorkerHeartbeat.js';
import { startDeliveryWorker, stopDeliveryWorker } from '../src/services/deliveryWorker.service.js';
import { v3Prepare } from '../src/controllers/deliveryV3.controller.js';

async function waitFor(check, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) { if (await check()) return; await delay(50); }
  throw new Error('The simulated worker did not reach the expected state.');
}

test('worker admits 100 deliveries, isolates failures and resumes saved work after restarting', { timeout: 90000 }, async t => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.2.6', downloadDir: './node_modules/.cache/mongodb-memory-server' } });
  await mongoose.connect(mongo.getUri());
  const settings = { GROQ_API_KEY: 'offline-key', GROQ_TOKENS_PER_MINUTE: '1000000000', GROQ_REQUESTS_PER_MINUTE: '100000', GROQ_VISION_MODEL: 'qwen/qwen3.8-27b', GROQ_TEXT_MODEL: 'openai/gpt-oss-120b', ALIBABA_MODEL_STUDIO_API_KEY: '', R2_IMAGE_WORKER_URL: 'https://offline-worker.example', R2_IMAGE_WORKER_SECRET: 'offline-secret-that-is-at-least-32-characters', DELIVERY_V3_WORKER_CONCURRENCY: '100' };
  const before = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  delete process.env.DELIVERY_V3_WORKER_CONCURRENCY;
  t.after(async () => { await stopDeliveryWorker(); await mongoose.disconnect(); await mongo.stop(); for (const [key, value] of Object.entries(before)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  let release, hold = true, failOnce = true;
  const gate = new Promise(resolve => { release = resolve; });
  const seenPhotos = [];
  const reply = content => Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: JSON.stringify(content) } }] });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    const content = body.messages[1].content;
    const images = Array.isArray(content) ? content.filter(part => part.type === 'image_url') : [];
    if (!images.length) { assert.equal(body.model, 'openai/gpt-oss-120b'); return reply({ moments: [], layouts: [], palette: {} }); }
    if (hold) await gate;
    const claims = images.map(image => JSON.parse(Buffer.from(new URL(image.image_url.url).pathname.split('/').at(-1).split('.')[0], 'base64url')));
    seenPhotos.push(...claims.map(claim => claim.key));
    if (failOnce && claims[0].key === 'owner-0/photo-0') { failOnce = false; return Response.json({}, { status: 403 }); }
    return reply({ images: claims.map((_, index) => ({ index, summary: 'A finished portrait.', score: 7, colors: ['#b95732'], momentTags: ['portrait'], similarityTags: ['standing pose'], colorGroups: [{ area: 'outfit', color: 'cream' }] })) });
  });
  const docs = await Delivery.insertMany(Array.from({ length: 100 }, (_, owner) => ({ userId: new mongoose.Types.ObjectId(), schemaVersion: 3, kind: 'pinboard', status: 'analyzing', brief: 'Finished birthday portraits.', clientName: 'Studio client', v3: { step: 'preparing', revision: 1 }, assets: Array.from({ length: 6 }, (_, index) => ({ assetId: 'photo-' + index, publicId: 'owner-' + owner + '/photo-' + index, sortOrder: index, width: 1000, height: 1600 })) })));
  await DeliveryJob.insertMany(docs.map(doc => ({ deliveryId: doc._id, userId: doc.userId, type: 'v3-prepare', input: { revision: 1 } })));
  startDeliveryWorker();
  await waitFor(() => DeliveryJob.countDocuments({ status: 'running' }).then(count => count === 100));
  const heartbeat = await WorkerHeartbeat.findOne({ workerName: 'delivery' }).lean();
  assert.equal(heartbeat.details.maxV3Jobs, 100);
  hold = false; release();
  await waitFor(() => DeliveryJob.countDocuments({ status: { $in: ['review', 'failed'] } }).then(count => count === 100));
  assert.equal(await Delivery.countDocuments({ status: 'review' }), 99);
  const failed = await DeliveryJob.findOne({ deliveryId: docs[0]._id, status: 'failed' }).select('+input');
  assert.equal(failed.counts.analysis.done, 3); assert.equal(failed.attempts, 1);
  const failedDelivery = await Delivery.findById(docs[0]._id);
  assert.equal(failedDelivery.collectionAnalysis.images.length, 3);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await v3Prepare({ params: { id: String(failedDelivery._id) }, user: { id: String(failedDelivery.userId) } }, response);
  assert.equal(response.code, 202);
  await waitFor(() => DeliveryJob.countDocuments({ status: 'review' }).then(count => count === 100));
  const completed = await Delivery.findById(docs[0]._id);
  assert.equal(completed.collectionAnalysis.images.length, 6);
  assert.equal(seenPhotos.filter(key => key === 'owner-0/photo-3').length, 1);
  await mongoose.connection.db.collection('aimodelbudgets').updateMany({}, { $set: { blockedUntil: Date.now() + 60000 } });
  const waiting = await Delivery.create({ userId: new mongoose.Types.ObjectId(), schemaVersion: 3, kind: 'pinboard', status: 'analyzing', brief: 'Finished portraits.', v3: { step: 'preparing', revision: 1 }, assets: [{ assetId: 'waiting', publicId: 'waiting/photo', width: 1000, height: 1600 }] });
  const job = await DeliveryJob.create({ deliveryId: waiting._id, userId: waiting.userId, type: 'v3-prepare', input: { revision: 1 }, result: { checkpoint: 'saved' } });
  await waitFor(() => DeliveryJob.findById(job._id).then(current => current.modelQueue === 'waiting'));
  await stopDeliveryWorker();
  const recovered = await DeliveryJob.findById(job._id);
  assert.equal(recovered.status, 'queued'); assert.equal(recovered.attempts, 0); assert.equal(recovered.result.checkpoint, 'saved');
  t.diagnostic('100 real MongoDB jobs completed with a mocked provider; one delivery recovered without repeating saved images. No live service was used.');
});

test('shutdown returns a job claimed during the last poll without starting it or consuming an attempt', { timeout: 15000 }, async t => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.2.6', downloadDir: './node_modules/.cache/mongodb-memory-server' } });
  await mongoose.connect(mongo.getUri());
  let release, notifyClaimed;
  const gate = new Promise(resolve => { release = resolve; });
  const claimed = new Promise(resolve => { notifyClaimed = resolve; });
  t.after(async () => { release(); await stopDeliveryWorker(); await mongoose.disconnect(); await mongo.stop(); });
  const job = await DeliveryJob.create({ userId: new mongoose.Types.ObjectId(), deliveryId: new mongoose.Types.ObjectId(), type: 'v3-prepare', input: { revision: 1 } });
  const originalClaim = DeliveryJob.findOneAndUpdate.bind(DeliveryJob);
  t.mock.method(DeliveryJob, 'findOneAndUpdate', (...args) => ({ select: async projection => {
    const result = await originalClaim(...args).select(projection);
    if (result) { notifyClaimed(); await gate; }
    return result;
  } }));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Shutdown must not start an AI request'); });
  startDeliveryWorker();
  await claimed;
  let stopped = false;
  const shutdown = stopDeliveryWorker().then(() => { stopped = true; });
  await delay(25);
  assert.equal(stopped, false);
  release();
  await shutdown;
  const recovered = await DeliveryJob.findById(job._id);
  assert.equal(recovered.status, 'queued'); assert.equal(recovered.attempts, 0); assert.equal(recovered.lockedBy, null);
});
