import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { configuration, root } from '../src/server/config.mjs';
import { openDatabase, setSetting } from '../src/server/database.mjs';
import { initialiseStorage, atomicWrite } from '../src/server/storage.mjs';
import { createJob } from '../src/server/jobs.mjs';
import { structured } from '../src/providers/groq.mjs';
import { synthesize, transcribe } from '../src/providers/speech.mjs';
import { run, tool } from '../src/server/media.mjs';

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
    await assert.rejects(() => structured({ config, db, schema: z.object({}), model: 'unverified-model', input: {}, system: '' }), /official price/);
    const audio = await synthesize({ config, db, jobId: job.id, text: 'Veylo.', voice: 'flux-hannah-en' }); assert.ok(audio.path.endsWith('.wav'));
    assert.equal((await transcribe({ config, db, jobId: job.id, audioPath: wav, duration: 1 }))[0].word, 'Veylo');
    invalidTimings = true; await assert.rejects(() => transcribe({ config, db, jobId: job.id, audioPath: wav, duration: 1 }), /timestamps/);
    const calls = path.join(config.data, 'jobs', job.id, 'calls');
    for (const file of await fs.readdir(calls)) assert.ok(!(await fs.readFile(path.join(calls, file), 'utf8')).includes('private-test-credential'));
  } finally { globalThis.fetch = previous; db.close(); }
});
