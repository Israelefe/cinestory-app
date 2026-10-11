import { expect, test } from '@playwright/test';

const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };
const source = 'Convennant 25th Birthday Celebration';
const improved = "Celebrating Convennant's 25th birthday.";

for (const kind of ['showcase', 'photoswap']) test.describe(kind, () => {
async function openDetails(page, assist, { savedDraft, save } = {}) {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user }) });
    if (path.endsWith('/billing/status')) return reply({ plan: 'free', limits: { photosPerDelivery: 100 }, usage: { deliveriesRemaining: 3 } });
    if (path.endsWith('/deliveries/v3/assist')) return assist(route, reply);
    if (path.endsWith('/deliveries/v3') && save) return save(route, reply);
    if (savedDraft && path.endsWith('/deliveries/' + savedDraft()._id)) return reply(savedDraft());
    return reply({});
  });
  await page.goto('/create?type=' + kind);
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
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
  if (kind === 'photoswap') await expect(page.getByRole('button', { name: 'Continue to photos' })).toBeDisabled();
  await purpose.fill('Chidi 30th Birthday Celebration');
  hold = false; release();
  await expect(page.getByText('You changed the details while Veylo was working. Your latest words have been kept.')).toBeVisible();
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
  expect(attempt).toBe(1);
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(source);
  await button.click();
  await expect(page.getByText('No wording changes were suggested. Your text is unchanged.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revert to my words' })).toHaveCount(0);
});

for (const width of [320, 768, 834, 1440]) test(`age-title wording can improve and revert at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
  let calls = 0;
  await openDetails(page, (route, reply) => {
    calls += 1;
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ mode: 'improve', purpose: 'Ada at Thirty', shootType: 'Birthday' });
    return reply({ improved: "Celebrating Ada's 30th birthday.", sourcePurpose: body.purpose, meaningPreserved: true });
  });
  const purpose = page.getByLabel('Purpose of the shoot');
  await purpose.fill('Ada at Thirty');
  await page.getByRole('button', { name: 'Improve my wording' }).click();
  await expect(purpose).toHaveValue("Celebrating Ada's 30th birthday.");
  expect(calls).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  if (kind === 'photoswap') {
    const actions = page.locator('.ps-purpose-actions');
    for (const button of await actions.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: `../.visual-review/photoswap/purpose-wording-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Revert to my words' }).click();
  await expect(purpose).toHaveValue('Ada at Thirty');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test('an unavailable wording service keeps the text and shows a specific support reference', async ({ page }) => {
  let calls = 0;
  await openDetails(page, route => {
    calls += 1;
    return route.fulfill({ status: 503, json: { success: false, code: 'V3_ASSIST_UNAVAILABLE', message: 'Veylo could not finish this request. Your text is unchanged. Please try again.' } });
  });
  await page.getByLabel('Purpose of the shoot').fill('Ada at Thirty');
  const button = page.getByRole('button', { name: 'Improve my wording' });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Your text is unchanged.');
  await expect(page.getByRole('alert')).toContainText('V3_ASSIST_UNAVAILABLE');
  await expect(page.locator('.ps-purpose-assist p, .v3-assist p')).toHaveText('Veylo could not improve the wording. Your text has been kept. Please try again.');
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue('Ada at Thirty');
  await expect(button).toBeEnabled();
  expect(calls).toBe(1);
});

test('a gateway failure without an application code is retried once', async ({ page }) => {
  let calls = 0;
  await openDetails(page, (route, reply) => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 502, contentType: 'text/html', body: 'Bad gateway' });
    const body = route.request().postDataJSON();
    return reply({ improved, sourcePurpose: body.purpose, meaningPreserved: true });
  });
  await page.getByRole('button', { name: 'Improve my wording' }).click();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(improved);
  expect(calls).toBe(2);
});

test('changing the shoot type invalidates an in-flight wording suggestion', async ({ page }) => {
  let release;
  await openDetails(page, async (_route, reply) => {
    await new Promise(resolve => { release = resolve; });
    return reply({ improved, sourcePurpose: source, meaningPreserved: true });
  });
  const button = page.getByRole('button', { name: 'Improve my wording' });
  await button.click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByLabel('Type of shoot').selectOption('Portrait');
  release();
  await expect(button).toBeEnabled();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(source);
  await expect(page.getByRole('button', { name: 'Revert to my words' })).toHaveCount(0);
  await expect(page.getByText('You changed the details while Veylo was working. Your latest words have been kept.')).toBeVisible();
});

test('a late failed request cannot show an error for text the photographer has since replaced', async ({ page }) => {
  let release;
  await openDetails(page, async route => {
    await new Promise(resolve => { release = resolve; });
    return route.fulfill({ status: 503, json: { code: 'V3_PURPOSE_UNAVAILABLE', message: 'The wording service could not finish this request.' } });
  });
  const button = page.getByRole('button', { name: 'Improve my wording' });
  await button.click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByLabel('Purpose of the shoot').fill('Studio portraits for Funmi');
  release();
  await expect(button).toBeEnabled();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue('Studio portraits for Funmi');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('You changed the details while Veylo was working. Your latest words have been kept.')).toBeVisible();
});

test('editing a custom shoot type invalidates its pending wording suggestion', async ({ page }) => {
  let release;
  await openDetails(page, async (route, reply) => {
    expect(route.request().postDataJSON().shootType).toBe('Naming ceremony');
    await new Promise(resolve => { release = resolve; });
    return reply({ improved, sourcePurpose: source, meaningPreserved: true });
  });
  await page.getByLabel('Type of shoot').selectOption('Other');
  await page.getByLabel('What type of shoot?').fill('Naming ceremony');
  const button = page.getByRole('button', { name: 'Improve my wording' });
  await button.click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByLabel('What type of shoot?').fill('Family reunion');
  release();
  await expect(button).toBeEnabled();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(source);
  await expect(page.getByRole('button', { name: 'Revert to my words' })).toHaveCount(0);
});

test('an empty purpose does not send a wording request', async ({ page }) => {
  let calls = 0;
  await openDetails(page, (_route, reply) => { calls += 1; return reply({}); });
  await page.getByLabel('Purpose of the shoot').fill('  ');
  await page.getByRole('button', { name: 'Improve my wording' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter the shoot type and purpose first.');
  expect(calls).toBe(0);
});

if (kind === 'photoswap') test('Photo Swap saves improved wording and can restore the original after reopening details', async ({ page }) => {
  let saved;
  let draft = { _id: '507f1f77bcf86cd799439011', schemaVersion: 3, kind, status: 'draft', assets: [], v3: { step: 'photos' } };
  await openDetails(page, (route, reply) => reply({ improved, sourcePurpose: route.request().postDataJSON().purpose, meaningPreserved: true }), {
    savedDraft: () => draft,
    save: (route, reply) => {
      saved = route.request().postDataJSON();
      draft = { ...draft, clientName: saved.clientName, title: saved.title, shootType: saved.shootType, brief: saved.purpose, v3: { ...draft.v3, originalPurpose: saved.originalPurpose } };
      return reply(draft);
    }
  });
  await page.getByLabel('Client name').fill('Convennant');
  await page.getByLabel('Delivery title').fill('Birthday portraits');
  await page.getByRole('button', { name: 'Improve my wording' }).click();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(improved);
  await page.getByRole('button', { name: 'Continue to photos' }).click();
  await expect(page.getByRole('heading', { name: 'Set the viewing order.' })).toBeVisible();
  expect(saved).toMatchObject({ kind: 'photoswap', purpose: improved, originalPurpose: source });
  await page.getByRole('button', { name: 'Back to details', exact: true }).click();
  await page.getByRole('button', { name: 'Revert to my words' }).click();
  await expect(page.getByLabel('Purpose of the shoot')).toHaveValue(source);
});
});
