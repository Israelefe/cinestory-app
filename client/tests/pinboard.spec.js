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
    await expect(page.locator('.v-choice-format')).toHaveCount(8);
    const artDoesNotOverlapLabel = await page.locator('.is-pinboard .v-create-choice-visual').evaluate(visual => {
      const label = visual.querySelector('.v-create-choice-visual-tag').getBoundingClientRect();
      const board = visual.querySelector('.v-choice-masonry').getBoundingClientRect();
      return label.bottom < board.top;
    });
    expect(artDoesNotOverlapLabel).toBe(true);
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
  const assets = Array.from({ length: 16 }, (_, index) => ({ assetId: `photo-${index + 1}`, sortOrder: index, url: '/veylo/demo/event/event-01-arrivals.webp', thumbnailUrl: '/veylo/demo/event/event-01-arrivals.webp', width: index % 2 ? 1600 : 1000, height: index % 2 ? 1000 : 1600, ...(index === 0 ? { dominantColor: '#6b4a32' } : {}) }));
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
    const client = width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
    await expect(client.getByRole('heading', { name: 'The complete gallery' })).toBeVisible();
    await expect(client.locator('.pb-tile')).toHaveCount(16);
    await expect(page.locator('.v-phone-device')).toHaveCount(width > 1024 ? 1 : 0);
    await expect(client.locator('.pb-board-column')).toHaveCount(width === 834 ? 3 : 2);
    await client.getByRole('button', { name: 'Find photos', exact: true }).click();
    await expect(client.getByRole('navigation', { name: 'Explore the photographs' }).getByRole('region', { name: 'Find a moment' })).toBeVisible();
    await client.getByRole('button', { name: 'View photographs', exact: true }).click();
    if (width === 320) {
      await page.evaluate(() => {
        const opened = [];
        window.__pinboardOpenedLinks = opened;
        window.open = url => { opened.push(url); return null; };
        sessionStorage.setItem('veylo_delivery_grant_pinboard-public', 'grant_token_012345678901234567890123456789');
      });
      await page.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
      await expect(page.locator('.pb-lightbox-photo')).toHaveCSS('background-color', 'rgb(107, 74, 50)');
      expect(await page.locator('.pb-lightbox-photo-ambient').getAttribute('src')).toBe(await page.locator('.pb-lightbox-photo-main').getAttribute('src'));
      await page.getByRole('button', { name: 'Share on WhatsApp' }).click();
      const target = new URL(await page.evaluate(() => new URL(window.__pinboardOpenedLinks[0]).searchParams.get('text').split('\n').at(-1)));
      expect(target.searchParams.get('share')).toBe('grant_token_012345678901234567890123456789');
      expect(target.searchParams.get('photo')).toBe('photo-1');
      await page.locator('.pb-lightbox figure').evaluate(figure => {
        const fire = (type, x) => {
          const event = new Event(type, { bubbles: true });
          Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', { value: [{ clientX: x, clientY: 230 }] });
          figure.dispatchEvent(event);
        };
        fire('touchstart', 260);
        fire('touchend', 70);
      });
      await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 2 of 16');
      await page.locator('.pb-lightbox figure').evaluate(figure => {
        const fire = (type, x) => {
          const event = new Event(type, { bubbles: true });
          Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', { value: [{ clientX: x, clientY: 230 }] });
          figure.dispatchEvent(event);
        };
        fire('touchstart', 70);
        fire('touchend', 260);
      });
      await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 1 of 16');
    }
    if (width === 320) await page.getByRole('button', { name: 'Close photograph' }).click();
    await client.getByRole('button', { name: 'Find photos', exact: true }).click();
    await client.locator('.pb-moment-chip-wrap > button:first-of-type').click();
    await client.getByRole('button', { name: 'View photographs', exact: true }).click();
    await expect(client.locator('.pb-tile')).toHaveCount(8);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test('GridBoard demo opens in the shared desktop phone mockup', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/demo/gridboard');
  const client = page.frameLocator('.v-phone-screen iframe');
  await expect(client.getByRole('heading', { name: "Lora's birthday photographs" })).toBeVisible();
  await expect(client.locator('.pb-tile')).toHaveCount(6);
  await client.getByRole('button', { name: 'More gallery actions' }).click();
  await expect(client.getByRole('button', { name: 'Download all photos' })).toBeVisible();
  await expect(client.getByRole('button', { name: 'Make a WhatsApp Status card' })).toBeVisible();
  await client.getByRole('button', { name: 'Close gallery actions' }).click();
  await expect(client.getByText('Private gallery')).toBeVisible();
  await expect(page.locator('.v-phone-device')).toHaveCount(1);
  const board = await client.locator('.pb-board').evaluate(element => ({ width: element.getBoundingClientRect().width, viewport: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth }));
  expect(board.width).toBeLessThanOrEqual(board.viewport);
  expect(board.overflow).toBeLessThanOrEqual(0);
});
