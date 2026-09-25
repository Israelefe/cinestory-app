import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Session from '../src/models/Session.js';
import Delivery from '../src/models/Delivery.js';
import WorkerHeartbeat from '../src/models/WorkerHeartbeat.js';
import { tokenDigest } from '../src/utils/auth.js';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const runtimeDir = resolve(serverDir, '../.runtime');
const secret = crypto.randomBytes(32).toString('hex');
let mongo, cwd;
before(async () => {
  await mkdir(runtimeDir, { recursive: true });
  cwd = await mkdtemp(join(runtimeDir, 'delivery-startup-'));
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: join(runtimeDir, 'mongodb') } });
  await mongoose.connect(mongo.getUri());
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (cwd) await rmdir(cwd);
});

async function startAPI(t, settings = {}) {
  // No inherited application settings or .env: reproduce an existing production
  // service which has the old delivery settings but none of the new flags.
  const platform = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|userprofile)$/i.test(key)));
  const child = spawn(process.execPath, ['--import', new URL('./fixtures/delivery-startup-providers.mjs', import.meta.url).href, join(serverDir, 'server.js')], {
    cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...platform, NODE_ENV: 'production', PORT: '0', MONGODB_URI: mongo.getUri(),
      JWT_SECRET: secret, OTP_SECRET: secret, CLIENT_URL: 'https://test.example',
      RESEND_API_KEY: 're_test', TURNSTILE_SECRET_KEY: 'test', GOOGLE_CLIENT_ID: 'test',
      CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'test', CLOUDINARY_API_SECRET: 'test',
      ALIBABA_MODEL_STUDIO_API_KEY: 'test', ALIBABA_WORKSPACE_ID: 'test', ALIBABA_BASE_URL: 'https://test.aliyuncs.com/v1',
      DEEPGRAM_API_KEY: 'test', DELIVERY_PIPELINE_ENABLED: 'true',
      DELIVERY_WORKER_CONCURRENCY: '4', DELIVERY_AI_CONCURRENCY: '6', DELIVERY_VISION_BATCH_SIZE: '12', DELIVERY_CAPTION_BATCH_SIZE: '8',
      ...settings
    }
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  });
  for (let i = 0; i < 300; i++) {
    const port = output.match(/Server running at http:\/\/localhost:(\d+)/)?.[1];
    if (port) return { url: `http://127.0.0.1:${port}`, pid: child.pid };
    assert.equal(child.exitCode, null, output);
    await delay(100);
  }
  assert.fail(`API did not start: ${output}`);
}

async function account() {
  const user = await User.create({ name: 'Test photographer', email: `${crypto.randomUUID()}@test.example`, accountStatus: 'active', emailVerifiedAt: new Date(), plan: 'pro', planOverride: { plan: 'pro' } });
  const csrf = crypto.randomBytes(32).toString('hex');
  const session = await Session.create({ userId: user._id, csrfTokenDigest: tokenDigest(csrf), refreshTokenDigest: tokenDigest(crypto.randomUUID()), expiresAt: new Date(Date.now() + 60000) });
  const token = jwt.sign({ id: String(user._id), sid: String(session._id), role: 'user' }, secret, { issuer: 'veylo-api', audience: 'veylo-web', expiresIn: '1m' });
  return { user, headers: { Authorization: `Bearer ${token}`, Cookie: `veylo_csrf=${csrf}`, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } };
}

async function request(api, path, headers, body) {
  const response = await fetch(`${api.url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const payload = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

test('production API creates, prepares and publishes v3 with no new environment variables or separate worker', { timeout: 60000 }, async t => {
  const api = await startAPI(t);
  const health = await request(api, '/health');
  assert.deepEqual(health.delivery, { pipelineVersion: 3, workerMode: 'embedded', embeddedWorkerStarted: true });
  const { user, headers } = await account();
  const config = await request(api, '/api/v1/deliveries/configuration', headers);
  assert.equal(config.data.pipelineVersion, 3);
  const created = await request(api, '/api/v1/deliveries', headers, { clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 30th birthday shoot" });
  assert.equal(created.data.schemaVersion, 3);
  const id = created.data._id;
  // Storage is outside this startup regression; seed verified asset metadata.
  await Delivery.updateOne({ _id: id }, { $set: { sourceVersion: 1, assets: Array.from({ length: 10 }, (_, i) => ({ assetId: crypto.randomUUID(), publicId: `veylo/users/${user._id}/deliveries/${id}/${i}`, sortOrder: i, width: 1000, height: 1600, format: 'jpg', bytes: 1000 })) } });
  await request(api, `/api/v1/deliveries/${id}/prepare`, headers, { format: 'photo-story' });
  let status;
  for (let i = 0; i < 120; i++) {
    status = (await request(api, `/api/v1/deliveries/${id}/preparation`, headers)).data;
    if (status.state === 'ready') break;
    await delay(100);
  }
  assert.equal(status.state, 'ready', JSON.stringify(status));
  assert.equal(status.photographs.completed, 10);
  const draft = await Delivery.findById(id);
  assert.ok(draft.draftRevisionId);
  assert.ok(await WorkerHeartbeat.exists({ workerName: 'delivery-preparation', instance: new RegExp(`:${api.pid}$`) }));
  const published = await request(api, `/api/v1/deliveries/${id}/presentation/publish`, headers, { revisionId: String(draft.draftRevisionId) });
  const publicDelivery = await request(api, `/api/v1/deliveries/public/${published.data.publicId}`);
  assert.equal(publicDelivery.data.schemaVersion, 3);
  assert.equal(publicDelivery.data.presentationOrder.length, 10);
  assert.equal(publicDelivery.data.title, 'Ada at 30');
  assert.equal(publicDelivery.data.brief, undefined);
});

test('explicit rollback selects v2 and still starts the worker for existing v3 drafts', { timeout: 40000 }, async t => {
  const api = await startAPI(t, { DELIVERY_V3_ENABLED: 'false' });
  const { headers } = await account();
  assert.equal((await request(api, '/api/v1/deliveries/configuration', headers)).data.pipelineVersion, 2);
  for (let i = 0; i < 50; i++) {
    if (await WorkerHeartbeat.exists({ workerName: 'delivery-preparation', instance: new RegExp(`:${api.pid}$`) })) return;
    await delay(100);
  }
  assert.fail('Existing v3 drafts lost their worker during rollback');
});

test('explicit external-worker and pipeline-disabled settings are respected', { timeout: 70000 }, async t => {
  for (const settings of [{ DELIVERY_WORKER_EMBEDDED: 'false' }, { DELIVERY_PIPELINE_ENABLED: 'false' }]) {
    const api = await startAPI(t, settings);
    const health = await request(api, '/health');
    assert.equal(health.delivery.workerMode, settings.DELIVERY_WORKER_EMBEDDED === 'false' ? 'external' : 'disabled');
    assert.equal(health.delivery.embeddedWorkerStarted, false);
    await delay(1200);
    assert.equal(await WorkerHeartbeat.countDocuments({ workerName: { $in: ['delivery', 'delivery-preparation'] }, instance: new RegExp(`:${api.pid}$`) }), 0);
  }
});
