import { openPresentationGallery } from './helpers/presentationGallery.js';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { imageSrcSetCandidates, mapImageSrcSet } from '../src/utils/imageSrcSet.js';

test('responsive URL parsing keeps Cloudinary commas and maps only complete URL candidates', () => {
  const source = 'https://res.cloudinary.com/demo/image/authenticated/c_limit,f_auto,q_auto:good,w_480/photo.webp 480w, /api/v1/media/photo?width=960 960w';
  expect(imageSrcSetCandidates(source).map(candidate => candidate.width)).toEqual([480, 960]);
  expect(mapImageSrcSet(source, url => url.startsWith('/') ? `https://api.example.test${url}` : url)).toBe(source.replace('/api/v1', 'https://api.example.test/api/v1'));
  expect(imageSrcSetCandidates('https://example.test/c_fill,w_480/photo.webp 1x, https://example.test/c_fill,w_960/photo.webp 2x').map(candidate => candidate.descriptor)).toEqual(['1x', '2x']);
});


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
    if (path.endsWith('/download-settings')) return patchHandler(route, reply);
    if (path.endsWith(`/deliveries/${id}`) || path.endsWith('/public/access-test')) return reply(delivery);
    if (path.endsWith('/stories/my-stories')) return reply([]);
    if (path.endsWith('/deliveries')) return reply(new URL(route.request().url()).searchParams.get('scope') === 'archived' ? [] : [delivery]);
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesRemaining: 2 } });
    return reply({});
  });
  return requests;
}

for (const format of ['photo-story', 'editorial', 'gridboard']) test(`${format} loads unlocked Cloudinary photos with comma-containing responsive URLs`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const delivery = fixture(format, false);
  delivery.assets = delivery.assets.map(asset => {
    const source = width => `https://res.cloudinary.com/veylo-test/image/authenticated/s--offline--/c_limit,f_auto,q_auto:good,w_${width}/${asset.assetId}.webp`;
    return { ...asset, url: source(1600), thumbnailUrl: source(480), srcSet: [480, 960, 1600].map(width => `${source(width)} ${width}w`).join(', ') };
  });
  await mock(page, delivery);
  const photo = readFileSync(new URL('../public/veylo/web/demo-lora-1-1440.webp', import.meta.url));
  await page.route('https://res.cloudinary.com/veylo-test/**', route => route.fulfill({ contentType: 'image/webp', body: photo }));
  await page.goto('/d/access-test?phoneView=1');
  if (format === 'gridboard') {
    await expect.poll(() => page.locator('.pb-tile-open img').first().evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await page.locator('.pb-tile-open').first().click();
    await expect.poll(() => page.locator('.pb-lightbox-photo-main').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  } else {
    if (format === 'photo-story') {
      await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
      await expect.poll(async () => page.locator('.v-story-scene img').evaluateAll(images => images.some(image => image.naturalWidth > 0))).toBe(true);
      await openPresentationGallery(page, 'photo-story');
    } else await openPresentationGallery(page, format);
    const gallery = page.locator('.client-gallery');
    await expect.poll(() => gallery.locator('img').first().evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await gallery.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
    await expect.poll(async () => gallery.locator('img').evaluateAll(images => images.some(image => image.naturalWidth > 0 && image.currentSrc.includes('w_1600')))).toBe(true);
  }
  const rendered = await page.locator('img[src*="res.cloudinary.com/veylo-test/"]').evaluateAll(images => images.map(image => ({ srcSet: image.srcset, currentSrc: image.currentSrc })));
  expect(rendered.length).toBeGreaterThan(0);
  for (const image of rendered) {
    expect(image.srcSet).not.toContain('undefined');
    if (image.currentSrc) expect(image.currentSrc).toContain('res.cloudinary.com/veylo-test/');
  }
});

for (const format of ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign', 'gridboard']) {
  test(`${format} makes the photographer name and mark visible at 320px`, async ({ page }) => {
    await checkStudioBrand(page, format, 320);
  });
  test(`${format} ignores retired lock and watermark settings in existing deliveries`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const delivery = fixture(format);
    delivery.access.watermarkEnabled = true;
    await mock(page, delivery);
    await page.goto('/d/access-test?phoneView=1');
    await expect(page.getByRole('button', { name: 'Downloads locked' })).toHaveCount(0);
    if (format === 'gridboard') {
      await page.getByRole('button', { name: 'More gallery actions' }).click();
      await expect(page.getByRole('button', { name: 'Download all photos', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close gallery actions' }).click();
      await page.locator('.pb-tile-open').first().click();
      await expect(page.getByRole('button', { name: 'Download photo', exact: true })).toBeVisible();
      await expect.poll(() => page.locator('.pb-lightbox-photo-main').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    } else {
      if (format === 'photo-story') {
        await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
        await openPresentationGallery(page, 'photo-story');
      } else await openPresentationGallery(page, format);
      const gallery = page.locator('.client-gallery');
      await expect(gallery.getByRole('button', { name: 'Download all photos', exact: true })).toBeVisible();
      await gallery.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
      await expect(gallery.getByRole('button', { name: 'Download photograph', exact: true })).toBeVisible();
      await expect.poll(() => gallery.locator('.client-gallery-lightbox-main').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(page.locator('.delivery-download-note, .delivery-download-lock')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

async function checkStudioBrand(page, format, width) {
  await page.setViewportSize({ width, height: 900 });
  const delivery = fixture(format, false);
  delivery.branding = { type: 'studio', name: 'Amara Photography', ...(format === 'editorial' ? {} : { logoUrl: '/veylo/web/demo-lora-1-480.webp' }) };
  await mock(page, delivery);
  await page.goto('/d/access-test?phoneView=1');
  const header = page.locator(format === 'gridboard' ? '.pb-header' : format === 'photo-story' ? '.v-story-top' : format === 'photo-reveal' ? '.rv-header' : format === 'editorial' ? '.ed-nav' : '.fd-header');
  const name = header.getByText('Amara Photography', { exact: true });
  await expect(name).toBeVisible();
  const brandMark = header.locator('.delivery-brand-mark');
  await expect(brandMark).toBeVisible();
  if (format === 'editorial') await expect(brandMark).toHaveText('AP');
  expect(await brandMark.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(42);
  expect(await name.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await name.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  if (['photo-story', 'editorial', 'gridboard'].includes(format)) await page.screenshot({ path: `../.visual-review/studio-brand-${format}-${width}.png` });
  if (format !== 'gridboard') {
    if (format === 'photo-story') {
      await page.getByRole('button', { name: 'Begin the story', exact: true }).click();
      await openPresentationGallery(page, 'photo-story');
    } else await openPresentationGallery(page, format);
    await expect(page.locator('.client-gallery-studio')).toContainText('Amara Photography');
    await expect(page.locator('.client-gallery-studio .delivery-brand-mark')).toBeVisible();
  }
}

for (const width of [768, 834, 1440]) for (const format of ['photo-story', 'editorial', 'gridboard']) {
  test(`${format} keeps photographer branding clear at ${width}px`, async ({ page }) => {
    await checkStudioBrand(page, format, width);
  });
}

for (const width of [320, 768, 834, 1440]) test(`download settings keep regular permissions without retired controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const delivery = fixture('gridboard');
  await mock(page, delivery, (route, reply) => {
    const input = route.request().postDataJSON();
    expect(Object.keys(input).sort()).toEqual(['allowDownloadAll', 'allowIndividualDownloads']);
    delivery.access = { ...delivery.access, ...input };
    return reply(input);
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Download settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download settings' });
  await expect(dialog.getByText(/watermark|lock downloads/i)).toHaveCount(0);
  await dialog.getByLabel('Allow full gallery downloads', { exact: false }).uncheck();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toHaveCount(0);
  expect(delivery.access.allowDownloadAll).toBe(false);
  expect(delivery.status).toBe('published');
  expect(delivery.publicId).toBe('access-test');
});

test('failed regular download settings save gives an error and can be retried', async ({ page }) => {
  const delivery = fixture();
  let fail = true;
  await mock(page, delivery, (route, reply) => fail
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Download settings are temporarily unavailable. Try again.' }) })
    : reply(route.request().postDataJSON()));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Download settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download settings' });
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
  await page.getByRole('button', { name: 'Find photos', exact: true }).click();
  for (const selector of ['.pb-intro h1', '.pb-intro > p', '.pb-header', '.pb-moment-chip-wrap']) {
    expect(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  if (width === 320 || width === 834) await page.screenshot({ path: `../.visual-review/gridboard-long-text-${width}.png` });
  await page.getByRole('button', { name: /^Family portraits with everyone/ }).click();
  expect(await page.locator('.pb-board-top').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const format of ['editorial', 'gridboard']) test(`${format} creation preview ignores retired watermark settings without requesting generated media`, async ({ page }) => {
  const delivery = fixture(format);
  delivery.access.watermarkEnabled = true;
  let generatedMediaRequests = 0;
  await page.route('**/api/v1/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/preview-media')) generatedMediaRequests += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user, data: {} }) });
  });
  await page.goto('/__phone-preview');
  await expect(page.getByText('Waiting for the preview.', { exact: true })).toBeVisible();
  await page.evaluate(payload => window.postMessage({ type: 'veylo:phone-preview-data', payload }, location.origin), { delivery, access: delivery.access });
  if (format !== 'gridboard') await openPresentationGallery(page, format);
  const image = page.locator(format === 'gridboard' ? '.pb-tile img' : '.client-gallery-photo img').first();
  await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
  expect(await image.getAttribute('src')).not.toContain('watermark');
  await expect(page.getByRole('button', { name: 'Downloads locked' })).toHaveCount(0);
  expect(generatedMediaRequests).toBe(0);
});
