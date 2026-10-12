import { DatabaseSync, backup } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { redact } from './storage.mjs';

export function openDatabase(config) {
  const db = new DatabaseSync(path.join(config.data, 'studio.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, title TEXT NOT NULL, brief TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS revisions (job_id TEXT NOT NULL REFERENCES jobs(id), revision INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(job_id,revision));
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id), type TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', progress REAL NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, lease_until INTEGER, lease_owner TEXT, cancelled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(job_id,type,payload));
    CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id), stage TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, digest TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, subject TEXT NOT NULL, digest TEXT NOT NULL, decision TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, UNIQUE(subject,digest));
    CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, path TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, sha256 TEXT NOT NULL, metadata TEXT NOT NULL, rights TEXT NOT NULL DEFAULT 'pending', license_note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS provider_calls (id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id), provider TEXT NOT NULL, stage TEXT NOT NULL, estimated REAL NOT NULL, actual REAL, state TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, type TEXT NOT NULL, message TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metrics (job_id TEXT PRIMARY KEY REFERENCES jobs(id), data TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS tasks_pending ON tasks(state,available_at);
    CREATE INDEX IF NOT EXISTS artifacts_job ON artifacts(job_id,stage,revision);
    CREATE INDEX IF NOT EXISTS events_job ON events(job_id,id);
  `);
  return db;
}
export function setting(db, key, fallback = null) { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
export function setSetting(db, key, value) { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
export function event(db, jobId, type, message, data = {}) { db.prepare('INSERT INTO events(job_id,type,message,data,created_at) VALUES(?,?,?,?,?)').run(jobId || null, type, redact(message), JSON.stringify(data), Date.now()); }
export function transaction(db, work) { db.exec('BEGIN IMMEDIATE'); try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
export function enqueue(db, jobId, type, payload = {}) {
  const encoded = JSON.stringify(payload), now = Date.now();
  const existing = db.prepare('SELECT * FROM tasks WHERE job_id IS ? AND type=? AND payload=?').get(jobId, type, encoded);
  if (existing && !['failed', 'cancelled'].includes(existing.state)) return existing;
  if (existing) { db.prepare("UPDATE tasks SET state='queued',cancelled=0,attempts=0,progress=0,message='',available_at=?,updated_at=? WHERE id=?").run(now, now, existing.id); return db.prepare('SELECT * FROM tasks WHERE id=?').get(existing.id); }
  const id = randomUUID();
  db.prepare('INSERT INTO tasks(id,job_id,type,payload,available_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, jobId, type, encoded, now, now, now);
  event(db, jobId, 'task.queued', `${type.replaceAll('_', ' ')} queued.`);
  return db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
}
export function claim(db, workerId, now = Date.now()) {
  return transaction(db, () => {
    db.prepare("UPDATE tasks SET state='queued',lease_owner=NULL,lease_until=NULL WHERE state='running' AND lease_until<? AND cancelled=0").run(now);
    db.prepare("UPDATE tasks SET state='cancelled',lease_owner=NULL,lease_until=NULL WHERE cancelled=1 AND state='running' AND lease_until<?").run(now);
    const row = db.prepare("SELECT * FROM tasks WHERE state='queued' AND cancelled=0 AND available_at<=? ORDER BY created_at LIMIT 1").get(now);
    if (!row) return null;
    db.prepare("UPDATE tasks SET state='running',lease_owner=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=?").run(workerId, now + 30000, now, row.id);
    return { ...row, lease_owner: workerId, attempts: row.attempts + 1, payload: JSON.parse(row.payload) };
  });
}
export function artifact(db, job, stage, data, digest) {
  const id = randomUUID();
  db.prepare('INSERT INTO artifacts(id,job_id,stage,revision,data,digest,created_at) VALUES(?,?,?,?,?,?,?)').run(id, job.id, stage, job.revision, JSON.stringify(data), digest, Date.now());
  return id;
}
export function latestArtifact(db, jobId, stage, revision) {
  const row = db.prepare('SELECT * FROM artifacts WHERE job_id=? AND stage=? AND revision=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(jobId, stage, revision);
  return row ? { ...row, data: JSON.parse(row.data) } : null;
}
export async function snapshot(db, config) {
  const folder = path.join(config.data, 'backups'); await fs.mkdir(folder, { recursive: true });
  const name = new Date().toISOString().slice(0, 10) + '.sqlite';
  await backup(db, path.join(folder, name));
  const files = (await fs.readdir(folder)).filter(file => /^\d{4}-\d{2}-\d{2}\.sqlite$/.test(file)).sort().reverse();
  for (const file of files.slice(7)) await fs.unlink(path.join(folder, file));
}
