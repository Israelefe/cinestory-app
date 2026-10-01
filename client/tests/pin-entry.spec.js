import { test, expect } from '@playwright/test';
import { deliveryGatePalette } from '../../server/src/utils/deliveryGatePalette.js';

const palettes = {
  light: { background: '#f7efe4', surface: '#ffffff', text: '#211b18', accent: '#852f46' },
  dark: { background: '#101b22', surface: '#162630', text: '#f5f5ed', accent: '#85c9ba' }
};

async function lockedLink(page, palette, onUnlock) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true })));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' };
    if (path.endsWith('/unlock') && onUnlock) return onUnlock(route, headers);
    return route.fulfill({ status: path.endsWith('/auth/me') ? 401 : 200, headers, contentType: 'application/json', body: JSON.stringify({ success: true, data: { locked: true, branding: { type: 'studio', name: 'Apex Imagery' }, palette: deliveryGatePalette({ creativeDirection: { palette } }) } }) });
  });
  await page.goto('/d/pin-layout');
  const view = page.viewportSize().width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
  await expect(view.getByRole('heading', { name: 'Enter the six-digit PIN.' })).toBeVisible();
  await view.locator('.vd-gate').evaluate(el => el.ownerDocument.fonts.ready);
  return view;
}

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
  for (const [name, palette] of Object.entries(palettes)) {
    test(`${name} delivery PIN keeps its colours and fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const view = await lockedLink(page, palette);
      const screen = view.locator('.vd-gate');
      const colours = await screen.evaluate(el => {
        const css = getComputedStyle(el);
        return { background: css.backgroundColor, text: css.color, accent: getComputedStyle(el.querySelector('button')).backgroundColor };
      });
      const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
      expect(colours).toEqual({ background: rgb(palette.background), text: rgb(palette.text), accent: rgb(palette.accent) });
      const input = view.getByLabel('Six-digit PIN');
      await input.fill('1a2b345678');
      await expect(input).toHaveValue('123456');
      expect(await view.getByRole('button', { name: 'Open delivery' }).evaluate(el => el.offsetHeight)).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await screen.evaluate(el => el.ownerDocument.documentElement.scrollWidth <= el.ownerDocument.defaultView.innerWidth)).toBe(true);
      await expect(view.locator('.v-story-canvas,.pb-viewer,.fd-page,.client-gallery')).toHaveCount(0);
      if ([390, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/client-polish/screenshots/pin-${name}-${width}.png` });
    });
  }
}

test('PIN stays visible during submission and explains an incorrect PIN without opening photos', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await lockedLink(page, palettes.light, async (route, headers) => {
    await pending;
    return route.fulfill({ status: 403, headers, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'That PIN is not correct.' }) });
  });
  const input = page.getByLabel('Six-digit PIN');
  await expect(page.getByRole('button', { name: 'Open delivery' })).toBeDisabled();
  await input.fill('654321');
  await page.getByRole('button', { name: 'Open delivery' }).click();
  try {
    await expect(page.getByRole('button', { name: 'Opening delivery' })).toBeDisabled();
    await expect(input).toBeVisible();
    await expect(input).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole('alert')).toHaveText('That PIN is not correct.');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toBeEnabled();
  await expect(page.locator('.v-story-canvas,.pb-viewer,.fd-page,.client-gallery')).toHaveCount(0);
});
