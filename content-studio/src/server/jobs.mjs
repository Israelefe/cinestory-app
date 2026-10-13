import { randomUUID } from 'node:crypto';
import { artifact, latestArtifact, transaction } from './database.mjs';
import { hash } from './storage.mjs';

export const stageOrder = ['pitches', 'scripts', 'variant', 'storyboard', 'slots', 'voice', 'preview', 'music', 'final', 'export'];
export function getJob(db, id) {
  const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id); if (!row) throw new Error('Job not found.');
  const artifacts = {}; for (const stage of stageOrder) { const entry = latestArtifact(db, id, stage, row.revision); if (entry) artifacts[stage] = { ...entry.data, _digest: entry.digest }; }
  for (const stage of ['preview', 'final']) if (artifacts[stage]) artifacts[stage].ownerApproved = approved(db, stage + ':' + id, artifacts[stage]._digest);
  for (const [slotId, entry] of Object.entries(artifacts.slots?.slots || {})) {
    const request = artifacts.storyboard?.board.requests.find(request => request.id === slotId), asset = db.prepare('SELECT sha256 FROM assets WHERE id=?').get(entry.assetId);
    if (request && asset && entry.vision && approved(db, 'slot:' + id + ':' + slotId, hash({ asset: asset.sha256, prompt: request.prompt, rubric: entry.vision }))) entry.review = 'approved';
  }
  const tasks = db.prepare('SELECT id,type,state,progress,message,attempts,cancelled FROM tasks WHERE job_id=? ORDER BY created_at DESC').all(id);
  const cost = db.prepare("SELECT COALESCE(SUM(COALESCE(actual,estimated)),0) AS total FROM provider_calls WHERE job_id=? AND state!='released'").get(id).total;
  return { ...row, brief: JSON.parse(row.brief), artifacts, tasks, cost, metrics: JSON.parse(db.prepare('SELECT data FROM metrics WHERE job_id=?').get(id)?.data || '{}') };
}
export function createJob(db, brief) {
  const id = randomUUID(), now = Date.now();
  db.prepare('INSERT INTO jobs(id,title,brief,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, brief.title, JSON.stringify(brief), now, now);
  db.prepare('INSERT INTO revisions(job_id,revision,data,created_at) VALUES(?,?,?,?)').run(id, 1, JSON.stringify(brief), now);
  return getJob(db, id);
}
export function saveStage(db, job, stage, data, state) {
  if (db.prepare('SELECT revision FROM jobs WHERE id=?').get(job.id).revision !== job.revision) throw new Error('This job changed. The old result was discarded.');
  const digest = hash(data); artifact(db, job, stage, data, digest);
  db.prepare('UPDATE jobs SET state=COALESCE(?,state),updated_at=?,error=NULL WHERE id=?').run(state || null, Date.now(), job.id);
  return digest;
}
export function revise(db, id, from, changes = {}, keepTaskId = '') {
  if (!stageOrder.includes(from)) throw new Error('Unknown stage.');
  return transaction(db, () => {
    const old = getJob(db, id), revision = old.revision + 1;
    db.prepare('UPDATE tasks SET cancelled=1,state=CASE WHEN state=\'queued\' THEN \'cancelled\' ELSE state END WHERE job_id=? AND id<>? AND state IN (\'running\',\'queued\')').run(id, keepTaskId);
    db.prepare('UPDATE jobs SET revision=?,state=?,updated_at=?,error=NULL WHERE id=?').run(revision, 'draft', Date.now(), id);
    const next = { ...old, revision };
    for (const stage of stageOrder.slice(0, stageOrder.indexOf(from))) { const entry = latestArtifact(db, id, stage, old.revision); if (entry) artifact(db, next, stage, entry.data, entry.digest); }
    for (const [stage, data] of Object.entries(changes)) if (stageOrder.includes(stage)) artifact(db, next, stage, data, hash(data));
    db.prepare('INSERT INTO revisions(job_id,revision,data,created_at) VALUES(?,?,?,?)').run(id, revision, JSON.stringify({ from, previous: old.revision }), Date.now());
    return getJob(db, id);
  });
}
export function approved(db, subject, digest) { return db.prepare('SELECT decision FROM approvals WHERE subject=? AND digest=?').get(subject, digest)?.decision === 'approved'; }
export function recordReview(db, subject, digest, review) {
  db.prepare('INSERT INTO approvals(id,subject,digest,decision,note,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(subject,digest) DO UPDATE SET decision=excluded.decision,note=excluded.note,created_at=excluded.created_at').run(randomUUID(), subject, digest, review.decision, review.note, Date.now());
}
