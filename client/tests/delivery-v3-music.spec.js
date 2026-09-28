import { expect, test } from '@playwright/test';

const draftId = '507f1f77bcf86cd799439021';
const user = { _id: '507f1f77bcf86cd799439022', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };
const tracks = [
  { id: 'amapiano-1', title: 'A Day Worth Keeping', creator: 'Kemi Ade', genre: 'Amapiano', category: 'Amapiano', mood: 'Joyful', storyFunction: 'A warm, steady track for a personal celebration.', durationSec: 146, tags: ['birthday', 'celebration'] },
  { id: 'afrobeat-1', title: 'Good Things Ahead', creator: 'Tolu James', genre: 'Afrobeat', category: 'Afrobeat', mood: 'Bright', storyFunction: 'A relaxed Afrobeat rhythm with room for the photographs.', durationSec: 172, tags: ['birthday'] },
  { id: 'cinematic-1', title: 'Still Moments', creator: 'Mina Sound', genre: 'Cinematic', category: 'Cinematic', mood: 'Reflective', storyFunction: 'A slower instrumental for a quiet sequence.', durationSec: 191, tags: ['portrait'] }
];

test('V3 music library uses the screen width and keeps the catalogue usable on phone, tablet, and desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let draft = {
    _id: draftId,
    schemaVersion: 3,
    status: 'review',
    clientName: 'Ada',
    shootType: 'Birthday',
    brief: "Ada's 25th birthday celebration",
    format: 'photo-story',
    assets: [],
    curatedAssetIds: [],
    creativeDirection: { title: "Ada's birthday", openingLine: 'These photographs are from your birthday celebration.', closingLine: 'Here is the full collection from your day.', palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } },
    soundtrack: null,
    v3: { step: 'music', revision: 2, narrationChoice: 'skip', openingAssetId: '', closingAssetId: '' },
    access: {}
  };

  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() || {};
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, data }) });

    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', usage: { deliveriesRemaining: 2 }, limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 } });
    if (path.endsWith('/deliveries/soundtracks')) return reply(tracks);
    if (path.endsWith('/deliveries/' + draftId + '/soundtrack/select')) {
      const track = tracks.find(item => item.id === body.trackId);
      draft = { ...draft, soundtrack: { catalogId: track.id, title: track.title, genre: track.genre }, v3: { ...draft.v3, step: 'design' } };
      return reply(draft);
    }
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    return reply({});
  });

  await page.goto('/create?draft=' + draftId);
  await expect(page.getByRole('heading', { name: 'Find the right soundtrack.' })).toBeVisible();
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await expect(page.locator('.v3-track-list article')).toHaveCount(3);
  await expect(page.locator('.v3-track-list article').first()).toContainText('A Day Worth Keeping');
  await expect(page.locator('.v3-music-layout')).toHaveCSS('grid-template-columns', /\S+\s+\S+/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: '../.visual-review/delivery-v3/music-library-1440.png' });

  await page.getByRole('button', { name: 'Amapiano', exact: true }).click();
  await expect(page.locator('.v3-track-list article')).toHaveCount(1);
  await expect(page.locator('.v3-track-list')).toContainText('A Day Worth Keeping');
  await page.getByRole('button', { name: 'All music' }).click();

  for (const width of [834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const columns = await page.locator('.v3-music-layout').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(1);
    await page.screenshot({ path: `../.visual-review/delivery-v3/music-library-${width}.png` });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Use track' }).first().click();
  await expect(page.getByRole('heading', { name: 'Set the visual tone.' })).toBeVisible();
  expect(draft.soundtrack?.catalogId).toBe('amapiano-1');
});
