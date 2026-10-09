import { expect, test } from '@playwright/test';
import { CAMPAIGN_DEMO } from '../src/constants/deliveryDemoFixtures.js';

function clientFixture() {
  const delivery = structuredClone(CAMPAIGN_DEMO);
  delivery.publicId = 'campaign-design'; delivery.status = 'published';
  return delivery;
}

async function setup(page, delivery) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: delivery || {} } }));
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.goto(delivery ? '/d/campaign-design?phoneView=1' : '/demo/campaign?phoneView=1');
  await expect(page.locator('.cp-cover h1')).toBeVisible();
  await page.evaluate(() => Promise.all([document.fonts.load('700 48px Outfit'), document.fonts.load('400 16px Manrope')]));
  await expect(page.locator('.cp-cover-heading')).toHaveCSS('transform', 'none');
  await expect(page.locator('.cp-cover h1')).toHaveCSS('transform', 'none');
}

const transform = locator => locator.evaluate(element => getComputedStyle(element).transform);

for (const [width, height] of [[320,568], [390,844], [640,900], [768,1024], [834,1194], [1024,768], [1440,900]]) {
  for (const mode of ['demo', 'client']) test(`${mode} campaign has spacious, unique photographs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page, mode === 'client' ? clientFixture() : undefined);
    const cards = page.locator('.cp-photo-card');
    await expect(cards).toHaveCount(12);
    expect(new Set(await cards.evaluateAll(elements => elements.map(element => element.dataset.photoId))).size).toBe(12);
    const cover = page.locator('.cp-cover .cp-photo-button');
    expect(await page.locator('.cp-cover h1').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
    expect((await cover.boundingBox()).y).toBeLessThan(height - 80);
    await expect.poll(() => cover.locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    const brand = page.locator('.cp-masthead .cp-brand');
    await expect(brand).toContainText(mode === 'demo' ? 'Mayflower Visuals' : CAMPAIGN_DEMO.branding.name);
    await expect(brand.locator('.cp-brand-mark')).toHaveCSS('border-radius', '50%');
    if (mode === 'client') await expect(brand.locator('img')).toHaveCSS('object-fit', 'cover');
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      const image = card.locator('.cp-photo-button'), caption = card.locator('figcaption');
      await expect(caption).toBeVisible();
      const [imageBox, captionBox] = await Promise.all([image.boundingBox(), caption.boundingBox()]);
      expect(captionBox.y - imageBox.y - imageBox.height).toBeGreaterThanOrEqual(10);
      expect(parseFloat(await caption.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
      expect(captionBox.width).toBeLessThanOrEqual(width - 32);
      await expect.poll(() => image.locator('img').evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test('the demo has four different spreads, detailed captions and a compact keyboard menu', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await setup(page);
  expect(await page.locator('.cp-set').evaluateAll(elements => elements.map(element => element.dataset.design))).toEqual(['detail','lifestyle','collection','portrait']);
  await expect(page.locator('.cp-cover figcaption strong')).toHaveText('Two pieces, one opening frame.');
  await expect(page.locator('.vec-campaign-highlights, .vec-campaign-summary')).toHaveCount(0);
  const menu = page.locator('.cp-set-menu'), summary = menu.locator('summary');
  await summary.focus(); await summary.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  const links = menu.getByRole('link');
  for (const link of await links.all()) expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await links.nth(1).press('Escape');
  await expect(menu).not.toHaveAttribute('open', ''); await expect(summary).toBeFocused();
  await summary.press('Space'); await links.nth(2).click();
  await expect(page.locator('.cp-set').nth(2)).toBeFocused();
  await expect.poll(() => page.locator('.cp-set').nth(2).evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeGreaterThanOrEqual(80);
  await expect(page.locator('.cp-current-title')).toHaveText('The collection');
  await summary.click();
  await expect(links.nth(2)).toHaveAttribute('aria-current', 'location');
  await page.locator('.cp-set').nth(2).locator('h2').click();
  await expect(menu).not.toHaveAttribute('open', '');
});

test('Campaign has a poster cover and a different typographic identity from Event Coverage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await setup(page);
  const heading = page.locator('.cp-cover h1');
  await expect(heading).toHaveCSS('text-transform', 'uppercase');
  await expect(heading).toHaveCSS('font-weight', '700');
  expect(await heading.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Outfit');
  const [titleBox, photographBox] = await Promise.all([heading.boundingBox(), page.locator('.cp-cover .cp-photo-button').boundingBox()]);
  expect(titleBox.x + titleBox.width).toBeLessThan(photographBox.x);
  expect(Math.abs(titleBox.y - photographBox.y)).toBeLessThan(photographBox.height);
  await expect(page.locator('.cp-set[data-design="detail"]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.goto('/demo/event-coverage?phoneView=1');
  await expect(page.locator('.ec-cover h1')).toBeVisible();
  expect(await page.locator('.ec-cover h1').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Cormorant Garamond');
});

for (const width of [320,834,1440]) test(`the location sequence works by keyboard and arrows at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  const set = page.locator('.cp-set[data-design="lifestyle"]'), track = set.locator('.cp-sequence');
  const previous = set.getByRole('button', { name: 'Previous photograph in On location' });
  const next = set.getByRole('button', { name: 'Next photograph in On location' });
  await track.scrollIntoViewIfNeeded(); await expect(previous).toBeDisabled();
  expect(await track.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await track.focus(); await track.press('ArrowRight');
  await expect(set.locator('.cp-sequence-position')).toHaveText('02 / 04');
  await next.click(); await expect(set.locator('.cp-sequence-position')).toHaveText('03 / 04');
  await next.click(); await expect(set.locator('.cp-sequence-position')).toHaveText('04 / 04');
  await expect(next).toBeDisabled();
  await expect.poll(async () => {
    const [lastBox, trackBox] = await Promise.all([track.locator('.cp-photo-card').last().boundingBox(), track.boundingBox()]);
    return lastBox.x + lastBox.width - trackBox.x - trackBox.width;
  }).toBeLessThanOrEqual(2);
  await previous.click(); await expect(set.locator('.cp-sequence-position')).toHaveText('03 / 04');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('a photograph opens alone, supports likes and downloads, and restores keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await setup(page);
  const photo = page.getByRole('button', { name: 'Open the campaign cover photograph', exact: true });
  await photo.focus(); await photo.press('Enter');
  await expect(page.locator('.client-gallery')).toBeVisible();
  await expect(page.locator('.client-gallery-grid')).toHaveCount(0);
  await expect.poll(() => page.locator('.client-gallery-lightbox-main').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toHaveAttribute('aria-pressed', 'true');
  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download photograph', exact: true }).click();
  expect((await downloadStarted).suggestedFilename()).toBeTruthy();
  await page.getByRole('button', { name: 'Return to presentation' }).press('Escape');
  await expect(page.locator('.client-gallery')).toHaveCount(0); await expect(photo).toBeFocused();
  await expect(page.locator('.cp-photo-card')).toHaveCount(12);
});

test('saved highlights, section copy, labels, usage terms and still settings survive', async ({ page }) => {
  const delivery = clientFixture();
  await page.setViewportSize({ width: 834, height: 1194 }); await setup(page, delivery);
  const highlights = page.locator('.cp-photo-card[data-highlight="true"]');
  expect(new Set(await highlights.evaluateAll(elements => elements.map(element => element.dataset.photoId)))).toEqual(new Set(delivery.formatConfig.campaign.highlightAssetIds));
  await expect(page.locator('.cp-set-copy p').first()).toHaveText(delivery.creativeDirection.sections[0].body);
  await expect(page.locator('.cp-cover .cp-caption-label')).toHaveText(delivery.formatConfig.campaign.assetLabels[0].label);
  await expect(page.locator('.cp-cover figcaption')).toContainText(delivery.creativeDirection.frames[0].caption);
  await expect(page.locator('.cp-ending h2')).toHaveText(delivery.creativeDirection.closingLine);
  await expect(page.getByRole('button', { name: 'Pause photo motion' })).toHaveCount(0);
  await expect(page.locator('.cp-photo-curtain, .cp-photo-drift')).toHaveCount(0);
  await expect(page.locator('.cp-cover .cp-photo-motion')).toHaveCSS('transform', 'none');
  await page.locator('.cp-usage summary').click();
  await expect(page.locator('.cp-usage p')).toHaveText(delivery.formatConfig.usageTerms);
});

for (const reducedMotion of ['reduce', 'no-preference']) test(`photo movement and pause work with ${reducedMotion}`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.emulateMedia({ reducedMotion }); await setup(page);
  const cover = page.locator('.cp-cover .cp-photo-motion');
  const initial = await transform(cover);
  await expect.poll(() => transform(cover)).not.toBe(initial);
  await expect(page.locator('.cp-cover .cp-photo-curtain')).toHaveCount(2);
  await page.getByRole('button', { name: 'Pause photo motion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume photo motion' })).toHaveAttribute('aria-pressed', 'true');
  const lead = page.locator('.cp-set').first().locator('.cp-photo-motion').first();
  await lead.scrollIntoViewIfNeeded();
  const paused = await transform(lead);
  const samples = await lead.evaluate(async element => {
    const values = []; for (let index = 0; index < 15; index++) { await new Promise(requestAnimationFrame); values.push(getComputedStyle(element).transform); } return values;
  });
  expect(samples.every(value => value === paused)).toBe(true);
  await page.getByRole('button', { name: 'Resume photo motion' }).click();
  await lead.scrollIntoViewIfNeeded();
  await expect.poll(() => transform(lead)).not.toBe(paused);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.cp-viewer')).toHaveAttribute('data-photo-motion-paused', 'true');
  const hidden = await transform(lead);
  await page.waitForTimeout(250); expect(await transform(lead)).toBe(hidden);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => transform(lead)).not.toBe(hidden);
});

test('the full gallery unlocks at the ending and keeps the saved download restrictions', async ({ page }) => {
  const delivery = clientFixture();
  delivery.access = { allowLikes: false, allowIndividualDownloads: false, allowDownloadAll: false };
  await page.setViewportSize({ width: 834, height: 1194 }); await setup(page, delivery);
  await expect(page.getByRole('button', { name: 'View gallery after the presentation' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await page.locator('.cp-ending-actions').scrollIntoViewIfNeeded();
  const gallery = page.getByRole('button', { name: 'Open full gallery', exact: true });
  await expect(gallery).toBeEnabled(); await gallery.click();
  await expect(page.locator('.client-gallery')).toBeVisible();
  await expect(page.locator('.client-gallery-grid figure')).toHaveCount(12);
  await expect(page.getByRole('button', { name: /Download all photos|Download photograph|Add to favourites/ })).toHaveCount(0);
});

for (const width of [320,834]) test(`long saved titles and original portrait proportions fit at ${width}px`, async ({ page }) => {
  const delivery = clientFixture();
  delivery.title = 'The new collection, photographed around Lagos for the October campaign';
  delivery.creativeDirection.sections[1].title = 'Every small detail of the new collection, photographed up close';
  await page.setViewportSize({ width, height: 1000 }); await setup(page, delivery);
  const title = await page.locator('.cp-cover h1').boundingBox();
  expect(title.x).toBeGreaterThanOrEqual(16); expect(title.x + title.width).toBeLessThanOrEqual(width - 16);
  const portrait = page.locator('.cp-photo-card[data-orientation="portrait"] .cp-photo-button').first();
  await portrait.scrollIntoViewIfNeeded();
  await expect.poll(() => portrait.locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  const box = await portrait.boundingBox(), ratio = await portrait.locator('img').evaluate(image => image.naturalWidth / image.naturalHeight);
  expect(Math.abs(box.width / box.height - ratio)).toBeLessThan(.01);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
