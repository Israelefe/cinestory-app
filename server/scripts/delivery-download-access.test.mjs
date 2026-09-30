import assert from 'node:assert/strict';
import test from 'node:test';
import Delivery from '../src/models/Delivery.js';
import DeliveryShareGrant from '../src/models/DeliveryShareGrant.js';
import DeliveryPreviewFile from '../src/models/DeliveryPreviewFile.js';
import sharp from 'sharp';
import { cloudinary } from '../src/services/cloudinary.service.js';
import { getDeliveryPreviewMedia, getWatermarkedDeliveryPhoto, updateDownloadLock, getPhotoDownload, streamPhotoDownload, getGalleryDownload, getPinboardStatusCard } from '../src/controllers/delivery.controller.js';
import { signedImageUrl } from '../src/services/deliveryMedia.service.js';
import { deliveryWatermarkedPreview, renderDeliveryWatermark, watermarkMediaToken, verifyWatermarkMediaToken } from '../src/services/deliveryWatermark.service.js';
import { tokenDigest } from '../src/utils/auth.js';

// Dummy signing values: these tests do not contact Cloudinary or a database.
process.env.CLOUDINARY_CLOUD_NAME = 'veylo-test';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
process.env.JWT_SECRET = 'offline-watermark-test-secret';
function response() {
  return { statusCode: 200, headers: {}, set(key, value) { if (typeof key === 'object') Object.assign(this.headers, key); else this.headers[key] = value; return this; }, send(value) { this.body = value; return this; }, redirect(status, url) { this.statusCode = status; this.headers.Location = url; return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}
const ownerId = '507f1f77bcf86cd799439012';
const deliveryId = '507f1f77bcf86cd799439011';
function document() {
  return { _id: deliveryId, userId: { name: 'Amara', studio: { name: 'Amara Photography' } }, status: 'published', access: { downloadsLocked: true, watermarkEnabled: true, watermarkText: 'Amara', downloadLockNote: 'Contact Amara to unlock.', allowIndividualDownloads: true, allowDownloadAll: true }, assets: [{ assetId: 'one', publicId: 'private-shoot/one' }, { assetId: 'two', publicId: 'private-shoot/two' }], populate() { return this; }, markModified() {}, async save() { this.saved = true; } };
}
function stubFind(t, doc, check = () => {}) {
  t.mock.method(Delivery, 'findOne', query => {
    check(query);
    const result = Promise.resolve(doc);
    result.select = result.populate = () => result;
    return result;
  });
}

test('storage URLs no longer ask Cloudinary to draw a watermark; original URLs stay unchanged', () => {
  for (const options of [{ thumbnail: true }, {}, { width: 480 }, { width: 960 }]) {
    const url = decodeURIComponent(signedImageUrl('private-shoot/one', { ...options, watermark: 'Amara Photography' }));
    assert.doesNotMatch(url, /l_text|o_55/);
  }
  assert.equal(signedImageUrl('private-shoot/one', { original: true, watermark: 'Amara' }), signedImageUrl('private-shoot/one', { original: true }));
  assert.doesNotMatch(signedImageUrl('private-shoot/one', { thumbnail: true }), /l_text/);
});

test('only the owner can request watermarked preview media; studio fallback and clean previews work', async t => {
  t.mock.method(DeliveryPreviewFile, 'find', () => ({ lean: async () => [] }));
  const doc = document();
  stubFind(t, doc, query => assert.deepEqual(query, { _id: deliveryId, userId: ownerId }));
  const req = { params: { id: deliveryId }, user: { id: ownerId }, body: { downloadsLocked: true, watermarkEnabled: true, watermarkText: '' } };
  const res = response();
  await getDeliveryPreviewMedia(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.assets.length, 2);
  for (const asset of res.body.data.assets) {
    for (const key of ['url', 'thumbnailUrl', 'srcSet']) assert.match(asset[key], /\/api\/v1\/deliveries\/media\//);
    const claims = verifyWatermarkMediaToken(new URL(asset.url, 'https://example.test').searchParams.get('token'));
    assert.equal(claims.text, 'Amara Photography');
    assert.equal(claims.ownerId, ownerId);
    assert.equal(asset.publicId, undefined);
  }
  req.body.downloadsLocked = false;
  const clean = response();
  await getDeliveryPreviewMedia(req, clean);
  assert.match(clean.body.data.assets[0].url, /^https:\/\/res.cloudinary.com\//);
  assert.equal(doc.saved, undefined);
});

test('code renders a visible watermark on light and dark previews without modifying the input', async () => {
  for (const background of ['#000000', '#ffffff']) {
    const input = await sharp({ create: { width: 480, height: 600, channels: 3, background } }).png().toBuffer();
    const untouched = Buffer.from(input);
    const output = await renderDeliveryWatermark(input, 'Amara & <Photography>');
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 480);
    assert.equal(metadata.height, 600);
    const pixels = await sharp(output).removeAlpha().raw().toBuffer();
    const base = background === '#000000' ? 0 : 255;
    const changed = Array.from(pixels.subarray(480 * 3 * 280, 480 * 3 * 320)).filter(value => Math.abs(value - base) > 30).length;
    assert.ok(changed > 200, 'central watermark must visibly differ from either background');
    assert.deepEqual(input, untouched);
  }
});

test('one central watermark replaces the repeated copies and stays inside portrait and landscape photos', async () => {
  for (const [width, height] of [[320, 480], [834, 560], [1600, 2000]]) {
    const input = await sharp({ create: { width, height, channels: 3, background: '#000000' } }).png().toBuffer();
    const output = await renderDeliveryWatermark(input, 'Amara Photography');
    const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const row = y => data.subarray(y * info.width * 3, (y + 1) * info.width * 3);
    const changed = y => Array.from(row(y)).filter(value => value > 50).length;
    assert.equal(changed(2), 0, 'watermark should not clip the top edge');
    assert.equal(changed(height - 3), 0, 'watermark should not clip the bottom edge');
    assert.equal(changed(Math.floor(height * .15)), 0, 'no upper repeated copy');
    assert.equal(changed(Math.floor(height * .85)), 0, 'no lower repeated copy');
    assert.ok(changed(Math.floor(height / 2)) > 10, 'watermark stays centred');
  }
});

test('every responsive size and thumbnail uses one prepared source, even when new provider transformations are blocked', async t => {
  const asset = { publicId: 'offline/prepared-size-regression' };
  const input = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: '#223344' } }).jpeg().toBuffer();
  t.mock.method(globalThis, 'fetch', async url => {
    if (!url.includes('/c_limit,w_1600/f_auto,q_auto:good/')) return new Response('Transformation unavailable', { status: 403 });
    return new Response(input, { headers: { 'content-type': 'image/jpeg' } });
  });
  const outputs = await Promise.all([480, 960, 1600].map(width => deliveryWatermarkedPreview(asset, 'Regression', { width })));
  for (let index = 0; index < outputs.length; index += 1) assert.equal((await sharp(outputs[index]).metadata()).width, [480, 960, 1400][index]);
  const thumbnail = await deliveryWatermarkedPreview(asset, 'Regression', { thumbnail: true });
  const meta = await sharp(thumbnail).metadata();
  assert.equal(meta.width, 800);
  assert.equal(meta.height, 1000);
  assert.equal(globalThis.fetch.mock.callCount(), 1, 'sizes must share a source fetch');
});

test('missing prepared photos fall back privately to originals and are resized locally', async t => {
  const asset = { publicId: 'offline/missing-prepared-photo' };
  const input = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#223344' } }).png().toBuffer();
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('/c_limit,')) return new Response('Missing transformation', { status: 404 });
    assert.equal(url, signedImageUrl(asset.publicId, { original: true }));
    return new Response(input, { headers: { 'content-type': 'image/png' } });
  });
  const output = await deliveryWatermarkedPreview(asset, 'Fallback', { width: 480 });
  assert.equal((await sharp(output).metadata()).width, 480);
  assert.equal(globalThis.fetch.mock.callCount(), 2);
});

test('a temporary image-source failure retries without caching the failed response', async t => {
  const asset = { publicId: 'offline/transient-photo-failure' };
  const input = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#223344' } }).png().toBuffer();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? new Response('Temporarily unavailable', { status: 503 })
    : new Response(input, { headers: { 'content-type': 'image/png' } }));
  const output = await deliveryWatermarkedPreview(asset, 'Retry', { width: 480 });
  assert.equal((await sharp(output).metadata()).width, 480);
  assert.equal(calls, 2);
});

function photoRequest(claims, changes = {}) {
  return { params: { id: deliveryId, assetId: 'one' }, query: { token: watermarkMediaToken({ deliveryId, ...claims }), width: '480', ...changes } };
}

test('owner preview token serves the private prepared file without fetching or drawing it again', async t => {
  const doc = document();
  stubFind(t, doc, query => assert.deepEqual(query, { _id: deliveryId, userId: ownerId }));
  t.mock.method(DeliveryPreviewFile, 'findOne', () => ({ lean: async () => ({ variants: [{ width: 480, height: 600, publicId: 'private-shoot/previews/one-480' }] }) }));
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Prepared files must not be fetched again'); });
  const res = response();
  await getWatermarkedDeliveryPhoto(photoRequest({ ownerId, text: 'Owner preview' }), res);
  assert.equal(res.statusCode, 302);
  assert.match(new URL(res.headers.Location).pathname, /image\/authenticated\/.*private-shoot\/previews\/one-480.webp$/);
  assert.doesNotMatch(res.headers.Location, /l_text/);
  assert.equal(res.headers['Cache-Control'], 'private, max-age=300');
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('uncached protected photos render directly in every format without waiting for a preview upload', async t => {
  const doc = document();
  doc.assets[0].publicId = 'offline/direct-watermark-regression';
  stubFind(t, doc);
  t.mock.method(DeliveryPreviewFile, 'findOne', () => ({ lean: async () => null }));
  const input = await sharp({ create: { width: 960, height: 1200, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  t.mock.method(globalThis, 'fetch', async () => new Response(input, { headers: { 'content-type': 'image/jpeg' } }));
  t.mock.method(cloudinary.uploader, 'upload_stream', () => { throw new Error('Client display must not wait for upload storage'); });
  for (const format of ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign', 'gridboard']) {
    doc.format = format;
    const res = response();
    await getWatermarkedDeliveryPhoto(photoRequest({ ownerId, text: 'Amara Photography' }), res);
    assert.equal(res.statusCode, 200, format);
    assert.equal(res.headers['Content-Type'], 'image/webp');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(res.headers.Location, undefined);
    const metadata = await sharp(res.body).metadata();
    assert.equal(metadata.width, 480);
    assert.equal(metadata.height, 600);
    const pixels = await sharp(res.body).removeAlpha().raw().toBuffer();
    assert.ok(Array.from(pixels.subarray(480 * 3 * 280, 480 * 3 * 320)).some(value => value < 180), 'served preview contains the watermark');
  }
  assert.equal(cloudinary.uploader.upload_stream.mock.callCount(), 0);
  assert.equal(globalThis.fetch.mock.callCount(), 1, 'formats share the protected source cache');
});

test('tampered preview tokens, wrong deliveries and arbitrary sizes cannot fetch photos', async t => {
  t.mock.method(Delivery, 'findOne', () => { throw new Error('No database query expected'); });
  for (const mutate of [req => { req.query.token += 'tampered'; }, req => { req.params.id = ownerId; }, req => { req.query.width = '9000'; }]) {
    const req = photoRequest({ ownerId, text: 'Preview' });
    mutate(req);
    const res = response();
    await getWatermarkedDeliveryPhoto(req, res);
    assert.ok([400, 403].includes(res.statusCode));
  }
  assert.equal(Delivery.findOne.mock.callCount(), 0);
});

test('public previews recheck expiry, lock state, watermark state and PIN changes', async t => {
  const doc = document();
  doc.publicId = 'client-link';
  stubFind(t, doc);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not load a blocked image'); });
  const req = photoRequest({ publicId: doc.publicId, pinVersion: tokenDigest('') });
  for (const access of [{ expiresAt: new Date(0) }, { downloadsLocked: false }, { watermarkEnabled: false }, { pinDigest: 'new-pin-hash' }, { revokedAt: new Date() }]) {
    const original = { ...doc.access };
    Object.assign(doc.access, access);
    const res = response();
    await getWatermarkedDeliveryPhoto(req, res);
    assert.equal(res.statusCode, 404);
    doc.access = original;
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('a restricted or revoked share grant cannot access other photographs', async t => {
  const doc = document();
  doc.publicId = 'client-link';
  stubFind(t, doc);
  const grantId = '507f1f77bcf86cd799439013';
  t.mock.method(DeliveryShareGrant, 'findOne', query => {
    assert.equal(query._id, grantId);
    assert.equal(query.deliveryId, deliveryId);
    assert.equal(query.revokedAt, null);
    return { assetIds: ['two'], sectionIds: [] };
  });
  const req = photoRequest({ publicId: doc.publicId, pinVersion: tokenDigest(''), grantId });
  const res = response();
  await getWatermarkedDeliveryPhoto(req, res);
  assert.equal(res.statusCode, 404);
  DeliveryShareGrant.findOne.mock.mockImplementation(() => null);
  const revoked = response();
  await getWatermarkedDeliveryPhoto(req, revoked);
  assert.equal(revoked.statusCode, 404);
});

test('foreign delivery settings and preview media stay unavailable', async t => {
  stubFind(t, null, query => assert.equal(query.userId, ownerId));
  const req = { params: { id: deliveryId }, user: { id: ownerId }, body: { locked: false } };
  const res = response();
  await updateDownloadLock(req, res);
  assert.equal(res.statusCode, 404);
  req.body = { downloadsLocked: true, watermarkEnabled: true, watermarkText: 'Amara' };
  const media = response();
  await getDeliveryPreviewMedia(req, media);
  assert.equal(media.statusCode, 404);
});

test('unlocking a published delivery updates only its access settings and preserves its link and photographs', async t => {
  const doc = document();
  doc.publicId = 'same-client-link';
  const assets = structuredClone(doc.assets);
  stubFind(t, doc);
  const res = response();
  await updateDownloadLock({ params: { id: deliveryId }, user: { id: ownerId }, body: { locked: false, note: 'Available now.', watermarkEnabled: false, watermarkText: '', allowIndividualDownloads: true, allowDownloadAll: false } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(doc.access.downloadsLocked, false);
  assert.equal(doc.access.allowDownloadAll, false);
  assert.equal(doc.status, 'published');
  assert.equal(doc.publicId, 'same-client-link');
  assert.deepEqual(doc.assets, assets);
  assert.equal(doc.saved, true);
});

test('malformed settings and overlong watermark text are rejected before querying a delivery', async t => {
  t.mock.method(Delivery, 'findOne', () => { throw new Error('Must not query'); });
  const req = { params: { id: deliveryId }, user: { id: ownerId }, body: { locked: 'false' } };
  const res = response();
  await updateDownloadLock(req, res);
  assert.equal(res.statusCode, 400);
  req.body = { downloadsLocked: true, watermarkEnabled: true, watermarkText: 'x'.repeat(41) };
  const media = response();
  await getDeliveryPreviewMedia(req, media);
  assert.equal(media.statusCode, 400);
  assert.equal(Delivery.findOne.mock.callCount(), 0);
});

test('locked public downloads and Status cards remain blocked on the server', async t => {
  const doc = document();
  stubFind(t, doc);
  const req = { params: { publicId: 'locked-client-link', assetId: 'one' }, get: () => '', body: { assetIds: ['507f1f77-bcf8-4cd7-9943-901123456789'] } };
  for (const handler of [getPhotoDownload, streamPhotoDownload, getGalleryDownload, getPinboardStatusCard]) {
    doc.kind = 'pinboard';
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 403, handler.name);
    assert.equal(res.body.code, 'DOWNLOADS_LOCKED', handler.name);
  }
});
