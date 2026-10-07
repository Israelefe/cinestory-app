import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import worker from '../../cloudflare/delivery-images/worker.js';
import { checkDeliveryImageWorker, confirmUploadedAsset, createUploadSignature } from '../src/services/deliveryMedia.service.js';

const userId = '507f1f77bcf86cd799439011';
const deliveryId = '507f1f77bcf86cd799439012';
const uploadId = '00000000-0000-4000-8000-000000000001';

function settings(t, overrides = {}) {
  const values = {
    R2_ACCOUNT_ID: 'test-account', R2_ACCESS_KEY_ID: 'test-access',
    R2_SECRET_ACCESS_KEY: 'test-storage-secret', R2_BUCKET_NAME: 'test-bucket',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    R2_IMAGE_WORKER_URL: 'https://images.example.test',
    R2_IMAGE_WORKER_SECRET: crypto.randomBytes(32).toString('hex'),
    ...overrides
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  return values;
}

function workerFetch(t, { secret = process.env.R2_IMAGE_WORKER_SECRET, object = null } = {}) {
  const calls = [];
  const env = {
    IMAGE_SIGNING_SECRET: secret,
    DELIVERY_MEDIA: { async get() { return object; } },
    IMAGES: { async info() { return { format: 'jpeg', width: 1200, height: 800 }; } }
  };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: new URL(url), method: options?.method || 'GET' });
    if (new URL(url).hostname === 'images.example.test') {
      return worker.fetch(new Request(url), env, {});
    }
    assert.equal(options?.method, 'HEAD', 'Confirmation must not download or delete the R2 original');
    return new Response(null, { headers: { 'content-length': '1234', 'content-type': 'image/jpeg', etag: '"test-etag"' } });
  });
  return calls;
}

test('the API and deployed Worker agree on signatures before any photo transfer', async t => {
  settings(t);
  const calls = workerFetch(t);
  await checkDeliveryImageWorker({ userId, deliveryId });
  assert.equal(calls.length, 1);
  const [payload] = calls[0].url.pathname.split('/').at(-1).split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.match(claims.key, new RegExp(`^veylo/users/${userId}/deliveries/${deliveryId}/__connection_`));
  assert.equal(claims.preset, 'info');
});

test('six uploads share one successful connection check', async t => {
  settings(t);
  const calls = workerFetch(t);
  await Promise.all(Array.from({ length: 6 }, () => checkDeliveryImageWorker({ userId, deliveryId })));
  await checkDeliveryImageWorker({ userId, deliveryId });
  assert.equal(calls.length, 1);
});

test('different private secrets block uploads with 503 instead of triggering sign-in refresh', async t => {
  settings(t);
  const calls = workerFetch(t, { secret: crypto.randomBytes(32).toString('hex') });
  await assert.rejects(checkDeliveryImageWorker({ userId, deliveryId }), { status: 503, code: 'DELIVERY_IMAGE_WORKER_AUTH' });
  assert.equal(calls.length, 1);
});

test('a rejected metadata check leaves the uploaded R2 original available for recovery', async t => {
  settings(t);
  const calls = workerFetch(t, { secret: crypto.randomBytes(32).toString('hex') });
  const signature = createUploadSignature({ userId, deliveryId, uploadId, contentType: 'image/jpeg' });
  await assert.rejects(confirmUploadedAsset({ userId, deliveryId, ...signature }), error => {
    assert.equal(error.status, 503);
    assert.equal(error.code, 'DELIVERY_IMAGE_WORKER_AUTH');
    assert.doesNotMatch(error.message, /expired|sign in|refresh/i);
    return true;
  });
  assert.deepEqual(calls.map(call => call.method), ['HEAD', 'GET']);
});

test('successful confirmation checks metadata without downloading the original to Render', async t => {
  settings(t);
  const calls = workerFetch(t, { object: { size: 1234, body: new ReadableStream(), httpMetadata: { contentType: 'image/jpeg' } } });
  const signature = createUploadSignature({ userId, deliveryId, uploadId, contentType: 'image/jpeg' });
  const asset = await confirmUploadedAsset({ userId, deliveryId, ...signature });
  assert.equal(asset.width, 1200);
  assert.equal(asset.height, 800);
  assert.equal(asset.hashAlgorithm, 'r2-etag');
  assert.equal(asset.etag, 'test-etag');
  assert.deepEqual(calls.map(call => call.method), ['HEAD', 'GET']);
});

test('accidental whitespace around the Render secret does not change its signature', async t => {
  const secret = crypto.randomBytes(32).toString('hex');
  settings(t, { R2_IMAGE_WORKER_SECRET: ` ${secret}\n` });
  workerFetch(t, { secret });
  await checkDeliveryImageWorker({ userId, deliveryId });
});

test('a wrong Worker URL is not mistaken for a successful connection', async t => {
  settings(t);
  t.mock.method(globalThis, 'fetch', async () => new Response('Not found', { status: 404 }));
  await assert.rejects(checkDeliveryImageWorker({ userId, deliveryId }), { status: 503, code: 'DELIVERY_IMAGE_WORKER_UNAVAILABLE' });
});

test('a failed connection check returns a service error before photos are transferred', async t => {
  settings(t);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Connection interrupted'); });
  await assert.rejects(checkDeliveryImageWorker({ userId, deliveryId }), { status: 503, code: 'DELIVERY_IMAGE_WORKER_UNAVAILABLE' });
});

test('R2 uploads retain the existing fallback when no image Worker is configured', async t => {
  settings(t, { R2_IMAGE_WORKER_URL: '', R2_IMAGE_WORKER_SECRET: '' });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('No Worker should be requested'); });
  await checkDeliveryImageWorker({ userId, deliveryId });
  assert.equal(createUploadSignature({ userId, deliveryId, uploadId, contentType: 'image/jpeg' }).maxConcurrentUploads, 2);
});

test('configured delivery photo uploads permit adaptive concurrency up to ten and expose permission expiry', t => {
  settings(t);
  const signature = createUploadSignature({ userId, deliveryId, uploadId, contentType: 'image/jpeg' });
  assert.equal(signature.maxConcurrentUploads, 10);
  const remaining = new Date(signature.expiresAt).getTime() - Date.now();
  assert.ok(remaining > 19 * 60_000 && remaining <= 20 * 60_000);
  assert.equal(signature.maxBytes, 20_000_000);
  const soundtrack = createUploadSignature({ userId, deliveryId, contentType: 'audio/mpeg', resourceType: 'video' });
  assert.equal(soundtrack.maxConcurrentUploads, 2);
});
