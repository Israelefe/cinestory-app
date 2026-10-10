import { test, expect } from '../../client/node_modules/@playwright/test/index.mjs';

async function setup(page, role = 'superadmin') {
  let settings = { revision: 0, replayEnabled: false, replaySamplePercent: 10, feedbackEnabled: false, guidanceEnabled: false, guidanceRolloutPercent: 10, guidanceExperimentEnabled: false, alertEmail: '' };
  const saves = [];
  await page.addInitScript(() => localStorage.setItem('veylo_admin_token', 'tests-only-admin-token'));
  await page.route('**/api/v1/admin/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/admin/', '');
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path === 'auth/me') return route.fulfill({ json: { success: true, admin: { name: 'Admin', role, sections: ['overview', 'productAnalytics'], mfaRequired: false } } });
    if (path === 'product-insights') return reply({ funnels: [], retention: [], cohorts: [], formats: [], coverage: {} });
    if (path === 'product-controls') {
      if (route.request().method() === 'PUT') { saves.push(route.request().postDataJSON()); settings = { ...saves.at(-1), revision: settings.revision + 1 }; return reply(settings); }
      return reply({ settings, email: { configured: false, recipient: '' }, feedback: [{ score: 4, responses: 12 }], experiment: { variants: [{ variant: 'guided', exposed: 9, published: 3, pending: 2 }], note: 'Counts are observations, not a statistically proven winner.' } });
    }
    return reply({});
  });
  return saves;
}
for (const width of [320, 768, 834, 1440]) {
  test(`monitoring and rollout controls fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await setup(page); await page.goto('/?section=productAnalytics');
    await expect(page.getByRole('heading', { name: 'Keep control of what goes live.' })).toBeVisible();
    await expect(page.getByLabel('Offer optional recordings')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../.visual-review/admin-operations/product-controls-${width}.png`, fullPage: true });
  });
}
test('superadmin can save rollout settings, while missing email setup stays visible', async ({ page }) => {
  const saves = await setup(page); await page.goto('/?section=productAnalytics');
  await page.getByLabel('Offer optional recordings').check();
  await page.getByLabel('Eligible accounts (%)').fill('25');
  await page.getByLabel('Show the feedback question').check();
  await page.getByLabel('Enable the delivery guide').check();
  await page.getByLabel('Rollout to accounts (%)').fill('10');
  await page.getByRole('button', { name: 'Save product settings' }).click();
  await expect(page.getByRole('status')).toHaveText('Product settings saved.');
  expect(saves[0]).toMatchObject({ revision: 0, replayEnabled: true, replaySamplePercent: 25, feedbackEnabled: true, guidanceEnabled: true, guidanceRolloutPercent: 10 });
  await expect(page.getByText(/Email alerts need a recipient/)).toBeVisible();
});
test('analyst sees observations but cannot change or save controls', async ({ page }) => {
  await setup(page, 'analyst'); await page.goto('/?section=productAnalytics');
  await expect(page.getByLabel('Offer optional recordings')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save product settings' })).toHaveCount(0);
  await expect(page.getByText('Counts are observations, not a statistically proven winner.')).toBeVisible();
});
