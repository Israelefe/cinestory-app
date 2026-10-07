import { expect, test } from '@playwright/test';

const id = '507f1f77bcf86cd799439011';
for (const kind of ['showcase', 'photoswap', 'pinboard']) for (const width of [320, 768, 834, 1440]) {
  test(`${kind} shows real photo progress without overflowing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
    const assets = Array.from({ length: 69 }, (_, index) => ({ assetId: 'photo-' + index, originalFilename: 'photo-' + index + '.jpg', width: 1000, height: 1600, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-480.webp' }));
    const draft = { _id: id, kind, schemaVersion: 3, status: 'analyzing', clientName: 'Ada', title: 'Birthday portraits', shootType: 'Birthday', brief: "Ada's 30th birthday", format: 'photo-story', assets, v3: { step: 'preparing', revision: 1 }, generationJob: { type: 'v3-prepare', status: 'running', stage: 'analysing-photos', progress: 26, counts: { analysis: { done: 23, total: 69 } }, modelQueue: 'waiting' } };
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user: { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro' } }) });
      if (path.endsWith('/billing/status')) return reply({ plan: 'pro', limits: { photosPerDelivery: 500 }, usage: { deliveriesRemaining: null } });
      if (path.endsWith('/deliveries/' + id)) return reply(draft);
      return reply([]);
    });
    await page.goto('/create?draft=' + id);
    const status = page.getByText('23 of 69 photos analysed. More processing will continue shortly.', { exact: true });
    await expect(status).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await status.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (kind !== 'pinboard') {
      draft.generationJob = { ...draft.generationJob, stage: kind === 'photoswap' ? 'writing-captions' : 'writing-showcase', modelQueue: 'processing', counts: { writing: { done: 18, total: 69 } } };
      await expect(page.getByText('18 of 69 captions written', { exact: true })).toBeVisible();
    }
  });
}
