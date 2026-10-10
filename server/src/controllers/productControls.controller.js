import { z } from 'zod';
import mongoose from 'mongoose';
import ProductControls from '../models/ProductControls.js';
import ProductExposure from '../models/ProductExposure.js';
import ProductFeedback from '../models/ProductFeedback.js';
import AdminAudit from '../models/AdminAudit.js';
import { EXPERIMENT, SURVEY, productControls, productRuntime, productParticipant, verifyExposure, operationsAlertRecipient } from '../services/productControls.service.js';
import { recordAnalyticsEvent } from '../services/analytics.service.js';

const safe = handler => async (req, res, next) => { try { res.set('Cache-Control', 'private, no-store'); await handler(req, res); } catch (error) { next(error); } };
const settingsSchema = z.object({
  revision: z.number().int().min(0), replayEnabled: z.boolean(), replaySamplePercent: z.number().int().min(0).max(100),
  feedbackEnabled: z.boolean(), guidanceEnabled: z.boolean(), guidanceRolloutPercent: z.number().int().min(0).max(100),
  guidanceExperimentEnabled: z.boolean(), alertEmail: z.union([z.literal(''), z.email().max(254)])
}).strict();
export const getProductRuntime = safe(async (req, res) => res.json({ success: true, data: await productRuntime(req.user.id) }));
export const getProductControls = safe(async (req, res) => {
  const excluded = (process.env.ANALYTICS_EXCLUDED_USER_IDS || '').split(',').filter(value => mongoose.isValidObjectId(value)).map(value => new mongoose.Types.ObjectId(value));
  const participants = [
    { $match: { userId: { $nin: excluded } } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', pipeline: [{ $match: { role: 'user', accountStatus: 'active' } }, { $project: { _id: 1 } }], as: 'participant' } },
    { $match: { 'participant.0': { $exists: true } } }
  ];
  const [settings, recipient, feedback, experiments] = await Promise.all([
    productControls(), operationsAlertRecipient(),
    ProductFeedback.aggregate([...participants, { $group: { _id: '$score', responses: { $sum: 1 } } }, { $sort: { _id: 1 } }]).option({ maxTimeMS: 5000 }),
    ProductExposure.aggregate([{ $match: { experiment: EXPERIMENT } }, ...participants,
      { $lookup: { from: 'analyticsevents', let: { account: '$userId', at: '$exposedAt' }, pipeline: [{ $match: { name: 'delivery.publish.succeeded', source: 'server', actorType: 'photographer', excluded: { $ne: true }, $expr: { $and: [{ $eq: ['$userId', '$$account'] }, { $gte: ['$occurredAt', '$$at'] }, { $lte: ['$occurredAt', { $add: ['$$at', 7 * 86400000] }] }] } } }, { $limit: 1 }], as: 'outcomes' } },
      { $group: { _id: '$variant', exposed: { $sum: 1 }, published: { $sum: { $cond: [{ $gt: [{ $size: '$outcomes' }, 0] }, 1, 0] } }, pending: { $sum: { $cond: [{ $gt: ['$exposedAt', new Date(Date.now() - 7 * 86400000)] }, 1, 0] } } } }]).option({ maxTimeMS: 7000 })
  ]);
  res.json({ success: true, data: { settings, email: { configured: Boolean(recipient && process.env.RESEND_API_KEY), recipient },
    feedback: feedback.map(row => ({ score: row._id, responses: row.responses })),
    experiment: { key: EXPERIMENT, variants: experiments.map(row => ({ variant: row._id, exposed: row.exposed, published: row.published, pending: row.pending })), note: 'Publication within 7 days of seeing the dashboard. Counts are observations, not a statistically proven winner.' },
    sourceMaps: { nativeConfigured: Boolean(process.env.BROWSER_SOURCE_MAP_DIR), posthogUploadRequiresBuildCredentials: true }
  } });
});
export const saveProductControls = safe(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Check the email address, percentages and switches.' });
  const { revision, ...patch } = parsed.data;
  try { await ProductControls.updateOne({ _id: 'product' }, { $setOnInsert: { _id: 'product' } }, { upsert: true }); } catch (error) { if (error.code !== 11000) throw error; }
  const before = await productControls();
  const saved = await ProductControls.findOneAndUpdate({ _id: 'product', revision }, { $set: patch, $inc: { revision: 1 } }, { new: true }).lean();
  if (!saved) return res.status(409).json({ success: false, message: 'Another administrator changed these settings. Refresh before saving.' });
  await AdminAudit.create({ adminId: req.admin._id, action: 'product.controls.update', resourceType: 'ProductControls', before, after: saved });
  res.json({ success: true, data: saved });
});
export const acknowledgeExposure = safe(async (req, res) => {
  const parsed = z.object({ token: z.string().max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'A valid dashboard assignment is required.' });
  let assignment;
  try { assignment = verifyExposure(parsed.data.token, req.user.id); } catch { return res.status(400).json({ success: false, message: 'This dashboard assignment has expired.' }); }
  const runtime = await productRuntime(req.user.id);
  if (runtime.guidance?.variant !== assignment.variant || !runtime.guidance?.token) return res.status(409).json({ success: false, message: 'This dashboard test is no longer available.' });
  let row;
  try { row = await ProductExposure.create({ userId: req.user.id, experiment: EXPERIMENT, variant: assignment.variant }); }
  catch (error) { if (error.code !== 11000) throw error; }
  if (row) await recordAnalyticsEvent({ name: 'product.guidance.exposed', source: 'server', actorType: 'photographer', userId: req.user.id, eventKey: `exposure:${row._id}`, metadata: { variant: row.variant } });
  res.status(202).json({ success: true });
});
export const submitProductFeedback = safe(async (req, res) => {
  const parsed = z.object({ score: z.number().int().min(1).max(5) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Choose a score from 1 to 5.' });
  if (!await productParticipant(req.user.id) || !(await productControls()).feedbackEnabled) return res.status(403).json({ success: false, message: 'This feedback form is unavailable.' });
  let row;
  try { row = await ProductFeedback.create({ userId: req.user.id, survey: SURVEY, score: parsed.data.score }); }
  catch (error) { if (error.code !== 11000) throw error; }
  if (row) await recordAnalyticsEvent({ name: 'product.feedback.submitted', source: 'server', actorType: 'photographer', userId: req.user.id, count: row.score, eventKey: `feedback:${row._id}` });
  res.status(202).json({ success: true });
});
export const consentToDashboardReplay = safe(async (req, res) => {
  const parsed = z.object({ consent: z.literal(true) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Your permission is required before recording.' });
  const runtime = await productRuntime(req.user.id);
  if (!runtime.replay) return res.status(403).json({ success: false, message: 'Dashboard recording is unavailable.' });
  await recordAnalyticsEvent({ name: 'product.replay.consented', source: 'server', actorType: 'photographer', userId: req.user.id, metadata: { scope: 'dashboard', maximumMinutes: 5, disclosureVersion: 1 } });
  res.json({ success: true, data: runtime.replay });
});
