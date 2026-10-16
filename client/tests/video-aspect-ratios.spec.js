import { test, expect } from '@playwright/test';
import { chooseVideoFilm } from './helpers/videoClient.js';
import { readFile } from 'node:fs/promises';

const shapes = [
  ['Square 1:1', 'square', 480, 480], ['Classic 4:3', 'classic', 640, 480],
  ['Landscape 16:9', 'wide', 640, 360], ['Cinema 21:9', 'cinema', 840, 360],
  ['Ultrawide 32:9', 'ultrawide', 960, 270], ['Unknown dimensions', 'wide', 0, 0],
  ['Portrait 4:5', 'portrait', 480, 600], ['Portrait 2:3', 'portrait-classic', 400, 600],
  ['Portrait 9:16', 'tall', 360, 640]
];
const films = shapes.map(([title, fixture, width, height], index) => ({ id: (index + 3).toString(16).repeat(24), title, fixture, width, height, duration: 4, hasAudio: false, allowDownload: false, description: 'The full original frame stays visible.' }));

for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [834, 1112], [844, 390], [1440, 700], [1440, 1000]]) {
  test(`mixed aspect ratios fit ${width}x${height}, preserve originals and release the previous player`, async ({ page }) => {
    const starts = [], ends = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
    await page.route('**/__ratio_fixture__/*.mp4', async route => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      const body = await readFile(new URL(`./fixtures/video-ratios/${name}`, import.meta.url));
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      await route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) }, body: body.subarray(start, end + 1) });
    });
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path.endsWith('/playback/end')) ends.push(route.request().postDataJSON().sessionId);
      else if (path.endsWith('/playback')) {
        const film = films.find(item => item.id === path.split('/').at(-2));
        starts.push(film.id);
        data = { sessionId: film.id, hlsUrl: `/__ratio_fixture__/${film.fixture}.mp4`, expiresAt: new Date(Date.now() + 600000).toISOString() };
      } else if (path.includes('/videos/public/')) data = { title: 'Films in every frame', items: films, featuredAssetId: films[0].id, branding: { name: 'Test studio' } };
      return route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/v/aspect-ratio-test');
    async function checkVideo(film) {
      await expect(page.locator('video')).toHaveCount(1);
      await expect.poll(() => page.locator('video').evaluate(video => video.readyState >= 2 && video.currentTime > .05 && !video.paused)).toBe(true);
      const actual = await page.locator('video').evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, fit: getComputedStyle(video).objectFit }));
      expect(actual.fit).toBe('contain');
      expect(actual.width).toBe(film.width || 640); expect(actual.height).toBe(film.height || 360);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    for (const film of films) {
      if (film !== films[0]) await chooseVideoFilm(page, new RegExp(film.title));
      await expect(page.locator('.vv-reel.is-active')).toHaveAttribute('data-video-id', film.id);
      await checkVideo(film);
      const picture = await page.locator('.vv-playback').boundingBox();
      const screen = await page.locator('.vv-reel.is-active .vv-screen').boundingBox();
      expect(picture.width / picture.height).toBeCloseTo(film.width && film.height ? film.width / film.height : 16 / 9, 1);
      expect(picture.x).toBeGreaterThanOrEqual(screen.x - 1);
      expect(picture.y).toBeGreaterThanOrEqual(screen.y - 1);
      expect(picture.x + picture.width).toBeLessThanOrEqual(screen.x + screen.width + 1);
      expect(picture.y + picture.height).toBeLessThanOrEqual(screen.y + screen.height + 1);
      const caption = await page.locator('.vv-reel.is-active .vv-film-caption').boundingBox();
      expect(caption.y).toBeGreaterThanOrEqual(screen.y + screen.height - 1);
      expect(caption.y + caption.height).toBeLessThanOrEqual(height + 1);
      await expect(page.getByRole('button', { name: 'Open film details' })).toBeInViewport();
      // A square opening keeps the same presentation when a portrait is selected.
      await expect(page.locator('.v-phone-device')).toHaveCount(0);
    }
    await chooseVideoFilm(page, /Square 1:1/);
    await checkVideo(films[0]);
    await expect.poll(() => starts.length).toBe(10); await expect.poll(() => ends.length).toBe(9);
    expect(errors).toEqual([]);
    await page.locator('.vv-reel.is-active').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../.visual-review/video-ratios-${width}-${height}.png` });
  });
}
