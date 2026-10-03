import { expect, test } from '@playwright/test';

async function mockPublicSession(page) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3 })));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: path.endsWith('/auth/me') ? 401 : 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: !path.endsWith('/auth/me'), pricing: { region: 'nigeria', monthlyPriceNaira: 25000 }, data: {} })
    });
  });
}

for (const width of [320, 390, 768, 834]) {
  test(`startup clears an inherited scroll position at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockPublicSession(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      // Simulate a browser restoring a position before React finishes loading.
      const observer = new MutationObserver(() => {
        if (!document.body) return;
        document.documentElement.style.overflowAnchor = 'none';
        document.body.style.minHeight = '5000px';
        window.scrollTo({ top: 900, behavior: 'instant' });
        window.inheritedScrollPosition = window.scrollY;
        observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.goto('/');
    await expect(page.locator('.v-hero-title')).toBeVisible();
    expect(await page.evaluate(() => window.inheritedScrollPosition)).toBe(900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('.v-hero-title')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
}

test('navigation starts at the top and Back restores the previous position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicSession(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.v-hero-title')).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 1300, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1300);
  await page.locator('.v-nav-signin').click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1300);
  await page.reload();
  await expect(page.locator('.v-hero-title')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('a hash link and Back from its demo preserve the requested section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicSession(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#album');
  await expect(page.locator('#album .v-format-art')).toBeInViewport();
  await page.locator('#album').getByRole('link', { name: 'View Album demo' }).click();
  await expect(page).toHaveURL(/\/demo\/album$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/#album$/);
  await expect(page.locator('#album .v-format-art')).toBeInViewport();
});
