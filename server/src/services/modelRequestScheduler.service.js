import { randomUUID } from 'node:crypto';

export const MODEL_WORKLOADS = ['analysis', 'writing', 'assistant', 'other'];

export const modelOwnerConcurrency = workload => workload === 'analysis' ? 5 : 2;

export function modelConcurrencyLimits() {
  const number = (name, fallback) => Math.max(1, Math.min(500, Math.floor(Number(process.env[name]) || fallback)));
  return {
    analysis: number('AI_ANALYSIS_CONCURRENCY', 100),
    writing: number('AI_WRITING_CONCURRENCY', 30),
    assistant: number('AI_ASSISTANT_CONCURRENCY', 8),
    other: number('AI_OTHER_CONCURRENCY', 8)
  };
}

// Each lane rotates through photographers. Provider allowance is coordinated
// by the budget store, including requests from separate API/worker processes.
export function createModelRequestScheduler({ budget, limits = modelConcurrencyLimits, now = Date.now } = {}) {
  const lanes = new Map();
  let timer;
  let timerAt = Infinity;
  let pumping = false;
  let pumpAgain = false;
  function wake(at = now()) {
    if (timer && timerAt <= at) return;
    clearTimeout(timer); timerAt = at;
    timer = setTimeout(() => { timer = undefined; timerAt = Infinity; void pump(); }, Math.max(0, at - now()));
  }
  function add(lane, entry, front = false) {
    if (!lane.owners.has(entry.owner)) { lane.owners.set(entry.owner, []); lane.order.push(entry.owner); }
    const list = lane.owners.get(entry.owner);
    if (front) list.unshift(entry); else list.push(entry);
  }
  function take(lane) {
    for (let visited = 0, total = lane.order.length; visited < total; visited++) {
      const owner = lane.order.shift();
      const entries = lane.owners.get(owner);
      if (!entries?.length) { lane.owners.delete(owner); continue; }
      lane.order.push(owner);
      if ((lane.activeOwners.get(owner) || 0) >= modelOwnerConcurrency(lane.workload)) continue;
      const entry = entries.shift();
      if (!entries.length) { lane.owners.delete(owner); lane.order.splice(lane.order.indexOf(owner), 1); }
      return entry;
    }
  }
  async function launch(lane, entry) {
    const release = () => {
      lane.active--;
      const active = (lane.activeOwners.get(entry.owner) || 1) - 1;
      if (active) lane.activeOwners.set(entry.owner, active); else lane.activeOwners.delete(entry.owner);
    };
    const notify = callback => { try { Promise.resolve(callback?.()).catch(() => {}); } catch { /* Progress must not stop processing. */ } };
    try {
      if (entry.signal?.aborted) throw entry.signal.reason;
      const admission = await budget.reserve(entry);
      if (!admission.acquired) {
        if (entry.signal?.aborted) throw entry.signal.reason;
        lane.blockedUntil = Math.max(now() + 25, admission.waitUntil || now() + 500);
        add(lane, entry, true);
        notify(entry.onWaiting);
        wake(lane.blockedUntil);
        release();
        return false;
      }
      entry.admitted = true;
      entry.signal?.removeEventListener('abort', entry.abort);
      notify(entry.onStarted);
      if (entry.signal?.aborted) { await budget.finish(entry, {}); throw entry.signal.reason; }
      void Promise.resolve().then(() => entry.task(admission, entry)).then(entry.resolve, entry.reject).finally(() => {
        release(); lane.blockedUntil = 0; wake();
      });
      return true;
    } catch (error) {
      entry.signal?.removeEventListener('abort', entry.abort); entry.reject(error); release();
      return true;
    }
  }
  async function pump() {
    if (pumping) { pumpAgain = true; return; }
    pumping = true;
    try {
      const configured = limits();
      for (const lane of lanes.values()) {
        if (lane.blockedUntil > now()) { if (lane.order.length) wake(lane.blockedUntil); continue; }
        while (lane.active < configured[lane.workload]) {
          const entry = take(lane);
          if (!entry) break;
          if (entry.signal?.aborted) { entry.reject(entry.signal.reason); continue; }
          lane.active++; lane.activeOwners.set(entry.owner, (lane.activeOwners.get(entry.owner) || 0) + 1);
          if (!await launch(lane, entry)) break;
        }
      }
    } finally { pumping = false; if (pumpAgain) { pumpAgain = false; wake(); } }
  }
  return {
    run(task, options) {
      if (options.signal?.aborted) return Promise.reject(options.signal.reason);
      const workload = MODEL_WORKLOADS.includes(options.workload) ? options.workload : 'other';
      const key = `${options.provider}:${options.model}:${workload}`;
      if (!lanes.has(key)) lanes.set(key, { workload, active: 0, activeOwners: new Map(), owners: new Map(), order: [], blockedUntil: 0 });
      const lane = lanes.get(key);
      return new Promise((resolve, reject) => {
        const entry = { ...options, workload, id: randomUUID(), owner: String(options.owner || randomUUID()).slice(0, 200), task, resolve, reject };
        entry.abort = () => {
          if (entry.admitted) return;
          const list = lane.owners.get(entry.owner);
          const index = list?.indexOf(entry) ?? -1;
          if (index >= 0) list.splice(index, 1);
          if (list && !list.length) {
            lane.owners.delete(entry.owner);
            const ownerIndex = lane.order.indexOf(entry.owner);
            if (ownerIndex >= 0) lane.order.splice(ownerIndex, 1);
          }
          reject(entry.signal.reason); wake();
        };
        entry.signal?.addEventListener('abort', entry.abort, { once: true });
        add(lane, entry); wake();
      });
    },
    snapshot() {
      return [...lanes.entries()].map(([key, lane]) => ({ key, active: lane.active, waiting: [...lane.owners.values()].reduce((sum, entries) => sum + entries.length, 0) }));
    }
  };
}
