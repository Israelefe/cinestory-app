import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import express from 'express';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AnalyticsEvent from '../src/models/AnalyticsEvent.js';
import User from '../src/models/User.js';
import SupportTicket from '../src/models/SupportTicket.js';
import AdminUser from '../src/models/AdminUser.js';
import AdminSession from '../src/models/AdminSession.js';
import router from '../src/routes/admin.routes.js';
import { tokenDigest } from '../src/utils/auth.js';
import { analyticsRoute, safeBrowserDiagnostic } from '../src/utils/analyticsPrivacy.js';
import { recordAnalyticsEvent } from '../src/services/analytics.service.js';
import { collectClientAnalytics } from '../src/controllers/analytics.controller.js';
import { orderedFunnel, retentionReport, FUNNELS } from '../src/services/productInsights.service.js';
import { forwardPosthogBatch, posthogPayload, posthogConfiguration } from '../src/services/posthog.service.js';
import { symbolicateBrowserDiagnostic } from '../src/services/browserSourceMaps.service.js';
import { browserDiagnostic } from '../../client/src/services/browserDiagnostics.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'insights-tests-only-not-a-real-secret-123'; process.env.OTP_SECRET = 'insights-tests-only-identity-secret-123456';
const day = 86400000, now = new Date('2026-10-09T12:00:00Z'), since = new Date(+now - 30 * day);
const event = (name, age, extra = {}) => ({ name, occurredAt: new Date(+now - age * day), source: 'server', actorType: 'photographer', userId: 'a', ...extra });
const response = () => ({ code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; }, set() { return this; } });
let mongo, server, origin, user, other, adminId; const tokens = {};
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await AnalyticsEvent.init();
  user = await User.create({ name: 'Ada Test', email: 'ada-insights@example.invalid', accountStatus: 'active' });
  other = await User.create({ name: 'Bola Test', email: 'bola-insights@example.invalid', accountStatus: 'active' });
  for (const role of ['superadmin', 'analyst', 'support', 'finance', 'read-only']) {
    const admin = await AdminUser.create({ username: `insights-${role}`, name: role, password: 'testing-password-only-12345', role }); adminId ||= admin._id;
    const session = new AdminSession({ adminId: admin._id, tokenDigest: 'temporary', expiresAt: new Date(Date.now() + 3600000), twoFactorVerified: true });
    const token = jwt.sign({ id: String(admin._id), sid: String(session._id), type: 'admin' }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-admin' });
    session.tokenDigest = tokenDigest(token); await session.save(); tokens[role] = token;
  }
  const app = express(); app.use(express.json()); app.use('/api/v1/admin', router); app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); }); origin = `http://127.0.0.1:${server.address().port}/api/v1/admin`;
});
beforeEach(async () => { delete process.env.POSTHOG_ENABLED; delete process.env.POSTHOG_HOST; delete process.env.ANALYTICS_EXCLUDED_USER_IDS; delete process.env.BROWSER_SOURCE_MAP_DIR; await Promise.all([AnalyticsEvent.deleteMany({}), SupportTicket.deleteMany({})]); });
after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await mongo.stop(); });
const get = (url, role = 'superadmin') => fetch(origin + url, { headers: { Authorization: `Bearer ${tokens[role]}` } });

test('ordered funnel rejects out-of-order, expired, wrong-user and client-forged publication events', () => {
  const rows = [event('account.activated', 12), event('delivery.publish.succeeded', 11), event('upload.completed', 10), event('delivery.publish.succeeded', 9, { source: 'client' }), event('delivery.publish.succeeded', 8, { userId: 'b' }), event('delivery.publish.succeeded', 3)];
  const result = orderedFunnel(rows, FUNNELS[0], { since, now });
  assert.deepEqual(result.steps.map(row => row.reached), [1, 1, 0]); assert.equal(result.steps[2].dropped, 1); assert.equal(result.steps[2].pending, 0);
});
test('pending users are not marked as stopped and repeated events count once', () => {
  const result = orderedFunnel([event('account.activated', 1), event('account.activated', .9), event('upload.completed', .5), event('upload.completed', .4)], FUNNELS[0], { since, now });
  assert.deepEqual(result.steps.map(row => row.reached), [1, 1, 0]); assert.equal(result.steps[2].pending, 1); assert.equal(result.steps[2].dropped, 0);
});
test('same-millisecond browser events retain their capture order', () => {
  const client = { actorType: 'client', source: 'client', sessionDigest: 'one', resourceDigest: 'delivery-one' };
  const rows = [event('client.photo.download.started', .01, { ...client, sequence: 3 }), event('client.experience.started', .01, { ...client, sequence: 2 }), event('client.delivery.opened', .01, { ...client, sequence: 1 })];
  assert.deepEqual(orderedFunnel(rows, FUNNELS[2], { since, now }).steps.map(row => row.reached), [1, 1, 1]);
});
test('checkout conversion cannot borrow a payment from another checkout or a browser report', () => {
  const rows = [event('billing.checkout.started', .5, { flowDigest: 'one' }), event('billing.payment.confirmed', .4, { flowDigest: 'two' }), event('billing.payment.confirmed', .3, { flowDigest: 'one', source: 'client' })];
  assert.equal(orderedFunnel(rows, FUNNELS[1], { since, now }).steps[1].reached, 0);
  rows.push(event('billing.payment.confirmed', .2, { flowDigest: 'one' })); assert.equal(orderedFunnel(rows, FUNNELS[1], { since, now }).steps[1].reached, 1);
});
test('recipient journeys cannot cross sessions or private deliveries', () => {
  const client = { actorType: 'client', source: 'client', sessionDigest: 'session', resourceDigest: 'delivery-a' };
  const rows = [event('client.delivery.opened', .01, client), event('client.experience.started', .009, { ...client, resourceDigest: 'delivery-b' }), event('client.photo.download.started', .008, client)];
  assert.deepEqual(orderedFunnel(rows, FUNNELS[2], { since, now }).steps.map(row => row.reached), [1, 0, 0]);
});
test('retention excludes unfinished intervals and measures return publications, not repeated starts', () => {
  const rows = [event('delivery.publish.succeeded', 20), event('delivery.publish.succeeded', 10), event('delivery.publish.succeeded', 1, { userId: 'new' })];
  const report = retentionReport(rows, { since, now, periodDays: 7 });
  const mature = report.rows.find(row => row.periods[0].eligible === 1); assert.equal(mature.periods[0].rate, 100); assert.equal(mature.periods[1].rate, null);
  assert.equal(report.rows.find(row => row.size === 1 && row !== mature).periods[0].rate, null);
});
test('browser diagnostics remove error text, private URLs, extension paths and source content', () => {
  const parsed = browserDiagnostic({ name: 'TypeError', message: 'password=never', stack: 'TypeError: private email\n at privateName (https://veylo.test/assets/app-abcd.js?token=secret:2:9)\n at other (https://private.test/photo.jpg:1:2)' }, { origin: 'https://veylo.test', release: 'abc123' });
  assert.equal(parsed.frames.length, 1); assert.equal(parsed.frames[0].asset, '/assets/app-abcd.js');
  assert.doesNotMatch(JSON.stringify(parsed), /secret|privateName|email|password|photo/);
  assert.equal(safeBrowserDiagnostic({ type: 'private message', frames: [{ asset: '/uploads/private.jpg', line: 1, column: 1 }] }).frames.length, 0);
  assert.equal(analyticsRoute('/d/private-access-token?pin=secret'), '/:id/:id');
});
test('private source-map chunk IDs survive diagnostics and PostHog encoding without exposing private stack text', () => {
  const chunkId = '3b240955-d24f-4949-8b58-a1ab7fbac187';
  const parsed = browserDiagnostic({ name: 'TypeError', stack: 'TypeError: private message\n at privateFunction (https://veylo.test/assets/module.full.no-external-abcd.js:2:9)' }, {
    origin: 'https://veylo.test', release: 'abc123',
    chunkIds: { 'Error\n at https://veylo.test/assets/module.full.no-external-abcd.js:1:1': chunkId, 'Error\n at https://external.invalid/assets/module.full.no-external-abcd.js:1:1': '00000000-0000-4000-8000-000000000000' }
  });
  assert.equal(parsed.frames[0].chunkId, chunkId);
  const diagnostic = safeBrowserDiagnostic(parsed);
  assert.equal(diagnostic.frames[0].chunkId, chunkId);
  process.env.POSTHOG_IDENTITY_SECRET = 'tests-only-source-map-identity-secret-12345';
  const payload = posthogPayload({ _id: new mongoose.Types.ObjectId(), name: 'javascript.error', actorType: 'photographer', userId: user._id, occurredAt: new Date(), diagnostic });
  assert.equal(payload.properties.$exception_list[0].stacktrace.frames[0].chunk_id, chunkId);
  assert.doesNotMatch(JSON.stringify(payload), /private message|privateFunction|external.invalid/);
  assert.equal(safeBrowserDiagnostic({ ...parsed, frames: [{ ...parsed.frames[0], chunkId: 'private-value' }] }).frames[0].chunkId, undefined);
});

test('repeated batches are deduplicated and client identity is not borrowed from the owner', async () => {
  const input = { name: 'upload.completed', userId: user._id, actorType: 'photographer', source: 'client', eventKey: 'one-retry' };
  await Promise.all([recordAnalyticsEvent(input), recordAnalyticsEvent(input)]); assert.equal(await AnalyticsEvent.countDocuments({}), 1);
  const res = response(); await collectClientAnalytics({ body: { events: [{ name: 'client.delivery.opened', eventId: '883d3d94-71c1-4dd7-9c97-7ad0ea39e71c', sessionId: 'session-123', route: '/d/private-token' }] }, user: { id: String(user._id) }, get: () => '' }, res);
  const client = await AnalyticsEvent.findOne({ name: 'client.delivery.opened' }); assert.equal(client.actorType, 'client'); assert.equal(client.userId, undefined); assert.ok(client.resourceDigest); assert.equal(res.code, 202);
  const mismatch = response(); await collectClientAnalytics({ body: { events: [{ name: 'upload.failed', accountHint: String(other._id) }] }, user: { id: String(user._id) }, get: () => '' }, mismatch);
  assert.equal((await AnalyticsEvent.findOne({ name: 'upload.failed' })).userId, undefined);
});
test('private link values in generic event metadata are removed or templated', async () => {
  const row = await recordAnalyticsEvent({ name: 'test.privacy', metadata: { landingPath: '/d/private-access-token', endpoint: '/api/v1/deliveries/private-id?secret=hidden', label: 'ada@example.invalid', target: 'https://private.invalid/photo.jpg', constructor: 'blocked' } });
  assert.equal(row.metadata.landingPath, '/:id/:id'); assert.doesNotMatch(JSON.stringify(row.metadata), /private|secret|@|photo|constructor/);
});
test('PostHog payload is allowlisted, pseudonymous and stable across retries', () => {
  process.env.POSTHOG_IDENTITY_SECRET = 'posthog-tests-only-not-a-live-secret-1234';
  const row = { _id: new mongoose.Types.ObjectId(), name: 'upload.completed', actorType: 'photographer', userId: user._id, occurredAt: new Date(), metadata: { secret: 'private-value' }, route: '/d/private-link', format: 'private-value', status: 'token-abcd1234', browser: 'private-value', count: 3 };
  const payload = posthogPayload(row); assert.equal(payload.properties.count, 3); assert.doesNotMatch(JSON.stringify(payload), /private|token-abcd|\/d\//); assert.ok(!JSON.stringify(payload).includes(String(user._id))); assert.deepEqual(posthogPayload(row), payload);
});
test('forwarding stays off without configuration and rejects arbitrary ingestion origins', async () => {
  process.env.POSTHOG_ENABLED = 'true'; process.env.POSTHOG_HOST = 'https://untrusted.invalid';
  assert.equal(posthogConfiguration().configured, false); assert.equal(await forwardPosthogBatch({ fetchImpl: () => assert.fail('network request') }), 0);
});
test('forwarding failures retry durably, successes are not resent, and expired final leases fail visibly', async () => {
  process.env.POSTHOG_ENABLED = 'true'; process.env.POSTHOG_PROJECT_TOKEN = 'phc_tests_only_not_a_live_project'; process.env.POSTHOG_IDENTITY_SECRET = 'tests-only-forward-identity-secret-12345';
  const row = await AnalyticsEvent.create({ name: 'upload.completed', userId: user._id, actorType: 'photographer', excluded: false, forwardState: 'pending', forwardAfter: new Date(0) });
  await forwardPosthogBatch({ fetchImpl: async () => new Response('{}', { status: 503 }), now }); let stored = await AnalyticsEvent.findById(row._id); assert.equal(stored.forwardState, 'pending'); assert.equal(stored.forwardCode, 'HTTP_503');
  let count = 0; await forwardPosthogBatch({ fetchImpl: async () => { count++; return new Response('{"status":1}', { status: 200 }); }, now: new Date(+now + day) });
  stored = await AnalyticsEvent.findById(row._id); assert.equal(stored.forwardState, 'sent'); assert.equal(stored.forwardAttempts, 2);
  await forwardPosthogBatch({ fetchImpl: async () => { count++; }, now: new Date(+now + 2 * day) }); assert.equal(count, 1);
  await AnalyticsEvent.create({ name: 'upload.completed', forwardState: 'sending', forwardAttempts: 8, forwardAfter: new Date(0) }); await forwardPosthogBatch({ now }); assert.equal(await AnalyticsEvent.countDocuments({ forwardState: 'failed' }), 1);
});
test('investigation permissions protect accounts, browser identities and mailbox boundaries', async () => {
  assert.equal((await get(`/users/${user._id}/activity`, 'analyst')).status, 403);
  assert.equal((await get('/browser-errors', 'support')).status, 403);
  assert.equal((await get('/product-insights', 'finance')).status, 403);
  const ticket = await SupportTicket.create({ userId: user._id, requesterName: 'Ada', requesterEmail: 'ada@example.invalid', subject: 'Payment question', channel: 'email', mailbox: 'billing' });
  assert.equal((await get(`/support/tickets/${ticket._id}/activity`, 'support')).status, 404);
  assert.equal((await get(`/support/tickets/${ticket._id}/activity`, 'finance')).status, 200);
  const guest = await SupportTicket.create({ requesterName: 'Ada', requesterEmail: user.email, subject: 'Anonymous question', channel: 'web' });
  const result = await (await get(`/support/tickets/${guest._id}/activity`, 'support')).json(); assert.equal(result.data.items.length, 0); assert.match(result.data.note, /not linked/);
});
test('account activity excludes other accounts, paginates and never returns raw metadata', async () => {
  await AnalyticsEvent.insertMany(Array.from({ length: 32 }, () => ({ name: 'upload.failed', userId: user._id, actorType: 'photographer', status: 'failed', metadata: { secret: 'nope' }, route: '/d/private-token' })));
  await AnalyticsEvent.create({ name: 'upload.completed', userId: other._id, actorType: 'photographer' });
  const first = await (await get(`/users/${user._id}/activity`, 'support')).json(); assert.equal(first.data.items.length, 30); assert.ok(first.data.next); assert.doesNotMatch(JSON.stringify(first), /private-token|metadata|nope/);
  const next = await (await get(`/users/${user._id}/activity?before=${first.data.next}`, 'support')).json(); assert.equal(next.data.items.length, 2); assert.equal(next.data.next, null);
  assert.equal((await get(`/users/${user._id}/activity?before=bad`, 'support')).status, 400);
});
test('browser error groups expose account links only to authorised investigators', async () => {
  await AnalyticsEvent.create({ name: 'javascript.error', fingerprint: 'a'.repeat(64), actorType: 'photographer', userId: user._id, excluded: false, diagnostic: { type: 'TypeError', frames: [], release: 'abc123' } });
  const readonly = await (await get('/browser-errors', 'read-only')).json(); assert.equal(readonly.data.items[0].affectedAccounts, 1); assert.equal(readonly.data.items[0].accountIds, undefined);
  const owner = await (await get('/browser-errors')).json(); assert.equal(owner.data.items[0].accountIds[0], String(user._id));
});
test('report excludes configured internal users and uses only verified publication outcomes', async () => {
  await AnalyticsEvent.insertMany([{ name: 'account.activated', userId: user._id, source: 'server', actorType: 'photographer', excluded: false }, { name: 'delivery.publish.succeeded', userId: user._id, source: 'client', actorType: 'photographer', excluded: false }]);
  let report = await (await get('/product-insights')).json(); assert.equal(report.data.funnels[0].participants, 1); assert.equal(report.data.retention[0].rows.length, 0);
  process.env.ANALYTICS_EXCLUDED_USER_IDS = String(user._id); report = await (await get('/product-insights')).json(); assert.equal(report.data.funnels[0].participants, 0);
});
test('private symbolication returns original code coordinates without source text', async () => {
  const root = path.resolve('.cache/test-insights-maps'); await mkdir(path.join(root, 'test-release'), { recursive: true });
  await writeFile(path.join(root, 'test-release', 'app-abcd.js.map'), JSON.stringify({ version: 3, sources: ['../src/pages/Dashboard.jsx'], names: [], sourcesContent: ['PRIVATE SOURCE BODY'], mappings: 'AAAA' }));
  process.env.BROWSER_SOURCE_MAP_DIR = root;
  const result = await symbolicateBrowserDiagnostic({ release: 'test-release', frames: [{ asset: '/assets/app-abcd.js', line: 1, column: 1 }] });
  assert.deepEqual(result.frames[0].original, { source: 'src/pages/Dashboard.jsx', line: 1, column: 1 }); assert.doesNotMatch(JSON.stringify(result), /PRIVATE SOURCE/);
});
