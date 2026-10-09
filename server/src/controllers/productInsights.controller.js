import mongoose from 'mongoose';
import { z } from 'zod';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import User from '../models/User.js';
import AdminAudit from '../models/AdminAudit.js';
import { adminTicket } from './support.controller.js';
import { analyticsRoute } from '../utils/analyticsPrivacy.js';
import { FUNNELS, orderedFunnel, retentionReport } from '../services/productInsights.service.js';
import { posthogConfiguration } from '../services/posthog.service.js';
import { symbolicateBrowserDiagnostic } from '../services/browserSourceMaps.service.js';

const day = 86400000;
const excludedIds = () => (process.env.ANALYTICS_EXCLUDED_USER_IDS || '').split(',').map(value => value.trim()).filter(value => mongoose.isValidObjectId(value)).map(value => new mongoose.Types.ObjectId(value));
const base = () => ({ excluded: { $ne: true }, actorType: { $ne: 'admin' }, userId: { $nin: excludedIds() } });
const safe = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (error.status) return res.status(error.status).json({ success: false, message: error.message }); next(error); } };
function daysFor(req) { const days = Number(req.query.days || 30); if (![7, 30, 90].includes(days)) throw Object.assign(new Error('Choose 7, 30 or 90 days.'), { status: 400 }); return days; }
export const getProductInsights = safe(async (req, res) => {
  const days = daysFor(req), now = new Date(), since = new Date(+now - days * day);
  const names = [...new Set(FUNNELS.flatMap(funnel => funnel.steps.map(step => step[0])))];
  const events = await AnalyticsEvent.find({ ...base(), name: { $in: names }, occurredAt: { $lte: now }, $or: [{ occurredAt: { $gte: since } }, { name: 'delivery.publish.succeeded', source: 'server' }] }).select('name source actorType userId sessionDigest resourceDigest flowDigest sequence occurredAt format').sort({ occurredAt: 1, sequence: 1, _id: 1 }).limit(50001).maxTimeMS(7000).lean();
  // Never silently turn a capped sample into a conversion/retention report.
  if (events.length > 50000) return res.status(503).json({ success: false, message: 'This report exceeds the current analysis limit. Use PostHog for this dataset; no sampled conversion rates are shown.' });
  const accounts = await User.find({ role: 'user', _id: { $nin: excludedIds() }, createdAt: { $gte: since, $lte: now } }).select('_id createdAt').limit(10001).maxTimeMS(7000).lean();
  if (accounts.length > 10000) return res.status(503).json({ success: false, message: 'This account cohort exceeds the current analysis limit.' });
  const published = events.filter(event => event.name === 'delivery.publish.succeeded' && event.source === 'server' && event.actorType === 'photographer' && event.userId);
  const publishers = new Set(published.map(event => String(event.userId))), formatUsers = new Map();
  for (const event of published.filter(event => new Date(event.occurredAt) >= since)) {
    const key = /^[a-z0-9_-]{1,60}$/.test(event.format || '') ? event.format : 'unspecified';
    if (!formatUsers.has(key)) formatUsers.set(key, new Set()); formatUsers.get(key).add(String(event.userId));
  }
  const [failedUploads, lastExport, pending, failed] = await Promise.all([
    AnalyticsEvent.distinct('userId', { ...base(), name: 'upload.failed', actorType: 'photographer', occurredAt: { $gte: since, $lte: now }, userId: { $exists: true, $nin: excludedIds() } }).maxTimeMS(7000),
    AnalyticsEvent.findOne({ forwardState: 'sent', forwardedAt: { $exists: true } }).select('forwardedAt').sort({ forwardedAt: -1 }).lean(),
    AnalyticsEvent.countDocuments({ forwardState: { $in: ['pending', 'sending'] } }), AnalyticsEvent.countDocuments({ forwardState: 'failed' })
  ]);
  res.set('Cache-Control', 'private, no-store').json({ success: true, data: { generatedAt: now, since, days,
    funnels: FUNNELS.map(definition => orderedFunnel(events, definition, { since, now })),
    retention: [7, 30].map(periodDays => retentionReport(published, { since, now, periodDays })),
    cohorts: [{ key: 'never-published', label: 'New accounts without a recorded publication', count: accounts.filter(account => !publishers.has(String(account._id))).length }, { key: 'upload-trouble', label: 'Accounts reporting upload failures', count: failedUploads.length }],
    formats: [...formatUsers].map(([format, people]) => ({ format, photographers: people.size })),
    integration: { ...posthogConfiguration(), lastAcceptedAt: lastExport?.forwardedAt || null, pending, failed },
    coverage: { firstRecordedAt: events[0]?.occurredAt || null, note: 'Reports use retained events. Activation begins with server-verified accounts; historical activity is not reconstructed. A download-start event does not prove a completed download.' }
  } });
});
export async function accountActivity(userId, query = {}) {
  const parsed = z.object({ before: z.string().regex(/^[a-f0-9]{24}$/i).optional(), failures: z.enum(['true', 'false']).optional() }).safeParse(query);
  if (!parsed.success) throw Object.assign(new Error('Choose a valid activity filter.'), { status: 400 });
  const match = { userId: new mongoose.Types.ObjectId(userId), actorType: 'photographer', ...(parsed.data.before ? { _id: { $lt: new mongoose.Types.ObjectId(parsed.data.before) } } : {}) };
  if (parsed.data.failures === 'true') match.$or = [{ status: { $in: ['failed', 'error'] } }, { name: 'javascript.error' }];
  const rows = await AnalyticsEvent.find(match).select('name source status errorCode route format diagnostic fingerprint browser deviceType operatingSystem occurredAt excluded').sort({ _id: -1 }).limit(31).maxTimeMS(5000).lean();
  const more = rows.length > 30, items = rows.slice(0, 30).map(row => ({ id: row._id, name: row.name, source: row.source, status: row.status, errorCode: /^[A-Z0-9_]{1,80}$/.test(row.errorCode || '') ? row.errorCode : undefined, route: analyticsRoute(row.route), format: row.format, diagnostic: row.diagnostic, fingerprint: row.fingerprint, browser: row.browser, deviceType: row.deviceType, occurredAt: row.occurredAt, excluded: row.excluded }));
  for (const item of items) item.diagnostic = await symbolicateBrowserDiagnostic(item.diagnostic);
  return { generatedAt: new Date(), items, next: more ? String(items.at(-1).id) : null };
}
export const getCohortAccounts = safe(async (req, res) => {
  const days = daysFor(req), since = new Date(Date.now() - days * day), page = Math.max(1, Math.min(100, Number.parseInt(req.query.page, 10) || 1));
  if (!['never-published', 'upload-trouble'].includes(req.params.key)) return res.status(400).json({ success: false, message: 'Choose a saved user group.' });
  const match = { role: 'user', _id: { $nin: excludedIds() } };
  const pipeline = [];
  if (req.params.key === 'never-published') {
    match.createdAt = { $gte: since };
    pipeline.push({ $match: match }, { $lookup: { from: 'analyticsevents', let: { account: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$userId', '$$account'] }, name: 'delivery.publish.succeeded', source: 'server', actorType: 'photographer', excluded: { $ne: true } } }, { $limit: 1 }], as: 'publication' } }, { $match: { 'publication.0': { $exists: false } } });
  } else {
    const ids = await AnalyticsEvent.distinct('userId', { ...base(), name: 'upload.failed', actorType: 'photographer', occurredAt: { $gte: since }, userId: { $exists: true, $nin: excludedIds() } }).maxTimeMS(5000);
    pipeline.push({ $match: { ...match, _id: { $in: ids.filter(Boolean), $nin: excludedIds() } } });
  }
  pipeline.push({ $sort: { _id: 1 } }, { $skip: (page - 1) * 20 }, { $limit: 21 }, { $project: { name: 1 } });
  const rows = await User.aggregate(pipeline).option({ maxTimeMS: 7000 });
  await AdminAudit.create({ adminId: req.admin._id, action: 'analytics.cohort.read', resourceType: 'User', details: { cohort: req.params.key, days, page } });
  res.set('Cache-Control', 'private, no-store').json({ success: true, data: { items: rows.slice(0, 20).map(row => ({ id: row._id, name: row.name })), more: rows.length > 20, page } });
});
export const getAccountActivity = safe(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Choose a valid account.' });
  if (!await User.exists({ _id: req.params.id })) return res.status(404).json({ success: false, message: 'Account not found.' });
  const data = await accountActivity(req.params.id, req.query);
  await AdminAudit.create({ adminId: req.admin._id, action: 'analytics.account_activity.read', resourceType: 'User', resourceId: req.params.id });
  res.set('Cache-Control', 'private, no-store').json({ success: true, data });
});
export const getTicketActivity = safe(async (req, res) => {
  const ticket = await adminTicket(req);
  const data = ticket.userId ? await accountActivity(ticket.userId, req.query) : { generatedAt: new Date(), items: [], next: null, note: 'This message is not linked to an authenticated account. Activity is not matched by email address.' };
  await AdminAudit.create({ adminId: req.admin._id, action: 'analytics.ticket_activity.read', resourceType: 'SupportTicket', resourceId: String(ticket._id) });
  res.set('Cache-Control', 'private, no-store').json({ success: true, data });
});
export const getBrowserErrors = safe(async (req, res) => {
  const days = daysFor(req), since = new Date(Date.now() - days * day);
  const match = { ...base(), name: 'javascript.error', fingerprint: { $exists: true }, occurredAt: { $gte: since } };
  if (req.query.fingerprint && !/^[a-f0-9]{64}$/.test(req.query.fingerprint)) return res.status(400).json({ success: false, message: 'Choose a valid error group.' });
  if (req.query.fingerprint) match.fingerprint = req.query.fingerprint;
  const items = await AnalyticsEvent.aggregate([{ $match: match }, { $sort: { occurredAt: -1 } }, { $group: { _id: '$fingerprint', occurrences: { $sum: 1 }, firstAt: { $min: '$occurredAt' }, lastAt: { $max: '$occurredAt' }, diagnostic: { $first: '$diagnostic' }, route: { $first: '$route' }, accounts: { $addToSet: '$userId' }, sessions: { $addToSet: '$sessionDigest' }, releases: { $addToSet: '$diagnostic.release' }, browsers: { $addToSet: '$browser' } } }, { $sort: { occurrences: -1 } }, { $limit: 50 }]).option({ maxTimeMS: 7000 });
  const canAccounts = ['superadmin', 'operations'].includes(req.admin.role);
  for (const item of items) item.diagnostic = await symbolicateBrowserDiagnostic(item.diagnostic);
  res.set('Cache-Control', 'private, no-store').json({ success: true, data: { generatedAt: new Date(), days, items: items.map(row => ({ fingerprint: row._id, occurrences: row.occurrences, firstAt: row.firstAt, lastAt: row.lastAt, diagnostic: row.diagnostic, route: analyticsRoute(row.route), affectedAccounts: row.accounts.filter(Boolean).length, affectedSessions: row.sessions.filter(Boolean).length, accountIds: canAccounts ? row.accounts.filter(Boolean).slice(0, 20) : undefined, releases: row.releases, browsers: row.browsers })) } });
});
