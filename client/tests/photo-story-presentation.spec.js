import { expect, test } from '@playwright/test';
import { DEMO_PRESETS } from '../src/constants/demoStories.js';
import { photoStoryDemoDelivery } from '../src/utils/photoStoryDemo.js';
import { gridboardPaletteContrast } from '../src/utils/gridboardPalette.js';

const sample = photoStoryDemoDelivery(DEMO_PRESETS.find(preset => preset.id === 'ada'));
// Layout/image tests use a quiet delivery; demo narration has its own playback checks.
delete sample.narration;
sample.v3.narrationChoice = 'skip';
const user = { _id: 'story-ui-user', name: 'Apex Imagery', studioName: sample.branding.name, email: 'studio@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro', role: 'photographer' };
const draftId = '507f1f77bcf86cd799439099';

for (const background of ['#ffffff', '#fffaf6', '#7d7871', '#070709']) test(`names, logo frame, progress, and controls stay readable on ${background}`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const delivery = structuredClone(sample);
  delivery.creativeDirection.palette = { background, surface: background, text: '#ffffff', accent: '#ffffff' };
  delivery.creativeDirection.frames = delivery.creativeDirection.frames.map(frame => ({ ...frame, colorAccent: '#ffffff' }));
  await setup(page, delivery);
  await page.goto('/d/presentation-story');
  const readColor = async (selector, property = 'color') => page.locator(selector).evaluate((el, property) => getComputedStyle(el)[property], property);
  const hex = color => '#' + color.match(/[\d.]+/g).slice(0, 3).map(value => Math.round(Number(value)).toString(16).padStart(2, '0')).join('');
  const contrast = color => gridboardPaletteContrast({ background, surface: background, text: hex(color), accent: hex(color) }).background;
  expect(hex(await readColor('.v-story-studio strong'))).toBe('#fffaf6');
  await begin(page);
  for (const selector of ['.v-story-studio strong', '.v-story-studio>div>span', '.v-story-mark>.delivery-brand-mark', '.v-story-frame-count', '.v-story-caption h2']) expect(contrast(await readColor(selector))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(await readColor('.v-story-progress .is-current i', 'backgroundColor'))).toBeGreaterThanOrEqual(3);
  const border = await readColor('.v-story-mark', 'borderTopColor');
  expect(border).not.toBe('rgba(0, 0, 0, 0)');
  if (background === '#ffffff' || background === '#fffaf6') expect(hex(border)).toBe('#17171c');
  const playText = hex(await readColor('.v-story-play'));
  const playBg = hex(await readColor('.v-story-play', 'backgroundColor'));
  expect(gridboardPaletteContrast({ background: playBg, surface: playBg, text: playText, accent: playText }).background).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: `../.visual-review/client-ui-audit/story-theme-${background.slice(1)}.png` });
  await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Photo Story progress' })).toHaveAttribute('aria-valuenow', '2');
  expect(contrast(await readColor('.v-story-progress>span.is-done i', 'backgroundColor'))).toBeGreaterThanOrEqual(3);
});

test('rapid navigation does not show a stale photograph when a delayed request finishes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { ...sample, soundtrack: undefined });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/veylo/web/demo-ada-2-*.webp', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/d/presentation-story');
    await begin(page);
    await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
    await expect(page.locator('.v-story-image-status')).toBeVisible();
    await page.getByRole('button', { name: 'Previous photograph', exact: true }).click();
    await expect(page.locator('.v-story-image-status')).toHaveCount(0);
    release();
    await page.waitForTimeout(300);
    await expect(page.getByRole('progressbar', { name: 'Photo Story progress' })).toHaveAttribute('aria-valuenow', '1');
    await expect(page.locator('.v-story-caption h2')).toHaveText(sample.creativeDirection.frames[0].caption);
  } finally { release(); }
});

test('a delayed closing photograph keeps the last photo visible until the slice ending is ready', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { ...sample, soundtrack: undefined, curatedAssetIds: [sample.assets[0].assetId] });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/veylo/web/demo-ada-5-*.webp', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/d/presentation-story');
    await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
    await expect(page.locator('.v-story-canvas.is-finale-state')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.v-story-image-status')).toContainText('Loading closing photograph');
    await expect(page.locator('.v-story-cinema-photo img')).toHaveAttribute('src', /demo-ada-1-/);
    await expect(page.getByRole('button', { name: 'Open your gallery', exact: true })).toBeVisible();
    release();
    await expect(page.locator('.v-story-finale-slice.is-centre img')).toHaveAttribute('src', /demo-ada-5-/);
    await expect(page.locator('.v-story-image-status')).toHaveCount(0);
  } finally { release(); }
});

test('the cover warms only its first and upcoming photo rather than fetching the entire collection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { ...sample, soundtrack: undefined });
  const requested = new Set();
  page.on('request', request => { const match = request.url().match(/demo-ada-(\d+)-\d+\.webp/); if (match) requested.add(Number(match[1])); });
  await page.goto('/d/presentation-story');
  await expect.poll(() => requested.has(2)).toBe(true);
  await page.waitForTimeout(500);
  expect([...requested].sort()).toEqual([1, 2]);
});

test('Photo Story preloads the next image and holds its photograph and caption during a slow request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { ...sample, soundtrack: undefined });
  let nextRequests = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/veylo/web/demo-ada-2-*.webp', async route => { nextRequests++; await gate; await route.continue(); });
  try {
    await page.goto('/d/presentation-story');
    await expect.poll(() => nextRequests).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
    await expect(page.locator('.v-story-cinema-photo img')).toBeVisible();
    const originalCaption = await page.locator('.v-story-caption h2').textContent();
    await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
    await expect(page.locator('.v-story-image-status')).toContainText('Loading photograph');
    await page.waitForTimeout(6500);
    await expect(page.getByRole('progressbar', { name: 'Photo Story progress' })).toHaveAttribute('aria-valuenow', '1');
    await expect(page.locator('.v-story-cinema-photo img')).toHaveAttribute('src', /demo-ada-1-/);
    await expect(page.locator('.v-story-caption h2')).toHaveText(originalCaption);
    expect(await page.locator('.v-story-cinema-photo img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    release();
    await expect(page.getByRole('progressbar', { name: 'Photo Story progress' })).toHaveAttribute('aria-valuenow', '2');
    await expect(page.locator('.v-story-image-status')).toHaveCount(0);
    await expect(page.locator('.v-story-caption h2')).toHaveText(sample.creativeDirection.frames[1].caption);
    expect(await page.locator('.v-story-poster-card img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  } finally { release(); }
});

test('a failed upcoming image retains the current photo and supports retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { ...sample, soundtrack: undefined });
  let attempts = 0;
  let failing = true;
  await page.route('**/veylo/web/demo-ada-2-*.webp', route => { attempts++; return failing ? route.abort() : route.continue(); });
  await page.goto('/d/presentation-story');
  await begin(page);
  await expect.poll(() => attempts).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
  await expect(page.locator('.v-story-image-status')).toContainText('This photo couldn’t load.');
  await expect(page.locator('.v-story-cinema-photo img')).toHaveAttribute('src', /demo-ada-1-/);
  failing = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Photo Story progress' })).toHaveAttribute('aria-valuenow', '2');
  await expect(page.locator('.v-story-image-status')).toHaveCount(0);
});

for (const layout of ['cinema', 'poster', 'split', 'collage']) test(`${layout} retains its outlined frame number and photograph treatment`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const delivery = structuredClone(sample);
  delivery.creativeDirection.frames[0].layout = layout;
  await setup(page, delivery);
  await page.goto('/d/presentation-story');
  await begin(page);
  const number = page.locator(layout === 'cinema' ? '.v-story-cinema-number' : layout === 'split' ? '.v-story-split-panel>span' : '.v-story-scene-number');
  await expect(number).toBeVisible();
  await expect(number).toHaveText('01');
  expect(await number.evaluate(el => getComputedStyle(el).webkitTextStrokeWidth)).toBe('1px');
  await expect(page.locator('.v-story-scene.is-' + layout)).toBeVisible();
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 834, height: 600 }]) test(`maximum-length caption and gallery fit ${viewport.width} by ${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const delivery = structuredClone(sample);
  delivery.creativeDirection.frames[0].caption = 'Ada, this birthday is a chance to look back at everything you have done and celebrate the people who have stood beside you through another year together.';
  await setup(page, delivery);
  await page.goto('/d/presentation-story');
  await begin(page);
  const canvas = page.locator('.v-story-canvas');
  expect(await canvas.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect((await page.locator('.v-story-visual').boundingBox()).height).toBeGreaterThan(100);
  const controls = await page.locator('.v-story-controls').boundingBox();
  expect(controls.y + controls.height).toBeLessThanOrEqual(viewport.height);
  await page.getByRole('button', { name: 'Open gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  expect(await page.locator('.client-gallery').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect((await page.locator('.client-gallery-lightbox-photo').boundingBox()).height).toBeGreaterThan(60);
  await expect.poll(() => page.locator('.client-gallery-lightbox-main').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.client-gallery-lightbox-frame')).toHaveCSS('opacity', '1');
  const photoArea = await page.locator('.client-gallery-lightbox-photo').boundingBox();
  const photoImage = await page.locator('.client-gallery-lightbox-main').boundingBox();
  expect(photoImage.height).toBeLessThanOrEqual(photoArea.height + 1);
  await page.screenshot({ path: `../.visual-review/client-ui-audit/approved-short-${viewport.width}-${viewport.height}.png` });
});

test('saved top captions remain above the photograph without covering it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const delivery = structuredClone(sample);
  delivery.creativeDirection.frames[0].captionPosition = 'top';
  await setup(page, delivery);
  await page.goto('/d/presentation-story');
  await begin(page);
  const caption = await page.locator('.v-story-caption').boundingBox();
  const photo = await page.locator('.v-story-visual').boundingBox();
  expect(caption.y + caption.height).toBeLessThanOrEqual(photo.y);
  expect(caption.y).toBeGreaterThanOrEqual((await page.locator('.v-story-top').boundingBox()).y + 44);
});

async function setup(page, delivery = sample) {
  await page.addInitScript(() => {
    localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true }));
    HTMLMediaElement.prototype.play = function () { Object.defineProperty(this, 'paused', { configurable: true, value: false }); this.dispatchEvent(new Event('playing')); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { Object.defineProperty(this, 'paused', { configurable: true, value: true }); this.dispatchEvent(new Event('pause')); };
  });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' };
    let body = { success: true, data: {} };
    if (path.endsWith('/auth/me')) body = { success: true, user };
    if (path.endsWith('/billing/status')) body.data = { plan: 'pro', limits: { photosPerDelivery: 500 }, usage: {} };
    if (path.endsWith('/deliveries/public/presentation-story') || path.endsWith('/deliveries/' + draftId)) body.data = { ...delivery, _id: draftId, publicId: 'presentation-story', status: path.includes('/public/') ? 'published' : 'review', v3: { ...delivery.v3, step: 'design', revision: 2 } };
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
  });
}

function viewer(page, width) { return width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page; }

test('protected Photo Story shows no photographs until the correct PIN unlocks the link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  let unlocked = false;
  const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' };
  await page.route('**/api/v1/deliveries/public/presentation-story**', route => {
    const unlocking = new URL(route.request().url()).pathname.endsWith('/unlock');
    if (unlocking && route.request().postDataJSON().pin !== '123456') return route.fulfill({ status: 403, headers, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'That PIN is not correct.' }) });
    if (unlocking) { unlocked = true; return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data: { accessToken: 'fixture-token' } }) }); }
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data: unlocked ? { ...sample, publicId: 'presentation-story', status: 'published' } : { locked: true, branding: sample.branding } }) });
  });
  await page.goto('/d/presentation-story');
  await expect(page.getByRole('heading', { name: 'Enter the six-digit PIN.' })).toBeVisible();
  await expect(page.locator('.v-story-canvas,.client-gallery')).toHaveCount(0);
  await page.getByPlaceholder('000000').fill('654321');
  await page.getByRole('button', { name: 'Open delivery' }).click();
  await expect(page.getByRole('alert')).toHaveText('That PIN is not correct.');
  await expect(page.locator('.v-story-canvas,.client-gallery')).toHaveCount(0);
  await page.getByPlaceholder('000000').fill('123456');
  await page.getByRole('button', { name: 'Open delivery' }).click();
  await begin(page);
  await expect(page.locator('.v-story-cinema-photo img')).toBeVisible();
});

test('expired delivery keeps the Photo Story and gallery unavailable', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v1/deliveries/public/presentation-story', route => route.fulfill({ status: 410, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'This delivery has expired.' }) }));
  await page.goto('/d/presentation-story?phoneView=1');
  await expect(page.getByText('This delivery has expired.', { exact: true })).toBeVisible();
  await expect(page.locator('.v-story-canvas,.client-gallery')).toHaveCount(0);
});

for (const format of ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign']) test(`${format} shares a tablet gallery that honours disabled downloads and favourites`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const delivery = { ...structuredClone(sample), format, soundtrack: undefined, access: { allowIndividualDownloads: false, allowDownloadAll: false, allowLikes: false } };
  await setup(page, delivery);
  await page.goto('/d/presentation-story');
  if (format === 'photo-story') {
    await begin(page);
    await page.getByRole('button', { name: 'Open gallery', exact: true }).click();
  } else await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  const gallery = page.locator('.client-gallery');
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button', { name: /Download|favourites/i })).toHaveCount(0);
  await expect(gallery.getByRole('button', { name: /Open photograph/ })).toHaveCount(sample.assets.length);
  await gallery.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  await expect(gallery.getByRole('button', { name: /Download|favourites/i })).toHaveCount(0);
  expect(await gallery.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await gallery.getByRole('button', { name: 'Next photograph', exact: true }).press('ArrowRight');
  await expect(gallery.getByRole('heading', { name: 'Photograph 2', exact: true })).toBeVisible();
});

async function begin(view) {
  await view.getByRole('button', { name: 'Begin the story', exact: true }).click();
  // This suite mocks media playback; finish the public demo's introduction explicitly.
  const opening = view.locator('audio[src*="/demo-bookends/"][src*="-opening-"]');
  if (await opening.count()) await opening.evaluate(el => el.dispatchEvent(new Event('ended')));
  await view.getByRole('button', { name: 'Pause story', exact: true }).click();
  await expect(view.locator('.v-story-canvas.is-playing-state')).toBeVisible();
}

for (const width of [320, 390, 768, 834, 1440]) {
  test(`Photo Story keeps captions, outlined numbers, and line details separated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    await page.goto('/d/presentation-story');
    const view = viewer(page, width);
    await begin(view);
    await expect(view.locator('.v-story-cinema-number')).toBeVisible();
    await expect(view.locator('.v-story-cinema-sweep')).toBeVisible();
    expect(await view.locator('.v-story-cinema-number').evaluate(el => getComputedStyle(el).webkitTextStrokeWidth)).toBe('1px');
    const visual = await view.locator('.v-story-visual').boundingBox();
    const caption = await view.locator('.v-story-caption').boundingBox();
    const controls = await view.locator('.v-story-controls').boundingBox();
    expect(visual.height).toBeGreaterThan(200);
    expect(caption.y).toBeGreaterThanOrEqual(visual.y + visual.height);
    expect(controls.y).toBeGreaterThanOrEqual(caption.y + caption.height);
    await page.screenshot({ path: `../.visual-review/client-ui-audit/approved-story-${width}.png` });
    const photoHeight = visual.height;
    await view.getByRole('button', { name: 'Hide captions' }).click();
    await expect(view.locator('.v-story-caption')).toHaveCount(0);
    expect((await view.locator('.v-story-visual').boundingBox()).height).toBeGreaterThan(photoHeight);
    await view.getByRole('button', { name: 'Open gallery', exact: true }).click();
    await page.screenshot({ path: `../.visual-review/client-ui-audit/approved-gallery-${width}.png` });
    await view.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
    const gallery = view.locator('.client-gallery');
    expect(await gallery.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    const actions = await view.locator('.client-gallery-lightbox-actions').boundingBox();
    const panel = await gallery.boundingBox();
    expect(actions.y + actions.height).toBeLessThanOrEqual(panel.y + panel.height);
    await page.screenshot({ path: `../.visual-review/client-ui-audit/approved-lightbox-${width}.png` });
    await view.getByRole('button', { name: 'All photographs', exact: true }).press('Escape');
    await expect(view.getByRole('button', { name: 'Open photograph 1', exact: true })).toBeVisible();
    await expect(gallery).toBeVisible();
    await expect(view.getByRole('button', { name: 'Open photograph 1', exact: true })).toBeFocused();
    await view.getByRole('button', { name: 'Open photograph 1', exact: true }).press('Escape');
    await expect(gallery).toHaveCount(0);
  });
}

test('demo, creation preview, and published delivery use equivalent Photo Story presentation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  const snapshot = async view => {
    await begin(view);
    return view.locator('.v-story-canvas').evaluate(el => {
      const caption = el.querySelector('.v-story-caption h2');
      const style = getComputedStyle(caption);
      return { caption: caption.textContent, layout: el.querySelector('.v-story-scene').className, font: style.fontFamily, size: style.fontSize, number: el.querySelector('.v-story-cinema-number').textContent, line: getComputedStyle(el.querySelector('.v-story-cinema-sweep')).display, photo: new URL(el.querySelector('.v-story-cinema-photo img').src).pathname };
    });
  };
  await page.goto('/demo?preset=ada');
  const demo = await snapshot(page);
  await page.goto('/d/presentation-story');
  expect(await snapshot(page)).toEqual(demo);
  await page.goto('/create?draft=' + draftId);
  const preview = page.frameLocator('.v3-design-preview iframe');
  await expect(preview.locator('.v-story-cover')).toBeVisible();
  const previewSize = await preview.locator('body').evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const previewPresentation = await snapshot(preview);
  await page.setViewportSize(previewSize);
  await page.goto('/demo?preset=ada&phoneView=1');
  expect(await snapshot(page)).toEqual(previewPresentation);
  await page.goto('/d/presentation-story?phoneView=1');
  expect(await snapshot(page)).toEqual(previewPresentation);
});

for (const [width, height] of [[320, 844], [390, 844], [768, 1000], [834, 1000], [1440, 1000], [320, 568], [844, 390], [834, 600]]) test(`three-photo ending preserves the centre closing photograph and fits at ${width} by ${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { ...sample, soundtrack: undefined });
  await page.goto('/d/presentation-story');
  const view = viewer(page, width);
  await view.getByRole('button', { name: 'Begin the story', exact: true }).click();
  for (let i = 1; i < sample.curatedAssetIds.length; i++) await view.getByRole('button', { name: 'Next photograph', exact: true }).click();
  await expect(view.locator('.v-story-canvas.is-finale-state')).toBeVisible({ timeout: 10000 });
  const slices = view.locator('.v-story-finale-slice');
  await expect(slices).toHaveCount(3);
  await expect(view.locator('.v-story-finale-slice.is-centre img')).toHaveAttribute('src', /demo-ada-5-960.webp/);
  const sources = await slices.locator('img').evaluateAll(images => images.map(image => image.src));
  expect(new Set(sources).size).toBe(3);
  const stage = await view.locator('.v-story-visual').boundingBox();
  expect(stage.height).toBeGreaterThan(60);
  for (const slice of await slices.all()) {
    const box = await slice.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(stage.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(stage.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  }
  await expect(view.getByRole('button', { name: 'Replay story', exact: true })).toBeVisible();
  await expect(view.locator('.v-story-caption.is-finale>p:not(.v-story-kicker)')).toBeVisible();
  await expect(view.getByRole('button', { name: 'Open your gallery', exact: true })).toBeVisible();
  for (const button of [view.getByRole('button', { name: 'Replay story', exact: true }), view.getByRole('button', { name: 'Open your gallery', exact: true })]) {
    const box = await button.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  }
  await page.screenshot({ path: `../.visual-review/client-ui-audit/three-photo-ending-${width}-${height}.png` });
});

test('the ending uses the selected closing photograph and keeps gallery access with captions hidden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { ...sample, soundtrack: undefined, curatedAssetIds: [sample.assets[0].assetId] });
  await page.goto('/d/presentation-story');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  await page.getByRole('button', { name: 'Hide captions' }).click();
  await expect(page.locator('.v-story-canvas.is-finale-state')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('img', { name: 'Closing photograph' })).toHaveAttribute('src', /demo-ada-5-960.webp/);
  await expect(page.getByRole('button', { name: 'Open your gallery' })).toBeVisible();
  await page.getByRole('button', { name: 'Open your gallery' }).click();
  await expect(page.getByRole('button', { name: 'Open photograph 5' })).toBeVisible();
});

test('long captions can be read fully without advancing the story', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const caption = 'These finished photographs are yours to enjoy. '.repeat(12);
  const delivery = { ...sample, soundtrack: undefined, creativeDirection: { ...sample.creativeDirection, frames: sample.creativeDirection.frames.map(frame => ({ ...frame, caption })) } };
  await setup(page, delivery);
  await page.goto('/d/presentation-story');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  await page.getByRole('button', { name: 'Read full caption' }).click();
  const dialog = page.getByRole('dialog', { name: sample.creativeDirection.frames[0].headline });
  await expect(dialog).toContainText(caption.trim());
  await page.waitForTimeout(6500);
  await expect(page.getByRole('progressbar', { name: 'Photo Story progress' })).toHaveAttribute('aria-valuenow', '1');
  await dialog.getByRole('button', { name: 'Back to the story' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Read full caption' })).toBeFocused();
});

test('demo favourites filter retains collection order and navigates only the filtered photographs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.goto('/demo');
  await begin(page);
  await page.getByRole('button', { name: 'Open gallery', exact: true }).click();
  const cards = page.locator('.client-gallery-grid figure');
  await cards.nth(1).getByRole('button', { name: 'Add to favourites' }).click();
  await cards.nth(3).getByRole('button', { name: 'Add to favourites' }).click();
  await page.getByRole('button', { name: /Favourites 2/ }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Open photograph 2', exact: true }).click();
  await page.getByRole('button', { name: 'Next photograph', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Photograph 4', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true }).last()).toBeDisabled();
});
