// Recheck export guardrails using only a completed, isolated pipeline proof.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { backup } from 'node:sqlite';
import { configuration, root } from '../src/server/config.mjs';
import { openDatabase } from '../src/server/database.mjs';
import { getJob } from '../src/server/jobs.mjs';
import { handlers } from '../src/server/pipeline.mjs';
import { contained, initialiseStorage } from '../src/server/storage.mjs';
const name = process.argv[2];
if (!/^pipeline-[a-f0-9-]+$/.test(name || '')) throw new Error('Supply an isolated pipeline proof directory name.');
const source = path.join(root, 'data/tests', name), report = JSON.parse(await fs.readFile(path.join(source, 'report.json'), 'utf8'));
assert.match(report.providerMode, /doubles/);
const config = configuration({ data: path.join(root, 'data/tests/export-proof-' + randomUUID()) }); await initialiseStorage(config);
const sourceDb = openDatabase(configuration({ data: source })); try { await backup(sourceDb, path.join(config.data, 'studio.sqlite')); } finally { sourceDb.close(); }
for (const folder of ['assets', 'jobs']) await fs.cp(path.join(source, folder), path.join(config.data, folder), { recursive: true });
await fs.writeFile(path.join(config.data, 'credentials.json'), JSON.stringify({ groq: 'isolated-test-key' }));
const db = openDatabase(config), fetchBefore = globalThis.fetch; let calls = 0;
try {
  // Reset only the disposable copy to the completed revision named by its report.
  db.prepare('DELETE FROM artifacts WHERE job_id=? AND revision>?').run(report.jobId, report.revision);
  db.prepare('DELETE FROM revisions WHERE job_id=? AND revision>?').run(report.jobId, report.revision);
  db.prepare("UPDATE jobs SET revision=?,state='exported' WHERE id=?").run(report.revision, report.jobId);
  // These fixtures are original abstract graphics and tones, with no people.
  for (const asset of db.prepare("SELECT id,metadata FROM assets WHERE kind IN ('image','video')").all()) db.prepare('UPDATE assets SET metadata=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(asset.metadata), consent: true }), asset.id);
  globalThis.fetch = async url => {
    assert.match(String(url), /^https:\/\/api\.groq\.com\//); calls++;
    const output = calls === 1 ? { caption: 'Get started for free. Link in bio. Visit our site.', hashtags: ['#Photography'], factIds: ['invented-fact'] } : { caption: 'Photographers, give the finished collection a considered handover. Get started for free. Link in bio.', hashtags: ['#NigerianPhotographers'], factIds: ['feature:photoswap'] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 200, completion_tokens: 150 } }), { headers: { 'content-type': 'application/json' } });
  };
  let job = getJob(db, report.jobId);
  await handlers.export({ config, db, task: { job_id: job.id, payload: { revision: job.revision } }, progress() {} });
  job = getJob(db, job.id); assert.equal(calls, 2, 'Unapproved fact and extra CTA must trigger validation repair.');
  const folder = job.artifacts.export.path.replace(/\.zip$/, ''), rights = JSON.parse(await fs.readFile(contained(config.data, folder + '/rights-and-provenance.json'), 'utf8'));
  assert.ok(rights.assets.length >= 3); assert.ok(rights.assets.every(asset => asset.rights === 'cleared')); assert.match(await fs.readFile(contained(config.data, folder + '/Outfit-OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
  console.log('Export repair, rights manifest, font license and tracked package passed.');
  const voicePath = job.artifacts.voice.path, unchanged = structuredClone(job.artifacts.storyboard.board.scenes.filter(scene => scene.id !== 's7'));
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: 'Present the finished collection with Veylo.' }) } }], usage: { prompt_tokens: 200, completion_tokens: 80 } }), { headers: { 'content-type': 'application/json' } });
  await handlers.regenerate_scene({ config, db, task: { job_id: job.id, payload: { revision: job.revision, sceneId: 's7', reason: 'Keep the product statement clear.' } }, progress() {} });
  job = getJob(db, job.id); assert.equal(job.artifacts.voice.path, voicePath); assert.deepEqual(job.artifacts.storyboard.board.scenes.filter(scene => scene.id !== 's7'), unchanged); assert.equal(job.artifacts.preview, undefined); assert.equal(job.artifacts.final, undefined);
  console.log('Single-scene regeneration reused voice and media, preserving other scenes and invalidating downstream renders.');
} finally { globalThis.fetch = fetchBefore; db.close(); }
