import { expect, test } from '@playwright/test';

const id = '507f1f77bcf86cd799439011';
const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'free' };
const note = 'Downloads open once the final balance is paid. Message Amara to confirm payment.';
function fixture(format = 'editorial', locked = true) {
  const assets = Array.from({ length: 6 }, (_, index) => ({ assetId: `photo-${index}`, sortOrder: index, url: '/veylo/web/demo-lora-1-1440.webp', thumbnailUrl: '/veylo/web/demo-lora-1-480.webp', width: 480, height: 640 }));
  return { _id: id, publicId: 'access-test', kind: format === 'gridboard' ? 'pinboard' : 'showcase', format: format === 'gridboard' ? 'photo-story' : format, schemaVersion: 3, status: 'published', title: 'Birthday portraits', clientName: 'Lora', shootType: 'birthday', assets, curatedAssetIds: assets.map(a => a.assetId),
    access: { allowIndividualDownloads: true, allowDownloadAll: true, downloadsLocked: locked, downloadLockNote: note, watermarkEnabled: false, watermarkText: '' },
    branding: { name: 'Amara Photography' }, v3: { openingAssetId: 'photo-0', closingAssetId: 'photo-5' },
    creativeDirection: { openingLine: "Lora's birthday", closingLine: 'A year to look forward to.', storySummary: 'Your birthday portraits, made for you.', frames: assets.map(a => ({ assetId: a.assetId, headline: 'Your birthday year', caption: 'Lora, take this birthday as a moment to celebrate what matters to you, and make space for the year ahead.' })) },
    pinboard: { title: 'Birthday portraits', selectedLayoutId: 'balanced', layouts: [{ id: 'balanced', title: 'Balanced', assetOrder: assets.map(a => a.assetId) }], moments: [], palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'staggered', analysisStatus: 'ready' } };
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
});
async function mock(page, delivery, patchHandler) {
  const requests = [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (/\/photos\/.*\/(download|file)|download-all/.test(path)) requests.push(path);
    if (path.endsWith('/auth/me')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/download-lock')) return patchHandler(route, reply);
    if (path.endsWith(`/deliveries/${id}`) || path.endsWith('/public/access-test')) return reply(delivery);
    if (path.endsWith('/stories/my-stories')) return reply([]);
    if (path.endsWith('/deliveries')) return reply(new URL(route.request().url()).searchParams.get('scope') === 'archived' ? [] : [delivery]);
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesRemaining: 2 } });
    return reply({});
  });
  return requests;
}

for (const format of ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign', 'gridboard']) {
  test(`${format} explains locked downloads in the gallery and open photo`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const requests = await mock(page, fixture(format));
    await page.goto('/d/access-test?phoneView=1');
    if (format === 'gridboard') {
      await expect(page.locator('.pb-wrap > .delivery-download-note')).toContainText(note);
      await page.locator('.pb-tile-open').first().click();
      await page.locator('.pb-lightbox').getByRole('button', { name: 'Downloads locked' }).click();
      await expect(page.locator('.pb-lightbox .delivery-download-lock-popover')).toContainText(note);
    } else {
      if (format === 'photo-story') {
        await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
        await page.getByRole('button', { name: 'Open gallery', exact: true }).click();
      } else await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
      const gallery = page.locator('.client-gallery');
      await expect(gallery.locator(':scope > .delivery-download-note')).toContainText(note);
      await gallery.getByRole('button', { name: 'Downloads locked' }).click();
      await expect(gallery.locator('.delivery-download-lock-popover')).toContainText(note);
      await gallery.getByRole('button', { name: 'Downloads locked' }).press('Escape');
      await expect(gallery).toBeVisible();
      await gallery.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
      await expect(gallery.getByRole('button', { name: 'Downloads locked' })).toBeVisible();
      await expect(gallery.getByRole('button', { name: /^Download( photograph| all|$)/ })).toHaveCount(0);
    }
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [320, 768, 834, 1440]) {
  test(`owner can unlock and relock the same published delivery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const delivery = fixture('gridboard');
    await mock(page, delivery, (route, reply) => {
      const input = route.request().postDataJSON();
      delivery.access = { ...delivery.access, ...input, downloadsLocked: input.locked, downloadLockNote: input.note };
      return reply(delivery.access);
    });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Downloads locked · Manage' }).click();
    const dialog = page.getByRole('dialog', { name: 'Download settings' });
    await dialog.getByLabel('Lock downloads', { exact: false }).uncheck();
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(dialog).toHaveCount(0);
    expect(delivery.access.downloadsLocked).toBe(false);
    expect(delivery.status).toBe('published');
    await page.getByRole('button', { name: 'Download settings', exact: true }).click();
    await dialog.getByLabel('Lock downloads', { exact: false }).check();
    await dialog.getByLabel('Message clients see').fill('Your downloads will open tomorrow.');
    await dialog.getByLabel('Watermark locked previews', { exact: false }).check();
    await dialog.getByLabel('Watermark text', { exact: false }).fill('Amara Photography');
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 320 || width === 834) {
      await dialog.evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: `../.visual-review/download-settings-${width}.png` });
    }
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('button', { name: 'Downloads locked · Manage' })).toBeVisible();
    expect(delivery.access.watermarkEnabled).toBe(true);
    expect(delivery.access.downloadLockNote).toBe('Your downloads will open tomorrow.');
  });
}

test('failed save stays in the settings dialog with a clear error and can be retried', async ({ page }) => {
  const delivery = fixture();
  let fail = true;
  await mock(page, delivery, (route, reply) => {
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Download settings are temporarily unavailable. Try again.' }) });
    return reply({ ...delivery.access, downloadsLocked: false });
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Downloads locked · Manage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Download settings' });
  await dialog.getByLabel('Lock downloads', { exact: false }).uncheck();
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(dialog.getByRole('button', { name: 'Save settings' })).toBeEnabled();
  fail = false;
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toHaveCount(0);
});

for (const width of [320, 768, 834, 1440]) test(`long GridBoard text wraps without pushing controls out at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const delivery = fixture('gridboard');
  delivery.pinboard.title = 'Lora and family celebrating a special birthday with everyone who made the year worthwhile';
  delivery.pinboard.description = 'Photographs from the birthday celebration and the time spent together with friends and family. ' + 'A'.repeat(80);
  delivery.branding.name = 'Amara Photography and Family Portrait Studio';
  delivery.pinboard.moments = [{ id: 'family', title: 'Family portraits with everyone who came to celebrate together', assetIds: ['photo-0', 'photo-1'] }];
  await mock(page, delivery);
  await page.goto('/d/access-test?phoneView=1');
  await expect(page.locator('.pb-intro h1')).toBeVisible();
  for (const selector of ['.pb-intro h1', '.pb-intro > p', '.pb-header', '.pb-moment-chip-wrap']) {
    expect(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  if (width === 320 || width === 834) await page.screenshot({ path: `../.visual-review/gridboard-long-text-${width}.png` });
  await page.getByRole('button', { name: /^Family portraits with everyone/ }).click();
  expect(await page.locator('.pb-board-top').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const format of ['editorial', 'gridboard']) test(`${format} creation preview uses watermarked media and restores clean media after unlocking`, async ({ page }) => {
  const delivery = fixture(format, false);
  let requests = 0;
  await page.route('**/api/v1/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/preview-media')) {
      requests += 1;
      expect(route.request().postDataJSON()).toEqual({ downloadsLocked: true, watermarkEnabled: true, watermarkText: 'Amara Photography' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { assets: delivery.assets.map(asset => ({ ...asset, url: asset.url + '?watermarked=studio', thumbnailUrl: asset.thumbnailUrl + '?watermarked=studio' })) } }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user, data: {} }) });
  });
  await page.goto('/__phone-preview');
  await expect(page.getByText('Waiting for the preview.', { exact: true })).toBeVisible();
  const show = async access => page.evaluate(payload => window.postMessage({ type: 'veylo:phone-preview-data', payload }, location.origin), { delivery, access });
  const verifyPhoto = async watermarked => {
    if (format !== 'gridboard') await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
    const image = page.locator(format === 'gridboard' ? '.pb-tile img' : '.client-gallery-photo img').first();
    await expect(image).toBeVisible();
    if (watermarked) await expect(image).toHaveAttribute('src', /watermarked=studio/);
    else expect(await image.getAttribute('src')).not.toContain('watermarked');
  };
  await show({ ...delivery.access, downloadsLocked: true, watermarkEnabled: true, watermarkText: 'Amara Photography' });
  await verifyPhoto(true);
  await expect(page.getByRole('button', { name: 'Downloads locked' }).first()).toBeVisible();
  if (format !== 'gridboard') await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await show({ ...delivery.access, downloadsLocked: false, watermarkEnabled: true, watermarkText: 'Amara Photography' });
  await verifyPhoto(false);
  await expect(page.getByRole('button', { name: 'Downloads locked' })).toHaveCount(0);
  expect(requests).toBe(1);
});
