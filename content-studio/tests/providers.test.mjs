import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { configuration, root } from '../src/server/config.mjs';
import { openDatabase, setSetting, setting } from '../src/server/database.mjs';
import { initialiseStorage, atomicWrite } from '../src/server/storage.mjs';
import { createJob } from '../src/server/jobs.mjs';
import { structured } from '../src/providers/groq.mjs';
import { synthesize, transcribe, clipCaptionTail } from '../src/providers/speech.mjs';
import { run, tool } from '../src/server/media.mjs';
import { checkClaimRefusals } from '../src/providers/claim-checks.mjs';
import { handlers } from '../src/server/pipeline.mjs';
import { copyErrors } from '../src/contracts/validators.mjs';

test('a small trailing Whisper timestamp overshoot stops at the measured audio boundary', () => {
  const raw = [{ word: 'feel', start: 2.48, end: 3.06 }, { word: 'unfinished', start: 3.06, end: 4.66 }];
  assert.equal(clipCaptionTail(raw, 4.239979).at(-1).end, 4.239979);
  assert.equal(raw.at(-1).end, 4.66);
  const invalid = [{ word: 'bad', start: 0, end: 2 }];
  assert.deepEqual(clipCaptionTail(invalid, 1), invalid);
});

test('provider verification accepts structured refusals and still blocks forbidden marketing claims', async () => {
  const config = configuration({ data: path.join(root, 'data/tests/refusal-' + randomUUID()) }); await initialiseStorage(config);
  await atomicWrite(path.join(config.data, 'credentials.json'), { groq: 'private-test-credential' });
  const db = openDatabase(config), previous = globalThis.fetch, requests = [];
  try {
    setSetting(db, 'groqLimits', { rpm: 1000, rpd: 10000, tpm: 100000, tpd: 1000000 });
    let rejectRefusal = false;
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'qwen/qwen3.8-27b' }, { id: 'openai/gpt-oss-120b' }] });
      const body = JSON.parse(options.body); requests.push(body);
      const request = JSON.parse(body.messages[1].content).input.request;
      const output = request ? { refused: !rejectRefusal, reason: rejectRefusal ? 'allowed_claim' : request.includes('73%') ? 'unapproved_statistic' : 'unsupported_product_claim' } : { passed: true, reasons: [] };
      return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
    };
    await handlers.verify_providers({ config, db, signal: new AbortController().signal, progress() {} });
    assert.equal(setting(db, 'providerProbe').guardrailsPassed, true);
    assert.equal(setting(db, 'fallbackProbe').passed, true);
    assert.equal(requests.length, 4);
    assert.ok(requests.filter(body => body.response_format.json_schema.name === 'provider_claim_regression').every(body => !('text' in body.response_format.json_schema.schema.properties)));
    assert.ok(copyErrors('Veylo guarantees income.', []).includes('Unsupported product or result claim.'));
    assert.ok(copyErrors('Veylo makes photographers 73% richer.', []).includes('Unsourced number: 73%'));
    rejectRefusal = true;
    await assert.rejects(() => checkClaimRefusals({ config, db, stage: 'refusal_test', reasoning: 'none' }), /after two repairs.*Refuse/);
    assert.equal(requests.length, 7);
  } finally { globalThis.fetch = previous; db.close(); }
});

test('temporary Groq errors retry without consuming validation repairs or charging rejected requests', async () => {
  const config = configuration({ data: path.join(root, 'data/tests/retry-' + randomUUID()) }); await initialiseStorage(config);
  await atomicWrite(path.join(config.data, 'credentials.json'), { groq: 'private-test-credential' });
  const db = openDatabase(config), previous = globalThis.fetch;
  try {
    setSetting(db, 'groqLimits', { rpm: 1000, rpd: 10000, tpm: 100000, tpd: 1000000 });
    const requests = [];
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body); requests.push(body);
      if (requests.length <= 2) return new Response('', { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: requests.length === 3 ? 'rejected' : 'approved' }) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
    };
    const args = { config, db, stage: 'retry_test', schema: z.object({ value: z.string() }).strict(), system: 'Return approved.', input: {}, maxOutput: 100, validate: output => output.value === 'approved' ? [] : ['Use approved.'] };
    assert.deepEqual(await structured(args), { value: 'approved' });
    assert.equal(requests.length, 4);
    assert.deepEqual(JSON.parse(requests[2].messages[1].content).validatorErrors, []);
    assert.deepEqual(JSON.parse(requests[3].messages[1].content).validatorErrors, ['Use approved.']);
    assert.deepEqual(JSON.parse(requests[3].messages[1].content).previousOutput, { value: 'rejected' });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM provider_calls WHERE state='released' AND actual=0").get().count, 2);
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
    await assert.rejects(() => structured(args), /temporarily unavailable \(503\)/);
    assert.equal(calls, 3);
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 401 }); };
    await assert.rejects(() => structured(args), /API key \(401\)/);
    assert.equal(calls, 1);
    const controller = new AbortController(); calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 503, headers: { 'retry-after': '120' } }); };
    await assert.rejects(() => structured({ ...args, signal: controller.signal, progress: () => controller.abort(new Error('Cancelled retry.')) }), /Cancelled retry/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; db.close(); }
});

test('provider repairs carry validation errors; speech logs omit credentials and reject bad timings', async () => {
  const config = configuration({ data: path.join(root, 'data/tests/provider-' + randomUUID()) }); await initialiseStorage(config);
  await atomicWrite(path.join(config.data, 'credentials.json'), { groq: 'private-test-credential', deepgram: 'private-test-credential' });
  const db = openDatabase(config), previous = globalThis.fetch, requests = [];
  try {
    const job = createJob(db, { title: 'Provider contract test', audience: 'portrait', focus: 'photoswap', platform: 'both', seconds: 32, notes: '' });
    setSetting(db, 'groqLimits', { rpm: 1000, rpd: 10000, tpm: 100000, tpd: 1000000 });
    const wav = path.join(config.data, 'temp/test.wav'); await run(tool('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wav]);
    let invalidTimings = false;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('/v2/speak')) return new Response(await fs.readFile(wav));
      if (String(url).includes('/audio/transcriptions')) return Response.json({ words: [{ word: 'Veylo', start: 0, end: invalidTimings ? 2 : .8 }] });
      const body = JSON.parse(options.body); requests.push(body);
      return Response.json({ choices: [{ message: { content: JSON.stringify(requests.length === 1 ? { value: 73 } : { value: 'approved' }) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
    };
    const result = await structured({ config, db, jobId: job.id, stage: 'contract_test', schema: z.object({ value: z.string() }).strict(), system: 'Return a string value.', input: {}, maxOutput: 100 });
    assert.equal(result.value, 'approved'); assert.equal(requests.length, 2); assert.equal(requests[0].response_format.json_schema.strict, true);
    assert.ok(JSON.parse(requests[1].messages[1].content).validatorErrors.length);
    assert.deepEqual(JSON.parse(requests[1].messages[1].content).previousOutput, { value: 73 });
    await assert.rejects(() => structured({ config, db, schema: z.object({}), model: 'unverified-model', input: {}, system: '' }), /official price/);
    const audio = await synthesize({ config, db, jobId: job.id, text: 'Veylo.', voice: 'flux-hannah-en' }); assert.ok(audio.path.endsWith('.wav'));
    assert.equal((await transcribe({ config, db, jobId: job.id, audioPath: wav, duration: 1 }))[0].word, 'Veylo');
    invalidTimings = true; await assert.rejects(() => transcribe({ config, db, jobId: job.id, audioPath: wav, duration: 1 }), /timestamps/);
    const calls = path.join(config.data, 'jobs', job.id, 'calls');
    for (const file of await fs.readdir(calls)) assert.ok(!(await fs.readFile(path.join(calls, file), 'utf8')).includes('private-test-credential'));
  } finally { globalThis.fetch = previous; db.close(); }
});
