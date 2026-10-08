import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import sharp from 'sharp';
import worker from '../../cloudflare/delivery-images/worker.js';
import { hashObject, MAX_MEDIA_BYTES, signMediaToken, verifyMediaToken } from '../../cloudflare/delivery-images/media-protocol.js';
import { prepareZipFiles, zipContentLength, zipStream } from '../../cloudflare/delivery-images/zip.js';
import { createNarration, joinNarration } from '../../cloudflare/delivery-images/narration.js';
import { importGeneratedImage } from '../../cloudflare/delivery-images/provider-image.js';
import { cleanMediaManifests } from '../../cloudflare/delivery-images/media-worker.js';
import { checkMediaWorker, signedMediaUrl, signedRemoteAudioUrl, verifyMediaWorkerToken } from '../src/services/cloudflareMedia.service.js';
import { checkDeliveryImageWorker, confirmUploadedAsset, createUploadSignature } from '../src/services/deliveryMedia.service.js';
import { copyR2Object } from '../src/services/r2.service.js';
import { confirmStorageUpload, createStorageUploadSignature } from '../src/services/storageMedia.service.js';
import { synthesizeV3Narration } from '../src/services/narration.service.js';
import { narrate as narrateCampaign } from '../src/contentStudio/providers.js';
import { authorizedMediaClaims, deliveryMediaAccess } from '../src/services/mediaAuthorization.service.js';
import { getDeliveryProgress } from '../src/controllers/delivery.controller.js';
import { confirmStudioLogoUpload, signStudioLogoUpload } from '../src/controllers/onboarding.controller.js';
import Delivery from '../src/models/Delivery.js';
import DeliveryJob from '../src/models/DeliveryJob.js';
import DeliveryShareGrant from '../src/models/DeliveryShareGrant.js';
import LibraryCollaboration from '../src/models/LibraryCollaboration.js';
import Portfolio from '../src/models/Portfolio.js';
import StorageAsset from '../src/models/StorageAsset.js';
import User from '../src/models/User.js';
import Subscription from '../src/models/Subscription.js';
import RuntimeConfig from '../src/models/RuntimeConfig.js';

const owner = '507f1f77bcf86cd799439011';
const deliveryId = '507f1f77bcf86cd799439012';
const assetId = '507f1f77bcf86cd799439013';
const collabId = '507f1f77bcf86cd799439014';
const grantId = '507f1f77bcf86cd799439015';
const key = `veylo/users/${owner}/deliveries/${deliveryId}/photo-one`;
const secret = 'offline-media-signing-key-with-at-least-32-characters';
const streamOf = bytes => new Blob([bytes]).stream();
const bytesOf = async stream => Buffer.from(await new Response(stream).arrayBuffer());
const reply = () => ({ statusCode: 200, headers: {}, set(name, value) { if (typeof name === 'object') Object.assign(this.headers, name); else this.headers[name] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });

function settings(t, overrides = {}) {
  const values = { R2_MEDIA_OFFLOAD_ENABLED: 'true', R2_IMAGE_WORKER_URL: 'https://media.example.test', R2_IMAGE_WORKER_SECRET: secret, R2_ACCOUNT_ID: 'offline', R2_ACCESS_KEY_ID: 'offline', R2_SECRET_ACCESS_KEY: 'offline', R2_BUCKET_NAME: 'veylo', JWT_SECRET: secret, ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
}

function bucket(entries = {}) {
  const objects = new Map(Object.entries(entries).map(([name, value]) => [name, { bytes: Buffer.from(value.bytes || value), contentType: value.contentType || 'image/jpeg' }]));
  const calls = [];
  const metadata = (name, item) => ({ key: name, size: item.bytes.length, etag: crypto.createHash('sha256').update(item.bytes).digest('hex'), uploaded: new Date('2026-01-01T00:00:00Z'), httpMetadata: { contentType: item.contentType } });
  return {
    calls, objects,
    async head(name) { calls.push(['head', name]); const item = objects.get(name); return item ? metadata(name, item) : null; },
    async get(name, options) { calls.push(['get', name, options]); const item = objects.get(name); if (!item) return null; const range = options?.range; const bytes = range ? item.bytes.subarray(range.offset, range.offset + range.length) : item.bytes; return { ...metadata(name, item), body: streamOf(bytes) }; },
    async put(name, source, options) { calls.push(['put', name]); const bytes = typeof source === 'string' ? Buffer.from(source) : source instanceof ReadableStream ? await bytesOf(source) : Buffer.from(source); const item = { bytes, contentType: options?.httpMetadata?.contentType || 'application/octet-stream' }; objects.set(name, item); return metadata(name, item); },
    async delete(names) { for (const name of Array.isArray(names) ? names : [names]) objects.delete(name); }
  };
}

function imagesBinding() {
  const calls = [];
  return {
    calls,
    async info(source) { calls.push('info'); const meta = await sharp(await bytesOf(source)).metadata(); return { format: meta.format, width: meta.width, height: meta.height }; },
    input(source) {
      calls.push('input');
      let transform;
      return { transform(value) { transform = value; return this; }, async output({ format, quality }) { const input = await bytesOf(source); const image = sharp(input, { failOn: 'error' }).rotate().resize({ width: transform.width, height: transform.height, fit: transform.fit === 'cover' ? 'cover' : 'inside', withoutEnlargement: transform.fit === 'scale-down' }); const data = await image.toFormat(format.split('/')[1], { quality }).toBuffer(); return { response() { return new Response(data, { headers: { 'Content-Type': format } }); } }; } };
    }
  };
}

function environment(storage, images = imagesBinding()) { return { DELIVERY_MEDIA: storage, IMAGES: images, IMAGE_SIGNING_SECRET: secret, VEYLO_API_ORIGIN: 'https://api.example.test', DEEPGRAM_API_KEY: 'offline-deepgram' }; }
const ctx = () => ({ waitUntil(promise) { promise.catch(() => {}); } });

async function request(env, action, claims, options = {}) {
  const token = await signMediaToken({ iss: 'veylo-media-v2', action, ...claims, exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  return worker.fetch(new Request(`https://media.example.test/v2/${action}/${token}`, options), env, ctx());
}

async function rpc(env, operation, data, { tampered } = {}) {
  const body = JSON.stringify(data);
  const token = await signMediaToken({ iss: 'veylo-media-v2', action: 'rpc', operation, digest: crypto.createHash('sha256').update(body).digest('hex'), exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  return worker.fetch(new Request(`https://media.example.test/v2/rpc/${operation}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: tampered || body }), env, ctx());
}

function bridge(t, env) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = new URL(url);
    calls.push({ host: target.hostname, method: options.method || 'GET', body: options.body });
    if (target.hostname === 'media.example.test') return worker.fetch(new Request(url, options), env, ctx());
    assert.equal(options.method, 'HEAD', 'Render must not receive original file bytes');
    const objectKey = decodeURIComponent(target.pathname.split('/').slice(2).join('/'));
    const head = await env.DELIVERY_MEDIA.head(objectKey);
    if (!head) return new Response(null, { status: 404 });
    return new Response(null, { headers: { 'Content-Length': String(head.size), 'Content-Type': head.httpMetadata.contentType, ETag: `"${head.etag}"` } });
  });
  return calls;
}

test('server and Worker signatures match, expire and reject tampering', async t => {
  settings(t);
  const url = signedMediaUrl(key, { preset: '400' });
  const token = new URL(url).pathname.split('/').at(-1);
  assert.equal((await verifyMediaToken(token, secret)).key, key);
  assert.equal(verifyMediaWorkerToken(token).preset, '400');
  assert.equal(await verifyMediaToken(token + 'x', secret), null);
  assert.equal(verifyMediaWorkerToken(token + 'x'), null);
  const expired = await signMediaToken({ iss: 'veylo-media-v2', action: 'file', key, exp: 1 }, secret);
  assert.equal(verifyMediaWorkerToken(expired), null);
  assert.throws(() => signedMediaUrl('veylo/users/../secrets'), { code: 'MEDIA_KEY_INVALID' });
});

test('RPC signatures bind both operation and exact request body', async () => {
  const env = environment(bucket());
  assert.equal((await rpc(env, 'health', {})).status, 200);
  const changed = await rpc(env, 'health', {}, { tampered: '{"key":"another-file"}' });
  assert.equal(changed.status, 403);
  assert.equal((await changed.json()).code, 'MEDIA_SIGNATURE_INVALID');
});

test('Worker connection failures return 503 without logging the photographer out', async t => {
  settings(t);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ message: 'Service signature mismatch.' }), { status: 401 }));
  await assert.rejects(checkMediaWorker(), { status: 503 });
});

test('uploads check the new Worker protocol before accepting file transfers', async t => {
  settings(t, { R2_IMAGE_WORKER_SECRET: secret + '-connection' });
  const env = { ...environment(bucket()), IMAGE_SIGNING_SECRET: process.env.R2_IMAGE_WORKER_SECRET };
  bridge(t, env);
  await checkDeliveryImageWorker({ userId: owner, deliveryId });
});

test('confirmation validates, decodes and hashes photos in Cloudflare; Render receives metadata only', async t => {
  settings(t);
  const original = await sharp({ create: { width: 640, height: 960, channels: 3, background: '#a33b2f' } }).jpeg().toBuffer();
  const signed = createUploadSignature({ userId: owner, deliveryId, uploadId: 'photo-one', contentType: 'image/jpeg' });
  const storage = bucket({ [key]: original });
  const images = imagesBinding();
  const calls = bridge(t, environment(storage, images));
  const result = await confirmUploadedAsset({ userId: owner, deliveryId, ...signed });
  assert.equal(result.width, 640);
  assert.equal(result.height, 960);
  assert.equal(result.etag, crypto.createHash('sha256').update(original).digest('hex'));
  assert.deepEqual(calls.map(call => call.method), ['HEAD', 'POST']);
  assert.deepEqual(images.calls, ['info', 'input']);
  assert.deepEqual(storage.objects.get(key).bytes, original);
  assert.ok(!storage.calls.some(call => call[0] === 'put'), 'original and variants must not be overwritten');
});

test('file downloads keep original bytes, support seeking and allow canvas access from Veylo', async () => {
  const original = Buffer.from('123456789 original photograph bytes');
  const env = environment(bucket({ [key]: original }));
  const full = await request(env, 'file', { key, filename: 'Ada portrait.jpg' }, { headers: { Origin: 'https://veylo.com.ng' } });
  assert.equal(full.status, 200);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), original);
  assert.equal(full.headers.get('access-control-allow-origin'), 'https://veylo.com.ng');
  assert.match(full.headers.get('content-disposition'), /Ada%20portrait.jpg/);
  const partial = await request(env, 'file', { key }, { headers: { Range: 'bytes=2-5' } });
  assert.equal(partial.status, 206);
  assert.equal(await partial.text(), '3456');
  assert.equal(partial.headers.get('content-range'), `bytes 2-5/${original.length}`);
  const suffix = await request(env, 'file', { key }, { headers: { Range: 'bytes=-5' } });
  assert.equal(await suffix.text(), 'bytes');
  const invalid = await request(env, 'file', { key }, { headers: { Range: 'bytes=-0' } });
  assert.equal(invalid.status, 416);
  assert.equal((await request(env, 'file', { key }, { method: 'HEAD' })).headers.get('content-length'), String(original.length));
  const mismatch = await request(env, 'file', { key }, { headers: { Range: 'bytes=2-5', 'If-Range': 'changed' } });
  assert.equal(mismatch.status, 200);
});

test('RAW original downloads are not restricted by the preview binding size', async () => {
  const storage = { async head() { return { size: MAX_MEDIA_BYTES, etag: 'raw', httpMetadata: { contentType: 'application/octet-stream' } }; }, async get() { return { size: MAX_MEDIA_BYTES, etag: 'raw', body: streamOf(Buffer.from('unchanged-raw-bytes')) }; } };
  const response = await request(environment(storage), 'file', { key: `veylo/users/${owner}/library/raw-one` });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(MAX_MEDIA_BYTES));
  assert.equal(await response.text(), 'unchanged-raw-bytes');
});

test('large image previews use Cloudflare URL transforms without the 20 MB binding', async t => {
  let input = 0;
  const storage = { async head() { return { size: 35 * 1024 * 1024, etag: 'large', httpMetadata: { contentType: 'image/jpeg' } }; } };
  const images = { input() { input += 1; throw new Error('Large originals cannot enter this binding'); } };
  const env = environment(storage, images);
  const previous = globalThis.caches;
  globalThis.caches = { default: { async match() { return null; }, async put() {} } };
  t.after(() => { globalThis.caches = previous; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(new URL(url).pathname, /^\/v2\/source\//);
    assert.equal(options.cf.image.width, 800);
    assert.equal(options.redirect, 'error');
    return new Response('cloudflare-preview', { headers: { 'Content-Type': 'image/webp' } });
  });
  const response = await request(env, 'image', { key, preset: '800' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cloudflare-preview');
  assert.equal(input, 0);
});

test('closed shares are checked before cached previews are served', async t => {
  let cacheReads = 0;
  const previous = globalThis.caches;
  globalThis.caches = { default: { async match() { cacheReads += 1; return new Response('cached photo'); } } };
  t.after(() => { globalThis.caches = previous; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.example.test');
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).files, undefined);
    return new Response(null, { status: 403 });
  });
  const result = await request(environment(bucket()), 'image', { key, preset: '400', access: { type: 'delivery', deliveryId } });
  assert.equal(result.status, 403);
  assert.equal(cacheReads, 0);
});

test('hashing a 100 MB original streams chunks and rejects incomplete reads', async () => {
  const chunk = Buffer.alloc(1024 * 1024, 42);
  const expected = crypto.createHash('sha256');
  for (let index = 0; index < 100; index += 1) expected.update(chunk);
  const storage = { async get() { let count = 0; return { size: MAX_MEDIA_BYTES, etag: 'raw', body: new ReadableStream({ pull(controller) { if (count++ < 100) controller.enqueue(chunk); else controller.close(); } }) }; } };
  assert.equal((await hashObject(storage, key)).sha256, expected.digest('hex'));
  await assert.rejects(hashObject({ async get() { return { size: 20, body: streamOf(Buffer.from('short')) }; } }, key), { code: 'MEDIA_INCOMPLETE' });
});

test('supported camera RAW families pass header checks while disguised text is rejected', async () => {
  for (const header of [Buffer.from([73, 73, 42, 0]), Buffer.from([77, 77, 0, 42]), Buffer.from('IIRO'), Buffer.from('IIRS'), Buffer.from('MMOR'), Buffer.from([73, 73, 85, 0]), Buffer.from('FUJIFILM'), Buffer.from('FOVb'), Buffer.from([0, 77, 82, 77]), Buffer.from('0000ftypcrx ')]) {
    const data = Buffer.concat([header, Buffer.alloc(32)]);
    const env = environment(bucket({ [key]: { bytes: data, contentType: 'application/octet-stream' } }));
    assert.equal((await rpc(env, 'inspect', { key, resourceType: 'raw', maxBytes: MAX_MEDIA_BYTES })).status, 200, header.toString('hex'));
  }
  const env = environment(bucket({ [key]: Buffer.from('<html>not a RAW photograph</html>') }));
  assert.equal((await rpc(env, 'inspect', { key, resourceType: 'raw', maxBytes: MAX_MEDIA_BYTES })).status, 415);
});

test('library confirmation retains RAW originals and gets their checksum from Cloudflare', async t => {
  settings(t);
  const signed = createStorageUploadSignature(owner, { resourceType: 'raw', format: 'rw2' });
  const original = Buffer.concat([Buffer.from([73, 73, 85, 0]), Buffer.alloc(1000, 7)]);
  const storage = bucket({ [signed.objectKey]: { bytes: original, contentType: 'application/octet-stream' } });
  const calls = bridge(t, environment(storage));
  const result = await confirmStorageUpload(owner, { ...signed, format: 'rw2' });
  assert.equal(result.hashAlgorithm, 'sha256');
  assert.equal(result.etag, crypto.createHash('sha256').update(original).digest('hex'));
  assert.deepEqual(calls.map(call => call.method), ['HEAD', 'POST']);
});

test('library-to-delivery copy uses S3 copy and never downloads the original through Render', async t => {
  settings(t);
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    methods.push(options.method);
    if (options.method === 'HEAD') return new Response(null, { headers: { 'content-length': '12345', 'content-type': 'image/jpeg', etag: '"source-etag"' } });
    assert.equal(options.method, 'PUT');
    assert.equal(options.body, undefined);
    assert.equal(options.headers['x-amz-copy-source'], `/veylo/${key}`);
    assert.equal(options.headers['x-amz-copy-source-if-match'], '"source-etag"');
    return new Response('<CopyObjectResult><ETag>&quot;copied-etag&quot;</ETag></CopyObjectResult>');
  });
  const result = await copyR2Object(key, key + '-copy');
  assert.equal(result.bytes, 12345);
  assert.equal(result.etag, 'copied-etag');
  assert.deepEqual(methods, ['HEAD', 'PUT']);
});

test('S3 copy errors inside HTTP 200 responses are not accepted', async t => {
  settings(t);
  t.mock.method(globalThis, 'fetch', async (_url, options) => options.method === 'HEAD' ? new Response(null, { headers: { 'content-length': '123', etag: '"etag"' } }) : new Response('<Error><Code>AccessDenied</Code></Error>'));
  await assert.rejects(copyR2Object(key, key + '-copy'), { code: 'R2_COPY_FAILED' });
});

test('ZIP64 files retain bytes and checksums, handle duplicate names and match the declared length', async () => {
  const second = key + '-second';
  const storage = bucket({ [key]: Buffer.from('123456789'), [second]: Buffer.from('second-original') });
  const files = await prepareZipFiles(storage, [{ key, name: '../Ada.jpg' }, { key: second, name: 'Ada.jpg' }]);
  assert.deepEqual(files.map(file => file.name), ['Ada.jpg', 'Ada-2.jpg']);
  const zip = await bytesOf(zipStream(storage, files));
  assert.equal(BigInt(zip.length), zipContentLength(files));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const firstStart = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  assert.equal(zip.subarray(firstStart, firstStart + 9).toString(), '123456789');
  assert.equal(zip.readUInt32LE(firstStart + 9), 0x08074b50);
  assert.equal(zip.readUInt32LE(firstStart + 13), 0xcbf43926);
  assert.equal(zip.readUInt32LE(zip.length - 98), 0x06064b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  await assert.rejects(prepareZipFiles(storage, [{ key }, { key: 'veylo/users/someone-else/library/photo' }]), { code: 'ARCHIVE_SCOPE_INVALID' });
});

test('ZIP streaming stops fetching further files after the reader cancels', async () => {
  const storage = bucket({ [key]: Buffer.alloc(128), [key + '-second']: Buffer.alloc(128) });
  const files = await prepareZipFiles(storage, [{ key }, { key: key + '-second' }]);
  const reader = zipStream(storage, files).getReader();
  await reader.read();
  await reader.cancel();
  assert.ok(!storage.calls.some(call => call[0] === 'get' && call[1] === key + '-second'));
});

test('a 1,000-photo archive with long filenames remains downloadable with a short private link', async () => {
  const files = Array.from({ length: 1000 }, (_, index) => ({ key: key + '-' + index, name: 'portrait-' + String(index).padStart(4, '0') + '-'.repeat(160) + '.jpg' }));
  const storage = bucket(Object.fromEntries(files.map(file => [file.key, Buffer.from('original')])));
  const env = environment(storage);
  const response = await rpc(env, 'archive', { files, filename: 'birthday-photographs' });
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.ok(manifest.key.length < 100);
  const download = await request(env, 'archive', { key: manifest.key }, { method: 'HEAD' });
  assert.equal(download.status, 200);
  assert.ok(Number(download.headers.get('content-length')) > 1000 * 8);
});

test('malformed or animated images are rejected before becoming approved uploads', async () => {
  const notPhoto = environment(bucket({ [key]: Buffer.from('<svg>not a photograph</svg>') }));
  assert.equal((await rpc(notPhoto, 'inspect', { key, resourceType: 'image', maxBytes: MAX_MEDIA_BYTES })).status, 415);
  const png = await sharp({ create: { width: 640, height: 960, channels: 3, background: '#ff5a47' } }).png().toBuffer();
  const marker = Buffer.alloc(20); marker.writeUInt32BE(8); marker.write('acTL', 4);
  const animated = Buffer.concat([png.subarray(0, 33), marker, png.subarray(33)]);
  const env = environment(bucket({ [key]: { bytes: animated, contentType: 'image/png' } }));
  assert.equal((await rpc(env, 'inspect', { key, resourceType: 'image', maxBytes: MAX_MEDIA_BYTES })).status, 415);
});

test('archives reject changed originals rather than mixing versions', async () => {
  const storage = bucket({ [key]: Buffer.from('original') });
  const files = await prepareZipFiles(storage, [{ key }]);
  storage.objects.get(key).bytes = Buffer.from('changed!');
  await assert.rejects(bytesOf(zipStream(storage, files)), { code: 'MEDIA_CHANGED' });
});

test('ZIP download manifests expire and cleanup leaves all originals untouched', async () => {
  const storage = bucket({ [key]: Buffer.from('original') });
  const env = environment(storage);
  const manifest = await (await rpc(env, 'archive', { files: [{ key, name: 'portrait.jpg' }], filename: 'Ada photographs' })).json();
  const download = await request(env, 'archive', { key: manifest.key });
  assert.equal(download.headers.get('content-type'), 'application/zip');
  assert.ok((await download.arrayBuffer()).byteLength > 98);
  const expired = JSON.parse(storage.objects.get(manifest.key).bytes);
  expired.expiresAt = 1;
  storage.objects.get(manifest.key).bytes = Buffer.from(JSON.stringify(expired));
  assert.equal((await request(env, 'archive', { key: manifest.key })).status, 410);
  storage.list = async () => ({ objects: [{ key: manifest.key, uploaded: new Date(1) }], truncated: false });
  await cleanMediaManifests(env);
  assert.equal(storage.objects.has(manifest.key), false);
  assert.equal(storage.objects.has(key), true);
});

test('narration audio stays in Cloudflare and word timings are returned as metadata', async t => {
  const env = environment(bucket());
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.deepgram.com');
    calls.push(new URL(url).pathname);
    if (new URL(url).pathname === '/v2/speak') return new Response(Buffer.from('ID3 audio original'));
    assert.ok(options.body instanceof Uint8Array);
    return Response.json({ metadata: { duration: 1 }, results: { channels: [{ alternatives: [{ words: [{ word: 'Welcome', start: 0, end: .8 }] }] }] } });
  });
  const narration = `${key.slice(0, key.lastIndexOf('/'))}/narration/audio-one`;
  const result = await createNarration(env, { key: narration, text: 'Welcome to your photographs.', voiceId: 'flux-hannah-en', speed: .85, timings: true });
  assert.deepEqual(calls, ['/v2/speak', '/v1/listen']);
  assert.equal(result.words[0].word, 'Welcome');
  assert.equal(env.DELIVERY_MEDIA.objects.get(narration).bytes.toString(), 'ID3 audio original');
  assert.equal(result.buffer, undefined);
});

test('short campaign voice-over is recorded and timed entirely in Cloudflare', async t => {
  const env = environment(bucket());
  const destination = `veylo/content-studio/${deliveryId}/version-one/voice/scene-one`;
  t.mock.method(globalThis, 'fetch', async url => new URL(url).pathname === '/v2/speak'
    ? new Response(Buffer.from('ID3 campaign original'))
    : Response.json({ metadata: { duration: 1.5 }, results: { channels: [{ alternatives: [{ words: [{ word: 'Veylo.', start: 0, end: 1.2 }] }] }] } }));
  const result = await createNarration(env, { key: destination, text: 'Veylo.', voiceId: 'flux-hannah-en', speed: 1, timings: true });
  assert.equal(result.duration, 1.5);
  assert.equal(result.words[0].word, 'Veylo.');
  assert.equal(env.DELIVERY_MEDIA.objects.get(destination).bytes.toString(), 'ID3 campaign original');
  assert.equal(result.buffer, undefined);
  await assert.rejects(createNarration(env, { key: destination.replace('/voice/', '/images/'), text: 'Veylo.', voiceId: 'flux-hannah-en', speed: 1 }), { code: 'NARRATION_SCOPE_INVALID' });
});

test('campaign voice-over retains its recording when optional subtitle timing fails', async t => {
  const env = environment(bucket());
  t.mock.method(globalThis, 'fetch', async url => new URL(url).pathname === '/v2/speak' ? new Response(Buffer.from('ID3 recording')) : new Response(null, { status: 503 }));
  const data = { key: `veylo/content-studio/${deliveryId}/version-one/voice/scene-one`, text: 'Your photographs are ready.', voiceId: 'flux-hannah-en', speed: 1, timings: true };
  const result = await createNarration(env, data);
  assert.deepEqual(result.words, []);
  assert.equal(env.DELIVERY_MEDIA.objects.has(data.key), true);
  await assert.rejects(createNarration(env, { ...data, key: `${key.slice(0, key.lastIndexOf('/'))}/narration/audio-one` }), { code: 'NARRATION_REQUEST_FAILED' });
});

test('campaign processing sends text and receives recording details without transferring audio', async t => {
  settings(t, { CONTENT_STORAGE_LOCAL: 'false', CONTENT_VOICE_MODEL: 'flux-hannah-en' });
  const allowance = mongoose.models.ContentAllowance;
  t.mock.method(allowance, 'updateOne', async () => ({}));
  t.mock.method(allowance, 'findOneAndUpdate', async (_query, update) => { assert.equal(update.$inc.used, 2); return { used: 2 }; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://media.example.test/v2/rpc/narration');
    const data = JSON.parse(options.body);
    assert.equal(data.text, 'Send a private link.');
    assert.equal(data.timings, true);
    assert.equal(data.key, `veylo/content-studio/${deliveryId}/version-one/voice/scene-one`);
    return Response.json({ public_id: data.key, bytes: 100, duration: 1.5, words: [{ word: 'Send', start: 0, end: .5 }] });
  });
  const result = await narrateCampaign('Send a private link.', new AbortController().signal, { projectId: deliveryId, key: 'version-one/voice/scene-one' });
  assert.equal(Buffer.isBuffer(result), false);
  assert.equal(result.duration, 1.5);
  assert.equal(result.words[0].word, 'Send');
  await assert.rejects(narrateCampaign('Cancelled recording.', AbortSignal.abort(), { projectId: deliveryId, key: 'version-one/voice/scene-two' }));
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('joining narration removes only later ID3 headers and streams into R2 with a known size', async t => {
  const previous = globalThis.FixedLengthStream;
  globalThis.FixedLengthStream = class extends TransformStream { constructor(length) { let size = 0; super({ transform(chunk, controller) { size += chunk.length; controller.enqueue(chunk); }, flush() { assert.equal(size, length); } }); } };
  t.after(() => { globalThis.FixedLengthStream = previous; });
  const prefix = `${key.slice(0, key.lastIndexOf('/'))}/narration/`;
  const id3 = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]);
  const first = Buffer.concat([id3, Buffer.from('first-audio')]);
  const second = Buffer.concat([id3, Buffer.from('second-audio')]);
  const storage = bucket({ [prefix + 'one']: { bytes: first, contentType: 'audio/mpeg' }, [prefix + 'two']: { bytes: second, contentType: 'audio/mpeg' } });
  const result = await joinNarration(environment(storage), { key: prefix + 'combined', keys: [prefix + 'one', prefix + 'two'] });
  assert.deepEqual(storage.objects.get(result.key).bytes, Buffer.concat([first, Buffer.from('second-audio')]));
});

test('V3 bookends send only text to Cloudflare and preserve approved captions', async t => {
  settings(t);
  const lines = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'media.example.test');
    const data = JSON.parse(options.body);
    lines.push(data.text);
    return Response.json({ key: data.key, public_id: data.key, bytes: 100, format: 'mp3' });
  });
  const delivery = { _id: deliveryId, userId: owner, schemaVersion: 3, creativeDirection: { openingLine: 'Ada, your photographs are ready.', closingLine: 'Your whole collection is here.', frames: [{ assetId: 'photo-one', caption: 'Approved written caption stays here.' }] } };
  const before = structuredClone(delivery);
  const result = await synthesizeV3Narration(delivery, { voiceId: 'flux-kit-en', captions: true });
  assert.equal(lines.length, 2);
  assert.equal(result.voiceId, 'flux-kit-en');
  assert.equal(result.captions, undefined);
  assert.deepEqual(delivery, before);
});

test('provider image imports reject arbitrary origins and store approved images in R2', async t => {
  const env = environment(bucket());
  const destination = `veylo/content-studio/${deliveryId}/version-one/images/scene-one`;
  let requests = 0;
  const image = await sharp({ create: { width: 512, height: 768, channels: 3, background: '#ff5a47' } }).png().toBuffer();
  t.mock.method(globalThis, 'fetch', async (_url, options) => { requests += 1; assert.equal(options.redirect, 'error'); return new Response(image); });
  await assert.rejects(importGeneratedImage(env, { key: destination, url: 'https://arbitrary.example/photo' }), { code: 'PROVIDER_IMAGE_URL' });
  assert.equal(requests, 0);
  const imported = await importGeneratedImage(env, { key: destination, url: 'https://images.oss-cn-shanghai.aliyuncs.com/photo' });
  assert.equal(imported.width, 512);
  assert.equal(imported.height, 768);
  assert.equal(env.DELIVERY_MEDIA.objects.get(destination).contentType, 'image/png');
});

test('legacy music playback streams through Cloudflare with seeking and restricted origins', async t => {
  settings(t);
  assert.throws(() => signedRemoteAudioUrl('https://unapproved.example/music.mp3'), { status: 400 });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'cdn.pixabay.com');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Range, 'bytes=2-5');
    return new Response('3456', { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 2-5/9', 'Content-Length': '4' } });
  });
  const response = await worker.fetch(new Request(signedRemoteAudioUrl('https://cdn.pixabay.com/audio/recording.mp3'), { headers: { Range: 'bytes=2-5' } }), environment(bucket()), ctx());
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/9');
  assert.equal(await response.text(), '3456');
});

function deliveryMock(t, accessOverrides = {}) {
  const delivery = { _id: deliveryId, userId: owner, assets: [{ assetId: 'photo-one', publicId: key }, { assetId: 'photo-two', publicId: key + '-second' }], access: { pinDigest: 'private-pin-digest', allowIndividualDownloads: true, allowDownloadAll: true, ...accessOverrides } };
  t.mock.method(Delivery, 'findOne', () => ({ select() { return this; }, async lean() { return delivery; } }));
  return delivery;
}

test('private file checks honor download permissions, revocation and changed PINs', async t => {
  const delivery = deliveryMock(t);
  const access = deliveryMediaAccess(delivery, null, 'download');
  const claims = { action: 'file', key, access };
  assert.equal(await authorizedMediaClaims(claims), true);
  delivery.access.allowIndividualDownloads = false;
  assert.equal(await authorizedMediaClaims(claims), false);
  delivery.access.allowIndividualDownloads = true;
  delivery.access.pinDigest = 'changed-pin';
  assert.equal(await authorizedMediaClaims(claims), false);
  delivery.access.pinDigest = 'private-pin-digest';
  delivery.access.revokedAt = new Date();
  assert.equal(await authorizedMediaClaims(claims), false);
});

test('restricted share grants cannot download photos or full narration outside their selection', async t => {
  const delivery = deliveryMock(t);
  delivery.narration = { opening: { publicId: key + '-narration' } };
  const grant = { _id: grantId, assetIds: ['photo-one'], allowIndividualDownloads: true, allowDownloadAll: true };
  t.mock.method(DeliveryShareGrant, 'findOne', () => ({ async lean() { return grant; } }));
  const access = deliveryMediaAccess(delivery, grant, 'download');
  assert.equal(await authorizedMediaClaims({ action: 'file', key, access }), true);
  assert.equal(await authorizedMediaClaims({ action: 'file', key: key + '-second', access }), false);
  assert.equal(await authorizedMediaClaims({ action: 'file', key: key + '-narration', access: { ...access, mode: 'audio' } }), false);
  assert.equal(await authorizedMediaClaims({ action: 'archive', key: 'veylo/system/media-manifests/one', access: { ...access, mode: 'archive' } }, [{ key }, { key: key + '-second' }]), false);
});

test('library preselection grants show previews and never authorize original downloads', async t => {
  const collaboration = { userId: owner, kind: 'preselection', assetIds: [assetId] };
  t.mock.method(LibraryCollaboration, 'findOne', () => ({ async lean() { return collaboration; } }));
  t.mock.method(StorageAsset, 'findOne', () => ({ async lean() { return { publicId: key, rawPublicId: key + '-raw' }; } }));
  t.mock.method(User, 'findById', async () => ({ _id: owner, accountStatus: 'active', planOverride: { plan: 'pro' } }));
  t.mock.method(Subscription, 'find', () => ({ sort() { return this; }, async lean() { return []; } }));
  t.mock.method(RuntimeConfig, 'findOne', () => ({ async lean() { return null; } }));
  const access = { type: 'library', collaborationId: collabId, assetId, mode: 'view' };
  assert.equal(await authorizedMediaClaims({ action: 'image', key, access }), true);
  assert.equal(await authorizedMediaClaims({ action: 'file', key, access: { ...access, mode: 'download' } }), false);
  collaboration.kind = 'editor-handoff';
  assert.equal(await authorizedMediaClaims({ action: 'file', key: key + '-raw', access: { ...access, mode: 'download' } }), true);
  assert.equal(await authorizedMediaClaims({ action: 'file', key, access: { ...access, mode: 'download' } }), false);
});

test('unpublished portfolios deny previously issued Cloudflare media links', async t => {
  t.mock.method(Portfolio, 'findOne', query => { assert.equal(query.status, 'published'); return { async lean() { return null; } }; });
  assert.equal(await authorizedMediaClaims({ action: 'image', key, access: { type: 'portfolio', portfolioId: collabId } }), false);
});

test('progress responses verify ownership and request only small job fields', async t => {
  t.mock.method(Delivery, 'findOne', query => { assert.deepEqual(query, { _id: deliveryId, userId: owner }); return { select(fields) { assert.equal(fields, '_id status'); return this; }, async lean() { return { _id: deliveryId, status: 'analyzing' }; } }; });
  t.mock.method(DeliveryJob, 'findOne', query => { assert.equal(query.userId, owner); return { sort() { return this; }, select(fields) { assert.doesNotMatch(fields, /assets|input|result|checkpoint/); return this; }, async lean() { return { status: 'running', stage: 'analyzing', progress: 30 }; } }; });
  const res = reply();
  await getDeliveryProgress({ params: { id: deliveryId }, user: { id: owner } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.generationJob.progress, 30);
  assert.equal(res.body.data.assets, undefined);
});

test('profile upload signing belongs to the account and confirmation rejects foreign files', async t => {
  settings(t);
  t.mock.method(User, 'exists', async query => { assert.equal(query._id, owner); return true; });
  const signed = reply();
  await signStudioLogoUpload({ user: { id: owner }, body: { contentType: 'image/jpeg' } }, signed);
  assert.equal(signed.statusCode, 200);
  assert.ok(signed.body.data.objectKey.startsWith(`veylo/studios/${owner}/profile/`));
  assert.equal(signed.body.data.maxBytes, 5 * 1024 * 1024);
  const rejected = reply();
  await confirmStudioLogoUpload({ user: { id: owner }, body: { objectKey: `veylo/studios/${deliveryId}/profile/foreign`, uploadToken: 'offline-token-at-least-20-characters' } }, rejected);
  assert.equal(rejected.statusCode, 403);
});

test('profile upload confirmation saves the validated R2 original and never transfers image bytes through Render', async t => {
  settings(t);
  const png = await sharp({ create: { width: 320, height: 480, channels: 3, background: '#ff5a47' } }).png().toBuffer();
  t.mock.method(User, 'exists', async () => true);
  const signed = reply();
  await signStudioLogoUpload({ user: { id: owner }, body: { contentType: 'image/png' } }, signed);
  const user = { _id: owner, studio: {}, async save() {} };
  t.mock.method(User, 'findById', async () => user);
  const env = environment(bucket({ [signed.body.data.objectKey]: { bytes: png, contentType: 'image/png' } }));
  const calls = bridge(t, env);
  const res = reply();
  await confirmStudioLogoUpload({ user: { id: owner }, body: { objectKey: signed.body.data.objectKey, uploadToken: signed.body.data.uploadToken } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(user.studio.logoPublicId, signed.body.data.objectKey);
  assert.deepEqual(calls.map(call => call.method), ['HEAD', 'POST']);
});
