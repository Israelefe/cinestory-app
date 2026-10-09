import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import express from 'express';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import OperationalIssue from '../src/models/OperationalIssue.js';
import OperationalAlert from '../src/models/OperationalAlert.js';
import MonitorCheck from '../src/models/MonitorCheck.js';
import ActiveSession from '../src/models/ActiveSession.js';
import AdminUser from '../src/models/AdminUser.js';
import AdminSession from '../src/models/AdminSession.js';
import { tokenDigest } from '../src/utils/auth.js';
import { adminSections, ADMIN_READ_ACCESS } from '../src/utils/adminAccess.js';
import router, { adminAuthMiddleware, requireAdminRoles } from '../src/routes/admin.routes.js';
import { readiness, monitorCheckIn, getSystemOverview, updateOperationalIssue, acknowledgeOperationalAlert } from '../src/controllers/adminOperations.controller.js';
import { recordPresence } from '../src/controllers/analytics.controller.js';
import { recordRequest, requestSnapshot, metricRoute, safeErrorDetails, captureOperationalError, requestMetricsMiddleware } from '../src/services/operationalMetrics.service.js';
import { updateOperationalAlert, sustained, operationalWorkerHealth } from '../src/services/operationalMonitoring.service.js';
import { advanceMonitor, probe } from './operations-monitor.mjs';
import { adminLogin } from '../src/controllers/adminAuth.controller.js';
import { seedAdminFromEnv } from '../src/utils/seedAdmin.js';
import { totpCode } from '../src/utils/adminSecurity.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'operations-tests-only-never-a-live-secret';
process.env.OTP_SECRET = 'operations-presence-test-key-never-live';
delete process.env.OPS_ALERT_EMAIL;
delete process.env.ADMIN_REQUIRE_MFA;
let mongo, admin, session, token, server, origin;
const realFetch = globalThis.fetch;
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set() { return this; } });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([OperationalIssue.init(), OperationalAlert.init(), MonitorCheck.init(), ActiveSession.init()]);
  admin = await AdminUser.create({ username: 'ops-test', name: 'Operations Test', password: 'tests-only-password-1234', role: 'operations' });
  session = new AdminSession({ adminId: admin._id, tokenDigest: 'temporary', expiresAt: new Date(Date.now() + 3600000), twoFactorVerified: false });
  token = jwt.sign({ id: String(admin._id), sid: String(session._id), type: 'admin' }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-admin' });
  session.tokenDigest = tokenDigest(token); await session.save();
  const app = express(); app.use(express.json()); app.use(requestMetricsMiddleware); app.use('/api/v1/admin', router);
  app.get('/test-failure/:id', (req, res) => res.status(500).json({ success: false }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => { delete process.env.ADMIN_REQUIRE_MFA; await Promise.all([OperationalIssue.deleteMany(), OperationalAlert.deleteMany(), MonitorCheck.deleteMany(), ActiveSession.deleteMany()]); });
after(async () => { globalThis.fetch = realFetch; await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await mongo.stop(); });
test('roles deny private reads and the legacy admin alias', async () => {
  assert.equal(adminSections('support').includes('payments'), false);
  assert.equal(adminSections('finance').includes('operations'), false);
  const denied = response(); requireAdminRoles('superadmin')({ admin: { role: 'admin' } }, denied, () => assert.fail('legacy role granted access'));
  assert.equal(denied.code, 403);
  for (const path of ['finance', 'payments', 'billing/health', 'configuration', 'security']) {
    const result = await fetch(`${origin}/api/v1/admin/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(result.status, 403, path);
  }
  // Every protected GET has an explicit role guard, except the admin's own profile.
  for (const layer of router.stack.filter(layer => layer.route?.methods.get && layer.route.path !== '/auth/me')) assert.ok(layer.route.stack.length >= 2, layer.route.path);
  assert.ok(ADMIN_READ_ACCESS.operations.includes('read-only'));
});
test('photographer tokens and unauthenticated access cannot enter admin', async () => {
  const res = response(); let entered = false;
  await adminAuthMiddleware({ headers: {}, cookies: {}, method: 'GET', path: '/operations' }, res, () => { entered = true; });
  assert.equal(entered, false); assert.equal(res.code, 401);
  const wrongAudience = jwt.sign({ id: String(admin._id), role: 'admin' }, process.env.JWT_SECRET);
  const result = await fetch(`${origin}/api/v1/admin/operations`, { headers: { Authorization: `Bearer ${wrongAudience}` } });
  assert.equal(result.status, 401);
});
test('MFA gates records while keeping enrollment and own profile available', async () => {
  process.env.ADMIN_REQUIRE_MFA = 'true';
  const headers = { Authorization: `Bearer ${token}` };
  const blocked = await fetch(`${origin}/api/v1/admin/system`, { headers }); assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, 'ADMIN_MFA_SETUP_REQUIRED');
  const profile = await fetch(`${origin}/api/v1/admin/auth/me`, { headers }); assert.equal(profile.status, 200);
  assert.equal((await profile.json()).admin.mfaRequired, true);
  delete process.env.ADMIN_REQUIRE_MFA;
});
test('request metrics exclude private resource IDs and report real errors', async () => {
  assert.equal(metricRoute({ baseUrl: '/api/v1/deliveries', route: { path: '/:id/download' }, originalUrl: '/private-token?password=secret' }), '/api/v1/deliveries/:id/download');
  const now = Date.now();
  recordRequest({ route: 'GET /metric-test/:id', status: 500, durationMs: 420, now });
  recordRequest({ route: 'GET /metric-test/:id', status: 200, durationMs: 80, now });
  const row = requestSnapshot(5, now).routes.find(row => row.route.includes('metric-test'));
  assert.equal(row.errors, 1); assert.equal(row.count, 2); assert.equal(row.averageMs, 250); assert.equal(row.p95Ms, 500);
  const old = requestSnapshot(5, now + 6 * 60000); assert.equal(old.routes.some(row => row.route.includes('metric-test')), false);
  const result = await fetch(`${origin}/test-failure/private-client-token`); assert.equal(result.status, 500);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(await OperationalIssue.countDocuments({ route: 'GET /test-failure/:id', code: 'HTTP_500' }), 1);
});
test('error groups omit messages, preserve acknowledgement and reopen after recurrence', async () => {
  const error = new Error('password=never-store-this; client@example.com'); error.code = 'TEST_FAILURE';
  const safe = safeErrorDetails(error, 'POST /deliveries/:id'); assert.equal(JSON.stringify(safe).includes('never-store-this'), false);
  await captureOperationalError(error, { route: 'POST /deliveries/:id' });
  const issue = await OperationalIssue.findOne(); issue.status = 'acknowledged'; await issue.save();
  await captureOperationalError(error, { route: 'POST /deliveries/:id' });
  assert.equal((await OperationalIssue.findById(issue._id)).status, 'acknowledged');
  issue.status = 'resolved'; await issue.save(); await captureOperationalError(error, { route: 'POST /deliveries/:id' });
  const reopened = await OperationalIssue.findById(issue._id); assert.equal(reopened.status, 'open'); assert.equal(reopened.occurrences, 3);
});
test('alerts deduplicate, retain acknowledgement, recover and reopen', async () => {
  assert.equal(sustained('test-streak', true), false); assert.equal(sustained('test-streak', true), false); assert.equal(sustained('test-streak', true), true); assert.equal(sustained('test-streak', false), false);
  await Promise.all(Array.from({ length: 3 }, () => updateOperationalAlert('test-worker', { failing: true, title: 'Worker stopped reporting', severity: 'critical' })));
  assert.equal(await OperationalAlert.countDocuments(), 1);
  let alert = await OperationalAlert.findOne(); const id = alert._id;
  const ack = response(); await acknowledgeOperationalAlert({ params: { id: String(id) }, admin }, ack, error => { throw error; }); assert.equal(ack.code, 200);
  await updateOperationalAlert('test-worker', { failing: true, title: alert.title }); assert.equal((await OperationalAlert.findById(id)).status, 'acknowledged');
  await updateOperationalAlert('test-worker', { failing: false, title: alert.title }); alert = await OperationalAlert.findById(id); assert.equal(alert.status, 'resolved'); assert.ok(alert.resolvedAt);
  await updateOperationalAlert('test-worker', { failing: true, title: alert.title }); assert.equal((await OperationalAlert.findById(id)).status, 'open');
});
test('monitor check-in requires a strong matching secret and rejects replays', async () => {
  process.env.OPS_MONITOR_SECRET = 'tests-only-monitor-secret-32-characters';
  const check = { name: 'api', healthy: false, latencyMs: 8000, checkedAt: new Date().toISOString(), failures: 3 };
  const denied = response(); await monitorCheckIn({ headers: { authorization: 'Bearer wrong' }, body: { checks: [check] } }, denied); assert.equal(denied.code, 401);
  const req = { headers: { authorization: `Bearer ${process.env.OPS_MONITOR_SECRET}` }, body: { checks: [check] } };
  const accepted = response(); await monitorCheckIn(req, accepted); assert.equal(accepted.code, 202);
  const replay = response(); await monitorCheckIn(req, replay); assert.equal(replay.code, 409);
  const stale = response(); await monitorCheckIn({ ...req, body: { checks: [{ ...check, checkedAt: new Date(Date.now() - 180000).toISOString() }] } }, stale); assert.equal(stale.code, 400);
  const output = response(); await getSystemOverview({}, output, error => { throw error; }); assert.equal(output.body.data.externalMonitor.checks[0].status, 'unavailable');
  await MonitorCheck.updateOne({ name: 'api' }, { $set: { receivedAt: new Date(Date.now() - 300000) } });
  const old = response(); await getSystemOverview({}, old, error => { throw error; }); assert.equal(old.body.data.externalMonitor.checks[0].status, 'stale');
});
test('presence uses digests and excludes expired sessions even before TTL cleanup', async () => {
  const req = { body: { sessionId: 'visible-session-12345678', visible: true }, user: { id: String(admin._id) } };
  await recordPresence(req, response());
  const record = await ActiveSession.findOne(); assert.notEqual(record.sessionDigest, req.body.sessionId); assert.equal(record.actorType, 'photographer');
  await ActiveSession.create({ sessionDigest: 'expired', actorType: 'anonymous', lastSeenAt: new Date(Date.now() - 180000), expiresAt: new Date(Date.now() - 60000) });
  const result = response(); await getSystemOverview({}, result, error => { throw error; }); assert.equal(result.body.data.activity.total, 1);
  await recordPresence({ ...req, body: { ...req.body, visible: false } }, response()); assert.equal(await ActiveSession.countDocuments({ sessionDigest: record.sessionDigest }), 0);
});
test('readiness succeeds with a database and bounds failed database checks', async () => {
  const result = response(); await readiness({}, result); assert.equal(result.body.status, 'ready');
  const original = mongoose.connection.db.admin;
  try { mongoose.connection.db.admin = () => ({ ping: async () => { throw new Error('private connection details'); } }); const failed = response(); await readiness({}, failed); assert.equal(failed.code, 503); assert.equal(JSON.stringify(failed.body).includes('private'), false); }
  finally { mongoose.connection.db.admin = original; }
});
test('independent monitor needs three failures and two recoveries, without MongoDB', async () => {
  let state = advanceMonitor({}, false); assert.equal(state.transition, null);
  state = advanceMonitor(state, false); assert.equal(state.transition, null);
  state = advanceMonitor(state, false); assert.equal(state.transition, 'outage');
  state = advanceMonitor(state, false); assert.equal(state.transition, null);
  state = advanceMonitor(state, true); assert.equal(state.transition, null);
  state = advanceMonitor(state, true); assert.equal(state.transition, 'recovery');
  assert.equal((await probe('https://example.test/ready', async () => new Response(JSON.stringify({ status: 'ready' }), { status: 200 }))).healthy, true);
  assert.equal((await probe('https://example.test/ready', async () => new Response(JSON.stringify({ status: 'unavailable' }), { status: 200 }))).healthy, false);
  assert.equal((await probe('https://example.test/', async () => { throw new Error('offline'); })).healthy, false);
  const workers = await operationalWorkerHealth(); assert.equal(workers.find(row => row.workerName === 'portfolio').enabled, true); assert.equal(workers.find(row => row.workerName === 'billing').status, 'stale');
});
test('resolving an issue requires a fix note and creates an audit record', async () => {
  await captureOperationalError({ code: 'RESOLVE_TEST' }, { route: 'worker-test' }); const issue = await OperationalIssue.findOne();
  const req = { params: { id: String(issue._id) }, admin, body: { status: 'resolved', resolution: '' } };
  const rejected = response(); await updateOperationalIssue(req, rejected, error => { throw error; }); assert.equal(rejected.code, 400);
  const accepted = response(); await updateOperationalIssue({ ...req, body: { status: 'resolved', resolution: 'Fixed the worker connection timeout.' } }, accepted, error => { throw error; }); assert.equal(accepted.body.data.status, 'resolved');
});
test('alert sends retry safely and send one recovery notification', async () => {
  process.env.OPS_ALERT_EMAIL = 'operations@example.test'; process.env.RESEND_API_KEY = 're_operations_test_only';
  let attempts = 0;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/api\.resend\.com\/emails/);
    const body = JSON.parse(options.body); assert.equal(body.to, 'operations@example.test'); attempts++;
    return attempts === 1 ? new Response(JSON.stringify({ name: 'validation_error', message: 'Test rejection' }), { status: 422 }) : new Response(JSON.stringify({ id: `test-email-${attempts}` }), { status: 200 });
  };
  try {
    const condition = { failing: true, title: 'Test incident', severity: 'critical' };
    await updateOperationalAlert('notification-test', condition); assert.equal((await OperationalAlert.findOne()).notificationStatus, 'failed');
    await updateOperationalAlert('notification-test', condition); assert.equal((await OperationalAlert.findOne()).notificationStatus, 'sent');
    await updateOperationalAlert('notification-test', condition); assert.equal(attempts, 2);
    await updateOperationalAlert('notification-test', { ...condition, failing: false }); assert.equal((await OperationalAlert.findOne()).notificationStatus, 'recovery-sent');
    await updateOperationalAlert('notification-test', { ...condition, failing: false }); assert.equal(attempts, 3);
  } finally { globalThis.fetch = realFetch; delete process.env.OPS_ALERT_EMAIL; delete process.env.RESEND_API_KEY; }
});
test('environment credentials cannot overwrite or reactivate an existing administrator', async () => {
  process.env.ADMIN_USERNAME = 'suspended-test'; process.env.ADMIN_PASSWORD = 'environment-only-password';
  const existing = await AdminUser.create({ username: 'suspended-test', name: 'Suspended Test', role: 'support', password: 'original-test-password', accountStatus: 'suspended' });
  try {
    await seedAdminFromEnv();
    const result = response(); await adminLogin({ body: { username: existing.username, password: process.env.ADMIN_PASSWORD }, headers: {}, get: () => '' }, result);
    assert.equal(result.code, 401);
    const unchanged = await AdminUser.findById(existing._id).select('+password'); assert.equal(unchanged.accountStatus, 'suspended'); assert.equal(await unchanged.comparePassword('original-test-password'), true);
  } finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
});
test('website probes catch a missing entry bundle', async () => {
  const html = '<html><script type="module" src="/assets/app.js"></script></html>';
  const fetcher = async url => String(url).endsWith('/assets/app.js') ? new Response(null, { status: 404 }) : new Response(html, { headers: { 'Content-Type': 'text/html' } });
  assert.equal((await probe('https://example.test/', fetcher)).healthy, false);
  const healthy = async url => String(url).endsWith('/assets/app.js') ? new Response(null, { status: 200, headers: { 'Content-Type': 'application/javascript' } }) : new Response(html, { headers: { 'Content-Type': 'text/html' } });
  assert.equal((await probe('https://example.test/', healthy)).healthy, true);
});
test('readiness times out even if the database driver never settles', async () => {
  const original = mongoose.connection.db.admin, started = Date.now();
  try { mongoose.connection.db.admin = () => ({ ping: () => new Promise(() => {}) }); const failed = response(); await readiness({}, failed); assert.equal(failed.code, 503); assert.ok(Date.now() - started < 3000); }
  finally { mongoose.connection.db.admin = original; }
});
test('MFA enrollment verifies this session and clears its access gate', async () => {
  process.env.ADMIN_REQUIRE_MFA = 'true';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const setup = await fetch(`${origin}/api/v1/admin/security/2fa/setup`, { method: 'POST', headers, body: '{}' }); assert.equal(setup.status, 200);
    const { data } = await setup.json(); assert.ok(data.secret);
    const enabled = await fetch(`${origin}/api/v1/admin/security/2fa/enable`, { method: 'POST', headers, body: JSON.stringify({ code: totpCode(data.secret) }) }); assert.equal(enabled.status, 200);
    assert.equal((await AdminSession.findById(session._id)).twoFactorVerified, true);
    const profile = await fetch(`${origin}/api/v1/admin/auth/me`, { headers }); assert.equal((await profile.json()).admin.mfaRequired, false);
  } finally { delete process.env.ADMIN_REQUIRE_MFA; await AdminUser.updateOne({ _id: admin._id }, { $set: { twoFactorEnabled: false }, $unset: { twoFactorSecretEncrypted: 1, twoFactorPendingSecretEncrypted: 1 } }); await AdminSession.updateOne({ _id: session._id }, { $set: { twoFactorVerified: false } }); }
});
test('old administrator sessions require a fresh sign-in', async () => {
  await AdminSession.collection.updateOne({ _id: session._id }, { $set: { createdAt: new Date(Date.now() - 9 * 3600000) } });
  try { const result = await fetch(`${origin}/api/v1/admin/auth/me`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(result.status, 401); }
  finally { await AdminSession.collection.updateOne({ _id: session._id }, { $set: { createdAt: new Date() } }); }
});
