import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MonitorRunner, monitorConfig } from './monitor.mjs';
import { probe } from '../../server/src/utils/uptimeMonitor.js';

const settings = { OPS_MONITOR_API_URL: 'https://api.example.test', OPS_MONITOR_WEBSITE_URL: 'https://website.example.test',
  OPS_MONITOR_SECRET: 'test-only-monitor-secret-not-a-live-key', OPS_ALERT_EMAIL: 'alerts@example.test',
  RESEND_API_KEY: 're_test_only', RESEND_FROM_EMAIL: 'Veylo <alerts@example.test>' };

function fixture() {
  let clock = Date.parse('2026-10-10T12:00:00Z'), record, sequence = 0;
  const emails = [], reports = [], logs = [], calls = [];
  const control = { apiHealthy: true, websiteHealthy: true, providerHealthy: true, checkInHealthy: true, failFinalWrite: false };
  let writes = 0;
  const storage = {
    async get() { return structuredClone(record); },
    async put(key, value) {
      writes++;
      if (control.failFinalWrite && writes % 2 === 0) throw new Error('Simulated interruption after provider acceptance');
      record = structuredClone(value);
    }
  };
  const fetcher = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options });
    assert.equal(options.redirect, 'manual');
    if (url === 'https://api.resend.com/emails') {
      assert.ok(record.targets.api?.pending || record.targets.website?.pending, 'pending send is durable before provider contact');
      emails.push({ ...JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
      return new Response('{}', { status: control.providerHealthy ? 200 : 503 });
    }
    if (url.endsWith('/api/v1/admin/monitoring/check-in')) {
      reports.push(JSON.parse(options.body));
      assert.equal(options.headers.Authorization, `Bearer ${settings.OPS_MONITOR_SECRET}`);
      return new Response(null, { status: control.checkInHealthy ? 202 : 503 });
    }
    assert.equal(options.headers?.Authorization, undefined, 'probes never receive shared or provider secrets');
    if (url.endsWith('/ready')) return Response.json({ status: control.apiHealthy ? 'ready' : 'unavailable' }, { status: control.apiHealthy ? 200 : 503 });
    if (url.endsWith('/assets/app.js')) return new Response(null, { status: control.websiteHealthy ? 200 : 404, headers: { 'content-type': 'application/javascript' } });
    assert.equal(url, settings.OPS_MONITOR_WEBSITE_URL);
    return new Response('<html><script type="module" src="/assets/app.js"></script></html>', { headers: { 'content-type': 'text/html' } });
  };
  const make = (env = settings) => new MonitorRunner(storage, env, { fetcher, now: () => clock, uuid: () => `test-notification-${++sequence}`, log: value => logs.push(value) });
  return { control, emails, reports, logs, calls, storage, make, now: () => clock, state: () => structuredClone(record),
    async tick(runner, minutes = 1) { clock += minutes * 60000; return runner.run(clock); } };
}

test('configuration rejects missing secrets, weak keys, unsafe URLs and multiple recipients without exposing values', () => {
  for (const key of Object.keys(settings)) assert.throws(() => monitorConfig({ ...settings, [key]: '' }), new RegExp(key));
  assert.throws(() => monitorConfig({ ...settings, OPS_MONITOR_SECRET: 'short' }), /at least 32/);
  for (const url of ['http://example.test', 'https://127.0.0.1', 'https://192.168.1.1', 'https://example.test/?secret=private', 'https://user:private@example.test', 'https://example.test/ready']) {
    assert.throws(() => monitorConfig({ ...settings, OPS_MONITOR_API_URL: url }), error => !error.message.includes('private') && error.message.includes('OPS_MONITOR_API_URL'));
  }
  assert.throws(() => monitorConfig({ ...settings, OPS_ALERT_EMAIL: 'one@example.test,two@example.test' }), /one email address/);
  assert.throws(() => monitorConfig({ ...settings, RESEND_FROM_EMAIL: 'Veylo\r\nBcc: private' }), /verified sender/);
});

test('successful probes report both targets without sending emails or storing secrets', async () => {
  const f = fixture(); const result = await f.tick(f.make());
  assert.equal(result.reported, true); assert.equal(result.checks.length, 2);
  assert.ok(result.checks.every(check => check.healthy)); assert.equal(f.emails.length, 0);
  assert.equal(f.reports.length, 1);
  for (const secret of [settings.OPS_MONITOR_SECRET, settings.RESEND_API_KEY]) {
    assert.equal(JSON.stringify(f.state()).includes(secret), false);
    assert.equal(JSON.stringify(f.logs).includes(secret), false);
  }
});

test('three failures send one outage and two successes send one recovery across restarts', async () => {
  const f = fixture(); f.control.apiHealthy = false;
  await f.tick(f.make()); await f.tick(f.make()); assert.equal(f.emails.length, 0);
  await f.tick(f.make()); assert.equal(f.emails.length, 1); assert.equal(f.emails[0].subject, 'Veylo api: unavailable');
  await f.tick(f.make()); assert.equal(f.emails.length, 1);
  f.control.apiHealthy = true;
  await f.tick(f.make()); assert.equal(f.emails.length, 1);
  await f.tick(f.make()); assert.equal(f.emails.length, 2); assert.equal(f.emails[1].subject, 'Veylo api: recovered');
  await f.tick(f.make()); assert.equal(f.emails.length, 2);
});

test('website bundle failures alert even when HTML and API remain healthy', async () => {
  const f = fixture(); f.control.websiteHealthy = false;
  for (let i = 0; i < 3; i++) await f.tick(f.make());
  assert.deepEqual(f.emails.map(email => email.subject), ['Veylo website: unavailable']);
  assert.equal(f.state().targets.api.incident, false);
});

test('outage emails work when the API rejects every check-in', async () => {
  const f = fixture(); f.control.apiHealthy = false; f.control.checkInHealthy = false;
  for (let i = 0; i < 3; i++) assert.equal((await f.tick(f.make())).reported, false);
  assert.equal(f.emails.length, 1);
  assert.equal(f.logs.filter(log => log.event === 'monitor.check-in.failed').length, 3);
});

test('provider retries preserve the exact payload and idempotency key across restarts', async () => {
  const f = fixture(); f.control.apiHealthy = false; f.control.providerHealthy = false;
  for (let i = 0; i < 4; i++) await f.tick(f.make());
  assert.equal(f.emails.length, 2); assert.deepEqual(f.emails[0], f.emails[1]);
  f.control.providerHealthy = true; await f.tick(f.make());
  assert.deepEqual(f.emails[2], f.emails[0]); assert.equal(f.state().targets.api.pending, null);
  await f.tick(f.make()); assert.equal(f.emails.length, 3);
});

test('interruption after provider acceptance retries the persisted key instead of creating another notification', async () => {
  const f = fixture(); f.control.apiHealthy = false;
  await f.tick(f.make()); await f.tick(f.make());
  f.control.failFinalWrite = true;
  await assert.rejects(() => f.tick(f.make()), /Simulated interruption/);
  f.control.failFinalWrite = false;
  await f.tick(f.make());
  assert.equal(f.emails.length, 2); assert.deepEqual(f.emails[0], f.emails[1]);
});

test('a rejected outage is cancelled after recovery instead of sending stale emails', async () => {
  const f = fixture(); f.control.apiHealthy = false; f.control.providerHealthy = false;
  for (let i = 0; i < 3; i++) await f.tick(f.make());
  f.control.apiHealthy = true;
  await f.tick(f.make()); const attempts = f.emails.length;
  await f.tick(f.make()); assert.equal(f.emails.length, attempts);
  assert.equal(f.state().targets.api.pending, null);
});

test('duplicate, stale and overlapping schedule events cannot advance failure streaks', async () => {
  const f = fixture(); f.control.apiHealthy = false;
  const runner = f.make();
  await f.tick(runner); const calls = f.calls.length;
  assert.equal((await runner.run(f.now())).skipped, true);
  assert.equal((await runner.run(f.now() - 180000)).skipped, true);
  assert.equal(f.calls.length, calls);
  const first = runner.run(f.now() + 60000);
  assert.equal((await runner.run(f.now() + 60000)).skipped, true);
  await first;
  assert.equal(f.state().targets.api.failures, 2);
});

test('changing the configured target resets streaks and expired email attempts stop before the provider deduplication window ends', async () => {
  const f = fixture(); f.control.apiHealthy = false; f.control.providerHealthy = false;
  for (let i = 0; i < 3; i++) await f.tick(f.make());
  await f.tick(f.make(), 23 * 60); assert.equal(f.emails.length, 1);
  assert.ok(f.logs.some(log => log.event === 'monitor.notification.expired'));
  await f.tick(f.make({ ...settings, OPS_ALERT_EMAIL: 'new-alerts@example.test' }));
  assert.equal(f.state().targets.api.failures, 1);
});

test('a monitoring gap resets incomplete streaks while retaining an already opened incident', async () => {
  const f = fixture(); f.control.apiHealthy = false;
  await f.tick(f.make()); await f.tick(f.make());
  await f.tick(f.make(), 5); assert.equal(f.emails.length, 0); assert.equal(f.state().targets.api.failures, 1);
  await f.tick(f.make()); await f.tick(f.make()); assert.equal(f.emails.length, 1);
  await f.tick(f.make(), 5); assert.equal(f.emails.length, 1); assert.equal(f.state().targets.api.incident, true);
});

test('probes reject fake readiness, cross-origin scripts, bad bundles, malformed bodies and oversized pages', async () => {
  for (const response of [Response.json({ status: 'unavailable' }), new Response('not json'), new Response('x'.repeat(8193))]) {
    assert.equal((await probe('https://example.test/ready', async () => response)).healthy, false);
  }
  let calls = 0;
  assert.equal((await probe('https://example.test/', async () => {
    calls++; return new Response('<script src="https://other.test/assets/app.js"></script>', { headers: { 'content-type': 'text/html' } });
  })).healthy, false); assert.equal(calls, 1);
  assert.equal((await probe('https://example.test/', async () => new Response('x'.repeat(262145), { headers: { 'content-type': 'text/html' } }))).healthy, false);
  assert.equal((await probe('https://example.test/ready', async (url, options) => {
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://other.test/' } });
  })).healthy, false);
});
