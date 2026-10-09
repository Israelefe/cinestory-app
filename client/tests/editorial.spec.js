import { openPresentationGallery } from './helpers/presentationGallery.js';
import { expect, test } from '@playwright/test';
import { EDITORIAL_DEMO_DELIVERY } from '../src/constants/editorialDemo.js';
import { editorialTheme, colourContrast } from '../src/utils/editorial.js';

const draftId = '507f1f77bcf86cd799439099';
const user = { _id: 'editorial-user', studioName: 'Apex Imagery Lekki', name: 'Apex Imagery Lekki', email: 'studio@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const uuid = index => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
function fixture(count = 5) {
  const delivery = structuredClone(EDITORIAL_DEMO_DELIVERY);
  delivery._id = draftId; delivery.publicId = 'editorial-test'; delivery.status = 'review'; delivery.v3.step = 'showcase'; delivery.v3.revision = 2;
  delivery.assets = Array.from({ length: count }, (_, index) => ({ ...delivery.assets[index % 5], assetId: uuid(index), width: index % 3 === 2 ? 1600 : 1000, height: index % 3 === 2 ? 900 : 1500 }));
  delivery.curatedAssetIds = delivery.assets.map(asset => asset.assetId);
  delivery.creativeDirection.frames = delivery.assets.map((asset, index) => ({ ...EDITORIAL_DEMO_DELIVERY.creativeDirection.frames[index % 5], assetId: asset.assetId }));
  delivery.creativeDirection.editorial.sections = [];
  for (let index = 0; index < count; index += 2) delivery.creativeDirection.editorial.sections.push({ id: `feature-${index / 2 + 1}`, title: `Birthday portraits ${index / 2 + 1}`, body: index === 0 ? 'Ada chose the emerald suit and ivory telephone for her thirtieth birthday portraits. The wider photographs and closer portraits give that look room to stand on its own.' : '', pullLine: '', layout: 'auto', assetIds: delivery.curatedAssetIds.slice(index, index + 2) });
  delivery.creativeDirection.sections = delivery.creativeDirection.editorial.sections;
  delivery.v3.openingAssetId = delivery.assets[0].assetId; delivery.v3.closingAssetId = delivery.assets.at(-1).assetId;
  delivery.collectionAnalysis = { images: delivery.assets.map(asset => ({ assetId: asset.assetId, summary: 'Portrait in an emerald suit.' })) };
  return delivery;
}

async function setup(page, delivery, captures = {}) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, input = request.method() === 'GET' ? {} : request.postDataJSON() || {};
    let body = { success: true, data: {} };
    if (path.endsWith('/auth/me')) body = { success: true, user };
    else if (path.endsWith('/billing/status')) body.data = { plan: 'pro', limits: { deliveriesPerMonth: 20, photosPerDelivery: 500 }, usage: { deliveriesRemaining: 20 } };
    else if (path.endsWith('/regenerate')) {
      captures.regeneration = input;
      if (input.writingBlocks) {
        (captures.reviews ||= []).push(input.writingBlocks);
        if (captures.failReview) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'The wording needs another pass. Please retry.' }) });
        body.data = { blocks: captures.review ? await captures.review(input.writingBlocks) : input.writingBlocks.map(block => ({ key: block.key, text: block.text })) };
      } else body.data = input.editorialBlock ? { text: 'Ada’s emerald suit and ivory telephone bring the birthday portraits together. The full look and closer photographs give the feature its variety.' } : { headline: 'One for your album', caption: 'Ada, keep this portrait from the year you turned thirty.' };
    }
    else if (path.endsWith('/v3/showcase')) { captures.showcase = input; delivery.creativeDirection = { ...delivery.creativeDirection, ...input, sections: input.editorial?.sections || delivery.creativeDirection.sections }; delivery.curatedAssetIds = input.assetIds; delivery.v3 = { ...delivery.v3, openingAssetId: input.openingAssetId, closingAssetId: input.closingAssetId, step: 'design' }; body.data = delivery; }
    else if (path.endsWith('/v3/theme')) { captures.theme = input; Object.assign(delivery.creativeDirection, input); body.data = delivery; }
    else if (path.endsWith('/v3/approve')) { delivery.v3.step = 'access'; body.data = delivery; }
    else if (path.endsWith('/deliveries/' + draftId) || path.endsWith('/deliveries/public/editorial-test')) body.data = delivery;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}
const at = (page, width) => width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;

for (const width of [320, 390, 768, 834, 1440]) test(`Editorial has one cover, readable captions and complete photo sections at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
  const delivery = fixture(width === 834 ? 14 : 5);
  await setup(page, delivery); await page.goto('/d/editorial-test'); const view = at(page, width);
  await expect(view.locator('.ed-cover h1')).toHaveText(delivery.creativeDirection.title);
  await expect(view.getByRole('button', { name: 'Explore the feature' })).toHaveCount(0);
  await expect(view.locator('.fd-v3-bookend')).toHaveCount(0);
  await expect(view.locator('.ed-cover')).toHaveCount(1); await expect(view.locator('.ed-closing')).toHaveCount(1);
  await expect(view.locator('.ed-section .ed-photo')).toHaveCount(delivery.assets.length - 2);
  await expect(view.locator('.ed-photo')).toHaveCount(delivery.assets.length);
  expect(await view.locator('.ed-photo').evaluateAll(elements => elements.map(element => element.dataset.assetId))).toEqual(delivery.curatedAssetIds);
  await expect(view.locator('.ed-photo figcaption p')).toHaveText(delivery.creativeDirection.frames.map(frame => frame.caption));
  await expect(view.locator('.ed-nav').getByRole('button', { name: 'Open full gallery' })).toHaveCount(0);
  await expect(view.locator('.ed-masthead')).not.toContainText(delivery.branding.name);
  await expect(view.locator('.ed-cover-footer')).not.toContainText(delivery.clientName);
  await expect(view.locator('.ed-section-number,.ed-closing .ed-eyebrow')).toHaveCount(0);
  expect(await view.locator('.ed-section figcaption p').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  await expect.poll(() => view.locator('html').evaluate(el => el.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const photoBounds = await view.locator('.ed-photo').evaluateAll(photos => photos.map(photo => {
    const image = photo.querySelector('.ed-image-wrap').getBoundingClientRect();
    const caption = photo.querySelector('figcaption').getBoundingClientRect();
    return { left: image.left, right: image.right, width: image.width, captionGap: caption.top - image.bottom, viewport: innerWidth };
  }));
  for (const bounds of photoBounds) {
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
    expect(bounds.width).toBeGreaterThan(120);
    expect(bounds.captionGap).toBeGreaterThanOrEqual(-1);
  }
  if (width === 768 || width === 834) {
    expect(await view.locator('.ed-section-grid').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
    expect(await view.locator('.ed-section-grid').nth(1).evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  }
});

for (const width of [320, 834]) for (const background of ['#ffffff', '#070709']) test(`long Editorial text remains readable on ${background} at ${width}px`, async ({ page }) => {
  const delivery = fixture(14); delivery.creativeDirection.title = 'A birthday portrait feature with a longer title for Ada at thirty'; delivery.creativeDirection.openingLine = 'Ada chose an emerald suit and an ivory telephone for these birthday portraits. '.repeat(3).trim(); delivery.creativeDirection.editorial.introduction = 'The photographs follow the same look from different angles, with room for the full outfit and the smaller details. '.repeat(5).trim(); delivery.creativeDirection.editorial.sections[0].body = 'The emerald suit and ivory telephone are the details Ada supplied for the session. These birthday portraits bring the look together. '.repeat(5).trim(); delivery.creativeDirection.frames[0].caption = 'An emerald suit and ivory telephone give Ada’s thirtieth birthday portraits a clear visual thread. The full-length photograph makes room for the look, while the closer portrait keeps those same details in view.';
  delivery.creativeDirection.palette = { background, surface: background, text: background === '#ffffff' ? '#17130f' : '#fffaf6', accent: '#ffffff' };
  await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 }); await setup(page, delivery); await page.goto('/d/editorial-test');
  await expect(page.locator('.ed-deck')).toHaveText(delivery.creativeDirection.openingLine);
  await expect(page.locator('.ed-introduction p')).toHaveText(delivery.creativeDirection.editorial.introduction);
  await expect(page.locator('.ed-section-heading>p').first()).toHaveText(delivery.creativeDirection.editorial.sections[0].body);
  await expect.poll(() => page.locator('html').evaluate(el => el.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const theme = editorialTheme(delivery); expect(colourContrast(theme['--ed-bg'], theme['--ed-accent'])).toBeGreaterThanOrEqual(4.5);
});

test('contents supports keyboard dismissal, section jumps and focus restoration', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 }); await setup(page, fixture()); await page.goto('/d/editorial-test');
  const trigger = page.getByRole('button', { name: 'Open contents' }); await trigger.click(); await expect(page.getByRole('dialog', { name: 'Contents' })).toBeVisible(); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await trigger.click(); await page.getByRole('dialog').getByRole('button', { name: /Birthday portraits 2/ }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect.poll(() => page.locator('#ed-feature-2').evaluate(el => Math.abs(el.getBoundingClientRect().top - 100))).toBeLessThan(5);
});

test('opening a photograph selects its actual gallery image and returns to the article', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const delivery = fixture(); await setup(page, delivery); await page.goto('/d/editorial-test');
  const photo = page.locator('.ed-section').nth(1).getByRole('button', { name: 'View photograph 3' }); await photo.scrollIntoViewIfNeeded(); await photo.click(); const scroll = await page.evaluate(() => scrollY);
  await expect(page.getByRole('heading', { name: 'Photograph 3' })).toBeVisible(); await expect(page.locator('.client-gallery-lightbox-main')).toHaveAttribute('src', delivery.assets[2].url);
  await page.getByRole('button', { name: 'Close gallery' }).click(); await expect(photo).toBeFocused(); expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(3);
});

for (const [width, height] of [[320, 568], [834, 600], [844, 390]]) test(`Contents keeps its controls reachable in a long collection at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  const delivery = fixture(32);
  delivery.creativeDirection.editorial.sections.forEach(section => { section.title += ' from the finished studio portrait collection'; });
  await setup(page, delivery); await page.goto('/d/editorial-test');
  const trigger = page.getByRole('button', { name: 'Open contents' });
  await trigger.click(); await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const dialog = page.getByRole('dialog', { name: 'Contents', exact: true });
  const list = dialog.getByRole('navigation', { name: 'Editorial contents' });
  const before = await page.evaluate(() => scrollY);
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(list.getByRole('button').last()).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Close contents' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Pause photo motion' })).toBeInViewport();
  expect(await dialog.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await dialog.getByRole('button', { name: 'Pause photo motion' }).click();
  await expect(page.locator('.ed-publication')).toHaveAttribute('data-motion-paused', 'true');
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  const lastSection = delivery.creativeDirection.editorial.sections.at(-1);
  await dialog.getByRole('button', { name: new RegExp(lastSection.title) }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => Math.abs((await page.locator(`#ed-${lastSection.id}`).boundingBox()).y - 100)).toBeLessThan(5);
});

test('demo uses the same publication structure and offers local favourites', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, fixture()); await page.goto('/demo/editorial'); await expect(page.locator('.ed-cover h1')).toHaveText(EDITORIAL_DEMO_DELIVERY.creativeDirection.title); await expect(page.locator('.ed-section .ed-photo')).toHaveCount(3); await expect(page.locator('.ed-photo')).toHaveCount(5); await expect(page.locator('.fd-v3-bookend')).toHaveCount(0);
  await openPresentationGallery(page, 'editorial'); await page.getByRole('button', { name: 'Add to favourites' }).first().click(); await page.getByRole('button', { name: /Favourites/ }).click(); await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(1);
});

for (const width of [320, 768, 834, 1440]) test(`Editorial demo keeps the redesigned cover and photographs intact at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page, fixture());
  await page.goto('/demo/editorial' + (width > 1024 ? '?publicationView=editorial' : ''));
  await expect(page.locator('.ed-cover h1')).toHaveText(EDITORIAL_DEMO_DELIVERY.creativeDirection.title);
  await expect(page.getByRole('button', { name: 'Explore the feature' })).toHaveCount(0);
  await expect(page.locator('.ed-photo figcaption p')).toHaveText(EDITORIAL_DEMO_DELIVERY.creativeDirection.frames.map(frame => frame.caption));
  expect(await page.locator('.ed-photo').evaluateAll(photos => photos.map(photo => photo.dataset.assetId))).toEqual(EDITORIAL_DEMO_DELIVERY.curatedAssetIds);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await openPresentationGallery(page, 'editorial');
  await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(5);
});

test('single landscape photographs keep their aspect ratio and portrait spreads alternate sides', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const delivery = fixture();
  delivery.creativeDirection.editorial.sections = delivery.assets.map((photo, index) => ({ id: `single-${index}`, title: `Birthday portrait ${index + 1}`, body: '', pullLine: '', layout: 'auto', assetIds: [photo.assetId] }));
  await setup(page, delivery); await page.goto('/d/editorial-test?publicationView=editorial');
  const landscape = page.locator('.ed-section[data-section-layout="wide"]');
  await expect(landscape).toHaveCount(1);
  const ratio = await landscape.locator('.ed-image-wrap').evaluate(image => image.clientWidth / image.clientHeight);
  expect(ratio).toBeCloseTo(1600 / 900, 2);
  const first = page.locator('.ed-section').first();
  const bounds = await first.evaluate(section => ({ photo: section.querySelector('.ed-section-grid').getBoundingClientRect().right, copy: section.querySelector('.ed-section-copy').getBoundingClientRect().left }));
  expect(bounds.photo).toBeLessThan(bounds.copy);
  await expect(page.locator('.ed-photo')).toHaveCount(5);
});

test('the closing gallery returns to the last page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, fixture()); await page.goto('/d/editorial-test');
  const button = page.getByRole('button', { name: 'View full gallery', exact: true });
  await button.scrollIntoViewIfNeeded(); await expect(button).toBeEnabled();
  // Capture the reading position at opening, before the dialog locks body scrolling.
  await button.evaluate(element => element.addEventListener('click', () => { window.editorialGalleryReadingPosition = scrollY; }, { once: true }));
  await button.click();
  const position = await page.evaluate(() => window.editorialGalleryReadingPosition);
  await page.getByRole('button', { name: 'Close gallery' }).click(); await expect(button).toBeFocused();
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - position)).toBeLessThan(3);
});

const translateY = locator => locator.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42);
const rotation = locator => locator.evaluate(element => {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
  return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
});

test('photo motion runs with the device preference set to reduce and readers can pause, reload and resume', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 }); await setup(page, fixture()); await page.goto('/d/editorial-test');
  const publication = page.locator('.ed-publication');
  const depth = page.locator('.ed-cover .ed-photo-depth');
  const frame = page.locator('.ed-cover .ed-photo-frame');
  await expect(page.locator('.ed-cover .ed-photo')).toHaveCSS('opacity', '1');
  expect(Math.abs(await rotation(frame))).toBeGreaterThan(1);
  const before = await translateY(depth);
  await page.evaluate(() => scrollTo({ top: 250, behavior: 'instant' }));
  await expect.poll(async () => Math.abs((await translateY(depth)) - before)).toBeGreaterThan(.2);
  await page.getByRole('button', { name: 'Open contents' }).click();
  await page.getByRole('button', { name: 'Pause photo motion' }).click();
  await expect(publication).toHaveAttribute('data-motion-paused', 'true');
  await expect(page.getByRole('button', { name: 'Resume photo motion' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect.poll(() => translateY(depth)).toBe(0);
  await page.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
  expect(await translateY(depth)).toBe(0);
  await page.reload();
  await expect(publication).toHaveAttribute('data-motion-paused', 'true');
  await expect(page.locator('.ed-cover .ed-photo')).toHaveAttribute('data-photo-motion', 'paused');
  expect(Math.abs(await rotation(frame))).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Open contents' }).click();
  await page.getByRole('button', { name: 'Resume photo motion' }).click();
  await expect(publication).toHaveAttribute('data-motion-paused', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ed-cover .ed-photo')).toHaveAttribute('data-photo-motion', 'active');
  await page.locator('.ed-cover .ed-image-button').click();
  expect(await rotation(page.locator('.client-gallery-lightbox-main'))).toBeCloseTo(0, 3);
});

test('photographer-selected still photos retain their slant while their motion stays stopped', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  const delivery = fixture(); delivery.creativeDirection.frames[0].motion = 'still';
  await setup(page, delivery); await page.goto('/d/editorial-test');
  const photo = page.locator('.ed-cover .ed-photo');
  await expect(photo).toHaveAttribute('data-photo-motion', 'still');
  const angle = await rotation(photo.locator('.ed-photo-frame'));
  await photo.locator('.ed-image-button').hover();
  expect(await rotation(photo.locator('.ed-photo-frame'))).toBeCloseTo(angle, 3);
  await page.evaluate(() => scrollTo({ top: 250, behavior: 'instant' }));
  expect(await translateY(photo.locator('.ed-photo-depth'))).toBe(0);
  await expect(page.locator('.ed-section .ed-photo').first()).toHaveAttribute('data-photo-motion', 'active');
});

for (const [shootType, drawing] of [['Birthday portraits', 'curve'], ['Traditional wedding', 'botanical'], ['Fashion lookbook', 'geometry']]) test(`${drawing} illustrations suit the shoot and remain decorative`, async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  const delivery = fixture(); delivery.shootType = shootType;
  await setup(page, delivery); await page.goto('/d/editorial-test');
  const artwork = page.locator('.ed-cover-illustration');
  await expect(artwork).toHaveAttribute('data-drawing', drawing);
  await expect(artwork).toHaveAttribute('aria-hidden', 'true');
  await expect(artwork).toHaveAttribute('focusable', 'false');
  await artwork.scrollIntoViewIfNeeded();
  await expect(artwork.locator('path').first()).toHaveCSS('opacity', '0.85');
  await expect(page.locator('.ed-photo figcaption p')).toHaveText(delivery.creativeDirection.frames.map(frame => frame.caption));
});

test('normal motion reveals photographs and loads the next image before it enters view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const delivery = fixture(); await setup(page, delivery); await page.emulateMedia({ reducedMotion: 'no-preference' });
  const requested = new Set(); page.on('request', request => requested.add(new URL(request.url()).pathname));
  await page.goto('/d/editorial-test');
  const photograph = page.locator('.ed-section .ed-photo').first(); await photograph.evaluate(el => window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 220, behavior: 'instant' }));
  await expect(photograph).toHaveCSS('opacity', '1'); await expect(photograph.locator('.ed-image-main')).toHaveCSS('opacity', '1');
  const next = page.locator('.ed-section .ed-photo').nth(1);
  await expect.poll(() => [...requested].some(path => path.includes('demo-ada-3-'))).toBeTruthy();
  expect(await next.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(844);
});

test('reserved photographs retain their captions and merge empty sections without losing paragraphs', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  const delivery = fixture();
  const sections = delivery.creativeDirection.editorial.sections;
  const firstBody = sections[0].body;
  const lastBody = 'These are the finished birthday photographs supplied by the studio.';
  sections[0].assetIds = [uuid(0)];
  sections[1].assetIds = [uuid(1), uuid(2), uuid(3)];
  sections[2].body = lastBody;
  await setup(page, delivery); await page.goto('/d/editorial-test');
  await expect(page.locator('.ed-section')).toHaveCount(1);
  await expect(page.locator('.ed-merged-copy p')).toHaveText([firstBody, lastBody]);
  await expect(page.locator('.ed-photo figcaption p')).toHaveText(delivery.creativeDirection.frames.map(frame => frame.caption));
  expect(await page.locator('.ed-photo').evaluateAll(elements => elements.map(element => element.dataset.assetId))).toEqual(delivery.curatedAssetIds);
  await page.getByRole('button', { name: 'Open contents' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Birthday portraits/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await openPresentationGallery(page, 'editorial');
  await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(5);
});

test('choosing the same cover and closing photograph displays it once and retains the full gallery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const delivery = fixture(); delivery.v3.closingAssetId = delivery.v3.openingAssetId;
  await setup(page, delivery); await page.goto('/d/editorial-test');
  await expect(page.locator('.ed-photo')).toHaveCount(5);
  await expect(page.locator('.ed-closing .ed-photo')).toHaveCount(0);
  await expect(page.locator('.ed-photo figcaption p')).toHaveText(delivery.creativeDirection.frames.map(frame => frame.caption));
  await openPresentationGallery(page, 'editorial');
  await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Open full gallery', exact: true })).toHaveCount(0);
});

test('desktop can switch between phone presentation and a full-width magazine', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await setup(page, fixture()); await page.goto('/d/editorial-test');
  await page.frameLocator('.v-phone-screen iframe').getByRole('button', { name: 'Read Editorial at full width' }).click(); await expect(page.locator('.ed-cover')).toBeVisible(); await expect(page.locator('.v-phone-screen iframe')).toHaveCount(0); expect(await page.locator('.ed-cover').evaluate(el => el.clientWidth)).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Show phone view' }).click(); await expect(page.locator('.v-phone-screen iframe')).toHaveCount(1);
});

test('failed image loading retains its thumbnail and offers a retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const delivery = fixture(); delivery.assets[0].url = '/editorial-failed-photo.webp'; delivery.assets[0].srcSet = undefined;
  let fail = true; await page.route('**/editorial-failed-photo.webp', route => fail ? route.abort() : route.fulfill({ status: 302, headers: { location: '/veylo/web/demo-ada-1-960.webp' } })); await setup(page, delivery); await page.goto('/d/editorial-test');
  await expect(page.locator('.ed-cover .ed-image-thumbnail')).toBeVisible(); await expect(page.locator('.ed-cover').getByRole('button', { name: 'Retry photograph' })).toBeVisible(); fail = false; await page.locator('.ed-cover').getByRole('button', { name: 'Retry photograph' }).click(); await expect(page.locator('.ed-cover .ed-image-main')).toHaveCSS('opacity', '1');
});

test('creation saves reviewed writing, sections, credits and framing and previews all device sizes', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 }); const delivery = fixture(), captures = {}; await setup(page, delivery, captures); await page.goto('/create?draft=' + draftId);
  const summary = page.getByLabel('Cover summary'); await summary.fill('Ada at thirty, with an emerald suit and ivory telephone for her birthday portraits.'); const initial = await summary.inputValue();
  await page.locator('.ed-editor').getByRole('button', { name: 'Suggest new text' }).first().click(); await expect(page.locator('.ed-edit-suggestion')).toBeVisible(); await expect(summary).toHaveValue(initial); await page.getByRole('button', { name: 'Use this text' }).click(); const approvedSummary = await summary.inputValue();
  await page.getByLabel('Feature introduction').fill('Ada chose an emerald suit and an ivory telephone. The feature gives the full look and closer portraits their own space.'); await page.getByLabel('Section 1 heading').fill('The emerald suit'); await page.getByLabel('Section 1 layout').selectOption('triptych');
  await page.getByLabel('Photo framing').selectOption('cover'); await page.getByLabel('Framing focus').selectOption('50% 20%'); await page.getByText('Photographer’s note, credits and issue label', { exact: true }).click(); await page.getByLabel('Photographer’s note', { exact: false }).fill('Ada, thank you for choosing us to make your birthday portraits.'); await page.getByRole('button', { name: 'Add credit' }).click(); await page.getByLabel('Credit 1 role').fill('Photography'); await page.getByLabel('Credit 1 name').fill('Apex Imagery Lekki');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await expect(page.getByRole('heading', { name: 'See how your delivery will look.' })).toBeVisible(); expect(captures.showcase.openingLine).toBe(approvedSummary); expect(captures.showcase.frames[0].imageFit).toBe('cover'); expect(captures.showcase.frames[0].focalPoint).toBe('50% 20%'); expect(captures.showcase.editorial.sections[0].layout).toBe('triptych'); expect(captures.showcase.editorial.credits[0].name).toBe('Apex Imagery Lekki');
  await page.getByLabel('Layout treatment').selectOption('portrait');
  for (const [label, width] of [['Phone', 390], ['Tablet', 834], ['Desktop', 1280]]) { await page.getByRole('group', { name: 'Editorial preview device' }).getByRole('button', { name: label, exact: true }).click(); const frame = page.frameLocator('.v3-design-preview iframe'); await expect(frame.locator('.ed-publication')).toHaveAttribute('data-treatment', 'portrait'); await expect.poll(() => frame.locator('html').evaluate(() => innerWidth)).toBe(width); }
  await page.getByRole('button', { name: 'Approve and set access' }).click(); expect(captures.showcase.editorial.treatment).toBe('portrait'); await page.goto('/d/editorial-test'); await expect(page.locator('.ed-deck')).toHaveText(approvedSummary); await expect(page.locator('.ed-publication')).toHaveAttribute('data-treatment', 'portrait'); await expect(page.locator('.ed-notes p')).toHaveText('Ada, thank you for choosing us to make your birthday portraits.'); await expect(page.locator('.ed-credits dd')).toHaveText('Apex Imagery Lekki');
});

test('moving a photo to a section retains its caption and saves the displayed sequence', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 }); const delivery = fixture(), captures = {}; await setup(page, delivery, captures); await page.goto('/create?draft=' + draftId); const original = delivery.creativeDirection.frames[0].caption;
  await page.getByLabel('Editorial section').selectOption('feature-3'); await expect(page.locator('.v3-showcase-item textarea').last()).toHaveValue(original); await page.getByRole('button', { name: 'Continue', exact: true }).click(); expect(captures.showcase.assetIds.at(-1)).toBe(uuid(0)); expect(captures.showcase.editorial.sections.flatMap(section => section.assetIds)).toEqual(captures.showcase.assetIds);
});

function withSparePhotos() {
  const delivery = fixture();
  for (const index of [5, 6]) {
    delivery.assets.push({ ...delivery.assets[0], assetId: uuid(index), originalFilename: `spare-${index}.jpg` });
    delivery.collectionAnalysis.images.push({ assetId: uuid(index), summary: 'Another finished birthday portrait.' });
  }
  return delivery;
}
const repairedBlocks = blocks => blocks.map(block => ({ key: block.key, text: block.kind === 'section-title' ? 'Birthday portraits to keep' : block.kind === 'section-body' ? 'Ada, these portraits mark the year you turned thirty.' : 'Ada, your birthday portraits are ready to enjoy.' }));

test('replacing an Editorial photo automatically writes its caption and repairs generated section text', async ({ page }) => {
  const delivery = withSparePhotos(), captures = { review: repairedBlocks };
  await setup(page, delivery, captures); await page.goto('/create?draft=' + draftId);
  await page.getByRole('button', { name: 'Replace this photo', exact: true }).click();
  const picker = page.getByRole('dialog'); await picker.getByRole('button', { name: 'Choose spare-5.jpg' }).click(); await picker.getByRole('button', { name: 'Use this photo' }).click(); await expect(picker).toHaveCount(0);
  await expect(page.locator('.v3-showcase-headline')).toHaveValue('One for your album'); await expect(page.locator('.v3-showcase-item textarea:not(.v3-showcase-headline)')).toHaveValue('Ada, keep this portrait from the year you turned thirty.');
  await expect(page.getByLabel('Section 1 heading')).toHaveValue('Birthday portraits to keep'); await expect(page.getByLabel('Section 1 paragraph')).toHaveValue('Ada, these portraits mark the year you turned thirty.');
  await expect(page.getByRole('button', { name: 'Use suggested text' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  expect(captures.showcase.assetIds[0]).toBe(uuid(5)); expect(captures.showcase.editorial.sections[0].assetIds[0]).toBe(uuid(5)); expect(captures.showcase.writingOverrides).toEqual([]);
});

for (const width of [320, 768, 834, 1440]) test(`manual cover wording stays protected and the review fits at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 });
  const delivery = withSparePhotos(), captures = { review: repairedBlocks }; await setup(page, delivery, captures); await page.goto('/create?draft=' + draftId);
  await page.getByLabel('Cover summary').fill('Ada, these portraits are for your thirtieth birthday.');
  await page.getByRole('button', { name: 'Choose cover photo', exact: true }).click(); const picker = page.getByRole('dialog'); await picker.getByRole('button', { name: 'Choose spare-5.jpg' }).click(); await picker.getByRole('button', { name: 'Use this photo' }).click(); await expect(picker).toHaveCount(0);
  await expect(page.getByLabel('Cover summary')).toHaveValue('Ada, these portraits are for your thirtieth birthday.');
  const review = page.getByRole('region', { name: 'Photo wording review' }); await expect(review).toContainText('Ada, your birthday portraits are ready to enjoy.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Review the suggested wording');
  await review.getByRole('button', { name: 'Keep my text' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); expect(captures.showcase.openingAssetId).toBe(uuid(5)); expect(captures.showcase.writingOverrides).toContain('openingLine'); expect(captures.showcase.openingLine).toBe('Ada, these portraits are for your thirtieth birthday.');
});

test('a failed section review preserves order and wording, then Retry applies the change', async ({ page }) => {
  const delivery = fixture(), captures = { failReview: true, review: repairedBlocks }; await setup(page, delivery, captures); await page.goto('/create?draft=' + draftId);
  const original = delivery.creativeDirection.frames[0].caption;
  await page.getByLabel('Editorial section').selectOption('feature-3'); await expect(page.getByRole('region', { name: 'Photo wording review' })).toContainText('Your previous photo order and text have been kept.');
  await expect(page.getByLabel('Editorial section')).toHaveValue('feature-1'); await expect(page.locator('.v3-showcase-item textarea:not(.v3-showcase-headline)')).toHaveValue(original);
  captures.failReview = false; await page.getByRole('button', { name: 'Retry wording review' }).click(); await expect(page.getByLabel('Editorial section')).toHaveValue('feature-3');
  await expect(page.locator('.v3-showcase-item textarea:not(.v3-showcase-headline)')).toHaveValue(original); await page.getByRole('button', { name: 'Continue', exact: true }).click(); expect(captures.showcase.assetIds.at(-1)).toBe(uuid(0));
});

test('Undo restores the photo and generated wording while retaining a later manual caption', async ({ page }) => {
  const delivery = withSparePhotos(), captures = { review: repairedBlocks }; await setup(page, delivery, captures); await page.goto('/create?draft=' + draftId);
  await page.getByRole('button', { name: 'Replace this photo', exact: true }).click(); const picker = page.getByRole('dialog'); await picker.getByRole('button', { name: 'Choose spare-5.jpg' }).click(); await picker.getByRole('button', { name: 'Use this photo' }).click(); await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit showcase photo 2' }).click(); await page.locator('.v3-showcase-item textarea:not(.v3-showcase-headline)').fill('Ada, I want you to keep this birthday portrait.'); await page.getByRole('button', { name: 'Undo photo change' }).click();
  await expect(page.locator('.v3-showcase-item textarea:not(.v3-showcase-headline)')).toHaveValue('Ada, I want you to keep this birthday portrait.'); await expect(page.getByLabel('Section 1 heading')).toHaveValue(delivery.creativeDirection.editorial.sections[0].title);
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); expect(captures.showcase.assetIds[0]).toBe(uuid(0)); expect(captures.showcase.frames[1].caption).toBe('Ada, I want you to keep this birthday portrait.'); expect(captures.showcase.writingOverrides).toContain(`frame:${uuid(1)}:caption`);
});

test('cancelled wording reviews cannot apply a stale photograph', async ({ page }) => {
  const delivery = withSparePhotos(); let release; const captures = { review: blocks => new Promise(resolve => { release = () => resolve(repairedBlocks(blocks)); }) };
  await setup(page, delivery, captures); await page.goto('/create?draft=' + draftId); const original = delivery.creativeDirection.openingLine;
  await page.getByRole('button', { name: 'Choose cover photo', exact: true }).click(); const picker = page.getByRole('dialog'); await picker.getByRole('button', { name: 'Choose spare-5.jpg' }).click(); await picker.getByRole('button', { name: 'Use this photo' }).click(); await expect.poll(() => Boolean(release)).toBe(true);
  await picker.getByRole('button', { name: 'Choose spare-6.jpg' }).click(); release(); captures.review = repairedBlocks;
  await expect(page.getByLabel('Cover summary')).toHaveValue(original); await picker.getByRole('button', { name: 'Use this photo' }).click(); await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); expect(captures.showcase.openingAssetId).toBe(uuid(6)); expect(captures.reviews).toHaveLength(2);
});
