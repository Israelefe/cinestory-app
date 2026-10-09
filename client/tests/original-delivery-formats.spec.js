import { expect, test } from '@playwright/test';

const formats = {
  canvas: { root: '.fd-canvas', photos: '.fd-wall-card', detail: '.fd-wall-paths path' },
  chapters: { root: '.fd-chapters', photos: '.fd-chapter-library-card', detail: '.fd-chapter-cover-number' },
  album: { root: '.fd-album', photos: '.fd-album-cover figure', detail: '.fd-album-cover-shade' },
  'event-coverage': { root: '.vec-event', photos: '.ec-cover-photo .ec-photo-button', detail: '.ec-scene-nav' },
  campaign: { root: '.vec-campaign', photos: '.cp-sets .cp-photo-button', detail: '.cp-ending-actions' }
};
test.describe.configure({ mode: 'parallel' });
for (const [format, selectors] of Object.entries(formats)) for (const [width, height] of [[320,568],[390,844],[768,1024],[834,1194],[1440,900]]) {
  test(`${format} preserves its original presentation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
    await page.route('**/api/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) }));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/demo/${format}?phoneView=1`);
    await expect(page.locator(selectors.root)).toBeVisible();
    await expect(page.locator(selectors.photos).first()).toBeVisible();
    await expect(page.locator(selectors.detail).first()).toBeAttached();
    await expect(page.locator('.pv-viewer')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (width === 834 || width === 320) await page.screenshot({ path: `../.visual-review/restored-${format}-${width}.png` });
  });
}
