import { boundedBytes, MAX_MEDIA_BYTES, mediaError, requireMediaKey } from './media-protocol.js';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function narrationKey(key) {
  requireMediaKey(key);
  const campaign = /^veylo\/content-studio\/[a-f0-9]{24}\/[A-Za-z0-9_-]+\/voice\/[A-Za-z0-9_-]+$/i.test(key);
  if (!campaign && !/^veylo\/users\/[A-Za-z0-9_-]+\/deliveries\/[A-Za-z0-9_-]+\/narration\/[A-Za-z0-9_-]+$/.test(key)) throw mediaError('This recording does not belong to an approved delivery or campaign.', 403, 'NARRATION_SCOPE_INVALID');
  return campaign;
}

async function deepgram(env, path, options) {
  if (!env.DEEPGRAM_API_KEY) throw mediaError('Narration is unavailable right now. Retry this step or skip narration.', 503, 'NARRATION_NOT_CONFIGURED');
  const response = await fetch(`https://api.deepgram.com/${path}`, { ...options, headers: { ...options.headers, Authorization: `Token ${env.DEEPGRAM_API_KEY}` }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) { await response.body?.cancel(); throw mediaError('The voice service could not finish this recording. Please retry.', [429, 502, 503, 504].includes(response.status) ? 503 : 502, 'NARRATION_REQUEST_FAILED'); }
  return response;
}

export async function createNarration(env, data) {
  const campaign = narrationKey(data.key);
  if (typeof data.text !== 'string' || data.text.trim().length < (campaign ? 1 : 8) || data.text.length > (campaign ? 250 : 2000) || !/^flux-[a-z0-9-]{1,80}$/.test(data.voiceId || '')) throw mediaError('Check the narration text and voice.', 400, 'NARRATION_INVALID');
  const speed = Number(data.speed);
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 1.5) throw mediaError('Choose a supported narration speed.', 400, 'NARRATION_INVALID');
  const query = new URLSearchParams({ model: data.voiceId, speed: String(speed), expressivity: '0' });
  const response = await deepgram(env, `v2/speak?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text: data.text }) });
  const audio = await boundedBytes(response.body, MAX_AUDIO_BYTES);
  if (!audio.length) throw mediaError('The voice service returned an empty recording.', 502, 'NARRATION_EMPTY');
  let timing = {};
  if (data.timings) {
    try {
      const measured = await deepgram(env, 'v1/listen?model=nova-3&utterances=true&punctuate=true', { method: 'POST', headers: { 'Content-Type': 'audio/mpeg', Accept: 'application/json' }, body: audio });
      const payload = await measured.json();
      const words = payload?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
      if (!words.length) throw mediaError('The voice service could not measure this recording. Please retry.', 502, 'NARRATION_TIMING_FAILED');
      timing = { words: words.map(word => ({ word: String(word.punctuated_word || word.word || '').trim().slice(0, 80), start: Number(word.start), end: Number(word.end) })).filter(word => word.word && Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end > word.start), duration: Number(payload?.metadata?.duration) || 0 };
      if (!timing.words.length) throw mediaError('The voice service could not measure this recording. Please retry.', 502, 'NARRATION_TIMING_FAILED');
    } catch (error) {
      // Campaigns already allow voice-over without measured subtitles. Keep
      // their existing duration estimate when only the timing request fails.
      if (!campaign) throw error;
      timing = { words: [], duration: 0 };
    }
  }
  const object = await env.DELIVERY_MEDIA.put(data.key, audio, { httpMetadata: { contentType: 'audio/mpeg' } });
  return { key: data.key, public_id: data.key, bytes: object.size, etag: object.etag, format: 'mp3', ...timing };
}

export async function joinNarration(env, data) {
  narrationKey(data.key);
  if (!Array.isArray(data.keys) || !data.keys.length || data.keys.length > 100) throw mediaError('This narration could not be assembled.', 400, 'NARRATION_INVALID');
  const prefix = data.key.slice(0, data.key.lastIndexOf('/') + 1);
  const heads = [];
  const skips = [];
  for (const key of data.keys) {
    narrationKey(key);
    if (!key.startsWith(prefix) || key === data.key) throw mediaError('These recordings belong to different deliveries.', 403, 'NARRATION_SCOPE_INVALID');
    const head = await env.DELIVERY_MEDIA.head(key);
    if (!head || head.size < 1 || head.size > MAX_AUDIO_BYTES) throw mediaError('A narration recording is missing.', 404, 'MEDIA_NOT_FOUND');
    heads.push(head);
    let skip = 0;
    if (heads.length > 1) {
      const prefixObject = await env.DELIVERY_MEDIA.get(key, { range: { offset: 0, length: Math.min(10, head.size) } });
      const bytes = await boundedBytes(prefixObject.body, 10);
      if (bytes.length >= 10 && bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) skip = Math.min(head.size, 10 + (bytes[6] & 127) * 0x200000 + (bytes[7] & 127) * 0x4000 + (bytes[8] & 127) * 128 + (bytes[9] & 127));
    }
    skips.push(skip);
  }
  if (heads.reduce((sum, item) => sum + item.size, 0) > MAX_MEDIA_BYTES) throw mediaError('This narration is too long to assemble.', 413, 'MEDIA_TOO_LARGE');
  async function* audioChunks() {
    for (let index = 0; index < data.keys.length; index += 1) {
      const object = await env.DELIVERY_MEDIA.get(data.keys[index]);
      if (!object || object.etag !== heads[index].etag) throw mediaError('A narration recording changed. Please retry.', 409, 'MEDIA_CHANGED');
      let skip = skips[index];
      for await (const bytes of object.body) {
        const discard = Math.min(skip, bytes.byteLength);
        skip -= discard;
        if (discard < bytes.byteLength) yield bytes.subarray(discard);
      }
    }
  }
  const iterator = audioChunks();
  const stream = new ReadableStream({ async pull(controller) { try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(next.value); } catch (error) { controller.error(error); } }, async cancel() { await iterator.return(); } });
  const length = heads.reduce((sum, head, index) => sum + head.size - skips[index], 0);
  const fixed = new FixedLengthStream(length);
  const [object] = await Promise.all([
    env.DELIVERY_MEDIA.put(data.key, fixed.readable, { httpMetadata: { contentType: 'audio/mpeg' } }),
    stream.pipeTo(fixed.writable)
  ]);
  return { key: data.key, public_id: data.key, bytes: object.size, etag: object.etag, format: 'mp3' };
}
