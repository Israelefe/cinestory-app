import { expect, test } from '@playwright/test';
import { DEMO_PRESETS } from '../src/constants/demoStories.js';
import { photoStoryDemoDelivery } from '../src/utils/photoStoryDemo.js';

const ada = photoStoryDemoDelivery(DEMO_PRESETS.find(p => p.id === 'ada'));
const draftId = '507f1f77bcf86cd799439099';
const user = { _id: 'demo-voice-user', name: 'Apex Imagery', email: 'studio@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const openingFor = view => view.locator('audio[src*="/demo-bookends/"][src*="-opening-"]');
const closingFor = view => view.locator('audio[src*="/demo-bookends/"][src*="-closing-"]');
const musicFor = view => view.locator('audio:not([src*="/demo-bookends/"])');

async function setup(page, { mock = true, reject = '' } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ mock, reject }) => {
    localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true }));
    window.__bookendPlays = [];
    if (!mock) return;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('/demo-bookends/')) window.__bookendPlays.push(this.src);
      if (reject && this.src.includes(`-${reject}-`)) return Promise.reject(new DOMException('Playback blocked', 'NotAllowedError'));
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      this.dispatchEvent(new Event('pause'));
    };
  }, { mock, reject });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    let body = { success: true, data: {} };
    if (path.endsWith('/auth/me')) body = { success: true, user };
    if (path.endsWith('/billing/status')) body.data = { plan: 'pro', limits: { photosPerDelivery: 500 }, usage: {} };
    if (path.endsWith('/deliveries/public/demo-voice') || path.endsWith('/deliveries/' + draftId)) body.data = {
      ...ada, _id: draftId, publicId: 'demo-voice', status: path.includes('/public/') ? 'published' : 'review', v3: { ...ada.v3, step: 'design', revision: 2 }
    };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function finishOpening(view) {
  await openingFor(view).evaluate(el => el.dispatchEvent(new Event('ended')));
  await expect(view.locator('.v-story-canvas.is-playing-state')).toBeVisible();
}

async function reachEnding(view, photos = ada.assets.length) {
  await view.getByRole('button', { name: 'Pause story', exact: true }).click();
  for (let i = 1; i < photos; i++) await view.getByRole('button', { name: 'Next photograph', exact: true }).click();
  await view.getByRole('button', { name: 'Resume story', exact: true }).click();
  await expect(view.locator('.v-story-canvas.is-finale-state')).toBeVisible({ timeout: 12000 });
}

for (const width of [320, 834, 1440]) test(`Hannah's introduction matches demo, creation preview and client playback at ${width}px`, async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 });
  await setup(page);
  for (const source of ['demo', 'client', 'preview']) {
    await page.goto(source === 'demo' ? '/demo?preset=ada' : source === 'client' ? '/d/demo-voice' : '/create?draft=' + draftId);
    const view = source === 'preview' ? page.frameLocator('.v3-design-preview iframe') : width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
    await expect(view.locator('.v-story-cover')).toContainText(ada.creativeDirection.openingLine);
    await expect.poll(() => openingFor(view).evaluate(el => new URL(el.src).pathname)).toBe(ada.narration.opening.url);
    await expect.poll(() => closingFor(view).evaluate(el => new URL(el.src).pathname)).toBe(ada.narration.closing.url);
    expect(await view.locator('audio').count()).toBe(3); // Music plus two bookends; no caption voice.
    expect(await openingFor(view).evaluate(el => el.paused)).toBe(true);
    await view.getByRole('button', { name: 'Begin the story', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Reading the introduction…', exact: true })).toBeDisabled();
    await expect.poll(() => musicFor(view).evaluate(el => el.volume)).toBeGreaterThan(.1);
    await expect.poll(() => musicFor(view).evaluate(el => el.volume)).toBeLessThan(.3);
    await finishOpening(view);
    await expect.poll(() => musicFor(view).evaluate(el => el.volume)).toBeGreaterThan(.9);
    await view.getByRole('button', { name: 'Pause story', exact: true }).click();
    await expect(view.locator('.v-story-caption:not(.is-finale) h2')).toHaveText(ada.creativeDirection.frames[0].caption);
  }
});

test('every generated Hannah clip decodes in the browser', async ({ page }) => {
  await setup(page, { mock: false });
  await page.goto('/demo?preset=ada&phoneView=1');
  const urls = DEMO_PRESETS.flatMap(p => {
    const { narration } = photoStoryDemoDelivery(p);
    expect(narration.voiceId).toBe('flux-hannah-en');
    return [narration.opening.url, narration.closing.url];
  });
  const durations = await page.evaluate(async urls => {
    const context = new AudioContext();
    try {
      return await Promise.all(urls.map(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Demo audio could not load.');
        return (await context.decodeAudioData(await response.arrayBuffer())).duration;
      }));
    } finally { await context.close(); }
  }, urls);
  expect(durations).toHaveLength(8);
  expect(durations.every(duration => duration > 2 && duration < 20)).toBe(true);
});

test('Hannah actually plays and the story advances when her introduction ends', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { mock: false });
  await page.goto('/demo?preset=ada&phoneView=1');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  await expect.poll(() => openingFor(page).evaluate(el => el.currentTime)).toBeGreaterThan(.1);
  await expect(page.locator('.v-story-canvas.is-playing-state')).toBeVisible({ timeout: 20000 });
  expect(await openingFor(page).evaluate(el => el.ended)).toBe(true);
  await page.getByRole('button', { name: 'Pause story', exact: true }).click();
});

test('Hannah reads the closing message over the three slices, and replay resets both clips', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto('/demo?preset=ada&phoneView=1');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  await finishOpening(page);
  await reachEnding(page);
  await expect(page.locator('.v-story-finale-slice')).toHaveCount(3);
  await expect(page.locator('.v-story-caption.is-finale')).toContainText(ada.creativeDirection.closingLine);
  expect(await closingFor(page).evaluate(el => el.paused)).toBe(false);
  await expect.poll(() => musicFor(page).evaluate(el => el.volume)).toBeLessThan(.3);
  await page.getByRole('button', { name: 'Turn sound off', exact: true }).click();
  expect(await closingFor(page).evaluate(el => el.muted)).toBe(true);
  await page.getByRole('button', { name: 'Turn sound on', exact: true }).click();
  expect(await closingFor(page).evaluate(el => el.muted)).toBe(false);
  await closingFor(page).evaluate(el => el.dispatchEvent(new Event('ended')));
  await expect.poll(() => musicFor(page).evaluate(el => el.volume), { timeout: 6000 }).toBe(0);
  await page.getByRole('button', { name: 'Open your gallery', exact: true }).click();
  await expect(page.locator('.client-gallery')).toBeVisible();
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Replay story', exact: true }).click();
  await expect(page.locator('.v-story-cover')).toBeVisible();
  expect(await closingFor(page).evaluate(el => el.paused)).toBe(true);
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  expect(await openingFor(page).evaluate(el => el.paused)).toBe(false);
});

test('starting with sound off skips speech and keeps navigation available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto('/demo?preset=ada&phoneView=1');
  await page.getByRole('button', { name: 'Turn sound off', exact: true }).click();
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  await reachEnding(page);
  expect(await page.evaluate(() => window.__bookendPlays)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Open your gallery', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Turn sound on', exact: true }).click();
  await expect.poll(() => closingFor(page).evaluate(el => el.paused)).toBe(false);
});

for (const failure of ['opening', 'closing']) test(`blocked ${failure} speech leaves the demo usable`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { reject: failure });
  await page.goto('/demo?preset=ada&phoneView=1');
  await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
  if (failure === 'closing') await finishOpening(page);
  await expect(page.locator('.v-story-canvas.is-playing-state')).toBeVisible();
  await reachEnding(page);
  await expect(page.getByRole('button', { name: 'Open your gallery', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open your gallery', exact: true }).click();
  await expect(page.locator('.client-gallery')).toBeVisible();
});
