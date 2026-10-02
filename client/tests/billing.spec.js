import { expect, test } from '@playwright/test';
const account = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.test', emailVerified: true, onboardingComplete: true, accountStatus: 'active', plan: 'pro', studio: { name: 'Amara Studio' } };
const reference = 'veylo_0123456789abcdef0123456789abcdef';
const future = new Date(Date.now() + 20 * 86400000).toISOString();
function price(country = 'NG') { const region = !country ? 'unknown' : country === 'NG' ? 'nigeria' : 'international'; const amountKobo = region === 'unknown' ? null : region === 'nigeria' ? 2500000 : 3000000; return { region, country, currency: 'NGN', amountKobo, monthlyPriceNaira: amountKobo === null ? null : amountKobo / 100, quote: amountKobo === null ? null : `${region}:${amountKobo}` }; }
async function setup(page, options = {}) {
  const state = { country: 'NG', plan: 'pro', status: 'active', verifyCount: 0, verified: true, cancelCount: 0, cancelFailure: false, changePrice: false, ...options };
  const data = () => ({ plan: state.plan, subscription: { status: state.status, amountKobo: options.amountKobo || 2500000, currency: 'NGN', paidThrough: future, graceEndsAt: state.status === 'past_due' && state.plan === 'pro' ? future : null, canManageCard: true, canResume: state.status === 'canceling' }, canCancel: state.status !== 'canceling' && state.plan === 'pro', pricing: price(state.country), paymentsNextCursor: options.history && !state.historyDone ? 'payment1' : null, retentionDays: 30, billingAvailable: Boolean(state.country), payments: [{ _id: 'payment1', reference, status: 'success', amountKobo: options.amountKobo || 2500000, paidAt: new Date().toISOString(), refundedAmountKobo: 100000 }] });
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, analytics: false, marketing: false })));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/auth/me')) return reply({ success: true, user: { ...account, plan: state.plan } });
    if (path.endsWith('/billing/plans')) return reply({ success: true, data: [], pricing: price(state.country), billingAvailable: Boolean(state.country) });
    if (path.endsWith('/billing/status')) {
      if (new URL(route.request().url()).searchParams.has('paymentsBefore')) {
        state.historyDone = true;
        return reply({ success: true, data: { ...data(), payments: [{ _id: 'payment2', reference: 'older-payment-reference', status: 'success', amountKobo: 2500000, paidAt: new Date(Date.now() - 40 * 86400000).toISOString() }] } });
      }
      return reply({ success: true, data: data() });
    }
    if (path.includes('/billing/verify/')) {
      state.verifyCount++; await new Promise(resolve => setTimeout(resolve, 150));
      return reply({ success: true, confirmed: state.verified, data: data(), message: 'Paystack has not confirmed payment yet.' }, state.verified ? 200 : 202);
    }
    if (path.endsWith('/billing/checkout')) {
      state.checkoutBody = route.request().postDataJSON();
      if (state.changePrice) { state.country = 'US'; return reply({ success: false, code: 'PRICE_CHANGED', pricing: price('US'), message: 'Your checkout price has updated. Review it before continuing.' }, 409); }
      return reply({ success: false, message: 'Mock checkout did not charge.' }, 409);
    }
    if (path.endsWith('/billing/cancel')) {
      state.cancelCount++;
      if (state.cancelFailure) return reply({ success: false, message: 'Cancellation has not been confirmed. Contact payment@veylo.com.ng.' }, 502);
      state.status = 'canceling'; return reply({ success: true, data: data(), message: 'Future renewals have stopped.' });
    }
    return reply({ success: true, data: {} });
  });
  return state;
}
test('international pricing appears on every public price surface', async ({ page }) => {
  await setup(page, { country: 'US' });
  for (const path of ['/', '/pricing', '/portfolio']) {
    await page.goto(path); await expect(page.getByText('₦30,000', { exact: true }).first()).toBeAttached();
    await expect(page.locator('.v-regional-price').first()).toContainText('₦30,000');
  }
});
test('Nigeria pricing and unknown country show honest prices without enabling checkout', async ({ page }) => {
  const state = await setup(page, { country: null, plan: 'free' }); await page.goto('/billing');
  await expect(page.getByRole('button', { name: 'Choose Pro' })).toBeDisabled();
  await expect(page.locator('.v-regional-price').first()).toHaveText('₦25,000 / ₦30,000');
  state.country = 'NG'; await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.locator('.v-regional-price').first()).toHaveText('₦25,000');
  await expect(page.getByRole('button', { name: 'Choose Pro' })).toBeEnabled();
});
test('callback verification survives StrictMode and preserves history and billing actions', async ({ page }) => {
  const state = await setup(page); await page.goto(`/billing?reference=${reference}`);
  await expect(page).toHaveURL(/\/billing$/); expect(state.verifyCount).toBe(1);
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep my Pro plan' })).toBeVisible();
});
test('pending callbacks can be retried without pretending payment succeeded', async ({ page }) => {
  const state = await setup(page, { verified: false, plan: 'free' }); await page.goto(`/billing?reference=${reference}`);
  await expect(page.getByRole('alert')).toContainText('not confirmed');
  await expect(page).toHaveURL(/reference=/);
  state.verified = true; await page.getByRole('button', { name: 'Check returned payment again' }).click();
  await expect(page).toHaveURL(/\/billing$/); expect(state.verifyCount).toBe(2);
});
test('changed quote is displayed for review before another checkout request', async ({ page }) => {
  const state = await setup(page, { plan: 'free', changePrice: true }); await page.goto('/billing');
  await page.getByRole('button', { name: 'Choose Pro' }).click();
  await expect(page.getByRole('alert')).toContainText('Review it');
  await expect(page.locator('.v-regional-price').first()).toHaveText('₦30,000');
  expect(state.checkoutBody.quote).toBe('nigeria:2500000');
});
for (const width of [320, 390, 768, 834, 1024, 1440]) {
  test(`billing and cancellation fit ${width}px with keyboard access`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 834 ? 480 : 800 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page, { country: 'US', amountKobo: 3000000, status: 'past_due' }); await page.goto('/billing');
    const cancel = page.getByRole('button', { name: 'Cancel subscription', exact: true }); await cancel.click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    const bounds = await dialog.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Confirm cancellation' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(cancel).toBeFocused();
    await page.screenshot({ path: `../.visual-review/billing/billing-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('failed cancellation stays visible and preserves payment history', async ({ page }) => {
  await setup(page, { cancelFailure: true }); await page.goto('/billing');
  await page.getByRole('button', { name: 'Cancel subscription', exact: true }).click(); await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('alert')).toContainText('not been confirmed'); await expect(page.getByText(reference, { exact: true })).toBeVisible();
});
test('refund policy gives payment support and distinguishes used-service and error reviews', async ({ page }) => {
  await setup(page); await page.goto('/refund-policy');
  await expect(page.getByRole('heading', { name: 'Refunds and payment help.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'payment@veylo.com.ng', exact: true }).first()).toHaveAttribute('href', 'mailto:payment@veylo.com.ng');
  await expect(page.getByText(/duplicate charge for the same subscription period/i)).toBeAttached();
});

test('expired payment grace does not claim Pro access is still available', async ({ page }) => {
  await setup(page, { plan: 'free', status: 'past_due' });
  await page.goto('/billing');
  await expect(page.getByText('Your payment needs attention. The paid access has ended.')).toBeVisible();
});

test('loading older payments retains newer history and removes the finished cursor', async ({ page }) => {
  await setup(page, { history: true });
  await page.goto('/billing');
  await page.getByRole('button', { name: 'Load older payments' }).click();
  await expect(page.getByText('older-payment-reference', { exact: true })).toBeVisible();
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load older payments' })).toHaveCount(0);
});
