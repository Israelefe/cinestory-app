import { expect, test } from '@playwright/test';
import { gunzipSync, inflateSync } from 'node:zlib';
test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36' });

const replayConfig = { projectToken: 'phc_tests_only_not_a_live_project', host: 'https://eu.i.posthog.com', distinctId: 'a'.repeat(64) };
const privateMarker = 'PRIVATE_FIXTURE_8f40b7';
async function setup(page, runtime = { feedback: true, guidance: { variant: 'guided', token: 'tests-only-assignment' }, replay: replayConfig }) {
  const requests = [], provider = [], providerUrls = [];
  await page.addInitScript(() => {
    localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4 }));
    // The SDK drops automated browsers. Simulate an ordinary visitor while
    // keeping its production bot filtering enabled.
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname; requests.push({ path, body: route.request().postDataJSON?.() });
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user: { id: '507f1f77bcf86cd799439011', name: privateMarker, email: `${privateMarker}@example.invalid`, role: 'user', emailVerified: true, onboardingComplete: true, plan: 'pro', studio: { name: privateMarker } } } });
    if (path.endsWith('/product/runtime')) return reply(runtime);
    if (path.endsWith('/product/replay-consent')) return reply(replayConfig);
    if (path.endsWith('/billing/status')) return reply({ plan: 'pro', limits: { deliveriesPerMonth: null }, usage: {} });
    if (path.endsWith('/stories/my-stories')) return reply([]);
    if (path.endsWith('/deliveries')) return reply([{ _id: 'fixture-delivery', publicId: privateMarker, title: privateMarker, clientName: privateMarker, status: 'published', kind: 'showcase', assets: [{ url: `/fixture/${privateMarker}.jpg?token=${privateMarker}` }] }]);
    return reply({});
  });
  await page.route('https://*.posthog.com/**', route => {
    const request = route.request();
    providerUrls.push(request.url());
    let body = request.postDataBuffer();
    if (body) {
      try { body = gunzipSync(body); } catch { try { body = inflateSync(body); } catch {} }
      const text = body.toString('utf8');
      provider.push({ url: request.url(), text });
    }
    return route.fulfill({ json: { featureFlags: {}, featureFlagPayloads: {}, sessionRecording: { endpoint: '/s/', sampleRate: 1, minimumDurationMilliseconds: 0 }, autocapture: false, capturePerformance: false, supportedCompression: [] } });
  });
  return { requests, provider, providerUrls };
}
test('feedback and delivery guidance fit phones, tablets and desktops and send only the chosen score', async ({ page }) => {
  const state = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 768, 834, 1440]) {
    await page.setViewportSize({ width, height: 950 }); await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'How easy is this dashboard to use?' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.v-dashboard-research')).toHaveCSS('opacity', '1');
  }
  expect(state.provider).toEqual([]);
  await page.getByRole('radio', { name: '4', exact: true }).check();
  await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(page.getByText('Thank you. Your feedback has been sent.')).toBeVisible();
  expect(state.requests.find(request => request.path.endsWith('/product/feedback')).body).toEqual({ score: 4 });
  await page.screenshot({ path: '../.visual-review/admin-operations/dashboard-tools-1440.png', fullPage: true });
});
test('replay needs explicit permission and masks private text, attributes, photos and forms in actual SDK snapshots', async ({ page }) => {
  test.setTimeout(60000);
  const state = await setup(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Share a dashboard recording' })).toBeVisible();
  expect(state.provider).toEqual([]);
  await page.evaluate(marker => {
    const fixture = document.createElement('section'); fixture.id = marker; fixture.setAttribute('data-private', marker); fixture.title = marker;
    fixture.innerHTML = `<p>${marker}@example.invalid</p><a href="/d/${marker}?pin=${marker}">${marker}</a><input value="${marker}"/><input type="hidden" value="${marker}"/><img src="/fixture/${marker}.png"/><style>.fixture{background-image:url('/${marker}.png')}</style>`;
    document.querySelector('main').append(fixture);
  }, privateMarker);
  await page.getByRole('button', { name: 'Share a dashboard recording' }).click();
  expect(state.provider).toEqual([]);
  await page.getByRole('button', { name: 'Allow and start' }).click();
  await expect(page.getByText('Recording this dashboard. You can stop at any time.')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { const button = document.createElement('button'); button.id = 'replay-test-click'; button.textContent = 'Test recording interaction'; document.querySelector('main').append(button); });
  await page.locator('#replay-test-click').click();
  await expect.poll(() => state.provider.some(request => request.url.includes('/s/')), { timeout: 15000, message: 'Expected a masked replay payload from the real SDK' }).toBe(true);
  const snapshots = state.provider.filter(request => request.url.includes('/s/'));
  expect(snapshots.length, JSON.stringify(state.provider.map(request => request.url))).toBeGreaterThan(0);
  for (const snapshot of snapshots) {
    expect(snapshot.text).toContain('$snapshot');
    expect(snapshot.text).not.toContain(privateMarker);
    expect(snapshot.text).not.toContain('example.invalid');
    expect(snapshot.text).not.toContain('fixture-delivery');
  }
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByText('Recording is off.')).toBeVisible();
  const count = state.provider.filter(request => request.url.includes('/s/')).length;
  await page.evaluate(() => document.body.append(document.createTextNode('AFTER_STOP_PRIVATE')));
  await page.waitForTimeout(1500);
  expect(state.provider.filter(request => request.url.includes('/s/')).length).toBe(count);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /^(?:__)?ph_|posthog/i.test(key)))).toEqual([]);
  await page.getByRole('button', { name: 'Share a dashboard recording' }).click();
  await page.getByRole('button', { name: 'Allow and start' }).click();
  await expect(page.getByText('Recording this dashboard. You can stop at any time.')).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  const afterNavigation = state.provider.filter(request => request.url.includes('/s/')).length;
  await page.evaluate(() => document.body.append(document.createTextNode('PRIVATE_SETTINGS_AFTER_NAVIGATION')));
  await page.waitForTimeout(3500);
  expect(state.provider.filter(request => request.url.includes('/s/')).length).toBe(afterNavigation);
});
test('recording stops when the tab is hidden and at the five-minute limit', async ({ page }) => {
  test.setTimeout(60000);
  await setup(page);
  await page.clock.install();
  await page.goto('/dashboard');
  const begin = async () => {
    await page.getByRole('button', { name: 'Share a dashboard recording' }).click();
    await page.getByRole('button', { name: 'Allow and start' }).click();
    await expect(page.getByText('Recording this dashboard. You can stop at any time.')).toBeVisible({ timeout: 15000 });
  };
  await begin();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Recording is off.')).toBeVisible();
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByText('Recording is off.')).toBeVisible();
  await begin();
  await page.clock.fastForward(5 * 60000 + 50);
  await expect(page.getByText('Recording is off.')).toBeVisible();
});

test('cancelling while consent request is pending cannot start a recording afterwards', async ({ page }) => {
  const state = await setup(page);
  let resolveConsent;
  await page.route('**/api/v1/product/replay-consent', async route => {
    await new Promise(resolve => { resolveConsent = resolve; });
    await route.fulfill({ json: { success: true, data: replayConfig } });
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Share a dashboard recording' }).click();
  await page.getByRole('button', { name: 'Allow and start' }).click();
  await expect.poll(() => Boolean(resolveConsent)).toBe(true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  resolveConsent();
  await expect(page.getByText('Recording is off.')).toBeVisible();
  expect(state.provider).toEqual([]);
});
test('dashboard URLs with queries cannot start recording and cancel does not load the SDK', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/dashboard?draft=PRIVATE_QUERY');
  await page.getByRole('button', { name: 'Share a dashboard recording' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.provider).toEqual([]);
  await page.getByRole('button', { name: 'Share a dashboard recording' }).click();
  await page.getByRole('button', { name: 'Allow and start' }).click();
  await expect(page.getByRole('alert')).toContainText('Open the dashboard');
  expect(state.provider).toEqual([]);
});
