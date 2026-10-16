import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { chooseVideoFilm, showVideoControls } from './helpers/videoClient.js';

const films = [
  { id: '3'.repeat(24), title: 'The wedding film', width: 640, height: 360, fixture: 'wide', allowDownload: true },
  { id: '4'.repeat(24), title: 'A moment from the reception', width: 360, height: 640, fixture: 'tall', allowDownload: false },
  { id: '5'.repeat(24), title: 'The square edit', width: 480, height: 480, fixture: 'square', allowDownload: true }
].map(film => ({ ...film, duration: 4, hasAudio: true, bytes: 2048000, posterUrl: '/veylo/video/portrait-study.webp', description: 'Your finished film, with the moments your family will want to watch again. '.repeat(18) }));

async function openDelivery(page, { portrait = false } = {}) {
  const state = { starts: [], ends: [], errors: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  await page.route('**/__viewer__/*.mp4', async route => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = await readFile(new URL('./fixtures/video-ratios/' + file, import.meta.url));
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
    const first = range ? Number(range[1]) : 0;
    const last = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    await route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': 'bytes ' + first + '-' + last + '/' + body.length } : {}) }, body: body.subarray(first, last + 1) });
  });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/playback/end')) state.ends.push(route.request().postDataJSON().sessionId);
    else if (path.endsWith('/playback')) {
      const film = films.find(film => film.id === path.split('/').at(-2));
      state.starts.push(film.id);
      data = { sessionId: film.id, hlsUrl: '/__viewer__/' + film.fixture + '.mp4', expiresAt: new Date(Date.now() + 600000).toISOString() };
    } else if (path.includes('/videos/public/')) data = { title: 'Ada & Emeka', introduction: 'Your wedding films are ready. Thank you for trusting us with your day.', featuredAssetId: films[portrait ? 1 : 0].id, items: films, branding: { name: 'Amara Studio', avatarUrl: '/veylo/web/photographer-480.webp', website: 'https://example.com' } };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/v/client-view-check');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.05);
  await page.locator('video').evaluate(video => { video.loop = true; });
  return state;
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [834, 1112], [844, 390], [1440, 900]]) {
  test('the same viewer fits every film shape and keeps details reachable at ' + width + 'x' + height, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await openDelivery(page, { portrait: true });
    const originalFrameCount = await page.locator('.v-phone-device').count();
    for (const film of [films[1], films[0], films[2]]) {
      if (film !== films[1]) await chooseVideoFilm(page, new RegExp(film.title));
      await expect(page.locator('.vv-reel.is-active')).toHaveAttribute('data-video-id', film.id);
      await expect(page.locator('video')).toHaveCount(1);
      await expect.poll(() => page.locator('video').evaluate(video => !video.paused && video.readyState >= 2)).toBe(true);
      await page.locator('video').evaluate(video => { video.loop = true; });
      expect(await page.locator('video').evaluate(video => getComputedStyle(video).objectFit)).toBe('contain');
      await expect(page.getByRole('button', { name: 'Open film details' })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Choose a film' })).toBeInViewport();
      expect(await page.locator('.v-phone-device').count()).toBe(originalFrameCount);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const header = await page.locator('.vv-brand').boundingBox();
      const picture = await page.locator('.vv-playback').boundingBox();
      const caption = await page.locator('.vv-reel.is-active .vv-film-caption').boundingBox();
      expect(picture.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
      expect(picture.y + picture.height).toBeLessThanOrEqual(caption.y + 1);
    }
    await page.getByRole('button', { name: 'Open film details' }).click();
    const dialog = page.getByRole('dialog', { name: films[2].title });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close film details' })).toBeInViewport();
    const download = dialog.getByRole('link', { name: 'Download ' + films[2].title });
    await download.scrollIntoViewIfNeeded();
    await expect(download).toBeInViewport();
    await expect(download).toHaveAttribute('href', new RegExp('/assets/' + films[2].id + '/download'));
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open film details' })).toBeFocused();
    expect(state.errors).toEqual([]);
    await page.screenshot({ path: '../.visual-review/video-client-redesign-' + width + '.png' });
  });
}

test('details pause and resume the same player, retain a deliberate pause and enforce download choices', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await openDelivery(page);
  const position = await page.locator('video').evaluate(video => video.currentTime);
  await page.getByRole('button', { name: 'Open film details' }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(true);
  const dialog = page.getByRole('dialog', { name: films[0].title });
  await expect(dialog.getByRole('button', { name: 'Close film details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.locator('video').evaluate((video, at) => !video.paused && video.currentTime >= at, position)).toBe(true);
  expect(state.starts).toHaveLength(1);
  await showVideoControls(page);
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  await page.getByRole('button', { name: 'Open film details' }).click();
  await page.getByRole('button', { name: 'Close film details' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
  await chooseVideoFilm(page, /A moment from the reception/);
  await page.getByRole('button', { name: 'Open film details' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: /Download/ })).toHaveCount(0);
  expect(state.starts).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

test('one sound control, keyboard seeking and fullscreen work for landscape and portrait', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  const state = await openDelivery(page);
  for (const film of [films[0], films[1]]) {
    if (film !== films[0]) await chooseVideoFilm(page, new RegExp(film.title));
    await expect.poll(() => page.locator('video').evaluate(video => video.readyState >= 2)).toBe(true);
    await page.locator('video').evaluate(video => { video.loop = true; });
    const player = page.getByRole('group', { name: film.title + ' player', exact: true });
    await player.focus();
    await expect(page.getByRole('button', { name: /Unmute video|Mute video/ })).toHaveCount(1);
    await player.press('k');
    await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(true);
    await player.press('ArrowRight');
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(3.5);
    await player.press('ArrowLeft');
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeLessThan(.1);
    const before = await page.locator('video').evaluate(video => video.muted);
    await player.press('m');
    expect(await page.locator('video').evaluate(video => video.muted)).toBe(!before);
    await page.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  }
  expect(state.errors).toEqual([]);
});

test('controls fade during playback, return with keyboard focus and keep details available at the end', async ({ page }) => {
  const state = await openDelivery(page);
  await page.clock.install();
  await page.mouse.move(2, 2);
  await page.clock.fastForward(3500);
  await expect(page.locator('.vv-playback')).toHaveClass(/is-controls-hidden/);
  await showVideoControls(page);
  await expect(page.locator('.vv-playback')).not.toHaveClass(/is-controls-hidden/);
  await page.getByRole('button', { name: 'Pause video' }).click();
  await page.clock.fastForward(4000);
  await expect(page.locator('.vv-playback')).not.toHaveClass(/is-controls-hidden/);
  await page.locator('video').evaluate(video => { video.loop = false; video.dispatchEvent(new Event('ended')); });
  await expect(page.getByRole('button', { name: 'Play next film: ' + films[1].title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open film details' })).toBeInViewport();
  await page.getByRole('button', { name: 'Play next film: ' + films[1].title }).click();
  await expect(page.locator('.vv-reel.is-active')).toHaveAttribute('data-video-id', films[1].id);
  await expect(page.locator('video')).toHaveCount(1);
  await expect.poll(() => state.ends.length).toBe(1);
  expect(state.errors).toEqual([]);
});
