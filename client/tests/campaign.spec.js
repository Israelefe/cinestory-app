import { expect, test } from '@playwright/test';
import { CAMPAIGN_DEMO } from '../src/constants/deliveryDemoFixtures.js';

async function setup(page, delivery) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: delivery || {} } }));
}

for (const [width, height] of [[320,568], [390,844], [768,1024], [834,1194], [1024,768], [1440,900]]) {
  test(`campaign photographs and navigation stay readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo/campaign?phoneView=1');
    await expect(page.locator('.vec-campaign-hero h1')).toBeVisible();
    await expect.poll(() => page.locator('.vec-campaign-hero img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    if ([320,834,1440].includes(width)) await page.screenshot({ path: `../.visual-review/campaign-hero-${width}.png` });
    const highlights = page.locator('.vec-campaign-highlights');
    await highlights.scrollIntoViewIfNeeded();
    await expect(page.locator('.vec-campaign-highlight-grid .vec-campaign-photo-copy').first()).toBeVisible();
    const card = page.locator('.vec-campaign-highlight-grid button').first();
    const [photo, caption] = await Promise.all([card.locator('.vec-campaign-photo-image').boundingBox(), card.locator('.vec-campaign-photo-copy').boundingBox()]);
    expect(caption.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
    await expect(card.locator('.vec-campaign-photo-copy p')).toHaveCSS('font-size', '13px');
    if ([320,834,1440].includes(width)) await highlights.screenshot({ path: `../.visual-review/campaign-highlights-${width}.png` });
    const set = page.locator('.vec-campaign-set-list article').nth(1);
    await set.scrollIntoViewIfNeeded();
    await expect.poll(() => set.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    const navigation = page.getByRole('navigation', { name: 'Campaign asset sets' });
    await expect(navigation.getByRole('link', { name: /Craft and detail/ })).toHaveAttribute('aria-current', 'location');
    for (const link of await navigation.getByRole('link').all()) expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    if ([320,834,1440].includes(width)) await set.screenshot({ path: `../.visual-review/campaign-set-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('campaign keeps every photo set visible and supports keyboard photo inspection', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await setup(page);
  await page.goto('/demo/campaign?phoneView=1');
  await expect(page.getByRole('button', { name: 'Explore the photographs', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Filter campaign assets' })).toHaveCount(0);
  for (const label of ['All photographs', 'Hero', 'Detail', 'In use', 'Kit', 'Context']) await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  await expect(page.locator('.vec-campaign-set-list article')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Craft and detail' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  const photo = page.getByRole('button', { name: 'Open Craft and detail', exact: true });
  await photo.focus(); await photo.press('Enter');
  await expect(page.locator('.client-gallery')).toBeVisible();
  await expect(page.locator('.client-gallery-grid')).toHaveCount(0);
  await expect.poll(() => page.locator('.client-gallery-lightbox-main').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Return to presentation' }).press('Escape');
  await expect(page.locator('.client-gallery')).toHaveCount(0);
  await expect(photo).toBeFocused();
  await expect(page.locator('.vec-campaign-set-list article')).toHaveCount(5);
});

test('campaign honours saved highlights, section notes, usage terms, and still photographs', async ({ page }) => {
  const delivery = structuredClone(CAMPAIGN_DEMO);
  delivery.publicId = 'campaign-design'; delivery.status = 'published';
  delivery.creativeDirection.variation = { composition: 'grid' };
  await page.setViewportSize({ width: 834, height: 1194 });
  await setup(page, delivery);
  await page.goto('/d/campaign-design?phoneView=1');
  await expect(page.locator('.vec-campaign-highlight-grid button')).toHaveCount(3);
  const highlights = page.locator('.vec-campaign-highlight-grid img');
  for (const [index, id] of delivery.formatConfig.campaign.highlightAssetIds.entries()) await expect(highlights.nth(index)).toHaveAttribute('src', delivery.assets.find(asset => asset.assetId === id).url);
  await expect(page.locator('.vec-campaign-set-copy').first()).toContainText(delivery.creativeDirection.sections[0].body);
  await expect(page.locator('.vec-campaign-handoff aside')).toContainText(delivery.formatConfig.usageTerms);
  await expect(page.getByRole('button', { name: 'Pause photo motion' })).toHaveCount(0);
  await expect(page.locator('.vec-campaign-hero-image .vec-frame-motion')).toHaveCSS('transform', 'none');
  expect(await page.locator('.vec-campaign-set-list').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
});

for (const reducedMotion of ['reduce', 'no-preference']) test(`campaign photo motion remains controllable with ${reducedMotion}`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.emulateMedia({ reducedMotion });
  await setup(page);
  await page.goto('/demo/campaign?phoneView=1');
  const image = page.locator('.vec-campaign-hero-image .vec-frame-motion');
  const first = await image.evaluate(el => getComputedStyle(el).transform);
  await expect.poll(() => image.evaluate(el => getComputedStyle(el).transform)).not.toBe(first);
  await page.getByRole('button', { name: 'Pause photo motion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume photo motion' })).toHaveAttribute('aria-pressed', 'true');
  const highlight = page.locator('.vec-campaign-highlight-grid .vec-frame-motion').first();
  await highlight.scrollIntoViewIfNeeded();
  const paused = await highlight.evaluate(el => getComputedStyle(el).transform);
  const samples = await highlight.evaluate(async el => {
    const values = [];
    for (let i = 0; i < 12; i++) { await new Promise(requestAnimationFrame); values.push(getComputedStyle(el).transform); }
    return values;
  });
  expect(samples.every(value => value === paused)).toBe(true);
  await page.getByRole('button', { name: 'Resume photo motion' }).click();
  await highlight.scrollIntoViewIfNeeded();
  await expect.poll(() => highlight.evaluate(el => getComputedStyle(el).transform)).not.toBe(paused);
});
