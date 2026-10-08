import { expect, test } from '@playwright/test';
import { CHAPTERS_DEMO } from '../src/constants/deliveryDemoFixtures.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: {} } }));
});

async function settle(view) {
  await view.locator('.fd-chapter-library,.fd-chapter-reading-page').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity).map(animation => animation.finished.catch(() => {}))));
}
async function screenshot(page, name) {
  await settle(page);
  await page.screenshot({ path: `../.visual-review/chapters-${name}.png`, fullPage: true });
}
async function publishFixture(page, delivery, slug = 'chapters-polish') {
  delivery.status = 'published'; delivery.publicId = slug;
  await page.route(`**/api/v1/deliveries/public/${slug}**`, route => route.fulfill({ json: { success: true, data: delivery } }));
  await page.goto(`/d/${slug}?phoneView=1`);
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [834, 1112], [1024, 768], [1440, 900]]) {
  test(`Chapters keeps its covers, captions and navigation readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo/chapters?phoneView=1');
    const cards = page.locator('.fd-chapter-library-card');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('.fd-chapter-collection-count')).toContainText('3 chapters');
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await card.locator('img').evaluate(image => image.decode().catch(() => {}));
      expect(parseFloat(await card.locator('strong').evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(28);
      expect(parseFloat(await card.locator('.fd-chapter-card-description').evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
      const cover = await card.locator('.fd-chapter-library-cover').boundingBox();
      const copy = await card.locator('.fd-chapter-library-copy').boundingBox();
      expect(copy.y).toBeGreaterThanOrEqual(cover.y + cover.height - 1);
      expect(cover.width).toBeGreaterThan(width <= 640 ? width - 48 : 230);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await screenshot(page, `directory-${width}`);

    await cards.nth(1).click();
    const heading = page.locator('.fd-chapter-reading-heading h1');
    await expect(heading).toHaveText('The Way They Looked');
    await expect(heading).toBeFocused();
    await expect(page.locator('.fd-chapter-position')).toHaveAttribute('aria-label', 'Chapter 2 of 3');
    for (const photo of await page.locator('.fd-chapter-reading-photo').all()) {
      await photo.scrollIntoViewIfNeeded();
      const surface = await photo.locator('.fd-chapter-reading-photo-frame').boundingBox();
      const caption = await photo.locator('.fd-chapter-reading-caption').boundingBox();
      expect(caption.y).toBeGreaterThanOrEqual(surface.y + surface.height - 1);
      expect(parseFloat(await photo.locator('.fd-chapter-reading-caption').evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    await page.getByRole('button', { name: 'Next chapter: Just Us', exact: true }).click();
    await expect(heading).toHaveText('Just Us');
    await expect(heading).toBeFocused();
    await page.evaluate(() => scrollTo(0, 0));
    await screenshot(page, `reading-${width}`);
    const controls = page.locator('.fd-chapter-view-controls');
    for (const button of await controls.getByRole('button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    }
    await controls.getByRole('button', { name: 'All chapters', exact: true }).click();
    await expect(cards.nth(1)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('keyboard navigation returns to the selected cover and restores its reading position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/chapters?phoneView=1');
  const cover = page.getByRole('button', { name: 'Open chapter 2: The Way They Looked', exact: true });
  await cover.scrollIntoViewIfNeeded(); await settle(page); await cover.focus();
  const previousScroll = await page.evaluate(() => scrollY);
  await cover.press('Enter');
  const heading = page.locator('.fd-chapter-reading-heading h1');
  await expect(heading).toBeFocused();
  await page.getByRole('button', { name: 'Previous chapter: Side by Side', exact: true }).press('Enter');
  await expect(heading).toHaveText('Side by Side');
  await expect(heading).toBeFocused();
  await page.getByRole('button', { name: 'All chapters', exact: true }).press('Enter');
  await expect(cover).toBeFocused();
  await expect.poll(() => page.evaluate(previous => Math.abs(scrollY - previous), previousScroll)).toBeLessThanOrEqual(12);
});

test('device reduced motion keeps photo animation while client pause freezes it across chapter changes', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo/chapters?phoneView=1');
  const cover = page.locator('.fd-chapter-library-cover .fd-chapter-photo-motion').first();
  await cover.scrollIntoViewIfNeeded();
  const transform = await cover.evaluate(element => getComputedStyle(element).transform);
  await expect.poll(() => cover.evaluate(element => getComputedStyle(element).transform)).not.toBe(transform);
  await page.getByRole('button', { name: 'Pause photo motion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume photo motion' })).toHaveAttribute('aria-pressed', 'true');
  const paused = await cover.evaluate(element => getComputedStyle(element).transform);
  await page.waitForTimeout(250);
  expect(await cover.evaluate(element => getComputedStyle(element).transform)).toBe(paused);
  await page.locator('.fd-chapter-library-card').first().click();
  await expect(page.getByRole('button', { name: 'Resume photo motion' })).toHaveAttribute('aria-pressed', 'true');
  const photo = page.locator('.fd-chapter-reading-photo .fd-chapter-photo-motion').first();
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBe(1);
  await page.getByRole('button', { name: 'Resume photo motion', exact: true }).click();
  await expect.poll(() => photo.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBeGreaterThan(1);
});

test('a long published collection preserves chosen covers, body, fonts and still photographs', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const delivery = structuredClone(CHAPTERS_DEMO);
  delivery.creativeDirection.typography = { display: 'Cormorant Garamond', body: 'Manrope' };
  delivery.creativeDirection.sections = Array.from({ length: 11 }, (_, index) => ({
    id: `chapter-${index}`, title: `The guests and conversations from session ${index + 1}`,
    body: 'The finished photographs from this part of the day.\nThank you for being there.',
    assetIds: [delivery.assets[0].assetId, delivery.assets[1].assetId], coverAssetId: delivery.assets[1].assetId, layout: 'grid'
  }));
  delivery.creativeDirection.frames.forEach(frame => { frame.motion = 'still'; frame.caption = 'A finished photograph from the session.'; });
  await publishFixture(page, delivery);
  const cards = page.locator('.fd-chapter-library-card');
  await expect(cards).toHaveCount(11);
  await expect(cards.first().locator('img')).toHaveAttribute('src', delivery.assets[1].url);
  await expect(cards.first().locator('strong')).toHaveCSS('font-family', /Cormorant Garamond/);
  const last = cards.last(); await last.scrollIntoViewIfNeeded(); await last.click();
  await expect(page.locator('.fd-chapter-position')).toHaveAttribute('aria-label', 'Chapter 11 of 11');
  await expect(page.locator('.fd-chapter-reading-heading > p')).toHaveText(delivery.creativeDirection.sections[10].body);
  await expect(page.locator('.fd-chapter-reading-caption').first()).toHaveCSS('font-family', /Manrope/);
  const photo = page.locator('.fd-chapter-photo-motion').first();
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBe(1);
  const previous = page.getByRole('button', { name: /Previous chapter:/ });
  await previous.scrollIntoViewIfNeeded();
  const bounds = await previous.boundingBox(); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await expect(page.getByRole('button', { name: /Next chapter:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'All chapters', exact: true }).click();
  await expect(last).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('published photo and full-gallery views preserve disabled download permissions', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  const delivery = structuredClone(CHAPTERS_DEMO);
  delivery.access = { allowIndividualDownloads: false, allowDownloadAll: false, allowLikes: false };
  await publishFixture(page, delivery);
  await page.locator('.fd-chapter-library-card').first().click();
  await page.locator('.fd-chapter-reading-photo').first().click();
  const gallery = page.locator('.client-gallery');
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button', { name: /Download|Like|Favourite/i })).toHaveCount(0);
  await gallery.getByRole('button', { name: /Close/ }).last().click();
  await expect(page.locator('.fd-chapter-reading-photo').first()).toBeFocused();
  await page.getByRole('button', { name: 'All chapters', exact: true }).click();
  await page.getByRole('button', { name: 'View full gallery', exact: true }).click();
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button', { name: /Download|Like|Favourite/i })).toHaveCount(0);
  await expect(gallery.getByRole('combobox', { name: 'Chapter', exact: true })).toBeVisible();
});

test('the desktop phone demo uses the same Chapters viewer and can open a chapter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/demo/chapters');
  const phone = page.frameLocator('.v-phone-screen iframe');
  await expect(phone.locator('.fd-chapter-library-card')).toHaveCount(3);
  await phone.getByRole('button', { name: 'Open chapter 1: Side by Side', exact: true }).click();
  await expect(phone.locator('.fd-chapter-reading-heading h1')).toHaveText('Side by Side');
  await expect(phone.getByRole('button', { name: 'All chapters', exact: true })).toBeVisible();
});
