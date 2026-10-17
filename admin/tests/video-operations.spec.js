import { test, expect } from '../../client/node_modules/@playwright/test/index.mjs';
import { VIDEO_DEFAULTS } from '../../server/src/config/videoDelivery.js';

for (const width of [320, 768, 834, 1440]) test(`video operations distinguishes delivery slots from encoders at ${width}px`, async ({ page }) => {
  const errors = [];
  const saves = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('veylo_admin_token', 'test-only-token'));
  await page.route('**/api/v1/admin/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/admin/', '');
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path === 'auth/me') return route.fulfill({ json: { success: true, admin: { name: 'Admin', role: 'superadmin', sections: ['configuration'], mfaRequired: false } } });
    if (path === 'configuration') {
      if (route.request().method() === 'PATCH') saves.push(route.request().postDataJSON());
      return reply({ plans: { free: {}, pro: {} }, formats: [], emailTemplates: [], providers: {}, music: {}, narration: {}, rateLimits: {}, retention: {} });
    }
    if (path === 'video-operations') return reply({
      settings: { ...VIDEO_DEFAULTS, enabled: true }, infrastructure: { storage: true, playback: true, media: true },
      qualificationConfirmed: true, worker: { status: 'idle', heartbeatAt: new Date().toISOString() },
      preparations: { activeDeliveries: 100, waitingDeliveries: 3, processingVideos: 100, queuedVideos: 900 },
      assets: [], jobs: [], usage: {}, activeEncodes: 100, activeTransfers: 0, activeViewers: 0, aiBudgetChargedUsd: 0
    });
    return reply({});
  });
  await page.goto('/?section=configuration');
  const panel = page.getByRole('region', { name: 'Video operations' });
  await expect(panel).toBeVisible();
  const metric = label => panel.locator('.vo-metrics > div').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(metric('Deliveries preparing')).toHaveText('100 / 100');
  await expect(metric('Videos processing')).toHaveText('100');
  await expect(metric('Videos waiting')).toHaveText('900');
  await expect(panel).toContainText('One preparation slot covers one delivery');
  await panel.scrollIntoViewIfNeeded();
  await expect.poll(() => panel.evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.95);
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: `../.visual-review/admin-operations/video-delivery-slots-${width}.png` });
  if (width === 834) {
    await panel.getByLabel('Delivery preparation slots (up to 100)').fill('75');
    await panel.getByRole('button', { name: 'Save video controls' }).click();
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0].videoDelivery.preparationConcurrency).toBe(75);
    expect(saves[0].videoDelivery.workerConcurrency).toBe(100);
  }
  expect(errors).toEqual([]);
});
