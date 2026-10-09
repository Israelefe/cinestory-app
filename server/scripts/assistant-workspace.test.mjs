import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import Subscription from '../src/models/Subscription.js';
import Delivery from '../src/models/Delivery.js';
import PhotoStory from '../src/models/PhotoStory.js';
import DeliveryUsage from '../src/models/DeliveryUsage.js';
import DeliveryJob from '../src/models/DeliveryJob.js';
import Portfolio from '../src/models/Portfolio.js';
import RuntimeConfig from '../src/models/RuntimeConfig.js';
import { assistantContextSchema, freshAssistantContext, deliveryCheck, ownedAssistantDelivery } from '../src/services/assistantWorkspace.service.js';
import { factualAssistantAnswer, chatWithVeyloAssistant } from '../src/controllers/assistant.controller.js';
import { getAssistantWorkspace, checkAssistantDelivery, proposeAssistantWriting, validateAssistantWriting } from '../src/controllers/assistant.tools.controller.js';
import { createAssistantSession } from '../../client/src/services/assistantSession.js';
import { prepareAssistantSupport, consumeAssistantSupport, clearAssistantSupportDraft } from '../../client/src/services/assistantSupport.js';

const userId = '111111111111111111111111', deliveryId = '222222222222222222222222';
const assetId = '11111111-1111-4111-8111-111111111111';
const context = () => ({ page: '/create', capturedAt: Date.now(), workflow: { kind: 'photoswap', deliveryId, step: 'captions' }, recent: [] });
const draft = () => ({ _id: deliveryId, userId, schemaVersion: 3, kind: 'photoswap', status: 'review', clientName: 'private-client-name-marker', title: 'Portraits', brief: 'Birthday portraits', assets: [{ assetId, publicId: 'private-image-marker', width: 1200, height: 1800, caption: 'A birthday portrait.' }], v3: { revision: 2, approvedRevision: 2 }, reviewApprovedAt: new Date(), updatedAt: new Date('2026-01-02T10:00:00Z') });
function response() { const res = new EventEmitter(); res.statusCode = 200; res.status = code => { res.statusCode = code; return res; }; res.set = () => res; res.json = body => { res.body = body; res.writableEnded = true; return res; }; return res; }
function fixtures(t, { delivery = draft(), pro = true } = {}) {
  const queries = [];
  const user = { _id: userId, planOverride: pro ? { plan: 'pro' } : null, storageUsedBytes: 1024 ** 3, onboardingCompletedAt: new Date() };
  const query = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value });
  t.mock.method(User, 'findById', () => query(user));
  t.mock.method(Subscription, 'find', () => query([]));
  t.mock.method(RuntimeConfig, 'findOne', () => query(null));
  t.mock.method(PhotoStory, 'countDocuments', async () => 0);
  t.mock.method(Delivery, 'countDocuments', async () => 0);
  t.mock.method(DeliveryUsage, 'findOne', () => query(null));
  t.mock.method(DeliveryJob, 'exists', async () => false);
  t.mock.method(Portfolio, 'findOne', () => query(null));
  t.mock.method(Delivery, 'find', filter => { queries.push(filter); return query([]); });
  t.mock.method(Delivery, 'findOne', filter => { queries.push(filter); return query(String(filter.userId) === userId && String(filter._id) === deliveryId ? delivery : null); });
  return { user, queries, delivery };
}
function model(t, text = 'A quiet birthday portrait.') {
  const values = { NODE_ENV: 'test', JWT_SECRET: 'test-only-assistant-signing-secret', ALIBABA_MODEL_STUDIO_API_KEY: 'test-only', ALIBABA_BASE_URL: 'https://test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: text } }] }); });
  return calls;
}

test('context rejects typed content, URLs, unknown routes, forged instructions and unbounded activity', () => {
  assert.equal(readFileSync(new URL('../src/constants/assistantContext.mjs', import.meta.url), 'utf8'), readFileSync(new URL('../../client/src/utils/assistantContext.mjs', import.meta.url), 'utf8'), 'Client and server context contracts must match across separate deployment roots');
  assert.equal(assistantContextSchema.safeParse(context()).success, true);
  assert.equal(assistantContextSchema.safeParse({ ...context(), page: '/product', workflow: {}, recent: [{ event: 'page-opened', page: '/product', at: Date.now() }] }).success, true);
  for (const value of [{ ...context(), token: 'secret' }, { ...context(), page: '/admin' }, { ...context(), workflow: { ...context().workflow, caption: 'private' } }, { ...context(), recent: Array(21).fill({ event: 'page-opened', page: '/create', at: Date.now() }) }]) assert.equal(assistantContextSchema.safeParse(value).success, false);
  assert.equal(freshAssistantContext({ ...context(), capturedAt: Date.now() - 301000 }), null);
  assert.equal(freshAssistantContext({ ...context(), capturedAt: Date.now() + 6000 }), null);
});
test('tab sessions retain only explicit facts, clear account state and can disable context', () => {
  const session = createAssistantSession(), other = createAssistantSession();
  session.route('/dashboard'); session.route('/create', deliveryId, 'photoswap');
  session.workflow({ kind: 'photoswap', deliveryId, step: 'photos', uploading: true, password: 'private-password', caption: 'private-caption' });
  session.workflow({ kind: 'photoswap', deliveryId, step: 'photos', uploading: false, failedUploads: 2 });
  assert.equal(other.getSnapshot().recent.length, 0);
  assert.ok(session.getSnapshot().recent.some(event => event.event === 'upload-failed'));
  assert.doesNotMatch(JSON.stringify(session.requestContext()), /private-|password|caption/);
  session.setEnabled(false); assert.equal(session.requestContext(), undefined);
  session.setEnabled(true); assert.equal(session.getSnapshot().recent.length, 0);
  session.reset(); assert.equal(session.getSnapshot().page, ''); assert.equal(session.getSnapshot().recent.length, 0);
});
test('confirmed form edits preserve unrelated fields and cannot apply to a different draft or busy workflow', async () => {
  const session = createAssistantSession(); let form = { title: 'Original', caption: 'Keep this' };
  session.route('/create', deliveryId, 'photoswap');
  session.workflow({ deliveryId, kind: 'photoswap', busy: false }, { 'delivery-title': value => { form = { ...form, title: value.text }; return 'Applied to form'; } });
  await session.apply({ kind: 'delivery-title', text: 'New title', deliveryId });
  assert.deepEqual(form, { title: 'New title', caption: 'Keep this' });
  await assert.rejects(() => session.apply({ kind: 'delivery-title', text: 'Wrong', deliveryId: userId }));
  session.workflow({ deliveryId, kind: 'photoswap', busy: true }, { 'delivery-title': () => {} });
  await assert.rejects(() => session.apply({ kind: 'delivery-title', text: 'Blocked', deliveryId }));
});
test('PhotoSwap checks match caption and approval requirements while music and still photos remain optional', () => {
  const delivery = draft();
  assert.equal(deliveryCheck(delivery).status, 'ready-to-review');
  delivery.assets[0].caption = '';
  assert.equal(deliveryCheck(delivery).status, 'needs-attention');
  assert.match(JSON.stringify(deliveryCheck(delivery)), /caption/);
  assert.doesNotMatch(JSON.stringify(deliveryCheck(draft())), /Choose music|motion/);
  const expired = { ...draft(), access: { expiresAt: '2020-01-01' }, v3: { revision: 3, approvedRevision: 2 } };
  assert.match(JSON.stringify(deliveryCheck(expired)), /expiry|expire|future/);
  assert.match(JSON.stringify(deliveryCheck(expired)), /approve/);
});
test('checks distinguish unsaved browser state, jobs, quota and complete GridBoard order', () => {
  const result = deliveryCheck(draft(), { workflow: { unsaved: true, uploading: true, failedUploads: 2 }, pendingJob: true, entitlements: { limits: { photosPerDelivery: 100 }, usage: { deliveriesRemaining: 0 } } });
  for (const pattern of [/form/, /reports an upload/, /failed photo uploads/, /processing/, /allowance/]) assert.match(JSON.stringify(result), pattern);
  const board = { ...draft(), kind: 'pinboard', pinboard: { layouts: [{ id: 'balanced', assetOrder: [] }], selectedLayoutId: 'balanced' } };
  assert.match(JSON.stringify(deliveryCheck(board)), /every photograph once/);
  board.pinboard.layouts[0].assetOrder = [assetId];
  assert.equal(deliveryCheck(board).status, 'ready-to-review');
});
test('live account answers use verified counts and do not invent a fixed Pro allowance', () => {
  const facts = { account: { storageUsedBytes: 1024 ** 3, storageLimitBytes: 100 * 1024 ** 3, deliveriesRemaining: 2, monthlyDeliveryLimit: 3, deliveriesThisMonth: 1 } };
  assert.match(factualAssistantAnswer('How much storage do I have left?', facts), /99 GB remains/);
  assert.match(factualAssistantAnswer('How many deliveries do I have left?', facts), /2 of 3/);
  facts.account.deliveriesRemaining = null;
  assert.match(factualAssistantAnswer('How many deliveries do I have left?', facts), /no fixed monthly delivery count/);
});
test('recipient surface does not fetch authenticated studio records even with a draft in browser context', async t => {
  const calls = model(t, 'Ask the photographer for access.');
  t.mock.method(RuntimeConfig, 'findOne', () => ({ lean: async () => null }));
  t.mock.method(User, 'findById', () => { throw new Error('Studio records must not be read'); });
  const res = response();
  await chatWithVeyloAssistant({ user: { id: userId }, body: { surface: 'delivery', messages: [{ role: 'user', content: 'Why is my link locked?' }], context: context() } }, res);
  assert.equal(res.body.success, true); assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0].messages[0].content, /storageUsedBytes|private-client/);
});
test('delivery lookup and checks are scoped to the authenticated owner', async t => {
  const { queries } = fixtures(t);
  assert.equal(await ownedAssistantDelivery(deliveryId, '333333333333333333333333'), null);
  assert.equal(queries.at(-1).userId, '333333333333333333333333');
  const res = response();
  await checkAssistantDelivery({ user: { id: userId }, body: { deliveryId: '444444444444444444444444' } }, res);
  assert.equal(res.statusCode, 404); assert.doesNotMatch(JSON.stringify(res.body), /private-/);
});
test('workspace returns counts and photo choices without media, captions or client names', async t => {
  fixtures(t); const res = response();
  await getAssistantWorkspace({ user: { id: userId }, body: { context: context() } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.photos[0].assetId, assetId);
  assert.equal(res.body.data.account.storageUsedBytes, 1024 ** 3);
  assert.doesNotMatch(JSON.stringify(res.body), /private-|A birthday portrait|Birthday portraits/);
});
test('writing proposals use only requested source, then confirmation rejects another owner and stale drafts', async t => {
  const { delivery } = fixtures(t); const calls = model(t);
  const res = response();
  await proposeAssistantWriting({ user: { id: userId }, body: { kind: 'caption', deliveryId, assetId, instruction: 'Make this caption shorter.' } }, res);
  assert.equal(res.statusCode, 200); assert.match(res.body.data.text, /birthday/);
  assert.doesNotMatch(JSON.stringify(calls), /private-client|private-image/);
  const request = { user: { id: userId }, body: { confirmation: res.body.data.confirmation } };
  const valid = response(); await validateAssistantWriting(request, valid); assert.equal(valid.statusCode, 200);
  delivery.updatedAt = new Date('2026-01-03');
  const stale = response(); await validateAssistantWriting(request, stale); assert.equal(stale.statusCode, 409);
  const wrong = jwt.sign({ kind: 'caption', text: 'Wrong owner', userId: '333333333333333333333333' }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-assistant-writing', expiresIn: '1m' });
  const denied = response(); await validateAssistantWriting({ user: { id: userId }, body: { confirmation: wrong } }, denied); assert.equal(denied.statusCode, 404);
});
test('expired and altered confirmation tokens are rejected without changing records', async t => {
  fixtures(t); model(t);
  for (const confirmation of ['x'.repeat(30), jwt.sign({ userId }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-assistant-writing', expiresIn: -1 })]) {
    const res = response(); await validateAssistantWriting({ user: { id: userId }, body: { confirmation } }, res); assert.equal(res.statusCode, 409);
  }
});
for (const format of ['chapters', 'editorial', 'event-coverage', 'campaign']) test(`${format} assistant captions use format guidance, preserve longer writing and protect private context`, async t => {
  const delivery = { ...draft(), kind: 'showcase', format, shootType: 'Fashion', brief: 'Finished product photographs for a linen jacket collection.', creativeDirection: { title: 'Linen jacket collection', frames: [{ assetId, headline: 'Front jacket view', caption: 'A linen jacket from the collection.' }] } };
  fixtures(t, { delivery });
  const caption = 'The front view shows the linen jacket from the clothing collection. This photograph provides a complete view of the garment for the clothing team, alongside the separate detail photographs in the finished set.';
  const calls = model(t, caption); const res = response();
  await proposeAssistantWriting({ user: { id: userId }, body: { kind: 'caption', deliveryId, assetId, instruction: 'Add useful detail using the supplied collection brief.' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.text, caption); assert.ok(caption.length > 180);
  assert.match(calls[0].messages[0].content, new RegExp(`FORMAT GUIDANCE \\(${format}\\)`));
  assert.match(calls[0].messages[0].content, /320 characters/);
  assert.match(calls[0].messages[1].content, /drafts to improve, never sources/);
  assert.doesNotMatch(JSON.stringify(calls), /private-client|private-image|image_url/);
});
test('detailed assistant captions reject unsupported product claims', async t => {
  const delivery = { ...draft(), kind: 'showcase', format: 'campaign', shootType: 'Fashion', brief: 'Linen jacket collection.', creativeDirection: { title: 'Linen jacket', frames: [{ assetId, caption: 'The linen jacket.' }] } };
  fixtures(t, { delivery }); model(t, 'The waterproof leather jacket is ready for the summer campaign.');
  const res = response(); await proposeAssistantWriting({ user: { id: userId }, body: { kind: 'caption', deliveryId, assetId, instruction: 'Write a useful product caption.' } }, res);
  assert.equal(res.statusCode, 400); assert.equal(res.body.data, undefined);
});
test('private media URLs and provider details cannot become writing suggestions', async t => {
  fixtures(t); model(t, 'Download https://private.example/photo?token=secret');
  const res = response(); await proposeAssistantWriting({ user: { id: userId }, body: { kind: 'delivery-title', deliveryId, instruction: 'Use a short title.' } }, res);
  assert.equal(res.statusCode, 502); assert.doesNotMatch(JSON.stringify(res.body), /private\.example|token=secret/);
});
test('support draft is reviewable, excludes typed fields, and is cleared on identity change', () => {
  prepareAssistantSupport({ ...context(), workflow: { ...context().workflow, failedUploads: 2, password: 'private-password' } });
  const first = consumeAssistantSupport(), second = consumeAssistantSupport();
  assert.equal(first.subject, 'Upload problem'); assert.equal(first.message, second.message);
  assert.doesNotMatch(JSON.stringify(first), /private-password/);
  clearAssistantSupportDraft(); assert.deepEqual(consumeAssistantSupport(), {});
});
