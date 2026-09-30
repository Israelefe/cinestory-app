import { expect, test } from '@playwright/test';
import { mergeDeliveryDraft } from '../src/utils/deliveryDraft.js';

const draftId = '507f1f77bcf86cd799439011';
const palette = { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' };
const paths = ['demo-lora-1', 'demo-lora-4', 'demo-ada-1', 'demo-sharon-1', 'audience-portrait', 'demo-wedding-1'];
function fixture() {
  const assets = paths.map((name, index) => ({ assetId: `photo-${index}`, publicId: `shoot/${name}`, sortOrder: index,
    url: `/veylo/web/${name}-1440.webp`, thumbnailUrl: `/veylo/web/${name}-480.webp`, width: 480, height: 640,
    analysis: { colors: ['#bf562a', '#114639'] } }));
  return { _id: draftId, publicId: 'preview-test', schemaVersion: 3, kind: 'pinboard', status: 'draft', clientName: 'Lora', title: 'Birthday portraits', assets,
    v3: { step: 'pinboard', revision: 1 }, access: {}, pinboard: { title: 'Birthday portraits', selectedLayoutId: 'balanced', palette,
      layouts: ['balanced', 'moments', 'colour-flow'].map(id => ({ id, title: id, description: 'All the finished photos.', assetOrder: assets.map(asset => asset.assetId) })),
      moments: [], typography: { display: 'Cormorant Garamond', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'staggered', analysisStatus: 'ready' } };
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
});

test('draft updates preserve media, accept new URLs, and never reuse removed or replaced files', () => {
  const previous = fixture();
  previous.soundtrack = { publicId: 'music/one', url: '/audio/one.mp3' };
  const raw = { ...previous, assets: previous.assets.slice(0, 2).map(({ url, thumbnailUrl, ...asset }) => asset), soundtrack: { publicId: 'music/one' } };
  expect(mergeDeliveryDraft(previous, raw).assets).toEqual(previous.assets.slice(0, 2));
  expect(mergeDeliveryDraft(previous, raw).soundtrack.url).toBe('/audio/one.mp3');
  raw.assets[0].url = '/updated.webp';
  raw.assets[1].publicId = 'shoot/replaced';
  expect(mergeDeliveryDraft(previous, raw).assets[0].url).toBe('/updated.webp');
  expect(mergeDeliveryDraft(previous, raw).assets[1].url).toBeUndefined();
  expect(mergeDeliveryDraft(previous, { ...raw, _id: 'another-draft' })).toEqual({ ...raw, _id: 'another-draft' });
  expect(mergeDeliveryDraft(previous, { ...raw, assets: [], soundtrack: null }).assets).toEqual([]);
  expect(mergeDeliveryDraft(previous, { ...raw, soundtrack: null }).soundtrack).toBeNull();
});

for (const kind of ['showcase', 'pinboard']) for (const [width, height] of [[1080, 720], [1366, 768], [1440, 900]]) {
  test(`${kind} creation preview stays readable before and after scrolling at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const base = fixture();
    const draft = kind === 'pinboard' ? base : { ...base, kind, format: 'canvas', v3: { step: 'design' }, curatedAssetIds: base.assets.map(asset => asset.assetId), creativeDirection: { title: 'Birthday portraits', openingLine: 'Your birthday portraits are here.', closingLine: 'Enjoy your full collection.', palette, typography: base.pinboard.typography, frames: base.assets.map(asset => ({ assetId: asset.assetId, headline: 'A year of your own', caption: 'Lora, take this birthday at your own pace.' })) } };
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user: { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'free' } }) });
      if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
      if (path.endsWith(`/deliveries/${draftId}`)) return reply(draft);
      return reply([]);
    });
    await page.goto(`/create?draft=${draftId}`);
    const phone = page.locator(kind === 'pinboard' ? '.pb-create-preview .v-phone-device' : '.v3-design-preview .v-phone-device');
    await expect.poll(() => phone.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(280);
    await phone.scrollIntoViewIfNeeded();
    await expect.poll(() => phone.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(280);
    const bounds = await phone.boundingBox();
    expect(bounds.height).toBeLessThan(height - 30);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
    expect(await phone.locator('iframe').evaluate(element => element.contentWindow.innerWidth)).toBe(420);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440) await page.screenshot({ path: `../.visual-review/${kind}-readable-preview.png` });
  });
}

for (const width of [320, 768, 834, 1440]) {
  test(`GridBoard colour changes keep layout thumbnails and all creation previews at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let draft = fixture();
    let changes = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'free' } }) });
      if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100, deliveriesPerMonth: 3 }, usage: { deliveriesRemaining: 3 } });
      if (path.endsWith('/soundtracks')) return reply([]);
      if (path.endsWith('/theme/repick') || (path.endsWith('/v3/pinboard') && route.request().method() === 'PATCH')) {
        changes += 1;
        draft = { ...draft, pinboard: { ...draft.pinboard, palette: changes % 2 ? { background: '#f5eee6', surface: '#fffaf5', text: '#17191b', accent: '#6b3027' } : palette } };
        // Match the stored-document response, which has no generated photo URLs.
        return reply({ ...draft, assets: draft.assets.map(({ url, thumbnailUrl, ...asset }) => asset) });
      }
      if (path.endsWith(`/deliveries/${draftId}`)) return reply(draft);
      return reply({});
    });
    await page.goto(`/create?draft=${draftId}`);
    await expect(page.getByRole('heading', { name: 'Choose how it reads.' })).toBeVisible();
    const expectedThumbnails = await page.locator('.pb-layout-art img').evaluateAll(images => images.map(image => image.getAttribute('src')));
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole('button', { name: 'Pick new colours' }).click();
      await expect(page.getByRole('button', { name: 'Pick new colours' })).toBeEnabled();
      expect(await page.locator('.pb-layout-art img').evaluateAll(images => images.map(image => image.getAttribute('src')))).toEqual(expectedThumbnails);
    }
    const assertPhotos = async scope => {
      await expect(scope.locator('.pb-tile')).toHaveCount(paths.length);
      const first = scope.locator('.pb-tile img').first();
      await first.scrollIntoViewIfNeeded();
      await expect.poll(() => first.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      expect(await scope.locator('.pb-tile img').evaluateAll(images => images.every(image => image.getAttribute('src')?.includes('/veylo/web/')))).toBe(true);
    };
    if (width > 1024) await assertPhotos(page.frameLocator('.pb-create-preview iframe'));
    await page.getByRole('button', { name: 'View client preview', exact: true }).click();
    const larger = width > 1024 ? page.frameLocator('.pb-full-preview-scroll iframe') : page.locator('.pb-full-preview-scroll');
    await assertPhotos(larger);
    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(page.getByRole('button', { name: 'View client preview', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Save design and set access' }).click();
    await expect(page.getByRole('heading', { name: 'Set up the private link.' })).toBeVisible();
    await page.getByRole('button', { name: 'View client preview', exact: true }).click();
    await assertPhotos(larger);
    await page.getByRole('button', { name: 'Close preview' }).click();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('slideshow movement pauses, keeps photo timing, completes gently, and replays from the first photo', async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demo/gridboard');
  await page.getByRole('button', { name: 'Slideshow', exact: true }).click();
  await page.getByLabel('Time per photo').selectOption('4');
  await page.locator('.pb-slideshow-choice').filter({ hasText: 'Birthday portraits' }).click();
  await expect(page.locator('.pb-slideshow-main-photo')).toHaveCount(1);
  await expect(page.locator('.pb-slideshow > footer')).toContainText('Photograph 1 of 2');
  await expect(page.locator('.pb-slideshow-main-photo')).toHaveCSS('animation-duration', '4s');
  await expect.poll(() => page.locator('.pb-slideshow-main-photo').evaluate(image => getComputedStyle(image).transform)).not.toBe('none');
  await page.getByRole('button', { name: 'Pause slideshow' }).click();
  const still = await page.locator('.pb-slideshow-main-photo').evaluate(image => getComputedStyle(image).transform);
  await page.waitForTimeout(450);
  expect(await page.locator('.pb-slideshow-main-photo').evaluate(image => getComputedStyle(image).transform)).toBe(still);
  await expect(page.locator('.pb-slideshow-progress i')).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Resume slideshow' }).click();
  await expect(page.locator('.pb-slideshow > footer')).toContainText('Photograph 2 of 2', { timeout: 6000 });
  await expect(page.locator('.pb-slideshow-ending')).toBeVisible({ timeout: 6000 });
  await expect.poll(() => page.locator('.pb-viewer > audio').evaluate(audio => audio.paused && audio.volume === 0)).toBe(true);
  await page.getByRole('button', { name: 'Replay slideshow' }).click();
  await expect(page.locator('.pb-slideshow > footer')).toContainText('Photograph 1 of 2');
  await expect(page.locator('.pb-slideshow-ending')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next photo', exact: true }).click();
  await expect(page.locator('.pb-slideshow > footer')).toContainText('Photograph 2 of 2');
  await page.getByRole('button', { name: 'Previous photo', exact: true }).click();
  await expect(page.locator('.pb-slideshow > footer')).toContainText('Photograph 1 of 2');
  await page.getByRole('button', { name: 'Close slideshow' }).click();
  await expect(page.locator('.pb-slideshow')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reduced motion keeps slideshow photographs and their backgrounds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 834, height: 900 });
  await page.goto('/demo/gridboard');
  await page.getByRole('button', { name: 'Slideshow', exact: true }).click();
  await page.locator('.pb-slideshow-choice').filter({ hasText: 'Every photograph' }).click();
  await expect(page.locator('.pb-slideshow-main-photo')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.pb-slideshow-ambient')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.pb-slideshow-main-photo')).toHaveCSS('transform', 'none');
  expect(await page.locator('.pb-slideshow').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('Showcase palette repicking preserves its photos and retains the chosen format', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = fixture();
  const draft = { ...base, kind: 'showcase', format: 'canvas', v3: { step: 'design' }, curatedAssetIds: base.assets.map(asset => asset.assetId),
    creativeDirection: { title: 'Birthday portraits', palette, typography: base.pinboard.typography,
      frames: base.assets.map(asset => ({ assetId: asset.assetId, headline: 'Lora at twenty-five', caption: 'Lora, here is to the choices and plans you want to make room for in the year ahead.' })) } };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'free' } }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100, deliveriesPerMonth: 3 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/theme/repick')) return reply({ ...draft, assets: draft.assets.map(({ url, thumbnailUrl, ...asset }) => asset), creativeDirection: { ...draft.creativeDirection, palette: { ...palette, background: '#15201b', surface: '#21342a', accent: '#b2cebc' } } });
    if (path.endsWith(`/deliveries/${draftId}`)) return reply(draft);
    return reply([]);
  });
  await page.goto(`/create?draft=${draftId}`);
  const client = page.frameLocator('.v3-design-preview iframe');
  const photos = client.locator('img[src*="/veylo/web/"]');
  await expect(photos.first()).toBeVisible();
  const original = await photos.evaluateAll(images => images.map(image => image.getAttribute('src')));
  await page.getByRole('button', { name: 'Choose another palette' }).click();
  await expect(page.getByRole('button', { name: 'Choose another palette' })).toBeEnabled();
  await expect(photos.first()).toBeVisible();
  expect(await photos.evaluateAll(images => images.map(image => image.getAttribute('src')))).toEqual(original);
  await expect.poll(() => photos.first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('slideshow opens on a loaded photograph and fits phones, tablets and the desktop mockup', async ({ page }) => {
  test.setTimeout(45000);
  await page.route('**/demo-lora-1-1440.webp', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
  for (const width of [320, 768, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo/gridboard');
    const client = width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
    await client.getByRole('button', { name: 'Slideshow', exact: true }).click();
    await client.locator('.pb-slideshow-choice').filter({ hasText: 'Every photograph' }).click();
    await expect(client.locator('.pb-slideshow')).toHaveCount(0);
    await expect(client.locator('.pb-slideshow-main-photo')).toBeVisible();
    await expect(client.locator('.pb-slide-loading')).toHaveCount(0);
    await client.getByRole('button', { name: 'Pause slideshow' }).click();
    await page.waitForTimeout(1000);
    const bounds = await client.locator('.pb-slideshow').evaluate(element => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: element.scrollWidth > element.clientWidth };
    });
    expect(bounds.width).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.height).toBeLessThanOrEqual(bounds.viewportHeight);
    expect(bounds.overflow).toBe(false);
    if (width === 320 || width === 1440) await page.screenshot({ path: `../.visual-review/gridboard-slideshow-${width}.png` });
    await client.getByRole('button', { name: 'Close slideshow' }).click();
  }
});

test('small photo groups fill the available right column instead of forcing the last photo left', async ({ page }) => {
  for (const width of [390, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo/gridboard');
    const client = width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
    await client.locator('#pb-moment-birthday > button').first().click();
    await expect(client.locator('.pb-tile')).toHaveCount(2);
    await expect(client.locator('.pb-board-column').nth(0).locator('.pb-tile')).toHaveCount(1);
    await expect(client.locator('.pb-board-column').nth(1).locator('.pb-tile')).toHaveCount(1);
  }
});
