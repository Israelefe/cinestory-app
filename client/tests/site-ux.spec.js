import { expect, test } from '@playwright/test';

const account = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro', studio: { name: 'Amara Studio', city: 'Lagos', state: 'Lagos' } };

async function mockAccount(page) {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const reply = (data, extra = {}) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, ...extra }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: account }) });
    if (path.endsWith('/portfolios/mine')) return reply({ handle: 'amarastudio', studioName: 'Amara Studio', bio: 'Portraits and celebrations in Lagos.', items: [], direction: {} }, { status: 'draft', access: 'public', hasUnpublishedChanges: false, changePolicy: {} });
    if (path.includes('/portfolios/handles/')) return reply({}, { available: true });
    if (path.endsWith('/portfolios/sources')) return reply([], { nextCursor: null });
    if (path.endsWith('/billing/status')) return reply({ plan: 'pro', limits: { deliveriesPerMonth: null }, usage: { deliveriesThisMonth: 0, deliveriesRemaining: null } });
    if (path.endsWith('/stories/my-stories') || path.endsWith('/deliveries')) return reply([]);
    return reply({});
  });
}

test('public pages fit phone, tablet, and desktop widths', async ({ page }) => {
  test.setTimeout(120000);
  const routes = ['/', '/formats', '/portfolio', '/client-experience', '/pricing', '/for/portrait-photographers', '/for/wedding-studios', '/for/birthday-shoots', '/for/media-companies', '/about', '/privacy', '/terms', '/fair-use', '/signup', '/signin'];
  for (const width of [320, 390, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}px`).toBe(true);
    }
  }
});

test('the main decision is visible early on key mobile pages', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const [route, selector] of [['/', '.v-hero-after .v-actions a'], ['/formats', '.v-fguide-hero-jump'], ['/portfolio', '.v-portfolio-hero-actions a'], ['/pricing', '.v-pricing-early-actions a'], ['/for/portrait-photographers', '.v-niche-hero-demo']]) {
    await page.goto(route);
    const box = await page.locator(selector).first().boundingBox();
    expect(box?.y, `${route} mobile action position`).toBeLessThan(700);
  }
});

test('signed-in account menu is available on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAccount(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Open account menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Account menu' });
  await expect(menu.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Portfolio' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('portfolio editor opens its photo picker with keyboard focus and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAccount(page);
  await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.v-pedit-preview-modal')).toHaveCSS('display', 'none');
  await page.locator('.v-pedit-steps button').nth(1).click();
  const opener = page.getByRole('button', { name: 'Add photographs' });
  await opener.click();
  const picker = page.getByRole('dialog', { name: 'Add photographs' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Close photograph picker' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('policy section list starts compact on phones', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Got it' }).click();
  const index = page.locator('.v-policy-mobile-nav');
  await expect(index).toBeVisible();
  await expect(index).not.toHaveAttribute('open');
  await index.locator('summary').click();
  await expect(index.locator('nav a').first()).toBeVisible();
});

test('portfolio steps and full preview fit phone, tablet, and desktop', async ({ page }) => {
  test.setTimeout(60000);
  await mockAccount(page);
  for (const width of [320, 390, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 400 ? 568 : 800 });
    await page.goto('/portfolio/manage');
    if (await page.getByRole('button', { name: 'Got it' }).count()) await page.getByRole('button', { name: 'Got it' }).click();
    await page.locator('.v-pedit-steps button').last().click();
    await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish portfolio' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `portfolio editor at ${width}px`).toBe(true);
    await page.getByRole('button', { name: 'Open full preview' }).click();
    await expect(page.getByRole('dialog', { name: 'Full-screen portfolio preview' })).toBeVisible();
    await page.getByRole('button', { name: 'Tablet' }).last().click();
    const dimensions = await page.locator('.v-pedit-preview-modal .v-pedit-preview-scroll').evaluate(element => ({ content: Math.round(element.getBoundingClientRect().width / Number(getComputedStyle(element).transform.match(/matrix\(([^,]+)/)?.[1] || 1)), visible: element.parentElement.getBoundingClientRect().width }));
    expect(dimensions.content).toBeGreaterThanOrEqual(767);
    expect(dimensions.visible).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Close full-screen preview' }).click();
  }
});

test('signed-in pages fit phone, tablet, and desktop widths', async ({ page }) => {
  test.setTimeout(60000);
  await mockAccount(page);
  for (const width of [320, 390, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
    for (const route of ['/dashboard', '/settings', '/billing', '/library', '/sharing', '/portfolio/manage']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}px`).toBe(true);
    }
  }
});

test('portfolio picker browses a delivery and adds one photograph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await mockAccount(page);
  await page.route('**/api/v1/portfolios/sources**', route => {
    const kind = new URL(route.request().url()).searchParams.get('kind');
    const data = kind === 'deliveries' ? [{ sourceId: 'ada-birthday', title: 'Ada birthday', photoCount: 1, thumbnailUrl: '' }] : kind === 'delivery' ? [{ publicId: 'studio/ada-portrait', title: 'Ada portrait', source: 'delivery', sourceId: 'ada-birthday', thumbnailUrl: '' }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, nextCursor: null }) });
  });
  await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('.v-pedit-steps button').nth(1).click();
  await page.getByRole('button', { name: 'Add photographs' }).click();
  await page.getByRole('button', { name: /Ada birthday/ }).click();
  await page.locator('.v-pedit-source-grid>button').first().click();
  await expect(page.getByText('1 of 50 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.v-pedit-selected-work article')).toHaveCount(1);
});

test('editing a published portfolio sends only editable draft fields', async ({ page }) => {
  await mockAccount(page);
  let saved;
  const portfolio = { handle: 'amarastudio', studioName: 'Amara Studio', bio: 'Current public bio.', headline: '', introLine: '', location: 'Lagos', contactLabel: 'Ask about a shoot', instagram: '', whatsapp: '', heroPublicId: '', items: [], direction: {}, publishedAt: '2026-09-20T00:00:00.000Z' };
  await page.route('**/api/v1/portfolios/mine', async route => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...portfolio, bio: saved.bio }, status: 'published', hasUnpublishedChanges: true, changePolicy: {} }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: portfolio, status: 'published', live: { handle: 'amarastudio', publishedAt: portfolio.publishedAt }, hasUnpublishedChanges: false, access: 'public', changePolicy: {} }) });
  });
  await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('#pedit-studio textarea').first().fill('A revised introduction for clients.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved draft awaiting publication')).toBeVisible();
  expect(saved.bio).toBe('A revised introduction for clients.');
  expect(saved).not.toHaveProperty('publishedAt');
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
});
