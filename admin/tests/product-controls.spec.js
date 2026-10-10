import { test, expect } from '../../client/node_modules/@playwright/test/index.mjs';

async function setup(page, role = 'superadmin', { emailConfigured = false, testFailure = '', holdTest = false } = {}) {
  let settings = { revision: 0, replayEnabled: false, replaySamplePercent: 10, feedbackEnabled: false, guidanceEnabled: false, guidanceRolloutPercent: 10, guidanceExperimentEnabled: false, alertEmail: emailConfigured ? 'alerts@example.test' : '' };
  const saves = [], testRequests = []; let finishTest;
  await page.addInitScript(() => localStorage.setItem('veylo_admin_token', 'tests-only-admin-token'));
  await page.route('**/api/v1/admin/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/admin/', '');
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path === 'auth/me') return route.fulfill({ json: { success: true, admin: { name: 'Admin', role, sections: ['overview', 'productAnalytics'], mfaRequired: false } } });
    if (path === 'product-insights') return reply({ funnels: [], retention: [], cohorts: [], formats: [], coverage: {} });
    if (path === 'product-controls/test-alert') {
      testRequests.push(route.request().postDataJSON());
      if (holdTest) await new Promise(resolve => { finishTest = resolve; });
      return testFailure ? route.fulfill({ status: 502, json: { success: false, message: testFailure } }) : reply({ status: 'accepted', message: 'The email provider accepted the test alert. Check your inbox and spam folder.' });
    }
    if (path === 'product-controls') {
      if (route.request().method() === 'PUT') { saves.push(route.request().postDataJSON()); settings = { ...saves.at(-1), revision: settings.revision + 1 }; return reply(settings); }
      return reply({ settings, email: { configured: emailConfigured, recipient: settings.alertEmail }, feedback: [{ score: 4, responses: 12 }], experiment: { variants: [{ variant: 'guided', exposed: 9, published: 3, pending: 2 }], note: 'Counts are observations, not a statistically proven winner.' } });
    }
    return reply({});
  });
  return { saves, testRequests, finishTest: () => finishTest() };
}
for (const width of [320, 768, 834, 1440]) {
  test(`monitoring and rollout controls fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await setup(page, 'superadmin', { emailConfigured: true }); await page.goto('/?section=productAnalytics');
    await expect(page.getByRole('heading', { name: 'Keep control of what goes live.' })).toBeVisible();
    await expect(page.getByLabel('Offer optional recordings')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../.visual-review/admin-operations/product-controls-${width}.png`, fullPage: true });
  });
}
test('superadmin can save rollout settings, while missing email setup stays visible', async ({ page }) => {
  const { saves } = await setup(page); await page.goto('/?section=productAnalytics');
  await page.getByLabel('Offer optional recordings').check();
  await page.getByLabel('Eligible accounts (%)').fill('25');
  await page.getByLabel('Show the feedback question').check();
  await page.getByLabel('Enable the delivery guide').check();
  await page.getByLabel('Rollout to accounts (%)').fill('10');
  await page.getByRole('button', { name: 'Save product settings' }).click();
  await expect(page.getByRole('status')).toHaveText('Product settings saved.');
  expect(saves[0]).toMatchObject({ revision: 0, replayEnabled: true, replaySamplePercent: 25, feedbackEnabled: true, guidanceEnabled: true, guidanceRolloutPercent: 10 });
  await expect(page.getByText(/Email alerts need a recipient/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send test alert' })).toBeDisabled();
});

test('test alert sends only the saved revision and prevents repeat clicks while sending', async ({ page }) => {
  const mock = await setup(page, 'superadmin', { emailConfigured: true, holdTest: true }); await page.goto('/?section=productAnalytics');
  await page.getByRole('button', { name: 'Send test alert' }).click();
  await expect(page.getByRole('button', { name: 'Sending test…' })).toBeDisabled();
  await expect(page.getByLabel('Send alerts to')).toBeDisabled();
  await expect.poll(() => mock.testRequests.length).toBe(1);
  expect(mock.testRequests[0]).toEqual({ revision: 0 });
  mock.finishTest();
  await expect(page.getByRole('status')).toHaveText('The email provider accepted the test alert. Check your inbox and spam folder.');
});

test('a changed alert address must be saved before testing and the new revision is used', async ({ page }) => {
  const mock = await setup(page, 'superadmin', { emailConfigured: true }); await page.goto('/?section=productAnalytics');
  await page.getByLabel('Send alerts to').fill('new-alerts@example.test');
  await expect(page.getByRole('button', { name: 'Send test alert' })).toBeDisabled();
  await expect(page.getByText('Save the new alert address before testing.')).toBeVisible();
  expect(mock.testRequests).toEqual([]);
  await page.getByRole('button', { name: 'Save product settings' }).click();
  await expect(page.getByRole('button', { name: 'Send test alert' })).toBeEnabled();
  await page.getByRole('button', { name: 'Send test alert' }).click();
  await expect.poll(() => mock.testRequests.length).toBe(1);
  expect(mock.testRequests[0]).toEqual({ revision: 1 });
});

test('a failed test alert shows the send failure without claiming delivery', async ({ page }) => {
  await setup(page, 'superadmin', { emailConfigured: true, testFailure: 'The test alert could not be sent. Check the email provider settings and try again in a minute.' });
  await page.goto('/?section=productAnalytics'); await page.getByRole('button', { name: 'Send test alert' }).click();
  await expect(page.getByRole('alert')).toContainText('The test alert could not be sent.');
  await expect(page.getByText('The email provider accepted the test alert.', { exact: false })).toHaveCount(0);
});
test('analyst sees observations but cannot change or save controls', async ({ page }) => {
  await setup(page, 'analyst'); await page.goto('/?section=productAnalytics');
  await expect(page.getByLabel('Offer optional recordings')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save product settings' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send test alert' })).toHaveCount(0);
  await expect(page.getByText('Counts are observations, not a statistically proven winner.')).toBeVisible();
});
