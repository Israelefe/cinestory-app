import { expect, test } from '@playwright/test';

const draftId = '507f1f77bcf86cd799439011';
const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };

for (const width of [320, 834, 1440]) {
  test('V3 details and recommended format remain usable at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    let draft = { _id: draftId, schemaVersion: 3, status: 'draft', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", assets: [], curatedAssetIds: [], creativeDirection: null, v3: { step: 'format', revision: 1, clarificationAnswers: [], narrationChoice: 'skip' }, access: {} };
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postDataJSON?.() || {};
      const reply = data => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, user }) });
      if (path.endsWith('/deliveries/v3/assist')) {
        if (body.mode === 'improve') return reply({ improved: "These photographs were taken for Ada's 25th birthday celebration." });
        if (body.mode === 'clarify') return reply({ clear: true, questions: [] });
        return reply({ format: 'photo-story', reason: 'A birthday shoot works well as a short personal sequence.' });
      }
      if (path.endsWith('/deliveries/v3') && request.method() === 'POST') return reply(draft);
      if (path.endsWith('/deliveries/' + draftId) && request.method() === 'GET') return reply(draft);
      if (path.endsWith('/deliveries/' + draftId + '/v3/format')) { draft = { ...draft, format: body.format, v3: { ...draft.v3, step: 'upload' } }; return reply(draft); }
      return reply({});
    });
    await page.goto('/create');
    await expect(page.getByRole('heading', { name: 'Tell us what this delivery is for.' })).toBeVisible();
    const cookieButton = page.getByRole('button', { name: 'Got it' });
    if (await cookieButton.isVisible()) await cookieButton.click();
    await page.getByLabel('Client name').fill('Ada');
    await page.getByLabel('Type of shoot').selectOption('Birthday');
    await page.getByLabel('Purpose of the shoot').fill("Ada's 25th birthday celebration");
    await page.getByRole('button', { name: 'Improve my wording' }).click();
    await expect(page.getByRole('button', { name: 'Revert to my words' })).toBeVisible();
    await page.getByRole('button', { name: 'Revert to my words' }).click();
    await expect(page.getByLabel('Purpose of the shoot')).toHaveValue("Ada's 25th birthday celebration");
    await page.getByRole('button', { name: 'Continue to formats' }).click();
    await expect(page.getByRole('heading', { name: 'Choose how they first see the work.' })).toBeVisible();
    await expect(page.getByText('Recommended for this delivery: Photo Story')).toBeVisible();
    await expect(page.locator('.v3-format-card')).toHaveCount(8);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const columns = await page.locator('.v3-format-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width <= 540 ? 1 : width <= 1024 ? 2 : 3);
    if (width === 834) await page.screenshot({ path: '../.visual-review/delivery-v3/format-834.png', fullPage: true });
  });
}

test('Photo Story review stops removals at five and advances with the full photo pool intact', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 900 });
  const assetId = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
  const assets = Array.from({ length: 12 }, (_, index) => ({ assetId: assetId(index), originalFilename: 'photo-' + (index + 1) + '.jpg', url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-960.webp' }));
  let draft = { _id: draftId, publicId: 'preview-id', schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", format: 'photo-story', assets, curatedAssetIds: assets.slice(0, 10).map(asset => asset.assetId), creativeDirection: { title: "Ada's birthday", openingLine: 'These photos are from your birthday celebration.', closingLine: 'Here is the full collection from your day.', frames: assets.slice(0, 10).map(asset => ({ assetId: asset.assetId, caption: 'A moment from your birthday celebration.' })), palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'showcase', revision: 1, clarificationAnswers: [], narrationChoice: 'skip', openingAssetId: assetId(10), closingAssetId: assetId(11) }, access: {} };
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/deliveries/' + draftId + '/v3/showcase')) {
      const body = request.postDataJSON();
      draft = { ...draft, curatedAssetIds: body.assetIds, creativeDirection: { ...draft.creativeDirection, title: body.title, openingLine: body.openingLine, closingLine: body.closingLine, frames: body.frames }, v3: { ...draft.v3, step: 'narration' } };
      return reply(draft);
    }
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  await expect(page.getByRole('heading', { name: 'Make the selection yours.' })).toBeVisible();
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await page.getByRole('button', { name: 'Edit showcase photo 2' }).click();
  await page.getByLabel('Caption').fill('Ada, this smile says it all.');
  await page.getByRole('button', { name: 'Edit showcase photo 1', exact: true }).click();
  await page.getByRole('button', { name: 'Edit showcase photo 2' }).click();
  await expect(page.getByLabel('Caption')).toHaveValue('Ada, this smile says it all.');
  for (let count = 10; count > 5; count -= 1) await page.getByRole('button', { name: 'Remove from showcase' }).first().click();
  await expect(page.getByText('5 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove from showcase' }).first()).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 740 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expect(page.getByRole('progressbar', { name: 'Delivery creation progress' })).toBeVisible();
  await page.screenshot({ path: '../.visual-review/delivery-v3/showcase-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Give the opening and closing a voice.' })).toBeVisible();
  expect(draft.assets).toHaveLength(12);
  expect(draft.curatedAssetIds).toHaveLength(5);
});

test('V3 keeps validation and API errors visible at the current scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/auth/me')) return json(200, { success: true, user });
    if (path.endsWith('/billing/status')) return json(200, { success: true, data: { plan: 'free', limits: { photosPerDelivery: 100, deliveriesPerMonth: 3 }, usage: { deliveriesRemaining: 3 } } });
    if (path.endsWith('/deliveries/v3/assist')) return json(503, { success: false, code: 'MODEL_UNAVAILABLE', message: 'The writing service is unavailable. Try again shortly.' });
    return json(200, { success: true, data: {} });
  });
  await page.goto('/create');
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await page.getByRole('button', { name: 'Continue to formats' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Enter the client name before continuing.');
  expect((await alert.boundingBox()).y).toBeLessThan(150);
  await page.getByLabel('Client name').fill('Ada');
  await page.getByLabel('Type of shoot').selectOption('Birthday');
  await page.getByLabel('Purpose of the shoot').fill("Ada's 25th birthday celebration");
  await page.getByRole('button', { name: 'Continue to formats' }).click();
  await expect(alert).toContainText('The writing service is unavailable. Try again shortly.');
  await expect(alert).toContainText('MODEL_UNAVAILABLE');
  expect((await alert.boundingBox()).y).toBeLessThan(150);
});

test('V3 does not publish when the plan check fails', async ({ page }) => {
  const draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's birthday", format: 'editorial', assets: [], access: {}, creativeDirection: {}, v3: { step: 'access', revision: 2, approvedRevision: 2 } };
  let billingReads = 0;
  let publishRequests = 0;
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/auth/me')) return json(200, { success: true, user });
    if (path.endsWith('/billing/status')) {
      billingReads += 1;
      return billingReads === 1
        ? json(200, { success: true, data: { plan: 'free', limits: { deliveriesPerMonth: 3 }, usage: { deliveriesRemaining: 2 } } })
        : json(503, { success: false, code: 'BILLING_UNAVAILABLE', message: 'We could not check your plan.' });
    }
    if (path.endsWith('/deliveries/' + draftId)) return json(200, { success: true, data: draft });
    if (path.endsWith('/v3/publish')) publishRequests += 1;
    return json(200, { success: true, data: {} });
  });
  await page.goto('/create?draft=' + draftId);
  await expect(page.getByRole('heading', { name: 'Set the rules for this link.' })).toBeVisible();
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await page.getByRole('button', { name: 'Publish delivery' }).click();
  await expect(page.getByRole('alert')).toContainText('BILLING_UNAVAILABLE');
  expect(publishRequests).toBe(0);
});

for (const width of [390, 834, 1440]) {
  test('Photo Story preview can go back and forward at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const assets = Array.from({ length: 5 }, (_, index) => ({ assetId: 'photo-' + index, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-960.webp', originalFilename: 'photo-' + index + '.jpg' }));
    let draft = { _id: draftId, publicId: 'preview-story', schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", format: 'photo-story', assets, curatedAssetIds: assets.map(asset => asset.assetId), creativeDirection: { title: "Ada's birthday", openingLine: 'Ada, here is your birthday story.', closingLine: 'Here is the full collection from your day.', frames: assets.map(asset => ({ assetId: asset.assetId, caption: 'Ada, your 25th birthday is here.' })), palette: { background: '#ffffff', surface: '#eeeeee', text: '#101010', accent: '#006644' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'preview', revision: 2, clarificationAnswers: [], narrationChoice: 'skip', openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId }, access: {} };
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
      if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
      if (path.endsWith('/v3/theme')) { draft = { ...draft, v3: { ...draft.v3, step: 'preview', revision: 3 } }; return reply(draft); }
      if (path.endsWith('/v3/approve')) { draft = { ...draft, v3: { ...draft.v3, step: 'access', approvedRevision: draft.v3.revision } }; return reply(draft); }
      if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
      return reply({});
    });
    await page.goto('/create?draft=' + draftId);
    const cookieButton = page.getByRole('button', { name: 'Got it' });
    if (await cookieButton.isVisible()) await cookieButton.click();
    await expect(page.locator('.v3-preview .v-story-shell')).toBeVisible();
    expect(await page.locator('.v3-preview .v-story-shell').evaluate(element => getComputedStyle(element).position)).toBe('relative');
    if (width === 390) {
      await page.getByRole('button', { name: 'Begin the story' }).click();
      await page.getByRole('button', { name: 'Open gallery' }).click();
      const gallery = page.getByRole('dialog', { name: /Ada/ });
      await expect(gallery).toBeVisible();
      expect(await gallery.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(8, 8, 11)');
      await gallery.getByRole('button', { name: 'Close gallery' }).click();
    }
    await page.getByRole('button', { name: 'Adjust design' }).first().click();
    await expect(page.getByRole('heading', { name: 'Set the visual tone.' })).toBeVisible();
    await page.getByRole('button', { name: 'Preview delivery' }).click();
    await expect(page.locator('.v3-preview .v-story-shell')).toBeVisible();
    await page.getByRole('button', { name: 'Approve and set access' }).first().click();
    await expect(page.getByRole('heading', { name: 'Set the rules for this link.' })).toBeVisible();
  });
}

test('design opens the current client viewer, then publishes with access settings', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 900 });
  const assetId = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
  const assets = Array.from({ length: 6 }, (_, index) => ({ assetId: assetId(index), originalFilename: `photo-${index + 1}.jpg`, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-960.webp' }));
  let draft = {
    _id: draftId, publicId: 'editorial-client-link', schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", format: 'editorial',
    assets, curatedAssetIds: assets.map(asset => asset.assetId),
    creativeDirection: { title: "Ada's birthday", openingLine: 'These photographs are from your 25th birthday.', closingLine: 'Here is the full collection from your day.', frames: assets.map(asset => ({ assetId: asset.assetId, caption: 'A moment from the birthday celebration.' })), sections: [{ id: 'showcase', title: 'The photographs', subtitle: '', assetIds: assets.map(asset => asset.assetId) }], palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } },
    v3: { step: 'design', revision: 2, clarificationAnswers: [], narrationChoice: 'skip', openingAssetId: assetId(0), closingAssetId: assetId(5) }, access: {}
  };
  let savedAccess;
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() || {};
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/deliveries/' + draftId + '/v3/theme')) { draft = { ...draft, creativeDirection: { ...draft.creativeDirection, ...body }, v3: { ...draft.v3, step: 'preview', revision: 3 } }; return reply(draft); }
    if (path.endsWith('/deliveries/' + draftId + '/v3/approve')) { draft = { ...draft, reviewApprovedAt: new Date().toISOString(), v3: { ...draft.v3, step: 'access', approvedRevision: draft.v3.revision } }; return reply(draft); }
    if (path.endsWith('/deliveries/' + draftId + '/v3/access')) { savedAccess = body; draft = { ...draft, access: body, hasPin: Boolean(body.pin) }; return reply({ access: body, hasPin: Boolean(body.pin), formatConfig: {} }); }
    if (path.endsWith('/deliveries/' + draftId + '/v3/publish')) return reply({ publicId: draft.publicId, url: 'http://127.0.0.1:5178/d/' + draft.publicId });
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await page.getByRole('button', { name: 'Preview delivery' }).click();
  await expect(page.getByRole('heading', { name: 'See exactly what the client will see.' })).toBeVisible();
  await expect(page.locator('.v-client-preview-runtime .fd-editorial')).toBeVisible();
  await page.getByRole('button', { name: 'Approve and set access' }).click();
  await page.getByLabel('Six-digit PIN (optional)').fill('123456');
  await page.getByRole('button', { name: 'Publish delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Your delivery is ready.' })).toBeVisible();
  expect(savedAccess.pin).toBe('123456');
  await expect(page.getByLabel('Delivery link')).toHaveValue('http://127.0.0.1:5178/d/editorial-client-link');
});
