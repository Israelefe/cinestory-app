import { expect, test } from '@playwright/test';

const draftId = '507f1f77bcf86cd799439011';
const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };

for (const width of [320, 768, 834, 1440]) test(`Showcase visual photo picker keeps the original selection on failure at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  const assets = Array.from({ length: 12 }, (_, index) => ({ assetId: `photo-${index}`, originalFilename: `finished-${index + 1}.jpg`, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-480.webp' }));
  const draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Convennant', shootType: 'Birthday', brief: 'birthday', format: 'photo-story', assets, curatedAssetIds: assets.slice(0, 10).map(asset => asset.assetId), creativeDirection: { title: "Convennant's birthday", openingLine: 'Your birthday photographs are here.', closingLine: 'Your full collection is ready.', frames: assets.slice(0, 10).map(asset => ({ assetId: asset.assetId, headline: "Convennant's Birthday", caption: 'Convennant, this birthday is yours to celebrate.' })) }, v3: { step: 'showcase', revision: 1, openingAssetId: 'photo-10', closingAssetId: 'photo-11' } };
  const requests = [];
  let fail = true;
  let holdResponse = true;
  let releaseResponse;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    if (path.endsWith('/regenerate')) {
      requests.push({ path, body: route.request().postDataJSON() });
      if (holdResponse) await new Promise(resolve => { releaseResponse = resolve; });
      if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Caption service is busy. Please try again.' }) });
      return reply({ headline: "Convennant's Birthday Year", caption: 'Convennant, this birthday is a chance to mark what matters to you and make room for what you want next.' });
    }
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  await expect(page.getByRole('heading', { name: 'Make the selection yours.' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace this photo', exact: true }).click();
  let picker = page.getByRole('dialog');
  await expect(picker.getByRole('button', { name: /^Choose finished-/ })).toHaveCount(2);
  await expect.poll(() => picker.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  const box = await picker.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(width === 320 ? 740 : 900);
  await picker.getByRole('button', { name: 'Choose finished-11.jpg' }).click();
  await picker.getByRole('button', { name: 'Use this photo' }).click();
  await expect(picker.getByRole('status')).toContainText('Writing a headline and caption');
  await expect(picker.getByRole('button', { name: 'Preparing photo' })).toBeDisabled();
  await expect(page.locator('.v3-showcase-item>img')).toHaveAttribute('alt', 'finished-1.jpg');
  holdResponse = false; releaseResponse();
  await expect(picker.getByRole('alert')).toContainText('Your current photo and words have been kept');
  await expect(page.getByLabel('Headline')).toHaveValue("Convennant's Birthday");
  await expect(page.locator('.v3-showcase-item>img')).toHaveAttribute('alt', 'finished-1.jpg');
  fail = false;
  await picker.getByRole('button', { name: 'Use this photo' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.v3-showcase-item>img')).toHaveAttribute('alt', 'finished-11.jpg');
  await expect(page.getByLabel('Headline')).toHaveValue("Convennant's Birthday Year");
  expect(requests[0].path).toContain('/captions/photo-10/regenerate');
  await page.getByRole('button', { name: 'Choose opening photo', exact: true }).click();
  picker = page.getByRole('dialog');
  await expect(picker.getByRole('button', { name: /^Choose finished-/ })).toHaveCount(12);
  await picker.getByLabel('Search uploaded photos').fill('finished-2.jpg');
  await expect(picker.locator('img')).toHaveCount(1);
  await picker.getByRole('button', { name: 'Choose finished-2.jpg' }).click();
  await picker.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.locator('.v3-bookend-image').first().locator('img')).toHaveAttribute('alt', 'finished-2.jpg');
  expect(requests).toHaveLength(2);
  await page.getByRole('button', { name: 'Choose closing photo', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose closing photo', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Remove from showcase' }).click();
  await page.getByRole('button', { name: 'Add another showcase photo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Choose finished-1.jpg' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('10 chosen')).toBeVisible();
  await page.getByLabel(/Instruction for photo/).fill('Keep the birthday message personal.');
  fail = true;
  await page.getByRole('button', { name: 'Regenerate headline and caption' }).click();
  await expect(page.locator('.v3-caption-error')).toContainText('Your current headline and caption have been kept');
  await expect(page.getByLabel('Headline')).toHaveValue("Convennant's Birthday Year");
  expect(requests.at(-1).body.instruction).toBe('Keep the birthday message personal.');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

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
    await page.goto('/create?type=showcase');
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
  await expect(page.getByRole('heading', { name: 'Choose a voice for your story.' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to showcase' }).click();
  await expect(page.getByRole('heading', { name: 'Make the selection yours.' })).toBeVisible();
  expect(draft.assets).toHaveLength(12);
  expect(draft.curatedAssetIds).toHaveLength(5);
});

test('V3 lets a photographer enable spoken captions without enabling bookend voice', async ({ page }) => {
  const assets = Array.from({ length: 10 }, (_, index) => ({ assetId: `voice-photo-${index}`, originalFilename: `photo-${index + 1}.jpg`, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-960.webp' }));
  let narrationRequest;
  let draft = {
    _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's birthday",
    format: 'photo-story', assets, curatedAssetIds: assets.map(asset => asset.assetId),
    creativeDirection: { title: "Ada's birthday", openingLine: 'Ada, welcome to your birthday story.', closingLine: 'Here is your full collection.', frames: assets.map(asset => ({ assetId: asset.assetId, headline: 'A year of her own', caption: 'Ada, your birthday marks another year to make room for the things you want next.' })) },
    v3: { step: 'narration', revision: 3, narrationChoice: 'skip', captionNarrationChoice: 'skip' }, access: {}
  };
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100, deliveriesPerMonth: 3 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/deliveries/' + draftId + '/v3/narrate')) {
      narrationRequest = request.postDataJSON();
      draft = { ...draft, v3: { ...draft.v3, step: 'music', captionNarrationChoice: 'voice' } };
      return reply({ _id: 'job-1', type: 'v3-narrate', status: 'queued', progress: 0 });
    }
    if (path.endsWith('/deliveries/' + draftId) && request.method() === 'GET') return reply(draft);
    if (path.endsWith('/deliveries/soundtracks')) return reply([]);
    return reply({});
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/create?draft=' + draftId);
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await expect(page.getByRole('heading', { name: 'Choose a voice for your story.' })).toBeVisible();
  const bookendVoice = page.getByRole('checkbox', { name: /Opening and closing/ });
  const captionVoice = page.getByRole('checkbox', { name: /Photo captions/ });
  await expect(bookendVoice).not.toBeChecked();
  await expect(captionVoice).not.toBeChecked();
  await expect(page.getByText('Veylo fits the spoken wording to each six-second photo. Your full written captions stay unchanged.')).toBeVisible();
  await captionVoice.check();
  await page.getByRole('button', { name: 'Generate selected voice' }).click();
  await expect.poll(() => narrationRequest).toEqual({ voiceId: 'flux-hannah-en', bookends: false, captions: true });
  await expect(page.getByRole('heading', { name: 'Find the right soundtrack.' })).toBeVisible();
});

for (const width of [320, 834, 1440]) test(`a failed narration fit offers retry or text beside the controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  const caption = 'Convennant, this birthday is a chance to mark what matters to you and make room for what you want next.';
  let draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Convennant', format: 'photo-story', assets: [{ assetId: 'photo-one' }], curatedAssetIds: ['photo-one'], creativeDirection: { title: "Convennant's birthday", openingLine: 'Your birthday story is here.', closingLine: 'Your full gallery is ready.', frames: [{ assetId: 'photo-one', caption }] }, v3: { step: 'narration', revision: 2, narrationChoice: 'skip', captionNarrationChoice: 'skip' } };
  let requests = 0;
  let releaseFailure;
  const failGate = new Promise(resolve => { releaseFailure = resolve; });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/v3/narrate')) {
      requests += 1;
      draft = { ...draft, generationJob: { _id: 'fit-job', status: 'running', stage: 'fitting-captions', progress: 40 } };
      if (requests > 1) draft = { ...draft, generationJob: null, v3: { ...draft.v3, step: 'music', captionNarrationChoice: 'voice' } };
      return reply({ _id: 'fit-job', status: 'queued', progress: 0 });
    }
    if (path.endsWith('/deliveries/' + draftId)) {
      const snapshot = structuredClone(draft);
      if (requests === 1 && snapshot.generationJob?.status === 'running') {
        await failGate;
        snapshot.generationJob = { status: 'failed', errorCode: 'NARRATION_CAPTION_TOO_LONG', errorMessage: 'Caption 1 needs to be shorter to fit the fixed six-second Photo Story timing. Shorten that caption and try again.' };
      }
      return reply(snapshot);
    }
    if (path.endsWith('/v3/narration/skip')) { draft = { ...draft, generationJob: null, v3: { ...draft.v3, step: 'music' } }; return reply(draft); }
    if (path.endsWith('/deliveries/soundtracks')) return reply([]);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  await page.getByRole('checkbox', { name: /Photo captions/ }).check();
  await page.getByRole('button', { name: 'Generate selected voice' }).click();
  await expect(page.locator('.v3-upload-progress')).toBeVisible();
  releaseFailure();
  await expect(page.locator('.v3-narration-error')).toContainText('Veylo will adjust the spoken wording for you');
  await expect(page.locator('.v3-narration-error')).not.toContainText('Shorten that caption');
  await expect(page.getByRole('button', { name: 'Retry selected voice' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Keep all words on screen' })).toBeEnabled();
  await expect(page.locator('.v3-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.locator('.v3-narration-error').scrollIntoViewIfNeeded();
  if (width === 320) await page.screenshot({ path: '../.visual-review/narration-fit-error-320.png' });
  await page.getByRole('button', { name: width === 1440 ? 'Keep all words on screen' : 'Retry selected voice' }).click();
  await expect(page.getByRole('heading', { name: 'Find the right soundtrack.' })).toBeVisible();
  expect(draft.creativeDirection.frames[0].caption).toBe(caption);
});

for (const width of [320, 768, 834, 1440]) test(`Photo Story voice selection, listening and retry work at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  const assets = Array.from({ length: 5 }, (_, index) => ({ assetId: `voice-photo-${index}`, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-480.webp' }));
  let draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Ada', format: 'photo-story', assets, curatedAssetIds: assets.map(asset => asset.assetId), creativeDirection: { title: "Ada's birthday", openingLine: 'Ada, welcome to your birthday story.', closingLine: 'Your full collection is here for you.', frames: assets.map(asset => ({ assetId: asset.assetId, caption: 'Ada, take this new year at your own pace.' })) }, v3: { step: 'narration', revision: 2, narrationChoice: 'skip', captionNarrationChoice: 'skip', narrationVoiceId: 'flux-colin-en' }, narration: { voiceId: 'flux-colin-en' }, access: {} };
  let fail = true;
  const requests = [];
  await page.route('**/api/v1/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100, deliveriesPerMonth: 3 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/v3/narrate')) {
      const body = request.postDataJSON(); requests.push(body);
      if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Narration is unavailable right now. Try again shortly.' }) });
      draft = { ...draft, narration: { voiceId: body.voiceId }, v3: { ...draft.v3, step: 'music', captionNarrationChoice: 'voice', narrationVoiceId: body.voiceId } };
      return reply({ _id: 'voice-job', type: 'v3-narrate', status: 'queued', input: body });
    }
    if (path.endsWith(`/deliveries/${draftId}`)) return reply(draft);
    if (path.endsWith('/deliveries/soundtracks')) return reply([]);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  await expect(page.getByRole('radio', { name: 'Use Colin', exact: true })).toBeChecked();
  await expect(page.getByRole('radio')).toHaveCount(8);
  if (width === 320) {
    await page.route('**/veylo/audio/voices/hannah.mp3', route => route.fulfill({ status: 404, body: '' }));
    await page.getByRole('button', { name: 'Listen to Hannah sample' }).click();
    const card = page.locator('.narration-voice-card').filter({ has: page.getByRole('radio', { name: 'Use Hannah', exact: true }) });
    await expect(card.getByRole('alert')).toContainText('This sample could not play');
    await page.unroute('**/veylo/audio/voices/hannah.mp3');
    await page.getByRole('button', { name: 'Listen to Hannah sample' }).click();
    await expect(page.getByRole('button', { name: 'Stop Hannah sample' })).toContainText('Stop sample');
    await expect(card.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Stop Hannah sample' }).click();
  }
  await page.getByRole('button', { name: 'Listen to Kit sample' }).click();
  await expect(page.getByRole('button', { name: 'Stop Kit sample' })).toContainText('Stop sample');
  expect(await page.locator('.narration-voice-picker audio').evaluate(audio => audio.paused)).toBe(false);
  await page.getByRole('button', { name: 'Listen to Sienna sample' }).click();
  await expect(page.getByRole('button', { name: 'Stop Sienna sample' })).toContainText('Stop sample');
  await expect(page.getByRole('button', { name: 'Listen to Kit sample' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Sienna sample' }).click();
  const voice = width === 320 || width === 834 ? 'Kit' : 'Sienna';
  const voiceId = `flux-${voice.toLowerCase()}-en`;
  await page.getByRole('radio', { name: `Use ${voice}`, exact: true }).check();
  await expect(page.locator('.v3-narration-choice h2')).toHaveText(voice);
  await expect(page.getByRole('checkbox', { name: /Opening and closing/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /Photo captions/ }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.narration-voice-picker').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `../.visual-review/voice-picker-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Generate selected voice' }).click();
  await expect(page.getByRole('alert')).toContainText('Narration is unavailable right now');
  await expect(page.getByRole('radio', { name: `Use ${voice}`, exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Generate selected voice' })).toBeEnabled();
  fail = false;
  await page.getByRole('button', { name: 'Generate selected voice' }).click();
  await expect(page.getByRole('heading', { name: 'Find the right soundtrack.' })).toBeVisible();
  expect(requests).toEqual([{ voiceId, bookends: false, captions: true }, { voiceId, bookends: false, captions: true }]);
  expect(draft.v3.narrationVoiceId).toBe(voiceId);
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

test('V3 fixes contrast before approving and entering access settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  let draft = { _id: draftId, schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's birthday", format: 'editorial', assets: [], creativeDirection: { title: "Ada's birthday", openingLine: 'A birthday to remember.', closingLine: 'Your full gallery is ready.', palette: { background: '#ffffff', surface: '#eeeeee', text: '#ffffff', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'design', revision: 2 }, access: {} };
  let themeRequests = 0;
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', usage: { deliveriesRemaining: 2 }, limits: { deliveriesPerMonth: 3 } });
    if (path.endsWith('/v3/theme')) { themeRequests += 1; draft = { ...draft, creativeDirection: { ...draft.creativeDirection, ...route.request().postDataJSON() }, v3: { ...draft.v3, step: 'design' } }; return reply(draft); }
    if (path.endsWith('/v3/approve')) { draft = { ...draft, v3: { ...draft.v3, step: 'access', approvedRevision: draft.v3.revision } }; return reply(draft); }
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await expect(page.getByText('Some text may be hard to read.')).toBeVisible();
  await expect(page.locator('.v3-contrast-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve and set access' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Text is hard to read on the background and panels.');
  await expect(alert).not.toContainText('HTTP 400');
  expect(themeRequests).toBe(0);
  await alert.getByRole('button', { name: 'Fix text contrast' }).click();
  await expect(page.getByText('Some text may be hard to read.')).toHaveCount(0);
  await expect(page.locator('.v3-contrast-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve and set access' }).click();
  await expect(page.getByRole('heading', { name: 'Set the rules for this link.' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Approve and set access' }).click();
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
    let draft = { _id: draftId, publicId: 'preview-story', schemaVersion: 3, status: 'review', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", format: 'photo-story', assets, curatedAssetIds: assets.map(asset => asset.assetId), creativeDirection: { title: "Ada's birthday", openingLine: 'Ada, here is your birthday story.', closingLine: 'Here is the full collection from your day.', frames: assets.map((asset, index) => ({ assetId: asset.assetId, headline: `A birthday year ${index + 1}`, caption: 'Ada, your 25th birthday is here, with another year of possibility waiting ahead.' })), palette: { background: '#ffffff', surface: '#eeeeee', text: '#101010', accent: '#006644' }, typography: { display: 'Playfair Display', body: 'Outfit' } }, v3: { step: 'design', revision: 2, clarificationAnswers: [], narrationChoice: 'skip', openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId }, access: {} };
    let repickCount = 0;
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
      if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { deliveriesPerMonth: 3, photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
      if (path.endsWith('/v3/theme/repick')) {
        const palettes = [
          { background: '#15222b', surface: '#25343a', text: '#fffaf6', accent: '#dfaa71' },
          { background: '#282019', surface: '#403126', text: '#fffaf6', accent: '#91c1b6' }
        ];
        draft = { ...draft, creativeDirection: { ...draft.creativeDirection, palette: palettes[repickCount++ % palettes.length] }, v3: { ...draft.v3, step: 'design', revision: draft.v3.revision + 1 } };
        return reply(draft);
      }
      if (path.endsWith('/v3/theme')) { draft = { ...draft, creativeDirection: { ...draft.creativeDirection, ...route.request().postDataJSON() }, v3: { ...draft.v3, step: 'design', revision: 3 } }; return reply(draft); }
      if (path.endsWith('/v3/approve')) { draft = { ...draft, v3: { ...draft.v3, step: 'access', approvedRevision: draft.v3.revision } }; return reply(draft); }
      if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
      return reply({});
    });
    await page.goto('/create?draft=' + draftId);
    const cookieButton = page.getByRole('button', { name: 'Got it' });
    if (await cookieButton.isVisible()) await cookieButton.click();
    await expect(page.getByRole('heading', { name: 'See how your delivery will look.' })).toBeVisible();
    await expect(page.getByText('09 / CLIENT PREVIEW')).toHaveCount(0);
    const clientPreview = page.frameLocator('.v3-design-preview iframe');
    await expect(clientPreview.locator('.v-story-shell')).toBeVisible();
    if (width >= 1025) {
      const previewFrame = page.locator('.v3-design-preview .v-phone-screen iframe');
      await expect.poll(() => page.locator('.v3-design-preview .v-phone-device').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight - 24)).toBe(true);
      await expect.poll(async () => Math.round(await page.locator('.v3-design-preview .v-phone-device').evaluate(element => element.getBoundingClientRect().width))).toBe(300);
      await expect.poll(async () => Math.round(await page.locator('.v3-design-preview .v-phone-device').evaluate(element => element.getBoundingClientRect().height))).toBe(665);
      await expect.poll(() => previewFrame.evaluate(element => element.contentWindow.innerWidth)).toBe(360);
      await expect.poll(() => previewFrame.evaluate(element => element.contentWindow.innerHeight)).toBe(800);
      await page.screenshot({ path: '../.visual-review/delivery-v3/create-design-preview-desktop.png' });
      const accentSwatch = page.locator('.v3-palette-swatch').nth(3).locator('span');
      await page.getByRole('button', { name: 'Choose another palette' }).click();
      await expect(accentSwatch).toHaveCSS('background-color', 'rgb(223, 170, 113)');
      await page.getByRole('button', { name: 'Choose another palette' }).click();
      await expect(accentSwatch).toHaveCSS('background-color', 'rgb(145, 193, 182)');
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
      const gallery = clientPreview.getByRole('dialog', { name: /Ada/ });
      await expect(gallery).toBeVisible();
      expect(await gallery.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(8, 8, 11)');
      await gallery.getByRole('button', { name: 'Close gallery' }).click();
    }
    await page.getByRole('button', { name: 'Approve and set access' }).click();
    await expect(page.getByRole('heading', { name: 'Set the rules for this link.' })).toBeVisible();
  });
}

test('published V3 Photo Story keeps its opener, closer, numbers, and bookend voice files', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      this.dispatchEvent(new Event('pause'));
    };
  });
  const assets = Array.from({ length: 5 }, (_, index) => ({ assetId: 'photo-' + index, url: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp', thumbnailUrl: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp' }));
  const delivery = {
    _id: draftId, publicId: 'published-story', schemaVersion: 3, status: 'published', clientName: 'Lora', shootType: 'Birthday', format: 'photo-story', assets,
    curatedAssetIds: assets.map(asset => asset.assetId),
    creativeDirection: { title: "Lora's 25th birthday", openingLine: 'Lora, this day was yours.', closingLine: 'Here are all your birthday photographs.', frames: assets.map(asset => ({ assetId: asset.assetId, caption: 'Lora, twenty-five is a chance to celebrate how far you have come, enjoy the woman you are now, and choose what you want next.' })), palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } },
    v3: { openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId, narrationChoice: 'voice' },
    soundtrack: { url: '/veylo/audio/story-soundtrack.mp3' },
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
  const soundtrack = page.locator('audio[src$="story-soundtrack.mp3"]');
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBeGreaterThan(.1);
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBeLessThan(.3);
  await expect(page.locator('.v-story-sound')).not.toContainText('Loading soundtrack');
  await page.locator('audio[src$="opening.mp3"]').evaluate(element => element.dispatchEvent(new Event('ended')));
  await expect(page.locator('.v-story-canvas.is-playing-state')).toBeVisible();
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBeGreaterThan(.9);
  await page.getByRole('button', { name: 'Pause story' }).click();
  const storyCaption = page.locator('.v-story-caption:not(.is-finale) h2');
  await expect(storyCaption).toContainText('Lora, twenty-five is a chance');
  await expect(storyCaption).toContainText('choose what you want next.');
  expect(await storyCaption.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: 'Add to favourites' }).first().click();
  await page.getByRole('button', { name: 'Close gallery' }).click();
  await expect(page.locator('.v-story-canvas.is-playing-state')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Resume story' }).click();
  for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: 'Next photograph' }).click();
  await expect(page.locator('.v-story-canvas.is-finale-state')).toBeVisible({ timeout: 10000 });
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBeLessThan(.3);
  await expect(page.locator('.v-story-sound')).not.toContainText('Loading soundtrack');
  await page.locator('audio[src$="closing.mp3"]').evaluate(element => element.dispatchEvent(new Event('ended')));
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBeGreaterThan(.9);
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBe(0);
  expect(await soundtrack.evaluate(element => element.paused)).toBe(true);
  await page.getByRole('button', { name: 'Replay story' }).click();
  await expect(page.locator('.v-story-cover')).toContainText('Lora, this day was yours.');
  await expect(page.getByRole('button', { name: 'Begin the story' })).toBeVisible();
  await expect(page.locator('audio[src$="opening.mp3"]').evaluate(element => element.paused)).resolves.toBe(true);
  await page.getByRole('button', { name: 'Begin the story' }).click();
  await expect(page.locator('audio[src$="opening.mp3"]').evaluate(element => element.paused)).resolves.toBe(false);
  await page.locator('audio[src$="opening.mp3"]').evaluate(element => element.dispatchEvent(new Event('ended')));
  await expect(page.locator('.v-story-canvas.is-playing-state')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Photo Story progress' })).toHaveAttribute('aria-valuenow', '1');
});

test('spoken Photo Story captions stay visible while the six-second photo timer keeps moving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      this.dispatchEvent(new Event('pause'));
    };
  });
  const assets = Array.from({ length: 3 }, (_, index) => ({ assetId: 'voice-photo-' + index, url: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp', thumbnailUrl: '/veylo/web/demo-lora-' + (index + 1) + '-960.webp' }));
  const captions = assets.map((asset, index) => `Lora, this birthday marks a year worth celebrating and leaves room for everything she wants to make of the next one.`);
  const delivery = {
    _id: draftId, publicId: 'spoken-caption-story', schemaVersion: 3, status: 'published', clientName: 'Lora', shootType: 'Birthday', format: 'photo-story', assets,
    curatedAssetIds: assets.map(asset => asset.assetId),
    creativeDirection: { title: "Lora's birthday", openingLine: 'Lora, your story begins here.', closingLine: 'Here is the full gallery.', frames: assets.map((asset, index) => ({ assetId: asset.assetId, headline: `A year of her own ${index + 1}`, caption: captions[index] })), palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } },
    v3: { captionNarrationChoice: 'voice' },
    soundtrack: { url: '/veylo/audio/story-soundtrack.mp3', title: 'Birthday soundtrack' },
    narration: { captions: { url: '/veylo/audio/captions.mp3', duration: 30, segments: assets.map((asset, index) => ({ id: `caption-${index + 1}`, assetIds: [asset.assetId], startSec: index * 6, endSec: index * 6 + 5.2, text: captions[index] })) } },
    access: {}
  };
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/deliveries/public/spoken-caption-story') ? { success: true, data: delivery } : { success: true, data: {} }) });
  });
  await page.goto('/d/spoken-caption-story');
  const narration = page.locator('audio[src$="captions.mp3"]');
  await expect(narration).toHaveCount(1);
  await page.getByRole('button', { name: 'Begin the story' }).click();
  const progress = page.getByRole('progressbar', { name: 'Photo Story progress' });
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(page.locator('.v-story-caption:not(.is-finale)')).toContainText(captions[0]);
  const soundtrack = page.locator('audio[src$="story-soundtrack.mp3"]');
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBeLessThan(.3);
  await narration.evaluate(element => { element.currentTime = 2; });
  await page.getByRole('button', { name: 'Pause story' }).click();
  await expect.poll(() => narration.evaluate(element => element.paused)).toBe(true);
  await page.getByRole('button', { name: 'Resume story' }).click();
  await expect.poll(() => narration.evaluate(element => element.paused)).toBe(false);
  expect(await narration.evaluate(element => element.currentTime)).toBe(2);
  await soundtrack.evaluate(element => element.dispatchEvent(new Event('waiting')));
  await page.waitForTimeout(6500);
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(narration.evaluate(element => element.paused)).resolves.toBe(false);
  await expect(page.locator('.v-story-caption:not(.is-finale)')).toContainText(captions[1]);
  await expect.poll(() => soundtrack.evaluate(element => element.volume)).toBeLessThan(.3);
  await page.waitForTimeout(6500);
  await expect(progress).toHaveAttribute('aria-valuenow', '3');
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
    if (path.endsWith('/deliveries/' + draftId + '/v3/theme')) { draft = { ...draft, creativeDirection: { ...draft.creativeDirection, ...body }, v3: { ...draft.v3, step: 'design', revision: 3 } }; return reply(draft); }
    if (path.endsWith('/deliveries/' + draftId + '/v3/approve')) { draft = { ...draft, reviewApprovedAt: new Date().toISOString(), v3: { ...draft.v3, step: 'access', approvedRevision: draft.v3.revision } }; return reply(draft); }
    if (path.endsWith('/deliveries/' + draftId + '/v3/access')) { savedAccess = body; draft = { ...draft, access: body, hasPin: Boolean(body.pin) }; return reply({ access: body, hasPin: Boolean(body.pin), formatConfig: {} }); }
    if (path.endsWith('/deliveries/' + draftId + '/v3/publish')) return reply({ publicId: draft.publicId, url: 'http://127.0.0.1:5178/d/' + draft.publicId });
    if (path.endsWith('/deliveries/' + draftId)) return reply(draft);
    return reply({});
  });
  await page.goto('/create?draft=' + draftId);
  const cookieButton = page.getByRole('button', { name: 'Got it' });
  if (await cookieButton.isVisible()) await cookieButton.click();
  await expect(page.frameLocator('.v3-design-preview iframe').locator('.v-client-preview-runtime .fd-editorial')).toBeVisible();
  await page.getByRole('button', { name: 'Approve and set access' }).click();
  await expect(page.getByRole('heading', { name: 'Set the rules for this link.' })).toBeVisible();
  await page.getByLabel('Six-digit PIN (optional)').fill('123');
  await page.getByRole('button', { name: 'Publish delivery' }).click();
  await expect(page.getByRole('alert')).toContainText('A PIN needs six digits.');
  await page.getByLabel('Six-digit PIN (optional)').fill('123456');
  await page.getByRole('button', { name: 'Publish delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Your delivery is ready.' })).toBeVisible();
  expect(savedAccess.pin).toBe('123456');
  await expect(page.getByLabel('Delivery link')).toHaveValue('http://127.0.0.1:5178/d/editorial-client-link');
});
