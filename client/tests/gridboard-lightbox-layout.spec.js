import { expect, test } from '@playwright/test';
import { GRIDBOARD_DEMO } from '../src/constants/deliveryDemoFixtures.js';

async function prepare(page, record = GRIDBOARD_DEMO) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: record } }));
}

async function expectClearControls(page) {
  await expect.poll(() => page.locator('.pb-lightbox-photo').evaluate(frame => {
    const bounds = frame.getBoundingClientRect();
    const image = frame.querySelector('.pb-lightbox-photo-main');
    const photo = image.getBoundingClientRect();
    return photo.top >= bounds.top - 1 && photo.bottom <= bounds.bottom + 1
      && photo.left >= bounds.left - 1 && photo.right <= bounds.right + 1
      && getComputedStyle(image).objectFit === 'contain';
  })).toBe(true);
  const figure = await page.locator('.pb-lightbox figure').boundingBox();
  const actions = await page.locator('.pb-lightbox-actions').boundingBox();
  expect(figure.y + figure.height).toBeLessThanOrEqual(actions.y - 8);
  for (const label of ['Close photograph', 'Previous photograph', 'Next photograph', 'Share on WhatsApp', 'Download photo']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeInViewport({ ratio: 1 });
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    if (await button.isEnabled()) {
      expect(await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return target === element || element.contains(target);
      })).toBe(true);
    }
  }
  const next = await page.getByRole('button', { name: 'Next photograph', exact: true }).boundingBox();
  const overlap = Math.min(next.x + next.width, actions.x + actions.width) > Math.max(next.x, actions.x)
    && Math.min(next.y + next.height, actions.y + actions.height) > Math.max(next.y, actions.y);
  expect(overlap).toBe(false);
}

for (const [width, height] of [[320, 568], [390, 844], [568, 320], [768, 1024], [834, 1194], [1024, 600], [1440, 900]]) {
  for (const demo of [true, false]) {
    test(`GridBoard photo controls stay separate with Similar Photos at ${width}x${height} in ${demo ? 'demo' : 'client'} view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await prepare(page);
      await page.goto(demo ? '/demo/gridboard?phoneView=1' : '/d/gridboard-layout?phoneView=1');
      await page.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Share on WhatsApp', exact: true })).toBeEnabled();
      await expectClearControls(page);
      const summary = page.locator('.pb-similar-shot summary');
      await summary.click();
      await expect(page.locator('.pb-similar-shot')).toHaveAttribute('open', '');
      await expectClearControls(page);
      const similar = page.getByRole('button', { name: /^Open a similar shot:/ }).first();
      await similar.click();
      await expect(page.locator('.pb-lightbox-photo-main')).toHaveAttribute('src', GRIDBOARD_DEMO.assets[3].url);
      await expectClearControls(page);
      await expect(page.locator('.pb-lightbox-photo')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.pb-lightbox figure')).toBeFocused();
      await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
      await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 5 of 6');
      await page.keyboard.press('Escape');
      await expect(page.locator('.pb-lightbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open photograph 1', exact: true })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test('the photo viewer fits without Similar Photos or download permission', async ({ page }) => {
  const record = structuredClone(GRIDBOARD_DEMO);
  record.access.allowIndividualDownloads = false;
  record.assets = record.assets.slice(0, 1);
  await page.setViewportSize({ width: 320, height: 568 });
  await prepare(page, record);
  await page.goto('/d/gridboard-layout?phoneView=1');
  await page.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  await expect(page.locator('.pb-similar-shot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download photo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share on WhatsApp', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous photograph', exact: true })).toBeDisabled();
});
