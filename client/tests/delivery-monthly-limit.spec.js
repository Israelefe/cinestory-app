import { expect, test } from '@playwright/test';

const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };
const quota = { plan: 'free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesThisMonth: 3, deliveriesRemaining: 0 }, features: { branding: 'veylo' } };
const draftId = '507f1f77bcf86cd799439011';

async function mockAccount(page, draft = null, planStatus = quota) {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply(planStatus);
    if (path.endsWith('/stories/my-stories')) return reply([]);
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    if (path.endsWith('/deliveries') && url.searchParams.get('scope') === 'archived') return reply([]);
    if (path.endsWith('/deliveries')) return reply([{ _id: 'published-delivery', publicId: 'published-link', status: 'published', clientName: 'Ada', title: "Ada's birthday", assets: [] }]);
    return reply({});
  });
}

test('dashboard disables New Delivery after three Free publications', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockAccount(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'New delivery' })).toBeDisabled();
  await expect(page.locator('.v-dashboard-deliveries>header .v-dashboard-new')).toBeVisible();
  await expect(page.locator('.v-dashboard-hero .v-dashboard-new')).toHaveCount(0);
  await expect(page.getByText("You've published all 3 Free deliveries this month.", { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Pro' }).last()).toHaveAttribute('href', '/billing');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('dashboard keeps New Delivery available before the Free limit', async ({ page }) => {
  await mockAccount(page, null, { ...quota, usage: { deliveriesThisMonth: 2, deliveriesRemaining: 1 } });
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'New delivery' })).toHaveAttribute('href', '/create');
  await expect(page.locator('.v-dashboard-deliveries>header .v-dashboard-new')).toBeVisible();
});

test('dashboard keeps New Delivery available for Pro', async ({ page }) => {
  await mockAccount(page, null, { ...quota, plan: 'pro', limits: { ...quota.limits, deliveriesPerMonth: null }, usage: { deliveriesThisMonth: 3, deliveriesRemaining: null } });
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'New delivery' })).toHaveAttribute('href', '/create');
});

test('V3 disables Publish delivery when the Free month is used', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday", format: 'editorial', assets: [], access: {}, creativeDirection: {}, v3: { step: 'access', revision: 2, approvedRevision: 2 } };
  await mockAccount(page, draft);
  await page.goto('/create?draft=' + draftId);
  await expect(page.getByRole('heading', { name: 'Set the rules for this link.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish delivery' })).toBeDisabled();
  await expect(page.getByText("You've published all 3 Free deliveries this month.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
