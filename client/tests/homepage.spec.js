import { expect, test } from '@playwright/test';

async function openHome(page, { notice = false, hash = '' } = {}) {
  if (!notice) await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    if (path.endsWith('/billing/plans')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, pricing: { currency: 'NGN', monthlyPriceNaira: 40000 }, billingAvailable: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/' + hash);
}

const demoPaths = ['/demo?preset=lora', '/demo/editorial', '/demo/reveal', '/demo/canvas', '/demo/chapters', '/demo/album', '/demo/event-coverage', '/demo/campaign'];

for (const width of [320, 640, 768, 834, 1440]) {
  test(`the homepage PhotoSwap preview and client action fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openHome(page, { hash: '#photoswap' });
    const section = page.locator('.v-home-photoswap-card');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('h3')).toHaveText('One photo.A closer look.');
    const demo = section.getByRole('link', { name: 'Open the client view', exact: true });
    await expect(demo).toHaveAttribute('href', '/demo/photoswap');
    await expect(section.getByRole('link', { name: 'About PhotoSwap', exact: true })).toHaveAttribute('href', '/photoswap');
    await expect.poll(() => section.locator('.is-front img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    expect(await section.locator('.is-front img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
    const box = await section.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (width < 768) {
      const [title, visual, copy] = await Promise.all(['.v-home-photoswap-heading', '.v-home-photoswap-art', '.v-home-photoswap-support'].map(selector => section.locator(selector).boundingBox()));
      expect(visual.y).toBeGreaterThanOrEqual(title.y + title.height);
      expect(copy.y).toBeGreaterThanOrEqual(visual.y + visual.height);
    }
    await expect.poll(() => section.locator('.v-home-photoswap-art').evaluate(art => {
      const heading = art.querySelector('.v-home-photoswap-art-top').getBoundingClientRect();
      const caption = art.querySelector('.v-home-photoswap-art-bottom').getBoundingClientRect();
      return [...art.querySelectorAll('figure')].every(print => {
        const bounds = print.getBoundingClientRect();
        return bounds.top >= heading.bottom + 8 && bounds.bottom <= caption.top - 8;
      });
    })).toBe(true);
    await demo.scrollIntoViewIfNeeded();
    expect((await demo.boundingBox()).height).toBeGreaterThanOrEqual(56);
    if ([320, 834, 1440].includes(width)) {
      await page.waitForTimeout(800);
      await page.screenshot({ path: `../.visual-review/photoswap/home-feature-${width}.png` });
    }
    await demo.click();
    await expect(page).toHaveURL(/\/demo\/photoswap/);
    const clientView = width > 1024 ? page.frameLocator('.v-phone-screen iframe') : page;
    await expect(clientView.getByRole('button', { name: 'Swipe photographs', exact: true })).toBeVisible();
  });

  test(`the lower Pro card shows a readable monthly price at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openHome(page);
    const card = page.locator('.v-home-plan-card.is-pro');
    await card.scrollIntoViewIfNeeded();
    const price = card.locator('.v-home-plan-price .v-pro-price');
    await expect(price).toHaveText('₦40,000');
    const typography = await price.evaluate(element => {
      const style = getComputedStyle(element);
      const amount = getComputedStyle(element.closest('strong'));
      return { size: parseFloat(style.fontSize), amountSize: parseFloat(amount.fontSize), color: style.color, amountColor: amount.color };
    });
    expect(typography.size).toBeGreaterThanOrEqual(36);
    expect(typography.size).toBe(typography.amountSize);
    expect(typography.color).toBe(typography.amountColor);
    const box = await price.boundingBox();
    const cardBox = await card.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    if ([320, 834, 1440].includes(width)) await page.screenshot({ path: `../.visual-review/photoswap/home-pricing-${width}.png` });
  });
}

for (const width of [320, 390, 768, 834, 1024, 1440]) {
  test('all original formats and sections remain available at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openHome(page);
    await expect(page.locator('.v-hero-title')).toHaveText('Don’t justdeliver photos.Showcase them.');
    await expect(page.locator('.v-format-row')).toHaveCount(8);
    await expect(page.locator('.v-director-card')).toHaveCount(6);
    await expect(page.locator('.v-audience-card')).toHaveCount(4);
    await expect(page.locator('.v-home-plan-card')).toHaveCount(2);
    await expect(page.locator('.v-home-pinboard-actions a')).toHaveCount(3);
    await expect(page.locator('.v-assurance-list > div')).toHaveCount(4);
    await expect(page.locator('.v-faq details')).toHaveCount(6);
    await expect(page.locator('.v-director-showcase-art')).toBeVisible();
    await expect(page.locator('.v-portfolio-address')).toBeVisible();
    if (width < 768) {
      const [heading, visual, body] = await Promise.all(['.v-hero-title-block', '.v-hero-art', '.v-hero-after'].map(selector => page.locator(selector).boundingBox()));
      expect(heading.y + heading.height).toBeLessThanOrEqual(visual.y);
      expect(visual.y + visual.height).toBeLessThanOrEqual(body.y);
    }
    const images = [];
    for (const [index, row] of (await page.locator('.v-format-row').all()).entries()) {
      await row.scrollIntoViewIfNeeded();
      await expect(row.locator('.v-format-art')).toBeVisible();
      await expect(row.locator('.v-format-after .v-text-link')).toHaveAttribute('href', demoPaths[index]);
      await expect(row.locator('.v-format-art img').first()).toHaveAttribute('src', /veylo/);
      images.push(await row.locator('.v-format-art img').first().getAttribute('src'));
      if (width < 768) {
        const [heading, visual, body] = await Promise.all(['.v-format-copy', '.v-format-art', '.v-format-after'].map(selector => row.locator(selector).boundingBox()));
        expect(heading.y + heading.height).toBeLessThanOrEqual(visual.y);
        expect(visual.y + visual.height).toBeLessThanOrEqual(body.y);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
    expect(new Set(images).size).toBe(8);
    await expect(page.getByRole('tablist', { name: 'Showcase formats' })).toHaveCount(0);
  });
}

test('a format demo returns directly to its visible homepage section', async ({ page }) => {
  await openHome(page, { hash: '#album' });
  const album = page.locator('#album');
  await expect(album.locator('h3')).toHaveText('Album');
  await album.getByRole('link', { name: 'View Album demo' }).click();
  await expect(page).toHaveURL(/\/demo\/album$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/#album$/);
  await expect(page.locator('#album .v-format-art')).toBeInViewport();
});

test('privacy notice retains its original explanation, details, and phone touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openHome(page, { notice: true });
  const notice = page.getByRole('complementary', { name: 'Cookies and browser storage notice' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('How Veylo uses browser storage');
  await expect(notice).toContainText('We do not use advertising cookies or sell visitor data.');
  for (const button of await notice.getByRole('button').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await notice.getByRole('button', { name: 'View details' }).click();
  const dialog = page.getByRole('dialog', { name: 'What Veylo stores and why' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(notice).toBeHidden();
});
