import { openPresentationGallery } from './helpers/presentationGallery.js';
import { expect, test } from '@playwright/test';

for (const width of [390, 834, 1440]) test(`Showcase gallery fills the photo stage and swipes both ways at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.addInitScript(() => {
    localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true }));
  });
  await page.goto('/demo/editorial');
  const viewer = width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
  await openPresentationGallery(viewer, 'editorial');
  await viewer.getByRole('button', { name: 'Open photograph 1' }).click();
  await expect(viewer.getByRole('heading', { name: 'Photograph 1' })).toBeVisible();

  const ambient = viewer.locator('.client-gallery-lightbox-ambient');
  const photo = viewer.locator('.client-gallery-lightbox-main');
  await expect(ambient).toBeVisible();
  const firstPhoto = await photo.getAttribute('src');
  expect(await ambient.getAttribute('src')).toBe(firstPhoto);
  await expect(viewer.locator('.client-gallery-lightbox-photo')).toHaveCSS('overflow', 'hidden');

  const frame = viewer.locator('.client-gallery-lightbox-frame');
  const box = await frame.boundingBox();
  await page.mouse.move(box.x + box.width * .76, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .18, box.y + box.height * .5, { steps: 8 });
  await page.mouse.up();
  await expect(viewer.getByRole('heading', { name: 'Photograph 2' })).toBeVisible();
  await expect(photo).toHaveCount(1);
  await expect.poll(() => photo.getAttribute('src')).not.toBe(firstPhoto);
  await expect(viewer.getByRole('button', { name: 'Previous photograph' })).toBeEnabled();

  const nextBox = await frame.boundingBox();
  await page.mouse.move(nextBox.x + nextBox.width * .18, nextBox.y + nextBox.height * .5);
  await page.mouse.down();
  await page.mouse.move(nextBox.x + nextBox.width * .76, nextBox.y + nextBox.height * .5, { steps: 8 });
  await page.mouse.up();
  await expect(viewer.getByRole('heading', { name: 'Photograph 1' })).toBeVisible();
  await expect(photo).toHaveCount(1);
});
