import { test, expect } from '../../client/node_modules/@playwright/test/index.mjs';

const allSections = ['overview', 'operations', 'issues', 'users', 'support', 'deliveries', 'portfolio', 'volume', 'access', 'payments', 'productAnalytics', 'visitorTraffic', 'aiJobs', 'storage', 'musicNarration', 'configuration', 'security'];
function fixture() {
  const now = new Date().toISOString();
  return {
    generatedAt: now, instance: 'test-api', revision: 'abc123', openIssues: 2,
    activity: { total: 23, photographers: 8, visitors: 15, windowSeconds: 90 },
    alerts: [], notifications: { configured: false },
    process: { cpuPercent: 12.3, rssBytes: 120 * 1024 ** 2, memoryLimitBytes: 512 * 1024 ** 2, eventLoopP95Ms: 23 },
    requests: { count: 40, errors: 1, errorRate: .025, routes: [{ route: 'GET /deliveries/:id', count: 40, errors: 1, averageMs: 112, p95Ms: 500 }] },
    externalMonitor: { configured: true, checks: [{ name: 'api', status: 'healthy', checkedAt: now, receivedAt: now, latencyMs: 45 }, { name: 'website', status: 'unknown', checkedAt: null }] },
    workers: [{ workerName: 'delivery', status: 'idle', stage: 'waiting', heartbeatAt: now }],
    history: Array.from({ length: 12 }, (_, index) => ({ observedAt: new Date(Date.now() - (12 - index) * 30000).toISOString(), process: { cpuPercent: 10 + index % 4, eventLoopP95Ms: 20 + index } }))
  };
}
async function setup(page, { role = 'superadmin', sections = allSections, mfaRequired = false, notifications = fixture().notifications } = {}) {
  const requested = []; let failSystem = false;
  await page.addInitScript(() => localStorage.setItem('veylo_admin_token', 'mock-only-token'));
  await page.route('**/api/v1/admin/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1/admin/', ''); requested.push(path);
    if (path === 'auth/me') return route.fulfill({ json: { success: true, admin: { name: 'Ada Okafor', username: 'ada', role, sections, mfaRequired, twoFactorEnabled: false } } });
    if (path === 'system') return route.fulfill(failSystem ? { status: 503, json: { success: false, message: 'API telemetry is unavailable.' } } : { json: { success: true, data: { ...fixture(), notifications } } });
    if (path === 'operations') return route.fulfill({ json: { success: true, data: { generatedAt: new Date().toISOString(), metrics: { accounts: { total: 213, newLast30Days: 18 } }, providers: { database: { status: 'healthy', latencyMs: 12 }, ai: { status: 'configured', message: 'Configuration only. No live provider probe.', failuresLast24Hours: 2 } } } } });
    if (path === 'issues') return route.fulfill({ json: { success: true, data: { generatedAt: new Date().toISOString(), items: url.searchParams.get('status') === 'resolved' ? [] : [{ _id: 'issue-1', code: 'HTTP_500', route: 'GET /deliveries/:id', status: 'open', occurrences: 6, frames: ['at handler (server/file.js:40:2)'], lastSeenAt: new Date().toISOString() }], total: url.searchParams.get('status') === 'resolved' ? 0 : 1, page: 1, pages: 1, browser: [] } } });
    if (path === 'support/tickets') return route.fulfill({ json: { success: true, data: { tickets: [], summary: {} } } });
    return route.fulfill({ json: { success: true, data: [] } });
  });
  return { requested, fail: () => { failSystem = true; } };
}
for (const width of [320, 768, 834, 1440]) {
  test(`overview and operations fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 640 ? 900 : 1000 });
    const { requested } = await setup(page); await page.goto('/');
    await expect(page.getByRole('heading', { name: 'A clear view of today.' })).toBeVisible();
    await expect(page.locator('.aw-live-value')).toHaveText('23');
    await page.screenshot({ path: `../.visual-review/admin-operations/overview-${width}.png`, fullPage: true });
    expect(requested.filter(path => !['auth/me', 'system', 'operations'].includes(path))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Operations', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'API instance' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Admin navigation' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Routes to investigate' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../.visual-review/admin-operations/operations-${width}.png`, fullPage: true });
  });
}
test('saved alert setup shows Configured while an unconnected monitor stays No observation', async ({ page }) => {
  await setup(page, { notifications: { configured: true, recipientConfigured: true, providerConfigured: true } });
  await page.goto('/?section=operations');
  const email = page.locator('.aw-coverage article').filter({ has: page.getByRole('heading', { name: 'Critical alert email' }) });
  await expect(email).toContainText('Recipient and email provider configured');
  await expect(email.locator('.aw-state')).toHaveText('Configured');
  const website = page.locator('.aw-coverage article').filter({ has: page.getByRole('heading', { name: 'Public website' }) });
  await expect(website.locator('.aw-state')).toHaveText('No observation');
});

test('missing email provider shows Not configured and explains the remaining setup', async ({ page }) => {
  await setup(page, { notifications: { configured: false, recipientConfigured: true, providerConfigured: false } });
  await page.goto('/?section=operations');
  const email = page.locator('.aw-coverage article').filter({ has: page.getByRole('heading', { name: 'Critical alert email' }) });
  await expect(email.locator('.aw-state')).toHaveText('Not configured');
  await expect(email).toContainText('Configure the email provider on the API.');
});

test('failed refresh identifies stale records and replaces old passing status', async ({ page }) => {
  const mock = await setup(page); await page.goto('/'); await expect(page.locator('.aw-live-value')).toHaveText('23');
  mock.fail(); await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('displayed records may be out of date');
  await expect(page.locator('.aw-state-stale').first()).toBeVisible();
  await expect(page.locator('.aw-coverage')).not.toContainText('Passing');
});
test('support role opens only permitted records with working URL history', async ({ page }) => {
  const { requested } = await setup(page, { role: 'support', sections: ['overview', 'users', 'support', 'deliveries'] });
  await page.goto('/?section=payments'); await expect(page.getByRole('heading', { name: 'Start where you’re needed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Payments & billing', exact: true })).toHaveCount(0);
  expect([...new Set(requested)]).toEqual(['auth/me']);
  await page.getByRole('button', { name: 'Support inbox', exact: true }).click(); await expect(page).toHaveURL(/section=support/);
  await expect.poll(() => requested.includes('support/tickets')).toBe(true);
  expect(requested.some(path => ['finance', 'system', 'operations', 'security'].includes(path))).toBe(false);
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Start where you’re needed.' })).toBeVisible();
});
test('mobile navigation traps focus, closes with Escape and restores trigger', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 }); await setup(page); await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open navigation' }); await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Admin navigation' }); await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
});
test('issue status filters and fix notes work without unrelated requests', async ({ page }) => {
  const { requested } = await setup(page); await page.goto('/?section=issues');
  await expect(page.getByText('HTTP_500', { exact: true })).toBeVisible();
  expect(requested.every(path => ['auth/me', 'issues', 'browser-errors'].includes(path))).toBe(true);
  await page.getByRole('button', { name: 'Record a fix' }).click(); await expect(page.getByRole('button', { name: 'Mark resolved' })).toBeDisabled();
  await page.getByLabel('What fixed this error?').fill('Fixed a request timeout.'); await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect.poll(() => requested.includes('issues/issue-1')).toBe(true);
  await page.getByRole('button', { name: 'resolved', exact: true }).click(); await expect(page.getByRole('heading', { name: 'No resolved server errors.' })).toBeVisible();
});
test('mandatory MFA blocks customer records until enrollment', async ({ page }) => {
  const { requested } = await setup(page, { mfaRequired: true }); await page.goto('/?section=users');
  await expect(page.getByRole('heading', { name: 'Protect your admin access.' })).toBeVisible();
  expect([...new Set(requested)]).toEqual(['auth/me']);
});
test('OS reduced motion keeps the shared motion provider active', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await setup(page); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A clear view of today.' })).toBeVisible();
  await expect(page.locator('.aw-heading')).toHaveCSS('opacity', '1');
});
