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

test('every photograph fits completely on a small phone without scrolling the paper', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await prepare(page);
  await page.goto('/demo/album?phoneView=1');
  await expect(page.getByRole('button', { name: 'Open album', exact: true })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Open album', exact: true }).click();
  const pages = page.getByRole('button', { name: /^Open album page \d+$/ });
  for (let at = 0; at < await pages.count(); at++) {
    await turnTo(page, at);
    await expect.poll(() => page.locator('.fd-album-stage').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    const images = page.locator('.fd-album-spread .v-photo');
    for (const image of await images.all()) {
      await expect(image).toHaveJSProperty('complete', true);
      await expect(image).toBeInViewport({ ratio: 1 });
    }
  }
});

for (const [width, height] of [[320,568], [390,844], [768,1024], [834,1194], [1440,900], [1024,600]]) {
  test(`album pages and controls fit at ${width} by ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo/album?phoneView=1');
    await expect(page.getByRole('button', { name: 'Open album', exact: true })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Open album', exact: true }).click();
    await expect(page.locator('.fd-album-spread .v-photo').first()).toHaveJSProperty('complete', true);
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
    await expect(page.locator('.album-note')).toBeInViewport();
    expect(await page.locator('.fd-album-spread .v-photo').first().evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
    const pages = page.getByRole('button', { name: /^Open album page \d+$/ });
    for (let at = 1; at < await pages.count(); at++) await turnTo(page, at);
    await expect(page.getByRole('button', { name: 'View full gallery', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View full gallery', exact: true })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `../.visual-review/album/reader-${width}-${height}.png` });
  });
}

for (const [width, height] of [[320,568], [390,844], [768,1024], [834,1194], [1440,900], [1024,600]]) {
  test(`a landscape opening photo gets a wider uncropped cover at ${width} by ${height}`, async ({ page }) => {
    const delivery = structuredClone(PHOTO_REVEAL_DEMO);
    delivery.format = 'album'; delivery.publicId = 'album-landscape-cover'; delivery.status = 'published'; delete delivery.soundtrack;
    delivery.assets[0].width = 1800; delivery.assets[0].height = 1200;
    const landscapeUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="#294c77"/></svg>')}`;
    delivery.assets[0].url = landscapeUrl; delivery.assets[0].thumbnailUrl = landscapeUrl; delivery.assets[0].srcSet = undefined;
    delivery.formatConfig = { album: { spreads: [{ id: 'opening', assetIds: [delivery.assets[0].assetId] }] } };
    await page.setViewportSize({ width, height }); await prepare(page, delivery);
    await page.goto('/d/album-landscape-cover?phoneView=1');
    const cover = page.locator('.album-cover-book');
    await expect(cover).toHaveClass(/is-landscape/);
    await expect(cover).toBeInViewport({ ratio: 1 });
    const dimensions = await cover.evaluate(element => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height, ratio: getComputedStyle(element).getPropertyValue('--album-cover-ratio').trim() };
    });
    expect(dimensions.width).toBeGreaterThan(dimensions.height);
    expect(Number(dimensions.ratio)).toBeGreaterThan(1);
    const photo = page.locator('.album-cover-photo .v-photo');
    expect(await photo.evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
    await expect.poll(() => photo.evaluate(image => image.naturalWidth > image.naturalHeight)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
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
