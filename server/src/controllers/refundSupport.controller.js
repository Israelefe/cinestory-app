import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import RefundRequest from '../models/RefundRequest.js';
import Refund from '../models/Refund.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import BillingEvent from '../models/BillingEvent.js';
import AdminAudit from '../models/AdminAudit.js';
import User from '../models/User.js';
import SupportTicket from '../models/SupportTicket.js';
import { REFUND_REASONS } from '../models/RefundRequest.js';
import { refundEvidence } from '../services/paidUsage.service.js';
import { requestReviewedRefund } from '../services/billingRefund.service.js';
import { appendSupportMessage, ensureRefundRequest, supportError } from '../services/support.service.js';
import { stopAccountRenewals } from '../services/billingCancellation.service.js';
import { withBillingLock } from '../services/billingLock.service.js';
import { paystackRequest } from '../services/paystack.service.js';
import { processStoredBillingEvent, processWebhookEvent } from './billing.controller.js';

const id = value => mongoose.isValidObjectId(value) ? String(value) : null;
const wrap = handler => async (req, res) => { try { await handler(req, res); } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'We could not complete this billing review. Please try again.' }); } };
const adminId = req => req.admin?._id || req.admin?.id;
export const linkSupportRefund = wrap(async (req, res) => {
  const parsed = z.object({ reference: z.string().trim().min(3).max(160), reason: z.enum(REFUND_REASONS), ownershipVerified: z.literal(true), verificationNote: z.string().trim().min(10).max(500) }).strict().safeParse(req.body);
  if (!parsed.success || !id(req.params.id)) throw supportError('Verify the account owner and record the payment reference and review reason.');
  const ticket = await SupportTicket.findById(req.params.id), payment = await Payment.findOne({ reference: parsed.data.reference });
  const user = payment ? await User.findById(payment.userId).select('email') : null;
  if (!ticket || !payment || !user || user.email.toLowerCase() !== ticket.requesterEmail) throw supportError('The payment must belong to the verified requester’s account.', 409);
  const request = await withBillingLock(payment.userId, async () => {
    const current = await SupportTicket.findById(ticket._id);
    if (current.refundRequestId) return RefundRequest.findById(current.refundRequestId);
    current.userId = payment.userId; current.paymentId = payment._id; current.category = 'billing'; current.mailbox = 'billing';
    current.context = { ...current.context, refundReason: parsed.data.reason, ownershipVerifiedBy: String(adminId(req)), ownershipVerifiedAt: new Date() };
    await current.save();
    return ensureRefundRequest(current);
  });
  await AdminAudit.create({ adminId: adminId(req), userId: payment.userId, action: 'refund.request_linked', resourceType: 'RefundRequest', resourceId: String(request._id), details: { ticketId: ticket._id, verificationNote: parsed.data.verificationNote } });
  res.status(201).json({ success: true, data: { id: request._id } });
});
export const listRefundRequests = wrap(async (req, res) => {
  const filter = ['open', 'needs-information', 'approved', 'declined'].includes(req.query.status) ? { status: req.query.status } : {};
  const [requests, total, attention, webhooks, cancellations, missingAccess, disputes] = await Promise.all([
    RefundRequest.find(filter).populate('userId', 'name email').populate('paymentId', 'reference amountKobo currency paidAt status').populate('ticketId', 'ticketNumber').populate('refundId', 'status amountKobo updatedAt').sort({ receivedAt: 1 }).limit(100).lean(),
    RefundRequest.countDocuments(filter),
    Refund.find({ status: { $in: ['uncertain', 'needs-attention', 'failed', 'pending', 'processing'] } }).select('userId paymentId amountKobo status updatedAt').sort({ updatedAt: 1 }).limit(50).lean(),
    BillingEvent.find({ status: { $in: ['failed', 'received'] } }).select('eventType status attempts createdAt updatedAt').sort({ createdAt: 1 }).limit(30).lean(),
    Subscription.find({ cancelPendingAt: { $ne: null }, accountDeletedAt: null }).select('userId status cancelRequestedAt cancelPendingAt paidThrough').sort({ cancelPendingAt: 1 }).limit(30).lean(),
    Payment.find({ status: 'success', fulfilledAt: null, accountDeletedAt: null }).select('userId reference paidAt amountKobo status').sort({ paidAt: 1 }).limit(30).lean(),
    Payment.find({ status: 'disputed' }).select('userId reference amountKobo disputeId disputeResolvedAt updatedAt').sort({ updatedAt: 1 }).limit(30).lean()
  ]);
  res.json({ success: true, data: { requests, total, attention, webhooks, cancellations, missingAccess, disputes, generatedAt: new Date() } });
});
export const readRefundRequest = wrap(async (req, res) => {
  if (!id(req.params.id)) throw supportError('Invalid refund request.');
  const request = await RefundRequest.findById(req.params.id).lean();
  if (!request) throw supportError('Refund request not found.', 404);
  const payment = await Payment.findById(request.paymentId).lean();
  if (!payment) throw supportError('Payment not found.', 404);
  const [evidence, subscriptions, payments, refunds, account] = await Promise.all([
    refundEvidence(payment, new Date(), { requestedAt: request.receivedAt }),
    Subscription.find({ userId: request.userId }).select('status paidFrom paidThrough cancelRequestedAt canceledAt providerCanceledAt cancelPendingAt resumePendingAt createdAt').sort({ createdAt: -1 }).limit(25).lean(),
    Payment.find({ userId: request.userId }).select('reference amountKobo status paidAt periodEnd refundedAmountKobo fulfilledAt').sort({ paidAt: -1 }).limit(25).lean(),
    Refund.find({ paymentId: request.paymentId }).select('-providerSnapshot').sort({ createdAt: -1 }).lean(),
    User.findById(request.userId).select('name email plan accountStatus').lean()
  ]);
  res.json({ success: true, data: { request, payment, evidence, subscriptions, payments, refunds, account,
    accessImpact: { fullRefund: 'Removes access funded by this payment. Newer valid paid access is preserved.', partialRefund: 'Does not automatically end Pro access.', renewal: 'Cancellation is a separate action.' } } });
});
const decisionSchema = z.object({ action: z.enum(['approve', 'decline', 'needs-information']), note: z.string().trim().min(10).max(500), customerNote: z.string().trim().min(10).max(1000),
  requestKey: z.uuid(), amountKobo: z.number().int().positive().optional(), cancelRenewal: z.boolean().default(false)
}).strict();
export const decideRefundRequest = wrap(async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success || !id(req.params.id)) throw supportError('Record an internal reason and a separate message for the customer.');
  const request = await RefundRequest.findById(req.params.id);
  if (!request) throw supportError('Refund request not found.', 404);
  const body = parsed.data;
  let refund;
  if (body.action === 'approve') refund = await requestReviewedRefund({ paymentId: request.paymentId, refundRequestId: request._id, policyReason: request.reason,
    reason: body.note, customerNote: body.customerNote, requestKey: body.requestKey, amountKobo: body.amountKobo, adminId: adminId(req) });
  else await withBillingLock(request.userId, async () => {
    const current = await RefundRequest.findById(request._id);
    if (current.status === 'approved') throw supportError('An approved refund cannot be declined or reopened.', 409);
    current.status = body.action === 'decline' ? 'declined' : 'needs-information'; current.decisionNote = body.note; current.customerNote = body.customerNote;
    current.decidedAt = new Date(); current.decidedBy = adminId(req); await current.save();
  });
  let cancellationPending = false;
  if (body.action === 'approve' && body.cancelRenewal) {
    try { await withBillingLock(request.userId, () => stopAccountRenewals(request.userId)); } catch { cancellationPending = true; }
  }
  const update = body.action === 'approve' ? `${body.customerNote}\n\nRefund status: ${refund.status}. ${cancellationPending ? 'Renewal cancellation still needs confirmation.' : body.cancelRenewal ? 'Future renewal has been stopped.' : 'Renewal cancellation was not requested.'}` : body.customerNote;
  await appendSupportMessage(request.ticketId, { authorType: 'admin', adminId: adminId(req), message: update, requestKey: `refund-decision:${body.requestKey}` });
  await AdminAudit.create({ adminId: adminId(req), userId: request.userId, action: `refund.request_${body.action}`, resourceType: 'RefundRequest', resourceId: String(request._id), details: { reason: body.note, cancelRenewal: body.cancelRenewal, cancellationPending, refundId: refund?._id } });
  res.status(body.action === 'approve' ? 202 : 200).json({ success: true, data: { refund, cancellationPending }, message: 'Decision saved. The customer update is queued for email.' });
});
export const cancelAdminRenewals = wrap(async (req, res) => {
  if (!id(req.params.id) || typeof req.body?.reason !== 'string' || req.body.reason.trim().length < 10) throw supportError('Record the customer request or reason for stopping renewal.');
  await withBillingLock(req.params.id, () => stopAccountRenewals(req.params.id));
  await AdminAudit.create({ adminId: adminId(req), userId: req.params.id, action: 'billing.renewal_stopped', resourceType: 'User', resourceId: req.params.id, details: { reason: req.body.reason.trim().slice(0, 500) } });
  res.json({ success: true, message: 'Renewal cancellation confirmed. Existing paid access is preserved.' });
});
export const retryAdminBillingEvent = wrap(async (req, res) => {
  if (!id(req.params.id)) throw supportError('Invalid billing event.');
  const event = await BillingEvent.findOne({ _id: req.params.id, status: { $in: ['failed', 'received'] } });
  if (!event) throw supportError('Only failed or waiting billing events can be retried.', 409);
  await processStoredBillingEvent(event._id);
  await AdminAudit.create({ adminId: adminId(req), action: 'billing.event_retry', resourceType: 'BillingEvent', resourceId: String(event._id) });
  res.json({ success: true, message: 'Billing event checked again.' });
});
export const refreshAdminRefund = wrap(async (req, res) => {
  if (!id(req.params.id)) throw supportError('Invalid refund.');
  const refund = await Refund.findById(req.params.id), payment = refund ? await Payment.findById(refund.paymentId) : null;
  if (!refund || !payment) throw supportError('Refund not found.', 404);
  let provider;
  if (refund.providerId) provider = await paystackRequest(`/refund/${encodeURIComponent(refund.providerId)}`);
  else if (payment.providerTransactionId) {
    const rows = await paystackRequest(`/refund?transaction=${encodeURIComponent(payment.providerTransactionId)}&perPage=100`);
    const matches = (rows || []).filter(row => Number(row.amount) === refund.amountKobo && row.merchant_note?.includes(refund.requestKey));
    if (matches.length === 1) provider = matches[0];
  }
  if (!provider) throw supportError('Paystack has not confirmed this refund. Review it in Paystack before any new submission.', 409);
  await processWebhookEvent({ event: `refund.${provider.status}`, data: { ...provider, transaction_reference: payment.reference } }, `admin-refund-check:${crypto.randomUUID()}`);
  await AdminAudit.create({ adminId: adminId(req), action: 'refund.provider_checked', resourceType: 'Refund', resourceId: String(refund._id) });
  res.json({ success: true, message: 'Refund status checked with Paystack.' });
});
export const customerRefundBanks = wrap(async (_req, res) => {
  const banks = await paystackRequest('/bank?currency=NGN&country=nigeria&perPage=100');
  res.json({ success: true, data: (banks || []).map(bank => ({ id: bank.id, name: bank.name })) });
});
export const submitCustomerRefundBank = wrap(async (req, res) => {
  const schema = z.object({ accountNumber: z.string().regex(/^\d{10}$/), bankId: z.string().regex(/^\d{1,10}$/) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !id(req.params.id)) throw supportError('Choose your bank and enter a 10-digit account number.');
  const confirmed = await withBillingLock(req.user.id, async () => {
    const refund = await Refund.findOne({ _id: req.params.id, userId: req.user.id, status: 'needs-attention' });
    if (!refund?.providerId) throw supportError('This refund is not waiting for bank details.', 409);
    const payment = await Payment.findById(refund.paymentId);
    const current = await paystackRequest(`/refund/${encodeURIComponent(refund.providerId)}`);
    if (current.status !== 'needs-attention') throw supportError('Paystack is no longer waiting for bank details. Refresh your refund status.', 409);
    const result = await paystackRequest(`/refund/retry_with_customer_details/${encodeURIComponent(refund.providerId)}`, { method: 'POST', body: { refund_account_details: { currency: 'NGN', account_number: parsed.data.accountNumber, bank_id: parsed.data.bankId } } });
    return { result, reference: payment.reference, refundId: refund._id };
  });
  await processWebhookEvent({ event: `refund.${confirmed.result.status}`, data: { ...confirmed.result, transaction_reference: confirmed.reference } }, `customer-bank:${confirmed.refundId}`);
  res.json({ success: true, message: 'Bank details sent securely to Paystack. They were not saved in your support messages.' });
});
