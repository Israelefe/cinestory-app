import { expect, test } from '@playwright/test';

const plans = [{ id: 'free', deliveriesPerMonth: 3, photosPerDelivery: 100 }, { id: 'pro', deliveriesPerMonth: null, photosPerDelivery: 500, personalStorageGb: 100 }];
async function setup(page, { user = null, publicPlans = plans, price = 40000 } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user } });
    if (path.endsWith('/billing/plans')) return route.fulfill({ json: { success: true, data: publicPlans, pricing: { monthlyPriceNaira: price, amountKobo: price * 100 } } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  await page.goto('/product');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('From client choices');
  return errors;
}

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
  test(`product page is readable and its previews fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = await setup(page);
    await expect(page).toHaveTitle(/Client selection, editor handoff and photo delivery/);
    await page.evaluate(() => document.fonts.ready);
    const [title, visual, after] = await page.evaluate(() => ['.vp-hero-title', '.vp-hero-visual', '.vp-hero-after'].map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { y: rect.y, height: rect.height };
    }));
    if (width < 768) { expect(visual.y).toBeGreaterThanOrEqual(title.y + title.height); expect(after.y).toBeGreaterThanOrEqual(visual.y + visual.height); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ['client-preselection', 'editor-handoff', 'image-library', 'delivery', 'review', 'client-view', 'portfolio', 'assistant', 'plans', 'questions']) {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section.getByRole('heading', { level: 2 })).toBeVisible();
      await expect.poll(() => section.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
      for (const box of await section.locator('button, .vp-feature-art, .vp-library-panel, .vp-plan').evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { x: rect.x, right: rect.right, height: rect.height, interactive: element.tagName === 'BUTTON' }; }))) {
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width + 1);
        if (box.interactive) expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(page.locator('.vp-library-capacity')).toContainText('100 GB');
    await expect(page.locator('.vp-plan.is-pro .vp-plan-price')).toContainText('40,000');
    expect(await page.locator('iframe').count()).toBe(0);
    expect(await page.locator('.vp-hero-main img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('sample client choices and editor views respond without saving or uploading', async ({ page }) => {
  const writes = [];
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && !request.url().includes('analytics')) writes.push(request.url()); });
  await setup(page);
  const selection = page.locator('#client-preselection');
  await selection.getByRole('button', { name: 'Choose portrait 2' }).click();
  await expect(selection.getByRole('status')).toHaveText('3 of 3 chosen');
  await selection.getByRole('button', { name: 'Choose portrait 1' }).click();
  await expect(selection.getByRole('status')).toHaveText('2 of 3 chosen');
  await expect(selection.getByRole('button', { name: 'Choose portrait 1' })).toHaveAttribute('aria-pressed', 'false');
  const editor = page.locator('#editor-handoff');
  await editor.getByRole('button', { name: 'Returned edits' }).click();
  await expect(editor.locator('.vp-editor-files')).toContainText('Portrait_01.jpg');
  await editor.getByRole('button', { name: 'Source files' }).click();
  await expect(editor.locator('.vp-editor-files')).toContainText('Portrait_01.CR3');
  await page.getByRole('group', { name: 'Explore the shoot workflow' }).getByRole('button', { name: /Client choices/ }).click();
  await expect(page.locator('.vp-hero-receipt')).toContainText('Ready for editing');
  expect(writes).toEqual([]);
});

test('product navigation supports keyboard dismissal and mobile section links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  const trigger = page.getByRole('button', { name: 'Product', exact: true });
  await trigger.click();
  const menu = page.locator('#public-product-links');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: /Product overview/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole('link', { name: /Editor handoff/ }).click();
  await expect(page).toHaveURL(/\/product#editor-handoff$/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Client preselection', exact: true }).click();
  await expect(page).toHaveURL(/\/product#client-preselection$/);
  await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toHaveCount(0);
});

test('plans and Library figures come from the public plans response', async ({ page }) => {
  await setup(page, { publicPlans: [{ ...plans[0], deliveriesPerMonth: 4, photosPerDelivery: 80 }, { ...plans[1], personalStorageGb: 75 }], price: 45000 });
  await expect(page.locator('.vp-library-capacity')).toContainText('75 GB');
  await expect(page.locator('.vp-plan').first()).toContainText('4 published deliveries each month');
  await expect(page.locator('.vp-plan').first()).toContainText('80 photographs per delivery');
  await expect(page.locator('.vp-plan.is-pro .vp-plan-price')).toContainText('45,000');
});

test('Assistant uses product context, offers both Library workflows and opens safe section links', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await setup(page);
  const requests = [];
  await page.route('**/assistant/chat', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, data: { answer: '[Read about editor handoff](/product#editor-handoff) and [client choices](/product#client-preselection). [Unsafe](javascript:alert(1))' } } });
  });
  await page.locator('#assistant').getByRole('button', { name: 'Ask Veylo' }).click();
  let panel = page.getByRole('dialog', { name: 'Veylo Assistant', exact: true });
  await expect(panel.locator('.veylo-assistant-context summary')).toContainText('Veylo product');
  await expect(panel.getByRole('button', { name: /^Editor handoff/ })).toBeVisible();
  await panel.getByRole('button', { name: /^Client preselection/ }).click();
  await expect(panel.getByRole('link', { name: 'Read about editor handoff' })).toBeVisible();
  expect(requests[0].context.page).toBe('/product');
  expect(requests[0].messages.at(-1).content).toBe('How does client preselection work?');
  await expect(panel.getByRole('link', { name: 'Unsafe' })).toHaveCount(0);
  await panel.getByRole('link', { name: 'Read about editor handoff' }).click();
  await expect(page).toHaveURL(/\/product#editor-handoff$/);
  await expect(panel).toHaveCount(0);
  await page.getByRole('link', { name: 'About us', exact: true }).click();
  await page.getByRole('button', { name: 'Open Veylo Assistant', exact: true }).click();
  panel = page.getByRole('dialog', { name: 'Veylo Assistant', exact: true });
  await panel.getByRole('textbox', { name: 'Ask Veylo Assistant' }).fill('What page did I just visit?');
  await panel.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].context.recent.filter(event => event.event === 'page-opened').map(event => event.page)).toEqual(['/product', '/about']);
});

test('signed-in photographers can open their Library and billing from Product', async ({ page }) => {
  await setup(page, { user: { id: '111111111111111111111111', emailVerified: true, onboardingComplete: true, plan: 'pro' } });
  await expect(page.locator('#client-preselection').getByRole('link', { name: 'Open client and editor links' })).toHaveAttribute('href', '/library');
  await expect(page.locator('#plans').getByRole('link', { name: 'Get started with Pro' })).toHaveAttribute('href', '/billing');
  await expect(page.locator('.vp-hero-after').getByRole('link', { name: 'Create a delivery' })).toHaveAttribute('href', '/create');
});
