import { expect, test } from '@playwright/test';

const id = '507f1f77bcf86cd799439011';
const palette = { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' };
test.use({ timezoneId: 'Africa/Lagos' });

for (const kind of ['showcase', 'pinboard']) for (const width of [320, 834, 1440]) {
  test(`${kind} keeps local expiry, allows PIN removal and recovers a lost publish response at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
    const photos = Array.from({ length: 6 }, (_, index) => ({ assetId: `photo-${index}`, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-480.webp' }));
    let draft = { _id: id, kind, publicId: 'recovered-client-link', schemaVersion: 3, status: 'review', clientName: 'Convennant', format: 'canvas', title: 'Birthday portraits',
      assets: photos, curatedAssetIds: photos.map(photo => photo.assetId), hasPin: false, v3: { step: 'access', revision: 2, approvedRevision: 2 },
      access: { expiresAt: '2030-10-01T18:30:00.000Z' }, creativeDirection: { title: 'Birthday portraits', palette, typography: { display: 'Playfair Display', body: 'Outfit' }, frames: photos.map(photo => ({ assetId: photo.assetId, caption: 'Convennant, these birthday photographs are here for you.' })) },
      pinboard: { title: 'Birthday portraits', palette, typography: { display: 'Playfair Display', body: 'Outfit' }, selectedLayoutId: 'balanced', layouts: [{ id: 'balanced', title: 'Balanced arrangement', assetOrder: photos.map(photo => photo.assetId) }], moments: [] } };
    const saved = [];
    let publishes = 0;
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: { _id: '507f1f77bcf86cd799439012', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro', studio: { name: 'Amara Photography' } } }) });
      if (path.endsWith('/billing/status')) return reply({ plan: 'pro', features: { branding: 'studio' }, limits: { photosPerDelivery: 500 }, usage: { deliveriesRemaining: null } });
      if (path.endsWith('/v3/access')) {
        const body = request.postDataJSON(); saved.push(body);
        draft = { ...draft, access: body, hasPin: 'pin' in body ? Boolean(body.pin) : draft.hasPin };
        return reply({ access: body, hasPin: draft.hasPin });
      }
      if (path.endsWith('/v3/approve')) { draft = { ...draft, reviewApprovedAt: new Date().toISOString() }; return reply(draft); }
      if (path.endsWith('/v3/publish')) { publishes += 1; draft = { ...draft, status: 'published' }; return route.abort('failed'); }
      if (path.endsWith(`/deliveries/${id}`)) return reply(draft);
      return reply([]);
    });
    await page.goto(`/create?draft=${id}`);
    if (kind === 'pinboard' && width === 1440) await expect(page.frameLocator('.pb-create-preview iframe').locator('.pb-brand')).toContainText('Amara Photography');
    const expiry = page.locator('input[type="datetime-local"]');
    await expect(expiry).toHaveValue('2030-10-01T19:30');
    const pin = page.getByLabel(/Six-digit PIN/);
    const save = () => page.getByRole('button', { name: kind === 'showcase' ? 'Save settings' : 'Approve preview', exact: true }).click();
    const back = async () => { if (kind === 'pinboard') await page.getByRole('button', { name: 'Back to access', exact: true }).click(); };
    await pin.fill('123456'); await save(); await back();
    await expect(pin).toHaveValue('');
    const remove = page.getByRole('checkbox', { name: 'Remove the current PIN' });
    const removePin = async () => { if (kind === 'pinboard') await page.getByText('Remove the current PIN', { exact: true }).click(); else await remove.check(); };
    await removePin(); await expect(remove).toBeChecked(); await pin.fill('654321');
    await expect(remove).not.toBeChecked();
    await removePin(); await expect(pin).toHaveValue('');
    await save();
    await expect.poll(() => saved.length).toBe(2);
    expect(saved[0].pin).toBe('123456'); expect(saved[1].pin).toBe('');
    for (const settings of saved) expect(settings.expiresAt).toBe('2030-10-01T18:30:00.000Z');
    await page.getByRole('button', { name: kind === 'showcase' ? 'Publish delivery' : 'Publish GridBoard', exact: true }).click();
    await expect(page.getByRole('heading', { name: kind === 'showcase' ? 'Your delivery is ready.' : 'Your GridBoard is ready.', exact: true })).toBeVisible();
    await expect(page.getByLabel(kind === 'showcase' ? 'Delivery link' : 'Private gallery link', { exact: true })).toHaveValue('http://127.0.0.1:5178/d/recovered-client-link');
    expect(publishes).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('oversized or unsupported music is rejected before requesting an upload signature', async ({ page }) => {
  await page.goto('/');
  let signatures = 0;
  await page.route('**/api/v1/deliveries/*/soundtrack/sign', route => { signatures += 1; return route.abort(); });
  const errors = await page.evaluate(async () => {
    const { uploadDeliverySoundtrack } = await import('/src/utils/deliveryUpload.js');
    const errors = [];
    for (const file of [new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'track.mp3', { type: 'audio/mpeg' }), new File(['not music'], 'track.exe', { type: 'audio/mpeg' })]) {
      try { await uploadDeliverySoundtrack('test', file); } catch (error) { errors.push(error.message); }
    }
    return errors;
  });
  expect(errors).toEqual(['Choose a music file no larger than 20 MB.', 'Choose an MP3, WAV, M4A, OGG, or AAC music file.']);
  expect(signatures).toBe(0);
});

test('a lost photo confirmation recovers the saved asset without a second transfer or confirmation', async ({ page }) => {
  await page.goto('/');
  let transfers = 0, confirmations = 0, recoveries = 0;
  await page.route('https://api.cloudinary.com/v1_1/offline/image/upload', route => { transfers += 1; return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ public_id: 'private/photo', version: 1, signature: 'offline-signature' }) }); });
  await page.route('**/api/v1/deliveries/*/uploads/*', route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/sign')) return reply({ cloudName: 'offline', apiKey: 'offline-key', timestamp: 1, signature: 'offline-signature' });
    if (path.endsWith('/confirm')) { confirmations += 1; return route.abort('failed'); }
    if (path.endsWith('/recover')) { recoveries += 1; return reply({ asset: { assetId: 'saved-photo', publicId: 'private/photo', url: '/veylo/web/demo-lora-1-960.webp' } }); }
    return route.abort();
  });
  const result = await page.evaluate(async () => {
    const { uploadDeliveryPhotosV3 } = await import('/src/utils/deliveryUploadV3.js');
    return uploadDeliveryPhotosV3('draft', [new File(['offline-photo'], 'photo.jpg', { type: 'image/jpeg' })]);
  });
  expect(result.completed).toBe(1); expect(result.errors).toEqual([]);
  expect(result.successfulAssets[0].assetId).toBe('saved-photo');
  expect({ transfers, confirmations, recoveries }).toEqual({ transfers: 1, confirmations: 1, recoveries: 1 });
});
