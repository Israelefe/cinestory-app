import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Portfolio from '../src/models/Portfolio.js';
import PortfolioMedia from '../src/models/PortfolioMedia.js';
import PortfolioEnquiry from '../src/models/PortfolioEnquiry.js';
import Subscription from '../src/models/Subscription.js';
import Payment from '../src/models/Payment.js';
import Refund from '../src/models/Refund.js';
import BillingEvent from '../src/models/BillingEvent.js';
import BillingLock from '../src/models/BillingLock.js';
import EmailDelivery from '../src/models/EmailDelivery.js';
import PaidUsage from '../src/models/PaidUsage.js';
import Delivery from '../src/models/Delivery.js';
import AdminUser from '../src/models/AdminUser.js';
import AdminSession from '../src/models/AdminSession.js';
import jwt from 'jsonwebtoken';
import { adminAuthMiddleware, requireAdminRoles } from '../src/routes/admin.routes.js';
import { tokenDigest } from '../src/utils/auth.js';
import { getFinanceOverview, getAdminAnalytics, reconcileFinanceWithPaystack, exportFinance } from '../src/controllers/admin.controller.js';
import { deleteUserAccount } from '../src/services/accountDeletion.service.js';
import { buildBillingSnapshot } from '../src/services/billingEntitlement.service.js';
import { migrateBillingRecords } from '../src/services/billingMigration.service.js';
import { runBillingMaintenance } from '../src/services/billingWorker.service.js';
import { startCheckout, reconcilePayment, activateSubscription, verifyCheckout, paystackWebhook, processWebhookEvent, addOneMonth, cancelSubscription, resumeSubscription, getManageLink } from '../src/controllers/billing.controller.js';
import { resolveEntitlements } from '../src/services/entitlement.service.js';
import { requestReviewedRefund } from '../src/services/billingRefund.service.js';
import { refundEvidence, recordPaidUsage } from '../src/services/paidUsage.service.js';
import { encryptBillingToken, decryptBillingToken } from '../src/services/paystack.service.js';
import { resolveEdgeClientIp } from '../src/middleware/clientIp.middleware.js';
import { proPricing, redactBillingSnapshot } from '../src/services/billingPricing.service.js';
import { stopAccountRenewals } from '../src/services/billingCancellation.service.js';
import { retryBillingEmails } from '../src/services/email.service.js';
let mongo, owner, calls, provider, initialized, transportFailure;
const realFetch = globalThis.fetch;
process.env.NODE_ENV = 'test';
process.env.BILLING_ENABLED = 'true';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_regression_only';
process.env.PAYSTACK_PRO_PLAN_CODE = 'PLN_pro';
process.env.BILLING_ENCRYPTION_KEY = 'regression-only-encryption-value-never-live';
process.env.CLIENT_URL = 'https://veylo.example';
process.env.RESEND_API_KEY = 're_regression_only';
process.env.VEYLO_EDGE_KEY = 'regression-edge-only';
function response() { return { code: 200, body: null, headers: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set(key, value) { if (typeof key === 'object') Object.assign(this.headers, key); else this.headers[key] = value; return this; }, send(body) { this.body = body; return this; }, sendStatus(code) { this.code = code; return this; } }; }
async function invoke(handler, options = {}) { const res = response(); await handler({ user: { id: String(owner._id) }, body: {}, params: {}, ...options }, res); return res; }
async function checkout(country) { return invoke(startCheckout, { billingCountry: country, body: { quote: proPricing().quote } }); }
async function paid(amountKobo = 2500000, overrides = {}) {
  const reference = `veylo_${crypto.randomBytes(16).toString('hex')}`;
  const subscription = await Subscription.create({ userId: owner._id, amountKobo, currency: 'NGN', planCode: amountKobo === 2500000 ? 'PLN_local' : 'PLN_international', status: 'checkout_pending', checkoutReference: reference, ...overrides });
  await Payment.create({ userId: owner._id, subscriptionId: subscription._id, reference, amountKobo, currency: 'NGN' });
  const data = { id: 401, reference, status: 'success', domain: 'test', amount: amountKobo, currency: 'NGN', paid_at: new Date().toISOString(), customer: { id: 8, email: owner.email, customer_code: 'CUS_owner' }, plan: { plan_code: subscription.planCode }, subscription: { subscription_code: 'SUB_owner', email_token: 'private_provider_token' }, fees: 5000 };
  provider.set(`/transaction/verify/${reference}`, data);
  provider.set('/subscription/SUB_owner', { status: 'active', email_token: 'private_provider_token', plan: { plan_code: subscription.planCode }, customer: data.customer });
  await activateSubscription({ data, user: owner, subscription });
  return { data, subscription: await Subscription.findById(subscription._id), payment: await Payment.findOne({ reference }) };
}
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  await Promise.all([User, Subscription, Payment, Refund, BillingEvent, BillingLock, EmailDelivery, PaidUsage].map(model => model.init()));
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ path: url.pathname + url.search, method: init.method || 'GET', body });
    if (url.hostname === 'api.resend.com') {
      if (transportFailure) throw new Error('Mock email outage');
      return new Response(JSON.stringify({ id: 'email-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.equal(url.hostname, 'api.paystack.co', 'No external network calls are allowed in this suite');
    if (url.pathname.startsWith('/plan/')) {
      const code = decodeURIComponent(url.pathname.slice('/plan/'.length));
      const plan = provider.get(url.pathname) || { id: code === 'PLN_pro' ? 3 : code === 'PLN_international' ? 2 : 1, plan_code: code, amount: code === 'PLN_pro' ? 4000000 : code === 'PLN_international' ? 3000000 : 2500000, currency: 'NGN', interval: 'monthly' };
      return new Response(JSON.stringify({ status: true, data: plan }));
    }
    if (url.pathname === '/transaction/initialize') {
      initialized++;
      assert.ok(await Payment.exists({ reference: body.reference }), 'payment saved before contacting provider');
      await new Promise(resolve => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ status: true, data: { reference: body.reference, authorization_url: `https://checkout.paystack.com/${body.reference}` } }));
    }
    if (url.pathname === '/subscription/disable' || url.pathname === '/subscription/enable') {
      const current = provider.get(`/subscription/${body.code}`);
      if (current) current.status = url.pathname.endsWith('disable') ? 'non-renewing' : 'active';
      return new Response(JSON.stringify({ status: true, data: {} }));
    }
    const value = provider.get(url.pathname + url.search) ?? provider.get(url.pathname);
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error(`Unexpected mock provider request: ${url.pathname}${url.search}`);
    return new Response(JSON.stringify({ status: true, data: value }), { headers: { 'content-type': 'application/json' } });
  };
});

test('equal ID-less refund notifications refresh provider IDs when a second refund completes', async () => {
  const { data, payment } = await paid();
  const rows = [{ id: 191, transaction: 401, amount: 100000, currency: 'NGN', status: 'processed', domain: 'test' }];
  provider.set('/refund?transaction=401&perPage=100&page=1', rows);
  const raw = Buffer.from(JSON.stringify({ event: 'refund.processed', data: { transaction_reference: data.reference, refund_reference: null, amount: '100000', currency: 'NGN', domain: 'test' } }));
  const req = { body: raw, get: () => crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex') };
  await paystackWebhook(req, response());
  rows.push({ ...rows[0], id: 192 });
  await paystackWebhook(req, response());
  assert.equal((await Payment.findById(payment._id)).refundedAmountKobo, 200000);
  assert.equal(await Refund.countDocuments({ status: 'processed' }), 2);
});

test('a provider-declared failed refund releases its reservation and stale pending events do not reopen it', async () => {
  const { payment } = await paid();
  provider.set('/refund', { id: 501, status: 'failed', amount: payment.amountKobo, currency: 'NGN' });
  const result = await requestReviewedRefund({ paymentId: payment._id, reason: 'Duplicate payment verified by support', requestKey: crypto.randomUUID(), adminId: new mongoose.Types.ObjectId() });
  assert.equal(result.status, 'failed');
  assert.equal((await Payment.findById(payment._id)).refundPendingAmountKobo, 0);
  await processWebhookEvent({ event: 'refund.pending', data: { id: 501, transaction_reference: payment.reference, amount: payment.amountKobo, currency: 'NGN' } });
  assert.equal((await Refund.findById(result._id)).status, 'failed');
  assert.equal((await Payment.findById(payment._id)).refundPendingAmountKobo, 0);
});

test('failed cancellation remains pending and the worker retries it without removing paid access', async () => {
  const { subscription } = await paid();
  const current = provider.get('/subscription/SUB_owner');
  provider.set('/subscription/SUB_owner', new Error('Mock cancellation outage'));
  const res = await invoke(cancelSubscription);
  assert.equal(res.code, 502);
  assert.ok((await Subscription.findById(subscription._id)).cancelPendingAt);
  assert.equal((await resolveEntitlements(owner)).plan, 'pro');
  provider.set('/subscription/SUB_owner', current);
  await runBillingMaintenance();
  const recovered = await Subscription.findById(subscription._id);
  assert.equal(recovered.status, 'canceling');
  assert.equal(recovered.cancelPendingAt, null);
  assert.ok(recovered.providerCanceledAt);
});

test('expired schedules cannot resume and unsupported provider links never grant access', async () => {
  const { subscription } = await paid();
  await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'canceling', paidThrough: new Date(Date.now() - 1), providerCanceledAt: new Date() } });
  const result = await invoke(resumeSubscription);
  assert.equal(result.code, 409);
  assert.equal(calls.filter(call => call.path === '/subscription/enable').length, 0);
  assert.equal((await resolveEntitlements(owner)).plan, 'free');
});

test('deleting a published delivery preserves its original usage date', async () => {
  const { payment } = await paid();
  const publishedAt = new Date(Date.now() + 10);
  const delivery = await Delivery.create({ userId: owner._id, status: 'published', brief: 'Finished birthday portraits', publishedAt });
  await Delivery.findByIdAndDelete(delivery._id);
  assert.equal(await Delivery.countDocuments({}), 0);
  const evidence = await PaidUsage.findOne({ userId: owner._id, kind: 'delivery' });
  assert.equal(evidence.usedAt.toISOString(), publishedAt.toISOString());
  assert.equal((await refundEvidence(payment)).eligibleForChangeOfMind, false);
});

test('account deletion stops provider billing and retains a restricted financial ledger', async () => {
  const { payment, subscription } = await paid();
  const portfolio = await Portfolio.create({ userId: owner._id, handle: 'amara-studio', profileMedia: [{ id: 'profile-one', publicId: 'studio/profile-one' }], content: { profile: { portraitId: 'profile-one' } } });
  await PortfolioMedia.create({ publicId: 'studio/profile-one' });
  await PortfolioEnquiry.create({ userId: owner._id, portfolioId: portfolio._id, requestId: crypto.randomUUID(), fingerprint: 'test-fingerprint', name: 'Ada', replyMethod: 'email', replyTo: 'ada@example.test', shootType: 'Portraits', message: 'I would like a portrait session.' });
  await recordPaidUsage(owner._id, 'delivery', 'historical-deleted-delivery');
  const result = await deleteUserAccount({ userId: owner._id });
  assert.equal(result.deleted.financialRecordsRetained, true);
  assert.equal(await User.findById(owner._id), null);
  const retained = await Payment.findById(payment._id).select('+providerSnapshot');
  assert.ok(retained.accountDeletedAt && retained.retainUntil > new Date());
  assert.equal(retained.providerSnapshot, undefined);
  const schedule = await Subscription.findById(subscription._id).select('+emailTokenEncrypted');
  assert.ok(schedule.providerCanceledAt);
  assert.equal(schedule.emailTokenEncrypted, undefined);
  assert.equal(await EmailDelivery.countDocuments({ userId: owner._id }), 0);
  assert.equal(await PortfolioEnquiry.countDocuments({ userId: owner._id }), 0);
  assert.equal(await PortfolioMedia.countDocuments({ publicId: 'studio/profile-one' }), 0);
  assert.ok((await PaidUsage.findOne({ userId: owner._id })).retainUntil);
});

test('resolved disputes require provider verification, and late creation cannot undo that resolution', async () => {
  const { data, payment } = await paid();
  await processWebhookEvent({ event: 'charge.dispute.create', data: { id: 61, transaction: { reference: data.reference } } });
  assert.equal((await resolveEntitlements(owner)).plan, 'free');
  provider.set('/dispute/61', { id: 61, status: 'resolved', resolution: 'declined', transaction: { reference: data.reference } });
  await processWebhookEvent({ event: 'charge.dispute.resolve', data: { id: 61, transaction: { reference: data.reference } } });
  assert.equal((await Payment.findById(payment._id)).status, 'success');
  assert.equal((await resolveEntitlements(owner)).plan, 'pro');
  await processWebhookEvent({ event: 'charge.dispute.create', data: { id: 61, transaction: { reference: data.reference } } });
  assert.equal((await Payment.findById(payment._id)).status, 'success');
  await processWebhookEvent({ event: 'charge.dispute.create', data: { id: 62, transaction: { reference: data.reference } } });
  assert.equal((await Payment.findById(payment._id)).status, 'disputed');
});

test('a verified reversal revokes only the affected current paid period', async () => {
  const { data, payment } = await paid();
  provider.set('/transaction/verify/' + data.reference, { ...data, status: 'reversed' });
  assert.equal(await reconcilePayment(payment), true);
  assert.equal((await Payment.findById(payment._id)).providerStatus, 'reversed');
  assert.equal((await resolveEntitlements(owner)).plan, 'free');
});

test('maintenance recovers an orphaned checkout and purges expired deleted ledger records with billing disabled', async () => {
  const orphan = await Subscription.create({ userId: owner._id, status: 'checkout_pending', createdAt: new Date(Date.now() - 300000) });
  await runBillingMaintenance();
  assert.equal((await Subscription.findById(orphan._id)).status, 'expired');
  const ledger = await Payment.create({ userId: owner._id, reference: 'deleted-expired', amountKobo: 2500000, accountDeletedAt: new Date(Date.now() - 1000), retainUntil: new Date(0) });
  process.env.BILLING_ENABLED = 'false';
  try { await runBillingMaintenance(); } finally { process.env.BILLING_ENABLED = 'true'; }
  assert.equal(await Payment.findById(ledger._id), null);
});

test('owner MRR uses recorded subscription amounts and excludes canceled or unsupported Pro access', async () => {
  await Subscription.create({ userId: owner._id, status: 'active', amountKobo: 2500000, paidThrough: addOneMonth() });
  await Subscription.create({ userId: new mongoose.Types.ObjectId(), status: 'active', amountKobo: 3000000, paidThrough: addOneMonth() });
  await Subscription.create({ userId: new mongoose.Types.ObjectId(), status: 'canceling', amountKobo: 3000000, paidThrough: addOneMonth(), cancelRequestedAt: new Date() });
  await User.updateOne({ _id: owner._id }, { $set: { plan: 'pro' } });
  const res = response(); await getAdminAnalytics({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.monthlyRecurringRevenueKobo, 5500000);
  assert.equal(res.body.data.activeSubscriptions, 2);
});

test('finance aggregates all records, discloses table limits and records provider fees separately', async () => {
  const now = new Date();
  await Payment.insertMany(Array.from({ length: 251 }, (_, i) => ({ userId: owner._id, reference: 'finance-' + i, status: 'success', amountKobo: i % 2 ? 3000000 : 2500000, paidAt: now, feesKobo: i === 250 ? undefined : 5000 })));
  const res = response(); await getFinanceOverview({ query: { days: '30' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.summary.total, 251);
  assert.equal(res.body.data.payments.length, 250);
  assert.equal(res.body.data.listsTruncated.payments, true);
  assert.equal(res.body.data.summary.providerFeesKobo, 1250000);
  assert.equal(res.body.data.summary.paymentsMissingFees, 1);
});

test('reconciliation checks both directions, currency, amount and legitimate refund reversals', async () => {
  await Payment.insertMany([
    { userId: owner._id, reference: 'refunded', status: 'refunded', amountKobo: 2500000, refundedAmountKobo: 2500000 },
    { userId: owner._id, reference: 'mismatch', status: 'success', amountKobo: 3000000 },
    { userId: owner._id, reference: 'only-local', status: 'pending', amountKobo: 2500000 }
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => new URL(input).pathname === '/transaction' ? new Response(JSON.stringify({ status: true, data: [
    { reference: 'refunded', status: 'reversed', amount: 2500000, currency: 'NGN' },
    { reference: 'mismatch', status: 'failed', amount: 2500000, currency: 'USD' },
    { reference: 'only-provider', status: 'success', amount: 2500000, currency: 'NGN' }
  ] })) : originalFetch(input, init);
  try {
    const res = response(); await reconcileFinanceWithPaystack({ query: { days: '30' } }, res);
    assert.equal(res.body.data.status, 'complete');
    assert.equal(res.body.data.missingLocal[0].reference, 'only-provider');
    assert.equal(res.body.data.missingProvider[0].reference, 'only-local');
    assert.equal(res.body.data.amountMismatches.length, 1);
    assert.equal(res.body.data.currencyMismatches.length, 1);
    assert.equal(res.body.data.statusMismatches.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('finance export escapes spreadsheet formulas in account fields', async () => {
  await User.updateOne({ _id: owner._id }, { $set: { name: '=SUM(1,2)' } });
  await Payment.create({ userId: owner._id, reference: 'export-check', status: 'success', amountKobo: 2500000 });
  const res = response(); await exportFinance({ query: { days: '30' } }, res);
  assert.ok(res.body.includes('"' + "'=SUM(1,2)" + '"'));
});

test('admin mutations reject cookie-only authentication and financial actions reject support roles', async () => {
  process.env.JWT_SECRET = 'regression-session-only-secret';
  const admin = await AdminUser.create({ username: 'finance-test', name: 'Finance reviewer', password: 'isolated-test-password', role: 'finance', accountStatus: 'active' });
  const id = new mongoose.Types.ObjectId();
  const token = jwt.sign({ id: String(admin._id), sid: String(id) }, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-admin', expiresIn: '1h' });
  await AdminSession.create({ _id: id, adminId: admin._id, tokenDigest: tokenDigest(token), expiresAt: new Date(Date.now() + 3600000) });
  let next = 0;
  const cookie = response(); await adminAuthMiddleware({ method: 'POST', headers: {}, cookies: { veylo_admin_token: token } }, cookie, () => next++);
  assert.equal(cookie.code, 403); assert.equal(next, 0);
  const bearer = response(); await adminAuthMiddleware({ method: 'POST', headers: { authorization: 'Bearer ' + token }, cookies: {} }, bearer, () => next++);
  assert.equal(next, 1);
  const denied = response(); requireAdminRoles('superadmin', 'finance')({ admin: { role: 'support' } }, denied, () => next++);
  assert.equal(denied.code, 403); assert.equal(next, 1);
});

test('invalid signatures and malformed signed webhooks create no billing work', async () => {
  const raw = Buffer.from('{bad json');
  const invalid = response(); await paystackWebhook({ body: raw, get: () => 'forged' }, invalid);
  assert.equal(invalid.code, 401);
  const malformed = response(); await paystackWebhook({ body: raw, get: () => crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex') }, malformed);
  assert.equal(malformed.code, 400); assert.equal(await BillingEvent.countDocuments({}), 0);
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.models).map(model => model.collection.deleteMany({})));
  calls = []; provider = new Map(); initialized = 0; transportFailure = false;
  owner = await User.create({ name: 'Amara', email: 'amara@example.test', accountStatus: 'active', emailVerifiedAt: new Date() });
});
after(async () => { await new Promise(resolve => setTimeout(resolve, 100)); globalThis.fetch = realFetch; await mongoose.disconnect(); await mongo?.stop(); });

test('checkout uses one NGN price regardless of visitor location', async () => {
  for (const country of ['NG', 'US', null]) {
    const res = await checkout(country); assert.equal(res.code, 201); assert.equal(res.body.data.amountKobo, 4000000);
    const payment = await Payment.findOne({}); assert.equal(payment.amountKobo, 4000000); assert.equal(payment.currency, 'NGN');
    const subscription = await Subscription.findOne({}); assert.equal(subscription.planCode, 'PLN_pro'); assert.equal(subscription.amountKobo, 4000000);
    assert.equal(calls.find(call => call.path === '/transaction/initialize').body.amount, 4000000);
    assert.equal(calls.find(call => call.path === '/transaction/initialize').body.plan, 'PLN_pro');
    await Subscription.deleteMany({}); await Payment.deleteMany({}); await BillingLock.deleteMany({}); calls = [];
  }
  assert.equal(initialized, 3);
});
test('a stale price quote cannot initiate a charge', async () => {
  const changed = await invoke(startCheckout, { billingCountry: 'US', body: { quote: 'pro:3990000', amount: 1 } });
  assert.equal(changed.body.code, 'PRICE_CHANGED'); assert.equal(initialized, 0);
});
test('edge identity accepts only a matching key and valid visitor IP, with no billing-country field', () => {
  const probe = headers => { const req = { headers, get(key) { return this.headers[key]; } }; resolveEdgeClientIp(req, {}, () => {}); return req; };
  const forged = probe({ 'x-veylo-country': 'NG', 'cf-ipcountry': 'NG' }); assert.equal(forged.billingCountry, undefined);
  assert.equal(probe({ 'x-veylo-country': 'US', 'x-veylo-edge-key': 'wrong', 'x-veylo-client-ip': '203.0.113.1' }).billingCountry, undefined);
  const trusted = probe({ 'x-veylo-country': 'US', 'x-veylo-edge-key': process.env.VEYLO_EDGE_KEY, 'x-veylo-client-ip': '203.0.113.1' });
  assert.equal(trusted.headers['x-forwarded-for'], '203.0.113.1'); assert.equal(trusted.billingCountry, undefined);
});
test('concurrent and repeated checkout requests initialize only one payment', async () => {
  const results = await Promise.all([checkout(), checkout()]); assert.ok(results.some(result => result.code === 201));
  assert.equal(initialized, 1); assert.equal(await Payment.countDocuments({}), 1);
  const again = await checkout(); assert.equal(again.code, 201); assert.equal(initialized, 1);
});
test('a legacy subscription verifies against its recorded amount and rejects another account', async () => {
  const { data } = await paid(3000000);
  const res = await invoke(verifyCheckout, { params: { reference: data.reference } });
  assert.equal(res.body.confirmed, true); assert.equal(res.body.data.subscription.amountKobo, 3000000); assert.equal(res.body.data.payments.length, 1);
  const other = new mongoose.Types.ObjectId(); const denied = await invoke(verifyCheckout, { user: { id: String(other) }, params: { reference: data.reference } }); assert.equal(denied.code, 404);
});
test('a legacy renewal moves to ₦40,000 only after its stored Paystack plan is updated', async () => {
  const { data, subscription } = await paid(2500000, { planProviderId: '1' });
  const renewal = { ...data, reference: 'veylo_upgrade_renewal', amount: 4000000, paid_at: new Date(Date.now() + 86400000).toISOString() };
  const mismatched = await activateSubscription({ data: renewal, user: owner, subscription }); assert.equal(mismatched, null);
  provider.set('/plan/PLN_local', { id: 1, plan_code: 'PLN_local', amount: 4000000, currency: 'NGN', interval: 'monthly' });
  const updated = await activateSubscription({ data: renewal, user: owner, subscription });
  assert.equal(updated.amountKobo, 4000000);
  assert.equal((await Payment.findOne({ reference: renewal.reference })).amountKobo, 4000000);
});
test('refund, dispute and cancellation survive replayed success', async () => {
  const { data, subscription } = await paid();
  await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'canceling', cancelRequestedAt: new Date(), providerCanceledAt: new Date() } });
  await activateSubscription({ data, user: owner, subscription });
  assert.equal((await Subscription.findById(subscription._id)).status, 'canceling');
  for (const status of ['refunded', 'partially_refunded', 'disputed']) {
    await Payment.updateOne({ reference: data.reference }, { $set: { status } });
    await activateSubscription({ data, user: owner, subscription }); assert.equal((await Payment.findOne({ reference: data.reference })).status, status);
  }
  assert.equal(await EmailDelivery.countDocuments({}), 1);
});
test('old payment replay cannot shorten newer paid access', async () => {
  const { data, subscription } = await paid();
  const later = new Date(Date.now() + 20 * 86400000), end = addOneMonth(later);
  await Subscription.updateOne({ _id: subscription._id }, { $set: { paidFrom: later, paidThrough: end, lastPaymentAt: later, lastPaymentReference: 'renewal-newer' } });
  await activateSubscription({ data, user: owner, subscription }); assert.equal((await Subscription.findById(subscription._id)).paidThrough.toISOString(), end.toISOString());
});
test('provider customer, plan, amount, currency and environment mismatches do not grant access', async () => {
  const checkoutResult = await checkout(); const payment = await Payment.findOne({ reference: checkoutResult.body.data.reference }); const subscription = await Subscription.findById(payment.subscriptionId);
  const data = { reference: payment.reference, amount: 4000000, currency: 'NGN', paid_at: new Date().toISOString(), customer: { email: owner.email }, plan: { plan_code: 'PLN_pro' } };
  for (const change of [{ amount: 3000000 }, { currency: 'USD' }, { customer: { email: 'stranger@example.test' } }, { plan: { plan_code: 'PLN_unrelated' } }, { plan: 99 }, { domain: 'live' }]) assert.equal(await activateSubscription({ data: { ...data, ...change }, user: owner, subscription }), null);
  assert.equal((await resolveEntitlements(owner)).plan, 'free');
});
test('a failed webhook is leased and retried instead of permanently acknowledged', async () => {
  const { data, subscription } = await paid();
  const renewal = { ...data, reference: 'renewal_reference', paid_at: new Date(Date.now() + 86400000).toISOString() };
  await BillingLock.updateOne({ _id: owner._id }, { $set: { leaseUntil: new Date(Date.now() + 60000) } });
  const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: renewal }));
  const req = { body: raw, get: () => crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex') };
  const first = response(); await paystackWebhook(req, first); assert.equal(first.code, 500);
  await BillingLock.updateOne({ _id: owner._id }, { $set: { leaseUntil: new Date(0) } });
  const retry = response(); await paystackWebhook(req, retry); assert.equal(retry.code, 200);
  assert.equal((await BillingEvent.findOne({})).attempts, 2); assert.equal((await Subscription.findById(subscription._id)).lastPaymentReference, 'renewal_reference');
});
test('renewal grace stays anchored to the invoice and older failure cannot undo a newer charge', async () => {
  const { subscription } = await paid(); const due = new Date(Date.now() - 86400000);
  await Subscription.updateOne({ _id: subscription._id }, { $set: { paidThrough: due, lastPaymentAt: new Date(due - 30 * 86400000) } });
  const data = { subscription: { subscription_code: 'SUB_owner' }, period_start: due.toISOString() };
  await processWebhookEvent({ event: 'invoice.payment_failed', data }, 'failure-1'); const first = await Subscription.findById(subscription._id);
  await processWebhookEvent({ event: 'invoice.payment_failed', data }, 'failure-2'); const second = await Subscription.findById(subscription._id);
  assert.equal(second.graceEndsAt.toISOString(), first.graceEndsAt.toISOString()); assert.equal(second.graceEndsAt - due, 3 * 86400000);
  await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'active', lastPaymentAt: new Date(), paidThrough: addOneMonth() } });
  await processWebhookEvent({ event: 'invoice.payment_failed', data }, 'old-failure'); assert.equal((await Subscription.findById(subscription._id)).status, 'active');
});
test('documented refund payload with null reference resolves IDs and never double-counts', async () => {
  const { data, payment } = await paid();
  provider.set('/refund?transaction=401&perPage=100&page=1', [{ id: 91, transaction: 401, amount: 100000, currency: 'NGN', status: 'processed', domain: 'test' }]);
  const event = { event: 'refund.processed', data: { transaction_reference: data.reference, refund_reference: null, amount: '100000', currency: 'NGN', domain: 'test' } };
  await processWebhookEvent(event); await processWebhookEvent(event);
  assert.equal((await Payment.findById(payment._id)).refundedAmountKobo, 100000); assert.equal(await Refund.countDocuments({}), 1);
});
test('two equal partial refunds are distinct, and late pending events cannot undo completion', async () => {
  const { data, payment } = await paid();
  for (const id of [101, 102]) await processWebhookEvent({ event: 'refund.processed', data: { id, transaction_reference: data.reference, amount: 100000, currency: 'NGN' } });
  await processWebhookEvent({ event: 'refund.pending', data: { id: 101, transaction_reference: data.reference, amount: 100000, currency: 'NGN' } });
  assert.equal((await Payment.findById(payment._id)).refundedAmountKobo, 200000); assert.equal((await Refund.findOne({ providerId: '101' })).status, 'processed');
});
test('refunding an older period does not revoke a newer paid period', async () => {
  const { data, subscription } = await paid();
  await Subscription.updateOne({ _id: subscription._id }, { $set: { lastPaymentReference: 'newer-period', lastPaymentAt: new Date(Date.now() + 1000) } });
  await processWebhookEvent({ event: 'refund.processed', data: { id: 104, transaction_reference: data.reference, amount: 2500000, currency: 'NGN' } });
  assert.equal((await Subscription.findById(subscription._id)).status, 'active'); assert.equal((await resolveEntitlements(owner)).plan, 'pro');
});
test('cancellation stops all schedules, retains paid time, is repeatable and resumes safely', async () => {
  const { subscription } = await paid();
  await Subscription.create({ userId: owner._id, status: 'past_due', subscriptionCode: 'SUB_old', customerCode: 'CUS_owner', planCode: 'PLN_local', paidThrough: new Date(Date.now() + 1000) });
  provider.set('/subscription/SUB_old', { status: 'attention', email_token: 'token2', customer: { customer_code: 'CUS_owner' }, plan: { plan_code: 'PLN_local' } });
  const canceled = await invoke(cancelSubscription); assert.equal(canceled.code, 200); assert.equal(canceled.body.data.plan, 'pro'); assert.equal(canceled.body.data.payments.length, 1);
  assert.equal(canceled.body.data.subscription.canManageCard, false);
  assert.equal(canceled.body.data.subscription.canResume, true);
  const management = await invoke(getManageLink);
  assert.equal(management.code, 409);
  assert.equal(calls.filter(call => call.path.endsWith('/manage/link')).length, 0);
  assert.equal(calls.filter(call => call.path === '/subscription/disable').length, 2);
  await invoke(cancelSubscription); assert.equal(calls.filter(call => call.path === '/subscription/disable').length, 2);
  const resumed = await invoke(resumeSubscription); assert.equal(resumed.code, 200); assert.equal((await Subscription.findById(subscription._id)).status, 'active');
  assert.equal(resumed.body.data.subscription.canManageCard, true);
  assert.equal(resumed.body.data.subscription.canResume, false);
  provider.set('/subscription/SUB_owner/manage/link', { link: 'https://paystack.com/manage/test-subscription' });
  assert.equal((await invoke(getManageLink)).code, 200);
});
test('payment management remains available during payment grace for a renewing subscription', async () => {
  const { subscription } = await paid();
  await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'past_due', paidThrough: new Date(Date.now() - 1000), graceEndsAt: new Date(Date.now() + 86400000) } });
  const entitlement = await resolveEntitlements(owner);
  assert.equal(entitlement.plan, 'pro');
  assert.equal(entitlement.subscription.canManageCard, true);
  provider.set('/subscription/SUB_owner/manage/link', { link: 'https://paystack.com/manage/test-subscription' });
  assert.equal((await invoke(getManageLink)).code, 200);
});
test('expiry and an unsupported User.plan never grant indefinite access', async () => {
  await User.updateOne({ _id: owner._id }, { $set: { plan: 'pro' } });
  assert.equal((await resolveEntitlements(await User.findById(owner._id))).plan, 'free');
  await Subscription.create({ userId: owner._id, status: 'active', paidThrough: new Date(Date.now() - 1000) }); assert.equal((await resolveEntitlements(owner)).plan, 'free');
  owner.planOverride = { plan: 'pro', expiresAt: new Date(Date.now() + 10000) }; await owner.save(); assert.equal((await resolveEntitlements(owner)).plan, 'pro');
});
test('refund evidence persists after service records are deleted', async () => {
  const { payment } = await paid(); assert.equal((await refundEvidence(payment)).eligibleForChangeOfMind, true);
  await recordPaidUsage(owner._id, 'delivery', 'deleted-delivery'); assert.equal((await refundEvidence(payment)).eligibleForChangeOfMind, false);
});
test('uncertain refund requests keep a durable identity and cannot be submitted twice', async () => {
  const { payment } = await paid(); provider.set('/refund', new Error('Mock provider timeout'));
  const requestKey = crypto.randomUUID(), options = { paymentId: payment._id, reason: 'Duplicate charge confirmed by support', requestKey, adminId: new mongoose.Types.ObjectId() };
  const first = await requestReviewedRefund(options); assert.equal(first.status, 'uncertain');
  const retry = await requestReviewedRefund(options); assert.equal(String(retry._id), String(first._id));
  assert.equal(calls.filter(call => call.path === '/refund').length, 1); assert.equal((await Payment.findById(payment._id)).refundPendingAmountKobo, 2500000);
});
test('email outage leaves an encrypted retryable outbox and stable receipt key', async () => {
  transportFailure = true; await paid(); const record = await EmailDelivery.findOne({}).select('+messageEncrypted');
  assert.equal(record.status, 'failed'); assert.ok(record.messageEncrypted); assert.ok(!record.messageEncrypted.includes(owner.email));
  await EmailDelivery.updateOne({ _id: record._id }, { $set: { retryAfter: new Date(0) } }); transportFailure = false; await retryBillingEmails(); assert.equal((await EmailDelivery.findById(record._id)).status, 'sent');
});
test('month-end arithmetic and recursive redaction preserve only safe provider details', () => {
  assert.equal(addOneMonth('2024-01-31T12:00:00Z').toISOString(), '2024-02-29T12:00:00.000Z');
  assert.equal(addOneMonth('2025-01-31T12:00:00Z').toISOString(), '2025-02-28T12:00:00.000Z');
  const safe = redactBillingSnapshot({ email_token: 'secret', subscription: { email_token: 'secret', authorization: { authorization_code: 'secret', brand: 'visa' } } });
  assert.ok(!JSON.stringify(safe).includes('secret')); assert.equal(decryptBillingToken(encryptBillingToken('secret')), 'secret');
});
test('account lifecycle cannot proceed while a charge is pending', async () => {
  await checkout(); await assert.rejects(stopAccountRenewals(owner._id), /payment is still pending/);
});

test('legacy billing migration is read-only by default, preserves prices and encrypts old provider tokens when applied', async () => {
  const id = new mongoose.Types.ObjectId(), ref = 'legacy-migration';
  await Subscription.collection.insertOne({ _id: id, userId: owner._id, provider: 'paystack', status: 'active', subscriptionCode: 'SUB_legacy', checkoutReference: ref, lastPaymentReference: ref, paidThrough: addOneMonth(), providerSnapshot: { email_token: 'legacy-private-token', customer: { id: 99 }, plan: { id: 11, amount: 2500000, currency: 'NGN' } } });
  const payment = await Payment.create({ userId: owner._id, subscriptionId: id, reference: ref, amountKobo: 2500000, status: 'success', paidAt: new Date(), providerSnapshot: { id: 123, authorization: { authorization_code: 'legacy-card-secret' }, fees: 5000 } });
  const dry = await migrateBillingRecords();
  assert.equal(dry.mode, 'read-only'); assert.equal(dry.tokensEncrypted, 1);
  assert.equal((await Subscription.collection.findOne({ _id: id })).amountKobo, undefined);
  assert.equal((await Subscription.collection.findOne({ _id: id })).providerSnapshot.email_token, 'legacy-private-token');
  await migrateBillingRecords({ apply: true });
  const migrated = await Subscription.findById(id).select('+emailTokenEncrypted +providerSnapshot');
  assert.equal(migrated.amountKobo, 2500000); assert.equal(migrated.currency, 'NGN');
  assert.equal(migrated.customerProviderId, '99'); assert.equal(migrated.planProviderId, '11');
  assert.equal(decryptBillingToken(migrated.emailTokenEncrypted), 'legacy-private-token');
  assert.ok(!JSON.stringify(migrated.providerSnapshot).includes('legacy-private-token'));
  const saved = await Payment.findById(payment._id).select('+providerSnapshot');
  assert.equal(saved.providerTransactionId, '123'); assert.equal(saved.feesKobo, 5000);
  assert.ok(saved.fulfilledAt && saved.periodEnd); assert.ok(!JSON.stringify(saved.providerSnapshot).includes('legacy-card-secret'));
  const repeat = await migrateBillingRecords({ apply: true });
  assert.equal(repeat.subscriptionsUpdated + repeat.paymentsUpdated + repeat.eventsUpdated, 0);
});

test('legacy refund aggregates are resolved to provider IDs before another partial refund changes the total', async () => {
  const { payment } = await paid();
  await Payment.updateOne({ _id: payment._id }, { $set: { status: 'partially_refunded', refundedAmountKobo: 100000 } });
  provider.set('/refund?transaction=401&perPage=100&page=1', [
    { id: 701, transaction: 401, amount: 100000, currency: 'NGN', status: 'processed' },
    { id: 702, transaction: 401, amount: 50000, currency: 'NGN', status: 'processed' }
  ]);
  await processWebhookEvent({ event: 'refund.processed', data: { id: 702, transaction_reference: payment.reference, amount: 50000, currency: 'NGN' } });
  assert.equal((await Payment.findById(payment._id)).refundedAmountKobo, 150000);
  assert.equal(await Refund.countDocuments({ status: 'processed' }), 2);
});
