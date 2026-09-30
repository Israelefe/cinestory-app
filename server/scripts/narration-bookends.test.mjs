import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { cloudinary } from '../src/services/cloudinary.service.js';
import { synthesizeV3Narration } from '../src/services/narration.service.js';

process.env.DEEPGRAM_API_KEY = 'offline-test-key';
process.env.CLOUDINARY_CLOUD_NAME = 'veylo-test';
process.env.CLOUDINARY_API_KEY = 'offline-test-key';
process.env.CLOUDINARY_API_SECRET = 'offline-test-secret';
const shoot = () => ({ _id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439012', schemaVersion: 3, format: 'photo-story',
  creativeDirection: { openingLine: 'Convennant, your birthday story starts here.', closingLine: 'Here is your full gallery to enjoy.', frames: [{ assetId: 'photo-one', duration: 6, headline: 'A year of your own', caption: 'Convennant, this birthday gives you room to enjoy how far you have come and think about what you want next.' }] } });

function providers(t, { failClosing = false } = {}) {
  const requests = [], removed = [];
  let uploads = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/v2\/speak\?/); // No caption fitting or transcription calls.
    const text = JSON.parse(options.body).text;
    requests.push({ text, model: new URL(url).searchParams.get('model') });
    return { ok: true, arrayBuffer: async () => Buffer.from('offline-audio') };
  });
  t.mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => {
    const stream = new PassThrough();
    stream.on('data', () => {});
    stream.on('finish', () => {
      uploads += 1;
      callback(failClosing && uploads === 2 ? new Error('Storage unavailable') : null, { public_id: `private/audio-${uploads}`, format: 'mp3' });
    });
    return stream;
  });
  t.mock.method(cloudinary.uploader, 'destroy', async (id, options) => { removed.push({ id, options }); });
  return { requests, removed };
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
  await assert.rejects(synthesizeV3Narration(delivery), /Storage unavailable/);
  assert.deepEqual(delivery, before);
  assert.deepEqual(mocks.removed, [{ id: 'private/audio-1', options: { resource_type: 'video', type: 'authenticated' } }]);
});

test('bookend speech normalises dashes without speaking punctuation or photo captions', async t => {
  const mocks = providers(t), delivery = shoot();
  delivery.creativeDirection.openingLine = 'Convennant — your birthday story starts here.';
  await synthesizeV3Narration(delivery);
  assert.equal(mocks.requests.length, 2);
  assert.ok(mocks.requests.every(item => !/[—–]/.test(item.text)));
  assert.equal(delivery.creativeDirection.openingLine, 'Convennant — your birthday story starts here.');
});
