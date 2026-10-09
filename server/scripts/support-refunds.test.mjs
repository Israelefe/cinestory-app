import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { before, after, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Payment from '../src/models/Payment.js';
import Subscription from '../src/models/Subscription.js';
import SupportTicket from '../src/models/SupportTicket.js';
import SupportOutbox from '../src/models/SupportOutbox.js';
import SupportInbound from '../src/models/SupportInbound.js';
import SupportMailbox from '../src/models/SupportMailbox.js';
import RefundRequest from '../src/models/RefundRequest.js';
import Refund from '../src/models/Refund.js';
import PaidUsage from '../src/models/PaidUsage.js';
import BillingLock from '../src/models/BillingLock.js';
import AdminAudit from '../src/models/AdminAudit.js';
import { createSupportTicket, readCustomerSupport, replyCustomerSupport, listAdminSupport, readAdminSupport, editAdminSupport, retrySupportEmail, addSupportAttachment, downloadSupportAttachment } from '../src/controllers/support.controller.js';
import { readRefundRequest, decideRefundRequest, linkSupportRefund, submitCustomerRefundBank } from '../src/controllers/refundSupport.controller.js';
import { supportCreateSchema, createSupportRequest, categoryForSubject, appendSupportMessage } from '../src/services/support.service.js';
import { importSupportEmail, runSupportMaintenance, supportMailboxHealth, mailboxConfig } from '../src/services/supportMail.service.js';
import { refundEvidence, recordPaidUsage } from '../src/services/paidUsage.service.js';
import { supportHandoffActions } from '../src/controllers/assistant.controller.js';
import { requestReviewedRefund } from '../src/services/billingRefund.service.js';
import { requireAdminRoles } from '../src/routes/admin.routes.js';

let mongo, owner, other, payment, admin, calls;
const realFetch = globalThis.fetch;
const models = [User, Payment, Subscription, SupportTicket, SupportOutbox, SupportInbound, SupportMailbox, RefundRequest, Refund, PaidUsage, BillingLock, AdminAudit];
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
async function invoke(handler, options = {}) { const res = response(); await handler({ user: { id: String(owner._id) }, admin, headers: { 'user-agent': 'Chrome/140 Mobile' }, params: {}, query: {}, body: {}, ...options }, res); return res; }
const body = overrides => ({ subject: 'Upload problem', message: 'My finished photograph will not upload. Please help.', requestKey: crypto.randomUUID(), ...overrides });
async function ticket(overrides = {}) { return createSupportRequest({ user: { id: String(owner._id) }, headers: {} }, supportCreateSchema.parse(body(overrides))); }
before(async () => {
  process.env.NODE_ENV = 'test'; process.env.BILLING_ENCRYPTION_KEY = 'test-support-encryption-key-not-production'; process.env.PAYSTACK_SECRET_KEY = 'sk_test_support';
  delete process.env.SUPPORT_IMAP_HOST; delete process.env.RESEND_API_KEY;
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all(models.map(model => model.init()));
  globalThis.fetch = async (url, options = {}) => { assert.equal(new URL(url).hostname, 'api.paystack.co'); calls.push({ url, body: options.body ? JSON.parse(options.body) : null }); return Response.json({ status: true, data: { id: 301, status: 'processing' } }); };
});
beforeEach(async () => {
  await Promise.all(models.map(model => model.collection.deleteMany({})));
  owner = await User.create({ name: 'Ada Studio', email: 'ada@example.test', passwordHash: 'test-hash', accountStatus: 'active', emailVerifiedAt: new Date() });
  other = await User.create({ name: 'Other Studio', email: 'other@example.test', passwordHash: 'test-hash', accountStatus: 'active', emailVerifiedAt: new Date() });
  const paidAt = new Date(Date.now() - 86400000);
  payment = await Payment.create({ userId: owner._id, reference: `test_${crypto.randomUUID()}`, status: 'success', amountKobo: 4000000, currency: 'NGN', paidAt, periodEnd: new Date(Date.now() + 29 * 86400000), fulfilledAt: paidAt });
  admin = { _id: new mongoose.Types.ObjectId(), role: 'superadmin' }; calls = [];
});
after(async () => { globalThis.fetch = realFetch; await mongoose.disconnect(); await mongo.stop(); });

test('intake uses verified account identity and classifies Upload problem correctly', async () => {
  assert.equal(categoryForSubject('Upload problem'), 'upload');
  const res = await invoke(createSupportTicket, { body: body({ name: 'Forged name', email: 'attacker@example.test' }) });
  assert.equal(res.code, 201);
  const saved = await SupportTicket.findById(res.body.data.id);
  assert.equal(saved.requesterEmail, owner.email); assert.equal(saved.requesterName, owner.name); assert.equal(saved.category, 'upload');
  assert.deepEqual(saved.context.browser, { browser: 'Chrome', device: 'Phone' });
});
test('untrusted context and another account’s payment never become support evidence', async () => {
  const bad = body({ context: { page: '/billing', capturedAt: Date.now(), workflow: { password: 'private-secret' }, recent: [] } });
  assert.equal((await invoke(createSupportTicket, { body: bad })).code, 400);
  const res = await invoke(createSupportTicket, { user: { id: String(other._id) }, body: body({ paymentId: String(payment._id), refundReason: 'duplicate-charge' }) });
  assert.equal(res.code, 400); assert.equal(await SupportTicket.countDocuments(), 0);
});
test('repeated and concurrent intake creates one ticket and one linked refund request', async () => {
  const input = body({ subject: 'Veylo Pro', paymentId: String(payment._id), refundReason: 'change-of-mind' });
  const rows = await Promise.all(Array.from({ length: 4 }, () => invoke(createSupportTicket, { body: input })));
  assert.ok(rows.every(row => row.code === 201), JSON.stringify(rows));
  assert.equal(new Set(rows.map(row => row.body.data.id.toString())).size, 1);
  assert.equal(await SupportTicket.countDocuments(), 1); assert.equal(await RefundRequest.countDocuments(), 1);
});
test('seven-day eligibility uses received time even when staff reviews on day nine', async () => {
  const paidAt = new Date('2026-09-01T10:00:00Z'), requestedAt = new Date('2026-09-07T10:00:00Z'), now = new Date('2026-09-10T10:00:00Z');
  payment.paidAt = paidAt; payment.periodEnd = new Date('2026-10-01T10:00:00Z'); await payment.save();
  assert.equal((await refundEvidence(payment, now, { requestedAt })).eligibleForChangeOfMind, true);
  assert.equal((await refundEvidence(payment, now)).withinSevenDays, false);
  assert.equal((await refundEvidence(payment, now, { requestedAt: new Date('2026-08-31') })).withinSevenDays, false);
  assert.equal((await refundEvidence(payment, now, { requestedAt: new Date('2026-09-11') })).withinSevenDays, false);
});
test('pending historical records do not count as the first paid payment', async () => {
  await Payment.create({ userId: owner._id, reference: 'failed-old', status: 'failed', amountKobo: 4000000, paidAt: new Date(Date.now() - 5 * 86400000) });
  const evidence = await refundEvidence(payment); assert.equal(evidence.firstPayment, true); assert.equal(evidence.coverage, 'manual-review');
});
test('retained usage shows kind and date without exposing resource identifiers', async () => {
  await recordPaidUsage(owner._id, 'portfolio', 'private-resource-name');
  const evidence = await refundEvidence(payment); assert.equal(evidence.eligibleForChangeOfMind, false); assert.equal(evidence.usageByKind.portfolio, 1);
  assert.equal(evidence.timeline[0].kind, 'portfolio'); assert.doesNotMatch(JSON.stringify(evidence), /private-resource-name/);
});
test('customer conversations exclude staff notes, diagnostics, admin IDs and other customers', async () => {
  const saved = await ticket();
  await appendSupportMessage(saved._id, { authorType: 'admin', adminId: admin._id, internal: true, message: 'Private investigation note', requestKey: crypto.randomUUID() });
  await appendSupportMessage(saved._id, { authorType: 'admin', adminId: admin._id, message: 'Please retry the one failed photograph.', requestKey: crypto.randomUUID() });
  const res = await invoke(readCustomerSupport, { params: { id: String(saved._id) } });
  const text = JSON.stringify(res.body); assert.doesNotMatch(text, /Private investigation|adminId|context|deliveryStatus/); assert.match(text, /retry the one/);
  assert.equal((await invoke(readCustomerSupport, { user: { id: String(other._id) }, params: { id: String(saved._id) } })).code, 404);
  assert.equal((await invoke(replyCustomerSupport, { user: { id: String(other._id) }, params: { id: String(saved._id) }, body: { message: 'Wrong account', requestKey: crypto.randomUUID() } })).code, 404);
});
test('customer replies are idempotent and reopen a resolved conversation', async () => {
  const saved = await ticket(); await SupportTicket.updateOne({ _id: saved._id }, { $set: { status: 'resolved' } });
  const input = { message: 'It still does not upload.', requestKey: crypto.randomUUID() };
  await Promise.all(Array.from({ length: 3 }, () => invoke(replyCustomerSupport, { params: { id: String(saved._id) }, body: input })));
  const updated = await SupportTicket.findById(saved._id); assert.equal(updated.messages.length, 2); assert.equal(updated.status, 'open');
});
test('a staff reply queues once, reaches the customer inbox, and notes never enter the email outbox', async () => {
  const saved = await ticket(), input = { message: 'We checked your account and need the upload error.', requestKey: crypto.randomUUID() };
  await invoke(editAdminSupport, { params: { id: String(saved._id) }, body: input }); await invoke(editAdminSupport, { params: { id: String(saved._id) }, body: input });
  await invoke(editAdminSupport, { params: { id: String(saved._id) }, body: { message: 'Private staff context', internal: true, requestKey: crypto.randomUUID() } });
  assert.equal(await SupportOutbox.countDocuments(), 1);
  const deliveries = [];
  await runSupportMaintenance({ transport: async mail => deliveries.push(mail) }); await runSupportMaintenance({ transport: async mail => deliveries.push(mail) });
  assert.equal(deliveries.length, 1); assert.equal(deliveries[0].to, owner.email); assert.doesNotMatch(deliveries[0].text, /Private staff/);
  assert.equal((await SupportOutbox.findOne()).status, 'sent');
});
test('an ambiguous SMTP result is preserved and never blindly sent twice', async () => {
  const saved = await ticket(); await appendSupportMessage(saved._id, { authorType: 'admin', message: 'Please try again now.', requestKey: crypto.randomUUID() });
  let attempts = 0; await runSupportMaintenance({ transport: async () => { attempts++; throw new Error('Timeout after sending'); } });
  await runSupportMaintenance({ transport: async () => { attempts++; } });
  const row = await SupportOutbox.findOne(); assert.equal(row.status, 'uncertain'); assert.equal(attempts, 1);
  const res = await invoke(retrySupportEmail, { params: { id: String(saved._id) }, body: { messageId: String(row.messageId), reason: 'Reviewed mailbox history' } });
  assert.equal(res.code, 400);
});
test('mail import is idempotent, renders text only, and never grants account access from a sender address', async () => {
  const parsed = { messageId: '<original@example.test>', from: { value: [{ address: owner.email, name: owner.name }] }, subject: 'Please review my payment', text: 'I was charged twice for Pro.', html: '<script>alert(1)</script><img src="https://track.example">' };
  const receivedAt = new Date(Date.now() - 5 * 86400000);
  const saved = await importSupportEmail({ mailbox: 'billing', sourceKey: 'billing:1:1', parsed, receivedAt });
  await importSupportEmail({ mailbox: 'billing', sourceKey: 'billing:1:1', parsed, receivedAt });
  await importSupportEmail({ mailbox: 'billing', sourceKey: 'billing:2:1', parsed, receivedAt });
  assert.equal(await SupportTicket.countDocuments(), 1); assert.equal(saved.userId, undefined); assert.doesNotMatch(JSON.stringify(saved), /<script>|track.example/);
  const linked = await invoke(linkSupportRefund, { params: { id: String(saved._id) }, body: { reference: payment.reference, reason: 'duplicate-charge', ownershipVerified: true, verificationNote: 'Verified the customer through their signed-in account.' } });
  assert.equal(linked.code, 201); assert.equal((await RefundRequest.findById(linked.body.data.id)).receivedAt.toISOString(), receivedAt.toISOString());
});
test('email replies require a matching opaque outbound reference and requester', async () => {
  const saved = await ticket(); await appendSupportMessage(saved._id, { authorType: 'admin', message: 'Could you share the error?', requestKey: crypto.randomUUID() });
  await runSupportMaintenance({ transport: async () => {} }); const outbound = await SupportOutbox.findOne();
  await importSupportEmail({ mailbox: 'general', sourceKey: 'general:1:1', parsed: { messageId: '<reply@example.test>', inReplyTo: outbound.emailMessageId, from: { value: [{ address: owner.email }] }, text: 'The upload says connection failed.' } });
  assert.equal((await SupportTicket.findById(saved._id)).messages.length, 3);
  await importSupportEmail({ mailbox: 'general', sourceKey: 'general:1:2', parsed: { messageId: '<attacker@example.test>', inReplyTo: outbound.emailMessageId, from: { value: [{ address: other.email }] }, text: 'Pretending to be the owner.' } });
  assert.equal((await SupportTicket.findById(saved._id)).messages.length, 3); assert.equal(await SupportTicket.countDocuments(), 2);
});
test('finance cannot browse general mail and support staff cannot read billing email or approve refunds', async () => {
  const saved = await importSupportEmail({ mailbox: 'billing', sourceKey: 'billing:1:1', parsed: { from: { value: [{ address: owner.email }] }, text: 'Payment problem' } });
  assert.equal((await invoke(readAdminSupport, { admin: { ...admin, role: 'support' }, params: { id: String(saved._id) } })).code, 404);
  assert.equal((await invoke(listAdminSupport, { admin: { ...admin, role: 'finance' }, query: { mailbox: 'general' } })).code, 403);
  const res = response(); let next = false; requireAdminRoles('superadmin', 'finance')({ admin: { role: 'support' } }, res, () => { next = true; }); assert.equal(res.code, 403); assert.equal(next, false);
});
test('support totals cover all matching records, and urgent requests sort before high priority', async () => {
  await SupportTicket.insertMany(Array.from({ length: 40 }, (_, index) => ({ requesterName: 'Customer', requesterEmail: `customer${index}@example.test`, subject: `Issue ${index}`, priority: index === 39 ? 'urgent' : 'high', messages: [{ authorType: 'requester', message: 'Help please' }] })));
  const res = await invoke(listAdminSupport); assert.equal(res.body.data.total, 40); assert.equal(res.body.data.summary.open, 40); assert.equal(res.body.data.tickets.length, 30); assert.equal(res.body.data.tickets[0].priority, 'urgent');
});

test('existing billing conversations keep their original dates and appear for finance', async () => {
  const createdAt = new Date('2026-09-01T12:00:00Z'), messageId = new mongoose.Types.ObjectId();
  const legacy = await SupportTicket.collection.insertOne({ ticketNumber: 'VT-LEGACY', requesterName: owner.name, requesterEmail: owner.email, userId: owner._id, subject: 'Old payment question', category: 'billing', status: 'open', priority: 'normal', createdAt, updatedAt: createdAt, messages: [{ _id: messageId, authorType: 'requester', message: 'Please check my payment.', createdAt }] });
  const response = await invoke(listAdminSupport, { admin: { ...admin, role: 'finance' } });
  assert.equal(response.body.data.total, 1); assert.equal(response.body.data.tickets[0].mailbox, 'billing');
  const saved = await SupportTicket.findById(legacy.insertedId); assert.equal(saved.createdAt.toISOString(), createdAt.toISOString()); assert.equal(saved.updatedAt.toISOString(), createdAt.toISOString()); assert.equal(String(saved.messages[0]._id), String(messageId));
});
test('used service does not block a duplicate-charge exception; internal notes are never sent to Paystack as customer copy', async () => {
  const saved = await ticket({ subject: 'Veylo Pro', paymentId: String(payment._id), refundReason: 'duplicate-charge' });
  await recordPaidUsage(owner._id, 'storage', 'used-file'); const review = await RefundRequest.findOne({ ticketId: saved._id });
  const res = await invoke(decideRefundRequest, { params: { id: String(review._id) }, body: { action: 'approve', note: 'INTERNAL: duplicate verified against two successful charges.', customerNote: 'We confirmed the duplicate charge and approved this refund.', requestKey: crypto.randomUUID(), amountKobo: 4000000 } });
  assert.equal(res.code, 202, JSON.stringify(res.body)); assert.equal((await RefundRequest.findById(review._id)).status, 'approved');
  const provider = calls.find(call => call.url.endsWith('/refund')); assert.doesNotMatch(provider.body.customer_note, /INTERNAL/); assert.match(provider.body.customer_note, /confirmed the duplicate/);
  const evidence = (await invoke(readRefundRequest, { params: { id: String(review._id) } })).body.data.evidence; assert.equal(evidence.eligibleForChangeOfMind, false);
});
test('Assistant offers human handoff for direct requests, failed fixes and insufficient answers', () => {
  assert.equal(supportHandoffActions([{ role: 'user', content: 'Please open my support inbox.' }])[0].reason, 'open-inbox');
  assert.equal(supportHandoffActions([{ role: 'user', content: 'Please send a message to support for me.' }])[0].reason, 'requested');
  assert.equal(supportHandoffActions([{ role: 'user', content: 'That did not work.' }]).length, 1);
  assert.equal(supportHandoffActions([{ role: 'user', content: 'Why did payment fail?' }], 'I cannot confirm this. Contact Veylo support.').length, 1);
  assert.equal(supportHandoffActions([{ role: 'user', content: 'What is Pro?' }], 'Pro costs ₦40,000/month.').length, 0);
});
test('unconfigured mailboxes are visibly unconnected rather than reported as healthy', async () => {
  const health = await supportMailboxHealth(); assert.ok(health.mailboxes.every(item => item.status === 'not-configured' && !item.lastSuccessAt));
});

test('the two cPanel accounts keep their own secure hostnames', () => {
  process.env.SUPPORT_GENERAL_IMAP_HOST = 's4.whitelabelclouds.com'; process.env.SUPPORT_GENERAL_SMTP_HOST = 's4.whitelabelclouds.com';
  process.env.SUPPORT_BILLING_IMAP_HOST = 'mail.veylo.com.ng'; process.env.SUPPORT_BILLING_SMTP_HOST = 'mail.veylo.com.ng';
  try { assert.equal(mailboxConfig('general').host, 's4.whitelabelclouds.com'); assert.equal(mailboxConfig('billing').smtpHost, 'mail.veylo.com.ng'); assert.equal(mailboxConfig('billing').smtpPort, 465); }
  finally { for (const key of ['SUPPORT_GENERAL_IMAP_HOST', 'SUPPORT_GENERAL_SMTP_HOST', 'SUPPORT_BILLING_IMAP_HOST', 'SUPPORT_BILLING_SMTP_HOST']) delete process.env[key]; }
});

test('a stopped mail worker cannot leave an old successful sync looking healthy', async () => {
  process.env.SUPPORT_GENERAL_IMAP_HOST = 's4.whitelabelclouds.com'; process.env.SUPPORT_GENERAL_PASSWORD = 'test-only-password';
  try {
    await SupportMailbox.create({ mailbox: 'general', status: 'connected', lastSuccessAt: new Date(Date.now() - 600000), lastAttemptAt: new Date(Date.now() - 600000) });
    const health = await supportMailboxHealth(); assert.equal(health.mailboxes.find(item => item.mailbox === 'general').status, 'stale');
  } finally { delete process.env.SUPPORT_GENERAL_IMAP_HOST; delete process.env.SUPPORT_GENERAL_PASSWORD; }
});

test('screenshots reject another account and disguised executable content before storage', async () => {
  const saved = await ticket(), params = { id: String(saved._id), attachmentId: String(new mongoose.Types.ObjectId()) };
  assert.equal((await invoke(addSupportAttachment, { user: { id: String(other._id) }, params, file: { buffer: Buffer.from('private') } })).code, 404);
  assert.equal((await invoke(downloadSupportAttachment, { admin: null, user: { id: String(other._id) }, params })).code, 404);
  assert.equal((await invoke(addSupportAttachment, { params, file: { mimetype: 'image/png', buffer: Buffer.from('<svg onload="alert(1)"></svg>') } })).code, 400);
});

test('bank details are restricted to the owner and forwarded without persisting them', async () => {
  const saved = await ticket({ subject: 'Veylo Pro', paymentId: String(payment._id), refundReason: 'duplicate-charge' });
  const review = await RefundRequest.findOne({ ticketId: saved._id });
  const refund = await Refund.create({ userId: owner._id, paymentId: payment._id, amountKobo: 4000000, requestKey: crypto.randomUUID(), status: 'needs-attention', providerId: '301' });
  await RefundRequest.updateOne({ _id: review._id }, { $set: { status: 'approved', refundId: refund._id } });
  const input = { accountNumber: '0123456789', bankId: '9' }, params = { id: String(refund._id) };
  assert.equal((await invoke(submitCustomerRefundBank, { user: { id: String(other._id) }, params, body: input })).code, 409);
  assert.equal(calls.length, 0);
  globalThis.fetch = async (url, options = {}) => { assert.equal(new URL(url).hostname, 'api.paystack.co'); calls.push({ url, body: options.body ? JSON.parse(options.body) : null }); return Response.json({ status: true, data: { id: 301, amount: 4000000, currency: 'NGN', refund_account_details: { account_number: '0123456789' }, status: options.method === 'POST' ? 'processing' : 'needs-attention', transaction_reference: payment.reference } }); };
  try {
    const response = await invoke(submitCustomerRefundBank, { params, body: input }); assert.equal(response.code, 200, JSON.stringify(response.body));
    const submitted = calls.find(call => call.url.includes('retry_with_customer_details')); assert.equal(submitted.body.refund_account_details.account_number, input.accountNumber);
    for (const model of [Refund, RefundRequest, SupportTicket, AdminAudit]) assert.doesNotMatch(JSON.stringify(await model.find({}).select('+providerSnapshot').lean()), /0123456789/);
    assert.equal((await Refund.findById(refund._id)).status, 'processing');
  } finally { globalThis.fetch = async (url, options = {}) => { calls.push({ url, body: options.body ? JSON.parse(options.body) : null }); return Response.json({ status: true, data: { id: 301, status: 'processing' } }); }; }
});
