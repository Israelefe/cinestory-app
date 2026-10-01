import { expect, test } from '@playwright/test';

const account = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro', studio: { name: 'Amara Studio', city: 'Lagos', state: 'Lagos' } };

async function mockAccount(page) {
  let portfolioDraft = { handle: 'amarastudio', studioName: 'Amara Studio', bio: 'Portraits and celebrations in Lagos.', items: [], projects: [], direction: {} };
  let draftRevision = 0;
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const reply = (data, extra = {}) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, ...extra }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: account }) });
    if (path.endsWith('/portfolios/mine')) { if (route.request().method() === 'PUT') { const { expectedDraftRevision, ...content } = route.request().postDataJSON(); portfolioDraft = content; draftRevision += 1; } return reply(portfolioDraft, { status: 'draft', access: 'public', draftRevision, publishedRevision: 0, hasUnpublishedChanges: draftRevision > 0, changePolicy: {} }); }
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

test('public heroes show the visual before supporting copy on phones', async ({ page }) => {
  const cases = [
    ['/', '.v-hero-title-block', '.v-hero-art', '.v-hero-after'],
    ['/formats', '.v-fguide-hero-copy', '.v-fguide-brief', '.v-fguide-hero-after'],
    ['/gridboard', '.v-gb-hero-title', '.v-gb-hero-art', '.v-gb-hero-after'],
    ['/portfolio', '.v-portfolio-hero-title', '.v-portfolio-hero-art', '.v-portfolio-hero-after'],
    ['/pricing', '.v-pricing-hero-copy:not(.v-pricing-hero-after)', '.v-pricing-format-board', '.v-pricing-hero-after'],
    ['/for/portrait-photographers', '.v-niche-hero-title', '.v-niche-hero-art', '.v-niche-hero-after'],
    ['/about', '.v-about-hero-title', '.v-editorial-image', '.v-about-hero-after']
  ];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 700 });
    for (const [route, titleSelector, visualSelector, afterSelector] of cases) {
      await page.goto(route);
      const [title, visual, after] = await Promise.all([titleSelector, visualSelector, afterSelector].map(selector => page.locator(selector).first().boundingBox()));
      expect(title?.y, `${route} title at ${width}px`).toBeLessThan(visual?.y);
      expect(visual?.y, `${route} visual at ${width}px`).toBeLessThan(after?.y);
    }
  }
});

test('each Showcase format has a clearly labelled, touch-friendly demo action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/formats');
    const links = page.locator('.v-fguide-demo-link');
    await expect(links).toHaveCount(8);
    for (const link of await links.all()) {
      await link.scrollIntoViewIfNeeded();
      await expect(link).toHaveAccessibleName(/(?:Watch|View) .+ demo/);
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(52);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
});

test('account screens keep their heading, portrait, and form in order on phones', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false}' }));
  for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/signup', '/signin']) {
      await page.goto(route);
      await expect(page.locator('.v-auth-title h1')).toBeVisible();
      await expect(page.locator('.v-auth-visual')).toBeVisible();
      await expect(page.locator('.v-auth-panel form')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width < 768) {
        const [title, visual, form] = await Promise.all(['.v-auth-title', '.v-auth-visual', '.v-auth-panel'].map(selector => page.locator(selector).boundingBox()));
        expect(title.y + title.height).toBeLessThanOrEqual(visual.y);
        expect(visual.y + visual.height).toBeLessThanOrEqual(form.y);
        expect(visual.height).toBeLessThanOrEqual(260);
      }
    }
  }
});

test('public phone header shows Sign in or Dashboard without opening the menu', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('.v-nav a.v-nav-signin')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator('.v-nav-home')).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(menu.getByRole('link', { name: /Portfolio/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await mockAccount(page);
    await page.goto('/');
    await expect(page.locator('.v-nav .v-nav-dashboard')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator('.v-nav a.v-nav-signin')).toHaveCount(0);
    await page.locator('.v-nav .v-nav-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.unroute('**/api/v1/**');
  }
});

test('Veylo Help stays off creation and portfolio pages', async ({ page }) => {
  await mockAccount(page);
  for (const route of ['/create', '/portfolio/manage', '/portfolio', '/@amarastudio']) {
    await page.goto(route);
    await expect(page.locator('.veylo-assistant-launch'), `Veylo Help on ${route}`).toHaveCount(0);
  }
});

test('portfolio preview keeps ordinary words on one line', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAccount(page);
  await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await page.getByLabel('Headline', { exact: true }).fill('Welcome to Ada Studio');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const title = page.locator('.v-pedit-preview-scroll .vpc-hero h1');
  await expect(title).toHaveText('Welcome to Ada Studio');
  const tops = await title.evaluate(element => {
    const textNode = element.firstChild;
    return Array.from({ length: 7 }, (_, index) => {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + 1);
      return Math.round(range.getBoundingClientRect().top);
    });
  });
  expect(new Set(tops).size).toBe(1);
});

test('signed-in account menu is available on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAccount(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Open account menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Account menu' });
  await expect(menu.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Portfolio' })).toBeVisible();
  expect(await menu.locator('nav').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const positions = await menu.locator('nav a').evaluateAll(links => links.map(link => ({ left: link.getBoundingClientRect().left, top: link.getBoundingClientRect().top, width: link.getBoundingClientRect().width })));
  expect(positions.every(item => item.width > 250)).toBe(true);
  expect(positions.every((item, index) => index === 0 || item.top > positions[index - 1].top)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('portfolio editor opens its photo picker with keyboard focus and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAccount(page);
  await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog', { name: 'Preview your portfolio' })).toHaveCount(0);
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
    await expect(page.getByRole('heading', { name: 'Choose the work clients see' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `portfolio editor at ${width}px`).toBe(true);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Preview your portfolio' })).toBeVisible();
    await page.getByRole('button', { name: 'Tablet' }).last().click();
    await expect(page.locator('.v-pedit-preview-scroll>div')).toHaveCSS('width', '834px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Close Preview your portfolio' }).click();
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
    const data = kind === 'deliveries' ? [{ sourceId: 'ada-birthday', title: 'Ada birthday', photoCount: 1, thumbnailUrl: '' }] : kind === 'delivery' ? [{ id: 'photo-ada', publicId: 'studio/ada-portrait', title: '', filename: 'ada-portrait.jpg', source: 'delivery', sourceId: 'ada-birthday', thumbnailUrl: '' }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, nextCursor: null }) });
  });
  await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Add photographs' }).click();
  await page.getByRole('button', { name: /Ada birthday/ }).click();
  await page.locator('.v-pedit-source-grid>button').first().click();
  await expect(page.getByText(/1 chosen/)).toBeVisible();
  await page.getByRole('button', { name: 'Add selected photographs' }).click();
  await expect(page.locator('.v-pedit-photo')).toHaveCount(1);
});

test('editing a published portfolio sends only editable draft fields', async ({ page }) => {
  await mockAccount(page);
  let saved;
  const portfolio = { handle: 'amarastudio', studioName: 'Amara Studio', bio: 'Current public bio.', headline: '', introLine: '', location: 'Lagos', contactLabel: 'Ask about a shoot', instagram: '', whatsapp: '', heroPublicId: '', items: [], direction: {}, publishedAt: '2026-09-20T00:00:00.000Z' };
  await page.route('**/api/v1/portfolios/mine', async route => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...portfolio, bio: saved.bio }, status: 'published', access: 'public', draftRevision: 1, publishedRevision: 0, hasUnpublishedChanges: true, changePolicy: {} }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: portfolio, status: 'published', live: { handle: 'amarastudio', publishedAt: portfolio.publishedAt }, hasUnpublishedChanges: false, access: 'public', changePolicy: {} }) });
  });
  await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await page.getByLabel('About your studio').fill('A revised introduction for clients.');
  await expect.poll(() => saved?.bio).toBe('A revised introduction for clients.');
  await expect(page.getByText('Changes are waiting to be published.')).toBeVisible();
  expect(saved.bio).toBe('A revised introduction for clients.');
  expect(saved).not.toHaveProperty('publishedAt');
  await expect(page.getByText('Private draft saved', { exact: true })).toBeVisible();
});
