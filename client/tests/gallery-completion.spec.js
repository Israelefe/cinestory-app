import { expect, test } from '@playwright/test';
import { PHOTO_REVEAL_DEMO } from '../src/constants/photoRevealDemo.js';
import { openPresentationGallery } from './helpers/presentationGallery.js';

function fixture(format) {
  const delivery = structuredClone(PHOTO_REVEAL_DEMO);
  delete delivery.soundtrack;
  delivery.format = format;
  delivery.publicId = 'gallery-completion';
  delivery.status = 'published';
  delivery.creativeDirection.sections = [
    { id: 'first', title: 'The first portraits', assetIds: delivery.assets.slice(0, 2).map(photo => photo.assetId) },
    { id: 'next', title: 'More from the session', assetIds: delivery.assets.slice(2, 4).map(photo => photo.assetId) },
    { id: 'last', title: 'The final portrait', assetIds: [delivery.assets[4].assetId] }
  ];
  return delivery;
}
async function setup(page, delivery) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: delivery }) }));
}
async function expectSinglePhoto(view, button) {
  await button.click();
  const gallery = view.locator('.client-gallery');
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('.client-gallery-grid')).toHaveCount(0);
  await expect(gallery.getByRole('button', { name: 'All photographs', exact: true })).toHaveCount(0);
  await expect(gallery.getByRole('button', { name: /Next photograph|Previous photograph|Download all photos/ })).toHaveCount(0);
  const image = gallery.locator('.client-gallery-lightbox-main');
  const source = await image.getAttribute('src');
  await gallery.getByRole('button', { name: 'Return to presentation' }).press('ArrowRight');
  await expect(image).toHaveAttribute('src', source);
  await gallery.getByRole('button', { name: 'Return to presentation' }).press('Escape');
  await expect(gallery).toHaveCount(0);
  await expect(button).toBeFocused();
}

for (const width of [320, 834]) for (const format of ['photo-story', 'editorial', 'album', 'chapters', 'event-coverage', 'campaign']) test(`${format} full gallery follows presentation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 });
  await setup(page, fixture(format));
  await page.goto('/d/gallery-completion?phoneView=1');
  const galleryName = format === 'photo-story' ? 'Open gallery' : 'Open full gallery';
  await expect(page.getByRole('button', { name: galleryName, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Download all/ })).toHaveCount(0);
  if (format === 'editorial') await expectSinglePhoto(page, page.locator('.ed-cover .ed-image-button'));
  if (format === 'event-coverage' || format === 'campaign') await expectSinglePhoto(page, page.locator(format === 'campaign' ? '.vec-campaign-sets article>button' : '.vec-event-highlight-grid>button').first());
  if (format === 'album') {
    await page.getByRole('button', { name: 'Open album', exact: true }).click();
    await page.getByRole('button', { name: /^Open album page \d+$/ }).last().click();
    await expect(page.locator('.fd-album-spread.is-finale')).toBeVisible();
    await expect(page.getByRole('button', { name: galleryName, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View full gallery', exact: true })).toHaveCount(0);
  }
  if (format === 'chapters') {
    await page.locator('.fd-chapter-directory-board>button').first().click();
    await expectSinglePhoto(page, page.locator('.fd-chapter-room-photos>button').first());
    await expect(page.getByRole('button', { name: galleryName, exact: true })).toHaveCount(0);
  }
  await openPresentationGallery(page, format);
  await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(5);
  await page.getByRole('button', { name: 'Close gallery' }).click();
  if (format === 'photo-story') {
    await page.getByRole('button', { name: 'Replay story' }).click();
    await expect(page.getByRole('button', { name: galleryName, exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [format, route] of [['editorial', '/demo/editorial'], ['album', '/demo/album'], ['chapters', '/demo/chapters'], ['event-coverage', '/demo/event-coverage'], ['campaign', '/demo/campaign']]) test(`${format} demo follows the same gallery requirement`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, fixture(format));
  await page.goto(route + '?phoneView=1');
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await openPresentationGallery(page, format);
  await expect(page.locator('.client-gallery-grid>figure').first()).toBeVisible();
});

for (const format of ['photo-story', 'editorial', 'album', 'chapters', 'event-coverage', 'campaign']) test(`${format} creation preview follows the same completion rule`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  const delivery = fixture(format); await setup(page, delivery);
  await page.goto('/__phone-preview');
  await expect(page.getByText('Waiting for the preview.', { exact: true })).toBeVisible();
  await page.evaluate(delivery => window.postMessage({ type: 'veylo:phone-preview-data', payload: { delivery, access: delivery.access } }, location.origin), delivery);
  const root = { 'photo-story': '.v-story-cover', editorial: '.ed-cover', album: '.fd-album-cover', chapters: '.fd-chapter-directory-board', 'event-coverage': '.vec-event-hero', campaign: '.vec-campaign-hero' }[format];
  await expect(page.locator(root)).toBeVisible();
  await expect(page.getByRole('button', { name: format === 'photo-story' ? 'Open gallery' : 'Open full gallery', exact: true })).toHaveCount(0);
  await openPresentationGallery(page, format);
  await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(5);
});

test('GridBoard keeps browsing and downloads available immediately', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, fixture('canvas'));
  await page.goto('/demo/gridboard?phoneView=1');
  await expect(page.locator('.pb-tile-open').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download all photos', exact: true })).toBeVisible();
  await page.locator('.pb-tile-open').first().click();
  await expect(page.locator('.pb-lightbox-photo-main')).toBeVisible();
});

test('Canvas keeps its full gallery available on arrival', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, fixture('canvas'));
  await page.goto('/d/gallery-completion?phoneView=1');
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(5);
});
