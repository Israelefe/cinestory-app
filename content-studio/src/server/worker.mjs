import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { claim, event, openDatabase } from './database.mjs';
import { configuration } from './config.mjs';
import { initialiseStorage, redact } from './storage.mjs';
import { sleep } from '../providers/groq.mjs';

export function startWorker(config, db, handlers) {
  const owner = randomUUID(), controller = new AbortController(); let active;
  const loop = (async () => {
    while (!controller.signal.aborted) {
      const task = claim(db, owner);
      if (!task) { await sleep(500, controller.signal).catch(() => {}); continue; }
      active = new AbortController();
      const timeout = setTimeout(() => active?.abort(new Error('The stage exceeded its 30-minute time limit.')), 1800000);
      const heartbeat = setInterval(() => {
        const row = db.prepare('SELECT cancelled FROM tasks WHERE id=?').get(task.id);
        if (row?.cancelled || controller.signal.aborted) active?.abort(new Error('Cancelled.'));
        db.prepare('UPDATE tasks SET lease_until=? WHERE id=? AND lease_owner=?').run(Date.now() + 30000, task.id, owner);
      }, 1000);
      const progress = (value, message) => db.prepare('UPDATE tasks SET progress=COALESCE(?,progress),message=?,updated_at=? WHERE id=?').run(Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null, redact(message || ''), Date.now(), task.id);
      try {
        if (!handlers[task.type]) throw new Error('No worker is registered for this stage.');
        await handlers[task.type]({ config, db, task, signal: active.signal, progress });
        if (active.signal.aborted) throw active.signal.reason;
        db.prepare("UPDATE tasks SET state='complete',progress=1,message='Complete',lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(Date.now(), task.id);
        event(db, task.job_id, 'task.complete', task.type + ' complete.');
      } catch (error) {
        const cancelled = active.signal.aborted || db.prepare('SELECT cancelled FROM tasks WHERE id=?').get(task.id)?.cancelled;
        const message = redact(error.message || 'The stage failed.').slice(0, 2000);
        db.prepare('UPDATE tasks SET state=?,message=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(cancelled ? 'cancelled' : 'failed', message, Date.now(), task.id);
        if (task.job_id) db.prepare("UPDATE jobs SET error=?,state=CASE WHEN ?=1 THEN state ELSE 'failed' END,updated_at=? WHERE id=? AND revision=?").run(message, cancelled ? 1 : 0, Date.now(), task.job_id, task.payload.revision);
        event(db, task.job_id, cancelled ? 'task.cancelled' : 'task.failed', message);
      } finally { clearTimeout(timeout); clearInterval(heartbeat); active = null; }
    }
  })();
  return { stop: async () => { controller.abort(); active?.abort(new Error('Studio stopped.')); await loop; } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configuration(); await initialiseStorage(config); const db = openDatabase(config);
  const { handlers } = await import('./pipeline.mjs'); const worker = startWorker(config, db, handlers);
  console.log('Local worker is listening for queued studio jobs.');
  for (const name of ['SIGINT', 'SIGTERM']) process.on(name, async () => { await worker.stop(); db.close(); process.exit(0); });
}
