import fs from 'node:fs/promises';
import path from 'node:path';
import { credentials, reserveCost, settleCost, sleep } from './groq.mjs';
import { providerDefaults } from '../server/config.mjs';
import { atomicWrite, hash } from '../server/storage.mjs';

export async function synthesize({ config, db, jobId, text, voice, signal }) {
  const key = (await credentials(config)).deepgram;
  if (!key) throw new Error('Add your Deepgram API key in Settings.');
  if (!/^flux-(hannah|kit|alexis)-en$/.test(voice)) throw new Error('Audition and choose one voice in Settings.');
  const digest = hash({ text, voice, encoding: 'linear16', sampleRate: 48000, speed: 1 });
  const relative = `jobs/${jobId}/audio/${digest}.wav`, target = path.join(config.data, relative);
  if (await fs.access(target).then(() => true).catch(() => false)) return { path: relative, digest };
  for (let attempt = 0; attempt < 3; attempt++) {
    const callId = reserveCost(db, jobId, 'deepgram', 'voice', text.length * .045 / 1000);
    const logPath = path.join(config.data, 'jobs', jobId || 'auditions', 'calls', callId + '.json');
    const requestLog = { provider: 'deepgram', stage: 'voice', voice, text, encoding: 'linear16', sampleRate: 48000, speed: 1, digest, attempt, seed: null, status: 'requested', createdAt: new Date().toISOString() };
    await atomicWrite(logPath, requestLog);
    const url = new URL(providerDefaults.tts.endpoint);
    for (const [name, value] of Object.entries({ model: voice, encoding: 'linear16', container: 'wav', sample_rate: 48000, speed: 1, mip_opt_out: true })) url.searchParams.set(name, value);
    let response;
    try { response = await fetch(url, { method: 'POST', headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(60000)]) }); }
    catch { throw new Error('Deepgram could not be reached. The request’s reserved cost has been retained.'); }
    if (!response.ok) { await atomicWrite(logPath, { ...requestLog, status: response.status, errors: ['Provider refused the request.'] }); db.prepare("UPDATE provider_calls SET state='released',actual=0 WHERE id=?").run(callId); if (response.status === 429 && attempt < 2) { await sleep(Math.min(60000, Number(response.headers.get('retry-after') || 5) * 1000), signal); continue; } throw new Error(`Deepgram refused speech generation (${response.status}).`); }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.subarray(0, 4).toString() !== 'RIFF') throw new Error('Deepgram returned an unexpected audio format.');
    settleCost(db, callId, text.length * .045 / 1000, { voice, characters: text.length });
    await atomicWrite(logPath, { ...requestLog, status: 'complete', path: relative, audioDigest: hash(buffer), characters: text.length, cost: text.length * .045 / 1000, errors: [] });
    await atomicWrite(target, buffer); return { path: relative, digest };
  }
}
export async function transcribe({ config, db, jobId, audioPath, duration, signal }) {
  const key = (await credentials(config)).groq;
  if (!key) throw new Error('Add your Groq API key in Settings.');
  const form = new FormData();
  form.set('file', new Blob([await fs.readFile(audioPath)], { type: 'audio/wav' }), 'narration.wav');
  form.set('model', providerDefaults.stt.model); form.set('response_format', 'verbose_json'); form.append('timestamp_granularities[]', 'word'); form.set('language', 'en'); form.set('temperature', '0');
  form.set('prompt', 'Veylo. Photo Story. Nigerian photographers and media studios.');
  let response, cost;
  for (let attempt = 0; attempt < 3; attempt++) {
    cost = reserveCost(db, jobId, 'groq-whisper', 'captions', Math.max(10, duration) / 3600 * .04);
    try { response = await fetch(providerDefaults.stt.endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form, signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(90000)]) }); }
    catch { throw new Error('Transcription could not be reached. Its reserved cost is retained until the request outcome is known.'); }
    if (response.ok) break;
    db.prepare("UPDATE provider_calls SET state='released',actual=0 WHERE id=?").run(cost);
    if (response.status === 429 && attempt < 2) { await sleep(Math.min(60000, Math.max(1000, Number(response.headers.get('retry-after') || 10) * 1000)), signal); continue; }
    throw new Error(`Caption transcription failed (${response.status}). Retry captions when the provider is available.`);
  }
  const result = await response.json(); settleCost(db, cost, Math.max(10, duration) / 3600 * .04, { model: providerDefaults.stt.model, duration });
  if (!Array.isArray(result.words) || !result.words.length) throw new Error('The transcription contained no word timings.');
  let last = 0; const errors = [];
  for (const word of result.words) { if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || typeof word.word !== 'string' || word.start < last || word.end < word.start || word.end > duration + .2) errors.push('Caption timestamps are invalid.'); last = word.end; }
  await atomicWrite(path.join(config.data, 'jobs', jobId || 'auditions', 'calls', cost + '.json'), { provider: 'groq-whisper', model: providerDefaults.stt.model, stage: 'captions', audioDigest: hash(await fs.readFile(audioPath)), duration, output: result.words, errors: [...new Set(errors)], cost: Math.max(10, duration) / 3600 * .04, createdAt: new Date().toISOString() });
  if (errors.length) throw new Error('Caption timestamps are invalid.');
  return result.words;
}
