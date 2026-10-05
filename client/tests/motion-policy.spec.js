import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, user: null, data: {} } }));
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  for (const width of [320, 768, 834, 1440]) {
    test(`homepage keeps motion with ${reducedMotion} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await page.goto('/');
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion === 'reduce');
      const stage = page.locator('.v-format-hero');
      await stage.scrollIntoViewIfNeeded();
      await expect(stage).toHaveClass(/is-motion-active/);
      await expect(stage.locator('.v-format-hero-wipe').first()).toBeAttached();
      await stage.getByRole('tab', { name: /Photo Story/ }).click();
      const photograph = stage.locator('.v-hf-story-photo').last();
      await expect(photograph).toBeVisible();
      const initial = await photograph.evaluate(element => getComputedStyle(element).transform);
      await expect.poll(() => photograph.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
      await expect(page.getByRole('button', { name: 'Open Veylo Help', exact: true })).not.toHaveCSS('transition-duration', '0s');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    });
  }

  test(`album keeps its photograph movement with ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/demo/album?phoneView=1');
    const photograph = page.locator('.fd-album-cover > figure');
    await expect(photograph).toBeVisible();
    const initial = await photograph.evaluate(element => getComputedStyle(element).transform);
    await expect.poll(() => photograph.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
    await page.getByRole('button', { name: 'Open album', exact: true }).click();
    await expect(page.locator('.fd-album-stage')).toBeVisible();
  });

  test(`photo reveal keeps its curtain transition with ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/demo/reveal?phoneView=1');
    await page.getByRole('button', { name: 'Begin reveal', exact: true }).click();
    await expect(page.locator('.rv-curtain')).toBeAttached();
    await expect(page.locator('.rv-caption h2')).toBeVisible();
    const photograph = page.locator('.rv-photo-frame');
    const initial = await photograph.evaluate(element => getComputedStyle(element).transform);
    await expect.poll(() => photograph.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
    await page.getByRole('button', { name: 'Reveal next photo', exact: true }).click();
    await expect(page.locator('.rv-position')).toHaveAttribute('aria-label', /Photograph 2 of/);
  });
}

test('changing the device preference while Veylo is open preserves animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('/');
  const stage = page.locator('.v-format-hero'); await stage.scrollIntoViewIfNeeded();
  await expect(stage).toHaveClass(/is-motion-active/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage).toHaveClass(/is-motion-active/);
  await stage.getByRole('tab', { name: /Photo Story/ }).click();
  const photograph = stage.locator('.v-hf-story-photo').last();
  await expect(photograph).toBeVisible();
  const initial = await photograph.evaluate(element => getComputedStyle(element).transform);
  await expect.poll(() => photograph.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
});

test('Canvas retains its print animation with device reduced motion on a tablet', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo/canvas?phoneView=1');
  const print = page.locator('.cv-frame').first(); await print.scrollIntoViewIfNeeded();
  await expect.poll(() => print.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  await expect.poll(() => print.locator('.cv-frame-surface').evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).b))).toBeGreaterThan(.01);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('Photo Swap keeps its layered cards and navigation with device reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo/photoswap?phoneView=1');
  await page.getByRole('button', { name: 'Swipe photographs', exact: true }).click();
  await expect(page.locator('.ps-print-top')).toBeVisible();
  await expect(page.locator('.ps-print-second')).toHaveCount(1);
  await expect(page.locator('.ps-print-third')).toHaveCount(1);
  const image = page.locator('.ps-print-top img');
  const initial = await image.getAttribute('src');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ps-print-top img').last()).not.toHaveAttribute('src', initial);
  await expect(page.locator('.ps-print-top')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.ps-print-top img').last()).toHaveAttribute('src', initial);
  await expect(page.locator('.ps-print-top')).toHaveCount(1);
  const top = page.locator('.ps-print-top');
  await expect.poll(() => top.evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(1);
  const box = await top.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - page.viewportSize().width * .35, y, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('.ps-print-top img').last()).not.toHaveAttribute('src', initial);
  await expect(page.locator('.ps-print-top')).toHaveCount(1);
});

test('every delivery format opens with device reduced motion enabled', async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const [path, selector] of [
    ['/demo', '.v-story-shell'],
    ['/demo/editorial', '.fd-editorial'],
    ['/demo/reveal', '.rv-viewer'],
    ['/demo/canvas', '.fd-canvas'],
    ['/demo/chapters', '.fd-chapters'],
    ['/demo/album', '.fd-album'],
    ['/demo/event-coverage', '.vec-event'],
    ['/demo/campaign', '.vec-campaign'],
    ['/demo/gridboard', '.pb-viewer'],
    ['/demo/photoswap', '.ps-viewer']
  ]) {
    await page.goto(`${path}?phoneView=1`);
    await expect(page.locator(selector)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
