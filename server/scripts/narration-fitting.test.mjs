import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { cloudinary } from '../src/services/cloudinary.service.js';
import { synthesizeV3Narration } from '../src/services/narration.service.js';

Object.assign(process.env, { DEEPGRAM_API_KEY: 'offline-key', ALIBABA_MODEL_STUDIO_API_KEY: 'offline-key', ALIBABA_BASE_URL: 'https://test.aliyuncs.com/compatible-mode/v1', CLOUDINARY_CLOUD_NAME: 'offline-cloud', CLOUDINARY_API_KEY: 'offline-key', CLOUDINARY_API_SECRET: 'offline-secret' });

const longCaption = 'Convennant, this birthday is a chance to mark what matters to you and make room for what you want next.';
function shoot(captions = [longCaption]) {
  return { _id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439012', schemaVersion: 3, format: 'photo-story', clientName: 'Convennant', brief: 'birthday', shootType: 'Birthday', assets: captions.map((caption, index) => ({ assetId: 'photo-' + index })), curatedAssetIds: captions.map((caption, index) => 'photo-' + index), creativeDirection: { openingLine: 'Convennant, your birthday story is ready.', closingLine: 'Your full collection is here for you.', frames: captions.map((caption, index) => ({ assetId: 'photo-' + index, caption, duration: 6 })) } };
}

function providers(t, { fit, secondsPerWord = () => .4 } = {}) {
  const recordings = [], fits = [], uploads = [], destroyed = [];
  let spoken = '', serial = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('/chat/completions')) {
      const request = JSON.parse(options.body);
      assert.equal(request.model, 'deepseek-v4.1-flash');
      const input = JSON.parse(request.messages[1].content[0].text);
      fits.push(input);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ captions: fit(input, fits.length) }) } }] }) };
    }
    if (String(url).includes('/v2/speak')) {
      spoken = JSON.parse(options.body).text;
      recordings.push({ text: spoken, speed: Number(new URL(url).searchParams.get('speed')), voiceId: new URL(url).searchParams.get('model') });
      return { ok: true, arrayBuffer: async () => Buffer.from('offline-audio') };
    }
    let time = 0;
    const words = spoken.split('\n\n').flatMap((line, segmentIndex) => {
      const tokens = line.split(/\s+/);
      const step = secondsPerWord(recordings.length, segmentIndex, tokens.length);
      return tokens.map(word => { const start = time; time += step; return { punctuated_word: word, start, end: time - .01 }; });
    });
    return { ok: true, json: async () => ({ metadata: { duration: time }, results: { channels: [{ alternatives: [{ words }] }] } }) };
  });
  t.mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => {
    const stream = new PassThrough();
    stream.on('data', () => {});
    stream.on('finish', () => {
      const publicId = `private/narration/${++serial}`;
      uploads.push(publicId);
      callback(null, { public_id: publicId, duration: 4, bytes: 100, format: 'mp3' });
    });
    return stream;
  });
  t.mock.method(cloudinary.uploader, 'destroy', async id => { destroyed.push(id); });
  return { recordings, fits, uploads, destroyed };
}

test('a long written caption receives a complete spoken version at normal speed without changing the caption or photo duration', async t => {
  const spokenText = 'Convennant, keep what matters close as this birthday begins.';
  const mocks = providers(t, { fit: input => input.captions.map(caption => ({ assetId: caption.assetId, spokenText })) });
  const delivery = shoot(); const before = structuredClone(delivery); const progress = [];
  const result = await synthesizeV3Narration(delivery, { bookends: false, captions: true, voiceId: 'flux-kit-en' }, (stage, value) => progress.push({ stage, value }));
  assert.deepEqual(delivery, before);
  assert.equal(result.captions.segments[0].text, longCaption);
  assert.equal(result.captions.segments[0].spokenText, spokenText);
  assert.equal(result.captions.transcript, spokenText);
  assert.equal(result.captions.captionsAdapted, true);
  assert.equal(result.captions.renderVersion, 'flux-captions-v8');
  assert.equal(mocks.recordings[0].speed, 1);
  assert.equal(mocks.recordings[0].voiceId, 'flux-kit-en');
  assert.equal(mocks.fits[0].delivery.clientName, 'Convennant');
  assert.equal(mocks.fits[0].delivery.purpose, 'birthday');
  assert.equal(mocks.uploads.length, 1);
  assert.ok(progress.some(item => item.stage === 'fitting-captions'));
  assert.ok(result.captions.segments[0].endSec - result.captions.segments[0].startSec <= 5.45);
});

test('actual speech length triggers fitting only for the long line and preserves the other spoken caption', async t => {
  const captions = ['Convennant, may this birthday leave room for what matters most.', 'Convennant, this birthday belongs to you.'];
  const replacement = 'Convennant, keep this birthday close to you.';
  const mocks = providers(t, { fit: input => input.captions.map(caption => ({ assetId: caption.assetId, spokenText: replacement })), secondsPerWord: (recording, segmentIndex) => recording === 1 && segmentIndex === 0 ? .7 : .4 });
  const delivery = shoot(captions);
  const result = await synthesizeV3Narration(delivery, { bookends: false, captions: true });
  assert.equal(mocks.recordings.length, 2);
  assert.equal(mocks.fits.length, 1);
  assert.deepEqual(mocks.fits[0].captions.map(caption => caption.assetId), ['photo-0']);
  assert.ok(mocks.fits[0].captions[0].maxWords < 10);
  assert.equal(result.captions.segments[0].spokenText, replacement);
  assert.equal(result.captions.segments[1].spokenText, captions[1]);
  assert.deepEqual(delivery.creativeDirection.frames.map(frame => frame.caption), captions);
  assert.ok(mocks.recordings.every(recording => recording.speed === 1));
  assert.ok(result.captions.segments.every(segment => segment.endSec - segment.startSec <= 5.45));
  assert.equal(mocks.uploads.length, 1);
});

test('fitting retries an invented name before sending anything to TTS', async t => {
  const mocks = providers(t, { fit: (input, attempt) => input.captions.map(caption => ({ assetId: caption.assetId, spokenText: attempt === 1 ? 'Lora, keep what matters close as this birthday begins.' : 'Convennant, keep what matters close as this birthday begins.' })) });
  const result = await synthesizeV3Narration(shoot(), { bookends: false, captions: true });
  assert.equal(mocks.fits.length, 2);
  assert.equal(mocks.recordings.length, 1);
  assert.doesNotMatch(mocks.recordings[0].text, /Lora/);
  assert.match(result.captions.transcript, /Convennant/);
});

test('unusable fitting leaves the written story intact and removes already generated bookend audio', async t => {
  const mocks = providers(t, { fit: input => input.captions.map(caption => ({ assetId: caption.assetId, spokenText: 'Lora, here is your birthday.' })) });
  const delivery = shoot(); const before = structuredClone(delivery);
  await assert.rejects(synthesizeV3Narration(delivery, { bookends: true, captions: true }), { code: 'NARRATION_FITTING_FAILED' });
  assert.deepEqual(delivery, before);
  assert.equal(mocks.fits.length, 2);
  assert.equal(mocks.recordings.length, 2);
  assert.deepEqual(mocks.destroyed, mocks.uploads);
});

test('provider timing that never fits stops bounded retries without rushing speech, clipping audio or requesting manual caption edits', async t => {
  const mocks = providers(t, { fit: (input, attempt) => input.captions.map(caption => ({ assetId: caption.assetId, spokenText: attempt === 1 ? 'Convennant, keep what matters close as this birthday begins.' : attempt === 2 ? 'Convennant, your birthday is yours.' : "Convennant's birthday matters." })), secondsPerWord: (_recording, _segment, count) => 8 / count });
  const delivery = shoot(); const before = structuredClone(delivery);
  await assert.rejects(synthesizeV3Narration(delivery, { bookends: false, captions: true }), error => error.code === 'NARRATION_CAPTION_TOO_LONG' && !/Shorten that caption|needs to be shorter/.test(error.message));
  assert.deepEqual(delivery, before);
  assert.equal(mocks.recordings.length, 4);
  assert.equal(mocks.fits.length, 4);
  assert.equal(mocks.uploads.length, 0);
  assert.ok(mocks.recordings.every(recording => recording.speed === 1));
});
