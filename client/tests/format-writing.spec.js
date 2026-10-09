import { expect, test } from '@playwright/test';
import { EDITORIAL_DEMO_DELIVERY } from '../src/constants/editorialDemo.js';

const draftId = '507f1f77bcf86cd799439099';
const caption = 'The front view shows the linen jacket with its patch pockets and open collar. It gives the clothing team a complete reference for the garment, while the closer photographs record the same jacket in more detail.';
const rewritten = 'The linen jacket is shown from the front, with the open collar and patch pockets visible together. This wider photograph gives the clothing team a garment reference alongside the separate pocket and collar details.';
const paragraph = 'The complete views show the linen jacket from the front, back and side. Together they give the clothing team a reference for the garment as a whole before the closer detail photographs.';
const uuid = i => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`;
function fixture(format) {
  const record = structuredClone(EDITORIAL_DEMO_DELIVERY), count = { chapters: 8, editorial: 5, 'event-coverage': 10, campaign: 6 }[format];
  record._id = draftId; record.status = 'review'; record.kind = 'showcase'; record.format = format;
  record.brief = 'Finished linen jacket collection photographs for the clothing team.'; record.shootType = 'Fashion';
  record.v3 = { ...record.v3, step: 'showcase', revision: 2, openingAssetId: uuid(0), closingAssetId: uuid(count - 1) };
  record.assets = Array.from({ length: count }, (_, i) => ({ ...record.assets[i % record.assets.length], assetId: uuid(i) }));
  record.curatedAssetIds = record.assets.map(asset => asset.assetId);
  record.creativeDirection.frames = record.assets.map(asset => ({ assetId: asset.assetId, headline: 'Front jacket view', caption }));
  const sections = [{ id: 'complete', title: 'Complete jacket views', subtitle: 'The garment as a whole', body: paragraph, layout: 'auto', assetIds: record.curatedAssetIds }];
  record.creativeDirection.sections = sections;
  if (format === 'editorial') record.creativeDirection.editorial.sections = sections;
  else delete record.creativeDirection.editorial;
  record.collectionAnalysis = { images: record.assets.map(asset => ({ assetId: asset.assetId, summary: 'Linen jacket with patch pockets and an open collar.' })) };
  return record;
}
async function setup(page, record, captures) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, input = request.method() === 'GET' ? {} : request.postDataJSON() || {};
    let data = {}, body;
    if (path.endsWith('/auth/me')) body = { success: true, user: { _id: 'studio-user', studioName: 'Clothing Studio', name: 'Studio', email: 'studio@example.com', emailVerified: true, onboardingComplete: true, plan: 'pro' } };
    else if (path.endsWith('/billing/status')) data = { plan: 'pro', limits: { deliveriesPerMonth: 20, photosPerDelivery: 500 }, usage: { deliveriesRemaining: 20 } };
    else if (path.endsWith('/regenerate')) { captures.rewrite = input; data = { headline: 'Jacket front reference', caption: rewritten }; }
    else if (path.endsWith('/v3/showcase')) { captures.saved = input; data = { ...record, creativeDirection: { ...record.creativeDirection, ...input }, v3: { ...record.v3, step: 'design' } }; }
    else if (path.endsWith('/deliveries/' + draftId)) data = record;
    await route.fulfill({ json: body || { success: true, data } });
  });
}
for (const format of ['chapters', 'editorial', 'event-coverage', 'campaign']) for (const width of [320, 768, 834]) {
  test(`${format} keeps full captions through rewriting, undo and saving at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const captures = {}, record = fixture(format); await setup(page, record, captures);
    await page.goto('/create?draft=' + draftId);
    const field = page.locator('.v3-showcase-item label').filter({ hasText: /^Caption/ }).locator('textarea');
    await expect(field).toHaveAttribute('maxlength', '320'); await expect(field).toHaveValue(caption);
    await page.getByRole('button', { name: 'Regenerate headline and caption', exact: true }).click();
    await expect(field).toHaveValue(rewritten); expect(captures.rewrite.previous.caption).toBe(caption);
    await page.getByRole('button', { name: 'Undo regeneration', exact: true }).click(); await expect(field).toHaveValue(caption);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'See how your delivery will look.' })).toBeVisible();
    expect(captures.saved.frames[0].caption).toBe(caption);
    expect(format === 'editorial' ? captures.saved.editorial.sections[0].body : captures.saved.sectionWriting[0].body).toBe(paragraph);
  });
}
