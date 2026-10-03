import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import PortfolioEnquiry from '../models/PortfolioEnquiry.js';
import { owner, resolvePublicPortfolio } from './portfolioV2.controller.js';
import { normalizeSnapshot, normalizeWhatsApp } from '../utils/portfolio.js';
import { recordAnalyticsEventAsync } from '../services/analytics.service.js';
import { sectionVisible } from '../shared/portfolioContent.mjs';
const text = max => z.string().trim().max(max).default('');
const schema = z.object({
  requestId: z.string().uuid(), name: z.string().trim().min(2).max(100), replyMethod: z.enum(['email', 'whatsapp']), replyTo: z.string().trim().min(5).max(254),
  shootType: z.string().trim().min(2).max(100), message: z.string().trim().min(10).max(2000),
  date: text(10).refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Choose a valid date, or leave it undecided.'),
  location: text(120), budget: text(100), projectId: text(80), categoryId: text(80), serviceId: text(80), website: text(200), permission: z.literal(true)
}).strict();
const fail = (res, status, message) => res.status(status).json({ success: false, message });
export async function submitPortfolioEnquiry(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    const input = parsed.data;
    if (input.website) return res.status(202).json({ success: true, message: 'Your enquiry has been received.' });
    const resolved = await resolvePublicPortfolio(req.params.handle);
    if (!resolved) return fail(res, 404, 'This portfolio is unavailable.');
    const snapshot = normalizeSnapshot(resolved.portfolio), contact = snapshot.content.contact;
    if (!snapshot.direction.showContact || contact.showcaseOnly || !contact.formEnabled) return fail(res, 404, 'This photographer is not receiving enquiries through this form.');
    if (input.replyMethod === 'email' && !z.email().safeParse(input.replyTo).success) return fail(res, 400, 'Enter a valid reply email address.');
    if (input.replyMethod === 'whatsapp') {
      input.replyTo = normalizeWhatsApp(input.replyTo);
      if (!/^[1-9]\d{7,14}$/.test(input.replyTo)) return fail(res, 400, 'Enter a valid WhatsApp number with its country code.');
    } else input.replyTo = input.replyTo.toLowerCase();
    const project = snapshot.projects.find(project => project.id === input.projectId);
    const category = snapshot.content.categoryDetails.find(category => category.id === input.categoryId && (snapshot.items.some(item => item.category === category.name) || snapshot.projects.some(project => project.category === category.name)));
    const service = snapshot.content.services.find(service => service.id === input.serviceId);
    if (input.projectId && !project || input.categoryId && (!category || !snapshot.direction.showCategories) || input.serviceId && (!service || !sectionVisible(snapshot.content, 'services'))) return fail(res, 400, 'The work you selected is no longer available. Reopen the portfolio and try again.');
    const { requestId, website, permission, ...details } = input;
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex');
    const identity = { portfolioId: resolved.portfolio._id, requestId };
    await PortfolioEnquiry.init();
    let enquiry;
    try {
      enquiry = await PortfolioEnquiry.findOneAndUpdate(identity, { $setOnInsert: { ...identity, userId: resolved.user._id, ...details, sourceLabel: [project?.title, category?.name, service?.title].filter(Boolean).join(' · ').slice(0, 180), fingerprint } }, { upsert: true, new: true, runValidators: true }).select('+fingerprint');
    } catch (error) {
      if (error.code !== 11000) throw error;
      enquiry = await PortfolioEnquiry.findOne(identity).select('+fingerprint');
    }
    if (!enquiry || enquiry.fingerprint !== fingerprint) return fail(res, 409, 'This submission changed. Start a new enquiry before sending it.');
    // Notification work uses the saved record. A provider outage cannot lose this enquiry.
    res.status(202).json({ success: true, message: 'Your enquiry has been received. The photographer will reply using the details you provided.' });
  } catch { fail(res, 503, 'We could not save your enquiry. Your details are still here; please try again.'); }
}
export async function listPortfolioEnquiries(req, res) {
  try {
    const { user, access } = await owner(req);
    if (access === 'unavailable') return fail(res, 403, 'Your retained enquiries are no longer available.');
    const status = req.query.status;
    if (status && !['new', 'replied', 'closed'].includes(status)) return fail(res, 400, 'Choose a valid enquiry status.');
    const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1)));
    const filter = { userId: user._id, ...(status ? { status } : {}) };
    const [rows, total, counts] = await Promise.all([PortfolioEnquiry.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 25).limit(25).lean(), PortfolioEnquiry.countDocuments(filter), PortfolioEnquiry.aggregate([{ $match: { userId: user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }])]);
    res.set('Cache-Control', 'no-store').json({ success: true, data: rows.map(({ notification, portfolioId, userId, ...row }) => ({ ...row, notificationStatus: notification?.status || 'pending' })), total, page, hasMore: page * 25 < total, counts: Object.fromEntries(counts.map(count => [count._id, count.count])) });
  } catch (error) { fail(res, error.status || 500, error.status ? error.message : 'We could not open your enquiry inbox.'); }
}
export async function updatePortfolioEnquiry(req, res) {
  try {
    const { user, access } = await owner(req);
    if (access === 'unavailable') return fail(res, 403, 'Your retained enquiries are no longer available.');
    const parsed = z.object({ status: z.enum(['new', 'replied', 'closed']) }).strict().safeParse(req.body);
    if (!parsed.success || !mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Choose a valid enquiry and status.');
    const row = await PortfolioEnquiry.findOneAndUpdate({ _id: req.params.id, userId: user._id }, { $set: { status: parsed.data.status } }, { new: true });
    if (!row) return fail(res, 404, 'Enquiry not found.');
    recordAnalyticsEventAsync({ name: 'portfolio.enquiry.updated', source: 'server', actorType: 'photographer', userId: user._id, status: row.status });
    res.set('Cache-Control', 'no-store').json({ success: true, data: { id: String(row._id), status: row.status } });
  } catch (error) { fail(res, error.status || 500, error.status ? error.message : 'We could not update that enquiry.'); }
}
