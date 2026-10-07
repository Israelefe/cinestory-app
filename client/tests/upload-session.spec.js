import { expect, test } from '@playwright/test';

async function prepare(page) {
  await page.route('**/upload-session-check', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Upload checks</body></html>' }));
  await page.route('**/src/config/env.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const API_BASE_URL = '/api';" }));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true } }));
  await page.goto('/upload-session-check');
  await page.evaluate(() => { document.cookie = 'veylo_csrf=original; Path=/'; });
}

test('a refused photo link does not refresh the photographer sign-in', async ({ page }) => {
  await prepare(page);
  let refreshes = 0;
  await page.route('**/api/v1/auth/refresh', route => { refreshes++; return route.fulfill({ json: { success: true } }); });
  await page.route('**/api/v1/check-photo', route => route.fulfill({ status: 401, json: { code: 'IMAGE_LINK_EXPIRED', message: 'Photo link rejected' } }));
  const status = await page.evaluate(async () => {
    const { default: api } = await import('/src/services/api.js');
    try { await api.post('/v1/check-photo'); } catch (error) { return error.response.status; }
  });
  expect(status).toBe(401);
  expect(refreshes).toBe(0);
});

test('six expired-session requests share one sign-in refresh and use its new security token', async ({ page }) => {
  await prepare(page);
  let refreshes = 0;
  let denied = 0;
  await page.route('**/api/v1/auth/refresh', async route => {
    refreshes++;
    await route.fulfill({ headers: { 'Set-Cookie': 'veylo_csrf=fresh; Path=/; SameSite=Lax' }, json: { success: true } });
  });
  await page.route('**/api/v1/check-photo/*', route => {
    if (route.request().headers()['x-csrf-token'] !== 'fresh') {
      denied++;
      return route.fulfill({ status: 401, json: { code: 'SESSION_EXPIRED' } });
    }
    return route.fulfill({ json: { success: true } });
  });
  const results = await page.evaluate(async () => {
    const { default: api } = await import('/src/services/api.js');
    return Promise.all(Array.from({ length: 6 }, (_, index) => api.post(`/v1/check-photo/${index}`).then(response => response.status)));
  });
  expect(results).toEqual(Array(6).fill(200));
  expect(denied).toBe(6);
  expect(refreshes).toBe(1);
});

test('a photo request rejected during sign-in refresh retries with the new security token', async ({ page }) => {
  await prepare(page);
  let releaseRefresh;
  const refreshed = new Promise(resolve => { releaseRefresh = resolve; });
  let photoRequests = 0;
  await page.route('**/api/v1/auth/refresh', async route => {
    await route.fulfill({ headers: { 'Set-Cookie': 'veylo_csrf=fresh; Path=/; SameSite=Lax' }, json: { success: true } });
    releaseRefresh();
  });
  await page.route('**/api/v1/session-check', route => route.fulfill(route.request().headers()['x-csrf-token'] === 'fresh'
    ? { json: { success: true } }
    : { status: 401, json: { code: 'SESSION_EXPIRED' } }));
  await page.route('**/api/v1/check-photo', async route => {
    photoRequests++;
    if (route.request().headers()['x-csrf-token'] === 'fresh') return route.fulfill({ json: { success: true } });
    await refreshed;
    return route.fulfill({ status: 403, json: { code: 'CSRF_INVALID' } });
  });
  const results = await page.evaluate(async () => {
    const { default: api } = await import('/src/services/api.js');
    return Promise.all([api.post('/v1/check-photo'), api.post('/v1/session-check')]).then(responses => responses.map(response => response.status));
  });
  expect(results).toEqual([200, 200]);
  expect(photoRequests).toBe(2);
});

test('a genuinely invalid page security token is rejected without a refresh loop', async ({ page }) => {
  await prepare(page);
  let requests = 0;
  let refreshes = 0;
  await page.route('**/api/v1/auth/refresh', route => { refreshes++; return route.fulfill({ json: { success: true } }); });
  await page.route('**/api/v1/check-photo', route => { requests++; return route.fulfill({ status: 403, json: { code: 'CSRF_INVALID' } }); });
  const status = await page.evaluate(async () => {
    const { default: api } = await import('/src/services/api.js');
    try { await api.post('/v1/check-photo'); } catch (error) { return error.response.status; }
  });
  expect(status).toBe(403);
  expect(requests).toBe(1);
  expect(refreshes).toBe(0);
});

test('a broken Cloudflare connection stops a 69-photo batch before any photo transfer', async ({ page }) => {
  await prepare(page);
  let signatures = 0;
  await page.route('**/api/v1/deliveries/draft/uploads/sign', route => {
    signatures++;
    return route.fulfill({ status: 503, json: { code: 'DELIVERY_IMAGE_WORKER_AUTH', message: 'Photo uploads are temporarily unavailable.' } });
  });
  const outcome = await page.evaluate(async () => {
    const { default: api } = await import('/src/services/api.js');
    api.defaults.adapter = 'fetch';
    let transfers = 0;
    window.XMLHttpRequest = class { constructor() { transfers++; throw new Error('No transfer should start'); } };
    const { uploadDeliveryPhotosV3 } = await import('/src/utils/deliveryUploadV3.js');
    const files = Array.from({ length: 69 }, (_, index) => new File(['photo'], `${index}.jpg`, { type: 'image/jpeg' }));
    try { await uploadDeliveryPhotosV3('draft', files); } catch (error) { return { status: error.response.status, transfers }; }
  });
  expect(outcome).toEqual({ status: 503, transfers: 0 });
  expect(signatures).toBe(1);
});

test('retrying a failed confirmation reuses the uploaded original across page reloads', async ({ page }) => {
  await prepare(page);
  let rejectConfirm = true;
  const ids = [];
  await page.route('**/api/v1/deliveries/draft/uploads/*', route => {
    const body = route.request().postDataJSON();
    ids.push(body.uploadId);
    const signature = { objectKey: 'original-key', uploadToken: 'test-token', uploadUrl: 'https://test.r2.cloudflarestorage.com/photo', maxConcurrentUploads: 6 };
    if (route.request().url().endsWith('/confirm')) return route.fulfill(rejectConfirm
      ? { status: 502, json: { message: 'Photo check interrupted' } }
      : { json: { data: { assetId: 'saved-photo' } } });
    return route.fulfill({ json: { data: route.request().url().endsWith('/recover') ? { uploaded: { objectKey: 'original-key' }, signature } : signature } });
  });
  const run = () => page.evaluate(async () => {
    const { default: api } = await import('/src/services/api.js');
    api.defaults.adapter = 'fetch';
    let transfers = 0;
    window.XMLHttpRequest = class {
      constructor() { this.upload = {}; }
      open() {} setRequestHeader() {}
      send() { transfers++; this.status = 200; queueMicrotask(() => this.onload()); }
    };
    const { uploadDeliveryPhotosV3 } = await import('/src/utils/deliveryUploadV3.js');
    const result = await uploadDeliveryPhotosV3('draft', [new File(['photo'], 'portrait.jpg', { type: 'image/jpeg', lastModified: 123 })]);
    return { failed: result.errors.length, saved: result.completed, transfers, pending: sessionStorage.getItem('delivery-upload-v3:draft') };
  });
  const first = await run();
  expect(first.failed).toBe(1);
  expect(first.transfers).toBe(1);
  expect(first.pending).toBeTruthy();
  await page.reload();
  rejectConfirm = false;
  const second = await run();
  expect(second).toEqual({ failed: 0, saved: 1, transfers: 0, pending: null });
  expect(new Set(ids).size).toBe(1);
});
