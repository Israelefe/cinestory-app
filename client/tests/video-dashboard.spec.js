import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const id = '222222222222222222222222', assetId = '333333333333333333333333';
const photoId = '444444444444444444444444';
async function dashboard(page, options = {}) {
  const state = { saves: [], revision: 4, allowDownloads: true, items: [{ assetId, title: 'The ceremony and reception', allowDownload: null }], photo: { allowIndividualDownloads: true, allowDownloadAll: false } };
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const ok = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user: { id: '111111111111111111111111', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro', studio: { name: 'Amara Studios' } } } });
    if (path.endsWith('/billing/status')) return ok({ plan: 'pro', limits: {}, usage: {} });
    if (path.endsWith('/stories/my-stories')) return ok([]);
    if (path.endsWith(`/videos/deliveries/${id}/poster`)) return route.fulfill({ contentType: 'image/webp', body: await readFile(new URL('../public/veylo/video/celebration.webp', import.meta.url)) });
    if (path.endsWith('/deliveries')) return ok(url.searchParams.get('scope') === 'archived' ? [] : [
      { _id: id, publicId: 'private-video-test', kind: 'video', status: 'published', title: 'Ada and Emeka — the wedding films', videoCount: 1, assets: [], thumbnailUrl: `/api/v1/videos/deliveries/${id}/poster` },
      { _id: photoId, publicId: 'private-photo-test', kind: 'showcase', status: 'published', title: 'The wedding photographs', assets: [{ thumbnailUrl: '/veylo/video/celebration.webp' }] }
    ]);
    if (path.endsWith(`/videos/deliveries/${id}/download-settings`)) {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON(); state.saves.push(body);
        if (options.conflict) return route.fulfill({ status: 409, json: { success: false, message: 'This delivery changed in another tab. Reopen download settings before saving.' } });
        Object.assign(state, body, { revision: state.revision + 1, items: body.items.map(item => ({ ...state.items.find(current => current.assetId === item.assetId), ...item })) });
      }
      return ok({ title: 'Ada and Emeka — the wedding films', revision: state.revision, allowDownloads: state.allowDownloads, items: state.items });
    }
    if (path.endsWith(`/deliveries/${photoId}/download-settings`)) { state.photo = route.request().postDataJSON(); return ok(state.photo); }
    if (path.endsWith(`/deliveries/${photoId}`)) return ok({ title: 'The wedding photographs', access: state.photo });
    return ok({});
  });
  return state;
}

for (const width of [320, 768, 834, 1440]) test(`video dashboard shows private cover and saves download choices at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const state = await dashboard(page); await page.goto('/dashboard');
  const card = page.locator('.v-delivery-card').filter({ has: page.getByRole('heading', { name: 'Ada and Emeka — the wedding films' }) });
  await expect(card.locator('img')).toBeVisible();
  await expect.poll(() => card.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await card.getByRole('button', { name: 'Download settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Download settings' });
  await expect(dialog.getByRole('checkbox', { name: /Allow original video downloads/ })).toBeChecked();
  await expect(dialog.getByText('Allow full gallery downloads')).toHaveCount(0);
  await dialog.getByRole('checkbox').uncheck();
  await expect(dialog.getByText('Downloads are off for every video.', { exact: false })).toBeVisible();
  await dialog.getByLabel('The ceremony and reception').selectOption('true');
  await expect(dialog.getByText('Downloads are off for every video.', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await dialog.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.saves).toEqual([{ revision: 4, allowDownloads: false, items: [{ assetId, allowDownload: true }] }]);
  await card.getByRole('button', { name: 'Download settings' }).click();
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await expect(dialog.getByLabel('The ceremony and reception')).toHaveValue('true');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('photo download settings retain both existing photo controls', async ({ page }) => {
  const state = await dashboard(page); await page.goto('/dashboard');
  await page.locator('.v-delivery-card').filter({ hasText: 'The wedding photographs' }).getByRole('button', { name: 'Download settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: /Allow individual downloads/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /Allow full gallery downloads/ })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: /Allow full gallery downloads/ }).check();
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toHaveCount(0); expect(state.photo).toEqual({ allowIndividualDownloads: true, allowDownloadAll: true });
});

test('conflicting video settings remain open with the changes and a useful error', async ({ page }) => {
  await dashboard(page, { conflict: true }); await page.goto('/dashboard');
  await page.locator('.v-delivery-card').filter({ hasText: 'Ada and Emeka' }).getByRole('button', { name: 'Download settings' }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed in another tab');
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Save settings' })).toBeEnabled();
});
