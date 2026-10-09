import { expect, test } from '@playwright/test';
import { CAMPAIGN_DEMO, EVENT_DEMO } from '../src/constants/deliveryDemoFixtures.js';
import { EDITORIAL_DEMO_DELIVERY } from '../src/constants/editorialDemo.js';

const numerals = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
const formats = [
  { format: 'campaign', delivery: CAMPAIGN_DEMO, section: '.cp-set', heading: '.cp-set-number', photo: '.cp-photo-number', card: '.cp-photo-card', nav: '.cp-set-nav a > span:first-child', bookends: '.cp-cover, .cp-ending' },
  { format: 'event-coverage', delivery: EVENT_DEMO, section: '.ec-scene', heading: '.ec-scene-number', photo: '.ec-photo-index', card: '.ec-photo-card', nav: '.ec-nav-number', bookends: '.ec-cover, .ec-ending' },
  { format: 'editorial', delivery: EDITORIAL_DEMO_DELIVERY, section: '.ed-section', heading: '.ed-feature-number', photo: '.ed-photo-number', card: '.ed-photo', nav: '.ed-contents-dialog nav button > span:first-child:not(:empty)', bookends: '.ed-cover, .ed-closing' }
];

for (const config of formats) for (const mode of ['demo','client']) for (const width of [320,768,834,1440]) {
  test(`${config.format} ${mode} section numbering distinguishes headings from photographs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const delivery = structuredClone(config.delivery); delivery.publicId = 'numbering'; delivery.status = 'published';
    await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
    await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, data: mode === 'client' ? delivery : {} } }));
    await page.goto(mode === 'client' ? '/d/numbering?phoneView=1' : `/demo/${config.format}?phoneView=1`);
    const sections = page.locator(config.section);
    await expect(sections.first()).toBeAttached();
    const numbers = Array.from({ length: await sections.count() }, (_, index) => String(index + 1));
    await expect(page.locator(config.heading)).toHaveText(numbers);
    if (config.format === 'editorial') await page.getByRole('button', { name: 'Open contents' }).click();
    await expect(page.locator(config.nav)).toHaveText(numbers);
    if (config.format === 'editorial') {
      await expect(page.locator('.ed-contents-dialog nav button > span:first-child:empty')).toHaveCount(2);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Contents', exact: true })).toHaveCount(0);
    }
    await expect(page.locator(config.bookends).locator(config.photo)).toHaveCount(0);
    for (const section of await sections.all()) {
      const labels = section.locator(config.photo);
      await expect(labels).toHaveText(numerals.slice(0, await section.locator(config.card).count()));
      for (const [index, label] of (await labels.all()).entries()) {
        const card = section.locator(config.card).nth(index);
        await card.scrollIntoViewIfNeeded();
        await expect.poll(() => card.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
        await expect.poll(() => label.evaluate(element => Number(getComputedStyle(element.parentElement).opacity))).toBe(1);
        const geometry = await label.evaluate(element => {
          const number = element.getBoundingClientRect(), caption = element.parentElement.querySelector('.cp-caption-copy, .ec-caption-copy, :scope > div').getBoundingClientRect();
          // A sequence may intentionally show part of the next photograph. Captions must fit their own card.
          const bounds = element.closest('.cp-sequence') ? element.closest('figure').getBoundingClientRect() : { left: 0, right: innerWidth };
          return { numberFits: number.left >= bounds.left - 1 && number.right <= bounds.right + 1, captionFits: caption.left >= bounds.left - 1 && caption.right <= bounds.right + 1, gap: Math.max(caption.left - number.right, number.left - caption.right) };
        });
        expect(geometry.numberFits && geometry.captionFits).toBe(true);
        expect(geometry.gap).toBeGreaterThanOrEqual(10);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await sections.first().evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.screenshot({ path: `../.visual-review/numbering-${config.format}-${mode}-${width}.png` });
  });
}
