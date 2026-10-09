import { test, expect } from '../../client/node_modules/@playwright/test/index.mjs';

const at = '2026-10-09T12:00:00.000Z';
const accountId = '507f1f77bcf86cd799439011';
const fingerprint = 'a'.repeat(64);
const diagnostic = { type: 'TypeError', mechanism: 'window', release: 'abc123', frames: [{ asset: '/assets/app-abcd.js', line: 1, column: 9, original: { source: 'src/pages/Dashboard.jsx', line: 25, column: 4 } }] };
function insights() {
  return { days: 30, generatedAt: at, funnels: [{ key: 'activation', title: 'First delivery', identity: 'account', windowHours: 168, participants: 20, steps: [{ name: 'account.activated', label: 'Account activated', reached: 20, rate: 100, dropped: 0, pending: 0 }, { name: 'upload.completed', label: 'Upload completed', reached: 12, rate: 60, dropped: 5, pending: 3, medianSeconds: 180 }, { name: 'delivery.publish.succeeded', label: 'Delivery published', reached: 8, rate: 40, dropped: 2, pending: 2, medianSeconds: 600 }] }, { key: 'checkout', title: 'Checkout to payment', identity: 'checkout', windowHours: 24, participants: 4, steps: [{ name: 'billing.checkout.started', label: 'Checkout opened', reached: 4, rate: 100 }, { name: 'billing.payment.confirmed', label: 'Payment confirmed', reached: 3, rate: 75, pending: 1, dropped: 0, medianSeconds: 100 }] }, { key: 'recipient', title: 'Client viewing', identity: 'session', windowHours: .5, participants: 10, steps: [{ name: 'client.delivery.opened', label: 'Delivery opened', reached: 10, rate: 100 }, { name: 'client.experience.started', label: 'Viewing started', reached: 8, rate: 80, pending: 0, dropped: 2, medianSeconds: 10 }, { name: 'client.photo.download.started', label: 'Photo download started', reached: 4, rate: 40, pending: 1, dropped: 3, medianSeconds: 50 }] }], retention: [7, 30].map(periodDays => ({ periodDays, rows: [{ date: '2026-09-01', size: 10, periods: [1, 2, 3, 4].map(period => ({ period, eligible: period > 2 ? 0 : 10, returned: 4, rate: period > 2 ? null : 40 })) }] })), cohorts: [{ key: 'never-published', label: 'New accounts without a recorded publication', count: 5 }, { key: 'upload-trouble', label: 'Accounts reporting upload failures', count: 2 }], formats: [{ format: 'event-coverage', photographers: 7 }], integration: { status: 'disabled', pending: 0, failed: 0 }, coverage: { firstRecordedAt: at, note: 'Reports use retained events. A download start does not prove a completed download.' } };
}
async function setup(page, role = 'superadmin') {
  const requests = []; let failActivity = false;
  await page.addInitScript(() => localStorage.setItem('veylo_admin_token', 'mock-only-token'));
  await page.route('**/api/v1/admin/**', async route => {
    const url = new URL(route.request().url()), pathname = url.pathname.replace('/api/v1/admin/', ''); requests.push(url.pathname + url.search);
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (pathname === 'auth/me') return route.fulfill({ json: { success: true, admin: { name: 'Ada', role, sections: role === 'support' ? ['overview', 'support', 'users'] : ['overview', 'productAnalytics', 'issues', 'users', 'support'], mfaRequired: false } } });
    if (pathname === 'product-insights') return reply(insights());
    if (pathname.startsWith('product-cohorts/')) return reply({ items: [{ id: accountId, name: 'Ada Photographer' }], more: false });
    if (pathname === 'browser-errors') return reply({ items: [{ fingerprint, occurrences: 3, affectedAccounts: 1, affectedSessions: 2, accountIds: role === 'superadmin' ? [accountId] : undefined, releases: ['abc123'], browsers: ['Chrome'], route: '/dashboard', firstAt: at, lastAt: at, diagnostic }] });
    if (pathname.endsWith('/activity')) {
      if (failActivity) return route.fulfill({ status: 503, json: { message: 'Account activity temporarily unavailable.' } });
      const older = url.searchParams.has('before'); return reply({ items: [{ id: older ? 'old-event' : 'new-event', name: older ? 'upload.completed' : 'javascript.error', occurredAt: at, source: 'client', status: older ? 'completed' : 'failed', diagnostic: older ? undefined : diagnostic, route: '/dashboard', browser: 'Chrome', deviceType: 'mobile' }], next: older ? null : '507f1f77bcf86cd799439012' });
    }
    if (pathname === `users/${accountId}`) return reply({ account: { id: accountId, name: 'Ada Photographer', email: 'ada@example.invalid', accountStatus: 'active', plan: 'free' } });
    if (pathname === 'support/tickets/ticket-1') return reply({ id: 'ticket-1', ticketNumber: 'VT-TEST', subject: 'My upload failed', requester: { name: 'Ada Photographer', email: 'ada@example.invalid' }, status: 'open', accountId, messages: [], outbox: [], attachments: [], context: {} });
    if (pathname === 'support/tickets') return reply({ tickets: [], summary: {}, administrators: [] });
    if (pathname === 'issues') return reply({ items: [], total: 0, page: 1, pages: 0, browser: [] });
    return reply({});
  });
  return { requests, fail: () => { failActivity = true; } };
}
for (const width of [320, 768, 834, 1440]) {
  test(`product reports and browser details fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await setup(page); await page.goto('/?section=productAnalytics');
    await expect(page.getByRole('heading', { name: 'From signup to the next delivery.' })).toBeVisible();
    await expect(page.getByText('3 pending · 5 stopped')).toBeVisible(); await expect(page.getByText('Not mature yet').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../.visual-review/admin-operations/insights-${width}.png`, fullPage: true });
    await page.goto('/?section=issues'); await page.getByText('Code locations · abc123').click(); await expect(page.getByText('src/pages/Dashboard.jsx:25:4', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('period and retention controls work and saved groups open account investigations', async ({ page }) => {
  const { requests } = await setup(page); await page.goto('/?section=productAnalytics');
  await page.getByLabel('Report period').selectOption('7'); await expect.poll(() => requests.some(value => value.includes('product-insights?days=7'))).toBe(true);
  await page.getByRole('button', { name: 'Monthly', exact: true }).click(); await expect(page.getByText('Month 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /New accounts without a recorded publication/ }).click(); await page.getByRole('button', { name: 'Ada Photographer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ada Photographer' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Recent account activity' })).toBeVisible();
  await page.getByRole('button', { name: 'Load older activity' }).click(); await expect(page.getByText('Upload completed', { exact: true })).toBeVisible();
});
test('support ticket exposes linked activity and clearly reports failed refresh', async ({ page }) => {
  const mock = await setup(page, 'support'); await page.goto('/?section=support&ticket=ticket-1');
  await expect(page.getByRole('heading', { name: 'Recent account activity' })).toBeVisible();
  await page.getByRole('button', { name: 'Errors only', exact: true }).click(); await expect.poll(() => mock.requests.some(value => value.includes('failures=true'))).toBe(true);
  mock.fail(); await page.getByRole('button', { name: 'Refresh account activity' }).click(); await expect(page.getByRole('alert')).toContainText('Account activity temporarily unavailable');
});
test('read-only reports do not offer account drilldowns and motion remains enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await setup(page, 'read-only'); await page.goto('/?section=productAnalytics');
  await expect(page.locator('.pi-workspace')).toHaveCSS('opacity', '1'); await expect(page.getByRole('button', { name: /New accounts without/ })).toHaveCount(0);
  await page.goto('/?section=issues'); await expect(page.getByText('Affected accounts', { exact: true })).toHaveCount(0);
});
