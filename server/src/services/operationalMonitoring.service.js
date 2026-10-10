import mongoose from 'mongoose';
import OperationalSample from '../models/OperationalSample.js';
import OperationalAlert from '../models/OperationalAlert.js';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';
import { operationalInstance, startProcessMetrics, sampleProcess, requestSnapshot, captureOperationalError } from './operationalMetrics.service.js';
import { sendOnce } from './email.service.js';
import { productMonitoringSignals } from './productMonitoring.service.js';
import { operationsAlertRecipient } from './productControls.service.js';

let timer, running = false;
const streaks = new Map();
export function sustained(key, failed, required = 3) {
  const count = failed ? (streaks.get(key) || 0) + 1 : 0;
  streaks.set(key, count);
  return count >= required;
}
export const workerDefinitions = () => [
  { name: 'retention', enabled: true, staleAfterMs: 7 * 3600000 },
  { name: 'delivery', enabled: process.env.DELIVERY_PIPELINE_ENABLED === 'true', staleAfterMs: 90000 },
  { name: 'portfolio', enabled: true, staleAfterMs: 90000 },
  { name: 'billing', enabled: true, staleAfterMs: 180000 }
];
export async function operationalWorkerHealth(now = Date.now()) {
  const definitions = workerDefinitions();
  const rows = await WorkerHeartbeat.find({ workerName: { $in: definitions.map(row => row.name) } }).sort({ heartbeatAt: -1 }).lean();
  return definitions.map(definition => {
    const record = rows.find(row => row.workerName === definition.name);
    const fresh = record && now - new Date(record.heartbeatAt).getTime() <= definition.staleAfterMs;
    return { workerName: definition.name, enabled: definition.enabled, status: !definition.enabled ? 'disabled' : !fresh ? 'stale' : record.status,
      heartbeatAt: record?.heartbeatAt || null, stage: record?.stage || 'No heartbeat received', staleAfterMs: definition.staleAfterMs };
  });
}
async function notify(alert, recovery = false) {
  const recipient = await operationsAlertRecipient();
  if (!recipient || !process.env.RESEND_API_KEY) return;
  const now = new Date();
  const claimed = await OperationalAlert.findOneAndUpdate({ _id: alert._id, status: recovery ? 'resolved' : { $ne: 'resolved' },
    $or: [{ notificationLeaseUntil: null }, { notificationLeaseUntil: { $lte: now } }],
    notificationStatus: { $ne: recovery ? 'recovery-sent' : 'sent' } },
  { $set: { notificationLeaseUntil: new Date(Date.now() + 600000) } }, { new: true });
  if (!claimed) return;
  try {
    const result = await sendOnce({ eventKey: `ops:${alert.key}:${new Date(alert.firstSeenAt).getTime()}:${recovery ? 'recovery' : 'outage'}`,
      kind: 'operations-alert', to: recipient,
      subject: `Veylo ${recovery ? 'recovered' : alert.severity}: ${alert.title}`,
      text: `${alert.title}\n${recovery ? 'The signal has returned to its normal range.' : 'This condition persisted across monitoring checks. Open Operations in the Veylo admin to investigate.'}\nFirst seen: ${new Date(alert.firstSeenAt).toISOString()}` });
    await OperationalAlert.updateOne({ _id: alert._id, firstSeenAt: alert.firstSeenAt }, { $set: { notificationStatus: result.status === 'sent' ? (recovery ? 'recovery-sent' : 'sent') : result.status, notifiedAt: now }, $unset: { notificationLeaseUntil: 1 } });
  } catch {
    await OperationalAlert.updateOne({ _id: alert._id }, { $set: { notificationStatus: 'failed' }, $unset: { notificationLeaseUntil: 1 } });
  }
}
export async function updateOperationalAlert(key, { failing, title, severity = 'warning' }) {
  const now = new Date();
  if (!failing) {
    const recovered = await OperationalAlert.findOneAndUpdate({ key, status: { $ne: 'resolved' } },
      { $set: { status: 'resolved', resolvedAt: now, notificationStatus: 'recovery-pending' }, $push: { history: { $each: [{ at: now, status: 'resolved' }], $slice: -30 } } }, { new: true });
    if (recovered) await notify(recovered, true);
    return;
  }
  // One row per condition across replicas. Opening a fresh incident is atomic.
  try { await OperationalAlert.updateOne({ key }, { $setOnInsert: { key, title, severity, status: 'resolved' } }, { upsert: true }); } catch (error) { if (error.code !== 11000) throw error; }
  await OperationalAlert.updateOne({ key, status: 'resolved' }, { $set: { title, severity, status: 'open', firstSeenAt: now, lastSeenAt: now, resolvedAt: null,
    acknowledgedBy: null, notificationStatus: 'pending', notificationLeaseUntil: null }, $push: { history: { $each: [{ at: now, status: 'open' }], $slice: -30 } } });
  const alert = await OperationalAlert.findOneAndUpdate({ key, status: { $ne: 'resolved' } }, { $set: { lastSeenAt: now }, $inc: { occurrences: 1 } }, { new: true });
  if (alert) await notify(alert);
}
export async function runOperationalCheck() {
  if (running) return;
  running = true;
  try {
    const processData = sampleProcess(), requests = requestSnapshot();
    if (mongoose.connection.readyState !== 1) return;
    await OperationalSample.create({ instance: operationalInstance, observedAt: new Date(), process: processData, requests });
    const recoveries = await OperationalAlert.find({ status: 'resolved', notificationStatus: { $in: ['recovery-pending', 'failed'] } }).limit(5);
    for (const alert of recoveries) await notify(alert, true);
    const workers = await operationalWorkerHealth();
    const productSignals = await productMonitoringSignals().catch(error => {
      void captureOperationalError(error, { route: 'product-monitor', source: 'worker' });
      return [];
    });
    const signals = [
      { key: `memory:${operationalInstance}`, title: 'API memory is above 90% of its container limit', failed: processData.memoryLimitBytes && processData.rssBytes / processData.memoryLimitBytes > .9, severity: 'critical' },
      { key: `event-loop:${operationalInstance}`, title: 'API event loop is delayed by more than 200 ms', failed: processData.eventLoopP95Ms > 200 },
      { key: `api-errors:${operationalInstance}`, title: 'More than 5% of API requests are failing', failed: requests.count >= 20 && requests.errorRate > .05, severity: 'critical' },
      ...workers.filter(worker => worker.enabled).map(worker => ({ key: `worker:${worker.workerName}`, title: `${worker.workerName} worker stopped reporting`, failed: ['stale', 'error'].includes(worker.status), severity: 'critical' })),
      ...productSignals
    ];
    for (const signal of signals) {
      const failing = sustained(signal.key, Boolean(signal.failed));
      // Do not resolve an ongoing incident while a failure is still building its streak.
      if (failing || !signal.failed) await updateOperationalAlert(signal.key, { ...signal, failing });
    }
  } catch (error) { void captureOperationalError(error, { route: 'operations-monitor', source: 'worker' }); }
  finally { running = false; }
}
export async function startOperationalMonitoring() {
  if (timer) return;
  await startProcessMetrics();
  timer = setInterval(() => void runOperationalCheck(), 30000); timer.unref();
  void runOperationalCheck();
}
