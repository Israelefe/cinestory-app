import { expect, test } from '@playwright/test';

async function openHome(page, { notice = false, hash = '' } = {}) {
  if (!notice) await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    if (path.endsWith('/billing/plans')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, pricing: { region: 'nigeria', monthlyPriceNaira: 25000 }, billingAvailable: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/' + hash);
}

for (const width of [320, 390, 768, 834, 1024, 1440]) {
  test(`homepage fits ${width}px and retains heading, visual, supporting copy order on phones`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openHome(page);
    await expect(page.locator('.v-hero-title')).toHaveText('Don’t justdeliver photos.Showcase them.');
    if (width < 768) {
      const hero = await Promise.all(['.v-hero-title-block', '.v-hero-art', '.v-hero-after'].map(selector => page.locator(selector).boundingBox()));
      expect(hero[0].y + hero[0].height).toBeLessThanOrEqual(hero[1].y);
      expect(hero[1].y + hero[1].height).toBeLessThanOrEqual(hero[2].y);
      for (const section of await page.locator('.v-home-section-grid').all()) {
        const [heading, art, copy] = await Promise.all(['.v-home-section-title', '.v-home-section-art', '.v-home-section-after'].map(selector => section.locator(selector).boundingBox()));
        expect(heading.y + heading.height).toBeLessThanOrEqual(art.y);
        expect(art.y + art.height).toBeLessThanOrEqual(copy.y);
      }
    }
    const tabs = page.getByRole('tablist', { name: 'Showcase formats' });
    for (const tab of await tabs.getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.v-home-format-preview .v-format-visual')).toHaveCount(1);
      const id = await tab.getAttribute('id');
      await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
    await page.getByRole('button', { name: 'GridBoard The full gallery first' }).click();
    await expect(page.locator('.v-home-gridboard-photos img')).toHaveCount(6);
    await expect(page.getByRole('link', { name: 'Open the GridBoard demo', exact: true })).toHaveAttribute('href', '/demo/gridboard');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('format selector supports keyboard navigation and restores the selected demo on return', async ({ page }) => {
  await openHome(page, { hash: '#album' });
  const album = page.getByRole('tab', { name: '06 Album' });
  await expect(album).toHaveAttribute('aria-selected', 'true');
  await album.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '07 Event Coverage' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: '08 Campaign Delivery' })).toBeFocused();
  await page.getByRole('link', { name: 'Open this demo', exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/campaign$/);
  await page.goBack();
  await expect(page.getByRole('tab', { name: '08 Campaign Delivery' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '08 Campaign Delivery' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: '01 Photo Story' })).toBeFocused();
  await expect(page.getByRole('tab', { name: '01 Photo Story' })).toHaveAttribute('aria-selected', 'true');
});

test('compact notice retains privacy details, dismissal, and phone touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openHome(page, { notice: true });
  const notice = page.getByRole('complementary', { name: 'Cookies and browser storage notice' });
  await expect(notice).toBeVisible();
  expect((await notice.boundingBox()).height).toBeLessThan(190);
  for (const button of await notice.getByRole('button').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await notice.getByRole('button', { name: 'View details' }).click();
  const dialog = page.getByRole('dialog', { name: 'What Veylo stores and why' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(notice).toBeHidden();
});
