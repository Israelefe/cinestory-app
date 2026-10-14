import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { handleVideoHls } from './video-hls.js';

const secret = randomBytes(32).toString('hex');
const assetId = 'a'.repeat(24);
const primaryOrigin = 'https://veylo.com.ng';
const wwwOrigin = 'https://www.veylo.com.ng';
const sources = [
  { name: 'adaptive HLS', original: false, format: 'hls' },
  { name: 'original HLS', original: true, format: 'hls' },
  { name: 'native original', original: true, format: 'file' },
];

function fixture(t, source, configuredOrigin = primaryOrigin) {
  const now = Math.floor(Date.now() / 1000);
  const version = randomUUID();
  const claims = { iss: 'veylo-video', aud: source.original ? 'veylo-video-original' : 'veylo-video-hls',
    purpose: source.original ? 'video-original' : 'video-hls', format: source.format,
    assetId, sessionId: randomUUID(), version, nbf: now - 1, exp: now + 600 };
  const unsigned = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url')].join('.');
  const token = unsigned + '.' + createHmac('sha256', secret).update(unsigned).digest('base64url');
  const calls = { authorization: 0, reads: 0, denied: 0, grantOrigin: configuredOrigin };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.authorization++;
    assert.equal(new URL(url).origin, 'https://api.example');
    assert.equal(new URL(url).pathname, '/api/v1/videos/media/authorize');
    assert.equal(options.headers['x-veylo-video-secret'], secret);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, 'manual');
    const request = JSON.parse(options.body);
    assert.equal(request.token, token);
    if (calls.denied) return new Response(null, { status: calls.denied });
    const native = source.format === 'file';
    const key = `veylo/video/owner/${assetId}/${source.original ? 'original-playback' : 'hls'}/${version}/${native ? 'playback.mp4' : request.file}`;
    return Response.json({ data: { key, bytes: 20, origin: calls.grantOrigin,
      contentType: native ? 'video/mp4' : request.file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      ...(native && request.range ? { range: { offset: 5, length: 5 } } : {}) } });
  });
  const env = { VIDEO_PLAYBACK_SECRET: secret, VEYLO_WEB_ORIGIN: configuredOrigin, VEYLO_API_ORIGIN: 'https://api.example',
    DELIVERY_MEDIA: { async get(key, options) {
      calls.reads++;
      assert.ok(key.startsWith(`veylo/video/owner/${assetId}/`));
      const bytes = new Uint8Array(20);
      return { size: 20, body: new Blob([options?.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes]).stream() };
    } } };
  const url = file => `https://media.example/video/${token}/${file}`;
  return { env, calls, url };
}

for (const source of sources) {
  test(`${source.name} accepts both Veylo browser origins and still checks every request`, async t => {
    const { env, calls, url } = fixture(t, source);
    const files = source.format === 'file' ? ['original'] : ['master.m3u8', 'q720/index.m3u8', 'q720/s000000.ts'];
    for (const origin of [primaryOrigin, wwwOrigin]) {
      for (const file of files) {
        const result = await handleVideoHls(new Request(url(file), { headers: { Origin: origin, Range: 'bytes=5-9' } }), env);
        assert.equal(result.status, 206);
        assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin);
        assert.equal(result.headers.get('Access-Control-Allow-Credentials'), null);
        assert.equal(result.headers.get('Vary'), 'Origin');
        assert.equal(result.headers.get('Content-Range'), 'bytes 5-9/20');
        assert.match(result.headers.get('Cache-Control'), /no-store/);
        assert.equal((await result.arrayBuffer()).byteLength, 5);
      }
      const reads = calls.reads;
      const head = await handleVideoHls(new Request(url(files[0]), { method: 'HEAD', headers: { Origin: origin } }), env);
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('Access-Control-Allow-Origin'), origin);
      assert.equal(calls.reads, reads);
      const authorizations = calls.authorization;
      const options = await handleVideoHls(new Request(url(files[0]), { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'Range' } }), env);
      assert.equal(options.status, 204);
      assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin);
      assert.equal(calls.authorization, authorizations);
    }
    assert.equal(calls.authorization, files.length * 2 + 2);
    const reads = calls.reads;
    calls.denied = 410;
    const revoked = await handleVideoHls(new Request(url(files[0]), { headers: { Origin: wwwOrigin } }), env);
    assert.equal(revoked.status, 410);
    assert.equal(revoked.headers.get('Access-Control-Allow-Origin'), wwwOrigin);
    assert.equal(calls.reads, reads);
    calls.denied = 0; calls.grantOrigin = wwwOrigin;
    assert.equal((await handleVideoHls(new Request(url(files[0]), { headers: { Origin: wwwOrigin } }), env)).status, 503);
    assert.equal(calls.reads, reads, 'The browser alias must not weaken the canonical API grant check.');
  });
}

test('video rejects untrusted origins and invalid tokens before authorization or storage', async t => {
  const { env, calls, url } = fixture(t, sources[0]);
  for (const origin of ['null', 'http://www.veylo.com.ng', 'https://other.veylo.com.ng', 'https://www.veylo.com.ng.evil.example', 'https://veylo.com.ng:444']) {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const result = await handleVideoHls(new Request(url('master.m3u8'), { method, headers: { Origin: origin } }), env);
      assert.equal(result.status, 403);
      assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
    }
  }
  assert.equal((await handleVideoHls(new Request('https://media.example/video/invalid/master.m3u8', { headers: { Origin: wwwOrigin } }), env)).status, 401);
  assert.equal(calls.authorization, 0);
  assert.equal(calls.reads, 0);
});

test('other configured client origins do not inherit the production hostname aliases', async t => {
  const configured = 'https://preview.example';
  const { env, calls, url } = fixture(t, sources[0], configured);
  assert.equal((await handleVideoHls(new Request(url('master.m3u8'), { method: 'HEAD', headers: { Origin: configured } }), env)).status, 200);
  for (const origin of [primaryOrigin, wwwOrigin, 'https://www.preview.example']) {
    assert.equal((await handleVideoHls(new Request(url('master.m3u8'), { headers: { Origin: origin } }), env)).status, 403);
  }
  assert.equal(calls.authorization, 1);
  assert.equal(calls.reads, 0);
});

test('a configured www origin still accepts the apex browser without changing the API grant origin', async t => {
  const { env, calls, url } = fixture(t, sources[0], wwwOrigin);
  const result = await handleVideoHls(new Request(url('master.m3u8'), { method: 'HEAD', headers: { Origin: primaryOrigin } }), env);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), primaryOrigin);
  assert.equal(calls.authorization, 1);
  assert.equal(calls.reads, 0);
});
