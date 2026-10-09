import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import OperationalIssue from '../models/OperationalIssue.js';
import OperationalAlert from '../models/OperationalAlert.js';
import OperationalSample from '../models/OperationalSample.js';
import MonitorCheck from '../models/MonitorCheck.js';
import ActiveSession from '../models/ActiveSession.js';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import AdminAudit from '../models/AdminAudit.js';
import { operationalInstance, processSnapshot, requestSnapshot } from '../services/operationalMetrics.service.js';
import { operationalWorkerHealth } from '../services/operationalMonitoring.service.js';

export async function readiness(req, res) {
  res.set('Cache-Control', 'no-store');
  let timeout;
  try {
    if (mongoose.connection.readyState !== 1) throw new Error('NOT_READY');
    await Promise.race([mongoose.connection.db.admin().ping({ maxTimeMS: 1500 }), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('TIMEOUT')), 2000); })]);
    return res.json({ status: 'ready', checkedAt: new Date().toISOString() });
  } catch { return res.status(503).json({ status: 'unavailable', checkedAt: new Date().toISOString() }); }
  finally { clearTimeout(timeout); }
}
export async function getSystemOverview(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    const now = new Date(), since = new Date(Date.now() - 3600000), activeSince = new Date(Date.now() - 90000);
    const [history, checks, alerts, issues, workers, activity] = await Promise.all([
      OperationalSample.find({ observedAt: { $gte: since } }).sort({ observedAt: -1 }).limit(480).lean(),
      MonitorCheck.find().lean(),
      OperationalAlert.find({ status: { $ne: 'resolved' } }).sort({ severity: 1, lastSeenAt: -1 }).limit(50).lean(),
      OperationalIssue.countDocuments({ status: { $ne: 'resolved' } }),
      operationalWorkerHealth(),
      ActiveSession.aggregate([{ $match: { lastSeenAt: { $gte: activeSince } } }, { $group: { _id: '$actorType', count: { $sum: 1 } } }])
    ]);
    const byActor = Object.fromEntries(activity.map(row => [row._id, row.count]));
    const freshInstances = Object.values(Object.fromEntries(history.filter(row => Date.now() - new Date(row.observedAt).getTime() < 90000).reverse().map(row => [row.instance, row])));
    return res.json({ success: true, data: { generatedAt: now, instance: operationalInstance,
      process: processSnapshot(), requests: requestSnapshot(), history: history.filter(row => row.instance === operationalInstance).reverse(),
      instances: freshInstances.map(row => ({ instance: row.instance, observedAt: row.observedAt, process: row.process })),
      alerts, openIssues: issues, workers,
      activity: { windowSeconds: 90, total: activity.reduce((sum, row) => sum + row.count, 0), photographers: byActor.photographer || 0, visitors: byActor.anonymous || 0 },
      externalMonitor: { configured: Boolean(process.env.OPS_MONITOR_SECRET), checks: ['api', 'website'].map(name => {
        const check = checks.find(row => row.name === name);
        return { name, status: !check ? 'unknown' : Date.now() - new Date(check.receivedAt).getTime() > 180000 ? 'stale' : check.healthy ? 'healthy' : 'unavailable',
          checkedAt: check?.checkedAt || null, receivedAt: check?.receivedAt || null, latencyMs: check?.latencyMs ?? null };
      }) },
      notifications: { configured: Boolean(process.env.OPS_ALERT_EMAIL && process.env.RESEND_API_KEY), encryptionConfigured: Boolean(process.env.BILLING_ENCRYPTION_KEY) },
      revision: (process.env.RENDER_GIT_COMMIT || '').slice(0, 12) || null,
      scope: 'Process history and request metrics cover the responding API instance. Content Studio is excluded.'
    } });
  } catch (error) { next(error); }
}
export async function getOperationalIssues(req, res, next) {
  try {
    const status = ['open', 'acknowledged', 'resolved'].includes(req.query.status) ? req.query.status : 'open';
    const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
    const [items, total, browser] = await Promise.all([
      OperationalIssue.find({ status }).sort({ lastSeenAt: -1 }).skip((page - 1) * 30).limit(30).lean(),
      OperationalIssue.countDocuments({ status }),
      AnalyticsEvent.aggregate([{ $match: { name: { $in: ['javascript.error', 'media.image.failed', 'media.audio.failed'] }, occurredAt: { $gte: new Date(Date.now() - 86400000) } } },
        { $group: { _id: { name: '$name', code: '$errorCode' }, count: { $sum: 1 }, lastSeenAt: { $max: '$occurredAt' } } }, { $sort: { count: -1 } }, { $limit: 20 }])
    ]);
    return res.json({ success: true, data: { generatedAt: new Date(), items, total, page, pages: Math.ceil(total / 30), browser: browser.map(row => ({ name: row._id.name, code: row._id.code, count: row.count, lastSeenAt: row.lastSeenAt })) } });
  } catch (error) { next(error); }
}
export async function updateOperationalIssue(req, res, next) {
  try {
    const parsed = z.object({ status: z.enum(['open', 'acknowledged', 'resolved']), resolution: z.string().trim().max(1000).default('') }).strict().safeParse(req.body);
    if (!mongoose.isValidObjectId(req.params.id) || !parsed.success) return res.status(400).json({ success: false, message: 'Choose a valid issue and status.' });
    if (parsed.data.status === 'resolved' && parsed.data.resolution.length < 5) return res.status(400).json({ success: false, message: 'Add a short note explaining the fix.' });
    const issue = await OperationalIssue.findById(req.params.id);
    if (!issue) return res.status(404).json({ success: false, message: 'Issue not found.' });
    const before = { status: issue.status, assignedAdminId: issue.assignedAdminId };
    await AdminAudit.create({ adminId: req.admin._id, action: 'operations.issue.updated', resourceType: 'OperationalIssue', resourceId: String(issue._id), before,
      after: { status: parsed.data.status }, details: { resolution: parsed.data.resolution } });
    Object.assign(issue, parsed.data, { assignedAdminId: req.admin._id, resolvedAt: parsed.data.status === 'resolved' ? new Date() : null });
    await issue.save();
    return res.json({ success: true, data: issue });
  } catch (error) { next(error); }
}
export async function acknowledgeOperationalAlert(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Choose a valid alert.' });
    const alert = await OperationalAlert.findOne({ _id: req.params.id, status: 'open' });
    if (!alert) return res.status(409).json({ success: false, message: 'This alert was already acknowledged or has recovered. Refresh the page.' });
    await AdminAudit.create({ adminId: req.admin._id, action: 'operations.alert.acknowledged', resourceType: 'OperationalAlert', resourceId: String(alert._id) });
    await OperationalAlert.updateOne({ _id: alert._id, status: 'open' }, { $set: { status: 'acknowledged', acknowledgedBy: req.admin._id } });
    return res.json({ success: true });
  } catch (error) { next(error); }
}
const monitorSchema = z.object({ checks: z.array(z.object({ name: z.enum(['api', 'website']), healthy: z.boolean(), latencyMs: z.number().min(0).max(60000), checkedAt: z.string().datetime(), failures: z.number().int().min(0).max(100000) }).strict()).min(1).max(2) }).strict();
export async function monitorCheckIn(req, res) {
  const secret = process.env.OPS_MONITOR_SECRET || '', supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const equal = crypto.timingSafeEqual(crypto.createHash('sha256').update(secret).digest(), crypto.createHash('sha256').update(supplied).digest());
  if (secret.length < 32 || !equal) return res.status(401).json({ success: false });
  const parsed = monitorSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.checks.some(check => Math.abs(Date.now() - new Date(check.checkedAt).getTime()) > 90000)) return res.status(400).json({ success: false });
  try {
    for (const check of parsed.data.checks) {
      // Reject an older observation, including a replay of a previous request.
      await MonitorCheck.updateOne({ name: check.name, $or: [{ checkedAt: { $lt: new Date(check.checkedAt) } }, { checkedAt: null }] }, { $set: { ...check, checkedAt: new Date(check.checkedAt), receivedAt: new Date() } }, { upsert: true });
    }
    return res.status(202).json({ success: true });
  } catch (error) { return res.status(error.code === 11000 ? 409 : 503).json({ success: false }); }
}
