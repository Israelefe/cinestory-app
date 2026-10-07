import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModelRequestScheduler } from '../src/services/modelRequestScheduler.service.js';
import { createMemoryModelBudget, createMongoModelBudget, providerBudgetObservation, rateLimitDuration } from '../src/services/modelBudget.service.js';
import { estimatedModelTokens, requestModelCompletion } from '../src/services/modelProvider.service.js';
import { withModelRequestContext } from '../src/services/modelRequestContext.service.js';
import { analyzeAllV3, directV3PhotoSwapCaptions, directV3 } from '../src/services/deliveryV3AI.service.js';
import { deliveryPreparationMessage } from '../../client/src/utils/deliveryPreparation.js';

const unlimited = { reserve: async () => ({ acquired: true }), finish: async () => {} };
const entry = (id, overrides = {}) => ({ id, provider: 'Groq AI', model: 'test-model', owner: id, workload: 'analysis', tokens: 100, timeoutMs: 1000, ...overrides });
const reply = content => Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: JSON.stringify(content) } }] });
function configure(t, fetcher) {
  const keys = { GROQ_API_KEY: 'offline-key', GROQ_VISION_MODEL: 'qwen/qwen3.8-27b', GROQ_TEXT_MODEL: 'openai/gpt-oss-120b', GROQ_TOKENS_PER_MINUTE: '1000000000', GROQ_REQUESTS_PER_MINUTE: '100000', ALIBABA_MODEL_STUDIO_API_KEY: '', R2_IMAGE_WORKER_URL: 'https://offline-worker.example', R2_IMAGE_WORKER_SECRET: 'offline-secret-that-is-at-least-32-characters' };
  const before = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]));
  Object.assign(process.env, keys);
  t.after(() => { for (const [key, value] of Object.entries(before)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  t.mock.method(globalThis, 'fetch', fetcher);
}

test('one delivery can run five analysis requests of three photos each', async () => {
  const scheduler = createModelRequestScheduler({ budget: unlimited });
  let active = 0, maximum = 0;
  await Promise.all(Array.from({ length: 15 }, (_, index) => scheduler.run(async () => {
    maximum = Math.max(maximum, ++active); await delay(5); active--;
  }, entry(String(index), { owner: 'photographer-one' }))));
  assert.equal(maximum, 5);
});

test('queued photographers take turns and a large gallery cannot occupy every slot', async () => {
  const scheduler = createModelRequestScheduler({ budget: unlimited, limits: () => ({ analysis: 1, writing: 1, assistant: 1, other: 1 }) });
  const order = [];
  await Promise.all(['large', 'large', 'large', 'small', 'second'].map((owner, index) => scheduler.run(async () => { order.push(owner); await delay(2); }, entry(String(index), { owner }))));
  assert.deepEqual(order, ['large', 'small', 'second', 'large', 'large']);
});

test('writing and help start while all photo analysis slots are occupied', async () => {
  const scheduler = createModelRequestScheduler({ budget: unlimited, limits: () => ({ analysis: 1, writing: 1, assistant: 1, other: 1 }) });
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const analysis = scheduler.run(async () => { started(); await new Promise(resolve => { release = resolve; }); }, entry('analysis'));
  await ready;
  const completed = [];
  await Promise.all(['writing', 'assistant'].map(workload => scheduler.run(async () => completed.push(workload), entry(workload, { workload }))));
  assert.deepEqual(completed.sort(), ['assistant', 'writing']);
  release(); await analysis;
});

test('cancelling a queued request removes it without starting a provider call', async () => {
  const scheduler = createModelRequestScheduler({ budget: unlimited, limits: () => ({ analysis: 1 }) });
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const first = scheduler.run(async () => { started(); await new Promise(resolve => { release = resolve; }); }, entry('first'));
  await ready;
  const controller = new AbortController(); let called = false;
  const second = scheduler.run(async () => { called = true; }, entry('second', { signal: controller.signal }));
  controller.abort(new Error('Cancelled by photographer'));
  await assert.rejects(second, /Cancelled by photographer/);
  release(); await first; await delay(5);
  assert.equal(called, false);
  assert.equal(scheduler.snapshot()[0].waiting, 0);
});

test('rate headers treat remaining requests as a daily allowance, and parse reset durations', () => {
  const observation = providerBudgetObservation(new Response('', { status: 429, headers: {
    'x-ratelimit-limit-requests': '500000', 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '2h',
    'x-ratelimit-limit-tokens': '250000', 'x-ratelimit-remaining-tokens': '123', 'x-ratelimit-reset-tokens': '1m2.5s', 'retry-after': '3'
  } }));
  assert.equal(observation.tokensLimit, 250000); assert.equal(observation.tokensResetMs, 62500);
  assert.equal(observation.requestsResetMs, 7200000); assert.equal(observation.retryMs, 3000);
  assert.equal(observation.requestsLimit, undefined); assert.equal(rateLimitDuration('250ms'), 250);
});

test('memory budget reserves estimates, reconciles actual usage, waits for tokens and respects cooldowns', async () => {
  let at = 100000;
  const budget = createMemoryModelBudget({ now: () => at });
  const first = entry('first', { tokens: 200000 });
  assert.equal((await budget.reserve(first)).acquired, true);
  assert.equal((await budget.reserve(entry('second', { tokens: 100000 }))).acquired, false);
  await budget.finish(first, { actualTokens: 1000 });
  assert.equal((await budget.reserve(entry('second', { tokens: 100000 }))).acquired, true);
  await budget.finish(entry('second'), { actualTokens: 100, retryMs: 3000 });
  assert.equal((await budget.reserve(entry('third'))).waitUntil, at + 3000);
  at += 3001;
  assert.equal((await budget.reserve(entry('third'))).acquired, true);
});

test('MongoDB coordinates token allowance and concurrency across two scheduler processes', async t => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.2.6', downloadDir: './node_modules/.cache/mongodb-memory-server' } });
  const connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  t.after(async () => { await connection.close(); await mongo.stop(); });
  const collection = connection.db.collection('aimodelbudgets');
  const stores = [createMongoModelBudget(collection), createMongoModelBudget(collection)];
  const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) => stores[index % 2].reserve(entry('mongo-' + index, { owner: 'one-owner', tokens: 20000 }))));
  assert.equal(attempts.filter(result => result.acquired).length, 5);
  const state = await collection.findOne({ _id: 'Groq AI:test-model' });
  assert.equal(state.leases.length, 5); assert.equal(state.usage.length, 5);
  const lease = state.leases[0];
  await stores[0].finish(entry(lease.id), { actualTokens: 50, tokensLimit: 250000, tokensRemaining: 230000, tokensResetMs: 1000 });
  assert.equal((await stores[1].reserve(entry('another', { owner: 'one-owner', tokens: 20000 }))).acquired, true);
  const second = await collection.findOne({ _id: 'Groq AI:test-model' });
  assert.equal(second.leases.length, 5);
  assert.equal(second.usage.find(item => item.id === lease.id).tokens, 50);
});

test('unused output reservations are released while in-flight requests remain reserved', async () => {
  const budget = createMemoryModelBudget();
  const first = entry('first', { tokens: 20000 }), second = entry('second', { tokens: 20000 });
  await budget.reserve(first); await budget.reserve(second);
  await budget.finish(first, { actualTokens: 100, tokensRemaining: 249900, tokensResetMs: 60000 });
  assert.equal(budget.snapshot()[0][1].remaining, 229900);
  await budget.finish(second, { actualTokens: 100, tokensRemaining: 249800, tokensResetMs: 60000 });
  assert.equal(budget.snapshot()[0][1].remaining, 249800);
});

test('configured request and token budgets refresh and provider headers cannot raise a lower configured allowance', async t => {
  const names = ['GROQ_REQUESTS_PER_MINUTE', 'GROQ_TOKENS_PER_MINUTE'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => { for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value; });
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.2.6', downloadDir: './node_modules/.cache/mongodb-memory-server' } });
  const connection = await mongoose.createConnection(mongo.getUri()).asPromise();
  t.after(async () => { await connection.close(); await mongo.stop(); });
  let at = 100000;
  const stores = [createMemoryModelBudget({ now: () => at }), createMongoModelBudget(connection.db.collection('aimodelbudgets'), { now: () => at })];
  for (const budget of stores) {
    at = 100000;
    process.env.GROQ_REQUESTS_PER_MINUTE = '4'; process.env.GROQ_TOKENS_PER_MINUTE = '10000';
    const first = entry('first', { tokens: 1000 });
    assert.equal((await budget.reserve(first)).acquired, true);
    await budget.finish(first, { actualTokens: 10, tokensLimit: 250000 });
    await assert.rejects(budget.reserve(entry('oversized', { tokens: 12000 })), { code: 'AI_REQUEST_TOO_LARGE' });
    process.env.GROQ_REQUESTS_PER_MINUTE = '1'; process.env.GROQ_TOKENS_PER_MINUTE = '100';
    assert.equal((await budget.reserve(entry('rpm-limited', { tokens: 1 }))).acquired, false);
    at += 60001;
    await assert.rejects(budget.reserve(entry('token-limited', { tokens: 101 })), { code: 'AI_REQUEST_TOO_LARGE' });
    const second = entry('second');
    assert.equal((await budget.reserve(second)).acquired, true);
    await budget.finish(second, { actualTokens: 10, tokensLimit: 50 });
    process.env.GROQ_REQUESTS_PER_MINUTE = '4'; process.env.GROQ_TOKENS_PER_MINUTE = '1000';
    await assert.rejects(budget.reserve(entry('provider-limited', { tokens: 51 })), { code: 'AI_REQUEST_TOO_LARGE' });
    await budget.finish(second, { tokensLimit: 250000 });
    assert.equal((await budget.reserve(entry('larger-allowance', { tokens: 150 }))).acquired, true);
  }
});

test('vision, captions and help use the intended Groq model and reasoning settings', async t => {
  const calls = [];
  configure(t, async (_url, options) => { calls.push(JSON.parse(options.body)); return reply({ ready: true }); });
  const imageBody = { max_tokens: 100, messages: [{ role: 'user', content: Array.from({ length: 3 }, () => ({ type: 'image_url', image_url: { url: 'https://offline.example/photo' } })) }] };
  await requestModelCompletion(imageBody);
  await requestModelCompletion({ messages: [{ role: 'user', content: 'Write a caption from these saved observations.' }], max_tokens: 100 });
  await requestModelCompletion({ messages: [{ role: 'user', content: 'Where are my deliveries?' }], max_tokens: 100 }, { workload: 'assistant' });
  assert.equal(calls[0].model, 'qwen/qwen3.8-27b'); assert.equal(calls[0].reasoning_effort, 'none');
  assert.equal(calls[1].model, 'openai/gpt-oss-120b'); assert.equal(calls[1].reasoning_effort, 'low');
  assert.equal(calls[2].model, 'openai/gpt-oss-120b'); assert.equal(calls[0].max_tokens, undefined);
  assert.ok(estimatedModelTokens(imageBody) >= 3 * 2048 + 100);
});

test('background waits do not consume provider timeouts or request attempts', async t => {
  let calls = 0;
  configure(t, async () => ++calls === 1 ? Response.json({}, { status: 429, headers: { 'retry-after': '0.02' } }) : reply({ complete: true }));
  const started = Date.now();
  const result = await withModelRequestContext({ background: true, ownerId: 'cooldown-test' }, () => requestModelCompletion({ messages: [{ role: 'user', content: 'Write the caption.' }], max_tokens: 100 }, { timeoutMs: 50 }));
  assert.equal(result.response.ok, true); assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 1000);
});

test('request slots remain occupied while the provider response is downloading', async t => {
  let calls = 0;
  const controllers = [];
  configure(t, async () => {
    if (++calls <= 2) return new Response(new ReadableStream({ start(controller) { controllers.push(controller); } }));
    return reply({ complete: true });
  });
  const body = { messages: [{ role: 'user', content: 'Write a caption.' }], max_tokens: 100 };
  const requests = Array.from({ length: 3 }, () => requestModelCompletion(body, { ownerId: 'slow-response-test' }));
  while (controllers.length < 2) await delay(5);
  await delay(20);
  assert.equal(calls, 2);
  for (const controller of controllers) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ usage: { total_tokens: 1 }, choices: [] }))); controller.close(); }
  await Promise.all(requests);
  assert.equal(calls, 3);
});

test('photo links are prepared when a request starts rather than when it enters the queue', async t => {
  configure(t, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.messages[0].content[0].image_url.url, 'https://offline.example/fresh');
    return reply({ ready: true });
  });
  const makeBody = url => ({ max_tokens: 100, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }] });
  let prepared = 0;
  await requestModelCompletion(makeBody('https://offline.example/old'), { prepareBody: () => { prepared++; return makeBody('https://offline.example/fresh'); } });
  assert.equal(prepared, 1);
});

test('100 photographers can analyse 69 photos each; one failure keeps the other deliveries running', async t => {
  let active = 0, maximum = 0, requests = 0;
  const perOwner = new Map(); let ownerMaximum = 0;
  configure(t, async (_url, options) => {
    const body = JSON.parse(options.body);
    const content = body.messages[1].content;
    const images = content.filter(part => part.type === 'image_url');
    assert.ok(images.length <= 3); assert.equal(body.model, 'qwen/qwen3.8-27b');
    const claims = JSON.parse(Buffer.from(new URL(images[0].image_url.url).pathname.split('/').at(-1).split('.')[0], 'base64url'));
    const owner = claims.key.split('/')[0];
    requests++; maximum = Math.max(maximum, ++active);
    perOwner.set(owner, (perOwner.get(owner) || 0) + 1); ownerMaximum = Math.max(ownerMaximum, perOwner.get(owner));
    try {
      await delay(1);
      if (claims.key === 'owner-0/photo-0') return Response.json({}, { status: 403 });
      return reply({ images: images.map((_, index) => ({ index, summary: 'A finished studio portrait.', score: 7, colors: ['#b95732'], momentTags: ['portrait'] })) });
    } finally { active--; perOwner.set(owner, perOwner.get(owner) - 1); }
  });
  const saved = new Map();
  const started = Date.now();
  const jobs = await Promise.allSettled(Array.from({ length: 100 }, (_, owner) => {
    const assets = Array.from({ length: 69 }, (_, index) => ({ assetId: 'photo-' + index, publicId: 'owner-' + owner + '/photo-' + index, sortOrder: index }));
    return withModelRequestContext({ background: true, ownerId: 'owner-' + owner }, () => analyzeAllV3({ assets, brief: 'Finished birthday portraits.', shootType: 'Birthday' }, (done, total, partial) => saved.set(owner, { done, total, partial })));
  }));
  assert.equal(jobs.filter(job => job.status === 'fulfilled').length, 99);
  for (const job of jobs.slice(1)) assert.equal(job.value.length, 69);
  assert.equal(saved.get(0).done, 12); assert.equal(saved.get(99).done, 69);
  assert.ok(maximum > 5 && maximum <= 100); assert.ok(ownerMaximum <= 5);
  t.diagnostic('Simulated 100 deliveries / 6,900 photos: ' + requests + ' requests in ' + (Date.now() - started) + 'ms; max ' + maximum + ' active. This does not measure live Groq throughput.');
});

test('Photo Swap resumes approved captions without rewriting the completed batch', async t => {
  const assets = Array.from({ length: 20 }, (_, index) => ({ assetId: 'photo-' + index, sortOrder: index }));
  const done = assets.slice(0, 18).map((asset, index) => ({ assetId: asset.assetId, headline: 'Approved birthday headline ' + index, caption: 'An approved birthday caption ' + index }));
  const calls = [];
  configure(t, async (_url, options) => { const body = JSON.parse(options.body); calls.push(body); return reply({ frames: assets.slice(18).map((asset, index) => ({ assetId: asset.assetId, headline: index ? 'Ada, Your Birthday Plans' : 'Ada, Turning Thirty', caption: index ? 'Ada, may this birthday give you time for the plans you want to make this year.' : 'Ada, turning thirty is a chance to celebrate you and look forward to the year ahead.' })) }); });
  const frames = await directV3PhotoSwapCaptions({ assets, clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 30th birthday." }, [], () => {}, done);
  assert.deepEqual(frames.slice(0, 18), done); assert.equal(frames.length, 20);
  assert.ok(!calls.some(call => JSON.stringify(call).includes('"assetId":"photo-0"')));
  assert.ok(calls.every(call => call.model === 'openai/gpt-oss-120b'));
});

test('showcase recovery uses saved selection and approved writing', async t => {
  const ids = Array.from({ length: 5 }, (_, index) => 'photo-' + index);
  const captions = ids.map(assetId => ({ assetId, headline: 'A birthday for Ada', caption: 'Ada, your birthday photographs are here.', textAnimation: 'typewriter' }));
  const narrative = { title: 'Ada at thirty', openingLine: 'Ada, your birthday collection is here.', closingLine: 'Thank you, Ada.' };
  const saved = { selected: ids, writing: { narrative, captions }, visual: { palette: {} }, sections: [] };
  configure(t, async () => { throw new Error('Completed writing must not be sent again'); });
  const result = await directV3({ format: 'photo-story', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 30th birthday." }, ids.map(assetId => ({ assetId, score: 7, colors: [] })), { resume: saved });
  assert.deepEqual(result.direction.frames, captions);
});

test('preparation messages show completed photos and captions', () => {
  assert.equal(deliveryPreparationMessage({ stage: 'analysing-photos', counts: { analysis: { done: 23, total: 69 } } }), '23 of 69 photos analysed');
  assert.equal(deliveryPreparationMessage({ stage: 'writing-captions', counts: { writing: { done: 18, total: 69 } } }), '18 of 69 captions written');
  assert.match(deliveryPreparationMessage({ stage: 'analysing-photos', modelQueue: 'waiting' }), /processing will continue/);
});
