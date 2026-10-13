import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { configuration, root } from '../src/server/config.mjs';
import { initialiseStorage, contained, hash } from '../src/server/storage.mjs';
import { openDatabase, enqueue, claim, setting, setSetting, snapshot } from '../src/server/database.mjs';
import { createJob, getJob, saveStage, revise, recordReview, approved } from '../src/server/jobs.mjs';
import { reserveCost, settleCost } from '../src/providers/groq.mjs';
import { copyErrors, sectionBudgets, measuredVoiceBudgets, validateScripts, validateStoryboard, validateStoryboardPlan } from '../src/contracts/validators.mjs';
import { scriptSchema, storyboardSchema, scenePropsSchema } from '../src/contracts/index.mjs';
import { createStudio } from '../src/server/app.mjs';
import { layoutScenes } from '../src/server/render.mjs';
import { probe, tool, run } from '../src/server/media.mjs';
import { demoAssetEligible, acceptOwnerUpload } from '../src/server/assets.mjs';
import { capturesFor } from '../src/server/pipeline.mjs';
import { sourceFingerprint } from '../src/server/knowledge.mjs';
import { registerCaptureBatch } from '../src/server/capture.mjs';
const brief = { title: 'Portrait handover', audience: 'portrait', focus: 'photoswap', platform: 'both', seconds: 32, notes: '' };
async function database() { const config = configuration({ data: path.join(root, 'data/tests', randomUUID()) }); await initialiseStorage(config); return { config, db: openDatabase(config) }; }

test('SQLite queue is idempotent, exclusive, and recovers an expired lease', async () => {
  const { db } = await database(); try {
    const job = createJob(db, brief), first = enqueue(db, job.id, 'scripts', { revision: 1 }); assert.equal(enqueue(db, job.id, 'scripts', { revision: 1 }).id, first.id);
    const claimed = claim(db, 'worker-one'); assert.equal(claimed.id, first.id); assert.equal(claim(db, 'worker-two'), null);
    db.prepare('UPDATE tasks SET lease_until=? WHERE id=?').run(Date.now() - 1, first.id); assert.equal(claim(db, 'worker-two').id, first.id);
    db.prepare("UPDATE tasks SET cancelled=1,lease_until=? WHERE id=?").run(Date.now() - 1, first.id); assert.equal(claim(db, 'worker-three'), null); assert.equal(db.prepare('SELECT state FROM tasks WHERE id=?').get(first.id).state, 'cancelled');
  } finally { db.close(); }
});
test('a tweak preserves upstream artifacts and invalidates downstream approvals', async () => {
  const { db } = await database(); try { const job = createJob(db, brief); saveStage(db, job, 'scripts', { variants: ['approved script'] }, 'variants_ready'); saveStage(db, job, 'voice', { path: 'voice.wav' }); const digest = saveStage(db, job, 'preview', { path: 'preview.mp4' }); recordReview(db, 'preview:' + job.id, digest, { decision: 'approved', note: 'Reviewed' }); const next = revise(db, job.id, 'voice'); assert.equal(next.revision, 2); assert.ok(next.artifacts.scripts); assert.equal(next.artifacts.voice, undefined); assert.equal(next.artifacts.preview, undefined); assert.throws(() => saveStage(db, job, 'voice', {}), /changed/); } finally { db.close(); }
});
test('API spending is reserved atomically and uncertain requests remain counted', async () => {
  const { db } = await database(); try { const job = createJob(db, brief); setSetting(db, 'caps', { job: .03, day: .05 }); const id = reserveCost(db, job.id, 'test', 'script', .02); assert.throws(() => reserveCost(db, job.id, 'test', 'script', .02), /cap/); settleCost(db, id, .001); assert.ok(reserveCost(db, job.id, 'test', 'script', .02)); } finally { db.close(); }
});

test('saving supporting artifacts preserves the recovered job state after a successful retry', async () => {
  const { db } = await database();
  try {
    const original = createJob(db, brief);
    db.prepare("UPDATE jobs SET state='failed',error='Old duration error' WHERE id=?").run(original.id);
    const failed = getJob(db, original.id);
    saveStage(db, failed, 'storyboard', { board: { requests: [] } }, 'storyboard_ready');
    saveStage(db, failed, 'slots', { slots: {} });
    const recovered = getJob(db, original.id);
    assert.equal(recovered.state, 'storyboard_ready'); assert.equal(recovered.error, null);
  } finally { db.close(); }
});
test('claims validator blocks fake statistics, prices, guarantees and forbidden product claims', () => {
  for (const text of ['Get 73% more bookings.', 'It costs ₦40,000 per month.', 'Veylo guarantees your income.', 'Veylo retouches your photographs.', 'Try the free trial.']) assert.ok(copyErrors(text, []).length > 0, text);
  assert.deepEqual(copyErrors('Your finished portraits deserve a proper handover. Get started for free. Link in bio.', []), []);
});

test('cleared generated samples can demonstrate the UI without fabricating consent or changing provenance', () => {
  const generated = { rights: 'cleared', metadata: { generated: true, consent: false } };
  assert.equal(demoAssetEligible(generated), true);
  assert.deepEqual(generated.metadata, { generated: true, consent: false });
  assert.equal(demoAssetEligible({ ...generated, rights: 'pending' }), false);
  assert.equal(demoAssetEligible({ ...generated, rights: 'blocked' }), false);
  assert.equal(demoAssetEligible({ rights: 'cleared', metadata: { generated: false, consent: false } }), false);
  assert.equal(demoAssetEligible({ rights: 'cleared', metadata: { generated: false, consent: true } }), true);
  assert.equal(demoAssetEligible(null), false);
});

test('owner uploads are usable without a rights form and retain provenance and explicit blocks', async () => {
  const { db } = await database();
  try {
    for (const [id, source, rights] of [['owner', 'upload', 'pending'], ['imported', 'catalog', 'pending'], ['blocked', 'upload', 'blocked']]) {
      const metadata = { generated: true, consent: false, prompt: 'Original Flow prompt', provenance: { surface: 'Google Flow' } };
      db.prepare('INSERT INTO assets(id,path,kind,name,sha256,metadata,rights,license_note,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, 'assets/' + id + '.mp4', 'video', id, id, JSON.stringify(metadata), rights, '', source, Date.now());
      const asset = { ...db.prepare('SELECT * FROM assets WHERE id=?').get(id), metadata };
      const selected = acceptOwnerUpload(db, asset);
      assert.equal(selected.rights, id === 'owner' ? 'cleared' : rights);
      assert.equal(Boolean(selected.metadata.ownerSelected), id === 'owner');
      assert.equal(selected.metadata.consent, false); assert.equal(selected.metadata.prompt, metadata.prompt);
      assert.deepEqual(selected.metadata.provenance, metadata.provenance);
    }
  } finally { db.close(); }
});

test('generated demo captures remain usable and become stale when sample rights are revoked', async () => {
  const { config, db } = await database();
  try {
    const fingerprint = await sourceFingerprint();
    db.prepare('INSERT INTO assets(id,path,kind,name,sha256,metadata,rights,license_note,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('sample', 'assets/sample.webp', 'image', 'Generated demo sample', 'test-sha', JSON.stringify({ generated: true, consent: false }), 'cleared', 'Owner approved demo use.', 'test', Date.now());
    const clip = { id: 'demo', sourceDigest: fingerprint.digest, assetIds: ['sample'], digest: 'test-capture', containsGeneratedSamples: true };
    setSetting(db, 'captures', [clip]); recordReview(db, 'capture:demo', clip.digest, { decision: 'approved', note: 'Reviewed labelled AI demo.' });
    let result = await capturesFor(config, db); assert.equal(result[0].stale, false); assert.equal(result[0].approved, true);
    db.prepare("UPDATE assets SET rights='blocked' WHERE id='sample'").run();
    assert.equal((await capturesFor(config, db))[0].stale, true);
    db.prepare("UPDATE assets SET rights='cleared' WHERE id='sample'").run();
    setSetting(db, 'captures', [{ ...clip, containsGeneratedSamples: false }]);
    assert.equal((await capturesFor(config, db))[0].stale, true);
  } finally { db.close(); }
});

test('successful new recordings and re-recordings approve automatically without approving failed recipes', async () => {
  const { config, db } = await database();
  try {
    const fingerprint = await sourceFingerprint(), original = { id: 'demo', sourceDigest: fingerprint.digest, assetIds: [], digest: 'original' };
    registerCaptureBatch(db, [original], { recorded: 1, entries: [] });
    assert.equal((await capturesFor(config, db))[0].approved, true);
    const replacement = { ...original, digest: 're-recorded' }, other = { ...original, id: 'new-demo', digest: 'new-clip' };
    registerCaptureBatch(db, [replacement, other], { recorded: 2, entries: [{ id: 'failed-recipe', error: 'Page did not load.' }] });
    const result = await capturesFor(config, db);
    assert.equal(result.length, 2); assert.ok(result.every(clip => clip.approved && !clip.stale));
    assert.equal(result.find(clip => clip.id === 'demo').digest, 're-recorded');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM approvals WHERE subject='capture:failed-recipe'").get().count, 0);
  } finally { db.close(); }
});
test('duration allocation preserves both 20-second and 40-second cuts and section boundaries', () => {
  for (const seconds of [20, 32, 40]) { assert.equal(Object.values(sectionBudgets(seconds)).reduce((a, b) => a + b), seconds); const board = { scenes: ['hook', 'problem', 'demo', 'result', 'cta'].flatMap(section => [1, 2].map(i => ({ id: section + i, section }))) }; const scenes = layoutScenes(board, null, seconds, [3.02, 5.01]); assert.equal(scenes.at(-1).from + scenes.at(-1).frames, seconds * 30); for (let i = 1; i < scenes.length; i++) assert.equal(scenes[i].from, scenes[i - 1].from + scenes[i - 1].frames); }
});

test('natural voice can borrow section time without speeding up or rewriting the chosen script', () => {
  const measured = { hook: 4.24, problem: 6.1, demo: 9.2, result: 4.4, cta: 3.3 };
  const budgets = measuredVoiceBudgets(measured, 32);
  assert.equal(Math.round(Object.values(budgets).reduce((sum, seconds) => sum + seconds, 0) * 30), 960);
  for (const [section, seconds] of Object.entries(measured)) assert.ok(budgets[section] >= seconds);
  assert.ok(budgets.hook > 3);
  assert.throws(() => measuredVoiceBudgets({ ...measured, demo: 35 }, 32), /needs more time/);
  assert.throws(() => measuredVoiceBudgets({ ...measured, hook: NaN }, 32), /duration is invalid/);
});
test('schemas reject free-form scene code and invented template props', () => { assert.equal(storyboardSchema.safeParse({ scenes: [{ template: 'RunCode', code: 'fetch(secret)' }] }).success, false); assert.equal(scriptSchema.safeParse({ variants: [] }).success, false); });

test('creative validation requires approved feature captures and a real UI demo', () => {
  const cta = { id: 'start-free', text: 'Get started for free. Link in bio.' }, knowledge = { features: [{ id: 'photoswap', eligible: true }], facts: [{ id: 'feature:photoswap', statement: 'Present finished photographs.', allowedWording: 'Present finished photographs.' }], offer: { ctas: [cta] }, banned: [] };
  const captures = [0, 1, 2].map(i => ({ id: 'clip' + i, featureId: 'photoswap', approved: true, stale: false, targets: [] }));
  const voiceover = { hook: 'Photographers, make the handover count.', problem: 'An ordinary link can feel unfinished.', demo: 'Present your finished collection with Veylo.', result: 'Your portraits, ready for their first viewing.', cta: cta.text };
  const output = { variants: ['pain', 'result', 'curiosity'].map((angle, i) => ({ id: 'v' + i, title: angle, angle, audience: 'portrait', featureId: 'photoswap', hookType: angle, voiceover: { ...voiceover, hook: [voiceover.hook, 'Portraits deserve a considered first viewing.', 'Studio owners, how does your handover feel?'][i] }, onScreen: voiceover, captureIds: ['clip' + i], factIds: ['feature:photoswap'], ctaId: cta.id, why: 'A clear handover problem.' })) };
  assert.deepEqual(validateScripts(output, { knowledge, captures, seconds: 32, banned: [] }), []);
  const overlong = structuredClone(output);
  overlong.variants[0].voiceover.hook = 'Photographers, stop sending finished portraits through another ordinary folder link.';
  overlong.variants[0].voiceover.problem = 'Your client opens a folder and sees loose files instead of a considered presentation.';
  const lengthErrors = validateScripts(overlong, { knowledge, captures, seconds: 32, banned: [] });
  assert.ok(lengthErrors.some(error => error.includes('hook has 10 words; maximum 8')));
  assert.ok(lengthErrors.some(error => error.includes('problem has 14 words; maximum 12')));
  const wrongFeature = structuredClone(output); wrongFeature.variants[0].captureIds = ['other-product'];
  assert.match(validateScripts(wrongFeature, { knowledge, captures: [...captures, { id: 'other-product', featureId: 'video', approved: true }], seconds: 32, banned: [] }).join(' '), /selected feature/);
  const variant = output.variants[0], board = { scenes: ['hook', 'problem', 'demo', 'result', 'cta'].map(section => ({ id: section, section, voLineId: section, template: section === 'cta' ? 'CTACard' : 'BigCaptions', props: section === 'cta' ? { text: cta.text, ctaId: cta.id } : { text: voiceover[section] } })), requests: [], coverSceneId: 'result' };
  assert.match(validateStoryboard(board, { captures, knowledge, variant }).join(' '), /real product capture/);
  board.scenes[2] = { ...board.scenes[2], template: 'PhoneDemo', props: { clipId: 'clip0', zoomTargets: [], caption: 'Present the finished collection.' } };
  assert.deepEqual(validateStoryboard(board, { captures, knowledge, variant }), []);
  const propsSchema = scenePropsSchema('PhoneDemo', { captures, requests: [], variant, knowledge });
  assert.equal(propsSchema.safeParse({ clipId: 'demo', zoomTargets: [], caption: 'Present the collection.' }).success, false);
  assert.equal(propsSchema.safeParse(board.scenes[2].props).success, true);
  board.requests = [{ id: 'studio-context', kind: 'video', sourceSeconds: 0 }];
  assert.match(validateStoryboard(board, { captures, knowledge, variant }).join(' '), /studio-context.*video sourceSeconds/);
  assert.deepEqual(validateStoryboard({ ...board, scenes: [board.scenes[0]], coverSceneId: 'hook' }, { captures, knowledge, variant }, { partial: true }), []);
  assert.ok(copyErrors('Ready in five seconds.', []).length);
});

test('storyboard planning repairs invalid source durations before generating scene props', () => {
  const plan = { scenes: ['hook', 'problem', 'demo', 'result', 'cta'].map(section => ({ id: section, section, template: section === 'hook' ? 'HookKinetic' : section === 'cta' ? 'CTACard' : 'UIZoom' })), coverSceneId: 'result', requests: [{ id: 'studio-clip', kind: 'video', sourceSeconds: 0, references: [] }, { id: 'studio-image', kind: 'image', sourceSeconds: 10, references: [] }] };
  const errors = validateStoryboardPlan(plan);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /studio-clip.*4, 6, 8 or 10.*received 0/);
  assert.match(errors[1], /studio-image.*must be 0.*received 10/);
  plan.requests[0].sourceSeconds = 10; plan.requests[1].sourceSeconds = 0;
  assert.deepEqual(validateStoryboardPlan(plan), []);
  plan.scenes[3].template = 'MotionImage';
  plan.requests[1].references = ['capture-id'];
  assert.match(validateStoryboardPlan(plan, { realFinishedAssets: 0, assetIds: ['library-image'] }).join(' '), /real product recording.*reference images must be library asset IDs/);
});
test('storage rejects absolute paths and path traversal', () => { for (const relative of ['../secrets', 'C:/Windows/system.ini', '/etc/passwd', 'a/../../outside', 'assets/file:stream']) assert.throws(() => contained(root, relative)); assert.ok(contained(root, 'assets/photo.webp').startsWith(root)); });
test('bundled FFmpeg tools execute and reject invalid media', async () => { const result = await run(tool('ffprobe'), ['-version']); assert.match(result.stdout, /ffprobe version/); await assert.rejects(() => probe(path.join(root, 'package.json')), /Media processing/); });
test('local API requires login and CSRF, rejects hostile hosts, and preserves validation', async () => {
  const data = path.join(root, 'data/tests/api-' + randomUUID()), studio = await createStudio({ data, port: 5058, worker: false }); await studio.listen();
  const origin = studio.config.origin;
  try {
    assert.equal((await fetch(origin + '/api/overview')).status, 401);
    assert.equal((await fetch(origin + '/api/session', { headers: { Origin: 'https://evil.example' } })).status, 403);
    const hostile = await new Promise((resolve, reject) => { const request = http.get(origin + '/api/session', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); });
    assert.equal(hostile, 403);
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'local-test-password-only' }) }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0], token = (await login.json()).csrf;
    assert.equal((await fetch(origin + '/api/jobs', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(brief) })).status, 403);
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Studio-CSRF': token };
    for (const extra of ['file', 'field']) {
      const form = new FormData(); form.append('file', new Blob(['test media']), 'first.mp4');
      if (extra === 'file') form.append('file', new Blob(['other media']), 'second.mp4');
      else form.append('unexpected', 'field');
      const upload = await fetch(origin + '/api/assets/upload?kind=video', { method: 'POST', headers: { Cookie: cookie, 'X-Studio-CSRF': token }, body: form });
      assert.equal(upload.status, 400); assert.match((await upload.json()).error, /Upload one file/);
    }
    const response = await fetch(origin + '/api/jobs', { method: 'POST', headers, body: JSON.stringify(brief) }); assert.equal(response.status, 200); const job = await response.json();
    const blocked = await fetch(origin + '/api/jobs/' + job.id + '/review/final', { method: 'POST', headers, body: JSON.stringify({ decision: 'approved', note: 'Attempt to bypass review.' }) }); assert.equal(blocked.status, 400);
    const invalid = await fetch(origin + '/api/jobs', { method: 'POST', headers, body: JSON.stringify({ ...brief, seconds: 5 }) }); assert.equal(invalid.status, 400);
    const retimed = await fetch(origin + '/api/jobs/' + job.id + '/timing', { method: 'PUT', headers, body: JSON.stringify({ seconds: 25 }) }); assert.equal(retimed.status, 200); const revised = await retimed.json(); assert.equal(revised.brief.seconds, 25); assert.equal(revised.revision, 2);
    const settings = await fetch(origin + '/api/settings', { headers }); assert.equal(settings.status, 200); assert.equal((await settings.json()).groq, undefined);
    const verified = { passed: true, model: 'qwen/qwen3.8-27b', guardrailsPassed: true };
    setSetting(studio.db, 'models', { model: verified.model, reasoning: 'none' }); setSetting(studio.db, 'providerProbe', verified);
    const saveSettings = body => fetch(origin + '/api/settings', { method: 'PUT', headers, body: JSON.stringify(body) });
    assert.equal((await saveSettings({ model: verified.model, reasoning: 'none', credentials: { voice: 'flux-hannah-en' } })).status, 200);
    assert.deepEqual(setting(studio.db, 'providerProbe'), verified);
    assert.equal((await saveSettings({ model: verified.model, reasoning: 'none', publicSite: 'https://veylo.com.ng' })).status, 200);
    assert.deepEqual(setting(studio.db, 'providerProbe'), verified);
    assert.equal((await saveSettings({ model: verified.model, reasoning: 'default' })).status, 200);
    assert.equal(setting(studio.db, 'providerProbe'), null);
    setSetting(studio.db, 'providerProbe', verified);
    assert.equal((await saveSettings({ model: 'openai/gpt-oss-120b' })).status, 200);
    assert.equal(setting(studio.db, 'providerProbe'), null);
    setSetting(studio.db, 'providerProbe', verified); setSetting(studio.db, 'fallbackProbe', { passed: true });
    assert.equal((await saveSettings({ credentials: { groq: 'replacement-test-key' } })).status, 200);
    assert.equal(setting(studio.db, 'providerProbe'), null); assert.equal(setting(studio.db, 'fallbackProbe'), null);
    studio.db.prepare('INSERT INTO assets(id,path,kind,name,sha256,metadata,rights,license_note,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('generated-proof', 'assets/proof.png', 'image', 'Test only', 'abc', JSON.stringify({ generated: true }), 'pending', '', 'test', Date.now());
    const conceal = await fetch(origin + '/api/assets/generated-proof/rights', { method: 'PUT', headers, body: JSON.stringify({ rights: 'cleared', licenseNote: 'Attempted removal of generated provenance.', generated: false, consent: true }) });
    assert.equal(conceal.status, 400); assert.match((await conceal.json()).error, /provenance cannot be removed/);
    const logout = await fetch(origin + '/api/logout', { method: 'POST', headers }); assert.equal(logout.status, 200); assert.equal((await fetch(origin + '/api/overview', { headers })).status, 401);
  } finally { await studio.close(); }
});
