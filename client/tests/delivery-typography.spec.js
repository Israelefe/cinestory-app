import { expect, test } from '@playwright/test';
import { DEMO_PRESETS } from '../src/constants/demoStories.js';
import { photoStoryDemoDelivery } from '../src/utils/photoStoryDemo.js';
import { DELIVERY_FONTS, deliveryFontFamily, deliveryFontStyles } from '../src/utils/deliveryTypography.js';

test.describe.configure({ mode: 'parallel' });
const sample = photoStoryDemoDelivery(DEMO_PRESETS.find(preset => preset.id === 'ada'));
const draftId = '507f1f77bcf86cd799439099';
const user = { _id: 'font-user', name: 'Apex Imagery', studioName: 'Apex Imagery', email: 'studio@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const styles = ['typewriter', 'editorial_quote', 'cinematic_drift', 'minimal_clean', 'bold_banner', 'neon_pop'];
const formats = ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'];

function fixture(format = 'photo-story', typography = { display: 'Cormorant Garamond', body: 'Manrope' }) {
  const delivery = structuredClone(sample);
  delivery.format = format;
  delete delivery.soundtrack;
  delete delivery.narration;
  delivery.v3.narrationChoice = 'skip';
  delivery._id = draftId;
  delivery.publicId = 'font-story';
  delivery.status = 'review';
  delivery.v3.step = 'design';
  delivery.creativeDirection.typography = typography;
  delivery.creativeDirection.frames.forEach((frame, i) => { frame.typographyStyle = styles[i % styles.length]; });
  delivery.creativeDirection.sections = [{ id: 'portraits', title: 'The portraits', subtitle: 'The finished photographs from your birthday.', assetIds: delivery.curatedAssetIds }];
  delivery.access = { allowLikes: true, allowIndividualDownloads: true, allowDownloadAll: true };
  return delivery;
}

async function setup(page, delivery, onSave) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' };
    let body = { success: true, data: {} };
    if (path.endsWith('/auth/me')) body = { success: true, user };
    if (path.endsWith('/billing/status')) body.data = { plan: 'pro', limits: { deliveriesPerMonth: 20, photosPerDelivery: 500 }, usage: { deliveriesRemaining: 20 } };
    if (path.endsWith('/v3/theme')) {
      const saved = request.postDataJSON();
      onSave?.(saved);
      delivery.creativeDirection = { ...delivery.creativeDirection, ...saved };
      delivery.v3.revision = 3;
      body.data = delivery;
    } else if (path.endsWith('/v3/approve')) {
      delivery.v3.step = 'access';
      delivery.reviewApprovedAt = new Date().toISOString();
      body.data = delivery;
    } else if (path.endsWith('/deliveries/public/font-story') || path.endsWith('/deliveries/' + draftId)) body.data = delivery;
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
  });
}

const viewAt = (page, width) => width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
const font = async locator => (await locator.evaluate(el => getComputedStyle(el).fontFamily)).split(',')[0].replaceAll('"', '').replaceAll("'", '').trim();
async function expectFont(locator, name) { await expect.poll(() => font(locator)).toBe(name); }

async function beginStory(view) {
  await view.getByRole('button', { name: 'Begin the story', exact: true }).click();
  await view.getByRole('button', { name: 'Pause story', exact: true }).click();
}

async function captionFor(view, format) {
  if (format === 'photo-story') { await beginStory(view); return view.locator('.v-story-caption:not(.is-finale) h2'); }
  if (format === 'photo-reveal') { await view.getByRole('button', { name: 'Begin reveal', exact: true }).click(); return view.locator('.fd-reveal-caption p'); }
  if (format === 'canvas') { await view.locator('.fd-wall-card').first().click(); return view.locator('.fd-canvas-focus-copy p'); }
  if (format === 'chapters') { await view.locator('.fd-chapter-directory-board>button').first().click(); return view.locator('.fd-chapter-room-photos>button>p').first(); }
  if (format === 'album') { await view.getByRole('button', { name: 'Open album', exact: true }).click(); return view.locator('.fd-album-spread p').first(); }
  return view.locator({ editorial: '.fd-ed-spread figcaption', 'event-coverage': '.vec-photo-caption', campaign: '.vec-photo-caption' }[format]).first();
}

for (const format of formats) for (const width of [320, 834, 1440]) test(`${format} keeps selected caption and heading fonts with fixed controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 });
  await setup(page, fixture(format));
  await page.goto('/d/font-story');
  const view = viewAt(page, width);
  const heading = view.locator(format === 'photo-story' ? '.v-story-cover h1' : '.fd-page h1,.fd-page h2').first();
  await expectFont(heading, 'Cormorant Garamond');
  const caption = await captionFor(view, format);
  await expect(caption).toBeAttached();
  await expectFont(caption, 'Manrope');
  await expectFont(view.getByRole('button', { name: format === 'photo-story' ? 'Open gallery' : 'Open full gallery', exact: true }), 'Outfit');
  if (format === 'canvas') await view.getByRole('button', { name: 'Return to canvas', exact: true }).click();
  await view.getByRole('button', { name: format === 'photo-story' ? 'Open gallery' : 'Open full gallery', exact: true }).click();
  const gallery = view.locator('.client-gallery');
  await expectFont(gallery.locator('h2'), 'Cormorant Garamond');
  await expectFont(gallery.getByRole('button', { name: 'Download all photos', exact: true }), 'Outfit');
  await gallery.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  await expectFont(gallery.locator('.client-gallery-lightbox-caption'), 'Manrope');
  await expectFont(gallery.getByRole('button', { name: 'All photographs', exact: true }), 'Outfit');
  expect(await gallery.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await expect.poll(() => view.locator('html').evaluate(el => el.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

for (const style of styles) test(`Photo Story ${style} retains the chosen caption font in expanded reading`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const delivery = fixture();
  delivery.creativeDirection.frames[0].typographyStyle = style;
  delivery.creativeDirection.frames[0].caption = 'These finished photographs are yours to enjoy. '.repeat(12);
  await setup(page, delivery);
  await page.goto('/d/font-story');
  await beginStory(page);
  await expectFont(page.locator('.v-story-caption h2'), 'Manrope');
  await page.getByRole('button', { name: 'Read full caption', exact: true }).click();
  await expectFont(page.locator('.v-story-reading>p'), 'Manrope');
  await expectFont(page.locator('.v-story-reading h2'), 'Cormorant Garamond');
  await expectFont(page.getByRole('button', { name: 'Back to the story', exact: true }), 'Outfit');
  await expect(page.locator('.v-story-reading>p')).toHaveText(delivery.creativeDirection.frames[0].caption);
});

test('font mapping preserves named fonts and older presets and rejects unknown names', () => {
  for (const name of DELIVERY_FONTS) expect(deliveryFontFamily(name)).toContain(name);
  expect(deliveryFontStyles({ display: 'clean-sans', body: 'soft-serif' })).toMatchObject({ '--delivery-font-heading': "'Plus Jakarta Sans', system-ui, sans-serif", '--delivery-font-caption': "'Cormorant Garamond', Georgia, serif" });
  expect(deliveryFontFamily('unknown-font')).toBe("'Playfair Display', Georgia, serif");
  expect(deliveryFontStyles({ displayFont: 'DM Sans', bodyFont: 'Libre Baskerville' })['--delivery-font-caption']).toContain('Libre Baskerville');
});

test('creation font changes reach the live preview, saved theme, and reopened client delivery', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  const delivery = fixture('editorial', { display: 'Playfair Display', body: 'Outfit' });
  let saved;
  await setup(page, delivery, theme => { saved = theme; });
  await page.goto('/create?draft=' + draftId);
  await page.getByLabel('Headings and titles').selectOption('Cormorant Garamond');
  await page.getByLabel('Captions and supporting text').selectOption('Manrope');
  const preview = page.frameLocator('.v3-design-preview iframe');
  await expectFont(preview.locator('.fd-v3-bookend h2').first(), 'Cormorant Garamond');
  await expectFont(preview.locator('.fd-ed-spread figcaption').first(), 'Manrope');
  await page.getByRole('button', { name: 'Approve and set access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set the rules for this link.', exact: true })).toBeVisible();
  expect(saved.typography).toEqual({ display: 'Cormorant Garamond', body: 'Manrope' });
  await page.goto('/d/font-story');
  await expectFont(page.locator('.fd-v3-bookend h2').first(), 'Cormorant Garamond');
  await expectFont(page.locator('.fd-ed-spread figcaption').first(), 'Manrope');
});

test('GridBoard keeps its saved font pair and uses the interface font in photo navigation', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  const delivery = { ...fixture(), kind: 'pinboard', pinboard: { title: 'The birthday gallery', intro: 'The finished portraits from your birthday.', typography: { display: 'DM Sans', body: 'Libre Baskerville' }, layouts: [{ id: 'balanced', assetOrder: sample.assets.map(a => a.assetId) }], selectedLayoutId: 'balanced', moments: [], grid: {}, animation: 'none', palette: sample.creativeDirection.palette } };
  await setup(page, delivery);
  await page.goto('/d/font-story');
  await expectFont(page.locator('.pb-intro h1'), 'DM Sans');
  await expectFont(page.locator('.pb-intro>p'), 'Libre Baskerville');
  await expectFont(page.getByRole('button', { name: 'Slideshow', exact: true }), 'Outfit');
  await page.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  await expectFont(page.locator('.pb-lightbox figcaption'), 'Outfit');
});
