import { test, expect } from '@playwright/test';

const id = '222222222222222222222222';
const assetId = '11111111-1111-4111-8111-111111111111';
const user = { id: '111111111111111111111111', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const draft = { _id: id, schemaVersion: 3, kind: 'photoswap', status: 'review', title: 'Birthday portraits', clientName: 'Ada', shootType: 'Studio portraits', brief: 'A birthday shoot', v3: { step: 'captions', revision: 2 }, assets: [{ assetId, publicId: 'demo-photo', caption: 'The original caption.', width: 1200, height: 1800, sortOrder: 0 }] };
const entitlements = { plan: 'pro', limits: { photosPerDelivery: 500, deliveriesPerMonth: null, personalStorageBytes: 100 * 1024 ** 3 }, usage: { deliveriesRemaining: null }, features: { storageMode: 'read-write', portfolio: true }, subscription: { status: 'active', paidThrough: new Date(Date.now() + 86400000).toISOString(), canManageCard: false }, pricing: { amountKobo: 4000000 } };
const workspace = { account: { deliveriesRemaining: null, deliveriesThisMonth: 4, storageUsedBytes: 1024 ** 3, storageLimitBytes: 100 * 1024 ** 3 }, delivery: { kind: 'photoswap', status: 'review' }, photos: [{ assetId, label: 'Photo 1', captionEditable: true }], drafts: [{ _id: id, kind: 'photoswap', title: 'Birthday portraits' }] };
async function setup(page, path = `/create?draft=${id}`) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user } });
    if (path.endsWith(`/deliveries/${id}`)) return route.fulfill({ json: { success: true, data: draft } });
    if (path.endsWith('/billing/status')) return route.fulfill({ json: { success: true, data: entitlements } });
    if (path.endsWith('/assistant/workspace')) return route.fulfill({ json: { success: true, data: workspace } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'Open Veylo Assistant', exact: true })).toBeVisible();
  return errors;
}
async function open(page) {
  await page.getByRole('button', { name: 'Open Veylo Assistant', exact: true }).click();
  return page.getByRole('dialog', { name: 'Veylo Assistant', exact: true });
}
async function ask(page, question) {
  await page.getByRole('textbox', { name: 'Ask Veylo Assistant', exact: true }).fill(question);
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
}

test('creation sends the actual step and fresh unsaved state without typed captions or client details', async ({ page }) => {
  const errors = await setup(page);
  const requests = [];
  await page.locator(`#ps-caption-${assetId}`).fill('Private unsaved caption marker');
  await page.route('**/assistant/chat', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, data: { answer: 'Save your open captions before continuing.' } } }); });
  const panel = await open(page);
  await expect(panel.locator('.veylo-assistant-context summary')).toContainText('PhotoSwap · Captions');
  await ask(page, 'Why can I not continue?');
  await expect(panel.locator('.is-assistant')).toContainText('Save your open captions');
  expect(requests[0].context.workflow).toMatchObject({ deliveryId: id, kind: 'photoswap', step: 'captions', photoCount: 1, unsaved: true });
  expect(JSON.stringify(requests[0].context)).not.toMatch(/Private unsaved|Ada|birthday shoot|demo-photo/);
  await panel.getByRole('button', { name: 'Close Veylo Assistant', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Veylo Assistant', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
test('recent navigation follows in-app links and context can be cleared or disabled', async ({ page }) => {
  await setup(page, '/contact');
  const requests = [];
  await page.route('**/assistant/chat', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, data: { answer: '[Open Billing](/billing)' } } }); });
  let panel = await open(page);
  await ask(page, 'Where is Billing?');
  await panel.getByRole('link', { name: 'Open Billing' }).click();
  panel = await open(page);
  await ask(page, 'What page did I just visit?');
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].context.page).toBe('/billing');
  expect(requests[1].context.recent.filter(event => event.event === 'page-opened').map(event => event.page)).toEqual(['/contact', '/billing']);
  await panel.locator('.veylo-assistant-context summary').click();
  await panel.getByRole('button', { name: 'Clear recent activity' }).click();
  await panel.getByRole('button', { name: 'Turn page context off' }).click();
  await ask(page, 'Explain Pro.');
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].context).toBeUndefined();
});
test('delivery checks use an explicit request and show the actual result without publishing', async ({ page }) => {
  await setup(page);
  let checkBody, publishes = 0;
  await page.route('**/assistant/check', route => { checkBody = route.request().postDataJSON(); return route.fulfill({ json: { success: true, data: { checks: [{ severity: 'blocker', text: 'Retry the two failed uploads in Photos.' }] } } }); });
  await page.route('**/v3/publish', route => { publishes++; return route.fulfill({ json: { success: true } }); });
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Check delivery', exact: true }).click();
  await expect(panel.locator('.is-assistant')).toContainText('Retry the two failed uploads');
  expect(checkBody.deliveryId).toBe(id); expect(checkBody.context.workflow.step).toBe('captions'); expect(publishes).toBe(0);
});
test('caption suggestions require confirmation and apply only the selected field to the open form', async ({ page }) => {
  const errors = await setup(page);
  let confirmations = 0;
  const suggestion = { kind: 'caption', deliveryId: id, assetId, text: 'The approved new caption.', confirmation: 'mock-confirmation' };
  await page.route('**/assistant/writing', route => route.fulfill({ json: { success: true, data: suggestion } }));
  await page.route('**/assistant/writing/confirm', route => { confirmations++; return route.fulfill({ json: { success: true, data: suggestion } }); });
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Writing help' }).click();
  await panel.getByRole('combobox', { name: 'Writing task' }).selectOption('caption');
  await panel.getByRole('combobox', { name: 'Caption photograph' }).selectOption(assetId);
  await panel.getByRole('textbox', { name: 'Writing instruction' }).fill('Make the caption direct and short.');
  await panel.getByRole('button', { name: 'Prepare suggestion' }).click();
  await expect(panel.locator('.veylo-assistant-proposal')).toContainText(suggestion.text);
  expect(confirmations).toBe(0);
  await panel.getByRole('button', { name: 'Apply to draft form' }).click();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(confirmations).toBe(0);
  await panel.getByRole('button', { name: 'Apply to draft form' }).click();
  await panel.getByRole('button', { name: 'Confirm apply' }).click();
  await expect(panel.locator('.is-assistant')).toContainText('Caption added to your open draft form');
  await panel.getByRole('button', { name: 'Close Veylo Assistant', exact: true }).click();
  await expect(page.locator(`#ps-caption-${assetId}`)).toHaveValue(suggestion.text);
  expect(confirmations).toBe(1); expect(errors).toEqual([]);
});
test('support preparation fills a reviewable form and does not send a ticket', async ({ page }) => {
  await setup(page, '/photoswap');
  let tickets = 0;
  await page.route('**/support/tickets', route => { tickets++; return route.fulfill({ json: { success: true } }); });
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Prepare support request' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue(/I need help in About Photo Swap/);
  await expect(page.getByRole('button', { name: 'Send to support' })).toBeVisible();
  await page.getByLabel('Your message', { exact: true }).fill('Replace this with the prepared context.');
  const supportPanel = await open(page);
  await supportPanel.getByRole('button', { name: 'Prepare support request' }).click();
  await expect(page.getByLabel('Your message', { exact: true })).toHaveValue(/I need help in Support/);
  expect(tickets).toBe(0);
});
test('creator assistant remains usable and spacious on phones, tablets and laptops', async ({ page }) => {
  const errors = await setup(page);
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [834, 1112], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const panel = await open(page);
    await panel.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1); expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const send = await panel.getByRole('button', { name: 'Send question' }).boundingBox();
    expect(send.height).toBeGreaterThanOrEqual(44); expect(send.y + send.height).toBeLessThanOrEqual(height);
    await expect(panel.getByRole('button', { name: 'Check delivery', exact: true })).toBeInViewport();
    await panel.getByRole('button', { name: 'Close Veylo Assistant', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('published sharing prepares a WhatsApp message with the verified link and never sends it', async ({ page }) => {
  await setup(page, '/contact');
  await page.route(`**/deliveries/${id}`, route => route.fulfill({ json: { success: true, data: { ...draft, status: 'published', publicId: 'published-photo-set-123456789' } } }));
  await page.route('**/share-grants', route => route.fulfill({ json: { success: true, data: [] } }));
  await page.route('**/assistant/workspace', route => route.fulfill({ json: { success: true, data: { ...workspace, delivery: { kind: 'photoswap', status: 'published' } } } }));
  let sends = 0;
  await page.route('**/assistant/writing', route => route.fulfill({ json: { success: true, data: { kind: 'client-message', text: 'Your photographs are ready. Here is your private link.', clientPath: '/d/published-photo-set-123456789', confirmation: 'unused' } } }));
  await page.route('**/email', route => { sends++; return route.fulfill({ json: { success: true } }); });
  await page.goto(`/sharing?delivery=${id}`);
  await expect(page.getByRole('heading', { name: 'Decide what each person can see and use.' })).toBeVisible();
  const panel = await open(page);
  await page.evaluate(() => { window.assistantCopied = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.assistantCopied = value; } } }); });
  await panel.getByRole('button', { name: 'Writing help' }).click();
  await expect(panel.getByRole('combobox', { name: 'Writing task' })).toHaveValue('client-message');
  await panel.getByRole('textbox', { name: 'Writing instruction' }).fill('Write a short delivery message.');
  await panel.getByRole('button', { name: 'Prepare suggestion' }).click();
  await panel.getByRole('button', { name: 'Copy message and link' }).click();
  await expect.poll(() => page.evaluate(() => window.assistantCopied)).toContain('/d/published-photo-set-123456789');
  expect(sends).toBe(0);
});
