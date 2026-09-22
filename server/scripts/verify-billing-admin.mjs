import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBillingSnapshot } from '../src/services/billingEntitlement.service.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const projectRoot = resolve(serverRoot, '..');
const read = path => readFile(resolve(path), 'utf8');
const now = new Date('2026-09-22T12:00:00.000Z');
const future = new Date('2026-10-01T12:00:00.000Z');
const recent = new Date('2026-09-25T12:00:00.000Z');
const past = new Date('2026-09-20T12:00:00.000Z');

const adminRoutes = await read('src/routes/admin.routes.js');
const adminController = await read('src/controllers/admin.controller.js');
const billingController = await read('src/controllers/billing.controller.js');
const retentionService = await read('src/services/retention.service.js');
const adminPage = await read(resolve(projectRoot, 'admin/src/pages/AdminDashboardPage.jsx'));

assert.match(adminRoutes, /billing\/health/);
assert.match(adminRoutes, /billing\/resync.*billingActionLimit.*requireAdminRoles\('superadmin', 'operations', 'finance'\)/);
assert.match(adminRoutes, /billing\/verify-payment.*billingActionLimit.*requireAdminRoles\('superadmin', 'operations', 'finance'\)/);
assert.match(adminRoutes, /billing\/provider-refresh.*billingActionLimit.*requireAdminRoles\('superadmin', 'finance'\)/);
assert.match(adminController, /billing\.entitlement_resynced/);
assert.match(adminController, /billing\.payment_verified_by_admin/);
assert.match(adminController, /billing\.provider_refreshed/);
assert.match(adminController, /cancellationRequested/);
assert.match(adminController, /Payment\.distinct\('userId'/);
assert.match(adminPage, /Billing control room/);
assert.match(adminPage, /Resync Veylo access/);
assert.match(adminPage, /Verify payment/);
assert.match(adminPage, /Check Paystack/);
assert.match(billingController, /invoice\.payment_failed/);
assert.match(billingController, /grantPro\(user\._id\)/);
assert.match(retentionService, /anotherPaidSubscription/);

const active = buildBillingSnapshot(
  { _id: 'active', plan: 'pro' },
  [{ _id: 'subscription-active', status: 'active', paidThrough: future }],
  { now }
);
assert.equal(active.effectivePlan, 'pro');
assert.equal(active.state, 'pro');

const grace = buildBillingSnapshot(
  { _id: 'grace', plan: 'pro' },
  [{ _id: 'subscription-grace', status: 'past_due', graceEndsAt: future }],
  { now }
);
assert.equal(grace.state, 'grace_period');
assert.ok(grace.accessReasons.includes('payment_grace'));

const canceling = buildBillingSnapshot(
  { _id: 'canceling', plan: 'pro' },
  [{ _id: 'subscription-canceling', status: 'canceling', paidThrough: future }],
  { now }
);
assert.equal(canceling.state, 'canceling');

const stalePro = buildBillingSnapshot(
  { _id: 'stale', plan: 'pro' },
  [{ _id: 'subscription-expired', status: 'active', paidThrough: past }],
  { now }
);
assert.ok(stalePro.issues.some(item => item.code === 'pro_without_valid_access'));
assert.ok(stalePro.issues.some(item => item.code === 'active_subscription_expired'));

const missedUpgrade = buildBillingSnapshot(
  { _id: 'missed-upgrade', plan: 'free' },
  [{ _id: 'subscription-valid', status: 'active', paidThrough: future }],
  { now }
);
assert.ok(missedUpgrade.issues.some(item => item.code === 'paid_access_marked_free'));

const paymentWithoutAccess = buildBillingSnapshot(
  { _id: 'missing-access', plan: 'free' },
  [],
  { now, payments: [{ _id: 'payment', reference: 'veylo_payment', status: 'success', amountKobo: 2500000, paidAt: recent }] }
);
assert.ok(paymentWithoutAccess.issues.some(item => item.code === 'successful_payment_without_access'));
assert.equal(paymentWithoutAccess.paymentToVerify.reference, 'veylo_payment');

const missedRenewalFailure = buildBillingSnapshot(
  { _id: 'missed-renewal', plan: 'pro' },
  [{ _id: 'subscription-renewal', status: 'active', paidThrough: future }],
  { now, billingEvents: [{ eventType: 'invoice.payment_failed', status: 'processed', createdAt: future }] }
);
assert.ok(missedRenewalFailure.issues.some(item => item.code === 'renewal_failure_not_reflected'));

const expiredGrant = buildBillingSnapshot(
  { _id: 'expired-grant', plan: 'pro', planOverride: { plan: 'pro', expiresAt: past } },
  [],
  { now }
);
assert.ok(expiredGrant.issues.some(item => item.code === 'expired_manual_grant'));

console.log('Billing admin contract passed: entitlement states, mismatch detection, provider repair routes, audit hooks, and expiry safeguards are present.');
