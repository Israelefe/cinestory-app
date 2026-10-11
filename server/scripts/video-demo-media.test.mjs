import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDemoVideo } from '../../cloudflare/delivery-images/demo-videos.js';
import { VIDEO_DEMO_MEDIA, demoVideoUrl } from '../../client/src/constants/videoDemoMedia.js';

const film = VIDEO_DEMO_MEDIA.portrait;
function storage({ size = film.bytes, missing = false, changed = false } = {}) {
  const calls = [];
  const metadata = { size, etag: 'original-etag', httpEtag: '"original-etag"', uploaded: new Date('2026-10-11T12:00:00Z') };
  return { calls, env: { DELIVERY_MEDIA: {
    async head(key) { calls.push(['head', key]); return missing ? null : metadata; },
    async get(key, options) { calls.push(['get', key, options]); return changed ? metadata : { ...metadata, body: new Uint8Array(options.range?.length || 16).fill(7) }; }
  } } };
}
const request = (headers = {}, method = 'GET') => new Request(demoVideoUrl(film), { headers, method });

test('public demo route never reads arbitrary or private R2 keys', async () => {
  const { env, calls } = storage();
  for (const path of ['/demo-videos/unknown.mp4', '/demo-videos/veylo/users/private.mp4', '/demo-videos/%2e%2e%2fprivate.mp4', `/demo-videos/${film.filename}?key=private`]) {
    assert.equal((await handleDemoVideo(new Request('https://media.test' + path), env)).status, 404);
  }
  assert.equal(await handleDemoVideo(new Request('https://media.test/video/private/original'), env), null);
  assert.deepEqual(calls, []);
});

test('HEAD and conditional requests do not stream originals', async () => {
  const { env, calls } = storage();
  const head = await handleDemoVideo(request({}, 'HEAD'), env);
  assert.equal(head.status, 200); assert.equal(head.body, null);
  assert.equal(head.headers.get('Content-Length'), String(film.bytes));
  assert.equal(head.headers.get('Content-Type'), 'video/mp4');
  assert.equal(head.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(head.headers.get('Cache-Control'), /immutable/);
  const unchanged = await handleDemoVideo(request({ 'If-None-Match': 'W/"original-etag"' }), env);
  assert.equal(unchanged.status, 304); assert.equal(unchanged.body, null);
  assert.equal(calls.filter(([method]) => method === 'get').length, 0);
});

test('browser seeking and suffix ranges return exact requested bytes', async () => {
  for (const [range, offset, length] of [['bytes=10-19', 10, 10], ['bytes=-12', film.bytes - 12, 12], [`bytes=${film.bytes - 5}-`, film.bytes - 5, 5]]) {
    const { env, calls } = storage();
    const response = await handleDemoVideo(request({ Range: range }), env);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), `bytes ${offset}-${offset + length - 1}/${film.bytes}`);
    assert.equal((await response.arrayBuffer()).byteLength, length);
    assert.deepEqual(calls[1], ['get', film.objectKey, { range: { offset, length }, onlyIf: { etagMatches: 'original-etag' } }]);
  }
});

test('invalid ranges fail before streaming and stale If-Range requests receive a full response', async () => {
  for (const range of ['bytes=20-10', 'bytes=-0', `bytes=${film.bytes}-`, 'bytes=0-1,5-6', 'bytes=9007199254740992-']) {
    const { env, calls } = storage();
    const response = await handleDemoVideo(request({ Range: range }), env);
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), `bytes */${film.bytes}`);
    assert.equal(calls.length, 1);
  }
  const { env, calls } = storage();
  assert.equal((await handleDemoVideo(request({ Range: 'bytes=0-10', 'If-Range': '"stale-etag"' }), env)).status, 200);
  assert.equal(calls[1][2].range, undefined);
});

test('missing or changed media and write methods fail closed', async () => {
  assert.equal((await handleDemoVideo(request(), storage({ missing: true }).env)).status, 404);
  assert.equal((await handleDemoVideo(request(), storage({ size: 20 }).env)).status, 503);
  assert.equal((await handleDemoVideo(request(), storage({ changed: true }).env)).status, 503);
  const { env, calls } = storage();
  assert.equal((await handleDemoVideo(request({}, 'POST'), env)).status, 405);
  assert.equal((await handleDemoVideo(request({}, 'OPTIONS'), env)).status, 204);
  assert.deepEqual(calls, []);
});
