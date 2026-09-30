import assert from 'node:assert/strict';
import test from 'node:test';
import Delivery from '../src/models/Delivery.js';
import { getDeliveryPreviewMedia, updateDownloadLock, getPhotoDownload, streamPhotoDownload, getGalleryDownload, getPinboardStatusCard } from '../src/controllers/delivery.controller.js';
import { signedImageUrl } from '../src/services/deliveryMedia.service.js';

// Dummy signing values: these tests do not contact Cloudinary or a database.
process.env.CLOUDINARY_CLOUD_NAME = 'veylo-test';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
function response() {
  return { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
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

test('watermarks appear on thumbnails, main images and responsive sizes, but never change originals', () => {
  for (const options of [{ thumbnail: true }, {}, { width: 480 }, { width: 960 }]) {
    const url = decodeURIComponent(signedImageUrl('private-shoot/one', { ...options, watermark: 'Amara Photography' }));
    assert.match(url, /l_text:Arial_38_bold:Amara Photography/);
    assert.match(url, /o_55/);
  }
  assert.equal(signedImageUrl('private-shoot/one', { original: true, watermark: 'Amara' }), signedImageUrl('private-shoot/one', { original: true }));
  assert.doesNotMatch(signedImageUrl('private-shoot/one', { thumbnail: true }), /l_text/);
});

test('only the owner can request watermarked preview media; studio fallback and clean previews work', async t => {
  const doc = document();
  stubFind(t, doc, query => assert.deepEqual(query, { _id: deliveryId, userId: ownerId }));
  const req = { params: { id: deliveryId }, user: { id: ownerId }, body: { downloadsLocked: true, watermarkEnabled: true, watermarkText: '' } };
  const res = response();
  await getDeliveryPreviewMedia(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.assets.length, 2);
  for (const asset of res.body.data.assets) {
    for (const key of ['url', 'thumbnailUrl', 'srcSet']) assert.match(decodeURIComponent(asset[key]), /Amara Photography/);
    assert.equal(asset.publicId, undefined);
  }
  req.body.downloadsLocked = false;
  const clean = response();
  await getDeliveryPreviewMedia(req, clean);
  assert.doesNotMatch(clean.body.data.assets[0].url, /l_text/);
  assert.equal(doc.saved, undefined);
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
