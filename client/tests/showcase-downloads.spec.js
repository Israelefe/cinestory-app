import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { openPresentationGallery } from './helpers/presentationGallery.js';

const photo = readFileSync(new URL('../public/veylo/web/demo-lora-1-1440.webp', import.meta.url));
const assetIds = Array.from({ length: 6 }, (_, index) => `a0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
function storedZip() {
  const name = Buffer.from('portrait.webp');
  let crc = 0xffffffff;
  for (const byte of photo) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(photo.length, 18); local.writeUInt32LE(photo.length, 22); local.writeUInt16LE(name.length, 26);
  const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(photo.length, 20); directory.writeUInt32LE(photo.length, 24); directory.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(directory.length + name.length, 12); end.writeUInt32LE(local.length + name.length + photo.length, 16);
  return Buffer.concat([local, name, photo, directory, name, end]);
}
const zip = storedZip();
let archiveServer, archiveUrl;
test.beforeAll(async () => {
  // Native attachment downloads bypass Playwright request routing in Chromium.
  // Serve real bytes from another origin, like the signed storage endpoint.
  archiveServer = createServer((request, response) => {
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/zip', 'Content-Length': zip.length, 'Content-Disposition': 'attachment; filename="Ada-photographs.zip"' });
    response.end(request.method === 'HEAD' ? undefined : zip);
  });
  await new Promise(resolve => archiveServer.listen(0, '127.0.0.1', resolve));
  archiveUrl = `http://127.0.0.1:${archiveServer.address().port}/photographs.zip`;
});
test.afterAll(async () => { await new Promise(resolve => archiveServer.close(resolve)); });
function fixture(format) {
  const assets = assetIds.map((assetId, sortOrder) => ({ assetId, sortOrder, originalFilename: `portrait-${sortOrder + 1}.webp`, url: '/veylo/web/demo-lora-1-1440.webp', thumbnailUrl: '/veylo/web/demo-lora-1-480.webp', width: 960, height: 1280 }));
  const sections = [{ id: 'first', title: 'Your birthday portraits', body: 'These portraits mark your birthday.', assetIds: assetIds.slice(0, 3) }, { id: 'next', title: 'Your birthday collection', body: 'Keep these from the occasion.', assetIds: assetIds.slice(3) }];
  return { _id: '507f1f77bcf86cd799439011', publicId: 'download-test', kind: format === 'gridboard' ? 'pinboard' : format === 'photoswap' ? 'photoswap' : 'showcase', format: format === 'gridboard' ? 'photo-story' : format,
    status: 'published', schemaVersion: 3, title: 'Birthday portraits', clientName: 'Ada', shootType: 'Birthday', assets, curatedAssetIds: assetIds,
    access: { allowIndividualDownloads: true, allowDownloadAll: true }, branding: { name: 'Amara Photography' }, v3: { openingAssetId: assetIds[0], closingAssetId: assetIds[5] },
    creativeDirection: { title: 'Your birthday portraits', openingLine: 'These portraits mark your birthday.', closingLine: 'Your full birthday collection is here.', sections, frames: assets.map((asset, index) => ({ assetId: asset.assetId, headline: `Your birthday portrait ${index + 1}`, caption: 'Ada, keep these portraits from your birthday.' })) },
    pinboard: { title: 'Birthday portraits', selectedLayoutId: 'balanced', layouts: [{ id: 'balanced', title: 'Balanced', assetOrder: assetIds }], moments: [], palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'soft-fade' }
  };
}
async function prepare(page, format, failure = '') {
  const delivery = fixture(format);
  await page.addInitScript(() => {
    localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true }));
    sessionStorage.setItem('veylo_delivery_download-test', 'test-access');
    sessionStorage.setItem('veylo_delivery_grant_download-test', 'test-grant');
  });
  await page.route('**/api/v1/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/download') || path.endsWith('/download-all')) {
      expect(request.headers()['x-delivery-access']).toBe('test-access');
      expect(request.headers()['x-delivery-grant']).toBe('test-grant');
      if (failure === 'permission') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Downloads are turned off for this link.' }) });
      return reply({ url: path.endsWith('/download-all') ? failure === 'archive' ? '/test-missing.zip' : archiveUrl : '/test-photo.webp' });
    }
    if (path.endsWith('/public/download-test')) return reply(delivery);
    return reply({});
  });
  await page.route('**/test-photo.webp', route => failure === 'media' ? route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }) : route.fulfill({ contentType: 'image/webp', body: photo }));
  await page.route('**/test-missing.zip', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/d/download-test?phoneView=1');
  if (format === 'gridboard') {
    await page.locator('.pb-tile-open').first().click();
  } else if (format === 'photoswap') {
    await page.getByRole('button', { name: 'Swipe photographs', exact: true }).click();
  } else await openPresentationGallery(page, format);
  return delivery;
}
async function savedBytes(download) {
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  return readFileSync(path);
}

for (const format of ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign', 'gridboard', 'photoswap']) test(`${format} saves the original photo bytes with protected link permission`, async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, format);
  if (!['gridboard', 'photoswap'].includes(format)) await page.locator('.client-gallery').getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: format === 'gridboard' ? 'Download photo' : format === 'photoswap' ? 'Download this photo' : 'Download photograph', exact: true }).click();
  expect(await savedBytes(await download)).toEqual(photo);
});

for (const format of ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign', 'gridboard', 'photoswap']) test(`${format} downloads the full gallery as one valid ZIP`, async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 834, height: 1000 });
  await prepare(page, format);
  if (format === 'gridboard') {
    await page.getByRole('button', { name: 'Close photograph', exact: true }).click();
    await page.getByRole('button', { name: 'More gallery actions', exact: true }).click();
  } else if (format === 'photoswap') {
    for (let index = 1; index <= assetIds.length; index++) {
      await expect(page.locator('.ps-deck-region')).toHaveAttribute('aria-busy', 'false');
      await page.keyboard.press('ArrowRight');
      if (index < assetIds.length) await expect(page.locator('.ps-progress-copy')).toHaveAttribute('aria-label', `Photo ${index + 1} of ${assetIds.length}`);
    }
    await expect(page.locator('.ps-complete-actions')).toBeVisible();
  }
  const download = page.waitForEvent('download');
  await (format === 'gridboard' ? page : format === 'photoswap' ? page.locator('.ps-complete-actions') : page.locator('.client-gallery')).getByRole('button', { name: 'Download all photos', exact: true }).click();
  expect((await savedBytes(await download)).equals(zip)).toBe(true);
});

for (const failure of ['permission', 'archive']) test(`a gallery ${failure} failure does not announce a ZIP download`, async ({ page }) => {
  let downloads = 0; page.on('download', () => downloads++);
  await prepare(page, 'editorial', failure);
  await page.locator('.client-gallery').getByRole('button', { name: 'Download all photos', exact: true }).click();
  await expect(page.getByText(failure === 'permission' ? 'Downloads are turned off for this link.' : 'The gallery download could not be prepared. Please try again.', { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  await expect(page.getByText(/ZIP download has started/)).toHaveCount(0);
});

for (const failure of ['permission', 'media']) test(`a ${failure} failure reports an error without announcing a download`, async ({ page }) => {
  let downloads = 0; page.on('download', () => downloads++);
  await prepare(page, 'editorial', failure);
  await page.locator('.client-gallery').getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  await page.getByRole('button', { name: 'Download photograph', exact: true }).click();
  await expect(page.getByText(failure === 'permission' ? 'Downloads are turned off for this link.' : 'The photograph could not be downloaded. Please try again.', { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  await expect(page.getByText(/Download started|Check your Downloads folder/)).toHaveCount(0);
});

for (const width of [320, 768, 834, 1440]) test(`mixed album photographs keep their complete proportions at ${width}px`, async ({ page }) => {
  const delivery = fixture('album');
  delete delivery.soundtrack;
  delivery.assets[1] = { ...delivery.assets[1], url: '/veylo/web/demo-album-fa-3-1440.webp', thumbnailUrl: '/veylo/web/demo-album-fa-3-1440.webp', width: 1440, height: 960 };
  delivery.formatConfig = { album: { spreads: [{ id: 'mixed', layout: 'pair', assetIds: assetIds.slice(0, 2), heading: 'Your birthday portraits' }] } };
  await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: delivery }) }));
  await page.goto('/d/download-test?phoneView=1');
  await page.getByRole('button', { name: 'Open album', exact: true }).click();
  const mounts = page.locator('.album-open-book > .fd-album-spread .album-photo-button');
  await expect(mounts.first()).toBeVisible();
  await expect(page.locator('.fd-album-reader')).toHaveCSS('opacity', '1');
  const measurements = await mounts.evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { ratio: rect.width / rect.height, expected: Number(getComputedStyle(element).getPropertyValue('--album-photo-ratio')), width: rect.width, height: rect.height }; }));
  for (const measure of measurements) { expect(measure.width).toBeGreaterThan(70); expect(measure.height).toBeGreaterThan(70); expect(measure.ratio).toBeCloseTo(measure.expected, 1); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../.visual-review/showcase-album-${width}.png` });
});
