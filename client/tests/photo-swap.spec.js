import { test, expect } from '@playwright/test';

const sizes = [[320, 568], [390, 844], [640, 800], [768, 1024], [834, 1194], [1024, 768], [1440, 900], [844, 390]];
async function start(page) {
  await page.getByRole('button', { name: 'Swipe photographs', exact: true }).click();
  await expect(page.locator('.ps-print-top')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true })).toBeEnabled();
}
async function inViewport(page, locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
for (const [width, height] of sizes) {
  test(`Photo Swap cover and viewer fit ${width} × ${height}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('/demo/photoswap?phoneView=1');
    const begin = page.getByRole('button', { name: 'Swipe photographs', exact: true });
    await expect(begin).toBeVisible();
    await inViewport(page, begin);
    await inViewport(page, page.locator('.ps-start-copy h1'));
    if ([390, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/photoswap/cover-${width}.png` });
    await start(page);
    await expect(page.locator('.ps-card-photo')).toHaveJSProperty('complete', true);
    expect(await page.locator('.ps-card-photo').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
    await inViewport(page, page.locator('.ps-photo-controls'));
    await inViewport(page, page.locator('.ps-overlay-caption'));
    const print = await page.locator('.ps-print-top').boundingBox();
    const caption = await page.locator('.ps-overlay-caption').boundingBox();
    expect(caption.y).toBeGreaterThanOrEqual(print.y + print.height - 1);
    await expect(page.getByRole('button', { name: 'Previous photograph', exact: true })).toBeDisabled();
    await expect(page.locator('.ps-print-second')).toHaveCount(1);
    for (const button of await page.locator('.ps-photo-controls button').all()) {
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if ([390, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/photoswap/viewer-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('buttons, swipes, keyboard, favourites, gallery and completion work together', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/photoswap?phoneView=1');
  await start(page);
  const print = page.locator('.ps-print-top');
  await page.getByRole('button', { name: 'Like this photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlike this photo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  const gallery = page.getByRole('dialog');
  await expect(gallery.getByRole('button', { name: /Favourites/ })).toContainText('1');
  await gallery.getByRole('button', { name: 'Open photograph 2', exact: true }).click();
  await expect(gallery.getByRole('heading', { name: 'Photograph 2', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(gallery.getByRole('heading', { name: 'Photograph 3', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gallery.getByRole('heading', { name: 'Sharon’s Studio Portraits', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveCount(0);
  await expect(print).toHaveAttribute('aria-label', 'Photo 1 of 4');
  await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
  await expect(print).toHaveAttribute('aria-label', 'Photo 2 of 4');
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true })).toBeEnabled();
  await print.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(print).toHaveAttribute('aria-label', 'Photo 1 of 4');
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true })).toBeEnabled();
  const box = await print.boundingBox();
  await page.mouse.move(box.x + box.width * .75, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .5, { steps: 12 });
  await page.mouse.up();
  await expect(print).toHaveAttribute('aria-label', 'Photo 2 of 4');
  for (const at of [3, 4]) {
    const next = page.getByRole('button', { name: 'Next photograph', exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await expect(print).toHaveAttribute('aria-label', `Photo ${at} of 4`);
  }
  await page.getByRole('button', { name: 'Finish collection', exact: true }).click();
  await expect(page.locator('.ps-complete-card')).toBeVisible();
  await inViewport(page, page.getByRole('button', { name: 'View full gallery', exact: true }));
  await page.screenshot({ path: '../.visual-review/photoswap/completion-390.png' });
  await page.getByRole('button', { name: 'View full gallery', exact: true }).click();
  await expect(gallery).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start again', exact: true }).click();
  await expect(print).toHaveAttribute('aria-label', 'Photo 1 of 4');
  await expect(page.getByRole('button', { name: 'Unlike this photo', exact: true })).toBeVisible();
});

test('a slow next photo leaves the current photograph visible', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/demo-sharon-2-(480|960|1440)\.webp/, async route => { await gate; await route.continue(); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/photoswap?phoneView=1', { waitUntil: 'domcontentloaded' });
  await start(page);
  await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true })).toBeDisabled();
  await expect(page.locator('.ps-print-top')).toHaveAttribute('aria-label', 'Photo 1 of 4');
  await inViewport(page, page.locator('.ps-print-top'));
  release();
  await expect(page.locator('.ps-print-top')).toHaveAttribute('aria-label', 'Photo 2 of 4');
  await expect(page.getByRole('button', { name: 'Next photograph', exact: true })).toBeEnabled();
});

test('a failed photograph offers a retry and navigation still works', async ({ page }) => {
  await page.route(/demo-sharon-1-(480|960|1440)\.webp/, route => route.abort());
  await page.goto('/demo/photoswap?phoneView=1');
  await start(page);
  await expect(page.getByText('This photo couldn’t load.', { exact: true })).toBeVisible();
  await page.unroute(/demo-sharon-1-(480|960|1440)\.webp/);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.ps-photo-error')).toHaveCount(0);
  await expect.poll(() => page.locator('.ps-card-photo').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
  await expect(page.locator('.ps-print-top')).toHaveAttribute('aria-label', 'Photo 2 of 4');
});

test('the photo download saves the displayed photograph', async ({ page }) => {
  await page.goto('/demo/photoswap?phoneView=1');
  await start(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download this photo', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('sharon-portrait-1.webp');
});

test('sound starts on entry and respects the client mute control', async ({ page }) => {
  await page.goto('/demo/photoswap?phoneView=1');
  const audio = page.locator('.ps-viewer audio');
  await expect(audio).toHaveJSProperty('paused', true);
  await start(page);
  await expect(audio).toHaveJSProperty('paused', false);
  await page.getByRole('button', { name: 'Mute soundtrack', exact: true }).click();
  await expect(audio).toHaveJSProperty('muted', true);
  await page.getByRole('button', { name: 'Play soundtrack', exact: true }).click();
  await expect(audio).toHaveJSProperty('muted', false);
});

test('embedded preview keeps restricted actions hidden and long collections usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/__phone-preview');
  await expect(page.getByText('Waiting for the preview.', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const access = { allowLikes: false, allowIndividualDownloads: false, allowDownloadAll: false };
    const delivery = {
      _id: 'photoswap-preview', kind: 'photoswap', title: 'Ada and Tunde’s traditional wedding photographs from Lagos', clientName: 'Ada and Tunde', access,
      branding: { type: 'studio', name: 'Amara Photography Studio' },
      photoswap: { backgroundMode: 'dark', typography: { display: 'Playfair Display', body: 'Outfit' } },
      assets: Array.from({ length: 72 }, (_, index) => ({ assetId: `portrait-${index}`, sortOrder: index, width: 480, height: 640, url: '/veylo/web/demo-sharon-1-480.webp', thumbnailUrl: '/veylo/web/demo-sharon-1-480.webp', caption: 'Family and friends gathered for Ada and Tunde’s traditional wedding in Lagos. '.repeat(6) }))
    };
    window.postMessage({ type: 'veylo:phone-preview-data', payload: { delivery, access } }, window.location.origin);
  });
  await start(page);
  await expect(page.getByRole('button', { name: 'Like this photo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download this photo', exact: true })).toHaveCount(0);
  await expect(page.locator('.ps-progress-track')).toHaveCount(1);
  expect(await page.locator('.ps-viewer').evaluate(element => element.style.getPropertyValue('--ps-photo-glow'))).toBe('#070709');
  await inViewport(page, page.locator('.ps-photo-controls'));
  await inViewport(page, page.locator('.ps-overlay-caption'));
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  const gallery = page.getByRole('dialog');
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button', { name: /Download|favourites/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [320, 768, 834, 1440]) {
  test(`creator has six readable steps and a spacious form at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro' };
      const body = path.endsWith('/auth/me') ? { success: true, user } : { success: true, data: path.endsWith('/billing/status') ? { plan: 'pro', limits: { photosPerDelivery: 500 }, usage: { deliveriesRemaining: null } } : [] };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/create?type=photoswap');
    await expect(page.locator('.ps-step-nav button')).toHaveCount(6);
    await expect(page.locator('.ps-step-nav [aria-current="step"]')).toContainText('Details');
    const steps = await page.locator('.ps-step-nav button').evaluateAll(buttons => buttons.map(button => ({ y: button.getBoundingClientRect().y, width: button.getBoundingClientRect().width })));
    expect(new Set(steps.map(step => Math.round(step.y))).size).toBe(width < 640 ? 2 : 1);
    expect(steps.every(step => step.width >= 44)).toBe(true);
    const form = await page.locator('.ps-step-card').boundingBox();
    if (width >= 768 && width <= 834) expect(form.width).toBeGreaterThan(width * .85);
    await expect(page.getByLabel('Client name', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if ([834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/photoswap/creator-${width}.png`, fullPage: true });
  });
}
