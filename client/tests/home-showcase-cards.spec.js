import { expect, test } from '@playwright/test';

const formats = ['photo-story', 'editorial-page', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, user: null, data: {} } }));
});

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
  test(`all eight homepage previews keep their photos, text and controls inside the card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.v-showcase-card')).toHaveCount(8);
    for (const id of formats) {
      const card = page.locator(`#${id} .v-showcase-card`);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveClass(/is-playing/);
      await expect.poll(() => card.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
      await expect(card.locator('.v-sc-studio')).toHaveText('VEYLO STUDIO');
      const layout = await card.evaluate(element => {
        const box = element.getBoundingClientRect();
        const masthead = element.querySelector('header').getBoundingClientRect();
        const footer = element.querySelector('footer').getBoundingClientRect();
        const buttons = [...element.querySelectorAll('button')].map(button => {
          const rect = button.getBoundingClientRect();
          return { height: rect.height, width: rect.width, within: rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom };
        });
        const clippedText = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.left < box.left + 2 || rect.right > box.right - 2 || rect.top < box.top || rect.bottom > box.bottom) clippedText.push(node.textContent);
          }
        }
        return { clippedText, buttons, footerWithin: footer.bottom <= box.bottom - 8, separated: footer.top >= masthead.bottom + 16, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(layout.clippedText, `${id} text`).toEqual([]);
      expect(layout.footerWithin, `${id} footer`).toBe(true);
      expect(layout.separated, `${id} header and footer`).toBe(true);
      expect(layout.overflow).toBe(0);
      for (const button of layout.buttons) {
        expect(button.within, `${id} button`).toBe(true);
        expect(Math.round(button.height * 100) / 100).toBeGreaterThanOrEqual(44);
        expect(Math.round(button.width * 100) / 100).toBeGreaterThanOrEqual(44);
      }
    }
  });
}

for (const width of [320, 834, 1440]) {
  test(`reveal, chapters, album and event previews work with the keyboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const reveal = page.locator('#photo-reveal .v-showcase-card');
    const next = reveal.getByRole('button', { name: 'Reveal next photo' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(reveal.getByRole('status')).toHaveAccessibleName('Photograph 2 of 2');
    await expect(reveal.locator('img')).toHaveCount(1);
    await expect(reveal.locator('img')).toHaveAttribute('alt', "Portrait 2 from Sharon's studio session");
    await page.keyboard.press('Enter');
    await expect(reveal.getByRole('status')).toHaveAccessibleName('Photograph 1 of 2');

    const chapters = page.locator('#chapters .v-showcase-card');
    const chapter = chapters.getByRole('button', { name: 'Preview chapter 2: Between Frames' });
    await chapter.focus();
    await page.keyboard.press('Space');
    await expect(chapter).toHaveAttribute('aria-pressed', 'true');
    await expect(chapters.getByRole('button', { pressed: true })).toHaveCount(1);
    await expect(chapters.locator('.v-sc-chapter-summary')).toContainText('The smiles and small gestures between the posed portraits.');

    const album = page.locator('#album .v-showcase-card');
    const turn = album.getByRole('button', { name: 'Turn the page' });
    await turn.focus();
    await page.keyboard.press('Enter');
    await expect(album.getByRole('status')).toHaveAccessibleName('Spread 2 of 2');
    await expect(album.locator('.v-sc-album-spread')).toHaveCount(1);
    await expect(album.locator('.v-sc-album-page.is-right figcaption')).toContainText('The smiles you will keep coming back to.');
    await expect(album.getByRole('button', { name: 'Previous spread' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(album.getByRole('status')).toHaveAccessibleName('Spread 1 of 2');

    const event = page.locator('#event-coverage .v-showcase-card');
    const scene = event.getByRole('button', { name: 'Preview programme scene' });
    await scene.focus();
    await page.keyboard.press('Enter');
    await expect(scene).toHaveAttribute('aria-pressed', 'true');
    await expect(event.locator('.v-sc-event-photo-caption strong')).toHaveText('Programme');
    await expect(event.locator('.v-sc-event-hero img')).toHaveAttribute('alt', 'The opening address at a Lagos conference');
    await expect(event.locator('footer')).toHaveText('The room turns its attention to the stage.');
  });
}

test('each preview preserves motion with the device preference and honours its own pause control and visibility', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const id of formats) {
    const card = page.locator(`#${id} .v-showcase-card`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveClass(/is-playing/);
    const photo = card.locator('.v-sc-photo-motion').first();
    const transform = await photo.evaluate(element => getComputedStyle(element).transform);
    await expect.poll(() => photo.evaluate(element => getComputedStyle(element).transform)).not.toBe(transform);
    await card.getByRole('button', { name: /^Pause .+ preview$/ }).click();
    await expect(photo).toHaveCSS('animation-play-state', 'paused');
    const pausedTransform = await photo.evaluate(element => getComputedStyle(element).transform);
    await page.waitForTimeout(100);
    expect(await photo.evaluate(element => getComputedStyle(element).transform)).toBe(pausedTransform);
    await card.getByRole('button', { name: /^Play .+ preview$/ }).click();
    await expect(photo).toHaveCSS('animation-play-state', 'running');
  }
  await expect(page.locator('#photo-story .v-showcase-card')).not.toHaveClass(/is-playing/);
  await page.locator('#photo-story .v-showcase-card').scrollIntoViewIfNeeded();
  await expect(page.locator('#photo-story .v-sc-photo-motion')).toHaveCSS('animation-play-state', 'running');
});

test('homepage preview styles leave the delivery formats guide intact', async ({ page }) => {
  await page.goto('/formats');
  await expect(page.locator('.v-fguide-format-art .v-format-visual')).toHaveCount(8);
  await expect(page.locator('.v-showcase-card')).toHaveCount(0);
});
