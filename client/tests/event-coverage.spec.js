import { expect, test } from '@playwright/test';
import { EVENT_DEMO } from '../src/constants/deliveryDemoFixtures.js';
import { EVENT_COVERAGE_DEMO_PHOTOS } from '../src/constants/eventCoverageDemo.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: {} } }));
});

async function published(page, { motion = 'still', duplicateIds = false, longCopy = false, sceneLayouts = false } = {}) {
  const delivery = structuredClone(EVENT_DEMO);
  delivery.publicId = 'event-ui';
  delivery.status = 'published';
  delivery.creativeDirection.typography = { display: 'Cormorant Garamond', body: 'Manrope' };
  delivery.creativeDirection.frames.forEach((frame, index) => {
    frame.eventType = EVENT_COVERAGE_DEMO_PHOTOS[index].eventType;
    frame.motion = motion;
  });
  if (duplicateIds) delivery.creativeDirection.sections.forEach(section => { section.id = 'scene'; });
  if (sceneLayouts) delivery.creativeDirection.sections.forEach((section, index) => { section.layout = ['pair', 'triptych', 'cluster', 'strip'][index]; });
  if (longCopy) {
    delivery.title = 'The annual gathering of photographers and media studios in Lagos';
    delivery.creativeDirection.openingLine = 'The guests, speakers, conversations and celebrations from our annual gathering, photographed throughout the day and brought together for everyone who was part of it.';
  }
  await page.route('**/api/v1/deliveries/public/event-ui', route => route.fulfill({ json: { success: true, data: delivery } }));
  await page.goto('/d/event-ui?phoneView=1');
  await expect(page.locator('.vec-event-hero h1')).toHaveText(delivery.title);
  return delivery;
}

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
  test(`event layout and scene navigation fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo/event-coverage?phoneView=1');
    await expect(page.locator('.vec-event-hero h1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse the scenes' })).toBeInViewport();
    await expect.poll(() => page.locator('.vec-event-hero-copy').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    if (width === 320 || width === 834 || width === 1440) await page.screenshot({ path: `../.visual-review/event-coverage-hero-${width}.png` });
    const highlights = page.locator('.vec-event-highlight-grid');
    await highlights.scrollIntoViewIfNeeded();
    await expect.poll(() => highlights.locator('button').first().evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    if (width >= 640 && width < 1024) {
      expect(await highlights.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
    }
    await expect(highlights.locator('.vec-highlight-caption').first()).toHaveCSS('font-size', '13px');
    if (width === 320 || width === 834 || width === 1440) await page.screenshot({ path: `../.visual-review/event-coverage-highlights-${width}.png` });
    const sceneLink = page.locator('.vec-event-scene-nav a').nth(2);
    const anchor = await sceneLink.getAttribute('href');
    await sceneLink.click();
    await expect(sceneLink).toHaveAttribute('aria-current', 'location');
    await expect(page.locator(anchor)).toBeFocused();
    await expect.poll(() => page.locator(anchor).evaluate(element => {
      const toolsBottom = document.querySelector('.vec-event-tools').getBoundingClientRect().bottom;
      return element.getBoundingClientRect().top - toolsBottom;
    })).toBeGreaterThanOrEqual(18);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

for (const width of [320, 834]) {
  test(`filtered scene links keep their identities and photo access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const delivery = await published(page, { duplicateIds: true });
    const originalAnchors = await page.locator('.vec-event-scene-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(new Set(originalAnchors).size).toBe(4);
    await page.getByRole('button', { name: 'Networking', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Networking', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.vec-event-scenes article')).toHaveCount(1);
    await expect(page.locator('.vec-event-filter-status')).toHaveText('3 photographs across 1 scene');
    const link = page.locator('.vec-event-scene-nav a');
    await expect(link).toHaveAttribute('href', originalAnchors[2]);
    await expect(link.locator('span')).toHaveText('03');
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('.vec-scene-copy > span')).toHaveText('03');
    await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
    const photo = page.locator('.vec-scene-grid button').first();
    await photo.click();
    await expect(page.locator('.client-gallery-lightbox-main')).toHaveAttribute('src', delivery.assets[2].url);
    await expect(page.locator('.client-gallery-grid')).toHaveCount(0);
    await page.getByRole('button', { name: 'Return to presentation' }).press('Escape');
    await expect(photo).toBeFocused();
    await page.getByRole('button', { name: 'All moments', exact: true }).click();
    await expect(page.locator('.vec-event-scenes article')).toHaveCount(4);
    await page.locator('.vec-event-close').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
    await expect(page.locator('.client-gallery-grid > figure')).toHaveCount(16);
  });
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`event photo motion can pause and resume with ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1000 });
    await page.emulateMedia({ reducedMotion });
    await published(page, { motion: 'slow-push' });
    const photograph = page.locator('.vec-event-highlight-grid button').first().locator('.vec-frame-motion');
    await photograph.scrollIntoViewIfNeeded();
    const transform = () => photograph.evaluate(element => getComputedStyle(element).transform);
    const before = await transform();
    await expect.poll(transform).not.toBe(before);
    await page.getByRole('button', { name: 'Pause photo motion', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume photo motion', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const paused = await transform();
    await page.waitForTimeout(250);
    expect(await transform()).toBe(paused);
    await page.getByRole('button', { name: 'Resume photo motion', exact: true }).click();
    await expect.poll(transform).not.toBe(paused);
  });
}

test('selected still photographs stay still and long copy fits a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await published(page, { longCopy: true });
  await expect(page.getByRole('button', { name: 'Pause photo motion', exact: true })).toHaveCount(0);
  const copy = page.locator('.vec-event-hero-copy');
  expect(await copy.evaluate(element => element.scrollHeight <= element.parentElement.clientHeight)).toBe(true);
  await page.getByRole('button', { name: 'Browse the scenes', exact: true }).click();
  const still = page.locator('.vec-scene-grid button').first().locator('.vec-frame-motion');
  await still.scrollIntoViewIfNeeded();
  await still.hover();
  await expect(still).toHaveCSS('transform', 'none');
  await expect(still.locator('img')).toHaveCSS('transform', 'none');
  await page.locator('.vec-event-close').scrollIntoViewIfNeeded();
  const tools = page.locator('.vec-event-tools-actions');
  expect(await tools.evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [320, 640, 768, 834, 1440]) {
  test(`event saved scene layouts remain spacious at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await published(page, { sceneLayouts: true });
    await expect(page.locator('.vec-scene-copy p').first()).toHaveText('The welcome and check-in before the programme.');
    for (const layout of ['pair', 'triptych', 'cluster']) {
      const scene = page.locator(`.vec-event-scenes article[data-layout="${layout}"]`);
      await scene.locator('.vec-scene-grid').scrollIntoViewIfNeeded();
      const columns = await scene.locator('.vec-scene-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(width < 640 ? 1 : width < 1024 || layout === 'pair' ? 2 : 3);
      expect(await scene.locator('button').first().evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(250);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
