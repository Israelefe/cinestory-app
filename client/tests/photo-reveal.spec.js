import { expect, test } from '@playwright/test';
import { PHOTO_REVEAL_DEMO } from '../src/constants/photoRevealDemo.js';
test.use({ viewport: { width: 390, height: 844 } });

const draftId = '507f1f77bcf86cd799439099';
const user = { _id: 'reveal-owner', name: 'Studio Lumière', studioName: 'Studio Lumière', email: 'studio@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro' };
function fixture() {
  const delivery = structuredClone(PHOTO_REVEAL_DEMO); delete delivery.soundtrack;
  return { ...delivery, _id: draftId, publicId: 'reveal-test', status: 'review', v3: { ...delivery.v3, step: 'design', revision: 1 } };
}
async function setup(page, delivery, captures = {}) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body = { success: true, data: {} };
    if (path.endsWith('/auth/me')) body = { success: true, user };
    else if (path.endsWith('/like')) body.data = { liked: true };
    else if (path.endsWith('/billing/status')) body.data = { plan: 'pro', limits: { deliveriesPerMonth: 20, photosPerDelivery: 500 }, usage: { deliveriesRemaining: 20 } };
    else if (path.endsWith('/v3/theme')) { captures.theme = req.postDataJSON(); Object.assign(delivery.creativeDirection, captures.theme); body.data = delivery; }
    else if (path.endsWith('/v3/approve')) { delivery.v3.step = 'access'; body.data = delivery; }
    else if (path.endsWith('/deliveries/' + draftId) || path.endsWith('/deliveries/public/reveal-test')) body.data = delivery;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}
const viewAt = (page, width) => width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
async function begin(view) { await view.getByRole('button', { name: 'Begin reveal', exact: true }).click(); await expect(view.locator('.rv-photo').last()).toHaveAttribute('data-asset-id', PHOTO_REVEAL_DEMO.assets[0].assetId); }
async function complete(view, delivery) {
  for (let at = 1; at < delivery.assets.length; at++) {
    await view.getByRole('button', { name: 'Reveal next photo', exact: true }).click();
    await expect(view.locator('.rv-position')).toHaveAttribute('aria-label', `Photograph ${at + 1} of ${delivery.assets.length}`);
  }
  await view.getByRole('button', { name: 'Complete reveal', exact: true }).click();
  await expect(view.locator('.rv-closing')).toBeVisible();
}

for (const width of [320, 390, 768, 834, 1024, 1440]) test(`Reveal shows complete photos, readable captions and three closing photos at ${width}px`, async ({ page }) => {
  test.setTimeout(60000); // Full-motion transitions also run inside the desktop phone preview.
  await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 }); const d = fixture();
  await setup(page, d); await page.goto('/d/reveal-test'); const view = viewAt(page, width);
  await expect(view.locator('.rv-opening h1')).toHaveText(d.creativeDirection.title); await begin(view);
  await expect(view.locator('.rv-caption p')).toHaveText(d.creativeDirection.frames[0].caption);
  expect(await view.locator('.rv-caption p').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  await expect.poll(() => view.locator('html').evaluate(el => el.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await view.getByRole('button', { name: 'Revisit photos', exact: true }).click(); await expect(view.getByRole('button', { name: 'Revisit photograph 1' })).toBeVisible();
  for (let at = 1; at < d.assets.length; at++) { await view.getByRole('button', { name: 'Reveal next photo', exact: true }).click(); await expect(view.locator('.rv-caption h2')).toHaveText(d.creativeDirection.frames[at].headline); }
  await view.getByRole('button', { name: 'Complete reveal', exact: true }).click();
  await expect(view.locator('.rv-ending-photos figure')).toHaveCount(3);
  expect(await view.locator('.rv-ending-photos figure').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(65);
  await expect(view.getByRole('button', { name: 'Start again', exact: true })).toBeVisible();
});

test('slow next photo keeps current photo and caption visible, then retries a failed photo', async ({ page }) => {
  const d = fixture(); await setup(page, d); await page.goto('/d/reveal-test');
  let release, blocked = true, fail = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/veylo/web/demo-sharon-2-*.webp', async route => { if (blocked) await gate; if (fail) await route.abort(); else await route.continue(); });
  await begin(page); await page.getByRole('button', { name: 'Reveal next photo', exact: true }).click();
  await expect(page.locator('.rv-loading-status')).toContainText('Loading');
  await expect(page.locator('.rv-caption h2')).toHaveText(d.creativeDirection.frames[0].headline);
  await expect(page.locator('.rv-photo').last()).toHaveAttribute('data-asset-id', d.assets[0].assetId);
  fail = true; blocked = false; release(); await expect(page.locator('.rv-error')).toContainText('could not load');
  fail = false; await page.getByRole('button', { name: 'Retry photograph', exact: true }).click();
  await expect(page.locator('.rv-caption h2')).toHaveText(d.creativeDirection.frames[1].headline);
});

test('normal motion preloads the next photo and honours the chosen reveal transition', async ({ page }) => {
  const d = fixture(); d.creativeDirection.reveal.style = 'lift'; await setup(page, d); await page.emulateMedia({ reducedMotion: 'no-preference' });
  const requests = []; page.on('request', req => requests.push(req.url()));
  await page.goto('/d/reveal-test'); await begin(page);
  await expect.poll(() => requests.some(url => /demo-sharon-2-\d+\.webp/.test(url))).toBe(true);
  await expect(page.locator('.rv-viewer')).toHaveAttribute('data-reveal-style', 'lift');
  await expect.poll(() => page.locator('.rv-caption').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});

test('gallery unlocks only after completing the reveal and replay closes access again', async ({ page }) => {
  const d = fixture(); await setup(page, d); await page.goto('/d/reveal-test');
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await begin(page);
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View photo', exact: true })).toHaveCount(0);
  await page.locator('.rv-photo').last().click();
  await expect(page.locator('.client-gallery')).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisit photos', exact: true }).click();
  await expect(page.locator('.rv-seen button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add to favourites', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await complete(page, d);
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  await expect(page.locator('.client-gallery')).toBeVisible();
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await page.getByRole('button', { name: 'View closing photograph 1', exact: true }).click();
  await expect(page.locator('.client-gallery.is-lightbox')).toBeVisible();
  await page.locator('.client-gallery').evaluate(el => { for (const [type, x] of [['touchstart', 250], ['touchend', 60]]) { const e = new Event(type, { bubbles: true }); Object.defineProperty(e, 'changedTouches', { value: [{ clientX: x, clientY: 150 }] }); el.dispatchEvent(e); } });
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await expect(page.locator('.rv-closing')).toBeVisible();
  await page.getByRole('button', { name: 'Start again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await begin(page);
  await expect(page.locator('.client-gallery')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
});

test('access settings hide favourites and downloads in the reveal and shared gallery', async ({ page }) => {
  const d = fixture(); d.access = { allowLikes: false, allowIndividualDownloads: false, allowDownloadAll: false };
  await setup(page, d); await page.goto('/d/reveal-test'); await begin(page);
  await expect(page.getByRole('button', { name: 'Add to favourites' })).toHaveCount(0);
  await complete(page, d);
  await page.getByRole('button', { name: 'Open full gallery', exact: true }).click();
  await expect(page.locator('.client-gallery').getByRole('button', { name: /Download|Favourites/ })).toHaveCount(0);
});

test('long text and white palette stay readable without horizontal overflow', async ({ page }) => {
  const d = fixture(); d.clientName = 'Sharon and her family';
  d.creativeDirection.palette = { background: '#ffffff', surface: '#ffffff', text: '#17130f', accent: '#ffffff' };
  d.creativeDirection.title = 'Sharon, your finished photographs from the studio are ready to enjoy.';
  d.creativeDirection.frames[0].headline = 'A photograph to keep and come back to';
  d.creativeDirection.frames[0].caption = 'Sharon, thank you for spending this session with us. Keep these photographs as a reminder of the day, and take your time coming back to the ones you enjoy most.';
  await page.setViewportSize({ width: 320, height: 568 }); await setup(page, d); await page.goto('/d/reveal-test');
  await expect(page.locator('.rv-opening h1')).toHaveText(d.creativeDirection.title); await begin(page);
  await expect(page.locator('.rv-caption p')).toHaveText(d.creativeDirection.frames[0].caption);
  await expect.poll(() => page.locator('html').evaluate(el => el.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Reveal next photo', exact: true }).click();
  await expect(page.locator('.rv-caption h2')).toHaveText(d.creativeDirection.frames[1].headline);
});

test('published reveal offers opt-in resume and replay clears its saved position', async ({ page }) => {
  const d = fixture(); await setup(page, d); await page.goto('/d/reveal-test'); await begin(page);
  await page.getByRole('button', { name: 'Reveal next photo', exact: true }).click(); await expect(page.locator('.rv-position')).toHaveAttribute('aria-label', 'Photograph 2 of 5');
  await page.reload(); await page.getByRole('button', { name: 'Continue from 02', exact: true }).click();
  await expect(page.locator('.rv-position')).toHaveAttribute('aria-label', 'Photograph 2 of 5');
  for (let at = 2; at < 5; at++) { await page.getByRole('button', { name: 'Reveal next photo', exact: true }).click(); await expect(page.locator('.rv-position')).toHaveAttribute('aria-label', `Photograph ${at + 1} of 5`); }
  await page.getByRole('button', { name: 'Complete reveal', exact: true }).click(); await page.getByRole('button', { name: 'Start again', exact: true }).click();
  await expect(page.getByRole('button', { name: /Continue from/ })).toHaveCount(0);
});

test('creation preview and saved theme carry the same reveal and ending settings', async ({ page }) => {
  const d = fixture(), captures = {}; await setup(page, d, captures); await page.goto('/create?draft=' + draftId);
  await page.getByRole('combobox', { name: 'Reveal transition', exact: true }).selectOption('fade');
  await page.getByRole('combobox', { name: 'Photo movement', exact: true }).selectOption('still');
  await page.getByRole('combobox', { name: 'Closing arrangement', exact: true }).selectOption('single');
  const preview = page.frameLocator('iframe'); await expect(preview.locator('.rv-viewer')).toHaveAttribute('data-reveal-style', 'fade');
  await page.getByRole('button', { name: 'Approve and set access', exact: true }).click();
  await expect.poll(() => captures.theme?.reveal).toEqual({ style: 'fade', movement: false, ending: 'single' });
});

test('demo and client use the same renderer, settings and five-photo sample', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/demo/reveal?phoneView=1');
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await begin(page);
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
  await expect(page.locator('.rv-viewer')).toHaveAttribute('data-reveal-style', 'curtain');
  await expect(page.locator('.rv-position')).toHaveAttribute('aria-label', 'Photograph 1 of 5');
  await expect(page.locator('.rv-caption p')).toHaveText(PHOTO_REVEAL_DEMO.creativeDirection.frames[0].caption);
  await complete(page, PHOTO_REVEAL_DEMO);
  await page.getByRole('button', { name: 'View full gallery', exact: true }).click();
  await expect(page.locator('.client-gallery')).toBeVisible();
});
