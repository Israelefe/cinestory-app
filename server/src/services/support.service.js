import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import SupportTicket from '../models/SupportTicket.js';
import SupportOutbox from '../models/SupportOutbox.js';
import RefundRequest, { REFUND_REASONS } from '../models/RefundRequest.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import { resolveEntitlements } from './entitlement.service.js';
import { refundEvidence } from './paidUsage.service.js';
import { assistantContextSchema, freshAssistantContext } from './assistantWorkspace.service.js';

export const supportError = (message, status = 400) => Object.assign(new Error(message), { status });
export const supportText = (value, max = 4000) => String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
export async function migrateLegacySupportTickets() {
  // Existing messages stay intact and retain their original order and timestamps.
  await SupportTicket.updateMany({ mailbox: { $exists: false } }, [{ $set: {
    mailbox: { $cond: [{ $eq: ['$category', 'billing'] }, 'billing', 'general'] },
    channel: { $ifNull: ['$channel', 'web'] }, lastRequesterAt: { $ifNull: ['$lastRequesterAt', '$createdAt'] }
  } }], { timestamps: false });
}
export const supportCreateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(), email: z.email().max(254).optional(),
  subject: z.string().trim().min(3).max(160), message: z.string().trim().min(10).max(4000),
  category: z.enum(['delivery', 'upload', 'billing', 'privacy', 'abuse', 'copyright', 'account', 'format', 'portfolio', 'other']).optional(),
  requestKey: z.uuid(), channel: z.enum(['web', 'assistant']).default('web'),
  deliveryPublicId: z.string().trim().max(200).optional(), deliveryId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  paymentId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), refundReason: z.enum(REFUND_REASONS).optional(),
  context: assistantContextSchema.optional(), includeDiagnostics: z.boolean().default(true),
  expected: z.string().trim().max(1000).optional(), startedAt: z.string().trim().max(120).optional()
}).strict();
export function categoryForSubject(subject) {
  const value = String(subject || '').toLowerCase();
  if (/upload/.test(value)) return 'upload';
  if (/portfolio/.test(value)) return 'portfolio';
  if (/\b(pro|billing|payment|refund|subscription)\b/.test(value)) return 'billing';
  if (/privacy|deletion/.test(value)) return 'privacy';
  if (/format/.test(value)) return 'format';
  if (/delivery/.test(value)) return 'delivery';
  if (/account|sign.in/.test(value)) return 'account';
  return 'other';
}
export function deliveryPublicId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) return /^[a-zA-Z0-9_-]{1,120}$/.test(text) ? text : '';
  try { return new URL(text).pathname.match(/^\/(?:d|story|volume)\/([a-zA-Z0-9_-]{1,120})\/?$/)?.[1] || ''; } catch { return ''; }
}
export function safeBrowser(req) {
  const ua = String(req.headers?.['user-agent'] || '');
  return { browser: /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other', device: /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobile|Android|iPhone/.test(ua) ? 'Phone' : 'Computer' };
}
export function customerTicket(ticket) {
  return { id: ticket._id, ticketNumber: ticket.ticketNumber, subject: ticket.subject, category: ticket.category,
    status: ticket.status, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
    hasUnreadReply: Boolean(ticket.lastResponseAt && (!ticket.customerReadAt || ticket.lastResponseAt > ticket.customerReadAt)),
    messages: (ticket.messages || []).filter(item => !item.internal).map(item => ({ id: item._id, authorType: item.authorType, message: item.message, createdAt: item.createdAt, channel: item.channel })),
    attachments: (ticket.attachments || []).map(item => ({ id: item._id, name: item.name, bytes: item.bytes, contentType: item.contentType })),
    refundRequestId: ticket.refundRequestId || null };
}
export async function ensureRefundRequest(ticket) {
  if (!ticket.paymentId || !ticket.context?.refundReason || !ticket.userId) return null;
  const payment = await Payment.findOne({ _id: ticket.paymentId, userId: ticket.userId });
  if (!payment) return null;
  const observed = ticket.channel === 'email' && ticket.context.receivedAt ? new Date(ticket.context.receivedAt) : ticket.createdAt;
  const receivedAt = Number.isFinite(new Date(observed).getTime()) && observed <= ticket.createdAt ? observed : ticket.createdAt;
  const evidence = await refundEvidence(payment, new Date(), { requestedAt: receivedAt });
  const request = await RefundRequest.findOneAndUpdate({ ticketId: ticket._id }, { $setOnInsert: {
    userId: ticket.userId, paymentId: payment._id, ticketId: ticket._id, reason: ticket.context.refundReason,
    receivedAt, evidence
  } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await SupportTicket.updateOne({ _id: ticket._id }, { $set: { refundRequestId: request._id } });
  return request;
}
export async function createSupportRequest(req, body) {
  const user = req.user?.id ? await User.findById(req.user.id).select('name email plan planOverride storageUsedBytes onboardingCompletedAt').lean() : null;
  if (!user && (!body.name || !body.email)) throw supportError('Enter your name and the email we should reply to.');
  const email = String(user?.email || body.email).trim().toLowerCase();
  const requestKey = crypto.createHash('sha256').update(`${user?._id || email}:${body.requestKey}`).digest('hex');
  let ticket = await SupportTicket.findOne({ requestKey });
  if (!ticket) {
    const category = body.refundReason ? 'billing' : body.category || categoryForSubject(body.subject);
    const publicId = deliveryPublicId(body.deliveryPublicId);
    const candidateId = body.deliveryId || body.context?.workflow?.deliveryId;
    const delivery = user && (publicId || candidateId) ? await Delivery.findOne({ userId: user._id, ...(candidateId ? { _id: candidateId } : { publicId }) }).select('_id publicId').lean() : null;
    const payment = body.paymentId && user ? await Payment.findOne({ _id: body.paymentId, userId: user._id }).select('_id reference paidAt amountKobo status').lean() : null;
    if (body.paymentId && !payment) throw supportError('Choose a payment from your own account.');
    if (body.refundReason && !payment) throw supportError('Choose the payment you want reviewed. If you cannot sign in, email payment@veylo.com.ng.');
    const entitlements = user ? await resolveEntitlements(user) : null;
    const context = { ...(body.includeDiagnostics ? { browser: safeBrowser(req), page: freshAssistantContext(body.context), account: entitlements ? { plan: entitlements.plan, storageUsedBytes: user.storageUsedBytes || 0, paidThrough: entitlements.subscription?.paidThrough || null } : null } : {}),
      expected: supportText(body.expected, 1000), startedAt: supportText(body.startedAt, 120), refundReason: body.refundReason,
      paymentReference: payment?.reference || '', paymentStatus: payment?.status || '' };
    try { ticket = await SupportTicket.create({ requestKey, userId: user?._id, requesterName: supportText(user?.name || body.name, 100), requesterEmail: email,
      subject: supportText(body.subject, 160), category, mailbox: category === 'billing' ? 'billing' : 'general', channel: body.channel,
      paymentId: payment?._id, deliveryId: delivery?._id, deliveryPublicId: delivery?.publicId || publicId, context,
      messages: [{ authorType: 'requester', channel: body.channel, message: supportText(body.message) }]
    }); } catch (error) { if (error.code !== 11000) throw error; ticket = await SupportTicket.findOne({ requestKey }); }
  }
  await ensureRefundRequest(ticket);
  return ticket;
}
export async function appendSupportMessage(ticketId, { message, authorType, adminId, internal = false, channel = 'web', requestKey, emailMessageId, createdAt = new Date() }) {
  const item = { _id: new mongoose.Types.ObjectId(), message: supportText(message), authorType, adminId, internal, channel, requestKey, emailMessageId, createdAt,
    ...(authorType === 'admin' && !internal ? { deliveryStatus: 'queued' } : {}) };
  const set = authorType === 'requester' ? { lastRequesterAt: createdAt, status: 'open', resolvedAt: null, closedAt: null } : !internal ? { lastResponseAt: createdAt } : {};
  const ticket = await SupportTicket.findOneAndUpdate({ _id: ticketId, ...(requestKey ? { 'messages.requestKey': { $ne: requestKey } } : {}) }, { $push: { messages: item }, $set: set }, { new: true });
  if (!ticket) return SupportTicket.findById(ticketId);
  if (item.deliveryStatus) await SupportOutbox.updateOne({ messageId: item._id }, { $setOnInsert: { ticketId, messageId: item._id, status: 'queued' } }, { upsert: true });
  return ticket;
}
