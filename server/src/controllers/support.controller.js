import crypto from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { z } from 'zod';
import SupportTicket from '../models/SupportTicket.js';
import SupportOutbox from '../models/SupportOutbox.js';
import AdminAudit from '../models/AdminAudit.js';
import AdminUser from '../models/AdminUser.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import RefundRequest from '../models/RefundRequest.js';
import { supportCreateSchema, createSupportRequest, customerTicket, appendSupportMessage, supportError, supportText, safeBrowser, migrateLegacySupportTickets } from '../services/support.service.js';
import { supportMailboxHealth, runSupportMaintenance } from '../services/supportMail.service.js';
import { putR2Object, getR2ObjectBuffer, deleteR2Object } from '../services/r2.service.js';

const id = value => mongoose.isValidObjectId(value) ? String(value) : null;
const adminId = req => req.admin?._id || req.admin?.id;
const finance = req => ['superadmin', 'finance'].includes(req.admin?.role);
const wrap = handler => async (req, res) => { try { await handler(req, res); } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'We could not complete this support request. Please try again.' }); } };
async function ownedTicket(req) {
  if (!id(req.params.id)) throw supportError('That support request identifier is invalid.');
  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ticket) throw supportError('Support request not found.', 404);
  return ticket;
}
export async function adminTicket(req) {
  await migrateLegacySupportTickets();
  if (!id(req.params.id)) throw supportError('That support request identifier is invalid.');
  const ticket = await SupportTicket.findById(req.params.id).populate('assignedAdminId', 'name username role');
  if (!ticket || (!finance(req) && ticket.channel === 'email' && ticket.mailbox === 'billing') || (req.admin?.role === 'finance' && ticket.mailbox !== 'billing')) throw supportError('Support request not found.', 404);
  return ticket;
}
export const supportAccountContext = wrap(async (req, res) => {
  const user = await User.findById(req.user.id).select('name email');
  const payments = await Payment.find({ userId: req.user.id, paidAt: { $type: 'date' } }).select('reference amountKobo currency status paidAt').sort({ paidAt: -1 }).limit(25).lean();
  res.json({ success: true, data: { name: user?.name || '', email: user?.email || '', payments, browser: safeBrowser(req) } });
});
export const createSupportTicket = wrap(async (req, res) => {
  const parsed = supportCreateSchema.safeParse(req.body);
  if (!parsed.success) throw supportError(parsed.error.issues[0]?.message || 'Check your support message.');
  const ticket = await createSupportRequest(req, parsed.data);
  res.status(201).json({ success: true, data: { id: ticket._id, ticketNumber: ticket.ticketNumber, status: ticket.status, signedIn: Boolean(ticket.userId) } });
});
export const listCustomerSupport = wrap(async (req, res) => {
  const before = id(req.query.before);
  const tickets = await SupportTicket.find({ userId: req.user.id, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(31).lean();
  res.json({ success: true, data: { tickets: tickets.slice(0, 30).map(ticket => { const value = customerTicket(ticket); delete value.messages; return value; }), nextCursor: tickets.length > 30 ? tickets[29]._id : null } });
});
export const readCustomerSupport = wrap(async (req, res) => {
  const ticket = await ownedTicket(req);
  const request = ticket.refundRequestId ? await RefundRequest.findById(ticket.refundRequestId).select('status reason receivedAt customerNote refundId').populate('refundId', 'status amountKobo updatedAt').lean() : null;
  await SupportTicket.updateOne({ _id: ticket._id, userId: req.user.id }, { $set: { customerReadAt: new Date() } });
  res.json({ success: true, data: { ...customerTicket(ticket), refundRequest: request } });
});
const replySchema = z.object({ message: z.string().trim().min(1).max(4000), requestKey: z.uuid() }).strict();
export const replyCustomerSupport = wrap(async (req, res) => {
  const ticket = await ownedTicket(req);
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) throw supportError('Write a message of up to 4,000 characters.');
  const updated = await appendSupportMessage(ticket._id, { ...parsed.data, authorType: 'requester' });
  res.json({ success: true, data: customerTicket(updated) });
});
function adminSummary(ticket) {
  const latest = ticket.messages?.at(-1);
  return { id: ticket._id, ticketNumber: ticket.ticketNumber, subject: ticket.subject, requester: { name: ticket.requesterName, email: ticket.requesterEmail },
    accountId: ticket.userId, category: ticket.category, mailbox: ticket.mailbox, channel: ticket.channel,
    status: ticket.status, priority: ticket.priority, assignedAdmin: ticket.assignedAdminId, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
    lastRequesterAt: ticket.lastRequesterAt, lastResponseAt: ticket.lastResponseAt, hasUnread: Boolean(!ticket.staffReadAt || ticket.lastRequesterAt > ticket.staffReadAt),
    waitingSince: !ticket.lastResponseAt || ticket.lastRequesterAt > ticket.lastResponseAt ? ticket.lastRequesterAt || ticket.createdAt : null,
    latestMessage: latest ? { message: latest.message.slice(0, 160), internal: latest.internal, authorType: latest.authorType } : null };
}
export const listAdminSupport = wrap(async (req, res) => {
  await migrateLegacySupportTickets();
  const query = {};
  if (!finance(req)) query.$nor = [{ channel: 'email', mailbox: 'billing' }];
  if (req.admin?.role === 'finance') query.mailbox = 'billing';
  if (req.admin?.role === 'finance' && req.query.mailbox === 'general') throw supportError('Finance access is limited to the billing inbox.', 403);
  if (['general', 'billing'].includes(req.query.mailbox)) query.mailbox = req.query.mailbox;
  if (['open', 'pending', 'resolved', 'closed'].includes(req.query.status)) query.status = req.query.status;
  if (req.query.assigned === 'mine') query.assignedAdminId = adminId(req);
  if (req.query.assigned === 'unassigned') query.assignedAdminId = null;
  const search = String(req.query.search || '').trim().slice(0, 100);
  if (search) {
    const regex = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    query.$or = [{ ticketNumber: regex }, { requesterEmail: regex }, { requesterName: regex }, { subject: regex }];
  }
  const page = Math.min(10000, Math.max(1, Math.floor(Number(req.query.page) || 1))), limit = 30;
  const [rows, grouped, administrators, health] = await Promise.all([
    SupportTicket.aggregate([{ $match: query }, { $addFields: { priorityOrder: { $indexOfArray: [['urgent', 'high', 'normal', 'low'], '$priority'] } } }, { $sort: { priorityOrder: 1, updatedAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { 'attachments.key': 0, context: 0 } }]),
    SupportTicket.aggregate([{ $match: query }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    AdminUser.find({ accountStatus: 'active', role: { $in: ['superadmin', 'operations', 'support', 'finance'] } }).select('name username role').lean(),
    supportMailboxHealth()
  ]);
  await SupportTicket.populate(rows, { path: 'assignedAdminId', select: 'name username role' });
  const total = grouped.reduce((sum, item) => sum + item.count, 0);
  res.json({ success: true, data: { tickets: rows.map(adminSummary), summary: { total, ...Object.fromEntries(grouped.map(item => [item._id, item.count])) }, total, page, pages: Math.ceil(total / limit), administrators,
    mail: { ...health, mailboxes: health.mailboxes.filter(mailbox => req.admin?.role === 'finance' ? mailbox.mailbox === 'billing' : finance(req) || mailbox.mailbox === 'general') }, generatedAt: new Date() } });
});
export const readAdminSupport = wrap(async (req, res) => {
  const ticket = await adminTicket(req);
  await SupportTicket.updateOne({ _id: ticket._id }, { $set: { staffReadAt: new Date() } });
  const outbox = await SupportOutbox.find({ ticketId: ticket._id }).select('messageId status attempts failureCode sentAt sentCopyStatus').lean();
  res.json({ success: true, data: { ...adminSummary(ticket), messages: ticket.messages, context: ticket.context, deliveryPublicId: ticket.deliveryPublicId,
    paymentId: ticket.paymentId, refundRequestId: ticket.refundRequestId, resourceId: ticket.resourceId, resourceType: ticket.resourceType, attachments: customerTicket(ticket).attachments,
    moderationActions: ticket.moderationActions, outbox } });
});
const updateSchema = z.object({ status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedAdminId: z.string().nullable().optional(), message: z.string().trim().min(1).max(4000).optional(), internal: z.boolean().default(false), requestKey: z.uuid().optional()
}).strict();
export const editAdminSupport = wrap(async (req, res) => {
  const ticket = await adminTicket(req), parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw supportError('Check the support update.');
  const body = parsed.data, set = {};
  if (body.message && !body.requestKey) throw supportError('Refresh the reply form before sending.');
  if (body.assignedAdminId !== undefined) {
    if (body.assignedAdminId && (!id(body.assignedAdminId) || !await AdminUser.exists({ _id: body.assignedAdminId, accountStatus: 'active', role: { $in: ['superadmin', 'operations', 'support', 'finance'] } }))) throw supportError('Choose an active support administrator.');
    set.assignedAdminId = body.assignedAdminId || null;
  }
  if (body.priority) set.priority = body.priority;
  if (body.status) { set.status = body.status; set.resolvedAt = body.status === 'resolved' ? new Date() : null; set.closedAt = body.status === 'closed' ? new Date() : null; }
  if (Object.keys(set).length) await SupportTicket.updateOne({ _id: ticket._id }, { $set: set });
  if (body.message) await appendSupportMessage(ticket._id, { message: body.message, authorType: 'admin', adminId: adminId(req), internal: body.internal, requestKey: body.requestKey });
  await AdminAudit.create({ adminId: adminId(req), userId: ticket.userId, action: 'support.ticket_updated', resourceType: 'SupportTicket', resourceId: String(ticket._id), details: { fields: Object.keys(set), messageAdded: Boolean(body.message), internal: body.internal } });
  res.json({ success: true, message: body.message && !body.internal ? 'Reply saved in the customer inbox and queued for email.' : 'Support request updated.' });
});
export const retrySupportEmail = wrap(async (req, res) => {
  const ticket = await adminTicket(req);
  const schema = z.object({ messageId: z.string().regex(/^[a-f0-9]{24}$/i), confirmedNotSent: z.boolean().optional(), reason: z.string().trim().min(10).max(500) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw supportError('Record why this email should be retried.');
  const row = await SupportOutbox.findOne({ ticketId: ticket._id, messageId: parsed.data.messageId });
  if (!row || !['failed', 'uncertain'].includes(row.status)) throw supportError('Only a failed or reviewed uncertain email can be retried.');
  if (row.status === 'uncertain' && parsed.data.confirmedNotSent !== true) throw supportError('Check the Sent folder and confirm this message was not sent before retrying.');
  const updated = await SupportOutbox.updateOne({ _id: row._id, status: row.status }, { $set: { status: 'queued', attempts: 0 }, $unset: { leaseUntil: 1, retryAfter: 1 } });
  if (!updated.modifiedCount) throw supportError('Another administrator already updated this email.', 409);
  await SupportTicket.updateOne({ _id: ticket._id, 'messages._id': row.messageId }, { $set: { 'messages.$.deliveryStatus': 'queued' } });
  await AdminAudit.create({ adminId: adminId(req), action: 'support.email_retry', resourceType: 'SupportOutbox', resourceId: String(row._id), details: { reason: parsed.data.reason, confirmedNotSent: parsed.data.confirmedNotSent === true } });
  res.json({ success: true, message: 'Email queued for another attempt.' });
});
export const syncAdminSupport = wrap(async (_req, res) => { await runSupportMaintenance(); res.json({ success: true, data: await supportMailboxHealth() }); });
export const addSupportAttachment = wrap(async (req, res) => {
  const ticket = await ownedTicket(req);
  if (!req.file || ticket.attachments.length >= 6) throw supportError('Attach one screenshot at a time, up to six per conversation.');
  let buffer;
  try {
    const image = sharp(req.file.buffer, { limitInputPixels: 16000000, animated: false, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Unsupported image');
    buffer = await image.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw supportError('Use a JPG, PNG or WebP screenshot, up to 4 MB.'); }
  const key = `veylo/users/${req.user.id}/support/${ticket._id}/${crypto.randomUUID()}.webp`;
  await putR2Object(key, buffer, { contentType: 'image/webp' });
  const attachment = { name: 'Support screenshot.webp', contentType: 'image/webp', bytes: buffer.length, key };
  const saved = await SupportTicket.updateOne({ _id: ticket._id, userId: req.user.id, 'attachments.5': { $exists: false } }, { $push: { attachments: attachment } });
  if (!saved.modifiedCount) { await deleteR2Object(key).catch(() => {}); throw supportError('The conversation already has six screenshots.'); }
  res.status(201).json({ success: true });
});
export const downloadSupportAttachment = wrap(async (req, res) => {
  const ticket = req.admin ? await adminTicket(req) : await ownedTicket(req);
  const stored = await SupportTicket.findById(ticket._id).select('+attachments.key');
  const attachment = stored.attachments.id(req.params.attachmentId);
  if (!attachment?.key) throw supportError('Screenshot not found.', 404);
  const buffer = await getR2ObjectBuffer(attachment.key, { maxBytes: 4 * 1024 * 1024 });
  res.set({ 'Content-Type': 'image/webp', 'Content-Disposition': 'attachment; filename="support-screenshot.webp"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(buffer);
});
