import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import Delivery from '../src/models/Delivery.js';
import DeliveryPreviewFile from '../src/models/DeliveryPreviewFile.js';
import { cloudinary } from '../src/services/cloudinary.service.js';
import { ensureStoredWatermark, storedDeliveryPreviews, storedPreviewMedia, previewRenderKey } from '../src/services/deliveryPreviewCache.service.js';

process.env.CLOUDINARY_CLOUD_NAME = 'veylo-test';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
const delivery = { _id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439012' };
const lean = value => ({ lean: async () => value });

test('preparing a photo draws once, coalesces requests and stores three private sizes; cached visits do no image work', async t => {
  const asset = { assetId: 'one', publicId: 'offline/cache-one', contentHash: 'original', bytes: 123 };
  const original = structuredClone(asset);
  const input = await sharp({ create: { width: 1400, height: 1800, channels: 3, background: '#334455' } }).jpeg().toBuffer();
  let stored;
  const uploads = [];
  t.mock.method(DeliveryPreviewFile, 'findOne', () => lean(stored));
  t.mock.method(Delivery, 'exists', async () => ({ _id: delivery._id }));
  t.mock.method(globalThis, 'fetch', async () => new Response(input, { headers: { 'content-type': 'image/jpeg' } }));
  t.mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => ({ end(buffer) {
    uploads.push({ options, buffer });
    sharp(buffer).metadata().then(metadata => callback(null, { public_id: `${options.folder}/${options.public_id}`, width: metadata.width, height: metadata.height }));
  } }));
  t.mock.method(DeliveryPreviewFile, 'findOneAndUpdate', async (query, update) => (stored = { ...query, ...update.$set }));
  const files = await Promise.all([1, 2, 3].map(() => ensureStoredWatermark(delivery, asset, 'Amara Photography')));
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  assert.equal(uploads.length, 3);
  assert.deepEqual(files[0].variants.map(variant => variant.width), [480, 960, 1400]);
  assert.ok(files.every(file => file === files[0]));
  for (const { options, buffer } of uploads) {
    assert.equal(options.type, 'authenticated');
    assert.equal(options.overwrite, false);
    assert.match(options.folder, /\/deliveries\/507f1f77bcf86cd799439011\/previews$/);
    assert.equal(options.transformation, undefined);
    assert.equal((await sharp(buffer).metadata()).format, 'webp');
  }
  await ensureStoredWatermark(delivery, asset, 'Amara Photography');
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  assert.equal(uploads.length, 3);
  assert.deepEqual(asset, original);
  const media = storedPreviewMedia(files[0]);
  assert.match(new URL(media.url).pathname, /image\/authenticated\/.*\.webp$/);
  assert.match(media.srcSet, /480w, .*960w, .*1400w$/);
  assert.doesNotMatch(media.url, /l_text|c_limit/);
});

test('preview lookup is scoped to the delivery, exact asset content and current watermark text', async t => {
  const asset = { assetId: 'one', publicId: 'offline/cache-one', contentHash: 'new-content' };
  const file = { assetId: asset.assetId, renderKey: previewRenderKey(asset, 'Amara'), variants: [{ width: 480, publicId: 'private/previews/one' }] };
  t.mock.method(DeliveryPreviewFile, 'find', query => {
    assert.equal(query.deliveryId, delivery._id);
    return lean([file]);
  });
  assert.equal((await storedDeliveryPreviews({ ...delivery, assets: [asset] }, 'Amara')).size, 1);
  assert.equal((await storedDeliveryPreviews({ ...delivery, assets: [asset] }, 'Different studio')).size, 0);
  assert.equal((await storedDeliveryPreviews({ ...delivery, assets: [{ ...asset, contentHash: 'replaced' }] }, 'Amara')).size, 0);
});

test('an upload failure saves no completed cache entry and can be retried', async t => {
  const asset = { assetId: 'retry', publicId: 'offline/cache-retry' };
  const input = await sharp({ create: { width: 320, height: 400, channels: 3, background: '#334455' } }).png().toBuffer();
  let fail = true;
  t.mock.method(DeliveryPreviewFile, 'findOne', () => lean(null));
  t.mock.method(Delivery, 'exists', async () => ({ _id: delivery._id }));
  t.mock.method(globalThis, 'fetch', async () => new Response(input, { headers: { 'content-type': 'image/png' } }));
  t.mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => ({ end() {
    callback(fail ? new Error('Unavailable') : null, { public_id: `${options.folder}/${options.public_id}`, width: 320, height: 400 });
  } }));
  t.mock.method(DeliveryPreviewFile, 'findOneAndUpdate', async (query, update) => ({ ...query, ...update.$set }));
  await assert.rejects(ensureStoredWatermark(delivery, asset, 'Amara'), /Unavailable/);
  assert.equal(DeliveryPreviewFile.findOneAndUpdate.mock.callCount(), 0);
  fail = false;
  const result = await ensureStoredWatermark(delivery, asset, 'Amara');
  assert.equal(result.variants.length, 1);
  assert.equal(DeliveryPreviewFile.findOneAndUpdate.mock.callCount(), 1);
});

test('deleted photos are rejected before any source fetch or upload', async t => {
  t.mock.method(DeliveryPreviewFile, 'findOne', () => lean(null));
  t.mock.method(Delivery, 'exists', async () => null);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not fetch deleted photos'); });
  await assert.rejects(ensureStoredWatermark(delivery, { assetId: 'deleted', publicId: 'offline/deleted' }, 'Amara'), /no longer available/);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
