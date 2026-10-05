import { expect, test } from '@playwright/test';
import { CHAPTERS_DEMO } from '../src/constants/deliveryDemoFixtures.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: {} } }));
});

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [834, 1194], [1024, 768], [1440, 900]]) {
  test(`Chapters has readable covers and reachable navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/demo/chapters?phoneView=1');
    const cards = page.locator('.fd-chapter-directory-board > button');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      const bounds = await card.boundingBox();
      expect(bounds.width).toBeGreaterThan(width < 768 ? width - 85 : 250);
      const title = card.locator('.fd-chapter-directory-copy strong');
      expect(parseFloat(await title.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(27);
      const description = card.locator('.fd-chapter-cover-description');
      expect(parseFloat(await description.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `../.visual-review/chapters-directory-${width}.png`, fullPage: true });

    await cards.nth(1).click();
    const heading = page.locator('.fd-chapter-room-copy h1');
    await expect(heading).toHaveText('The Way They Looked');
    await expect(heading).toBeFocused();
    await expect(page.locator('.fd-chapter-room-copy nav [aria-current="page"]')).toContainText('The Way They Looked');
    for (const photo of await page.locator('.fd-chapter-room-photos > button').all()) {
      await photo.scrollIntoViewIfNeeded();
      const surface = await photo.locator('.fd-chapter-photo-surface').boundingBox();
      const caption = await photo.locator('p').boundingBox();
      expect(caption.y).toBeGreaterThanOrEqual(surface.y + surface.height);
    }
    await page.locator('.fd-chapter-room-art > footer').scrollIntoViewIfNeeded();
    await expect(page.locator('.fd-chapter-room')).toHaveAttribute('data-chapter-explored', 'true');
    await page.getByRole('button', { name: 'Next chapter', exact: true }).click();
    await expect(heading).toHaveText('Just Us');
    await expect(heading).toBeFocused();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `../.visual-review/chapters-room-${width}.png`, fullPage: true });
    await page.locator('.fd-chapter-room-copy > button').first().click();
    await expect(cards.nth(1)).toBeFocused();
    await expect(cards.nth(1)).toHaveClass(/is-visited/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Clients can open and switch chapters with the keyboard and return to their cover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/chapters?phoneView=1');
  const cover = page.getByRole('button', { name: 'Open chapter 1: Side by Side', exact: true });
  await cover.focus();
  const scrollPosition = await page.evaluate(() => scrollY);
  await cover.press('Enter');
  const heading = page.locator('.fd-chapter-room-copy h1');
  await expect(heading).toBeFocused();
  await page.keyboard.press('Tab');
  const navigation = page.getByRole('navigation', { name: 'Other chapters' });
  await expect(navigation.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('button').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(heading).toHaveText('The Way They Looked');
  await expect(heading).toBeFocused();
  await page.locator('.fd-chapter-room-copy').getByRole('button', { name: 'All chapters', exact: true }).press('Enter');
  await expect(cover).toBeFocused();
  // The entrance translation can shift browser scroll anchoring by a few pixels.
  await expect.poll(() => page.evaluate(previous => Math.abs(scrollY - previous), scrollPosition)).toBeLessThanOrEqual(12);
});

test('Chapters retains motion with device reduced motion and honours the client pause', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo/chapters?phoneView=1');
  const cover = page.locator('.fd-chapter-directory-photo').first();
  await cover.scrollIntoViewIfNeeded();
  const transform = await cover.evaluate(element => getComputedStyle(element).transform);
  await expect.poll(() => cover.evaluate(element => getComputedStyle(element).transform)).not.toBe(transform);
  await page.getByRole('button', { name: 'Pause photo motion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume photo motion' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => cover.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBe(1);
  await page.locator('.fd-chapter-directory-board > button').first().click();
  await expect(page.getByRole('button', { name: 'Resume photo motion' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Resume photo motion', exact: true }).click();
  const photo = page.locator('.fd-chapter-photo-motion').first();
  await photo.scrollIntoViewIfNeeded();
  const pausedTransform = await photo.evaluate(element => getComputedStyle(element).transform);
  await expect.poll(() => photo.evaluate(element => getComputedStyle(element).transform)).not.toBe(pausedTransform);
});

test('A long collection keeps every chapter reachable and uses its chosen cover, body and still setting', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const delivery = structuredClone(CHAPTERS_DEMO);
  delivery.publicId = 'long-chapters';
  delivery.status = 'published';
  delivery.creativeDirection.sections = Array.from({ length: 11 }, (_, index) => ({
    id: `chapter-${index}`,
    title: `The guests and conversations from session ${index + 1}`,
    body: 'The finished photographs from this part of the day.\nThank you for being there.',
    assetIds: [delivery.assets[0].assetId, delivery.assets[1].assetId],
    coverAssetId: delivery.assets[1].assetId,
    layout: 'grid'
  }));
  delivery.creativeDirection.frames.forEach(frame => { frame.motion = 'still'; });
  await page.route('**/api/v1/deliveries/public/long-chapters**', route => route.fulfill({ json: { success: true, data: delivery } }));
  await page.goto('/d/long-chapters?phoneView=1');
  const cards = page.locator('.fd-chapter-directory-board > button');
  await expect(cards).toHaveCount(11);
  await expect(cards.first().locator('img')).toHaveAttribute('src', delivery.assets[1].url);
  const last = cards.last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  await last.click();
  await expect(page.locator('.fd-chapter-room-count')).toHaveText('11 / 11');
  await expect(page.locator('.fd-chapter-room-copy > p')).toHaveText(delivery.creativeDirection.sections[10].body);
  await expect(page.locator('.fd-chapter-room-copy nav button')).toHaveCount(11);
  const photo = page.locator('.fd-chapter-photo-motion').first();
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBe(1);
  await page.locator('.fd-chapter-room-art > footer').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Next chapter', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
