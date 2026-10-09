import { expect, test } from '@playwright/test';

const niches = ['portrait-photographers', 'wedding-studios', 'birthday-shoots', 'media-companies'];

test('supporting public pages stay readable and fit every breakpoint', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false}' }));
  const routes = [...niches.map(slug => `/for/${slug}`), '/about', '/contact', '/changelog', '/privacy', '/terms', '/fair-use', '/not-a-page'];
  for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('#main-content h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}px`).toBe(true);
      if (width <= 640) for (const input of await page.locator('.vs-compose input:not([type=checkbox]):not([type=file]), .vs-compose select').all()) {
        expect(parseFloat(await input.evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      }
    }
  }
});

test('supporting photo sections show heading, visual, explanation, then demo action on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 640]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of niches) {
      await page.goto(`/for/${slug}`);
      const selectors = ['.v-niche-format-copy h2', '.v-niche-format-art', '.v-niche-format-copy-after > p', '.v-niche-format-mobile-action'];
      const boxes = await Promise.all(selectors.map(selector => page.locator(selector).boundingBox()));
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].y, `${slug} at ${width}px`).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
      await expect(page.locator('.v-niche-format-mobile-action')).toHaveAccessibleName(/(?:Watch|View) .+ demo/);
      const photographs = await page.locator('.v-niche-photo-triptych').boundingBox();
      const explanation = await page.locator('.v-niche-collection-after').boundingBox();
      expect(explanation.y).toBeGreaterThanOrEqual(photographs.y + photographs.height);
    }
    await page.goto('/about');
    const about = await Promise.all(['.v-about-local-copy', '.v-about-local-grid .v-niche-photos', '.v-about-local-copy-after'].map(selector => page.locator(selector).boundingBox()));
    expect(about[1].y).toBeGreaterThanOrEqual(about[0].y + about[0].height);
    expect(about[2].y).toBeGreaterThanOrEqual(about[1].y + about[1].height);
    await page.goto('/contact');
    const form = await page.locator('.vs-main').boundingBox();
    const emailHelp = await page.locator('.vs-sidebar').boundingBox();
    expect(emailHelp.y).toBeGreaterThanOrEqual(form.y + form.height);
  }
});

test('contact form keeps support topics, request details, error recovery, and confirmation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true })));
  let submissions = 0, requestKey;
  const request = { name: 'Amara Studio', email: 'amara@example.com', subject: 'Upload problem', deliveryPublicId: 'delivery-123', message: 'My last finished photograph did not upload. Please help.' };
  await page.route('**/api/v1/**', route => {
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' };
    if (new URL(route.request().url()).pathname.endsWith('/support/tickets')) {
      const body = route.request().postDataJSON(); expect(body).toMatchObject(request);
      if (requestKey) expect(body.requestKey).toBe(requestKey); else requestKey = body.requestKey;
      submissions++;
      return route.fulfill({ headers, status: submissions === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(submissions === 1 ? { success: false, message: 'Please try sending your request again.' } : { success: true, data: { id: '222222222222222222222222', ticketNumber: 'V-1001', signedIn: false } }) });
    }
    return route.fulfill({ headers, status: 401, contentType: 'application/json', body: '{"success":false}' });
  });
  await page.setViewportSize({ width: 834, height: 900 });
  await page.goto('/contact?subject=Upload%20problem');
  await expect(page.getByLabel('What do you need help with?')).toHaveValue(request.subject);
  await expect(page.getByLabel('What do you need help with?').locator('option')).toHaveCount(8);
  await page.getByLabel('Your name').fill(request.name);
  await page.getByLabel('Reply email').fill(request.email);
  await page.getByText('Add details that could help').click();
  await page.getByLabel('Delivery link or ID').fill(request.deliveryPublicId);
  await page.getByLabel('Your message').fill(request.message);
  await expect(page.getByLabel('Your name')).toHaveValue(request.name);
  await expect(page.getByLabel('Reply email')).toHaveValue(request.email);
  await expect(page.getByLabel('Your message')).toHaveValue(request.message);
  await page.getByRole('button', { name: 'Send to a person' }).click();
  await expect(page.getByRole('alert')).toHaveText('Please try sending your request again.');
  await expect(page.getByLabel('Your message')).toHaveValue(request.message);
  await page.getByRole('button', { name: 'Send to a person' }).click();
  await expect(page.locator('.vs-sent')).toContainText('V-1001');
  await expect(page.locator('.vs-sent')).toContainText(request.email);
  await expect(page.getByLabel('Your message')).toHaveCount(0); expect(submissions).toBe(2);
});
