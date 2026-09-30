import { expect, test } from '@playwright/test';

const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };
const source = 'Convennant 25th Birthday Celebration';
const improved = "Celebrating Convennant's 25th birthday.";

async function openDetails(page, assist) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/deliveries/v3/assist')) return assist(route, reply);
    return reply({});
  });
  await page.goto('/create?type=showcase');
  await page.getByLabel('Type of shoot').selectOption('Birthday');
  await page.getByLabel('Purpose of the shoot').fill(source);
}

for (const width of [320, 768, 834, 1440]) test(`wording improvement retains manual edits and can revert the latest source at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
  let release;
  let hold = true;
  let requests = 0;
  await openDetails(page, async (route, reply) => {
    const body = route.request().postDataJSON();
    requests += 1;
    if (hold) await new Promise(resolve => { release = resolve; });
    return reply({ improved: body.purpose === source ? improved : "Celebrating Chidi's 30th birthday.", sourcePurpose: body.purpose, meaningPreserved: true });
  });
  const purpose = page.getByLabel('Purpose of the shoot');
  const button = page.getByRole('button', { name: 'Improve my wording' });
  await button.click();
  await expect.poll(() => requests).toBe(1);
  await expect(button).toBeDisabled();
  await purpose.fill('Chidi 30th Birthday Celebration');
  hold = false; release();
  await expect(page.getByText('You edited the text while Veylo was working. Your latest words have been kept.')).toBeVisible();
  await expect(purpose).toHaveValue('Chidi 30th Birthday Celebration');
  await expect(page.getByRole('button', { name: 'Revert to my words' })).toHaveCount(0);
  await button.click();
  await expect(purpose).toHaveValue("Celebrating Chidi's 30th birthday.");
  await page.getByRole('button', { name: 'Revert to my words' }).click();
  await expect(purpose).toHaveValue('Chidi 30th Birthday Celebration');
  // Editing then returning to the source still invalidates an in-flight request.
  hold = true;
  await purpose.fill(source);
  await button.click();
  await expect.poll(() => requests).toBe(3);
  await purpose.fill('Another purpose');
  await purpose.fill(source);
  hold = false; release();
  await expect(button).toBeEnabled();
  await expect(purpose).toHaveValue(source);
  await expect(page.getByRole('button', { name: 'Revert to my words' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

for (const response of [
  { improved: "Celebrating Lora's 25th birthday." },
  { improved: "Celebrating Lora's 25th birthday.", sourcePurpose: 'Lora 25th Birthday Celebration', meaningPreserved: true }
]) test(`wording improvement never applies an unverified or unrelated response: ${response.sourcePurpose || 'missing source'}`, async ({ page }) => {
  await openDetails(page, (_route, reply) => reply(response));
  await page.getByRole('button', { name: 'Improve my wording' }).click();
  await expect(page.getByText('Veylo could not check that suggestion against your words. Your text has been kept. Please try again.')).toBeVisible();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(source);
  await expect(page.getByRole('button', { name: 'Revert to my words' })).toHaveCount(0);
});

test('wording improvement reports unchanged text honestly and allows retry after failure', async ({ page }) => {
  let attempt = 0;
  await openDetails(page, (route, reply) => {
    attempt += 1;
    if (attempt === 1) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'V3_INVALID_AI_RESPONSE', message: 'Veylo could not improve the wording without changing your details. Your original text has been kept. Please try again.' }) });
    return reply({ improved: source, sourcePurpose: source, meaningPreserved: true });
  });
  const button = page.getByRole('button', { name: 'Improve my wording' });
  await button.click();
  await expect(page.getByText(/Veylo could not improve the wording without changing your details/)).toBeVisible();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(source);
  await button.click();
  await expect(page.getByText('No wording changes were suggested. Your text is unchanged.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revert to my words' })).toHaveCount(0);
});
