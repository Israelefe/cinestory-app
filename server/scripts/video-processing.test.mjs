import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createVideoContainerServer } from '../src/services/videoContainer.service.js';
import { processingAuthorized } from '../src/services/videoProcessingAuth.js';
import { authorized, apiRequest, containerEnvironment, processingClasses, processingLimits, reserveCredit, handleProcessing } from '../../cloudflare/video-processing/processing.js';

const secret = crypto.randomBytes(32).toString('hex');
const env = () => ({ VIDEO_PROCESSING_SECRET: secret, VIDEO_PLAYBACK_SECRET: secret,
  MONGODB_URI: 'mongodb://test.invalid/test', R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test',
  VIDEO_PLAYBACK_WORKER_URL: 'https://media.example.test', VEYLO_API_ORIGIN: 'https://api.example.test', VIDEO_MAX_CONTAINERS: '4' });
const request = (path, body) => new Request('https://internal/' + path, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('processing API uses Worker-compatible redirects and rejects redirects without forwarding secrets', async t => {
  let redirect = false; const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, 'Bearer ' + secret);
    return redirect ? new Response(null, { status: 302, headers: { Location: 'https://other.example/collect' } }) : Response.json({ success: true, data: { pending: 0 } });
  });
  assert.deepEqual(await apiRequest(env(), 'status'), { pending: 0 });
  redirect = true;
  await assert.rejects(apiRequest(env(), 'status'), /Video API unavailable/);
  assert.deepEqual(calls, Array(2).fill('https://api.example.test/api/v1/videos/processing/status'));
});

test('processing entry points reject anonymous callers and ignore supplied jobs', async () => {
  assert.equal(processingAuthorized(undefined, secret), false);
  assert.equal(processingAuthorized('Bearer wrong', secret), false);
  assert.equal(processingAuthorized('Bearer ' + secret, secret), true);
  assert.equal(await authorized(request('dispatch', {}), secret), false);
  assert.equal((await handleProcessing(request('dispatch', {}), env())).status, 401);
  let called;
  const bindings = { ...env(), VIDEO_COORDINATOR: { idFromName: value => value, get: () => ({ fetch: async (...args) => { called = args; return Response.json({ success: true }); } }) } };
  const req = new Request('https://worker/dispatch', { method: 'POST', headers: { Authorization: 'Bearer ' + secret }, body: JSON.stringify({ command: 'anything', userId: 'someone else' }) });
  assert.equal((await handleProcessing(req, bindings)).status, 200);
  assert.equal(called[1].body, undefined);
  assert.equal((await handleProcessing(request('credit', {}), bindings)).status, 404);
});

test('runtime credentials use an explicit allowlist and limits fail closed', () => {
  const values = containerEnvironment({ ...env(), JWT_SECRET: 'do-not-forward', STRIPE_SECRET_KEY: 'do-not-forward', OTHER_BINDING: {} });
  assert.equal(values.JWT_SECRET, undefined);
  assert.equal(values.STRIPE_SECRET_KEY, undefined);
  assert.equal(values.OTHER_BINDING, undefined);
  assert.equal(values.NODE_ENV, 'production');
  assert.throws(() => containerEnvironment({ ...env(), MONGODB_URI: '' }));
  for (const value of ['0', '5', '1.5', 'garbage']) assert.throws(() => processingLimits({ VIDEO_MAX_CONTAINERS: value }));
  assert.throws(() => processingLimits({ VIDEO_DAILY_CONTAINER_SECONDS: '0' }));
});

test('production encoder forwards the enabled delivery access flags used by the API', () => {
  const config = readFileSync(new URL('../../cloudflare/video-processing/wrangler.toml', import.meta.url), 'utf8');
  const flags = Object.fromEntries(['VIDEO_DELIVERY_ENABLED', 'VIDEO_DELIVERY_PUBLIC', 'VIDEO_DELIVERY_QUALIFIED'].map(key => {
    const value = config.match(new RegExp('^' + key + '\\s*=\\s*"([^"]+)"', 'm'))?.[1];
    assert.equal(value, 'true', key + ' must match the public production rollout');
    return [key, value];
  }));
  const values = containerEnvironment({ ...env(), ...flags });
  for (const [key, value] of Object.entries(flags)) assert.equal(values[key], value);
});

test('daily credits bound concurrent slots, renewals, crashes and UTC rollover', () => {
  const now = Date.UTC(2026, 9, 11, 12);
  let result = reserveCredit(null, { slot: 0, run: 'one', now, dailySeconds: 150 });
  assert.equal(result.allowed, true);
  assert.equal(result.ledger.reservedSeconds, 90);
  result = reserveCredit(result.ledger, { slot: 0, run: 'one', now, dailySeconds: 150 });
  assert.equal(result.ledger.reservedSeconds, 90, 'duplicate credit request must be idempotent');
  result = reserveCredit(result.ledger, { slot: 0, run: 'one', now: now + 30_000, dailySeconds: 150 });
  assert.equal(result.ledger.reservedSeconds, 120);
  const denied = reserveCredit(structuredClone(result.ledger), { slot: 1, run: 'two', now: now + 30_000, dailySeconds: 150 });
  assert.equal(denied.allowed, false);
  const crashed = reserveCredit(structuredClone(result.ledger), { slot: 0, run: 'replacement', now: now + 40_000, dailySeconds: 150 });
  assert.equal(crashed.allowed, false, 'a crashed grant cannot be refunded');
  result = reserveCredit(result.ledger, { slot: 0, run: 'new-day', now: now + 86400_000, dailySeconds: 150 });
  assert.equal(result.allowed, true);
  assert.equal(result.ledger.reservedSeconds, 90);
});

test('container HTTP control allows one pump and requires a bounded lease', async () => {
  const previous = process.env.VIDEO_PROCESSING_SECRET;
  process.env.VIDEO_PROCESSING_SECRET = secret;
  let release; let count = 0; let active = 0; let maxActive = 0;
  const held = new Promise(resolve => { release = resolve; });
  const server = createVideoContainerServer({ heartbeat: async () => {}, terminate: () => {}, runJob: async () => {
    count++; active++; maxActive = Math.max(maxActive, active);
    if (count === 1) await held;
    active--; return count === 1;
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  const call = (path, body, auth = true) => fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(auth ? { Authorization: 'Bearer ' + secret } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    assert.equal((await call('/run', {}, false)).status, 401);
    assert.equal(count, 0);
    assert.equal((await call('/lease', { until: Date.now() + 100_000 })).status, 400);
    assert.equal((await call('/lease', { until: Date.now() + 60_000 })).status, 200);
    await Promise.all([call('/run', {}), call('/run', {})]);
    assert.equal(count, 1);
    assert.equal((await (await call('/status')).json()).busy, true);
    release();
    for (let i = 0; i < 20; i++) { if (!(await (await call('/status')).json()).busy) break; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.equal(count, 2);
    assert.equal(maxActive, 1);
    assert.equal((await (await call('/status')).json()).lastWorked, false);
  } finally {
    release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.VIDEO_PROCESSING_SECRET; else process.env.VIDEO_PROCESSING_SECRET = previous;
  }
});

class Storage {
  values = new Map(); alarm;
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { this.values.delete(key); }
  async setAlarm(value) { this.alarm = value; }
  async deleteAlarm() { this.alarm = undefined; }
  async transaction(fn) { return fn(this); }
}
function harness() {
  const environment = env();
  class Base { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
  const classes = processingClasses(Base);
  const context = container => ({ storage: new Storage(), container, waitUntil: () => {}, blockConcurrencyWhile: fn => fn() });
  const coordinator = new classes.Coordinator(context(), environment);
  const stub = object => ({ fetch: (input, options) => object.fetch(new Request(input, options)) });
  environment.VIDEO_COORDINATOR = { idFromName: value => value, get: () => stub(coordinator) };
  const slots = [];
  environment.VIDEO_ENCODERS = { idFromName: value => value, get: name => {
    const index = Number(name.split('-')[1]);
    if (!slots[index]) {
      const container = { running: false, starts: 0, destroys: 0, busy: false,
        start() { this.starts++; this.running = true; },
        async destroy() { this.destroys++; this.running = false; },
        async setInactivityTimeout() {}, async monitor() {},
        getTcpPort() { return { fetch: async (url) => {
          if (url.endsWith('/run')) { container.busy = true; return Response.json({ busy: true }, { status: 202 }); }
          return Response.json({ ready: true, busy: container.busy });
        } }; }
      };
      slots[index] = new classes.Encoder(context(container), environment);
    }
    return stub(slots[index]);
  } };
  return { environment, coordinator, slots };
}

test('scheduler stays asleep when empty, scales within both caps and stops idle encoders', async () => {
  const originalFetch = globalThis.fetch;
  const { environment, coordinator, slots } = harness();
  let pending = 0;
  globalThis.fetch = async () => Response.json({ success: true, data: { pending, concurrency: 2 } });
  try {
    await coordinator.ctx.storage.put('verifiedAt', Date.now());
    await coordinator.dispatch();
    assert.equal(slots.reduce((sum, item) => sum + item.ctx.container.starts, 0), 0);
    pending = 10;
    await coordinator.dispatch();
    assert.equal(slots.filter(item => item.ctx.container.running).length, 2);
    await coordinator.dispatch();
    assert.equal(slots.reduce((sum, item) => sum + item.ctx.container.starts, 0), 2, 'repeat dispatch must not restart busy containers');
    slots[0].ctx.container.busy = false;
    pending = 0;
    await coordinator.dispatch();
    assert.equal(slots[0].ctx.container.running, false);
    assert.equal(slots[0].ctx.storage.alarm, undefined);
    environment.VIDEO_MAX_CONTAINERS = '1';
    await coordinator.dispatch();
    assert.equal(slots[1].ctx.container.running, false, 'lowering cap must stop out-of-range slots');
  } finally { globalThis.fetch = originalFetch; }
});

test('cold-start probe verifies the encoder before launching jobs, budget exhaustion stops it', async () => {
  const originalFetch = globalThis.fetch;
  const { environment, coordinator, slots } = harness();
  environment.VIDEO_DAILY_CONTAINER_SECONDS = '90';
  let verifiedStatus = false;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/status') && JSON.parse(options.body).verifiedAt > 0) verifiedStatus = true;
    return Response.json({ success: true, data: { pending: 0, concurrency: 1 } });
  };
  try {
    await coordinator.dispatch();
    assert.equal(slots[0].ctx.container.starts, 1);
    assert.equal(verifiedStatus, true);
    const ledger = await coordinator.ctx.storage.get('ledger');
    ledger.reservedSeconds = 90;
    ledger.grants[0].until = Date.now() - 1;
    await coordinator.ctx.storage.put('ledger', ledger);
    await slots[0].alarm();
    assert.equal(slots[0].ctx.container.running, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('failed startup and excessive job runtime cannot keep a paid VM alive', async () => {
  const { coordinator, environment, slots } = harness();
  environment.VIDEO_ENCODERS.get('slot-0');
  const slot = slots[0];
  slot.ctx.container.running = true;
  slot.ctx.container.getTcpPort = () => ({ fetch: async () => { throw new Error('private provider error'); } });
  await slot.ctx.storage.put('run', { id: crypto.randomUUID(), slot: 0, startedAt: Date.now() - 130_000, launched: false });
  await slot.alarm();
  assert.equal(slot.ctx.container.running, false);
  slot.ctx.container.running = true;
  await slot.ctx.storage.put('run', { id: crypto.randomUUID(), slot: 0, startedAt: Date.now() - 21601_000, launched: true });
  await slot.alarm();
  assert.equal(slot.ctx.container.running, false);
  assert.equal((await coordinator.snapshot()).reservedSeconds, 90);
});
