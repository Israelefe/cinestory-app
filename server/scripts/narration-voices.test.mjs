import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import Delivery from '../src/models/Delivery.js';
import DeliveryJob from '../src/models/DeliveryJob.js';
import { NARRATION_VOICES, DEFAULT_NARRATION_VOICE_ID } from '../src/constants/narrationVoices.js';
import { NARRATION_VOICES as clientVoices } from '../../client/src/constants/narrationVoices.js';
import { getNarrationVoiceCatalogue, synthesizeV3Narration, generateNarration } from '../src/services/narration.service.js';
import { v3Narration, v3Approve } from '../src/controllers/deliveryV3.controller.js';

process.env.DEEPGRAM_API_KEY = 'offline-test-key';
Object.assign(process.env, { R2_MEDIA_OFFLOAD_ENABLED: 'false', R2_ACCOUNT_ID: 'offline', R2_ACCESS_KEY_ID: 'offline', R2_SECRET_ACCESS_KEY: 'offline', R2_BUCKET_NAME: 'veylo-test' });
const id = '507f1f77bcf86cd799439011';
const ownerId = '507f1f77bcf86cd799439012';
const delivery = { _id: id, userId: ownerId, schemaVersion: 3, status: 'review', format: 'photo-story', v3: { revision: 2 }, assets: [{ assetId: 'photo-one' }], curatedAssetIds: ['photo-one'], creativeDirection: { openingLine: 'Ada, welcome to your birthday story.', closingLine: 'Your whole collection is here for you.', frames: [{ assetId: 'photo-one', caption: 'Ada, take this new year at your own pace.' }] } };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('client and server offer the same four male and four female English Flux voices with real samples', async () => {
  assert.deepEqual(clientVoices, NARRATION_VOICES);
  assert.equal(NARRATION_VOICES.filter(voice => voice.presentation === 'Male').length, 4);
  assert.equal(NARRATION_VOICES.filter(voice => voice.presentation === 'Female').length, 4);
  assert.equal(DEFAULT_NARRATION_VOICE_ID, 'flux-hannah-en');
  const catalogue = await getNarrationVoiceCatalogue();
  for (const voice of catalogue) {
    assert.equal(voice.model, voice.id);
    assert.equal(voice.language, 'English');
    assert.match(voice.id, /^flux-[a-z]+-en$/);
    const sample = await readFile(new URL(`../../client/public${voice.previewUrl}`, import.meta.url));
    assert.ok(sample.length > 1024);
    assert.ok(sample.toString('ascii', 0, 3) === 'ID3' || sample[0] === 0xff && (sample[1] & 0xe0) === 0xe0);
  }
});

test('every chosen voice reaches Deepgram for opening and closing only, even for legacy caption requests and is saved in narration metadata', async t => {
  const requests = [];
  let text = '';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/v2/speak')) {
      requests.push(new URL(url).searchParams.get('model'));
      text = JSON.parse(options.body).text;
      return { ok: true, arrayBuffer: async () => Buffer.from('offline-audio') };
    }
    if (new URL(url).hostname.endsWith('.r2.cloudflarestorage.com')) {
      assert.equal(options.method, 'PUT');
      return new Response(null, { headers: { ETag: '"audio-etag"' } });
    }
    const words = text.split(/\s+/).map((word, index) => ({ punctuated_word: word, start: index * .1, end: index * .1 + .09 }));
    return { ok: true, json: async () => ({ metadata: { duration: words.length * .1 }, results: { channels: [{ alternatives: [{ words }] }] } }) };
  });
  for (const voice of NARRATION_VOICES) {
    requests.length = 0;
    const result = await synthesizeV3Narration(delivery, { bookends: true, captions: true, voiceId: voice.id });
    assert.deepEqual(requests, [voice.id, voice.id]);
    assert.equal(result.voiceId, voice.id);
    assert.equal(result.voiceName, voice.name);
    assert.equal(result.captions, undefined);
    assert.ok(result.opening.publicId);
    assert.ok(result.closing.publicId);
    assert.equal(delivery.creativeDirection.frames[0].caption, 'Ada, take this new year at your own pace.');
  }
});

test('the queue records the requested voice and verifies delivery ownership', async t => {
  t.mock.method(Delivery, 'findOne', query => {
    assert.deepEqual(query, { _id: id, userId: ownerId, schemaVersion: 3 });
    return Promise.resolve(delivery);
  });
  t.mock.method(DeliveryJob, 'findOne', () => ({ select: async fields => { assert.equal(fields, '+input'); return null; } }));
  t.mock.method(DeliveryJob, 'create', async job => job);
  for (const voice of NARRATION_VOICES) {
    const res = response();
    await v3Narration({ params: { id }, user: { id: ownerId }, body: { voiceId: voice.id, bookends: true, captions: true } }, res);
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.data.input.voiceId, voice.id);
    assert.equal(res.body.data.input.revision, 2);
    assert.equal(res.body.data.input.bookends, true);
    assert.equal(res.body.data.input.captions, false);
  }
});

test('unknown voices are rejected before database or provider work', async t => {
  t.mock.method(Delivery, 'findOne', () => { throw new Error('Must not query'); });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call provider'); });
  const res = response();
  await v3Narration({ params: { id }, user: { id: ownerId }, body: { voiceId: 'arbitrary-model' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /narration voice/);
  await assert.rejects(synthesizeV3Narration(delivery, { voiceId: 'arbitrary-model' }), { code: 'NARRATION_VOICE_INVALID' });
  await assert.rejects(generateNarration(delivery, { voiceId: 'arbitrary-model' }), { code: 'NARRATION_VOICE_INVALID' });
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  assert.equal(Delivery.findOne.mock.callCount(), 0);
});

test('a request for another voice cannot silently reuse a running Hannah job', async t => {
  t.mock.method(Delivery, 'findOne', async () => delivery);
  t.mock.method(DeliveryJob, 'findOne', () => ({ select: async fields => { assert.equal(fields, '+input'); return { input: { bookends: true, captions: false } }; } }));
  t.mock.method(DeliveryJob, 'create', () => { throw new Error('Must not replace a running job'); });
  const res = response();
  await v3Narration({ params: { id }, user: { id: ownerId }, body: { voiceId: 'flux-kit-en' } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'NARRATION_ALREADY_RUNNING');
  assert.equal(DeliveryJob.create.mock.callCount(), 0);
});

test('a repeated narration request resumes the matching selected voice without queuing a duplicate', async t => {
  const job = { _id: 'kit-job', input: { voiceId: 'flux-kit-en', bookends: true, captions: false } };
  t.mock.method(Delivery, 'findOne', async () => delivery);
  t.mock.method(DeliveryJob, 'findOne', query => { assert.deepEqual(query.cancelRequestedAt, { $exists: false }); return { select: async fields => { assert.equal(fields, '+input'); return job; } }; });
  t.mock.method(DeliveryJob, 'create', () => { throw new Error('Must not duplicate narration'); });
  const res = response(); await v3Narration({ params: { id }, user: { id: ownerId }, body: { voiceId: 'flux-kit-en' } }, res);
  assert.equal(res.statusCode, 202); assert.equal(res.body.data, job);
  assert.equal(DeliveryJob.create.mock.callCount(), 0);
});

test('approval accepts existing Hannah audio and newly generated selected voices', async t => {
  const photoIds = Array.from({ length: 5 }, (_, index) => `photo-${index}`);
  const doc = { ...delivery, kind: 'showcase', assets: photoIds.map(assetId => ({ assetId })), curatedAssetIds: photoIds, soundtrack: { catalogId: 'track' }, markModified() {}, async save() {} };
  t.mock.method(Delivery, 'findOne', async () => doc);
  t.mock.method(DeliveryJob, 'exists', async () => null);
  for (const legacy of [true, false]) {
    const voiceId = legacy ? 'flux-hannah-en' : 'flux-kit-en';
    doc.v3 = { revision: 2, narrationChoice: 'voice', captionNarrationChoice: 'voice', ...(legacy ? {} : { narrationVoiceId: voiceId }) };
    doc.narration = { voiceId, renderVersion: legacy ? 'flux-hannah-bookends-v3' : 'flux-bookends-v4', opening: { publicId: 'private/opening' }, closing: { publicId: 'private/closing' }, captions: undefined };
    const res = response();
    await v3Approve({ params: { id }, user: { id: ownerId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(doc.v3.approvedRevision, 2);
  }
  doc.v3 = { revision: 2, narrationChoice: 'voice', captionNarrationChoice: 'voice', narrationVoiceId: 'flux-cliff-en' };
  const mismatch = response();
  await v3Approve({ params: { id }, user: { id: ownerId } }, mismatch);
  assert.equal(mismatch.statusCode, 409);
  assert.match(mismatch.body.message, /Generate the selected Photo Story voice/);
});
