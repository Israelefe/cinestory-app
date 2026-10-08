import assert from 'node:assert/strict';
import test from 'node:test';
import { synthesizeV3Narration } from '../src/services/narration.service.js';

process.env.DEEPGRAM_API_KEY = 'offline-test-key';
Object.assign(process.env, { R2_MEDIA_OFFLOAD_ENABLED: 'false', R2_ACCOUNT_ID: 'offline', R2_ACCESS_KEY_ID: 'offline', R2_SECRET_ACCESS_KEY: 'offline', R2_BUCKET_NAME: 'veylo-test' });
const shoot = () => ({ _id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439012', schemaVersion: 3, format: 'photo-story',
  creativeDirection: { openingLine: 'Convennant, your birthday story starts here.', closingLine: 'Here is your full gallery to enjoy.', frames: [{ assetId: 'photo-one', duration: 6, headline: 'A year of your own', caption: 'Convennant, this birthday gives you room to enjoy how far you have come and think about what you want next.' }] } });

function providers(t, { failClosing = false } = {}) {
  const requests = [], removed = [], stored = [];
  let uploads = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url).hostname.endsWith('.r2.cloudflarestorage.com')) {
      if (options.method === 'DELETE') { removed.push(new URL(url).pathname); return new Response(null, { status: 204 }); }
      assert.equal(options.method, 'PUT');
      uploads += 1;
      if (failClosing && uploads === 2) return new Response('Storage unavailable', { status: 503 });
      stored.push(new URL(url).pathname);
      return new Response(null, { headers: { ETag: '"audio-etag"' } });
    }
    assert.match(url, /\/v2\/speak\?/); // No caption fitting or transcription calls.
    const text = JSON.parse(options.body).text;
    requests.push({ text, model: new URL(url).searchParams.get('model') });
    return { ok: true, arrayBuffer: async () => Buffer.from('offline-audio') };
  });
  return { requests, removed, stored };
}

test('even queued caption-only requests produce only bookend voice without changing written captions or timing', async t => {
  const mocks = providers(t), delivery = shoot(), before = structuredClone(delivery), progress = [];
  const result = await synthesizeV3Narration(delivery, { bookends: false, captions: true, voiceId: 'flux-kit-en' }, stage => progress.push(stage));
  assert.deepEqual(delivery, before);
  assert.equal(result.captions, undefined);
  assert.deepEqual(mocks.requests.map(item => item.text), [before.creativeDirection.openingLine, before.creativeDirection.closingLine]);
  assert.ok(mocks.requests.every(item => item.model === 'flux-kit-en' && item.text.length <= 2000));
  assert.deepEqual(progress, ['recording-bookends']);
});

test('a failed closing upload removes the new opening audio and preserves the written delivery', async t => {
  const mocks = providers(t, { failClosing: true }), delivery = shoot(), before = structuredClone(delivery);
  await assert.rejects(synthesizeV3Narration(delivery), { code: 'R2_REQUEST_FAILED' });
  assert.deepEqual(delivery, before);
  assert.deepEqual(mocks.removed, mocks.stored);
  assert.equal(mocks.removed.length, 1);
});

test('bookend speech normalises dashes without speaking punctuation or photo captions', async t => {
  const mocks = providers(t), delivery = shoot();
  delivery.creativeDirection.openingLine = 'Convennant — your birthday story starts here.';
  await synthesizeV3Narration(delivery);
  assert.equal(mocks.requests.length, 2);
  assert.ok(mocks.requests.every(item => !/[—–]/.test(item.text)));
  assert.equal(delivery.creativeDirection.openingLine, 'Convennant — your birthday story starts here.');
});
