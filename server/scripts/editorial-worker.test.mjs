import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Delivery from '../src/models/Delivery.js';
import DeliveryJob from '../src/models/DeliveryJob.js';
import { v3Prepare } from '../src/controllers/deliveryV3.controller.js';
import { startDeliveryWorker, stopDeliveryWorker } from '../src/services/deliveryWorker.service.js';
import { editorialDraftIssues } from '../src/services/editorialDirection.service.js';
import { DELIVERY_WRITING_VERSION } from '../src/constants/deliveryWritingLimits.js';
import { unsupportedWritingAddress } from '../src/utils/deliveryWritingIdentity.js';

test('retrying Editorial at 82% finishes through the real database worker without reanalysing photos or accepting outfit reports', { timeout: 90000 }, async t => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.2.6', downloadDir: './node_modules/.cache/mongodb-memory-server' } });
  await mongoose.connect(mongo.getUri());
  const settings = { GROQ_API_KEY: 'offline-test', GROQ_TOKENS_PER_MINUTE: '1000000000', GROQ_REQUESTS_PER_MINUTE: '100000', ALIBABA_MODEL_STUDIO_API_KEY: '', DELIVERY_V3_WORKER_CONCURRENCY: '1' };
  const before = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(async () => {
    await stopDeliveryWorker();
    await mongoose.disconnect();
    await mongo.stop();
    for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const ids = Array.from({ length: 59 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`);
  const selected = ids.slice(0, 14).reverse();
  const observations = ids.map(assetId => ({ assetId, score: 8, summary: 'An emerald suit and an ivory telephone in a studio portrait.' }));
  const rejected = { title: "Ada's birthday portraits", openingLine: 'A birthday portrait feature for Ada.', closingLine: 'Your complete birthday collection follows.', introduction: '', frames: selected.map(assetId => ({ assetId, headline: 'The emerald suit', caption: 'Ada sits holding an ivory telephone.' })), sections: [{ title: 'Birthday portraits for Ada', body: '', assetIds: selected }] };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.ok(body.messages.every(message => !Array.isArray(message.content) || message.content.every(part => part.type !== 'image_url')), 'the saved photo analysis must be reused');
    const system = body.messages[0].content;
    const result = system.startsWith('Return JSON {"palette"') ? { palette: {} } : system.startsWith('Return JSON {"headline"') ? rejected.frames[0] : rejected;
    return Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: JSON.stringify(result) } }] });
  });
  const delivery = await Delivery.create({ userId: new mongoose.Types.ObjectId(), schemaVersion: 3, kind: 'showcase', format: 'editorial', status: 'draft', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 30th birthday portraits.", v3: { revision: 1 }, assets: ids.map(assetId => ({ assetId, publicId: `offline/${assetId}`, width: 1000, height: 1500 })), collectionAnalysis: { images: observations, complete: true } });
  const previous = await DeliveryJob.create({ deliveryId: delivery._id, userId: delivery.userId, type: 'v3-prepare', status: 'failed', stage: 'writing-showcase', progress: 82, errorCode: 'V3_EDITORIAL_WRITING_INCOMPLETE', input: { revision: 1 }, result: { writing: { selected, writingVersion: 'purpose-grounded-v2', editorialDraft: rejected } } });
  const originalResult = structuredClone(previous.result);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await v3Prepare({ params: { id: String(delivery._id) }, user: { id: String(delivery.userId) } }, response);
  assert.equal(response.code, 202);
  startDeliveryWorker();
  let job;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    job = await DeliveryJob.findById(response.body.data._id);
    if (['review', 'failed'].includes(job.status)) break;
    await delay(50);
  }
  assert.equal(job.status, 'review', job.errorCode || 'the preparation did not complete');
  assert.equal(job.progress, 100);
  const finished = await Delivery.findById(delivery._id);
  assert.equal(finished.status, 'review');
  assert.equal(finished.clientName, 'Ada');
  assert.equal(finished.collectionAnalysis.images.length, 59);
  assert.equal(finished.creativeDirection.writingVersion, DELIVERY_WRITING_VERSION);
  assert.deepEqual(finished.curatedAssetIds, selected);
  assert.deepEqual(finished.creativeDirection.frames.map(frame => frame.assetId), selected);
  assert.deepEqual(editorialDraftIssues({ ...finished.creativeDirection, introduction: finished.creativeDirection.editorial.introduction }, selected, text => unsupportedWritingAddress(text, finished), finished, observations), []);
  assert.ok(finished.creativeDirection.frames.every(frame => /birthday/.test(frame.caption) && !/emerald|telephone|seated|wearing|holding/.test(frame.caption)));
  assert.deepEqual((await DeliveryJob.findById(previous._id)).result, originalResult);
  assert.ok(calls > 3, 'the worker must reach targeted repair instead of approving the outfit report');
});
