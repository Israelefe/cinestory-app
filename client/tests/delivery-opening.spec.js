import { test, expect } from '@playwright/test';

const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const formats = ['Photo Story', 'Editorial Page', 'Photo Reveal', 'Canvas', 'Chapters', 'Album', 'Event Coverage', 'Campaign Delivery'];

async function mockStudio(page, plan = 'pro', remaining = 3) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user: { ...user, plan } } });
    const data = path.endsWith('/billing/status') ? { plan, planName: plan === 'pro' ? 'Pro' : 'Free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesRemaining: remaining } }
      : path.endsWith('/videos/config') ? { configured: true, available: true, writeAvailable: true, maxVideos: 10 }
      : path.endsWith('/deliveries') || path.endsWith('/my-stories') ? [] : {};
    return route.fulfill({ json: { success: true, data } });
  });
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [834, 1112], [1440, 900]]) {
  test('opening previews and dashboard delivery shortcuts work at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockStudio(page);
    await page.goto('/create');
    await expect(page.getByRole('heading', { name: 'How should this gallery open?' })).toBeVisible();
    for (const name of formats) await expect(page.getByRole('link', { name: 'Preview ' + name, exact: true })).toBeVisible();
    if (width < 768) {
      const photo = page.locator('.v-showcase-overview img').first();
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate(image => {
        const box = image.getBoundingClientRect();
        const actionTop = document.querySelector('.v-choice-actions').getBoundingClientRect().top;
        return Math.min(box.bottom, actionTop) - Math.max(box.top, 0);
      })).toBeGreaterThan(35);
      expect(await page.evaluate(() => scrollY)).toBe(0);
    }
    await page.getByRole('radio', { name: 'GridBoard Delivery', exact: true }).check();
    await expect(page.locator('.opening-board')).toBeVisible();
    if (width < 768) {
      expect(await page.evaluate(() => scrollY)).toBe(0);
      const preview = await page.locator('.v-choice-preview-stage').boundingBox();
      expect(preview.y).toBeLessThan(height - 160);
    }
    await page.getByRole('radio', { name: 'Photo Swap Delivery', exact: true }).check();
    await expect(page.locator('.opening-swap')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.goto('/dashboard');
    const actions = page.getByRole('group', { name: 'Create a delivery', exact: true });
    await expect(actions.getByRole('link', { name: 'New photo delivery' })).toHaveAttribute('href', '/create');
    await expect(actions.getByRole('link', { name: 'New video delivery' })).toHaveAttribute('href', '/create?type=video');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await actions.getByRole('link', { name: 'New video delivery' }).click();
    await expect(page).toHaveURL(/\/create\?type=video$/);
    await expect(page.locator('.vc-page')).toBeVisible();
    await page.goto('/dashboard');
    await page.getByRole('group', { name: 'Create a delivery', exact: true }).getByRole('link', { name: 'New photo delivery' }).click();
    await expect(page.getByRole('heading', { name: 'How should this gallery open?' })).toBeVisible();
  });
}

test('video creation keeps its own plan gate when the photo quota is reached', async ({ page }) => {
  await mockStudio(page, 'free', 0);
  await page.goto('/dashboard');
  const actions = page.getByRole('group', { name: 'Create a delivery', exact: true });
  await expect(actions.getByRole('button', { name: 'New photo delivery' })).toBeDisabled();
  await actions.getByRole('link', { name: 'New video delivery' }).click();
  await expect(page.getByRole('link', { name: /View Pro/ })).toBeVisible();
});
