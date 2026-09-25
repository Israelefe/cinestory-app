import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const formats = ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'];
const viewportSizes = [[320, 740], [390, 844], [768, 1024], [834, 1112], [1024, 768], [1440, 900]];
const user = { _id: '111111111111111111111111', name: 'Test photographer', email: 'test@example.test', emailVerified: true, onboardingComplete: true, emailVerifiedAt: '2026-01-01', onboardingCompletedAt: '2026-01-01', accountStatus: 'active', plan: 'pro', studio: { name: 'Test studio' } };
function fixture(format = 'photo-story') {
  const assets = Array.from({ length: 10 }, (_, i) => ({ assetId: `photo-${i}`, publicId: `test/photo-${i}`, originalFilename: `Ada-${i + 1}.jpg`, sortOrder: i, url: i % 2 ? '/veylo/sharon-4.jpeg' : '/veylo/pv-male-portrait.jpeg', thumbnailUrl: i % 2 ? '/veylo/sharon-4.jpeg' : '/veylo/pv-male-portrait.jpeg', alt: `Finished photograph ${i + 1}` }));
  return { _id: '222222222222222222222222', schemaVersion: 3, sourceVersion: 1, draftRevisionId: '333333333333333333333333', publicId: 'test-delivery', userId: user._id, format, title: 'Ada’s 30th birthday', clientName: 'Ada', shootType: 'Birthday', brief: 'Ada’s 30th birthday shoot', status: 'review',
    assets, presentationOrder: assets.map(a => a.assetId), galleryOrder: assets.map(a => a.assetId), access: { allowLikes: true, allowIndividualDownloads: true, allowDownloadAll: true },
    creativeDirection: { openingLine: '', closingLine: '', frames: assets.map((a, i) => ({ assetId: a.assetId, caption: i % 3 === 0 ? 'Celebrating Ada turning thirty, with a birthday story that leaves room for her photographs.' : '', durationSec: 4.2, motion: 'zoom_in' })), sections: [{ id: 'studio', title: 'Studio portraits', assetIds: assets.map(a => a.assetId) }] } };
}
async function mockAPI(page, delivery = fixture()) {
  const state = { delivery, published: null, edits: 0 };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const respond = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { user } });
    if (path.endsWith('/configuration')) return respond({ pipelineVersion: 3 });
    if (path.endsWith('/brief/direction')) {
      const body = route.request().postDataJSON();
      return respond({ ready: true, reason: '', choices: [], suggestedBrief: body.mode === 'enhance' ? 'A birthday shoot celebrating Ada turning 30. Keep the presentation centred on this milestone, with birthday-focused wording and a celebratory tone.' : '', recommendedFormat: 'photo-story' });
    }
    if (path.endsWith('/soundtracks')) return respond([]);
    if (path.endsWith('/preparation')) return respond({ id: 'test-run', state: 'ready', kind: 'prepare', photographs: { completed: 10, total: 10 }, message: 'Your presentation is ready to review.', tasks: [{ kind: 'writing', state: 'done' }] });
    if (path.endsWith('/preparation/cancel')) return respond({});
    if (path.endsWith('/presentation/publish')) { state.published = route.request().postDataJSON(); return respond({ publicId: delivery.publicId, url: `http://127.0.0.1:5178/d/${delivery.publicId}` }); }
    if (path.endsWith('/presentation/caption')) return respond({ id: 'new-caption' });
    if (path.endsWith('/presentation') && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); state.edits++;
      state.delivery = { ...state.delivery, title: body.title, draftRevisionId: '444444444444444444444444', presentationOrder: body.frames.map(f => f.assetId), creativeDirection: { ...state.delivery.creativeDirection, frames: body.frames, openingLine: body.openingLine, closingLine: body.closingLine } };
      return respond({ revisionId: state.delivery.draftRevisionId });
    }
    if (path.endsWith(`/public/${delivery.publicId}`) || path.endsWith(`/${delivery._id}`)) return respond(state.delivery);
    if (path.endsWith('/details')) { state.delivery = { ...state.delivery, ...route.request().postDataJSON() }; return respond(state.delivery); }
    if (path.endsWith('/deliveries') && route.request().method() === 'POST') { state.delivery = { ...state.delivery, ...route.request().postDataJSON(), assets: [], creativeDirection: null, draftRevisionId: null }; return respond(state.delivery); }
    return respond([]);
  });
  return state;
}
async function fits(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  const buttons = await page.locator('.dp-controls button').evaluateAll(elements => elements.map(e => e.getBoundingClientRect().height));
  expect(buttons.every(height => height >= 44)).toBe(true);
}

for (const format of formats) for (const [width, height] of viewportSizes) {
  test(`${format} at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await mockAPI(page, fixture(format));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/d/test-delivery');
    await expect(page.locator('.dp-viewer')).toBeVisible();
    await expect(page.locator('.dp-viewer img').first()).toBeVisible();
    await fits(page);
    if (format === 'photo-story') {
      await page.getByRole('button', { name: 'Play story', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
      await expect(page.locator('.dp-moving-photo')).toHaveCSS('animation-play-state', 'running');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
      await expect(page.locator('.dp-controls>span')).toHaveText('2 / 10');
      await page.getByRole('button', { name: 'Previous photograph', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('.dp-scene img')).toHaveCSS('animation-name', 'none');
    }
    await page.getByRole('button', { name: 'Gallery · 10', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.client-gallery-photo')).toHaveCount(10);
    await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
    if (['photo-story', 'album', 'editorial'].includes(format)) {
      await mkdir(resolve('../.visual-review/delivery-v3'), { recursive: true });
      await page.screenshot({ path: resolve(`../.visual-review/delivery-v3/${format}-${width}.png`), fullPage: true });
    }
  });
}
for (const [width, height] of viewportSizes) test(`create and review at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height }); const state = await mockAPI(page);
  await page.goto(`/create?draft=${state.delivery._id}`);
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Photographs & text', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Photographs & text', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Regenerate', exact: true })).toHaveCount(10);
  const caption = page.locator('.dc-frame textarea').first(); await caption.fill('Ada’s birthday, in her own style.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.dc-review-tabs>span')).toHaveText('Saved');
  expect(state.edits).toBe(1); await fits(page);
  await page.getByRole('button', { name: 'Share this presentation', exact: true }).click();
  await page.getByLabel('Six-digit PIN (optional)').fill('123456');
  await page.getByRole('button', { name: 'Publish this version', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your delivery is published.' })).toBeVisible();
  expect(state.published.revisionId).toBe('444444444444444444444444'); expect(state.published.pin).toBe('123456');
  await page.getByRole('button', { name: /Shoot & photographs/ }).click(); await fits(page);
  await mkdir(resolve('../.visual-review/delivery-v3'), { recursive: true });
  await page.screenshot({ path: resolve(`../.visual-review/delivery-v3/create-${width}.png`), fullPage: true });
});
test('enhance preserves the original until explicitly accepted and blur assessment does not block the button', async ({ page }) => {
  await mockAPI(page); await page.goto('/create');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.getByLabel('Client or project name').fill('Ada'); await page.getByLabel('Type of shoot').selectOption('Birthday');
  await page.getByLabel('The brief', { exact: true }).fill('Ada 30th Birthday Shoot');
  await page.getByRole('button', { name: 'Enhance brief', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enhanced brief' })).toBeVisible();
  await expect(page.getByLabel('The brief', { exact: true })).toHaveValue('Ada 30th Birthday Shoot');
  await page.getByRole('button', { name: 'Use this brief', exact: true }).click();
  await expect(page.getByLabel('The brief', { exact: true })).toHaveValue(/A birthday shoot celebrating Ada turning 30/);
});

test('an upload response lost in transit is recovered without uploading the photograph twice', async ({ page }) => {
  const state = await mockAPI(page);
  let transfers = 0, recoveries = 0;
  await page.route('**/api/v1/deliveries/*/uploads/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/sign')) return route.fulfill({ json: { success: true, data: { cloudName: 'test', public_id: 'saved-photo', timestamp: 1, signature: 'test-signature' } } });
    if (path.endsWith('/recover')) { recoveries++; return route.fulfill({ json: { success: true, data: { uploaded: { public_id: 'saved-photo', version: 1, signature: 'test-confirmation' } } } }); }
    if (path.endsWith('/confirm')) {
      const photo = { ...state.delivery.assets[0], assetId: 'recovered-photo', publicId: 'saved-photo', sortOrder: 10 };
      state.delivery = { ...state.delivery, assets: [...state.delivery.assets, photo] };
      return route.fulfill({ json: { success: true, data: photo } });
    }
    return route.fallback();
  });
  await page.route('https://api.cloudinary.com/**', route => { transfers++; return route.abort('failed'); });
  await page.goto(`/create?draft=${state.delivery._id}`);
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.getByRole('button', { name: /Shoot & photographs/ }).click();
  await page.locator('input[type=file]').setInputFiles(resolve('public/veylo/pv-male-portrait.jpeg'));
  await expect(page.locator('.dc-upload-progress')).toContainText('1 of 1 uploaded');
  expect(transfers).toBe(1); expect(recoveries).toBe(1);
  expect(state.delivery.assets).toHaveLength(11);
});

test('opening the gallery pauses the story and returning keeps it paused', async ({ page }) => {
  await mockAPI(page); await page.goto('/d/test-delivery');
  await page.getByRole('button', { name: 'Play story', exact: true }).click();
  await page.getByRole('button', { name: 'All photos', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play story', exact: true })).toBeVisible();
});
