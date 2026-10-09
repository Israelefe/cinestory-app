import { expect, test } from '@playwright/test';
import { PHOTO_REVEAL_DEMO } from '../src/constants/photoRevealDemo.js';

function albumDelivery() {
  const delivery = structuredClone(PHOTO_REVEAL_DEMO);
  delivery.format = 'album';
  delivery.publicId = 'album-polish';
  delivery.status = 'published';
  delete delivery.soundtrack;
  delivery.formatConfig = { album: { spreads: [
    { id: 'first', layout: 'single', assetIds: [delivery.assets[0].assetId], heading: 'Sharon, your portraits are ready.', note: 'Five finished photographs from your studio session. Take your time with each page.' },
    { id: 'pair', layout: 'pair', assetIds: delivery.curatedAssetIds.slice(1, 3) },
    { id: 'last', layout: 'pair', assetIds: delivery.curatedAssetIds.slice(3) }
  ] } };
  return delivery;
}

async function prepare(page, delivery) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: delivery || {} } }));
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [834, 1194], [1440, 900], [1024, 600]]) {
  for (const client of [false, true]) {
    test(`Album's opening photograph uses its page at ${width}px in ${client ? 'client' : 'demo'} view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const delivery = client ? albumDelivery() : undefined;
      await prepare(page, delivery);
      await page.goto(client ? '/d/album-polish?phoneView=1' : '/demo/album?phoneView=1');
      await expect(page.locator('.fd-header-brand-copy strong')).toHaveText(client ? delivery.branding.name : 'Veylo Studio');
      const cover = page.locator('.album-cover-photo');
      await expect(cover.locator('.v-photo')).toHaveJSProperty('complete', true);
      const fit = await cover.evaluate(element => {
        const mount = element.getBoundingClientRect();
        const photo = element.querySelector('.v-photo').getBoundingClientRect();
        return { top: photo.top - mount.top, bottom: mount.bottom - photo.bottom };
      });
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.bottom).toBeGreaterThanOrEqual(0);
      await page.getByRole('button', { name: 'Open album', exact: true }).click();
      const spread = page.locator('.album-open-book');
      await expect(spread).toBeVisible();
      const proportions = await spread.evaluate(book => {
        const paper = book.querySelector('.album-paper');
        const photo = paper.querySelector('.v-photo');
        const rect = photo.getBoundingClientRect();
        const renderedHeight = Math.min(rect.height, rect.width * photo.naturalHeight / photo.naturalWidth);
        return { paper: paper.clientHeight / book.clientHeight, photograph: renderedHeight / paper.clientHeight };
      });
      expect(proportions.paper).toBeGreaterThan(.95);
      expect(proportions.photograph).toBeGreaterThan(.75);
      await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeInViewport({ ratio: 1 });
      expect(await page.locator('.album-note p').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    });
  }
}

test('the branded demo retains its return link and keeps it out of embedded previews', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.goto('/demo/album?from=formats');
  const exit = page.getByRole('link', { name: 'Back to the Album section on the formats page', exact: true });
  await expect(exit).toHaveAttribute('href', '/formats#album');
  await exit.click();
  await expect(page).toHaveURL(/\/formats#album$/);
  await page.goto('/demo/album?phoneView=1');
  await expect(page.locator('.fd-header-brand-copy strong')).toHaveText('Veylo Studio');
  await expect(page.locator('.fd-header .fd-back')).toHaveCount(0);
});

test('long notes remain readable on a small phone and return to the same page', async ({ page }) => {
  const delivery = albumDelivery();
  delivery.formatConfig.album.spreads[0].note = 'Sharon, these portraits include the standing and seated photographs from your session. We kept the full frames so you can enjoy the outfits and expressions in every photograph.';
  await page.setViewportSize({ width: 320, height: 568 });
  await prepare(page, delivery);
  await page.goto('/d/album-polish?phoneView=1');
  await page.getByRole('button', { name: 'Open album', exact: true }).click();
  const read = page.getByRole('button', { name: 'Read note', exact: true });
  await read.click();
  const dialog = page.getByRole('dialog', { name: 'Sharon, your portraits are ready.', exact: true });
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expect(dialog.locator('p')).toHaveText(delivery.formatConfig.album.spreads[0].note);
  await expect(page.getByRole('button', { name: 'Close album note', exact: true })).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(read).toBeFocused();
  await expect(page.locator('.album-open-book')).toHaveAttribute('data-spread-index', '0');
});
