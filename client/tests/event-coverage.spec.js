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
  const menu = page.locator('.ec-scenes-menu');
  if (await menu.getAttribute('open') === null) await menu.locator('summary').click();
  await page.locator(`.ec-scene-nav a[href="${anchor}"]`).click();
}

for (const mode of ['demo', 'client']) test(`${mode} event opens with photography and follows natural scrolling`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (mode === 'demo') await page.goto('/demo/event-coverage?phoneView=1');
  else await published(page);
  const photo = page.locator('.ec-cover-photo .ec-photo-button');
  await expect(photo).toBeInViewport();
  expect(await photo.evaluate(element => element.getBoundingClientRect().bottom <= document.querySelector('.ec-cover-details').getBoundingClientRect().top)).toBe(true);
  await expect(page.locator('.ec-cover button')).toHaveCount(1);
  await page.mouse.wheel(0, 900);
  await expect(page.locator('.ec-tools')).toBeInViewport();
  const progress = () => page.locator('.ec-reading-progress').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  await expect.poll(progress).toBeGreaterThan(0);
  const initial = await progress();
  await page.mouse.wheel(0, 1000);
  await expect.poll(progress).toBeGreaterThan(initial);
  await expect(photo).not.toBeInViewport();
});

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) for (const mode of ['demo', 'client']) {
  test(`${mode} event presentation fits and navigates at ${width}px without repeated photos`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (mode === 'demo') await page.goto('/demo/event-coverage?phoneView=1');
    else await published(page);
    await expect(page.locator('.ec-cover h1')).toBeVisible();
    await expect(page.locator('.ec-masthead .ec-brand-copy strong')).toHaveText(mode === 'demo' ? 'Mayflower Visuals' : EVENT_DEMO.branding.name);
    await expect(page.locator('.ec-masthead .ec-brand')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'View the event', exact: true })).toHaveCount(0);
    await expect.poll(() => page.locator('.ec-cover-photo img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(() => page.locator('.ec-cover-copy').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    // The cover title belongs to the photograph's lower edge, rather than
    // taking an entire screen above the opening photograph.
    expect(await page.locator('.ec-cover-copy').evaluate(element => element.getBoundingClientRect().top < document.querySelector('.ec-cover-photo button').getBoundingClientRect().bottom)).toBe(true);
    const ids = await page.locator('.ec-photo-card').evaluateAll(cards => cards.map(card => card.dataset.photoId));
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    // Display words must remain intact at every size, rather than breaking a
    // word such as "programme" across two lines to fit a narrow column.
    await expect.poll(() => page.locator('.ec-heading-word,.ec-title-accent').evaluateAll(words => {
      const lines = words.map(word => {
        const range = document.createRange(); range.selectNodeContents(word);
        return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
      });
      return Math.max(...lines);
    })).toBe(1);
    await expect(page.locator('.vec-event-highlights,.vec-event-manifesto,.vec-event-summary')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
    if ([320, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/event-redesign/${mode}-cover-${width}.png` });
    await page.locator('.ec-scene').first().evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
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

for (const width of [320, 768, 834, 1440]) test(`saved studio and photographer branding fills a circular mark at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const name = width < 800 ? 'Chukwudi Nwankwo Photography & Films' : 'Osagie Okunbor';
  await page.route('**/test-studio-logo.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="80"><rect width="280" height="80" fill="#f4efe8"/><text x="16" y="54" fill="#070709" font-size="36">STUDIO</text></svg>' }));
  await published(page, item => { item.branding = { type: 'studio', name, logoUrl: '/test-studio-logo.svg' }; });
  const masthead = page.locator('.ec-masthead .ec-brand');
  await expect(masthead.locator('strong')).toHaveText(name);
  await expect(masthead).toBeInViewport();
  await expect.poll(() => masthead.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await complete(page);
  const credit = page.locator('.ec-ending .ec-brand');
  await expect(credit.locator('strong')).toHaveText(name);
  await expect(credit.locator('.ec-brand-copy > span')).toHaveText('Photography by');
  await expect(credit.locator('img')).toHaveAttribute('src', '/test-studio-logo.svg');
  await expect.poll(() => credit.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  const geometry = await page.locator('.ec-brand').evaluateAll(brands => brands.map(brand => {
    const mark = brand.querySelector('.ec-brand-mark');
    const name = brand.querySelector('strong');
    const bounds = brand.getBoundingClientRect();
    const markBounds = mark.getBoundingClientRect();
    const nameBounds = name.getBoundingClientRect();
    return {
      fits: bounds.left >= 0 && bounds.right <= innerWidth && name.scrollWidth <= name.clientWidth + 1,
      separated: markBounds.right <= nameBounds.left || markBounds.bottom <= nameBounds.top,
      logoFit: getComputedStyle(mark).objectFit,
      circular: Math.abs(markBounds.width - markBounds.height) < 1 && getComputedStyle(mark).borderRadius === '50%'
    };
  }));
  expect(geometry.every(brand => brand.fits && brand.separated && brand.logoFit === 'cover' && brand.circular)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('a missing studio logo keeps the photographer identity at both ends', async ({ page }) => {
  await page.route('**/missing-studio-logo.png', route => route.fulfill({ status: 404, body: '' }));
  await published(page, item => { item.branding = { type: 'studio', name: 'Lens Notes', logoUrl: '/missing-studio-logo.png' }; });
  await expect(page.locator('.ec-masthead .delivery-brand-mark-initials')).toHaveText('LN');
  await expect(page.locator('.ec-masthead .ec-brand-copy strong')).toHaveText('Lens Notes');
  await complete(page);
  await expect(page.locator('.ec-ending .delivery-brand-mark-initials')).toHaveText('LN');
  await expect(page.locator('.ec-ending .ec-brand-copy strong')).toHaveText('Lens Notes');
});

test('Veylo branding is a delivery credit and does not claim the photography', async ({ page }) => {
  await published(page, item => { item.branding = { type: 'veylo', name: 'Veylo', logoUrl: '/veylo/veylo-mark.svg' }; });
  await expect(page.locator('.ec-masthead .ec-brand-copy > span')).toHaveText('Delivered with');
  await expect(page.locator('.ec-masthead .ec-brand-copy strong')).toHaveText('Veylo');
  await complete(page);
  await expect(page.locator('.ec-ending .ec-brand-copy > span')).toHaveText('Delivered with');
  await expect(page.locator('.ec-ending .ec-brand-copy strong')).toHaveText('Veylo');
});

test('demo studio branding keeps the return link available', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/demo/event-coverage?from=formats');
  await expect(page.locator('.ec-masthead .ec-brand-copy strong')).toHaveText('Mayflower Visuals');
  const back = page.getByRole('link', { name: 'Back to the Event Coverage section on the formats page' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '/formats#event-coverage');
  const geometry = await back.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const brand = document.querySelector('.ec-masthead .ec-brand').getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, gap: bounds.left - brand.right, right: bounds.right };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.gap).toBeGreaterThanOrEqual(16);
  expect(geometry.right).toBeLessThanOrEqual(320);
});

for (const width of [320, 834]) {
  test(`filtered scenes preserve identities and single photo access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const delivery = await published(page, item => item.creativeDirection.sections.forEach(section => { section.id = 'scene'; }));
    const original = await page.locator('.ec-scene-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    const originalDesign = await page.locator('.ec-scene').nth(2).getAttribute('data-design');
    expect(new Set(original).size).toBe(4);
    await filterBy(page, 'Networking');
    await expect(page.locator('.ec-filter summary')).toHaveClass('is-filtered');
    await expect(page.locator('.ec-filter')).toHaveJSProperty('open', false);
    await expect(page.locator('.ec-scene')).toHaveCount(1);
    await expect(page.locator('.ec-scene')).toHaveAttribute('data-design', originalDesign);
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
    const curtains = page.locator('.ec-cover-photo .ec-photo-reveal');
    await expect(curtains).toHaveCount(2);
    await expect.poll(() => curtains.evaluateAll(panels => panels.every(panel => new DOMMatrixReadOnly(getComputedStyle(panel).transform).a === 0))).toBe(true);
    const photograph = page.locator('.ec-scene-grid .ec-photo-motion').first();
    await photograph.scrollIntoViewIfNeeded();
    const transform = () => photograph.evaluate(element => getComputedStyle(element).transform);
    const drift = photograph.locator('.ec-photo-drift');
    const driftTransform = () => drift.evaluate(element => getComputedStyle(element).transform);
    const initial = await transform();
    await expect.poll(transform).not.toBe(initial);
    const initialDrift = await driftTransform();
    await page.mouse.wheel(0, 90);
    await expect.poll(driftTransform).not.toBe(initialDrift);
    await page.getByRole('button', { name: 'Pause photo motion', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume photo motion', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const paused = await transform();
    const pausedDrift = await driftTransform();
    const lead = page.locator('.ec-scene-lead-wrap').first();
    const pausedDepth = await lead.evaluate(element => getComputedStyle(element).transform);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    expect(await transform()).toBe(paused);
    expect(await driftTransform()).toBe(pausedDrift);
    expect(await lead.evaluate(element => getComputedStyle(element).transform)).toBe(pausedDepth);
    await page.getByRole('button', { name: 'Resume photo motion', exact: true }).click();
    await expect.poll(transform).not.toBe(paused);
    await expect.poll(driftTransform).not.toBe(pausedDrift);
  });
}

test('photo movement stops in the gallery and when the page is hidden', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await published(page, item => item.creativeDirection.frames.forEach(frame => { frame.motion = 'slow-push'; }));
  const photograph = page.locator('.ec-scene-grid .ec-photo-motion').first();
  await photograph.scrollIntoViewIfNeeded();
  const transform = () => photograph.evaluate(element => getComputedStyle(element).transform);
  const initial = await transform();
  await expect.poll(transform).not.toBe(initial);
  await page.locator('.ec-scene-grid .ec-photo-button').first().click();
  await expect(page.locator('.client-gallery-lightbox-main')).toBeVisible();
  const inGallery = await transform();
  await page.waitForTimeout(250);
  expect(await transform()).toBe(inGallery);
  await page.getByRole('button', { name: 'Return to presentation' }).press('Escape');
  await expect.poll(transform).not.toBe(inGallery);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const hidden = await transform();
  await page.waitForTimeout(250);
  expect(await transform()).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(transform).not.toBe(hidden);
});

for (const width of [320, 834, 1440]) test(`detailed demo captions remain readable and separated at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/demo/event-coverage?phoneView=1');
  const captions = page.locator('.ec-caption-copy');
  await expect(captions).toHaveCount(16);
  for (const caption of await captions.all()) {
    await caption.scrollIntoViewIfNeeded();
    await expect.poll(() => caption.evaluate(element => Number(getComputedStyle(element.parentElement).opacity))).toBe(1);
    const geometry = await caption.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const number = element.parentElement.querySelector('.ec-photo-index').getBoundingClientRect();
      const style = getComputedStyle(element);
      return { fits: bounds.left >= 0 && bounds.right <= innerWidth + 1, unclipped: element.scrollHeight <= element.clientHeight + 1, gap: Math.max(bounds.left - number.right, number.left - bounds.right), fontSize: parseFloat(style.fontSize), text: element.textContent };
    });
    expect(geometry.fits && geometry.unclipped).toBe(true);
    expect(geometry.gap).toBeGreaterThanOrEqual(12);
    expect(geometry.fontSize).toBeGreaterThanOrEqual(13);
    expect(EVENT_COVERAGE_DEMO_PHOTOS.some(photo => photo.caption === geometry.text)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('caption styling preserves the photographer’s saved words', async ({ page }) => {
  const caption = 'Dr. Ade greets the guests. A welcome at the registration desk, exactly as written by the photographer.';
  await published(page, item => { item.creativeDirection.frames[0].caption = caption; });
  await expect(page.locator('.ec-cover-caption .ec-caption-copy')).toHaveText(caption);
});

test('long titles and still photographs fit a short phone without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await published(page, item => {
    item.title = 'The annual gathering of photographers and media studios in Lagos';
    item.creativeDirection.openingLine = 'Guests, speakers, conversations and celebrations from our annual gathering, photographed throughout the day for everyone who was part of it.';
  });
  await expect(page.getByRole('button', { name: 'Pause photo motion', exact: true })).toHaveCount(0);
  await expect(page.locator('.ec-photo-drift,.ec-photo-reveal')).toHaveCount(0);
  const copy = page.locator('.ec-cover-copy');
  expect(await copy.evaluate(element => element.scrollHeight <= element.parentElement.scrollHeight)).toBe(true);
  const photo = page.locator('.ec-scene-grid .ec-photo-motion').first();
  await photo.scrollIntoViewIfNeeded(); await photo.hover();
  await expect(photo).toHaveCSS('transform', 'none');
  await expect(photo.locator('img')).toHaveCSS('transform', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [320, 834, 1440]) test(`each scene has a distinct composition at ${width}px even with the same saved layout`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await published(page, item => item.creativeDirection.sections.forEach(section => { section.layout = 'hero'; }));
  const scenes = page.locator('.ec-scene');
  const rect = locator => locator.evaluate(element => {
    const { left, top, right, bottom } = element.getBoundingClientRect();
    return { left, top, right, bottom };
  });
  const arrival = scenes.nth(0);
  await arrival.scrollIntoViewIfNeeded();
  await expect.poll(() => arrival.locator('.ec-scene-copy').evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  const arrivalHeading = await rect(arrival.locator('.ec-scene-copy'));
  const arrivalPhoto = await rect(arrival.locator('.ec-scene-lead-wrap'));
  if (width < 768) expect(arrivalPhoto.top - arrivalHeading.bottom).toBeGreaterThanOrEqual(24);
  else expect(arrivalPhoto.left - arrivalHeading.right).toBeGreaterThanOrEqual(24);

  const feature = scenes.nth(1);
  await feature.scrollIntoViewIfNeeded();
  const featurePhoto = await rect(feature.locator('.ec-scene-lead-wrap'));
  const featureHeading = await rect(feature.locator('.ec-scene-copy'));
  expect(featureHeading.top - featurePhoto.bottom).toBeGreaterThanOrEqual(24);

  const conversation = scenes.nth(2);
  await conversation.scrollIntoViewIfNeeded();
  const first = await rect(conversation.locator('.ec-scene-lead-wrap'));
  const second = await rect(conversation.locator('.ec-conversation-layout > .ec-photo-card').first());
  const conversationHeading = await rect(conversation.locator('.ec-scene-copy'));
  expect(conversationHeading.top - first.bottom).toBeGreaterThanOrEqual(24);
  if (width < 640) expect(second.top - conversationHeading.bottom).toBeGreaterThanOrEqual(24);
  else {
    expect(second.left - first.right).toBeGreaterThanOrEqual(24);
    expect(conversationHeading.top - second.bottom).toBeGreaterThanOrEqual(24);
  }

  const contact = scenes.nth(3);
  await contact.scrollIntoViewIfNeeded();
  const photographs = contact.locator('.ec-photo-button');
  await expect(photographs).toHaveCount(4);
  await expect.poll(() => contact.locator('.ec-photo-card').first().evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  const contactFirst = await rect(photographs.nth(0));
  const contactSecond = await rect(photographs.nth(1));
  if (width < 640) expect(contactSecond.top - contactFirst.bottom).toBeGreaterThanOrEqual(24);
  else {
    expect(contactSecond.left - contactFirst.right).toBeGreaterThanOrEqual(24);
    expect(Math.abs(contactSecond.top - contactFirst.top)).toBeLessThanOrEqual(24);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [320, 834]) test(`a six-scene event preserves every photograph and reaches the closing gallery at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await published(page, item => {
    const photographs = item.assets.filter(asset => ![item.v3.openingAssetId, item.v3.closingAssetId].includes(asset.assetId));
    item.creativeDirection.sections = ['The welcome', 'On stage', 'The conversations', 'The guests', 'A closer look', 'The evening'].map((title, index) => ({ id: `session-${index}`, title, layout: 'hero', assetIds: photographs.slice(Math.floor(index * photographs.length / 6), Math.floor((index + 1) * photographs.length / 6)).map(asset => asset.assetId) }));
  });
  await expect(page.locator('.ec-scene')).toHaveCount(6);
  const ids = await page.locator('.ec-photo-card').evaluateAll(photos => photos.map(photo => photo.dataset.photoId));
  expect(ids).toHaveLength(16); expect(new Set(ids).size).toBe(16);
  for (const scene of await page.locator('.ec-scene').all()) {
    await scene.scrollIntoViewIfNeeded();
    const widths = await scene.locator('.ec-photo-button').evaluateAll(photos => photos.map(photo => photo.getBoundingClientRect().width));
    expect(Math.min(...widths)).toBeGreaterThan(250);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await complete(page);
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  await expect(page.locator('.client-gallery-grid > figure')).toHaveCount(16);
});

for (const palette of [
  { background: '#090b10', surface: '#161820', text: '#f3ece1', accent: '#d39873' },
  { background: '#f3ece1', surface: '#e4daca', text: '#17120f', accent: '#854833' }
]) test(`the editorial spread keeps readable text with a ${palette.background === '#090b10' ? 'dark' : 'light'} saved palette`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await published(page, item => { item.creativeDirection.palette = palette; });
  const spread = page.locator('.ec-scene[data-treatment="feature"]');
  await spread.scrollIntoViewIfNeeded();
  await expect(spread.locator('h2')).toHaveText('The programme');
  const contrast = await spread.evaluate(element => {
    const context = document.createElement('canvas').getContext('2d');
    context.canvas.width = context.canvas.height = 1;
    const luminance = color => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return r * .2126 + g * .7152 + b * .0722;
    };
    const background = luminance(getComputedStyle(element, '::before').backgroundColor);
    return [...element.querySelectorAll('h2,p,figcaption')].map(copy => {
      const foreground = luminance(getComputedStyle(copy).color);
      return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05);
    });
  });
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
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
  expect(await portrait.locator('button').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(800);
});

test('long scene headings leave room for the lead photograph on a tablet', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await published(page, item => { item.creativeDirection.sections[0].title = 'Guests arriving and catching up before the opening address'; });
  const scene = page.locator('.ec-scene').first();
  await scene.scrollIntoViewIfNeeded();
  const heading = scene.locator('h2');
  await expect(heading).toHaveText('Guests arriving and catching up before the opening address');
  const photo = scene.locator('.ec-scene-lead');
  await expect.poll(() => photo.evaluate(element => element.getBoundingClientRect().top - element.closest('.ec-scene').querySelector('.ec-scene-copy').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
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

test('scene navigation stays tucked away and works from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await published(page);
  const menu = page.locator('.ec-scenes-menu');
  const summary = menu.locator('summary');
  await expect(menu).toHaveJSProperty('open', false);
  await expect(page.getByRole('navigation', { name: 'Event scenes' })).not.toBeVisible();
  await summary.focus();
  await summary.press('Enter');
  await expect(menu).toHaveJSProperty('open', true);
  await summary.press('Tab');
  const first = menu.locator('a').first();
  await expect(first).toBeFocused();
  await first.press('Escape');
  await expect(menu).toHaveJSProperty('open', false);
  await expect(summary).toBeFocused();
  await summary.press('Enter');
  const second = menu.locator('a').nth(1);
  const anchor = await second.getAttribute('href');
  await second.focus();
  await second.press('Enter');
  await expect(menu).toHaveJSProperty('open', false);
  await expect(page.locator(anchor)).toBeFocused();
  await expect(second).toHaveAttribute('aria-current', 'location');
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
  await complete(page);
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
