import { expect, test } from '@playwright/test';
import { EVENT_DEMO } from '../src/constants/deliveryDemoFixtures.js';
import { EVENT_COVERAGE_DEMO_PHOTOS } from '../src/constants/eventCoverageDemo.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: {} } }));
});

async function published(page, customize = () => {}) {
  const delivery = structuredClone(EVENT_DEMO);
  delivery.publicId = 'event-ui';
  delivery.status = 'published';
  delivery.creativeDirection.typography = { display: 'Cormorant Garamond', body: 'Manrope' };
  delivery.creativeDirection.frames.forEach((frame, index) => { frame.eventType = EVENT_COVERAGE_DEMO_PHOTOS[index].eventType; });
  customize(delivery);
  await page.route('**/api/v1/deliveries/public/event-ui', route => route.fulfill({ json: { success: true, data: delivery } }));
  await page.goto('/d/event-ui?phoneView=1');
  await expect(page.locator('.ec-cover h1')).toHaveText(delivery.title);
  return delivery;
}

async function filterBy(page, name) {
  await page.locator('.ec-filter summary').click();
  await page.locator('.ec-filter-options').getByRole('button', { name, exact: true }).click();
}

async function complete(page) {
  await page.locator('.ec-ending').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toBeEnabled();
}

async function navigateScene(page, anchor) {
  const picker = page.getByRole('combobox', { name: 'Choose an event scene' });
  if (await picker.isVisible()) await picker.selectOption(anchor.slice(1));
  else await page.locator(`.ec-scene-nav a[href="${anchor}"]`).click();
}

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) for (const mode of ['demo', 'client']) {
  test(`${mode} event presentation fits and navigates at ${width}px without repeated photos`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (mode === 'demo') await page.goto('/demo/event-coverage?phoneView=1');
    else await published(page);
    await expect(page.locator('.ec-cover h1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'View the event', exact: true })).toBeInViewport();
    await expect.poll(() => page.locator('.ec-cover-photo img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(() => page.locator('.ec-cover-copy').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    const ids = await page.locator('.ec-photo-card').evaluateAll(cards => cards.map(card => card.dataset.photoId));
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    await expect(page.locator('.vec-event-highlights,.vec-event-manifesto,.vec-event-summary')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
    if ([320, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/event-redesign/${mode}-cover-${width}.png` });
    await page.getByRole('button', { name: 'View the event', exact: true }).click();
    await expect(page.locator('.ec-scene').first()).toBeFocused();
    await expect.poll(() => page.locator('.ec-scene').first().evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeLessThan(120);
    const first = page.locator('.ec-scene').first();
    await expect.poll(() => first.locator('.ec-photo-card').first().evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    await expect.poll(() => first.locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const caption = first.locator('figcaption').first();
    expect(await caption.evaluate(element => element.getBoundingClientRect().top - element.parentElement.querySelector('button').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(10);
    expect(await page.locator('.ec-tools').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(90);
    if ([320, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/event-redesign/${mode}-arrivals-${width}.png` });
    const link = page.locator('.ec-scene-nav a').nth(2);
    const anchor = await link.getAttribute('href');
    await navigateScene(page, anchor);
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expect(page.locator(anchor)).toBeFocused();
    await expect.poll(() => page.locator(anchor).evaluate(element => element.getBoundingClientRect().top - document.querySelector('.ec-tools').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(18);
    await expect(page.locator('.fd-header')).not.toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

for (const width of [320, 834]) {
  test(`filtered scenes preserve identities and single photo access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const delivery = await published(page, item => item.creativeDirection.sections.forEach(section => { section.id = 'scene'; }));
    const original = await page.locator('.ec-scene-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(new Set(original).size).toBe(4);
    await filterBy(page, 'Networking');
    await expect(page.locator('.ec-filter summary')).toHaveClass('is-filtered');
    await expect(page.locator('.ec-filter')).toHaveJSProperty('open', false);
    await expect(page.locator('.ec-scene')).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveText('3 photographs across 1 scene, filtered by Networking');
    const link = page.locator('.ec-scene-nav a');
    await expect(link).toHaveAttribute('href', original[2]);
    await navigateScene(page, original[2]);
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('.ec-scene-number')).toHaveText('03');
    const button = page.locator('.ec-scene-grid .ec-photo-button').first();
    await button.click();
    await expect(page.locator('.client-gallery-lightbox-main')).toHaveAttribute('src', delivery.assets[2].url);
    await expect(page.locator('.client-gallery-grid')).toHaveCount(0);
    await page.getByRole('button', { name: 'Return to presentation' }).press('Escape');
    await expect(button).toBeFocused();
    await filterBy(page, 'All moments');
    await expect(page.locator('.ec-scene')).toHaveCount(4);
    await complete(page);
    await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
    await expect(page.locator('.client-gallery-grid > figure')).toHaveCount(16);
  });
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`photo motion pauses and resumes with ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1000 });
    await page.emulateMedia({ reducedMotion });
    await published(page, item => item.creativeDirection.frames.forEach(frame => { frame.motion = 'slow-push'; }));
    await page.getByRole('button', { name: 'View the event', exact: true }).click();
    const photograph = page.locator('.ec-scene-grid .ec-photo-motion').first();
    await photograph.scrollIntoViewIfNeeded();
    const transform = () => photograph.evaluate(element => getComputedStyle(element).transform);
    const initial = await transform();
    await expect.poll(transform).not.toBe(initial);
    await page.getByRole('button', { name: 'Pause photo motion', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume photo motion', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const paused = await transform();
    await page.waitForTimeout(250);
    expect(await transform()).toBe(paused);
    await page.getByRole('button', { name: 'Resume photo motion', exact: true }).click();
    await expect.poll(transform).not.toBe(paused);
  });
}

test('long titles and still photographs fit a short phone without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await published(page, item => {
    item.title = 'The annual gathering of photographers and media studios in Lagos';
    item.creativeDirection.openingLine = 'Guests, speakers, conversations and celebrations from our annual gathering, photographed throughout the day for everyone who was part of it.';
  });
  await expect(page.getByRole('button', { name: 'Pause photo motion', exact: true })).toHaveCount(0);
  const copy = page.locator('.ec-cover-copy');
  expect(await copy.evaluate(element => element.scrollHeight <= element.parentElement.scrollHeight)).toBe(true);
  await page.getByRole('button', { name: 'View the event', exact: true }).click();
  const photo = page.locator('.ec-scene-grid .ec-photo-motion').first();
  await photo.scrollIntoViewIfNeeded(); await photo.hover();
  await expect(photo).toHaveCSS('transform', 'none');
  await expect(photo.locator('img')).toHaveCSS('transform', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [320, 640, 768, 834, 1024, 1440]) {
  test(`saved scene layouts have readable photo sizes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await published(page, item => item.creativeDirection.sections.forEach((section, index) => { section.layout = ['pair', 'triptych', 'cluster', 'strip'][index]; }));
    await expect(page.locator('.ec-scene-copy p').first()).toHaveText('The welcome and check-in before the programme.');
    for (const layout of ['pair', 'triptych', 'cluster', 'strip']) {
      const scene = page.locator(`.ec-scene[data-layout="${layout}"]`);
      await scene.locator('.ec-scene-grid').scrollIntoViewIfNeeded();
      const widths = await scene.locator('.ec-photo-button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().width));
      expect(Math.min(...widths)).toBeGreaterThan(250);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

for (const savedDimensions of [true, false]) test(`photographer notes, date, venue and portrait proportions are honoured with ${savedDimensions ? 'saved' : 'recovered'} dimensions`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  const portraitUrl = '/veylo/web/demo-ada-1-1440.webp';
  const dimensions = { width: 1084, height: 1451 };
  await published(page, item => {
    item.formatConfig.eventCoverage = { ...item.formatConfig.eventCoverage, showSceneNotes: false, eventDate: '2026-10-07', venue: 'The conference hall' };
    Object.assign(item.assets[5], { url: portraitUrl });
    if (savedDimensions) Object.assign(item.assets[5], dimensions);
    else { delete item.assets[5].width; delete item.assets[5].height; }
  });
  await expect(page.locator('.ec-event-meta')).toContainText('7 October 2026');
  await expect(page.locator('.ec-event-meta')).toContainText('The conference hall');
  await expect(page.locator('.ec-scene-copy p')).toHaveCount(0);
  const portrait = page.locator('.ec-scene-grid .ec-photo-card').first();
  await portrait.scrollIntoViewIfNeeded();
  await expect.poll(() => portrait.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect.poll(() => portrait.locator('button').evaluate(element => element.getBoundingClientRect().width / element.getBoundingClientRect().height)).toBeCloseTo(dimensions.width / dimensions.height, 2);
});

test('filter controls can open and close from the keyboard', async ({ page }) => {
  await published(page);
  const summary = page.locator('.ec-filter summary');
  await summary.focus(); await summary.press('Space');
  await expect(page.locator('.ec-filter')).toHaveJSProperty('open', true);
  await summary.press('Tab');
  await expect(page.locator('.ec-filter-options button').first()).toBeFocused();
  await page.locator('.ec-filter-options button').first().press('Escape');
  await expect(page.locator('.ec-filter')).toHaveJSProperty('open', false);
  await expect(summary).toBeFocused();
});

test('a one-photo delivery has one photograph and a usable ending gallery', async ({ page }) => {
  await published(page, item => {
    item.assets = item.assets.slice(0, 1);
    item.curatedAssetIds = [item.assets[0].assetId];
    item.creativeDirection.frames = item.creativeDirection.frames.slice(0, 1);
    item.creativeDirection.sections = [];
    item.v3.closingAssetId = item.v3.openingAssetId;
  });
  await expect(page.locator('.ec-photo-card')).toHaveCount(1);
  await expect(page.locator('.ec-scene')).toHaveCount(0);
  await page.getByRole('button', { name: 'View the event', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  await expect(page.locator('.client-gallery-grid > figure')).toHaveCount(1);
});

test('overlapping published scene assignments show every photograph exactly once', async ({ page }) => {
  await published(page, item => {
    item.creativeDirection.sections[1].assetIds.push(item.assets[5].assetId, item.v3.openingAssetId, item.v3.closingAssetId);
    item.creativeDirection.sections[2].assetIds.push(item.assets[2].assetId);
    item.creativeDirection.sections[3].assetIds = [];
  });
  const ids = await page.locator('.ec-photo-card').evaluateAll(cards => cards.map(card => card.dataset.photoId));
  expect(ids).toHaveLength(16);
  expect(new Set(ids).size).toBe(16);
  await expect(page.getByRole('heading', { name: 'More from the event', exact: true })).toBeVisible();
});

for (const mode of ['demo', 'client']) test(`${mode} event typography loads when external font requests fail`, async ({ page }) => {
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  const fontResponses = [];
  page.on('response', response => { if (response.url().includes('/veylo/fonts/event-coverage/') && response.url().endsWith('.woff2')) fontResponses.push(response); });
  if (mode === 'demo') await page.goto('/demo/event-coverage?phoneView=1');
  else await published(page, item => { item.creativeDirection.typography = { display: 'Outfit', body: 'Manrope' }; });
  const loaded = await page.evaluate(async () => {
    const requests = ['500 48px "Cormorant Garamond"', 'italic 400 48px "Cormorant Garamond"', '400 16px Manrope', '500 14px Outfit'];
    const faces = await Promise.all(requests.map(request => document.fonts.load(request)));
    return faces.every(group => group.length > 0 && group.every(face => face.status === 'loaded'));
  });
  expect(loaded).toBe(true);
  expect(fontResponses.length).toBeGreaterThanOrEqual(4);
  expect(fontResponses.every(response => response.ok())).toBe(true);
  const headingFont = await page.locator('.ec-cover h1').evaluate(element => getComputedStyle(element).fontFamily.split(',')[0].replaceAll('"', '').replaceAll("'", ''));
  expect(headingFont).toBe(mode === 'demo' ? 'Cormorant Garamond' : 'Outfit');
  if (mode === 'client') await expect(page.locator('.ec-title-accent')).toHaveCSS('font-style', 'normal');
});
