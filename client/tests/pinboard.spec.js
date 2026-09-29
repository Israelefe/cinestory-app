import { expect, test } from '@playwright/test';

const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };
const draftId = '507f1f77bcf86cd799439011';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true }));
  });
});

function pinboardDraft() {
  const assets = Array.from({ length: 16 }, (_, index) => ({ assetId: `photo-${index + 1}`, sortOrder: index, url: '/veylo/demo/event/event-01-arrivals.webp', thumbnailUrl: '/veylo/demo/event/event-01-arrivals.webp', width: index % 2 ? 1600 : 1000, height: index % 2 ? 1000 : 1600 }));
  return {
    _id: draftId, publicId: 'pinboard-draft', schemaVersion: 3, kind: 'pinboard', status: 'draft', clientName: 'Lora Ade', title: "Lora's birthday", assets, access: {},
    v3: { step: 'photos', revision: 1 },
    pinboard: {
      title: "Lora's birthday", selectedLayoutId: 'balanced',
      layouts: ['balanced', 'moments', 'colour-flow'].map(id => ({ id, title: id === 'balanced' ? 'Balanced' : id === 'moments' ? 'Moments together' : 'Colour flow', description: 'A complete photo arrangement.', assetOrder: assets.map(asset => asset.assetId) })),
      moments: [{ id: 'portraits', title: 'Portraits', assetIds: assets.slice(0, 8).map(asset => asset.assetId), hidden: false }],
      palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' },
      typography: { display: 'Playfair Display', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'soft-fade', analysisStatus: 'ready'
    }
  };
}

test('new delivery offers Showcase and GridBoard, then opens GridBoard details at phone, tablet, and desktop sizes', async ({ page }) => {
  for (const width of [320, 834, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    await page.unroute('**/api/v1/**');
    let draft = { ...pinboardDraft(), assets: [], pinboard: { layouts: [] } };
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
      if (path.endsWith('/billing/status')) return reply({ plan: 'free', planName: 'Free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
      if (path.endsWith('/deliveries/v3') && request.method() === 'POST') { draft = { ...draft, ...request.postDataJSON(), _id: draftId, kind: 'pinboard', v3: { step: 'photos', revision: 1 } }; return reply(draft, 201); }
      if (path.endsWith('/deliveries/' + draftId) && request.method() === 'GET') return reply(draft);
      return reply({});
    });
    await page.goto('/create');
    await expect(page.getByRole('heading', { name: 'How should this gallery open?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Showcase Delivery' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'GridBoard Delivery' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByRole('link', { name: 'Create a GridBoard' }).click();
    await expect(page.getByRole('heading', { name: 'Start with the gallery.' })).toBeVisible();
    await page.getByLabel('Client name').fill('Lora Ade');
    await page.getByLabel('Gallery title').fill("Lora's birthday");
    await page.getByRole('button', { name: 'Continue to photos' }).click();
    await expect(page.getByRole('heading', { name: 'Add the complete gallery.' })).toBeVisible();
    await expect(page.getByText('0 / 100')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test('published GridBoard shows every photo, moment navigation, and fits phone, tablet, and desktop widths', async ({ page }) => {
  const assets = Array.from({ length: 16 }, (_, index) => ({ assetId: `photo-${index + 1}`, sortOrder: index, url: '/veylo/demo/event/event-01-arrivals.webp', thumbnailUrl: '/veylo/demo/event/event-01-arrivals.webp', width: index % 2 ? 1600 : 1000, height: index % 2 ? 1000 : 1600 }));
  const delivery = { _id: draftId, publicId: 'pinboard-public', schemaVersion: 3, kind: 'pinboard', status: 'published', clientName: 'Lora Ade', title: 'The complete gallery', assets, access: { allowIndividualDownloads: true, allowDownloadAll: true, downloadsLocked: false }, branding: { type: 'veylo', name: 'Veylo', logoUrl: '' }, pinboard: { ...pinboardDraft().pinboard, title: 'The complete gallery' } };
  for (const width of [320, 834, 1440]) {
    await page.unroute('**/api/v1/**');
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/deliveries/public/pinboard-public/share-meta')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { kind: 'pinboard' } }) });
      if (path.endsWith('/deliveries/public/pinboard-public')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: delivery }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
    });
    await page.goto('/d/pinboard-public');
    await expect(page.getByRole('heading', { name: 'The complete gallery' })).toBeVisible();
    await expect(page.locator('.pb-tile')).toHaveCount(16);
    await expect(page.locator('.v-phone-device')).toHaveCount(0);
    await expect(page.locator('.pb-board-column')).toHaveCount(width === 320 ? 2 : width === 834 ? 3 : 4);
    await expect(page.getByRole('navigation', { name: 'Find a moment' })).toBeVisible();
    if (width === 320) {
      await page.evaluate(() => {
        const opened = [];
        window.__pinboardOpenedLinks = opened;
        window.open = url => { opened.push(url); return null; };
        sessionStorage.setItem('veylo_delivery_grant_pinboard-public', 'grant_token_012345678901234567890123456789');
      });
      await page.getByRole('button', { name: 'Share this photo on WhatsApp' }).first().click();
      const target = new URL(await page.evaluate(() => new URL(window.__pinboardOpenedLinks[0]).searchParams.get('text').split('\n').at(-1)));
      expect(target.searchParams.get('share')).toBe('grant_token_012345678901234567890123456789');
      expect(target.searchParams.get('photo')).toBe('photo-1');
    }
    await page.locator('.pb-moment-chip-wrap > button:first-of-type').click();
    await expect(page.locator('.pb-tile')).toHaveCount(8);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test('GridBoard demo opens as a full desktop board', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/demo/gridboard');
  await expect(page.getByRole('heading', { name: 'The day, from every angle' })).toBeVisible();
  await expect(page.locator('.pb-tile')).toHaveCount(16);
  await expect(page.locator('.v-phone-device')).toHaveCount(0);
  expect(await page.locator('.pb-board').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(900);
});
