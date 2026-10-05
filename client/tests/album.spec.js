import { expect, test } from '@playwright/test';
import { PHOTO_REVEAL_DEMO } from '../src/constants/photoRevealDemo.js';

async function prepare(page, delivery) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: delivery || {} }) }));
}
async function turnTo(page, index) {
  await page.getByRole('button', { name: `Open album page ${index + 1}`, exact: true }).click();
  await expect(page.locator('.album-open-book')).toHaveAttribute('data-spread-index', String(index));
  await expect(page.locator('.album-turn-leaf')).toHaveCount(0);
}

for (const [width, height] of [[320,568], [390,844], [768,1024], [834,1194], [1440,900], [1024,600]]) {
  test(`album pages and controls fit at ${width} by ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo/album?phoneView=1');
    await page.getByRole('button', { name: 'Open album', exact: true }).click();
    await expect(page.locator('.fd-album-spread .v-photo').first()).toHaveJSProperty('complete', true);
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
    await expect.poll(() => page.locator('.fd-album-spread').evaluate((el, width) => {
      const left = el.querySelector('.album-paper-left').getBoundingClientRect();
      const right = el.querySelector('.album-paper-right').getBoundingClientRect();
      return width < 768 ? right.y >= left.y + left.height - 1 : Math.abs(left.y - right.y) < 1;
    }, width)).toBe(true);
    expect(await page.locator('.fd-album-spread .v-photo').first().evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
    await turnTo(page, 1);
    await turnTo(page, 2);
    await expect(page.getByRole('button', { name: 'View full gallery', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'View full gallery', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `../.visual-review/album/reader-${width}-${height}.png` });
  });
}

test('a photograph opens alone and returns focus to the same album page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
  await page.goto('/demo/album?phoneView=1');
  await page.getByRole('button', { name: 'Open album', exact: true }).click();
  const photo = page.locator('.fd-album-spread .album-photo-button').first();
  await photo.click();
  await expect(page.locator('.client-gallery-lightbox-main')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true })).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.album-open-book')).toHaveAttribute('data-spread-index', '0');
  await page.keyboard.press('Escape');
  await expect(page.locator('.client-gallery')).toHaveCount(0);
  await expect(photo).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.album-turn-leaf')).toHaveCount(0);
  await expect(page.locator('.album-open-book')).toHaveAttribute('data-spread-index', '1');
});

test('horizontal swipes turn pages while vertical reading gestures keep the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
  await page.goto('/demo/album?phoneView=1');
  await page.getByRole('button', { name: 'Open album', exact: true }).click();
  const stage = page.locator('.fd-album-stage');
  await stage.dispatchEvent('touchstart', { touches: [{ identifier: 0, clientX: 280, clientY: 280 }] });
  await stage.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 0, clientX: 200, clientY: 500 }] });
  await expect(page.locator('.album-open-book')).toHaveAttribute('data-spread-index', '0');
  await stage.dispatchEvent('touchstart', { touches: [{ identifier: 0, clientX: 280, clientY: 280 }] });
  await stage.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 0, clientX: 120, clientY: 290 }] });
  await expect(page.locator('.album-open-book')).toHaveAttribute('data-spread-index', '1');
  await expect(page.locator('.album-turn-leaf')).toHaveCount(0);
});

test('saved arrangements, all three photos, paper tone and gallery completion survive delivery rendering', async ({ page }) => {
  const delivery = structuredClone(PHOTO_REVEAL_DEMO);
  delivery.format = 'album'; delivery.publicId = 'album-arrangements'; delivery.status = 'published'; delete delivery.soundtrack;
  delivery.formatConfig = { album: { paperTone: 'light', spreads: [
    { id: 'three', layout: 'triptych', assetIds: delivery.curatedAssetIds.slice(0,3), heading: 'Your studio portraits', note: 'Three finished photographs, together on the page.' },
    { id: 'wide', layout: 'wide', assetIds: [delivery.curatedAssetIds[3]], heading: 'A closer look', note: 'A photograph with room around it.' }
  ] } };
  await page.setViewportSize({ width: 834, height: 1000 }); await prepare(page, delivery);
  await page.goto('/d/album-arrangements?phoneView=1');
  await page.getByRole('button', { name: 'Open album', exact: true }).click();
  await expect(page.locator('.fd-album')).toHaveAttribute('data-paper-tone', 'light');
  await expect(page.locator('.fd-album-spread')).toHaveAttribute('data-layout', 'triptych');
  await expect(page.locator('.fd-album-spread .v-photo')).toHaveCount(3);
  await expect(page.locator('.album-note')).toContainText('Three finished photographs');
  await turnTo(page, 2);
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await turnTo(page, 1);
  await expect(page.locator('.fd-album-spread')).toHaveAttribute('data-layout', 'wide');
  await turnTo(page, 2);
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(5);
});
