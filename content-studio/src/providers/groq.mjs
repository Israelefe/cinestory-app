import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { providerDefaults } from '../server/config.mjs';
import { setting, setSetting, transaction, event } from '../server/database.mjs';
import { atomicWrite, hash, redact } from '../server/storage.mjs';
import { jsonSchema } from '../contracts/index.mjs';

export async function credentials(config) {
  let stored = {}; try { stored = JSON.parse(await fs.readFile(path.join(config.data, 'credentials.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { groq: process.env.GROQ_API_KEY || stored.groq || '', deepgram: process.env.DEEPGRAM_API_KEY || stored.deepgram || '' };
}
export function reserveCost(db, jobId, provider, stage, estimated) {
  return transaction(db, () => {
    const caps = setting(db, 'caps', providerDefaults.caps);
    const start = Math.floor((Date.now() + 3600000) / 86400000) * 86400000 - 3600000;
    const daily = db.prepare("SELECT COALESCE(SUM(COALESCE(actual,estimated)),0) AS total FROM provider_calls WHERE created_at>=? AND state!='released'").get(start).total;
    const job = jobId ? db.prepare("SELECT COALESCE(SUM(COALESCE(actual,estimated)),0) AS total FROM provider_calls WHERE job_id=? AND state!='released'").get(jobId).total : 0;
    if (daily + estimated > caps.day || (jobId && job + estimated > caps.job)) throw new Error('The API spending cap would be exceeded. Completed work is saved. Review the cap in Settings.');
    const id = randomUUID();
    db.prepare('INSERT INTO provider_calls(id,job_id,provider,stage,estimated,state,created_at) VALUES(?,?,?,?,?,?,?)').run(id, jobId || null, provider, stage, estimated, 'reserved', Date.now());
    return id;
  });
}
export function settleCost(db, id, actual, metadata = {}) { db.prepare("UPDATE provider_calls SET state='complete',actual=?,metadata=? WHERE id=?").run(actual, JSON.stringify(metadata), id); }
export async function sleep(ms, signal) { if (signal?.aborted) throw signal.reason || new Error('Cancelled.'); await new Promise((resolve, reject) => { const timer = setTimeout(done, ms); function done() { signal?.removeEventListener('abort', abort); resolve(); } function abort() { clearTimeout(timer); reject(signal.reason || new Error('Cancelled.')); } signal?.addEventListener('abort', abort, { once: true }); }); }
export async function pace(db, tokens, signal, progress = () => {}) {
  const limits = setting(db, 'groqLimits', providerDefaults.groq);
  if (tokens > Math.min(limits.tpm, 7000)) throw new Error('This stage exceeds its prompt budget. Reduce the selected knowledge or split the review.');
  for (;;) {
    const wait = transaction(db, () => {
      const now = Date.now(), window = setting(db, 'groqWindow', { start: now, tokens: 0, requests: 0 });
      const date = new Date(now).toISOString().slice(0, 10), day = setting(db, 'groqDay', { date, tokens: 0, requests: 0 });
      if (day.date !== date) { day.date = date; day.tokens = 0; day.requests = 0; }
      if (day.requests + 1 > limits.rpd || day.tokens + tokens > limits.tpd) throw new Error('The recorded daily Groq allowance is exhausted. Completed stages are saved; resume after the allowance resets.');
      if (now - window.start >= 60000) { window.start = now; window.tokens = 0; window.requests = 0; }
      if (window.tokens + tokens > limits.tpm * .95 || window.requests >= Math.max(1, limits.rpm - 1)) return Math.max(100, 60050 - (now - window.start));
      setSetting(db, 'groqWindow', { ...window, tokens: window.tokens + tokens, requests: window.requests + 1 });
      setSetting(db, 'groqDay', { date, tokens: day.tokens + tokens, requests: day.requests + 1 }); return 0;
    });
    if (!wait) return;
    progress(undefined, 'Waiting for the Groq token allowance to reset.'); await sleep(Math.min(wait, 60000), signal);
  }
}
export async function structured({ config, db, jobId, stage, schema, system, input, images = [], signal, progress, maxOutput = 2500, model = providerDefaults.groq.model, reasoning = 'none', temperature = .4, validate = () => [] }) {
  const keys = await credentials(config), key = keys.groq;
  if (!key) throw new Error('Add your Groq API key in Settings to run this stage.');
  const rates = providerDefaults.modelRates[model];
  if (!rates) throw new Error('Verify this model’s official price and capabilities in config before using it.');
  if (images.length && !rates.vision) throw new Error('The selected model is text-only. Select a verified vision model for image review.');
  if (images.length > 3) throw new Error('A vision request can contain at most three images.');
  let errors = [];
  const rawInput = JSON.stringify(input);
  if (Object.values(keys).some(value => value.length > 8 && rawInput.includes(value)) || /\bgsk_[A-Za-z0-9_-]+\b|\b(?:Bearer|Token)\s+[A-Za-z0-9_-]{20,}/i.test(rawInput)) throw new Error('Remove credentials from the job notes or media metadata before generation.');
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = JSON.stringify({ input, validatorErrors: errors });
    const responseSchema = jsonSchema(schema);
    // Conservative text estimate; actual usage is recorded after the call.
    const estimate = Math.ceil((system.length + text.length + JSON.stringify(responseSchema).length) / 3) + images.length * 2048 + maxOutput;
    await pace(db, estimate, signal, progress);
    const inputRate = rates.input, outputRate = rates.output;
    const cost = reserveCost(db, jobId, 'groq', stage, (estimate - maxOutput) * inputRate / 1e6 + maxOutput * outputRate / 1e6);
    const body = { model, temperature, max_completion_tokens: maxOutput, reasoning_effort: reasoning, messages: [{ role: 'system', content: system }, { role: 'user', content: images.length ? [{ type: 'text', text }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] : text }], response_format: { type: 'json_schema', json_schema: { name: stage.replace(/[^a-z_]/gi, '_'), strict: true, schema: responseSchema } } };
    let response;
    try {
      response = await fetch(providerDefaults.groq.endpoint + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(90000)]) });
    } catch (error) { db.prepare("UPDATE provider_calls SET state='uncertain' WHERE id=?").run(cost); throw new Error('Groq could not be reached. This request’s reserved cost is retained until its outcome is known.'); }
    const headerTokens = Number(response.headers.get('x-ratelimit-limit-tokens'));
    const headerRequests = Number(response.headers.get('x-ratelimit-limit-requests'));
    if (headerTokens > 0) setSetting(db, 'groqLimits', { ...providerDefaults.groq, ...setting(db, 'groqLimits', {}), tpm: headerTokens, ...(headerRequests > 0 ? { rpd: headerRequests } : {}), verifiedAt: new Date().toISOString() });
    if (!response.ok) {
      db.prepare("UPDATE provider_calls SET state='released',actual=0 WHERE id=?").run(cost);
      if (response.status === 429 && attempt < 2) { progress?.(undefined, 'Groq asked the studio to wait before retrying.'); await sleep(Math.min(120000, Math.max(1000, Number(response.headers.get('retry-after') || 60) * 1000)), signal); continue; }
      throw new Error(`Groq refused this request (${response.status}). Check the model, account limits and credentials in Settings.`);
    }
    const result = await response.json();
    const usage = result.usage || {};
    settleCost(db, cost, (usage.prompt_tokens || estimate - maxOutput) * inputRate / 1e6 + (usage.completion_tokens || maxOutput) * outputRate / 1e6, { model, usage });
    let parsed;
    try { parsed = schema.parse(JSON.parse(result.choices?.[0]?.message?.content || '{}')); errors = validate(parsed); }
    catch (error) { errors = [redact(error.message).slice(0, 3000)]; }
    const scrub = value => typeof value === 'string' ? redact(value) : Array.isArray(value) ? value.map(scrub) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /secret|password|api.?key|authorization/i.test(key) ? '[redacted]' : scrub(item)])) : value;
    const log = scrub({ stage, attempt, model, reasoning, seed: null, system, input, output: parsed || result.choices?.[0]?.message?.content, errors, usage, createdAt: new Date().toISOString() });
    await atomicWrite(path.join(config.data, 'jobs', jobId || 'calibration', 'calls', cost + '.json'), log);
    event(db, jobId, 'validation', errors.length ? `${stage}: ${errors.length} validation errors.` : `${stage}: validation passed.`, { attempt, model, errors });
    if (!errors.length) return parsed;
  }
  throw new Error('This stage failed validation after two repairs. ' + errors.join(' ').slice(0, 1000));
}
