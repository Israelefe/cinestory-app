import test from 'node:test';
import assert from 'node:assert/strict';
import Delivery from '../src/models/Delivery.js';
import DeliveryShareGrant from '../src/models/DeliveryShareGrant.js';
import AnalyticsEvent from '../src/models/AnalyticsEvent.js';
import { getPhotoDownload, getGalleryDownload, streamPhotoDownload, updateDownloadSettings } from '../src/controllers/delivery.controller.js';
import { v3Access } from '../src/controllers/deliveryV3.controller.js';
import { cleanDeliveryAccess } from '../src/utils/deliveryAccess.js';
import { safeProviderError } from '../src/services/cloudinary.service.js';
import { verifyMediaWorkerToken } from '../src/services/cloudflareMedia.service.js';
import { removeDeliveryMedia } from '../src/services/deliveryMedia.service.js';

const id = '507f1f77bcf86cd799439011';
const ownerId = '507f1f77bcf86cd799439012';
const retired = { downloadsLocked: true, downloadLockNote: 'Old lock', watermarkEnabled: true, watermarkText: 'Old watermark' };
test.beforeEach(t => {
  const settings = { R2_MEDIA_OFFLOAD_ENABLED: 'true', R2_IMAGE_WORKER_URL: 'https://media.example.test', R2_IMAGE_WORKER_SECRET: 'offline-media-signing-key-with-at-least-32-characters', R2_ACCOUNT_ID: 'offline', R2_ACCESS_KEY_ID: 'offline', R2_SECRET_ACCESS_KEY: 'offline', R2_BUCKET_NAME: 'veylo' };
  const previous = Object.fromEntries(Object.keys(settings).map(name => [name, process.env[name]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  t.mock.method(AnalyticsEvent, 'create', async () => ({}));
});
function document() {
  return { _id: id, publicId: 'same-client-link', userId: { _id: ownerId, name: 'Amara' }, status: 'published', access: { ...retired, allowIndividualDownloads: true, allowDownloadAll: true }, assets: [{ assetId: 'one', publicId: `veylo/users/${ownerId}/deliveries/${id}/one` }, { assetId: 'two', publicId: `veylo/users/${ownerId}/deliveries/${id}/two` }], markModified() {}, async save() { this.saved = true; } };
}
function response() {
  return { statusCode: 200, headers: {}, chunks: [], cookie() {}, setHeader(key, value) { this.headers[key] = value; }, write(chunk) { this.chunks.push(chunk); return true; }, end() { this.ended = true; }, redirect(code, url) { this.statusCode = code; this.location = url; return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}
function stubFind(t, doc, check = () => {}) {
  t.mock.method(Delivery, 'findOne', query => {
    check(query);
    const result = Promise.resolve(doc);
    result.select = result.populate = () => result;
    return result;
  });
}
const request = () => ({ params: { publicId: 'same-client-link', assetId: 'one' }, cookies: {}, get: () => '' });

test('old access fields are omitted from hydrated delivery JSON and object responses', () => {
  const doc = Delivery.hydrate({ _id: id, userId: ownerId, access: { ...retired, allowIndividualDownloads: true, allowDownloadAll: false } });
  for (const data of [doc.toObject(), doc.toJSON(), JSON.parse(JSON.stringify(doc))]) {
    for (const field of Object.keys(retired)) assert.equal(field in data.access, false, field);
    assert.equal(data.access.allowIndividualDownloads, true);
    assert.equal(data.access.allowDownloadAll, false);
  }
});

for (const format of ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign', 'gridboard']) {
  test(`${format}: old lock and watermark flags do not block original download links`, async t => {
    const doc = document(); doc.format = format;
    stubFind(t, doc);
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Download links need no image processing'); });
    const res = response();
    await getPhotoDownload(request(), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body.data.url, /^https:\/\/media\.example\.test\/v2\/file\//);
    const claims = verifyMediaWorkerToken(new URL(res.body.data.url).pathname.split('/').at(-1));
    assert.equal(claims.key, doc.assets[0].publicId);
    assert.equal(claims.access.deliveryId, id);
    assert.equal(claims.access.mode, 'download');
    assert.doesNotMatch(res.body.data.url, /\/previews\/|\/deliveries\/media\/|l_text|c_limit/);
  });
}

test('legacy flags do not block direct original downloads or complete galleries', async t => {
  const doc = document();
  stubFind(t, doc);
  t.mock.method(Delivery, 'updateOne', async () => ({ modifiedCount: 1 }));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://media.example.test/v2/rpc/archive');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body).files, doc.assets.map(asset => ({ key: asset.publicId, name: asset.assetId })));
    return Response.json({ key: 'veylo/system/media-manifests/offline' });
  });
  const stream = response();
  await streamPhotoDownload(request(), stream);
  assert.equal(stream.statusCode, 302);
  assert.match(stream.location, /^https:\/\/media\.example\.test\/v2\/file\//);
  assert.equal(stream.chunks.length, 0);
  assert.equal(globalThis.fetch.mock.callCount(), 0, 'Render must not fetch original bytes');
  const gallery = response();
  await getGalleryDownload(request(), gallery);
  assert.equal(gallery.statusCode, 200);
  assert.match(gallery.body.data.url, /^https:\/\/media\.example\.test\/v2\/archive\//);
});

test('PIN, expiry and revoked access still protect photos after feature removal', async t => {
  const doc = document();
  stubFind(t, doc);
  for (const setting of [{ pinDigest: 'required-pin-hash' }, { expiresAt: new Date(0) }, { revokedAt: new Date() }]) {
    doc.access = { ...retired, allowIndividualDownloads: true, allowDownloadAll: true, ...setting };
    for (const handler of [getPhotoDownload, streamPhotoDownload, getGalleryDownload]) {
      const res = response();
      await handler(request(), res);
      assert.equal(res.statusCode, 404);
    }
  }
});

test('normal download permissions and restricted share grants still apply', async t => {
  const doc = document();
  doc.access.allowIndividualDownloads = false;
  doc.access.allowDownloadAll = false;
  stubFind(t, doc);
  const denied = response();
  await getPhotoDownload(request(), denied);
  assert.equal(denied.statusCode, 403);
  t.mock.method(DeliveryShareGrant, 'findOne', async () => ({ assetIds: ['two'], sectionIds: [], allowIndividualDownloads: true, allowDownloadAll: false }));
  const req = request(); req.get = key => key === 'x-delivery-grant' ? 'offline-grant' : '';
  const scoped = response();
  await getPhotoDownload(req, scoped);
  assert.equal(scoped.statusCode, 404);
});

test('regular download settings enforce ownership and preserve the published link and photos', async t => {
  const doc = document();
  const photos = structuredClone(doc.assets);
  stubFind(t, doc, query => assert.deepEqual(query, { _id: id, userId: ownerId }));
  const res = response();
  await updateDownloadSettings({ params: { id }, user: { id: ownerId }, body: { allowIndividualDownloads: true, allowDownloadAll: false } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { allowIndividualDownloads: true, allowDownloadAll: false });
  assert.equal(doc.saved, true);
  assert.equal(doc.publicId, 'same-client-link');
  assert.equal(doc.status, 'published');
  assert.deepEqual(doc.assets, photos);
  Delivery.findOne.mock.mockImplementation(() => Promise.resolve(null));
  const foreign = response();
  await updateDownloadSettings({ params: { id }, user: { id: ownerId }, body: { allowIndividualDownloads: true, allowDownloadAll: true } }, foreign);
  assert.equal(foreign.statusCode, 404);
});

test('download settings reject retired controls and invalid types before querying', async t => {
  t.mock.method(Delivery, 'findOne', () => { throw new Error('Must not query invalid input'); });
  for (const body of [{ allowIndividualDownloads: 'true', allowDownloadAll: true }, { allowIndividualDownloads: true, allowDownloadAll: true, watermarkEnabled: true }]) {
    const res = response();
    await updateDownloadSettings({ params: { id }, user: { id: ownerId }, body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('V3 accepts old drafts without restoring retired settings; unrelated fields remain invalid', async t => {
  const doc = Delivery.hydrate({ _id: id, userId: ownerId, schemaVersion: 3, status: 'draft', access: { ...retired, pinDigest: 'existing-pin' }, v3: {} });
  t.mock.method(doc, 'save', async () => doc);
  stubFind(t, doc);
  const input = { ...retired, allowIndividualDownloads: true, allowDownloadAll: false, allowLikes: true, expiresAt: '', usageTerms: '' };
  const res = response();
  await v3Access({ params: { id }, user: { id: ownerId }, body: input }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.hasPin, true);
  assert.equal(res.body.data.access.allowDownloadAll, false);
  for (const field of Object.keys(retired)) assert.equal(field in res.body.data.access, false);
  const malformed = response();
  await v3Access({ params: { id }, user: { id: ownerId }, body: { ...input, unrelated: true } }, malformed);
  assert.equal(malformed.statusCode, 400);
  assert.equal(cleanDeliveryAccess(input).allowIndividualDownloads, true);
});

test('delivery cleanup only removes its R2 prefix and accepts an already deleted original', async t => {
  const key = `veylo/users/${ownerId}/deliveries/${id}/one`;
  t.mock.method(globalThis, 'fetch', async (value, options = {}) => {
    const url = new URL(value);
    if (options.method === 'DELETE') {
      assert.equal(decodeURIComponent(url.pathname), `/veylo/${key}`);
      return new Response(null, { status: 404 });
    }
    assert.equal(url.searchParams.get('list-type'), '2');
    assert.equal(url.searchParams.get('prefix'), `veylo/users/${ownerId}/deliveries/${id}/`);
    return new Response(`<ListBucketResult><Contents><Key>${key}</Key><Size>4</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>`);
  });
  assert.equal(await removeDeliveryMedia(ownerId, id), 1);
  assert.equal(globalThis.fetch.mock.callCount(), 2);
  assert.deepEqual(safeProviderError({ error: { http_code: 503 }, request_options: { auth: 'never-log-this' } }), { status: 503, code: 'PROVIDER_REQUEST_FAILED' });
});
