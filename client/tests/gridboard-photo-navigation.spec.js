import { expect, test } from '@playwright/test';
import { swipeGridBoardPhoto as touchGesture } from './helpers/gridboardGesture.js';
import { GRIDBOARD_DEMO } from '../src/constants/deliveryDemoFixtures.js';

test.use({ hasTouch: true, isMobile: true });
async function setup(page, record = GRIDBOARD_DEMO, phoneWrapper = false) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: record }) }));
  await page.goto('/d/swipe-test' + (phoneWrapper ? '' : '?phoneView=1'));
  const view = phoneWrapper ? page.frameLocator('.v-phone-screen iframe') : page;
  await view.getByRole('button', { name: 'Open photograph 1', exact: true }).click();
  await expect(view.locator('.pb-lightbox-photo-main')).toHaveAttribute('src', record.assets[0].url);
  return view;
}

for (const width of [390, 834]) test(`GridBoard real touch swipes browse both directions at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1112 });
  await setup(page);
  await touchGesture(page, -100);
  await expect(page.locator('.pb-lightbox-photo-main')).toHaveAttribute('src', GRIDBOARD_DEMO.assets[1].url);
  await touchGesture(page, 100);
  await expect(page.locator('.pb-lightbox-photo-main')).toHaveAttribute('src', GRIDBOARD_DEMO.assets[0].url);
});
test('GridBoard vertical touch movement keeps the current photograph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await touchGesture(page, 10, -100);
  await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 1 of 6');
});
test('GridBoard completes a second swipe when the retained image changes mid-gesture', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**' + GRIDBOARD_DEMO.assets[1].url, async route => { await held; await route.continue(); });
  await setup(page);
  await touchGesture(page, -100);
  await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 2 of 6');
  const box = await page.locator('.pb-lightbox-photo').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 15, y }] });
  release();
  await expect(page.locator('.pb-lightbox-photo-main')).toHaveAttribute('src', GRIDBOARD_DEMO.assets[1].url);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 100, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 3 of 6');
});
test('GridBoard mouse drag browses photographs in the desktop phone preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const view = await setup(page, GRIDBOARD_DEMO, true);
  const box = await view.locator('.pb-lightbox-photo').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 110, y, { steps: 8 }); await page.mouse.up();
  await expect(view.locator('.pb-lightbox-photo-main')).toHaveAttribute('src', GRIDBOARD_DEMO.assets[1].url);
});
for (const mode of ['reduce', 'none']) test(`GridBoard swiping still works with motion ${mode}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const record = structuredClone(GRIDBOARD_DEMO);
  if (mode === 'reduce') await page.emulateMedia({ reducedMotion: 'reduce' });
  else record.pinboard.animation = 'none';
  await setup(page, record);
  await touchGesture(page, -100);
  await expect(page.locator('.pb-lightbox-photo-main')).toHaveAttribute('src', record.assets[1].url);
});
test('GridBoard cancelled gestures and swipes at collection edges keep navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  await touchGesture(page, 100);
  await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 1 of 6');
  const box = await page.locator('.pb-lightbox-photo').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 20, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await session.detach();
  expect(await page.locator('.pb-lightbox-photo-main').evaluate(image => image.style.transform)).toBe('');
  await touchGesture(page, -100); await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 2 of 6');
  await page.getByRole('button', { name: 'Previous photograph' }).click(); await expect(page.locator('.pb-lightbox figcaption')).toContainText('Photograph 1 of 6');
});
