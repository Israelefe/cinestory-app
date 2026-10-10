import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseAccount = {
  id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true,
  onboardingComplete: true, onboardingStep: 1, plan: 'pro', providers: ['password'],
  studio: { name: 'Amara Studios', businessType: 'individual', city: 'Lagos', state: 'Lagos', specialties: ['Portraits'], instagram: 'amarastudios' },
  profileChangePolicy: {}
};
const deliveries = [
  { _id: 'one', publicId: 'birthday-link', title: 'Ada at 30', clientName: 'Ada', status: 'published', kind: 'showcase', format: 'photo-story', viewsCount: 42, downloadsCount: 8, assets: [{ url: '/veylo/web/audience-birthday-960.webp' }] },
  { _id: 'two', publicId: 'portrait-link', title: 'Portraits in Lagos', clientName: 'Tomi', status: 'draft', kind: 'pinboard', format: 'gridboard', assets: [{ url: '/veylo/web/audience-portrait-960.webp' }] },
  { _id: 'three', publicId: 'lookbook-link', title: 'The September lookbook', clientName: 'Moyo', status: 'review', kind: 'showcase', format: 'editorial-page', assets: [{ url: '/veylo/web/audience-commercial-960.webp' }] }
];

async function mockWorkspace(page, options = {}) {
  let account = structuredClone({ ...baseAccount, ...options.account });
  const history = { profileSaves: 0, onboardingSaves: 0, names: [] };
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://workspace-test.r2.cloudflarestorage.com/**', route => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/auth/me')) return reply({ success: true, user: account });
    if (path.endsWith('/auth/studio-name-availability')) {
      const name = url.searchParams.get('name');
      history.names.push(name);
      if (options.checkName) return reply(await options.checkName(name), options.checkStatus?.() || 200);
      return reply({ success: true, available: name?.toLowerCase() !== 'taken brand' });
    }
    if (path.endsWith('/auth/profile')) {
      history.profileSaves++;
      if (options.saveConflict) return reply({ success: false, code: 'STUDIO_NAME_TAKEN', field: 'studioName', message: 'This Studio or Brand name is already in use. Choose another name.' }, 409);
      const body = route.request().postDataJSON();
      account = { ...account, name: body.name, studio: { ...account.studio, ...body, name: body.studioName }, profileChangePolicy: { studioNameNextChangeAt: '2026-10-30T00:00:00Z' } };
      return reply({ success: true, user: account });
    }
    if (path.endsWith('/onboarding/logo/sign')) return reply({ success: true, data: { uploadUrl: 'https://workspace-test.r2.cloudflarestorage.com/logo', objectKey: 'fixture-logo', uploadToken: 'tests-only-upload-token', contentType: 'image/png' } });
    if (path.endsWith('/onboarding/logo/confirm')) {
      account = { ...account, avatar: '/veylo/web/audience-portrait-480.webp' };
      return reply({ success: true, user: account, url: account.avatar });
    }
    if (path.endsWith('/onboarding/complete')) { account.onboardingComplete = true; return reply({ success: true, user: account }); }
    if (path.endsWith('/onboarding')) {
      history.onboardingSaves++;
      const body = route.request().postDataJSON();
      account = { ...account, onboardingStep: Math.min(3, body.step + 1), studio: { ...account.studio, ...body.data, ...(body.step === 1 ? { name: body.data.studioName } : {}) } };
      return reply({ success: true, user: account });
    }
    if (path.endsWith('/billing/status')) return reply({ success: true, data: { plan: 'pro', limits: { deliveriesPerMonth: null }, usage: { deliveriesRemaining: null } } });
    if (path.endsWith('/stories/my-stories')) return reply({ success: true, data: [] });
    if (path.endsWith('/deliveries')) return reply({ success: true, data: url.searchParams.get('scope') === 'archived' ? [] : options.empty ? [] : deliveries });
    return reply({ success: true, data: {} });
  });
  return history;
}

async function expectFits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const clipped = await page.locator('.v-studio-ui').evaluate(root => [...root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, .v-delivery-card, .v-onboarding-workspace, .v-account-profile')].filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && (rect.left < -1 || rect.right > innerWidth + 1);
  }).map(element => element.id || element.className));
  expect(clipped).toEqual([]);
}

test('dashboard and settings fit narrow phones, tablets, and desktops with real content', async ({ page }) => {
  test.setTimeout(90000);
  await mockWorkspace(page);
  await mkdir('../.visual-review/studio-workspace', { recursive: true });
  for (const width of [320, 390, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/dashboard', '/settings']) {
      await page.goto(path);
      await expect(page.locator(path === '/dashboard' ? '.v-delivery-card' : '#profile-studio-name').first()).toBeVisible();
      if (path === '/settings') await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
      await expectFits(page);
      if ([390, 834, 1440].includes(width)) {
        if (path === '/dashboard') {
          await page.locator('.v-delivery-card').last().scrollIntoViewIfNeeded();
          await expect.poll(() => page.locator('.v-delivery-cover img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        await page.screenshot({ path: `../.visual-review/studio-workspace/${path.slice(1)}-${width}.png`, fullPage: true });
      }
    }
  }
});

test('all onboarding steps fit phone, tablet, and desktop and lead to the dashboard', async ({ page }) => {
  test.setTimeout(90000);
  for (const width of [320, 768, 834, 1440]) {
    await page.unroute('**/api/v1/**');
    await mockWorkspace(page, { account: { onboardingComplete: false, studio: { name: '', specialties: [] } } });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/onboarding');
    await page.getByLabel('Studio or Brand name').fill('Amara Studios');
    await expect(page.getByText('This name is available.', { exact: true })).toBeVisible();
    await page.getByLabel('Independent photographer').check();
    await page.getByLabel('City', { exact: true }).fill('Lagos');
    await page.getByLabel('State', { exact: true }).fill('Lagos');
    await expectFits(page);
    if ([834, 1440].includes(width)) {
      await mkdir('../.visual-review/studio-workspace', { recursive: true });
      await page.getByLabel('State', { exact: true }).blur();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `../.visual-review/studio-workspace/onboarding-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.getByLabel('Portraits', { exact: true }).check();
    await expectFits(page);
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByRole('heading', { name: 'How did you hear about Veylo?' })).toBeVisible();
    await page.getByRole('radio', { name: 'Another photographer', exact: true }).check();
    await expectFits(page);
    await page.getByRole('button', { name: 'Open my dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});

test('both name fields block taken names and allow a different name', async ({ page }) => {
  for (const path of ['/settings', '/onboarding']) {
    await page.unroute('**/api/v1/**');
    const history = await mockWorkspace(page, { account: { onboardingComplete: path !== '/onboarding' } });
    await page.goto(path);
    await page.getByLabel('Studio or Brand name').fill('Taken Brand');
    await expect(page.getByText('This name is already in use. Try another name.')).toBeVisible();
    const submit = page.getByRole('button', { name: path === '/settings' ? 'Save changes' : 'Save and continue' });
    await expect(submit).toBeDisabled();
    expect(history.profileSaves + history.onboardingSaves).toBe(0);
    await page.getByLabel('Studio or Brand name').fill('A New Brand');
    await expect(page.getByText('This name is available.', { exact: true })).toBeVisible();
    await expect(submit).toBeEnabled();
  }
});

test('failed availability checks can be retried and stale responses cannot approve a different name', async ({ page }) => {
  let fail = true;
  await mockWorkspace(page, {
    checkStatus: () => fail ? 503 : 200,
    checkName: async name => {
      if (name === 'Slow Name') await new Promise(resolve => setTimeout(resolve, 1000));
      return fail ? { success: false, message: 'Name check unavailable.' } : { success: true, available: name !== 'Taken Brand' };
    }
  });
  await page.goto('/settings');
  await expect(page.getByText('Name check unavailable.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('This is your account’s name.')).toBeVisible();
  await page.getByLabel('Studio or Brand name').fill('Slow Name');
  await page.waitForTimeout(550);
  await page.getByLabel('Studio or Brand name').fill('Taken Brand');
  await expect(page.getByText('This name is already in use. Try another name.')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

test('a save-time name conflict preserves the form and a logo upload preserves unsaved details', async ({ page }) => {
  const history = await mockWorkspace(page, { saveConflict: true });
  await page.goto('/settings');
  await page.getByLabel('Your name', { exact: true }).fill('Amara Okoro');
  await page.getByLabel('Studio or Brand name').fill('A New Brand');
  await expect(page.getByText('This name is available.', { exact: true })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByText('Studio image updated.')).toBeVisible();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Amara Okoro');
  await expect(page.getByLabel('Studio or Brand name')).toHaveValue('A New Brand');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.v-brand-feedback')).toContainText('already in use');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Amara Okoro');
  expect(history.profileSaves).toBe(1);
});

test('dashboard filters, search, view switch and delivery menus work', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/dashboard');
  await expect(page.locator('.v-delivery-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Published', exact: true }).click();
  await expect(page.locator('.v-delivery-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search deliveries').fill('Tomi');
  await expect(page.locator('.v-delivery-card')).toHaveCount(1);
  await page.getByLabel('Search deliveries').fill('');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.locator('.v-delivery-grid')).toHaveClass(/is-list/);
  await page.getByRole('button', { name: 'Delivery options' }).first().click();
  await expect(page.locator('.v-delivery-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.v-delivery-menu')).toHaveCount(0);
});

test('locked names still allow saving other account details', async ({ page }) => {
  await mockWorkspace(page, { account: { profileChangePolicy: { studioNameNextChangeAt: '2026-10-30T00:00:00Z' } } });
  await page.goto('/settings');
  await expect(page.getByLabel('Studio or Brand name')).toBeDisabled();
  await page.getByLabel('Your name', { exact: true }).fill('Amara Okoro');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your account details were saved.')).toBeVisible();
});
