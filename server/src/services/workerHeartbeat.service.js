import os from 'os';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';

const instance = `${os.hostname()}:${process.pid}`;

export function workerInstance() {
  return instance;
}

export async function recordWorkerHeartbeat(workerName, { status = 'idle', stage = 'polling', details } = {}) {
  if (!workerName) return null;
  try {
    return await WorkerHeartbeat.findOneAndUpdate(
      { workerName, instance },
      { $set: { status, stage, heartbeatAt: new Date(), ...(details ? { details } : {}) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    // A monitoring record must never stop a delivery worker from doing its job.
    console.error('[worker-heartbeat]', workerName, error.message);
    return null;
  }
}

