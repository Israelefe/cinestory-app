import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const id = '507f1f77bcf86cd799439011';
const photo = '/veylo/web/demo-lora-1-480.webp';
const palette = { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' };

async function helperPage(page) {
  await page.route('**/media-offload-check', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Media checks</body></html>' }));
  await page.route('**/src/config/env.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const API_BASE_URL = '/api';" }));
  await page.goto('/media-offload-check');
}

test('profile image bytes go directly to R2 and only their details go to the API', async ({ page }) => {
  await helperPage(page);
  const calls = [];
  await page.route('**/api/v1/onboarding/logo/sign', route => {
    calls.push('sign');
    return route.fulfill({ json: { success: true, data: { uploadUrl: 'https://offline.r2.cloudflarestorage.com/veylo/profile-image', uploadHeaders: { 'content-type': 'image/jpeg' }, objectKey: 'veylo/studios/owner/profile/image', uploadToken: 'offline-upload-token', contentType: 'image/jpeg' } } });
  });
  await page.route('https://offline.r2.cloudflarestorage.com/**', route => {
    calls.push('r2');
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataBuffer().toString()).toBe('original-profile-bytes');
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route('**/api/v1/onboarding/logo/confirm', route => {
    calls.push('confirm');
    expect(route.request().postDataJSON()).toEqual({ objectKey: 'veylo/studios/owner/profile/image', uploadToken: 'offline-upload-token', contentType: 'image/jpeg' });
    return route.fulfill({ json: { success: true, url: '/profile-image' } });
  });
  const result = await page.evaluate(async () => {
    const { uploadProfileImage } = await import('/src/utils/profileUpload.js');
    return (await uploadProfileImage(new File(['original-profile-bytes'], 'portrait.jpg', { type: 'image/jpeg' }))).data.success;
  });
  expect(result).toBe(true);
  expect(calls).toEqual(['sign', 'r2', 'confirm']);
});

test('active jobs use small progress responses and fetch the full delivery once on completion', async ({ page }) => {
  await helperPage(page);
  let fullReads = 0;
  let working = true;
  await page.route('**/api/v1/deliveries/' + id + '/progress', route => route.fulfill({ json: { success: true, data: { _id: id, status: working ? 'analyzing' : 'review', generationJob: working ? { status: 'running', progress: 85 } : null } } }));
  await page.route('**/api/v1/deliveries/' + id, route => { fullReads++; return route.fulfill({ json: { success: true, data: { _id: id, assets: [{ assetId: 'photo-one' }], v3: { step: 'showcase' } } } }); });
  const active = await page.evaluate(async id => (await import('/src/utils/deliveryProgress.js')).pollDeliveryProgress(id), id);
  expect(active.progressOnly).toBe(true);
  expect(active.assets).toBeUndefined();
  expect(fullReads).toBe(0);
  working = false;
  const completed = await page.evaluate(async id => (await import('/src/utils/deliveryProgress.js')).pollDeliveryProgress(id), id);
  expect(completed.assets).toHaveLength(1);
  expect(fullReads).toBe(1);
});

for (const width of [320, 768, 834, 1440]) {
  test(`Status cards are drawn in the browser with Cloudflare photographs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await helperPage(page);
    const original = await readFile(new URL('../public' + photo, import.meta.url));
    await page.route('https://media.example.test/**', route => route.fulfill({ body: original, contentType: 'image/webp', headers: { 'Access-Control-Allow-Origin': '*' } }));
    const result = await page.evaluate(async () => {
      const { renderStatusCard } = await import('/src/utils/statusCard.js');
      const qr = document.createElement('canvas'); qr.width = 20; qr.height = 20;
      const ctx = qr.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 20, 20);
      const results = [];
      for (const count of [1, 2, 3, 4]) {
        const blob = await renderStatusCard({ title: "Ada's birthday photographs", studioName: 'Amara Studio', gallerySize: 69, photos: Array(count).fill('https://media.example.test/photograph'), qrDataUrl: qr.toDataURL(), palette: { background: '#0c0c10', accent: '#ff5a47' } });
        const image = await createImageBitmap(blob);
        results.push({ type: blob.type, bytes: blob.size, width: image.width, height: image.height });
        image.close();
      }
      return results;
    });
    expect(result).toHaveLength(4);
    expect(result.every(image => image.type === 'image/png' && image.bytes > 1000 && image.width === 1080 && image.height === 1920)).toBe(true);
  });
}

for (const kind of ['showcase', 'pinboard', 'photoswap']) for (const width of [320, 768, 834]) {
  test(`${kind} keeps uploaded photographs while polling small progress responses at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
    const assets = Array.from({ length: 6 }, (_, index) => ({ assetId: 'photo-' + index, originalFilename: `portrait-${index}.jpg`, url: photo, thumbnailUrl: photo, sortOrder: index, width: 800, height: 1200, caption: 'Ada, your birthday photographs are here.' }));
    const draft = { _id: id, kind, publicId: 'offline-client-link', schemaVersion: 3, status: 'analyzing', clientName: 'Ada', title: 'Birthday photographs', shootType: 'Birthday', format: 'photo-story', assets, curatedAssetIds: assets.map(asset => asset.assetId), access: {}, v3: { step: 'preparing', revision: 1 }, creativeDirection: { title: 'Birthday photographs', openingLine: 'Your photographs are here.', closingLine: 'Enjoy your whole collection.', palette, typography: { display: 'Playfair Display', body: 'Outfit' }, frames: assets.map(asset => ({ assetId: asset.assetId, headline: 'Birthday photographs', caption: asset.caption })) }, pinboard: { title: 'Birthday photographs', layouts: [], palette }, photoswap: {} };
    let fullReads = 0;
    let progressReads = 0;
    let done = false;
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const reply = data => route.fulfill({ json: { success: true, data } });
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user: { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro', studio: { name: 'Amara Studio' } } } });
      if (path.endsWith('/billing/status')) return reply({ plan: 'pro', limits: { photosPerDelivery: 500 }, usage: { deliveriesRemaining: null } });
      if (path.endsWith('/progress')) { progressReads++; return reply({ _id: id, status: done ? 'review' : 'analyzing', generationJob: done ? null : { status: 'running', stage: 'analyzing', progress: 35 } }); }
      if (path.endsWith('/deliveries/' + id)) {
        fullReads++;
        if (!done) return reply(draft);
        return reply({ ...draft, status: 'review', v3: { step: kind === 'showcase' ? 'showcase' : kind === 'pinboard' ? 'pinboard' : 'captions', revision: 1 }, pinboard: { ...draft.pinboard, layouts: [{ id: 'balanced', title: 'Balanced', assetOrder: assets.map(asset => asset.assetId) }] } });
      }
      return reply([]);
    });
    await page.goto('/create?draft=' + id);
    await expect.poll(() => progressReads).toBeGreaterThanOrEqual(2);
    const initialFullReads = fullReads; // Development Strict Mode may open twice.
    await expect.poll(() => progressReads).toBeGreaterThanOrEqual(3);
    expect(fullReads).toBe(initialFullReads);
    if (kind === 'pinboard') await expect(page.getByText('6 photos in this delivery')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    done = true;
    await expect.poll(() => fullReads).toBe(initialFullReads + 1);
    if (kind === 'showcase') await expect(page.getByRole('heading', { name: 'Make the selection yours.' })).toBeVisible();
    if (kind === 'pinboard') await expect(page.locator('.pb-preparing')).toHaveCount(0);
    if (kind === 'photoswap') await expect(page.locator('.ps-caption-row')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
