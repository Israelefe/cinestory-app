import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Session from '../src/models/Session.js';
import AdminUser from '../src/models/AdminUser.js';
import AdminSession from '../src/models/AdminSession.js';
import AdminAudit from '../src/models/AdminAudit.js';
import ProductControls from '../src/models/ProductControls.js';
import ProductExposure from '../src/models/ProductExposure.js';
import ProductFeedback from '../src/models/ProductFeedback.js';
import AnalyticsEvent from '../src/models/AnalyticsEvent.js';
import OperationalAlert from '../src/models/OperationalAlert.js';
import EmailDelivery from '../src/models/EmailDelivery.js';
import { adminAlertTestLimit } from '../src/middleware/rateLimit.middleware.js';
import adminRoutes from '../src/routes/admin.routes.js';
import productRoutes from '../src/routes/productControls.routes.js';
import { tokenDigest } from '../src/utils/auth.js';
import { allocation, productRuntime, exposureToken } from '../src/services/productControls.service.js';
import { productMonitoringSignals } from '../src/services/productMonitoring.service.js';
import { updateOperationalAlert } from '../src/services/operationalMonitoring.service.js';
import { posthogPayload } from '../src/services/posthog.service.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'product-tests-only-not-a-live-secret-1234';
process.env.POSTHOG_IDENTITY_SECRET = 'product-tests-only-identity-secret-12345';
const csrf = 'tests-only-csrf';
const realFetch = globalThis.fetch;
let mongo, server, origin, user, other, legacyAdmin, access;
const administrators = {};
const defaults = { revision: 0, replayEnabled: false, replaySamplePercent: 10, feedbackEnabled: false, guidanceEnabled: false, guidanceRolloutPercent: 10, guidanceExperimentEnabled: false, alertEmail: '' };
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  await Promise.all([ProductExposure.init(), ProductFeedback.init(), ProductControls.init(), AnalyticsEvent.init(), OperationalAlert.init(), EmailDelivery.init()]);
  user = await User.create({ name: 'Test Photographer', email: 'controls@example.invalid', role: 'user', accountStatus: 'active', emailVerifiedAt: new Date() });
  other = await User.create({ name: 'Other Photographer', email: 'controls-other@example.invalid', role: 'user', accountStatus: 'active', emailVerifiedAt: new Date() });
  legacyAdmin = await User.create({ name: 'Internal Account', email: 'controls-admin@example.invalid', role: 'admin', accountStatus: 'active', emailVerifiedAt: new Date() });
  const session = await Session.create({ userId: user._id, refreshTokenDigest: 'test-refresh', csrfTokenDigest: tokenDigest(csrf), expiresAt: new Date(Date.now() + 3600000) });
  access = jwt.sign({ id: String(user._id), role: 'user', sid: String(session._id) }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-web' });
  for (const role of ['superadmin', 'analyst', 'support']) {
    const admin = await AdminUser.create({ username: `controls-${role}`, name: role, password: 'testing-password-only-12345', role });
    const adminSession = new AdminSession({ adminId: admin._id, tokenDigest: 'pending', expiresAt: new Date(Date.now() + 3600000), twoFactorVerified: true });
    const token = jwt.sign({ id: String(admin._id), sid: String(adminSession._id), type: 'admin' }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-admin' });
    adminSession.tokenDigest = tokenDigest(token); await adminSession.save(); administrators[role] = token;
  }
  const app = express(); app.use(cookieParser()); app.use(express.json()); app.use('/api/v1/admin', adminRoutes); app.use('/api/v1/product', productRoutes);
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); }); origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  globalThis.fetch = realFetch;
  await adminAlertTestLimit.resetKey(`account:${jwt.decode(administrators.superadmin).id}`);
  delete process.env.ANALYTICS_EXCLUDED_USER_IDS; delete process.env.POSTHOG_ENABLED; delete process.env.OPS_ALERT_EMAIL; delete process.env.RESEND_API_KEY;
  await Promise.all([ProductControls.deleteMany({}), ProductExposure.deleteMany({}), ProductFeedback.deleteMany({}), AnalyticsEvent.deleteMany({}), OperationalAlert.deleteMany({}), EmailDelivery.deleteMany({})]);
});
after(async () => { globalThis.fetch = realFetch; await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await mongo.stop(); });
const admin = (method, body, role = 'superadmin') => fetch(`${origin}/api/v1/admin/product-controls`, { method, headers: { Authorization: `Bearer ${administrators[role]}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const client = (path, body, validCsrf = true) => fetch(`${origin}/api/v1/product/${path}`, { method: body ? 'POST' : 'GET', headers: { Cookie: `veylo_access=${access}; veylo_csrf=${csrf}`, 'x-csrf-token': validCsrf ? csrf : 'wrong', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const enable = patch => ProductControls.create({ ...defaults, ...patch });
const alertTest = (body = { revision: 0 }, role = 'superadmin') => realFetch(`${origin}/api/v1/admin/product-controls/test-alert`, { method: 'POST', headers: { Authorization: `Bearer ${administrators[role]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('test alerts require a superadmin bearer session and reject cookie-only requests', async () => {
  assert.equal((await realFetch(`${origin}/api/v1/admin/product-controls/test-alert`, { method: 'POST' })).status, 401);
  for (const role of ['analyst', 'support']) assert.equal((await alertTest({ revision: 0 }, role)).status, 403);
  assert.equal((await realFetch(`${origin}/api/v1/admin/product-controls/test-alert`, { method: 'POST', headers: { Cookie: `veylo_admin_token=${administrators.superadmin}`, 'Content-Type': 'application/json' }, body: '{"revision":0}' })).status, 403);
  assert.equal(await EmailDelivery.countDocuments(), 0);
});

test('test alerts reject browser-supplied messages, stale settings and missing provider setup', async () => {
  await enable({ alertEmail: 'alerts@example.test' });
  assert.equal((await alertTest({ revision: 0, to: 'other@example.test', subject: 'forbidden', text: 'forbidden' })).status, 400);
  await adminAlertTestLimit.resetKey(`account:${jwt.decode(administrators.superadmin).id}`);
  assert.equal((await alertTest({ revision: 1 })).status, 409);
  await adminAlertTestLimit.resetKey(`account:${jwt.decode(administrators.superadmin).id}`);
  assert.equal((await alertTest()).status, 409);
  assert.equal(await EmailDelivery.countDocuments(), 0);
});

test('test alerts use the saved address, record an audit and rate limit repeat clicks without incidents', async () => {
  await enable({ alertEmail: 'saved-alerts@example.test' });
  process.env.RESEND_API_KEY = 're_product_test_only'; process.env.OPS_ALERT_EMAIL = 'fallback@example.test';
  let sends = 0;
  globalThis.fetch = (url, options) => {
    if (!String(url).startsWith('https://api.resend.com/emails')) return realFetch(url, options);
    const message = JSON.parse(options.body);
    assert.equal(message.to, 'saved-alerts@example.test'); assert.equal(message.subject, 'Veylo alert email test');
    sends++;
    return Promise.resolve(new Response(JSON.stringify({ id: 'test-alert-accepted' }), { status: 200 }));
  };
  const result = await alertTest(); assert.equal(result.status, 202);
  assert.equal((await result.json()).data.status, 'accepted');
  assert.equal((await alertTest()).status, 429); assert.equal(sends, 1);
  assert.ok(await AdminAudit.exists({ action: 'operations.alert.test.requested' }));
  assert.equal((await EmailDelivery.findOne()).status, 'sent');
  assert.equal(await OperationalAlert.countDocuments(), 0);
});

test('the shared outbox deduplicates test sends even when another API replica accepts the request', async t => {
  const now = Date.now(); t.mock.method(Date, 'now', () => now);
  await enable({ alertEmail: 'alerts@example.test' }); process.env.RESEND_API_KEY = 're_product_test_only';
  let sends = 0;
  globalThis.fetch = (url, options) => {
    if (!String(url).startsWith('https://api.resend.com/emails')) return realFetch(url, options);
    sends++; return Promise.resolve(new Response(JSON.stringify({ id: 'test-deduplicated' }), { status: 200 }));
  };
  assert.equal((await alertTest()).status, 202);
  await adminAlertTestLimit.resetKey(`account:${jwt.decode(administrators.superadmin).id}`);
  assert.equal((await alertTest()).status, 202);
  assert.equal(sends, 1); assert.equal(await EmailDelivery.countDocuments(), 1);
});

test('a rejected test email stays failed and does not expose provider details', async () => {
  await enable({ alertEmail: 'alerts@example.test' }); process.env.RESEND_API_KEY = 're_product_test_only';
  globalThis.fetch = (url, options) => String(url).startsWith('https://api.resend.com/emails')
    ? Promise.resolve(new Response(JSON.stringify({ name: 'validation_error', message: 'test-only private provider detail' }), { status: 422 })) : realFetch(url, options);
  const result = await alertTest(); assert.equal(result.status, 502);
  assert.ok(!(await result.text()).includes('test-only private provider detail'));
  assert.equal((await EmailDelivery.findOne()).status, 'failed');
  assert.equal(await OperationalAlert.countDocuments(), 0);
});

test('controls require an administrator and only superadmin can save; strict inputs and audit apply', async () => {
  assert.equal((await fetch(`${origin}/api/v1/admin/product-controls`)).status, 401);
  assert.equal((await admin('GET', null, 'support')).status, 403);
  assert.equal((await admin('GET', null, 'analyst')).status, 200);
  assert.equal((await admin('PUT', defaults, 'analyst')).status, 403);
  assert.equal((await admin('PUT', { ...defaults, alertEmail: 'not-an-email' })).status, 400);
  assert.equal((await admin('PUT', { ...defaults, replaySamplePercent: 101 })).status, 400);
  assert.equal((await admin('PUT', { ...defaults, providerSecret: 'forbidden' })).status, 400);
  const result = await admin('PUT', { ...defaults, feedbackEnabled: true }); assert.equal(result.status, 200);
  assert.equal((await result.json()).data.revision, 1);
  assert.ok(await AdminAudit.exists({ action: 'product.controls.update' }));
  assert.equal((await admin('PUT', defaults)).status, 409);
});
test('concurrent settings changes cannot overwrite each other', async () => {
  await enable({});
  const results = await Promise.all([admin('PUT', { ...defaults, feedbackEnabled: true }), admin('PUT', { ...defaults, replayEnabled: true })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});
test('runtime defaults are off; replay requires valid provider settings and excludes internal accounts', async () => {
  assert.deepEqual(await productRuntime(user._id), { feedback: false, guidance: null, replay: null });
  await enable({ replayEnabled: true, replaySamplePercent: 100, feedbackEnabled: true });
  assert.equal((await productRuntime(user._id)).replay, null);
  process.env.POSTHOG_ENABLED = 'true'; process.env.POSTHOG_PROJECT_TOKEN = 'phc_tests_only_not_a_live_project'; process.env.POSTHOG_HOST = 'https://eu.i.posthog.com';
  const runtime = await productRuntime(user._id); assert.match(runtime.replay.distinctId, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(runtime).includes(String(user._id)));
  assert.equal((await productRuntime(legacyAdmin._id)).replay, null);
  process.env.ANALYTICS_EXCLUDED_USER_IDS = String(user._id); assert.deepEqual(await productRuntime(user._id), { feedback: false, guidance: null, replay: null });
});
test('product endpoints enforce authentication and CSRF; recording needs explicit consent', async () => {
  assert.equal((await fetch(`${origin}/api/v1/product/runtime`)).status, 401);
  assert.equal((await client('feedback', { score: 3 }, false)).status, 403);
  assert.equal((await client('replay-consent', { consent: false })).status, 400);
  assert.equal((await client('replay-consent', { consent: true })).status, 403);
});
test('feedback accepts only bounded scores, is idempotent and cannot borrow another account', async () => {
  await enable({ feedbackEnabled: true });
  assert.equal((await client('feedback', { score: 6 })).status, 400);
  assert.equal((await client('feedback', { score: 4, userId: String(other._id) })).status, 400);
  assert.equal((await client('feedback', { score: 4, message: 'private message' })).status, 400);
  assert.equal((await client('feedback', { score: 4 })).status, 202);
  assert.equal((await client('feedback', { score: 1 })).status, 202);
  const row = await ProductFeedback.findOne(); assert.equal(row.score, 4); assert.equal(String(row.userId), String(user._id));
  assert.equal(await ProductFeedback.countDocuments({}), 1); assert.equal((await productRuntime(user._id)).feedback, false);
  const event = await AnalyticsEvent.findOne({ name: 'product.feedback.submitted' }).lean();
  const payload = posthogPayload(event); assert.equal(payload.properties.score, 4); assert.doesNotMatch(JSON.stringify(payload), /private|@|userId/);
});
test('stable allocation and signed exposure protect test results from forged variants or cross-account tokens', async () => {
  await enable({ guidanceEnabled: true, guidanceRolloutPercent: 100, guidanceExperimentEnabled: true });
  assert.equal(allocation(user._id, 'purpose'), allocation(user._id, 'purpose'));
  const runtime = await productRuntime(user._id);
  assert.equal(await ProductExposure.countDocuments({}), 0);
  assert.equal((await client('exposure', { token: exposureToken(other._id, 'guided') })).status, 400);
  assert.equal((await client('exposure', { token: `${runtime.guidance.token}modified` })).status, 400);
  assert.equal((await client('exposure', { token: runtime.guidance.token })).status, 202);
  assert.equal((await client('exposure', { token: runtime.guidance.token })).status, 202);
  assert.equal(await ProductExposure.countDocuments({}), 1);
  const payload = posthogPayload(await AnalyticsEvent.findOne({ name: 'product.guidance.exposed' }).lean());
  assert.equal(payload.event, '$feature_flag_called'); assert.equal(payload.properties.$feature_flag_response, runtime.guidance.variant);
  await ProductControls.updateOne({ _id: 'product' }, { $set: { guidanceExperimentEnabled: false } });
  assert.deepEqual((await productRuntime(user._id)).guidance, { variant: 'guided', token: null });
  await ProductControls.updateOne({ _id: 'product' }, { $set: { guidanceExperimentEnabled: true } });
  assert.equal((await productRuntime(user._id)).guidance.variant, runtime.guidance.variant);
  await ProductControls.updateOne({ _id: 'product' }, { $set: { guidanceEnabled: false } });
  assert.equal((await client('exposure', { token: runtime.guidance.token })).status, 409);
});
test('experiment report counts server publications after exposure within seven days, excluding internal accounts', async () => {
  const at = new Date(Date.now() - 9 * 86400000);
  await ProductExposure.create({ userId: user._id, experiment: 'dashboard-guidance-v1', variant: 'guided', exposedAt: at });
  await ProductExposure.create({ userId: other._id, experiment: 'dashboard-guidance-v1', variant: 'control', exposedAt: at });
  await AnalyticsEvent.insertMany([
    { name: 'delivery.publish.succeeded', userId: user._id, actorType: 'photographer', source: 'client', occurredAt: new Date(+at + 1000) },
    { name: 'delivery.publish.succeeded', userId: user._id, actorType: 'photographer', source: 'server', occurredAt: new Date(+at - 1000) },
    { name: 'delivery.publish.succeeded', userId: user._id, actorType: 'photographer', source: 'server', occurredAt: new Date(+at + 8 * 86400000) },
    { name: 'delivery.publish.succeeded', userId: other._id, actorType: 'photographer', source: 'server', occurredAt: new Date(+at + 1000) }
  ]);
  let report = (await (await admin('GET')).json()).data;
  assert.equal(report.experiment.variants.find(row => row.variant === 'guided').published, 0);
  assert.equal(report.experiment.variants.find(row => row.variant === 'control').published, 1);
  process.env.ANALYTICS_EXCLUDED_USER_IDS = String(other._id);
  report = (await (await admin('GET')).json()).data; assert.equal(report.experiment.variants.length, 1);
});
test('monitor ignores forged browser upload outcomes and isolated errors; detects sustained failures', async () => {
  await AnalyticsEvent.insertMany(Array.from({ length: 8 }, () => ({ name: 'upload.failed', source: 'client', actorType: 'photographer', userId: user._id })));
  let signals = await productMonitoringSignals(); assert.equal(signals.find(row => row.key === 'product:upload-failures').failed, false);
  await AnalyticsEvent.insertMany(Array.from({ length: 5 }, (_, index) => ({ name: 'javascript.error', source: 'client', actorType: 'photographer', userId: index % 2 ? other._id : user._id })));
  signals = await productMonitoringSignals(); assert.equal(signals.find(row => row.key === 'product:browser-errors').failed, true);
  await AnalyticsEvent.insertMany(Array.from({ length: 5 }, () => ({ name: 'upload.failed', source: 'server', actorType: 'photographer', userId: user._id })));
  signals = await productMonitoringSignals(); assert.equal(signals.find(row => row.key === 'product:upload-failures').failed, true);
});
test('incidents remain visible without email credentials and recover without duplicate rows', async () => {
  const signal = { failing: true, title: 'Test product incident', severity: 'critical' };
  await updateOperationalAlert('product:test', signal); await updateOperationalAlert('product:test', signal);
  let alert = await OperationalAlert.findOne({ key: 'product:test' }); assert.equal(alert.status, 'open'); assert.equal(alert.notificationStatus, 'pending');
  await updateOperationalAlert('product:test', { ...signal, failing: false }); alert = await OperationalAlert.findById(alert._id); assert.equal(alert.status, 'resolved');
  assert.equal(await OperationalAlert.countDocuments({ key: 'product:test' }), 1);
});
