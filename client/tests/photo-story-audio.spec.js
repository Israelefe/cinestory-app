import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const trackPath = '/veylo/audio/demo-photo-story-rheme-f6f51f784741.mp3';
const music = page => page.locator(`audio[src$="${trackPath}"]`);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true }));
    const NativeContext = window.AudioContext;
    window.__musicContexts = [];
    window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); window.__musicContexts.push(this); }
    };
  });
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, user: null, data: {} } }));
});

async function expectMusicPlaying(page) {
  await expect.poll(() => music(page).evaluate(audio => !audio.paused && !audio.muted && audio.currentTime > .1 && !audio.error)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__musicContexts.length > 0 && window.__musicContexts.every(context => context.state === 'running'))).toBe(true);
}

for (const preset of ['lora', 'ada', 'sharon', 'wedding']) {
  test(`${preset}'s demo plays the real static soundtrack on its first opening`, async ({ page }) => {
    let apiMusicRequests = 0;
    page.on('request', request => { if (request.url().includes('/api/v1/deliveries/demo/photo-story/soundtrack')) apiMusicRequests += 1; });
    await page.goto(`/demo?preset=${preset}&phoneView=1`);
    await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
    await expectMusicPlaying(page);
    expect(apiMusicRequests).toBe(0);
    await expect.poll(() => music(page).evaluate(audio => audio.volume)).toBeGreaterThan(.1);
  });
}

test('a slow first soundtrack request starts without refreshing the page', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`**${trackPath}`, async route => { await gate; await route.continue(); });
  await page.goto('/demo?preset=lora&phoneView=1');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  expect(await music(page).evaluate(audio => audio.currentTime)).toBe(0);
  release();
  await expectMusicPlaying(page);
});

for (const width of [320, 834]) {
  test(`a failed first load offers a working retry with readable branding at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const body = await readFile(new URL('../public' + trackPath, import.meta.url));
    let fail = true;
    await page.route(`**${trackPath}`, route => fail ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ contentType: 'audio/mpeg', body }));
    await page.goto('/demo?preset=lora&phoneView=1');
    await expect.poll(() => music(page).evaluate(audio => audio.error?.code)).toBeTruthy();
    await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
    const retry = page.getByRole('button', { name: 'Retry music', exact: true });
    await expect(retry).toBeVisible();
    const [retryBox, brandBox] = await Promise.all([retry.boundingBox(), page.locator('.v-story-studio').boundingBox()]);
    expect(retryBox.height).toBeGreaterThanOrEqual(44);
    expect(retryBox.x).toBeGreaterThanOrEqual(brandBox.x + brandBox.width);
    expect(retryBox.x + retryBox.width).toBeLessThanOrEqual(width);
    expect((await page.locator('.v-story-studio strong').boundingBox()).width).toBeGreaterThanOrEqual(90);
    fail = false;
    await retry.click();
    await expectMusicPlaying(page);
    await expect(retry).toHaveCount(0);
  });
}

test('blocked playback can be retried directly in the next user gesture', async ({ page }) => {
  await page.addInitScript(path => {
    const nativePlay = HTMLMediaElement.prototype.play;
    window.__blockMusic = true;
    window.__musicGesture = false;
    window.addEventListener('click', () => { window.__musicGesture = true; }, true);
    window.addEventListener('click', () => { window.__musicGesture = false; });
    HTMLMediaElement.prototype.play = function () {
      if (this.src.endsWith(path) && (window.__blockMusic || !window.__musicGesture)) return Promise.reject(new DOMException('Playback needs a tap', 'NotAllowedError'));
      return nativePlay.call(this);
    };
  }, trackPath);
  await page.goto('/demo?preset=lora&phoneView=1');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Play music', exact: true });
  await expect(retry).toBeVisible();
  await page.evaluate(() => { window.__blockMusic = false; });
  await retry.click();
  await expectMusicPlaying(page);
});

test('story resume and sound-on recover an interrupted audio context', async ({ page }) => {
  await page.goto('/demo?preset=lora&phoneView=1');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  await expectMusicPlaying(page);
  await page.locator('audio[src*="-opening-"]').evaluate(audio => { audio.pause(); audio.dispatchEvent(new Event('ended')); });
  await page.getByRole('button', { name: 'Pause story', exact: true }).click();
  await page.evaluate(() => Promise.all(window.__musicContexts.map(context => context.suspend())));
  await page.getByRole('button', { name: 'Resume story', exact: true }).click();
  await expectMusicPlaying(page);
  await page.getByRole('button', { name: 'Turn sound off', exact: true }).click();
  await expect.poll(() => music(page).evaluate(audio => audio.paused && audio.muted)).toBe(true);
  await page.evaluate(() => Promise.all(window.__musicContexts.map(context => context.suspend())));
  await page.getByRole('button', { name: 'Turn sound on', exact: true }).click();
  await expectMusicPlaying(page);
  await page.getByRole('button', { name: 'Pause story', exact: true }).click();
  await expect.poll(() => music(page).evaluate(audio => audio.paused)).toBe(true);
});
