import { test, expect } from '@playwright/test';

const id = '222222222222222222222222', assetId = '333333333333333333333333';
const config = { configured: true, available: true, writeAvailable: true, aiAvailable: false, maxVideos: 10, maxFileBytes: 5_000_000_000, accountTransfers: 2 };
const user = { id: '111111111111111111111111', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const asset = { id: assetId, filename: 'ceremony.mp4', bytes: 10000000, duration: 10, width: 960, height: 540, state: 'ready', posterUrl: '/veylo/video/light-study.webp', analysis: { state: 'idle' } };
const presentation = { title: 'Ada and Emeka', introduction: 'Your finished films are ready.', featuredAssetId: assetId, allowDownloads: false, items: [{ assetId, title: 'The ceremony', description: 'The complete ceremony film.', posterSeconds: 0, allowDownload: null }] };
function project() { return { _id: id, publicId: 'video-example-private-id', kind: 'video', schemaVersion: 3, status: 'draft', clientName: '', brief: '', video: { draft: structuredClone(presentation), revision: 0, accessVersion: 0 }, access: { hasPin: false }, assets: [structuredClone(asset)] }; }
async function mock(page, options = {}) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  const state = { project: project(), saves: [], publishes: 0, unlocks: 0 }; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    const ok = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user } });
    if (path.endsWith('/billing/status')) return ok({ plan: 'pro', features: {}, limits: { personalStorageBytes: 100 * 1024 ** 3 }, usage: {} });
    if (path.endsWith('/billing/plans')) return route.fulfill({ json: { success: true, data: [], videoDelivery: { ...config, available: options.available ?? true } } });
    if (path.endsWith('/videos/config')) return ok(config);
    if (path.endsWith(`/deliveries/${id}/publish`)) { state.publishes++; state.project.status = 'published'; state.project.video.published = structuredClone(state.project.video.draft); state.project.video.revision++; return ok(state.project); }
    if (path.endsWith(`/deliveries/${id}/preview`)) return ok({ ...presentation, items: [{ ...asset, ...presentation.items[0] }], branding: { name: 'Amara Studio' } });
    if (path.endsWith(`/deliveries/${id}`)) {
      if (method === 'PATCH') { const body = route.request().postDataJSON(); state.saves.push(body); state.project.video.draft = body.presentation; state.project.title = body.presentation.title; state.project.video.revision++; }
      return ok(state.project);
    }
    if (path.endsWith('/unlock')) { state.unlocks++; return ok({ ...presentation, items: [{ ...asset, ...presentation.items[0] }], branding: { name: 'Amara Studio' } }); }
    if (path.includes('/videos/public/')) return ok({ requiresPin: true, branding: { name: 'Amara Studio' } });
    return ok({});
  });
  return { state, errors };
}
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }

for (const width of [320, 390, 768, 834, 1024, 1440]) test(`client demo fits ${width}px with one idle player and photographer branding`, async ({ page }) => {
  const { errors } = await mock(page); await page.setViewportSize({ width, height: 950 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/demo/video');
  await expect(page.getByRole('heading', { name: 'A place for the finished film.' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(1); expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
  await expect(page.locator('.vv-brand')).toContainText('Veylo Studio'); await noOverflow(page);
  await page.getByRole('button', { name: /Light, in portrait/ }).click(); await expect(page.locator('.vv-screen')).toHaveClass(/is-portrait/); await noOverflow(page);
  if (width === 390 || width === 834) await page.screenshot({ path: `../.visual-review/video-demo-${width}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
test('demo plays original audio on demand, seeks and keeps a single player when changing films', async ({ page }) => {
  await mock(page); await page.goto('/demo/video'); await page.getByRole('button', { name: 'Play film', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  expect(await page.locator('video').evaluate(video => video.muted)).toBe(false);
  await page.locator('video').evaluate(video => { video.pause(); video.currentTime = 4; }); await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(3.9);
  await page.getByRole('button', { name: /Light, in portrait/ }).click(); await expect(page.locator('video')).toHaveCount(1);
  expect(await page.locator('video').evaluate(video => video.paused)).toBe(true); await expect(page.getByRole('button', { name: 'Play film', exact: true })).toBeVisible();
});
test('expired playback sessions reopen on the same player and preserve the playback position', async ({ page }) => {
  const { errors } = await mock(page); const requests = []; let ended = 0;
  await page.clock.install();
  await page.route('**/api/v1/videos/public/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/playback/end')) { ended++; return route.fulfill({ json: { success: true, data: {} } }); }
    if (path.endsWith('/playback')) {
      requests.push(route.request().postDataJSON());
      if (requests.length === 2) return route.fulfill({ status: 401, json: { success: false, code: 'VIDEO_SESSION_EXPIRED', message: 'This playback session expired.' } });
      return route.fulfill({ json: { success: true, data: { sessionId: 'session-' + requests.length, hlsUrl: '/veylo/video/light-study.mp4', expiresAt: new Date(Date.now() + (requests.length === 1 ? 8 : 60) * 60_000).toISOString() } } });
    }
    return route.fulfill({ json: { success: true, data: { ...presentation, branding: { name: 'Amara Studio' }, items: [{ ...asset, ...presentation.items[0] }, { ...asset, id: '444444444444444444444444', title: 'Reception film' }] } } });
  });
  await page.goto('/v/video-example-private-id'); await page.getByRole('button', { name: 'Play film', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await page.locator('video').evaluate(video => { video.loop = true; video.currentTime = 4; });
  await page.clock.fastForward(4 * 60_000);
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[1].sessionId).toBe('session-1'); expect(requests[2].sessionId).toBeUndefined();
  await expect(page.locator('video')).toHaveCount(1);
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(3.9);
  await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(false);
  await page.getByRole('button', { name: /Reception film/ }).click();
  await expect.poll(() => ended).toBe(1); expect(errors).toEqual([]);
});
for (const width of [320, 768, 834]) test(`creator saves, reviews and publishes a separate snapshot at ${width}px`, async ({ page }) => {
  const { state, errors } = await mock(page); await page.setViewportSize({ width, height: 1000 }); await page.goto(`/create?draft=${id}`);
  await expect(page.getByRole('heading', { name: 'Start with the finished files.' })).toBeVisible(); await page.getByLabel('Delivery title', { exact: true }).fill('A revised wedding title');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await expect.poll(() => state.saves.at(-1)?.presentation.title).toBe('A revised wedding title');
  await page.getByRole('button', { name: /Arrange & present/ }).click(); await expect(page.getByLabel('Film title', { exact: true })).toHaveValue('The ceremony'); await noOverflow(page);
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('The vows, readings and final walk together, in the order they happened.');
  await page.getByRole('button', { name: /Preview & publish/ }).click(); await page.getByRole('button', { name: /Publish video delivery|Publish latest changes|Publish delivery/ }).click();
  await expect.poll(() => state.publishes).toBe(1); await expect(page.getByRole('link', { name: 'Open the client view' })).toBeVisible();
  expect(state.project.video.published.items[0].description).toContain('The vows'); await noOverflow(page);
  if (width === 834) await page.screenshot({ path: '../.visual-review/video-creator-834.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('PIN protection hides all film titles until the recipient unlocks the delivery', async ({ page }) => {
  const { state } = await mock(page); await page.goto('/v/video-example-private-id');
  await expect(page.getByRole('heading', { name: 'Your films are private.' })).toBeVisible(); await expect(page.locator('video')).toHaveCount(0); await expect(page.getByText('The ceremony', { exact: true })).toHaveCount(0);
  await page.getByLabel('Access PIN').fill('123456'); await page.getByRole('button', { name: 'Open films' }).click();
  await expect(page.locator('video')).toHaveCount(1); expect(state.unlocks).toBe(1); await expect(page.locator('.vv-brand')).toContainText('Amara Studio');
});
test('video stays a Pro feature while unconfigured upload controls remain unavailable', async ({ page }) => {
  await mock(page, { available: false }); await page.goto('/video-delivery'); await expect(page.getByText('Video delivery included with Pro', { exact: true })).toBeVisible();
  await expect(page.getByText(/coming to Pro/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Create a video delivery/ })).toHaveCount(0);
});

for (const width of [320, 390, 768, 834, 1024, 1440]) test(`homepage presents video delivery as included with Pro at ${width}px`, async ({ page }) => {
  const { errors } = await mock(page, { available: false });
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
  const shortcut = page.getByRole('link', { name: 'Video delivery for Pro', exact: true });
  await expect(shortcut).toBeVisible(); await shortcut.click();
  const section = page.locator('#video-delivery');
  await expect(section.getByRole('heading', { name: 'Your finished films. Your studio’s name.' })).toBeVisible();
  const navigation = await page.locator('header.v-nav').boundingBox();
  await expect.poll(async () => (await section.getByRole('heading', { level: 2 }).boundingBox()).y).toBeGreaterThan(navigation.y + navigation.height);
  await expect(section.getByText('Included with Veylo Pro', { exact: true })).toBeVisible();
  await expect(section.getByRole('link', { name: 'Explore video delivery', exact: true })).toHaveAttribute('href', '/video-delivery');
  await expect(section.getByRole('link', { name: 'Open the client demo', exact: true })).toHaveAttribute('href', '/demo/video');
  expect(await section.locator('video').evaluate(video => video.paused && video.preload === 'none')).toBe(true);
  await noOverflow(page);
  if ([390, 834, 1440].includes(width)) { await page.waitForTimeout(800); await page.screenshot({ path: `../.visual-review/home-video-${width}.png` }); }
  if (width === 390) {
    await section.locator('video').evaluate(video => video.play());
    await expect.poll(() => section.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
    await section.locator('video').evaluate(video => video.pause());
  }
  await expect(page.getByText(/coming to Pro/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});
