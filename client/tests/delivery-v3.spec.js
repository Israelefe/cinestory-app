import { expect, test } from '@playwright/test';

const draftId = '507f1f77bcf86cd799439011';
const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };

for (const width of [320, 834, 1440]) {
  test('V3 details and recommended format remain usable at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    let draft = { _id: draftId, schemaVersion: 3, status: 'draft', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", assets: [], curatedAssetIds: [], creativeDirection: null, v3: { step: 'format', revision: 1, clarificationAnswers: [], narrationChoice: 'skip' }, access: {} };
    const recommendationInputs = [];
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postDataJSON?.() || {};
      const reply = data => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ success: true, user }) });
      if (path.endsWith('/deliveries/v3/assist')) {
        if (body.mode === 'improve') return reply({ improved: body.purpose === 'Lora' ? "Lora's birthday portraits." : "Celebrating Ada's 25th birthday." });
        if (body.mode === 'clarify') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'The purpose must not be assessed.' }) });
        recommendationInputs.push(body);
        return reply({ format: 'photo-story', reason: 'A birthday shoot works well as a short personal sequence.' });
      }
      if (path.endsWith('/deliveries/v3') && request.method() === 'POST') { draft = { ...draft, clientName: body.clientName, shootType: body.shootType, brief: body.purpose }; return reply(draft); }
      if (path.endsWith('/deliveries/' + draftId) && request.method() === 'GET') return reply(draft);
      if (path.endsWith('/deliveries/' + draftId + '/v3/format')) { draft = { ...draft, format: body.format, v3: { ...draft.v3, step: 'upload' } }; return reply(draft); }
      return reply({});
    });
    await page.goto('/create');
    await expect(page.locator('.v-product-header')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tell us what this delivery is for.' })).toBeVisible();
    const cookieButton = page.getByRole('button', { name: 'Got it' });
    if (await cookieButton.isVisible()) await cookieButton.click();
    await page.getByLabel('Client name').fill('Ada');
    await page.getByLabel('Type of shoot').selectOption('Birthday');
    const suppliedPurpose = width === 320 ? 'Lora' : "Ada's 25th birthday celebration";
    await page.getByLabel('Purpose of the shoot').fill(suppliedPurpose);
    await page.getByRole('button', { name: 'Improve my wording' }).click();
    await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(width === 320 ? "Lora's birthday portraits." : "Celebrating Ada's 25th birthday.");
    await expect(page.getByText('Wording improved. Your original is saved so you can restore it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revert to my words' })).toBeVisible();
    await page.getByRole('button', { name: 'Revert to my words' }).click();
    await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(suppliedPurpose);
    await page.getByRole('button', { name: 'Continue to formats' }).click();
    await expect(page.getByRole('heading', { name: 'Choose how they first see the work.' })).toBeVisible();
    expect(recommendationInputs.at(-1)).toMatchObject({ shootType: 'Birthday', purpose: suppliedPurpose });
    await expect(page.locator('.v3-featured-format')).toContainText('Photo Story');
    await expect(page.locator('.v3-featured-format')).toBeVisible();
    await expect(page.locator('.v3-format-card')).toHaveCount(7);
    await page.locator('.v3-format-card').first().getByRole('button').click();
    await expect(page.locator('.v3-format-card').first().getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.v3-featured-format').getByRole('button', { name: 'Choose this format' }).click();
    await expect(page.locator('.v3-featured-format').getByRole('button', { name: 'Selected' })).toHaveAttribute('aria-pressed', 'true');
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
  let draft = { _id: draftId, publicId: 'preview-id', schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", format: 'photo-story', assets, curatedAssetIds: assets.slice(0, 10).map(asset => asset.assetId), creativeDirection: { title: "Ada's birthday", openingLine: 'These photos are from your birthday celebration.', closingLine: 'Here is the full collection from your day.', frames: assets.slice(0, 10).map((asset, index) => ({ assetId: asset.assetId, headline: `Twenty-five, part ${index + 1}`, caption: 'A meaningful thought about Ada’s birthday celebration and the year ahead.' })), palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'showcase', revision: 1, clarificationAnswers: [], narrationChoice: 'skip', openingAssetId: assetId(10), closingAssetId: assetId(11) }, access: {} };
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
  await expect(page.getByLabel('Headline')).toHaveValue('Twenty-five, part 2');
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
  await page.getByRole('button', { name: 'Back to showcase' }).click();
  await expect(page.getByRole('heading', { name: 'Make the selection yours.' })).toBeVisible();
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

test('V3 only shows a contrast warning when needed and fixes it before sending the theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  let draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's birthday", format: 'editorial', assets: [], creativeDirection: { title: "Ada's birthday", openingLine: 'A birthday to remember.', closingLine: 'Your full gallery is ready.', palette: { background: '#ffffff', surface: '#eeeeee', text: '#ffffff', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'design', revision: 2 }, access: {} };
  let themeRequests = 0;
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', usage: { deliveriesRemaining: 2 }, limits: { deliveriesPerMonth: 3 } });
    if (path.endsWith('/v3/theme')) { themeRequests += 1; draft = { ...draft, creativeDirection: { ...draft.creativeDirection, ...route.request().postDataJSON() }, v3: { ...draft.v3, step: 'preview' } }; return reply(draft); }
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await expect(page.getByText('Some text may be hard to read.')).toBeVisible();
  await expect(page.locator('.v3-contrast-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview delivery' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Text is hard to read on the background and panels.');
  await expect(alert).not.toContainText('HTTP 400');
  expect(themeRequests).toBe(0);
  await alert.getByRole('button', { name: 'Fix text contrast' }).click();
  await expect(page.getByText('Some text may be hard to read.')).toHaveCount(0);
  await expect(page.locator('.v3-contrast-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview delivery' }).click();
  await expect(page.getByRole('heading', { name: 'See exactly what the client will see.' })).toBeVisible();
  expect(themeRequests).toBe(1);
});

test('V3 gives a useful message for a legacy 400 response without showing HTTP 400', async ({ page }) => {
  const draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's birthday", format: 'editorial', assets: [], creativeDirection: { title: "Ada's birthday", openingLine: 'A birthday to remember.', closingLine: 'Your full gallery is ready.', palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'design', revision: 2 }, access: {} };
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', usage: { deliveriesRemaining: 2 }, limits: { deliveriesPerMonth: 3 } });
    if (path.endsWith('/v3/theme')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Text needs more contrast against the background and surface colours.' }) });
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await page.getByRole('button', { name: 'Preview delivery' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Change the text colour or use Fix text contrast.');
  await expect(alert).not.toContainText('HTTP 400');
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
    await page.setViewportSize({ width, height: width >= 1025 ? 800 : 900 });
    const assets = Array.from({ length: 5 }, (_, index) => ({ assetId: 'photo-' + index, url: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp', thumbnailUrl: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp', originalFilename: 'photo-' + index + '.jpg' }));
    let draft = { _id: draftId, publicId: 'preview-story', schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", format: 'photo-story', assets, curatedAssetIds: assets.map(asset => asset.assetId), creativeDirection: { title: "Ada's birthday", openingLine: 'Ada, here is your birthday story.', closingLine: 'Here is the full collection from your day.', frames: assets.map((asset, index) => ({ assetId: asset.assetId, headline: `A birthday year ${index + 1}`, caption: 'Ada, your 25th birthday is here, with another year of possibility waiting ahead.' })), palette: { background: '#ffffff', surface: '#eeeeee', text: '#101010', accent: '#006644' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'preview', revision: 2, clarificationAnswers: [], narrationChoice: 'skip', openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId }, access: {} };
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
    const clientPreview = width >= 1025 ? page.frameLocator('.v3-preview iframe') : page.locator('.v3-preview');
    await expect(clientPreview.locator('.v-story-shell')).toBeVisible();
    expect(await clientPreview.locator('.v-story-shell').evaluate(element => getComputedStyle(element).position)).toBe(width >= 1025 ? 'fixed' : 'relative');
    if (width >= 1025) {
      const previewFrame = page.locator('.v3-preview .v-phone-screen iframe');
      await expect.poll(() => page.locator('.v3-preview .v-phone-device').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight - 24)).toBe(true);
      await expect.poll(() => page.locator('.v3-preview .v-phone-device').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(300.1);
      await expect.poll(() => previewFrame.evaluate(element => element.contentWindow.innerWidth)).toBe(360);
      await expect.poll(() => previewFrame.evaluate(element => element.contentWindow.innerHeight)).toBe(800);
      await page.screenshot({ path: '../.visual-review/delivery-v3/create-mobile-preview-desktop.png' });
    }
    if (width === 390) {
      await expect(clientPreview.locator('.v-story-cover')).toContainText('Ada, here is your birthday story.');
      await expect(clientPreview.locator('.v-story-cover-photo img')).toHaveAttribute('src', /demo-lora-1-960\.webp/);
      await clientPreview.getByRole('button', { name: 'Begin the story' }).click();
      await expect(clientPreview.locator('.v-story-cinema-number')).toBeVisible();
      await expect(clientPreview.locator('.v-story-kicker')).toContainText('A birthday year 1');
      await clientPreview.locator('.v-story-shell').screenshot({ path: '../.visual-review/delivery-v3/v3-first-frame-390.png' });
      for (let index = 0; index < 4; index += 1) await clientPreview.getByRole('button', { name: 'Next photograph' }).click();
      await expect(clientPreview.locator('.v-story-finale')).toBeVisible({ timeout: 10000 });
      await expect(clientPreview.locator('.v-story-finale-photos figure')).toHaveCount(3);
      await expect(clientPreview.locator('.v-story-finale-photos figure').nth(1).locator('img')).toHaveAttribute('src', /demo-lora-5-960\.webp/);
      await expect(clientPreview.locator('.v-story-caption.is-finale')).toContainText('Here is the full collection from your day.');
      await expect.poll(() => clientPreview.locator('.v-story-caption.is-finale').evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.9);
      await clientPreview.locator('.v-story-shell').screenshot({ path: '../.visual-review/delivery-v3/v3-finale-390.png' });
      await clientPreview.getByRole('button', { name: 'Open your gallery' }).click();
      const gallery = page.getByRole('dialog', { name: /Ada/ });
      await expect(gallery).toBeVisible();
      expect(await gallery.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(8, 8, 11)');
      await gallery.getByRole('button', { name: 'Close gallery' }).click();
    }
    await page.getByRole('button', { name: 'Adjust design' }).first().click();
    await expect(page.getByRole('heading', { name: 'See how your delivery will look.' })).toBeVisible();
    if (width >= 1025) {
      const designFrame = page.locator('.v3-design-preview .v-phone-screen iframe');
      await expect.poll(() => page.locator('.v3-design-preview .v-phone-device').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight - 24)).toBe(true);
      await expect.poll(() => page.locator('.v3-design-preview .v-phone-device').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(300.1);
      await expect.poll(() => designFrame.evaluate(element => element.contentWindow.innerWidth)).toBe(360);
      await expect.poll(() => designFrame.evaluate(element => element.contentWindow.innerHeight)).toBe(800);
      await expect(page.frameLocator('.v3-design-preview iframe').locator('.v-story-shell')).toBeVisible();
      await page.screenshot({ path: '../.visual-review/delivery-v3/create-design-preview-desktop.png', fullPage: true });
    }
    await page.getByRole('button', { name: 'Preview delivery' }).click();
    await expect(clientPreview.locator('.v-story-shell')).toBeVisible();
    await page.getByRole('button', { name: 'Approve and set access' }).first().click();
    await expect(page.getByRole('heading', { name: 'Set the rules for this link.' })).toBeVisible();
  });
}

test('published V3 Photo Story keeps its opener, closer, numbers, and bookend voice files', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const assets = Array.from({ length: 5 }, (_, index) => ({ assetId: 'photo-' + index, url: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp', thumbnailUrl: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp' }));
  const delivery = {
    _id: draftId, publicId: 'published-story', schemaVersion: 3, status: 'published', clientName: 'Lora', shootType: 'Birthday', format: 'photo-story', assets,
    curatedAssetIds: assets.map(asset => asset.assetId),
    creativeDirection: { title: "Lora's 25th birthday", openingLine: 'Lora, this day was yours.', closingLine: 'Here are all your birthday photographs.', frames: assets.map(asset => ({ assetId: asset.assetId, caption: 'Lora, twenty-five opens a year to celebrate how far you have come and choose what matters next.' })), palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } },
    v3: { openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId, narrationChoice: 'voice' },
    narration: { opening: { url: '/veylo/audio/opening.mp3' }, closing: { url: '/veylo/audio/closing.mp3' } }, access: { allowLikes: true }
  };
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/deliveries/public/published-story') ? { success: true, data: delivery } : { success: true, data: {} }) });
  });
  await page.goto('/d/published-story');
  await expect(page.locator('.v-story-cover')).toContainText('Lora, this day was yours.');
  await expect(page.locator('.v-story-cover-photo img')).toHaveAttribute('src', /demo-lora-1-960\.webp/);
  await expect(page.locator('audio[src$="opening.mp3"]')).toHaveCount(1);
  await expect(page.locator('audio[src$="closing.mp3"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Begin the story' }).click();
  await expect(page.locator('.v-story-canvas.is-playing-state')).toBeVisible();
  await page.getByRole('button', { name: 'Pause story' }).click();
  const storyCaption = page.locator('.v-story-caption:not(.is-finale) h2');
  await expect(storyCaption).toContainText('Lora, twenty-five opens a year');
  expect(await storyCaption.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: 'Add to favourites' }).first().click();
  await page.getByRole('button', { name: 'Close gallery' }).click();
  await expect(page.locator('.v-story-canvas.is-playing-state')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('desktop demo and public delivery fit the phone mockup on an 800px screen around a 360 by 800 mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/demo');
  await expect(page.locator('.v-phone-device')).toBeVisible();
  await expect.poll(() => page.locator('.v-phone-device').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight - 24)).toBe(true);
  await expect.poll(() => page.locator('.v-phone-device').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(300.1);
  let frame = page.locator('.v-phone-screen iframe');
  await expect.poll(() => frame.evaluate(element => element.contentWindow.innerWidth)).toBe(360);
  await expect.poll(() => frame.evaluate(element => element.contentWindow.innerHeight)).toBe(800);
  await expect(page.locator('.v-phone-caption')).toContainText('360 × 800 px');
  await expect(page.frameLocator('.v-phone-screen iframe').locator('.v-story-shell')).toBeVisible();
  await page.screenshot({ path: '../.visual-review/delivery-v3/demo-phone-desktop.png' });

  const asset = { assetId: 'photo-1', url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-960.webp' };
  const delivery = {
    publicId: 'phone-story', schemaVersion: 3, status: 'published', clientName: 'Lora', shootType: 'Birthday', format: 'photo-story',
    assets: [asset], curatedAssetIds: [asset.assetId],
    creativeDirection: { title: "Lora's birthday", openingLine: 'Lora, these photographs are for your birthday.', closingLine: 'Your full gallery is ready.', frames: [{ assetId: asset.assetId, headline: 'A year of her own', caption: 'Lora, turning twenty-five is a year to remember, celebrate, and make your own.' }], palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } },
    access: {}
  };
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/deliveries/public/phone-story') ? { success: true, data: delivery } : { success: true, data: {} }) });
  });
  await page.goto('/d/phone-story');
  await expect(page.locator('.v-phone-device')).toBeVisible();
  await expect.poll(() => page.locator('.v-phone-device').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight - 24)).toBe(true);
  await expect.poll(() => page.locator('.v-phone-device').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(300.1);
  frame = page.locator('.v-phone-screen iframe');
  await expect.poll(() => frame.evaluate(element => element.contentWindow.innerWidth)).toBe(360);
  await expect.poll(() => frame.evaluate(element => element.contentWindow.innerHeight)).toBe(800);
  await expect(page.frameLocator('.v-phone-screen iframe').locator('.v-story-cover')).toContainText('Lora, these photographs are for your birthday.');
  await page.screenshot({ path: '../.visual-review/delivery-v3/client-phone-desktop.png' });
});

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
  await page.getByLabel('Six-digit PIN (optional)').fill('123');
  await page.getByRole('button', { name: 'Publish delivery' }).click();
  await expect(page.getByRole('alert')).toContainText('A PIN needs six digits.');
  await page.getByLabel('Six-digit PIN (optional)').fill('123456');
  await page.getByRole('button', { name: 'Publish delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Your delivery is ready.' })).toBeVisible();
  expect(savedAccess.pin).toBe('123456');
  await expect(page.getByLabel('Delivery link')).toHaveValue('http://127.0.0.1:5178/d/editorial-client-link');
});
