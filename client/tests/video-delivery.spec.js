import { test, expect } from '@playwright/test';
import { chooseVideoFilm, showVideoControls } from './helpers/videoClient.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const id = '222222222222222222222222', assetId = '333333333333333333333333';
const config = { configured: true, available: true, writeAvailable: true, aiAvailable: false, maxVideos: 10, maxFileBytes: 5_000_000_000, accountTransfers: 2 };
const user = { id: '111111111111111111111111', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const asset = { originalCompatible: true, hasAdaptive: true, id: assetId, filename: 'ceremony.mp4', bytes: 10000000, duration: 10, width: 960, height: 540, state: 'ready', posterUrl: '/veylo/video/light-study.webp', analysis: { state: 'idle' } };
const presentation = { title: 'Ada and Emeka', introduction: 'Your finished films are ready.', featuredAssetId: assetId, allowDownloads: false, items: [{ assetId, title: 'The ceremony', description: 'The complete ceremony film.', posterSeconds: 0, allowDownload: null }] };
function project() { return { _id: id, publicId: 'video-example-private-id', kind: 'video', schemaVersion: 3, status: 'draft', clientName: '', brief: '', video: { draft: structuredClone(presentation), revision: 0, accessVersion: 0 }, access: { hasPin: false }, assets: [structuredClone(asset)] }; }
async function mock(page, options = {}) {
  const demoMedia = [];
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  // Keep browser checks deterministic; production smoke checks use the real R2 originals.
  await page.route('**/demo-videos/*', async route => {
    demoMedia.push(new URL(route.request().url()).pathname.split('/').at(-1));
    const portrait = route.request().url().includes('drummer-');
    const body = await readFile(new URL(`../public/veylo/video/${portrait ? 'portrait-study' : 'light-study'}.mp4`, import.meta.url));
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) }, body: body.subarray(start, end + 1) });
  });
  const state = { project: project(), saves: [], publishes: 0, unlocks: 0 }; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    const ok = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user } });
    if (path.endsWith('/billing/status')) return ok({ plan: 'pro', features: {}, limits: { personalStorageBytes: 100 * 1024 ** 3 }, usage: {} });
    if (path.endsWith('/billing/plans')) return route.fulfill({ json: { success: true, data: [], videoDelivery: { ...config, available: options.available ?? true } } });
    if (path.endsWith('/videos/config')) return ok({ ...config, aiAvailable: options.aiAvailable ?? false });
    if (path.endsWith(`/deliveries/${id}/publish`)) { state.publishes++; state.project.status = 'published'; state.project.video.published = structuredClone(state.project.video.draft); state.project.video.revision++; return ok(state.project); }
    if (path.endsWith(`/deliveries/${id}/access`)) { const body = route.request().postDataJSON(); state.project.access = { hasPin: Boolean(body.pin), expiresAt: body.expiresAt }; return ok(state.project); }
    if (path.endsWith(`/deliveries/${id}/preview`)) return ok({ ...state.project.video.draft, items: state.project.video.draft.items.map(item => ({ ...state.project.assets.find(video => video.id === item.assetId), ...item })), branding: { name: 'Amara Studio' } });
    if (path.endsWith(`/deliveries/${id}`)) {
      if (method === 'PATCH') { const body = route.request().postDataJSON(); state.saves.push(body); state.project.video.draft = body.presentation; state.project.title = body.presentation.title; state.project.video.revision++; }
      return ok(state.project);
    }
    if (path.endsWith('/unlock')) { state.unlocks++; return ok({ ...presentation, items: [{ ...asset, ...presentation.items[0] }], branding: { name: 'Amara Studio' } }); }
    if (path.includes('/videos/public/')) return ok({ requiresPin: true, branding: { name: 'Amara Studio' } });
    return ok({});
  });
  return { state, errors, demoMedia };
}
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }

for (const failure of ['temporary', 'expired sign-in']) test(`delivery detail covers recover from ${failure} without refreshing or losing edits`, async ({ page }) => {
  const { state, errors } = await mock(page);
  await page.addInitScript(() => {
    window.revokedVideoCovers = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { window.revokedVideoCovers.push(url); revoke(url); };
  });
  state.project.assets[0].posterUrl = `/api/v1/videos/assets/${assetId}/poster`;
  let requests = 0, refreshes = 0, documents = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
  await page.route('**/api/v1/auth/refresh', route => { refreshes++; return route.fulfill({ json: { success: true } }); });
  await page.route(`**/api/v1/videos/assets/${assetId}/poster*`, async route => {
    requests++;
    if (failure === 'expired sign-in' && !refreshes) return route.fulfill({ status: 401, json: { success: false, code: 'SESSION_EXPIRED', message: 'Please sign in again.' } });
    if (failure === 'temporary' && requests <= 2) return route.fulfill({ status: 503, json: { success: false, message: 'Cover temporarily unavailable.' } });
    return route.fulfill({ contentType: 'image/webp', body: await readFile(new URL('../public/veylo/video/celebration.webp', import.meta.url)) });
  });
  await page.goto(`/create?draft=${id}`);
  await page.locator('.vc-bottom').getByRole('button', { name: 'Add details', exact: true }).click();
  await page.getByLabel('Video title', { exact: true }).fill('Ada and Emeka — final film');
  await expect.poll(() => page.locator('.vc-video-poster img').evaluateAll(images => images[0]?.naturalWidth || 0), { timeout: 12000 }).toBeGreaterThan(0);
  await expect(page.getByLabel('Video title', { exact: true })).toHaveValue('Ada and Emeka — final film');
  expect(requests).toBeGreaterThan(1);
  expect(refreshes).toBe(failure === 'expired sign-in' ? 1 : 0);
  expect(documents).toBe(1);
  const loadedCover = await page.locator('.vc-video-poster img').getAttribute('src');
  expect(loadedCover).toMatch(/^blob:/);
  await page.locator('.vc-bottom').getByRole('button', { name: 'Back', exact: true }).click();
  await expect.poll(() => page.evaluate(url => window.revokedVideoCovers.includes(url), loadedCover)).toBe(true);
  expect(errors).toEqual([]);
});

test('a failed library cover retries automatically and remains selectable without reopening the picker', async ({ page }) => {
  const { state, errors } = await mock(page);
  const video = { ...asset, id: '777777777777777777777777', filename: 'Reception.mp4', posterUrl: '/api/v1/videos/assets/777777777777777777777777/poster' };
  let requests = 0;
  await page.route('**/api/v1/videos/assets', route => route.fulfill({ json: { success: true, data: { assets: [video], nextCursor: null } } }));
  await page.route(`**/api/v1/videos/assets/${video.id}/poster*`, async route => {
    if (++requests === 1) return route.fulfill({ status: 503, json: { success: false } });
    return route.fulfill({ contentType: 'image/webp', body: await readFile(new URL('../public/veylo/video/celebration.webp', import.meta.url)) });
  });
  await page.goto(`/create?draft=${id}`);
  await page.getByRole('button', { name: 'Choose from your video library' }).click();
  const choice = page.getByRole('button', { name: 'Add Reception.mp4', exact: true });
  await expect.poll(() => choice.locator('img').evaluateAll(images => images[0]?.naturalWidth || 0), { timeout: 10000 }).toBeGreaterThan(0);
  await choice.click();
  await expect(page.getByRole('button', { name: 'Reception.mp4 added', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close video library' }).click();
  await page.locator('.vc-bottom').getByRole('button', { name: 'Add details', exact: true }).click();
  await expect(page.getByLabel('Video title', { exact: true })).toHaveCount(2);
  expect(state.project.video.draft.items.some(item => item.assetId === video.id)).toBe(true);
  expect(errors).toEqual([]);
});

test('unavailable covers stop retrying and can be retried without refreshing the delivery', async ({ page }) => {
  const { state, errors } = await mock(page);
  state.project.assets[0].posterUrl = `/api/v1/videos/assets/${assetId}/poster`;
  let available = false, requests = 0;
  await page.route(`**/api/v1/videos/assets/${assetId}/poster*`, async route => {
    requests++;
    if (!available) return route.fulfill({ status: 503, json: { success: false } });
    return route.fulfill({ contentType: 'image/webp', body: await readFile(new URL('../public/veylo/video/celebration.webp', import.meta.url)) });
  });
  await page.goto(`/create?draft=${id}`);
  await page.locator('.vc-bottom').getByRole('button', { name: 'Add details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry cover', exact: true })).toBeVisible({ timeout: 15000 });
  const stoppedAt = requests;
  await page.getByLabel('Video title', { exact: true }).fill('Keep my video title');
  await expect.poll(() => state.project.video.draft.items[0].title).toBe('Keep my video title');
  expect(requests).toBe(stoppedAt);
  expect(requests).toBeLessThanOrEqual(4);
  available = true;
  await page.getByRole('button', { name: 'Retry cover', exact: true }).click();
  await expect.poll(() => page.locator('.vc-video-poster img').evaluateAll(images => images[0]?.naturalWidth || 0)).toBeGreaterThan(0);
  await expect(page.getByLabel('Video title', { exact: true })).toHaveValue('Keep my video title');
  await expect(page.getByRole('group', { name: 'Video cover' })).toBeFocused();
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) test(`delivery details show complete landscape and portrait covers at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const { state, errors } = await mock(page);
  const films = [
    { id: assetId, filename: 'wedding-film.mp4', width: 1920, height: 1080, cover: 'celebration.webp' },
    { id: '444444444444444444444444', filename: 'vertical-highlight.mp4', width: 1080, height: 1920, cover: 'drummer.webp' }
  ];
  state.project.assets = films.map(film => ({ ...asset, ...film, posterUrl: `/api/v1/videos/assets/${film.id}/poster` }));
  state.project.video.draft.items = films.map(film => ({ ...presentation.items[0], assetId: film.id, title: film.filename }));
  await page.route('**/api/v1/videos/assets/*/poster', async route => {
    const film = films.find(film => route.request().url().includes(film.id));
    return route.fulfill({ contentType: 'image/webp', body: await readFile(new URL(`../public/veylo/video/${film.cover}`, import.meta.url)) });
  });
  await page.goto(`/create?draft=${id}`);
  await page.locator('.vc-bottom').getByRole('button', { name: 'Add details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery details.', exact: true })).toBeVisible();
  await expect(page.locator('.vc-video-poster img')).toHaveCount(2);
  for (const card of await page.locator('.vc-video-card').all()) {
    const poster = card.locator('.vc-video-poster');
    await expect.poll(() => poster.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    const layout = await card.evaluate(node => {
      const poster = node.querySelector('.vc-video-poster'), image = poster.querySelector('img'), editor = node.querySelector('.vc-video-edit');
      const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
      return { card: rect(node), poster: rect(poster), image: rect(image), editor: rect(editor), fit: getComputedStyle(image).objectFit };
    });
    expect(layout.fit).toBe('contain');
    expect(layout.image.x).toBeGreaterThanOrEqual(layout.poster.x - 1);
    expect(layout.image.y).toBeGreaterThanOrEqual(layout.poster.y - 1);
    expect(layout.image.right).toBeLessThanOrEqual(layout.poster.right + 1);
    expect(layout.image.bottom).toBeLessThanOrEqual(layout.poster.bottom + 1);
    if (width < 640) {
      expect(layout.poster.width).toBeGreaterThanOrEqual(layout.card.width - 3);
      expect(layout.editor.y).toBeGreaterThanOrEqual(layout.poster.bottom - 1);
    } else {
      expect(layout.editor.x).toBeGreaterThanOrEqual(layout.poster.right - 1);
      expect(Math.abs(layout.editor.y - layout.poster.y)).toBeLessThan(2);
      expect(layout.editor.width).toBeGreaterThan(300);
    }
    await expect(card.getByLabel('Video title', { exact: true })).toHaveValue(/\.mp4$/);
  }
  await page.screenshot({ path: `../.visual-review/video-details/covers-${width}.png`, fullPage: true });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

for (const width of [390, 768, 834]) test(`creation opens each step at its heading and saves the opening film at ${width}px`, async ({ page }) => {
  const { state, errors } = await mock(page, { aiAvailable: true });
  const secondId = '444444444444444444444444';
  state.project.assets.push({ ...asset, id: secondId, filename: 'reception.mp4' });
  state.project.video.draft.items.push({ ...presentation.items[0], assetId: secondId, title: 'The reception' });
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/create?draft=${id}`);
  await page.locator('.vc-bottom').getByRole('button', { name: 'Add details', exact: true }).click();
  const heading = page.locator('.vc-section-heading h2');
  await expect(heading).toBeFocused();
  await expect.poll(() => heading.evaluate(node => node.getBoundingClientRect().top)).toBeLessThan(160);
  await expect(page.getByText('Cover & writing options', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Writing suggestions for the delivery', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Downloads', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Open this video first', exact: true }).click();
  await page.screenshot({ path: `../.visual-review/video-creation-polish/details-${width}.png`, fullPage: true });
  await page.locator('.vc-bottom').getByRole('button', { name: 'Preview & send', exact: true }).click();
  await expect(heading).toBeFocused();
  await expect.poll(() => heading.evaluate(node => node.getBoundingClientRect().top)).toBeLessThan(160);
  expect(state.project.video.draft.featuredAssetId).toBe(secondId);
  await page.getByRole('button', { name: 'Create client link', exact: true }).click();
  expect(state.project.video.published.featuredAssetId).toBe(secondId);
  await expect(page.getByRole('heading', { name: 'Your delivery is ready.' })).toBeVisible();
  await expect(page.locator('.vc-steps')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Your delivery is ready.' })).toBeVisible();
  expect(state.saves.at(-1).presentation.featuredAssetId).toBe(secondId);
  await noOverflow(page); expect(errors).toEqual([]);
});

test('the chosen portrait opens first without briefly playing another film', async ({ page }) => {
  await mock(page); const starts = [];
  const films = [3, 4, 5].map(number => ({ ...asset, id: String(number).repeat(24), title: `Film ${number}`, width: 540, height: 960 }));
  await page.route('**/api/v1/videos/public/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/playback')) { starts.push(path.split('/').at(-2)); return route.fulfill({ json: { success: true, data: { sessionId: starts.at(-1), hlsUrl: '/veylo/video/portrait-study.mp4', expiresAt: new Date(Date.now() + 600000).toISOString() } } }); }
    if (path.endsWith('/playback/end')) return route.fulfill({ json: { success: true, data: {} } });
    return route.fulfill({ json: { success: true, data: { ...presentation, items: films, featuredAssetId: films[2].id, branding: {} } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/v/video-example-private-id');
  await expect(page.locator('.vv-reel.is-active')).toHaveAttribute('data-video-id', films[2].id);
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  expect(starts).toEqual([films[2].id]);
  await page.locator('.vv-feed').evaluate(feed => feed.scrollTo({ top: feed.clientHeight, behavior: 'instant' }));
  await expect(page.locator('.vv-reel.is-active')).toHaveAttribute('data-video-id', films[0].id);
});

test('preparation stays animated with device reduced motion and exposes status refresh failures', async ({ page }) => {
  const { state } = await mock(page); state.project.assets[0].state = 'processing';
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(`/create?draft=${id}`);
  const indicator = page.locator('.vc-upload-row .vc-activity-spin');
  await expect(indicator).toBeVisible();
  expect(await indicator.evaluate(node => node.getAnimations().some(animation => animation.playState === 'running'))).toBe(true);
  await page.route(`**/api/v1/videos/deliveries/${id}`, route => route.fulfill({ status: 503, json: { success: false } }));
  await page.clock.fastForward(6000);
  await expect(page.getByText(/Preparation status could not refresh/)).toBeVisible();
  await expect(indicator).toHaveCount(0);
  await page.unroute(`**/api/v1/videos/deliveries/${id}`);
  state.project.assets[0].state = 'ready';
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByText(/Preparation status could not refresh/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toBeEnabled();
});

test('a stalled original offers retry and resumes playback instead of loading forever', async ({ page }) => {
  await mock(page);
  await page.route('**/api/v1/videos/public/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/playback')) return route.fulfill({ json: { success: true, data: { sessionId: 'session', hlsUrl: '/veylo/video/light-study.mp4', expiresAt: new Date(Date.now() + 600000).toISOString() } } });
    return route.fulfill({ json: { success: true, data: { ...presentation, playbackMode: 'original', items: [{ ...asset, title: 'The ceremony' }], branding: {} } } });
  });
  await page.goto('/v/video-example-private-id');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await page.clock.install();
  await page.locator('video').evaluate(video => new Promise(resolve => { video.addEventListener('pause', resolve, { once: true }); video.pause(); }));
  await page.locator('video').evaluate(video => video.dispatchEvent(new Event('waiting')));
  await expect(page.locator('.vv-buffer')).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.getByText(/Video data stopped arriving/)).toBeVisible();
  await expect(page.locator('.vv-buffer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => !video.paused && video.currentTime > .1)).toBe(true);
  await expect(page.locator('.vv-error')).toHaveCount(0);
});

for (const width of [320, 390, 768, 834, 1440]) test(`vertical feed hands playback to the visible film and fills circular photographer image at ${width}px`, async ({ page }) => {
  const { errors } = await mock(page); const starts = []; const ends = [];
  const videos = [0, 1].map(index => ({ ...asset, id: String(index + 3).repeat(24), title: `Vertical film ${index + 1}`, description: 'The complete finished portrait film. '.repeat(20), width: 540, height: 960, duration: 8, allowDownload: true, posterUrl: '/veylo/video/portrait-study.webp' }));
  await page.route('**/api/v1/videos/public/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/playback/end')) { ends.push(route.request().postDataJSON().sessionId); return route.fulfill({ json: { success: true, data: {} } }); }
    if (path.endsWith('/playback')) { const id = path.split('/').at(-2); starts.push(id); return route.fulfill({ json: { success: true, data: { sessionId: id, hlsUrl: '/veylo/video/portrait-study.mp4', expiresAt: new Date(Date.now() + 600000).toISOString() } } }); }
    return route.fulfill({ json: { success: true, data: { ...presentation, items: videos, featuredAssetId: videos[0].id, branding: { name: 'Amara Studio', avatarUrl: '/veylo/web/photographer-480.webp' } } } });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/v/video-example-private-id');
  await expect(page.locator('.vv-feed')).toBeVisible(); await expect(page.locator('video')).toHaveCount(1);
  await expect(page.locator('.vv-desktop-device .v-phone-device')).toHaveCount(width > 1024 ? 1 : 0);
  await expect(page.getByText('Delivered with Veylo', { exact: true })).toHaveCount(0);
  await expect.poll(() => starts.length).toBe(1);
  const avatar = await page.locator('.vv-brand .vv-avatar img').evaluate(img => {
    const style = getComputedStyle(img), image = img.getBoundingClientRect(), circle = img.parentElement.getBoundingClientRect();
    return { fit: style.objectFit, radius: style.borderRadius, width: image.width, height: image.height, circle: circle.width };
  });
  expect(avatar.fit).toBe('cover'); expect(avatar.radius).toBe('50%'); expect(avatar.width).toBeCloseTo(avatar.height, 3); expect(Math.abs(avatar.width - avatar.circle)).toBeLessThanOrEqual(2);
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await page.locator('.vv-feed').evaluate(feed => feed.scrollTo({ top: feed.clientHeight, behavior: 'instant' }));
  await expect(page.locator('.vv-reel.is-active')).toHaveAttribute('data-video-id', videos[1].id);
  await expect(page.locator('video')).toHaveCount(1);
  await expect.poll(() => starts.length).toBe(2); await expect.poll(() => ends.length).toBe(1);
  await expect.poll(() => page.locator('video').evaluate(video => !video.paused && video.currentTime > .1)).toBe(true);
  await showVideoControls(page); await page.getByRole('button', { name: 'Pause video' }).click(); expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
  await page.getByRole('button', { name: 'Open film details' }).click(); await expect(page.getByRole('dialog', { name: videos[1].title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download Vertical film 2', exact: true })).toBeVisible();
  await noOverflow(page);
  if ([390, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/video-vertical-${width}.png` });
  expect(errors).toEqual([]);
});

test('three creation steps keep optional settings tucked away and retain a saved download choice', async ({ page }) => {
  const { state } = await mock(page); state.project.video.draft.allowDownloads = true;
  await page.goto(`/create?draft=${id}`);
  await expect(page.locator('.vc-steps button')).toHaveCount(3);
  await expect(page.getByLabel('Delivery title', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Add details/ }).click();
  const downloads = page.getByRole('checkbox', { name: 'Allow original downloads', exact: true }); await expect(downloads).toBeChecked();
  await expect(page.getByLabel('Cover frame (seconds)')).not.toBeVisible();
  await downloads.uncheck(); await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => state.project.video.draft.allowDownloads).toBe(false);
  await page.reload(); await page.getByRole('button', { name: /Add details/ }).click(); await expect(downloads).not.toBeChecked();
});

for (const width of [320, 834, 1440]) test(`a vertical opener reveals other formats and guides the next swipe at ${width}px`, async ({ page }) => {
  const { errors } = await mock(page); const starts = [];
  const films = [
    { ...asset, id: '3'.repeat(24), title: 'First vertical film', width: 540, height: 960 },
    { ...asset, id: '4'.repeat(24), title: 'Second vertical film', width: 540, height: 960 },
    { ...asset, id: '5'.repeat(24), title: 'The landscape film', width: 960, height: 540 },
  ];
  await page.route('**/api/v1/videos/public/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/playback/end')) return route.fulfill({ json: { success: true, data: {} } });
    if (path.endsWith('/playback')) {
      const id = path.split('/').at(-2); starts.push(id);
      return route.fulfill({ json: { success: true, data: { sessionId: id, hlsUrl: `/veylo/video/${id === films[2].id ? 'light-study' : 'portrait-study'}.mp4`, expiresAt: new Date(Date.now() + 600000).toISOString() } } });
    }
    return route.fulfill({ json: { success: true, data: { title: 'Wedding films', playbackMode: 'adaptive', items: films, featuredAssetId: films[0].id, branding: { name: 'Amara Studio' } } } });
  });
  await page.setViewportSize({ width, height: 900 }); await page.goto('/v/discovery-check');
  await expect(page.getByRole('button', { name: 'Choose a film' })).toBeVisible();
  await expect(page.locator('.vv-next-reel')).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate(video => video.readyState >= 2)).toBe(true);
  await page.locator('video').evaluate(video => { video.currentTime = video.duration - .1; });
  await expect(page.getByRole('button', { name: /Play next film:/ })).toBeVisible();
  await page.getByRole('button', { name: /Play next film:/ }).click();
  await expect(page.locator('.vv-reel.is-active')).toHaveAttribute('data-video-id', films[1].id);
  await expect(page.locator('.vv-next-reel')).toHaveCount(0);
  await chooseVideoFilm(page, /The landscape film/);
  await expect(page.locator('.vv-vertical-page')).toBeVisible();
  await expect(page.locator('.vv-reel.is-active .vv-film-caption')).toContainText('The landscape film');
  await expect(page.locator('video')).toHaveCount(1); await noOverflow(page);
  expect(starts).toContain(films[0].id); expect(starts).toContain(films[1].id); expect(starts).toContain(films[2].id);
  expect(errors).toEqual([]);
});
test('every video quality and cover must finish before either forward navigation path unlocks', async ({ page }) => {
  const { state } = await mock(page);
  state.project.assets.push({ ...asset, id: '555555555555555555555555', filename: 'reception.mp4' });
  state.project.video.draft.items.push({ ...presentation.items[0], assetId: '555555555555555555555555', title: 'The reception' });
  Object.assign(state.project.assets[0], { hasAdaptive: false, playbackReady: false, previewReady: false, expectedQualities: ['q720', 'q1080', 'q1440'], adaptive: { state: 'running', quality: 'q720', preparing: ['q720', 'q1080'], percent: 37, completed: [] } });
  await page.clock.install(); await page.goto(`/create?draft=${id}`);
  await expect(page.locator('.vc-upload-row').first()).toContainText('Preparing 720p & 1080p');
  await expect(page.locator('.vc-quality-progress .is-preparing')).toHaveCount(2);
  await expect(page.locator('.vc-quality-progress')).toContainText('37% prepared');
  const next = page.getByRole('button', { name: 'Add details', exact: true });
  const details = page.locator('.vc-steps button').nth(1);
  const review = page.locator('.vc-steps button').nth(2);
  await expect(next).toBeDisabled(); await expect(details).toBeDisabled(); await expect(review).toBeDisabled();
  await expect(page.locator('#vc-step-requirement')).toContainText('every playback quality');
  Object.assign(state.project.assets[0], { hasAdaptive: true, previewReady: true, adaptive: { state: 'running', quality: 'q1440', preparing: ['q1440'], percent: 67, completed: ['q720', 'q1080'] } });
  await page.clock.fastForward(6000);
  await expect(page.locator('.vc-quality-progress')).toContainText('67% prepared');
  await expect(next).toBeDisabled(); await expect(details).toBeDisabled(); await expect(review).toBeDisabled();
  expect(state.publishes).toBe(0);
  Object.assign(state.project.assets[0], { playbackReady: true, adaptive: { state: 'ready', completed: ['q720', 'q1080', 'q1440'], percent: 100 }, cover: { state: 'running' } });
  await page.clock.fastForward(6000);
  await expect(next).toBeDisabled(); await expect(details).toBeDisabled(); await expect(review).toBeDisabled();
  await expect(page.locator('#vc-step-requirement')).toContainText('video covers');
  state.project.assets[0].cover.state = 'ready'; await page.clock.fastForward(6000);
  await expect(next).toBeEnabled(); await next.click();
  await expect(page.getByRole('checkbox', { name: /Create adaptive playback copies/ })).toHaveCount(0);
  await page.getByLabel('Delivery title', { exact: true }).fill('Wedding films');
  await page.getByRole('button', { name: 'Preview & send', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Preview client view', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Create client link', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Create client link', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your delivery is ready.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Your delivery is ready.' })).toBeVisible();
});

test('a prepared compatible playback version handles an incompatible original without an opt-in', async ({ page }) => {
  const { state } = await mock(page); state.project.assets[0].originalCompatible = false;
  await page.goto(`/create?draft=${id}`); await page.getByRole('button', { name: 'Add details', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Create adaptive playback copies/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview & send', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Create client link', exact: true })).toBeEnabled();
});

test('upload step follows real preparation state and offers failed originals a retry', async ({ page }) => {
  const { state, errors } = await mock(page);
  state.project.assets[0].state = 'queued';
  await page.clock.install();
  await page.goto(`/create?draft=${id}`);
  await expect(page.locator('.vc-upload-row')).toContainText('Uploaded · waiting for preparation');
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toBeDisabled();
  await expect(page.locator('.vc-steps button').nth(1)).toBeDisabled();
  await expect(page.locator('.vc-steps button').nth(2)).toBeDisabled();
  await expect(page.getByRole('progressbar', { name: 'Preparation progress for ceremony.mp4' })).not.toHaveAttribute('value');
  await expect(page.locator('.vc-upload-guide')).toHaveCount(0);
  state.project.assets[0].state = 'processing';
  await page.clock.fastForward(6000);
  await expect(page.locator('.vc-upload-row')).toContainText('Checking video and preparing cover');
  state.project.assets[0].state = 'failed';
  state.project.assets[0].errorMessage = 'This video could not be prepared. You can retry or download the original.';
  await page.clock.fastForward(6000);
  await expect(page.locator('.vc-upload-row')).toContainText('Preparation failed');
  await expect(page.locator('.vc-upload-row [role="alert"]')).toBeVisible();
  let retries = 0;
  await page.route(`**/api/v1/videos/assets/${assetId}/retry`, route => {
    retries++; state.project.assets[0].state = 'queued'; delete state.project.assets[0].errorMessage;
    return route.fulfill({ json: { success: true, data: { queued: true } } });
  });
  await page.getByRole('button', { name: 'Retry preparation for ceremony.mp4' }).click();
  await expect.poll(() => retries).toBe(1);
  await expect(page.locator('.vc-upload-row')).toContainText('Uploaded · waiting for preparation');
  state.project.assets[0].state = 'ready';
  await page.clock.fastForward(6000);
  await expect(page.locator('.vc-upload-row')).toContainText('Ready for playback');
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toBeEnabled();
  await expect(page.locator('.vc-upload-row [role=progressbar]')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('.vc-upload-row')).not.toContainText('preparing playback');
  await page.reload();
  await expect(page.locator('.vc-upload-row')).toContainText('Ready for playback');
  expect(errors).toEqual([]);
});

test('an extra uploading or paused file blocks navigation even when another video is ready', async ({ page }) => {
  const { state } = await mock(page);
  const extraId = '555555555555555555555555';
  await page.route(`**/api/v1/videos/deliveries/${id}/uploads`, route => {
    state.project.video.draft.items.push({ assetId: extraId, title: 'Extra film', description: '', posterSeconds: 0, allowDownload: null });
    state.project.assets.push({ ...asset, id: extraId, filename: 'extra.mp4', state: 'uploading' });
    return route.fulfill({ json: { success: true, data: { id: 'test-upload', assetId: extraId } } });
  });
  await page.route('**/api/v1/videos/uploads/test-upload', route => route.fulfill({ json: { success: true, data: { state: 'uploading', parts: [], partCount: 1, partBytes: 1024 } } }));
  await page.route('**/api/v1/videos/uploads/test-upload/part', route => route.fulfill({ json: { success: true, data: { url: 'https://upload-test.example/part' } } }));
  await page.route('https://upload-test.example/part', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': '*' } });
    // Leave the transfer pending so pause and forward navigation can be checked.
  });
  await page.goto(`/create?draft=${id}`);
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toBeEnabled();
  await page.locator('.vc-upload input[type=file]').first().setInputFiles({ name: 'extra.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(1024) });
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toBeDisabled();
  await expect(page.locator('.vc-steps button').nth(1)).toBeDisabled();
  await expect(page.getByRole('progressbar', { name: 'Upload progress for extra.mp4' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause extra.mp4' }).click();
  await expect(page.locator('.vc-upload-row').filter({ hasText: 'extra.mp4' })).toContainText('Paused');
  await expect(page.locator('#vc-step-requirement')).toContainText('Resume or remove');
  await page.getByRole('button', { name: 'Remove upload extra.mp4' }).click();
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toBeEnabled();
});

test('required titles, cover readiness, PIN and expiry gate both forward navigation paths', async ({ page }) => {
  const { state } = await mock(page); state.project.video.draft.title = '';
  await page.clock.install(); await page.goto(`/create?draft=${id}`);
  await page.getByRole('button', { name: 'Add details', exact: true }).click();
  const next = page.getByRole('button', { name: 'Preview & send', exact: true });
  const sidebarNext = page.locator('.vc-steps button').nth(2);
  await expect(next).toBeDisabled(); await expect(sidebarNext).toBeDisabled();
  await expect(page.locator('#vc-step-requirement')).toHaveText('Add a delivery title before continuing.');
  await page.getByLabel('Delivery title', { exact: true }).fill('Wedding films');
  await page.getByLabel('Video title', { exact: true }).fill(''); await expect(next).toBeDisabled();
  await page.getByLabel('Video title', { exact: true }).fill('The ceremony');
  await page.getByText('PIN & link expiry', { exact: false }).click();
  await page.getByRole('checkbox', { name: /Protect this link/ }).check();
  await expect(next).toBeDisabled();
  await page.getByLabel('Six-digit PIN', { exact: false }).fill('123'); await expect(next).toBeDisabled(); await expect(sidebarNext).toBeDisabled();
  await page.getByLabel('Six-digit PIN', { exact: false }).fill('123456');
  await page.getByLabel('Link expiry', { exact: false }).fill('2020-01-01'); await expect(next).toBeDisabled();
  await page.getByLabel('Link expiry', { exact: false }).fill('');
  await expect(next).toBeEnabled();
  state.project.assets[0].cover = { state: 'queued' };
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(next).toBeDisabled(); await expect(sidebarNext).toBeDisabled();
  state.project.assets[0].cover.state = 'ready'; await page.clock.fastForward(6000);
  await expect(next).toBeEnabled(); await expect(sidebarNext).toBeEnabled();
  await sidebarNext.click();
  await expect(page.getByRole('button', { name: 'Create client link', exact: true })).toBeEnabled();
});

for (const width of [390, 834, 1440]) test(`real adaptive HLS plays, seeks and keeps original audio at ${width}px`, async ({ page }) => {
  const fixture = new URL('../../.visual-review/video-hls/landscape/', import.meta.url);
  test.skip(!existsSync(fileURLToPath(new URL('master.m3u8', fixture))), 'Generate real fixtures with the server video encoding tests first.');
  const { errors } = await mock(page); const requested = [];
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__hls__/**', async route => {
    const file = new URL(route.request().url()).pathname.slice('/__hls__/'.length);
    if (!/^(master\.m3u8|q\d+\/(?:index\.m3u8|s\d{6}\.ts))$/.test(file)) return route.abort();
    requested.push(file);
    await route.fulfill({ contentType: file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl', body: await readFile(new URL(file, fixture)) });
  });
  await page.route('**/api/v1/videos/public/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/playback') ? { sessionId: '44444444-4444-4444-8444-444444444444', hlsUrl: '/__hls__/master.m3u8', expiresAt: new Date(Date.now() + 600000).toISOString() } : path.endsWith('/playback/end') ? {} : { ...presentation, items: [{ ...asset, ...presentation.items[0], duration: 8, width: 1920, height: 1080 }], branding: { name: 'Amara Studio' } };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/v/' + 'a'.repeat(24));
  await expect(page.locator('video')).toHaveCount(1);
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime), { timeout: 15000 }).toBeGreaterThan(.2);
  expect(await page.locator('video').evaluate(video => video.muted)).toBe(true);
  await page.getByRole('button', { name: 'Unmute video', exact: true }).click();
  expect(await page.locator('video').evaluate(video => video.muted)).toBe(false);
  if (width === 1440) await expect.poll(() => new Set(requested.filter(file => file.endsWith('.ts')).map(file => file.split('/')[0])).size, { timeout: 10000 }).toBeGreaterThan(1);
  await page.locator('video').evaluate(video => { video.pause(); video.currentTime = 6.2; });
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(6);
  expect(requested).toContain('master.m3u8');
  expect(requested.some(file => /q\d+\/s\d+\.ts/.test(file))).toBe(true);
  await expect(page.locator('.vv-error')).toHaveCount(0); await noOverflow(page);
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 768, 834, 1024, 1440]) test(`client demo fits ${width}px with muted autoplay and photographer branding`, async ({ page }) => {
  const { errors, demoMedia } = await mock(page); await page.setViewportSize({ width, height: 950 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/demo/video');
  await expect(page.getByRole('heading', { name: 'A celebration, in full view' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(1); await expect.poll(() => page.locator('video').evaluate(video => !video.paused && video.muted)).toBe(true);
  await expect(page.locator('.vv-brand')).toContainText('Example studio');
  await expect(page.locator('.vv-download')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unmute video', exact: true })).toHaveCount(0);
  expect(demoMedia).toContain('celebration-a1a6b543.mp4'); await noOverflow(page);
  await chooseVideoFilm(page, /The drummer, up close/); await expect(page.locator('.vv-reel.is-active .vv-screen')).toHaveClass(/is-portrait/);
  await expect(page.locator('.vv-download')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Unmute video|Mute video|Enable sound/ })).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate(video => !video.paused)).toBe(true);
  expect(demoMedia).toContain('drummer-7510db80.mp4'); await noOverflow(page);
  if (width === 390 || width === 834) await page.screenshot({ path: `../.visual-review/video-demo-${width}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
test('Pexels demo seeks, has no downloads or audio controls and keeps one player when changing films', async ({ page }) => {
  await mock(page); await page.goto('/demo/video');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  expect(await page.locator('video').evaluate(video => video.muted)).toBe(true);
  await expect(page.getByRole('button', { name: 'Unmute video', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Download/ })).toHaveCount(0);
  await page.locator('video').evaluate(video => { video.pause(); video.currentTime = 4; }); await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(3.9);
  await chooseVideoFilm(page, /The drummer, up close/); await expect(page.locator('video')).toHaveCount(1);
  await expect.poll(() => page.locator('video').evaluate(video => !video.paused && video.muted)).toBe(true);
  await expect(page.getByRole('link', { name: /Download/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Unmute video|Mute video|Enable sound/ })).toHaveCount(0);
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
  await page.goto('/v/video-example-private-id');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await page.locator('video').evaluate(video => { video.loop = true; video.currentTime = 4; });
  await expect(page.locator('.vv-buffer')).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate(video => !video.seeking && video.readyState >= 3 && !video.paused)).toBe(true);
  await page.clock.fastForward(4 * 60_000);
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[1].sessionId).toBe('session-1'); expect(requests[2].sessionId).toBeUndefined();
  await expect(page.locator('video')).toHaveCount(1);
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(3.9);
  await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(false);
  await expect.poll(() => ended).toBe(1); // The expired session is released after replacement.
  await chooseVideoFilm(page, /Reception film/);
  await expect.poll(() => ended).toBe(2); expect(errors).toEqual([]);
});
for (const width of [320, 768, 834]) test(`creator saves, reviews and publishes a separate snapshot at ${width}px`, async ({ page }) => {
  const { state, errors } = await mock(page); await page.setViewportSize({ width, height: 1000 }); await page.goto(`/create?draft=${id}`);
  await expect(page.getByRole('heading', { name: 'Add your finished videos.' })).toBeVisible(); await page.getByRole('button', { name: 'Details', exact: false }).first().click(); await page.getByLabel('Delivery title', { exact: true }).fill('A revised wedding title');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await expect.poll(() => state.saves.at(-1)?.presentation.title).toBe('A revised wedding title');
   await expect(page.getByLabel('Video title', { exact: true })).toHaveValue('The ceremony'); await noOverflow(page);
  await page.getByRole('textbox', { name: 'Description', exact: false }).fill('The vows, readings and final walk together, in the order they happened.');
  await page.getByRole('button', { name: 'Preview & send', exact: true }).first().click(); await page.getByRole('button', { name: /Create client link|Update client link/ }).click();
  await expect.poll(() => state.publishes).toBe(1); await expect(page.getByRole('link', { name: 'Open delivery', exact: true })).toBeVisible();
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
test('a previously created closed delivery cannot reopen upload or details on a direct visit or refresh', async ({ page }) => {
  const { state } = await mock(page);
  state.project.publishedAt = new Date().toISOString(); state.project.video.published = structuredClone(state.project.video.draft);
  await page.goto(`/create?draft=${id}`);
  await expect(page.getByText('This client link is closed.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Video creation steps' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  expect(state.saves).toEqual([]); expect(state.publishes).toBe(0);
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

for (const width of [320, 390, 768, 834, 1024, 1440]) test(`library covers identify videos and selected files stay visible before autosave at ${width}px`, async ({ page }) => {
  const { state, errors } = await mock(page);
  const nextId = '444444444444444444444444';
  const nextAsset = { ...asset, id: nextId, filename: 'Reception - final portrait edit.mp4', width: 540, height: 960, posterUrl: `/api/v1/videos/assets/${nextId}/poster?v=cover-one` };
  const pending = { ...asset, id: '555555555555555555555555', filename: 'still-preparing.mp4', state: 'processing' };
  let releaseSave;
  const saveWait = new Promise(resolve => { releaseSave = resolve; });
  const heavyRequests = [];
  page.on('request', request => { if (/\.(mp4|mov|webm)(?:\?|$)|\/playback(?:\?|$)|\/download(?:\?|$)/.test(request.url())) heavyRequests.push(request.url()); });
  await page.route('**/api/v1/videos/assets', route => route.fulfill({ json: { success: true, data: { assets: [{ ...asset, posterUrl: '/veylo/video/celebration.webp' }, nextAsset, pending], nextCursor: null } } }));
  await page.route(`**/api/v1/videos/assets/${nextId}/poster*`, async route => route.fulfill({ contentType: 'image/webp', body: await readFile(new URL('../public/veylo/video/drummer.webp', import.meta.url)) }));
  await page.route(`**/api/v1/videos/deliveries/${id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON();
    await saveWait;
    state.saves.push(body); state.project.video.draft = body.presentation; state.project.video.revision++;
    state.project.assets = body.presentation.items.map(item => [asset, nextAsset].find(video => video.id === item.assetId));
    return route.fulfill({ json: { success: true, data: state.project } });
  });
  await page.setViewportSize({ width, height: 950 });
  await page.goto(`/create?draft=${id}`);
  await expect(page.locator('.vc-upload-guide')).toHaveCount(0);
  await expect(page.locator('.vc-upload-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose from your video library', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Your video library' });
  await expect(picker.getByRole('heading', { name: 'Your video library' })).toBeFocused();
  await expect(picker.getByRole('button', { name: 'ceremony.mp4 added', exact: true })).toBeDisabled();
  await expect(picker.getByRole('button', { name: /still-preparing/ })).toHaveCount(0);
  const choice = picker.getByRole('button', { name: 'Add ' + nextAsset.filename, exact: true });
  await choice.scrollIntoViewIfNeeded();
  await expect.poll(() => choice.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await choice.locator('img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
  const imageBounds = await choice.locator('img').boundingBox();
  const coverBounds = await choice.locator('.vc-library-cover').boundingBox();
  expect(imageBounds.width).toBeCloseTo(coverBounds.width, 0);
  expect(imageBounds.height).toBeCloseTo(coverBounds.height, 0);
  await expect(choice).toContainText('Add video');
  await noOverflow(page);
  await expect.poll(() => picker.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await picker.screenshot({ path: `../.visual-review/video-creation-library/picker-${width}.png` });
  await choice.click();
  await expect(picker.getByRole('button', { name: nextAsset.filename + ' added', exact: true })).toBeDisabled();
  await expect(picker.getByText('2 / 10 added', { exact: true })).toBeVisible();
  await expect(page.locator('.vc-upload-row').filter({ hasText: nextAsset.filename })).toContainText('Ready for playback');
  expect(state.project.assets).toHaveLength(1);
  await page.getByRole('button', { name: 'Close video library' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose from your video library', exact: true })).toBeFocused();
  await expect(page.locator('.vc-upload-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Add details', exact: true })).toBeEnabled();
  releaseSave();
  await page.getByRole('button', { name: 'Add details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery details.', exact: true })).toBeVisible();
  await expect(page.getByLabel('Video title', { exact: true }).nth(1)).toHaveValue('Reception - final portrait edit');
  await expect(page.locator('.vc-quality')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Allow original downloads', exact: true })).not.toBeChecked();
  expect(state.project.video.draft.items.map(item => item.assetId)).toEqual([assetId, nextId]);
  expect(heavyRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('library pagination keeps cover fallbacks selectable and enforces ten unique videos', async ({ page }) => {
  const { state, errors } = await mock(page);
  const originals = Array.from({ length: 9 }, (_, index) => ({ ...asset, id: String(index + 1).repeat(24), filename: `film-${index + 1}.mp4` }));
  state.project.assets = originals;
  state.project.video.draft.items = originals.map(video => ({ assetId: video.id, title: video.filename, description: '', posterSeconds: 0, allowDownload: null }));
  const tenth = { ...asset, id: 'a'.repeat(24), filename: 'The reception.mp4' };
  const extra = { ...asset, id: 'b'.repeat(24), filename: 'Another final film.mp4', posterUrl: '/__missing_video_cover__.webp' };
  const cursors = [];
  await page.route('**/api/v1/videos/assets*', route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor'); cursors.push(cursor);
    return route.fulfill({ json: { success: true, data: { assets: cursor ? [extra] : [originals[0], tenth], nextCursor: cursor ? null : tenth.id } } });
  });
  await page.route('**/__missing_video_cover__.webp', route => route.fulfill({ status: 404, body: 'Missing' }));
  await page.goto(`/create?draft=${id}`);
  await page.getByRole('button', { name: 'Choose from your video library', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Your video library' });
  await picker.getByRole('button', { name: 'Load more videos', exact: true }).click();
  const extraChoice = picker.getByRole('button', { name: 'Add ' + extra.filename, exact: true });
  await extraChoice.scrollIntoViewIfNeeded();
  await expect(extraChoice.getByText('Cover unavailable', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(extraChoice).toBeEnabled();
  await picker.getByRole('button', { name: 'Add ' + tenth.filename, exact: true }).click();
  await expect(picker.getByText('10 / 10 added', { exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: tenth.filename + ' added', exact: true })).toBeDisabled();
  await expect(extraChoice).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect(new Set(state.project.video.draft.items.map(item => item.assetId)).size).toBe(10);
  expect(cursors).toEqual([null, tenth.id]);
  expect(errors).toEqual([]);
});

test('an empty video library offers a clear empty state without a broken picker', async ({ page }) => {
  const { errors } = await mock(page);
  await page.route('**/api/v1/videos/assets', route => route.fulfill({ json: { success: true, data: { assets: [], nextCursor: null } } }));
  await page.goto(`/create?draft=${id}`);
  await page.getByRole('button', { name: 'Choose from your video library', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Your video library' });
  await expect(picker.getByText('No ready videos in your library yet.', { exact: true })).toBeVisible();
  await expect(picker.locator('.vc-library-card')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Choose from your video library', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
