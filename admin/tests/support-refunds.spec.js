import { test, expect } from '../../client/node_modules/@playwright/test/index.mjs';
const now = new Date().toISOString(), ticketId = '222222222222222222222222', reviewId = '333333333333333333333333';
async function setup(page) {
  const writes = [];
  await page.addInitScript(() => localStorage.setItem('veylo_admin_token', 'test-only'));
  await page.route('**/api/v1/admin/**', route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1/admin/', '');
    if (path === 'auth/me') return route.fulfill({ json: { success: true, admin: { name: 'Ada', role: 'superadmin', sections: ['overview', 'users', 'support', 'payments'], mfaRequired: false } } });
    if (route.request().method() === 'PATCH' || route.request().method() === 'POST') { writes.push({ path, body: route.request().postDataJSON() }); return route.fulfill({ json: { success: true, message: 'Reply saved in the customer inbox and queued for email.', data: {} } }); }
    const ticket = { id: ticketId, ticketNumber: 'VT-TEST123', subject: 'Upload problem on my phone', requester: { name: 'Amara', email: 'amara@example.test' }, channel: 'assistant', mailbox: 'general', status: 'open', priority: 'high', hasUnread: true, createdAt: now, updatedAt: now, lastRequesterAt: now, waitingSince: now, accountId: '111111111111111111111111', messages: [{ _id: 'm1', authorType: 'requester', message: 'The upload stops halfway. Retrying did not help.', createdAt: now }, { _id: 'm2', authorType: 'admin', internal: true, message: 'Check the affected upload before replying.', createdAt: now }], context: { browser: { browser: 'Chrome', device: 'Phone' }, expected: 'Publish the finished shoot.', account: { plan: 'pro' } }, outbox: [], attachments: [], moderationActions: [] };
    if (path === 'support/tickets') return route.fulfill({ json: { success: true, data: { tickets: [ticket], summary: { total: 1 }, pages: 1, administrators: [{ _id: 'admin-a', name: 'Ada' }], mail: { mailboxes: [{ address: 'info@veylo.com.ng', mailbox: 'general', status: 'not-configured' }, { address: 'payment@veylo.com.ng', mailbox: 'billing', status: 'not-configured' }] } } } });
    if (path === `support/tickets/${ticketId}`) return route.fulfill({ json: { success: true, data: ticket } });
    if (path === 'refund-requests') return route.fulfill({ json: { success: true, data: { requests: [{ _id: reviewId, reason: 'duplicate-charge', status: 'open', receivedAt: now, paymentId: { amountKobo: 4000000 }, userId: { name: 'Amara', email: 'amara@example.test' }, ticketId: { ticketNumber: 'VT-TEST123' } }], total: 1, attention: [], webhooks: [], cancellations: [], missingAccess: [], disputes: [] } } });
    if (path === `refund-requests/${reviewId}`) return route.fulfill({ json: { success: true, data: { request: { _id: reviewId, status: 'open', reason: 'duplicate-charge', receivedAt: now, ticketId, policyVersion: '2026-10-09' }, payment: { reference: 'veylo_test_reference', amountKobo: 4000000 }, account: { name: 'Amara', email: 'amara@example.test' }, evidence: { firstPayment: true, withinSevenDays: true, eligibleForChangeOfMind: false, coverageNote: 'Historical activity may be incomplete. Review manually.', usageCounts: { recorded: 1, deliveries: 0, stories: 0, storage: true }, usageByKind: { delivery: 0, storage: 1, portfolio: 0 }, timeline: [{ id: 'usage-1', kind: 'storage', usedAt: now }], period: { start: now, end: now } }, payments: [], subscriptions: [], refunds: [] } } });
    if (path === 'finance') return route.fulfill({ json: { success: true, data: { summary: {}, payments: [], subscriptions: {}, events: [] } } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  return writes;
}
for (const width of [320, 768, 834, 1440]) test(`admin support and refund evidence fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page); await page.goto('/?section=support');
  await expect(page.getByRole('heading', { name: 'The support desk.' })).toBeVisible();
  await expect(page.getByText('Connection setup needed')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Upload problem on my phone/ }).click();
  await expect(page.getByText('Check the affected upload before replying.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../.visual-review/support/admin-thread-${width}.png`, fullPage: true });
  await page.goto(`/?section=payments&refundRequest=${reviewId}`);
  await expect(page.getByRole('heading', { name: 'Evidence for this paid period' })).toBeVisible();
  await expect(page.getByText('Historical activity may be incomplete. Review manually.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../.visual-review/support/admin-refund-${width}.png`, fullPage: true });
});
test('admin sends a customer reply and keeps a separate internal note', async ({ page }) => {
  const writes = await setup(page); await page.goto(`/?section=support&ticket=${ticketId}`);
  await page.getByLabel('Reply to the customer', { exact: true }).fill('Please try uploading the failed photograph once more.');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('queued for email');
  expect(writes[0].body.internal).toBe(false); expect(writes[0].body.requestKey).toBeTruthy();
  await page.getByLabel('Internal note', { exact: true }).check();
  await page.getByLabel('Private note for the team', { exact: true }).fill('Investigate the upload before marking this resolved.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2); expect(writes[1].body.internal).toBe(true);
});
