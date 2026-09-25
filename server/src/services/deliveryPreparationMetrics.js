import Task from '../models/DeliveryTask.js';
import Run from '../models/DeliveryPreparation.js';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';

export async function deliveryPreparationMetrics() {
  const since = new Date(Date.now() - 86400000);
  const [queueDepth, unavailable, stale, completed, worker] = await Promise.all([
    Task.countDocuments({ state: { $in: ['queued', 'running'] } }),
    Task.countDocuments({ state: 'unavailable', completedAt: { $gte: since } }),
    Task.countDocuments({ state: 'running', leaseUntil: { $lt: new Date() } }),
    Run.find({ kind: 'prepare', completedAt: { $gte: since }, durationMs: { $gt: 0 } }).select('durationMs metrics').sort({ durationMs: 1 }).limit(10000).lean(),
    WorkerHeartbeat.findOne({ workerName: 'delivery-preparation' }).sort({ heartbeatAt: -1 }).select('heartbeatAt status').lean()
  ]);
  const full = completed.filter(run => run.metrics?.fullyPrepared);
  return { queueDepth, unavailableLast24Hours: unavailable, stale, samples: completed.length,
    fullyPrepared: full.length, partial: completed.length - full.length,
    p95Ms: full[Math.max(0, Math.ceil(full.length * .95) - 1)]?.durationMs ?? null,
    under60Seconds: full.filter(run => run.durationMs <= 60000).length, worker };
}
