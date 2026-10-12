import { test, expect, webkit } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const cases = [
  { name: 'original landscape', directory: 'original-landscape', mode: 'original', width: 640, height: 360, duration: 8 },
  { name: 'original portrait', directory: 'original-portrait', mode: 'original', width: 360, height: 640, duration: 8 },
  { name: 'adaptive landscape', directory: 'landscape', mode: 'adaptive', width: 1920, height: 1080, duration: 8 },
  { name: 'adaptive portrait', directory: 'portrait', mode: 'adaptive', width: 720, height: 1280, duration: 8 },
  { name: 'native fast-start MP4', directory: 'original-long-gop', mode: 'original', width: 640, height: 360, duration: 14, file: 'playback.mp4' },
  { name: 'original 4K', directory: 'original-4k', mode: 'original', width: 3840, height: 2160, duration: 1 },
  { name: 'rotated original MP4', directory: 'original-rotated', mode: 'original', width: 360, height: 640, duration: 8, file: 'playback.mp4' },
  { name: 'silent original', directory: 'original-silent', mode: 'original', width: 640, height: 360, duration: 8, silent: true },
  { name: 'native WebM', directory: 'original-webm', mode: 'original', width: 640, height: 360, duration: 8, file: 'playback.webm' }
];
async function setup(page, scenario, { failedSegments = 0, failedFiles = 0, renewalStatus = 200, mediaOrigin = '' } = {}) {
  const fixture = new URL(`../../.visual-review/video-hls/${scenario.directory}/`, import.meta.url);
  const source = scenario.file || 'master.m3u8';
  test.skip(!existsSync(fileURLToPath(new URL(source, fixture))), 'Run server verify:video with full FFmpeg first.');
  const state = { starts: [], ended: [], media: [], segmentFailures: 0, fileRequests: 0, renew: null, errors: [] };
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/__playback__/**', async route => {
    const file = new URL(route.request().url()).pathname.slice('/__playback__/'.length);
    if (!/^(master\.m3u8|playback\.(mp4|webm)|q\d+\/(?:index\.m3u8|s\d{6}\.ts))$/.test(file)) return route.abort();
    state.media.push(file);
    if (file.endsWith('.ts') && state.segmentFailures++ < failedSegments) return route.fulfill({ status: 503, body: 'Temporary connection failure' });
    if (file.endsWith('.mp4') && state.fileRequests++ < failedFiles) return route.fulfill({ status: 503, body: 'Temporary connection failure' });
    const body = await readFile(new URL(file, fixture));
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
    const first = range ? Number(range[1]) : 0; const last = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: file.endsWith('.ts') ? 'video/mp2t' : file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.webm') ? 'video/webm' : 'application/vnd.apple.mpegurl', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${first}-${last}/${body.length}` } : {}) }, body: body.subarray(first, last + 1) });
  });
  const film = { id: '333333333333333333333333', title: 'The finished film', width: scenario.width, height: scenario.height, duration: scenario.duration, hasAudio: !scenario.silent, bytes: scenario.bytes };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const ok = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith('/playback/end')) { state.ended.push(route.request().postDataJSON().sessionId); return ok({}); }
    if (path.endsWith('/playback')) {
      state.starts.push(route.request().postDataJSON());
      if (state.starts.length === 2 && state.renew) await state.renew;
      if (state.starts.length === 2 && renewalStatus !== 200) return route.fulfill({ status: renewalStatus, json: { success: false, message: 'Playback access could not be renewed.' } });
      return ok({ sessionId: 'stable-session', hlsUrl: mediaOrigin + '/__playback__/' + source, expiresAt: new Date(Date.now() + 600000).toISOString(), renewAfterSeconds: 15 });
    }
    if (path.includes('/videos/public/')) return ok({ title: 'Your finished films', playbackMode: scenario.mode, items: [film], featuredAssetId: film.id, branding: { name: 'Amara Studio' } });
    return ok({});
  });
  return state;
}
async function watchLoads(page) {
  await page.locator('video').evaluate(video => {
    video.loop = true; window.playbackLoads = [];
    for (const event of ['emptied', 'loadstart']) video.addEventListener(event, () => window.playbackLoads.push(event));
  });
}

for (const scenario of cases) for (const width of [390, 834]) test(`${scenario.name} plays, seeks and renews without losing its buffer at ${width}px`, async ({ page }) => {
  const state = await setup(page, scenario);
  await page.clock.install(); await page.setViewportSize({ width, height: 1000 }); await page.goto('/v/playback-check');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  if (scenario.mode === 'original') expect(await page.locator('video').evaluate(video => [video.videoWidth, video.videoHeight])).toEqual([scenario.width, scenario.height]);
  await watchLoads(page);
  await page.clock.fastForward(16000);
  await expect.poll(() => state.starts.length).toBe(2);
  expect(state.starts[1]).toEqual({ sessionId: 'stable-session' });
  expect(await page.evaluate(() => window.playbackLoads)).toEqual([]);
  expect(await page.locator('video').evaluate(video => !video.paused && video.buffered.length > 0)).toBe(true);
  if (!scenario.file) expect(state.media.filter(file => file === 'master.m3u8')).toHaveLength(1);
  if (scenario.silent) await expect(page.getByRole('button', { name: 'Enable sound', exact: true })).toHaveCount(0);
  else { await page.getByRole('button', { name: 'Enable sound', exact: true }).click(); expect(await page.locator('video').evaluate(video => video.muted)).toBe(false); }
  const seek = scenario.duration > 2 ? scenario.duration - 2 : .5;
  await page.locator('video').evaluate((video, time) => { video.pause(); video.currentTime = time; }, seek);
  await expect.poll(() => page.locator('video').evaluate(video => Math.abs(video.currentTime - video.duration) > 0 && !video.seeking)).toBe(true);
  expect(await page.locator('video').evaluate(video => video.currentTime)).toBeCloseTo(seek, 1);
  await expect(page.locator('.vv-error')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(state.errors).toEqual([]);
});

test('adaptive segment downloads recover from temporary network failures', async ({ page }) => {
  const state = await setup(page, cases[2], { failedSegments: 2 });
  await page.goto('/v/playback-check');
  try {
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime), { timeout: 20000 }).toBeGreaterThan(.2);
  } catch (failure) {
    await test.info().attach('playback-state', { contentType: 'application/json', body: JSON.stringify({ ...state, video: await page.locator('video').evaluate(video => ({ paused: video.paused, readyState: video.readyState, error: video.error?.code, source: video.currentSrc, nativeHls: video.canPlayType('application/vnd.apple.mpegurl') })) }) });
    throw failure;
  }
  expect(state.segmentFailures).toBeGreaterThan(2);
  expect(state.starts).toHaveLength(1);
  await expect(page.locator('.vv-error')).toHaveCount(0); expect(state.errors).toEqual([]);
});

test('a temporary renewal outage preserves playback and retries without reloading', async ({ page }) => {
  const state = await setup(page, cases[0], { renewalStatus: 503 });
  await page.clock.install(); await page.goto('/v/playback-check');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await watchLoads(page); await page.clock.fastForward(16000);
  await expect.poll(() => state.starts.length).toBe(2);
  await expect(page.locator('.vv-error')).toHaveCount(0);
  expect(await page.locator('video').evaluate(video => video.paused)).toBe(false);
  await page.clock.fastForward(30000); await expect.poll(() => state.starts.length).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => window.playbackLoads)).toEqual([]); expect(state.errors).toEqual([]);
});

test('native MP4 playback recovers after a temporary original-file request failure', async ({ page }) => {
  const state = await setup(page, cases[4], { failedFiles: 1 });
  await page.goto('/v/playback-check');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime), { timeout: 15000 }).toBeGreaterThan(.2);
  expect(state.fileRequests).toBeGreaterThan(1);
  await expect(page.locator('.vv-error')).toHaveCount(0); expect(state.errors).toEqual([]);
});

test('pausing during renewal keeps the film paused when the request finishes', async ({ page }) => {
  const state = await setup(page, cases[0]); let release;
  state.renew = new Promise(resolve => { release = resolve; });
  await page.clock.install(); await page.goto('/v/playback-check');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await watchLoads(page); await page.clock.fastForward(16000);
  await expect.poll(() => state.starts.length).toBe(2);
  await page.locator('video').evaluate(video => video.pause()); release();
  await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(true);
  expect(await page.evaluate(() => window.playbackLoads)).toEqual([]); expect(state.errors).toEqual([]);
});

test('a pending renewal keeps the pause and resume controls usable', async ({ page }) => {
  const state = await setup(page, cases[1]); let release;
  state.renew = new Promise(resolve => { release = resolve; });
  await page.clock.install(); await page.goto('/v/playback-check');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await watchLoads(page); await page.clock.fastForward(16000);
  await expect.poll(() => state.starts.length).toBe(2);
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(false);
  release(); expect(await page.evaluate(() => window.playbackLoads)).toEqual([]); expect(state.errors).toEqual([]);
});

test('revoked renewal access pauses the film and gives the client a clear error', async ({ page }) => {
  await setup(page, cases[0], { renewalStatus: 403 });
  await page.clock.install(); await page.goto('/v/playback-check');
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
  await watchLoads(page); await page.clock.fastForward(16000);
  await expect(page.locator('.vv-error')).toContainText('Playback access could not be renewed.');
  expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
});

test('original HLS plays while a slow segment is still downloading', async ({ page }) => {
  let release; const tail = new Promise(resolve => { release = resolve; }); let finished = false;
  const fixture = new URL('../../.visual-review/video-hls/original-landscape/', import.meta.url);
  test.skip(!existsSync(fileURLToPath(new URL('master.m3u8', fixture))), 'Requires original video fixtures.');
  const server = createServer(async (request, response) => {
    const file = new URL(request.url, 'http://localhost').pathname.slice('/__playback__/'.length);
    if (!/^(master\.m3u8|q\d+\/(?:index\.m3u8|s\d{6}\.ts))$/.test(file)) { response.writeHead(404); response.end(); return; }
    try {
      const body = await readFile(new URL(file, fixture));
      response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl', 'Content-Length': body.length });
      if (file.endsWith('s000000.ts')) {
        const first = Math.floor(body.length * .85);
        for (let offset = 0; offset < first && !response.destroyed; offset += 65536) {
          response.write(body.subarray(offset, Math.min(first, offset + 65536)));
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        await tail; if (!response.destroyed) { response.end(body.subarray(first)); finished = true; }
      } else response.end(body);
    } catch { if (!response.destroyed) response.destroy(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const state = await setup(page, { ...cases[0], bytes: 100 * 1024 ** 2 }, { mediaOrigin: origin });
    // Use a real streamed response; Playwright route.fulfill buffers whole bodies.
    await page.unroute('**/__playback__/**');
    await page.goto('/v/playback-check');
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime), { timeout: 10000 }).toBeGreaterThan(3);
    expect(finished).toBe(false);
    expect(await page.locator('video').evaluate(video => [video.videoWidth, video.videoHeight])).toEqual([640, 360]);
    release();
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime), { timeout: 10000 }).toBeGreaterThan(6);
    await expect(page.locator('.vv-error')).toHaveCount(0); expect(state.errors).toEqual([]);
  } finally { release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

for (const cancel of [false, true]) test(cancel ? 'pausing a buffering original prevents playback when the download finishes' : 'a heavy original buffers a runway before playback instead of starting with a few frames', async ({ page }) => {
  const fixture = new URL('../../.visual-review/video-hls/original-long-gop/playback.mp4', import.meta.url);
  test.skip(!existsSync(fileURLToPath(fixture)), 'Requires original video fixtures.');
  const body = await readFile(fixture); let release; const tail = new Promise(resolve => { release = resolve; }); let requests = 0; let interrupted = 0;
  const server = createServer(async (request, response) => {
    requests++; response.on('close', () => { if (!response.writableFinished) interrupted++; });
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    const first = range ? Number(range[1]) : 0; const last = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    response.writeHead(range ? 206 : 200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': last - first + 1, ...(range ? { 'Content-Range': `bytes ${first}-${last}/${body.length}` } : {}) });
    const middle = Math.min(last + 1, Math.max(first, Math.floor(body.length * .15)));
    response.write(body.subarray(first, middle)); await tail;
    if (!response.destroyed) response.end(body.subarray(middle, last + 1));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.setViewportSize({ width: 320, height: 700 });
    const state = await setup(page, { ...cases[4], bytes: 100 * 1024 ** 2 }, { mediaOrigin: `http://127.0.0.1:${server.address().port}` });
    await page.unroute('**/__playback__/**'); await page.goto('/v/playback-check');
    await expect(page.locator('.vv-buffer')).toContainText('Buffering original quality');
    await expect.poll(() => requests).toBe(1);
    expect(await page.locator('video').evaluate(video => video.paused && video.currentTime < .1)).toBe(true);
    expect(await page.locator('video').getAttribute('src')).toBeNull();
    const panel = await page.locator('.vv-buffer').boundingBox(); const screen = await page.locator('.vv-screen').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(screen.x); expect(panel.x + panel.width).toBeLessThanOrEqual(screen.x + screen.width);
    if (cancel) {
      await page.getByRole('button', { name: 'Pause buffering', exact: true }).click();
      await expect.poll(() => interrupted).toBe(1);
    }
    release();
    if (cancel) {
      await expect(page.locator('.vv-buffer')).toHaveCount(0);
      expect(await page.locator('video').evaluate(video => video.paused && video.currentTime < .1)).toBe(true);
      await page.getByRole('button', { name: 'Resume film', exact: true }).click();
    }
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime), { timeout: 10000 }).toBeGreaterThan(3);
    expect(await page.locator('video').evaluate(async video => (await fetch(video.currentSrc).then(response => response.arrayBuffer())).byteLength)).toBe(body.length);
    await expect(page.locator('.vv-error')).toHaveCount(0); expect(state.errors).toEqual([]);
  } finally { release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

const nativeTest = test.extend({ page: async ({ baseURL }, use) => {
  const browser = await webkit.launch({ headless: true, executablePath: webkit.executablePath() });
  try { await use(await browser.newPage({ baseURL })); } finally { await browser.close(); }
} });
nativeTest.describe('WebKit native MP4 playback', () => {
  // This Windows WebKit build also rejects a plain MP4 <video> outside the app.
  // Run these native decoder checks on macOS; Chromium covers MP4 on Windows.
  nativeTest.skip(process.platform === 'win32', 'Windows WebKit has no working native MP4 decoder; requires macOS WebKit.');
  for (const scenario of [cases[4], cases[6]]) nativeTest(`${scenario.name} preserves its frame and buffer through renewal`, async ({ page }) => {
    const state = await setup(page, scenario);
    await page.clock.install(); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/v/playback-check');
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(.1);
    expect(await page.locator('video').evaluate(video => [video.videoWidth, video.videoHeight])).toEqual([scenario.width, scenario.height]);
    await watchLoads(page); await page.clock.fastForward(16000);
    await expect.poll(() => state.starts.length).toBe(2);
    expect(await page.evaluate(() => window.playbackLoads)).toEqual([]);
    expect(await page.locator('video').evaluate(video => video.paused)).toBe(false);
    await expect(page.locator('.vv-error')).toHaveCount(0); expect(state.errors).toEqual([]);
  });
});
