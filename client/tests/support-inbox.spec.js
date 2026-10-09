import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const user = { id: '111111111111111111111111', name: 'Ada Okafor', email: 'ada@example.test', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const ticketId = '222222222222222222222222', paymentId = '333333333333333333333333';
const now = new Date().toISOString();
async function setup(page, { signedIn = true } = {}) {
  const requests = [];
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user: signedIn ? user : null } });
    if (url.pathname.endsWith('/support/context')) return route.fulfill({ json: { success: true, data: { ...user, payments: [{ _id: paymentId, reference: 'veylo_test_reference', amountKobo: 4000000, paidAt: now, status: 'success' }] } } });
    if (url.pathname.endsWith('/support/tickets') && method === 'POST') { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, data: { id: ticketId, ticketNumber: 'VT-TEST123', status: 'open', signedIn } } }); }
    if (url.pathname.endsWith(`/support/tickets/${ticketId}/messages`)) { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, data: {} } }); }
    if (url.pathname.endsWith(`/support/tickets/${ticketId}`)) return route.fulfill({ json: { success: true, data: { id: ticketId, ticketNumber: 'VT-TEST123', subject: 'Upload problem', status: 'open', messages: [{ id: 'm1', authorType: 'requester', message: 'The upload failed on my phone.', createdAt: now }, { id: 'm2', authorType: 'admin', message: 'Please retry just the failed photograph.', createdAt: now }], attachments: [] } } });
    if (url.pathname.endsWith('/support/tickets')) return route.fulfill({ json: { success: true, data: { tickets: [{ id: ticketId, ticketNumber: 'VT-TEST123', subject: 'Upload problem', status: 'open', updatedAt: now, hasUnreadReply: true }] } } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  return requests;
}
for (const width of [320, 768, 834, 1440]) test(`support form and customer conversation fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page); await page.goto('/contact');
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('Add details that could help').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir('../.visual-review/support', { recursive: true });
  await page.screenshot({ path: `../.visual-review/support/contact-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Your support inbox' }).click();
  await page.getByRole('button', { name: /Upload problem/ }).click();
  await expect(page.getByText('Please retry just the failed photograph.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../.visual-review/support/customer-thread-${width}.png`, fullPage: true });
});
test('refund intake links the selected payment and confirms a saved request', async ({ page }) => {
  const requests = await setup(page); await page.goto(`/contact?payment=${paymentId}`);
  await page.getByLabel('Do you want a refund review?').selectOption('duplicate-charge');
  await page.getByLabel('Your message', { exact: true }).fill('I appear to have paid twice for this month. Please review both charges.');
  await page.getByRole('button', { name: 'Send to a person', exact: true }).click();
  await expect(page.locator('.vs-sent')).toContainText('VT-TEST123');
  expect(requests).toHaveLength(1); expect(requests[0].paymentId).toBe(paymentId); expect(requests[0].refundReason).toBe('duplicate-charge'); expect(requests[0].email).toBeUndefined();
  await page.getByRole('link', { name: 'Open conversation' }).click();
  await expect(page.getByRole('heading', { name: 'Upload problem' })).toBeVisible();
});
test('Assistant prepares and sends a real support request, then opens its inbox', async ({ page }) => {
  const requests = await setup(page); await page.goto('/contact');
  await page.route('**/assistant/chat', route => route.fulfill({ json: { success: true, data: { answer: 'A person can investigate this upload. Review the message before sending.', actions: [{ kind: 'support', reason: 'requested' }] } } }));
  await page.getByRole('button', { name: 'Open Veylo Assistant', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Veylo Assistant', exact: true });
  await dialog.getByRole('textbox', { name: 'Ask Veylo Assistant' }).fill('Please message support. My upload stops halfway and retry did not work.');
  await dialog.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(dialog.getByLabel('Your message', { exact: true })).toHaveValue(/My upload stops halfway/);
  await dialog.getByLabel('Include useful technical details').uncheck();
  await dialog.getByRole('button', { name: 'Send to a person', exact: true }).click();
  await expect(dialog.locator('.vs-sent')).toContainText('VT-TEST123');
  expect(requests).toHaveLength(1); expect(requests[0].channel).toBe('assistant'); expect(requests[0].includeDiagnostics).toBe(false); expect(requests[0].context).toBeUndefined();
  await dialog.getByRole('link', { name: 'Open conversation' }).click();
  await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(new RegExp(`ticket=${ticketId}`));
});
test('a failed AI answer preserves the problem for a human handoff', async ({ page }) => {
  await setup(page); await page.goto('/contact');
  await page.route('**/assistant/chat', route => route.fulfill({ status: 503, json: { message: 'Veylo Assistant is unavailable.' } }));
  await page.getByRole('button', { name: 'Open Veylo Assistant', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Veylo Assistant', exact: true });
  await dialog.getByLabel('Ask Veylo Assistant').fill('My paid access is missing. Can you help?');
  await dialog.getByRole('button', { name: 'Send question', exact: true }).click();
  await dialog.locator('.veylo-assistant-error').getByRole('button', { name: 'Message a person' }).click();
  await expect(dialog.getByLabel('Your message', { exact: true })).toHaveValue('My paid access is missing. Can you help?');
});
test('Assistant opens the support inbox when asked without creating a request', async ({ page }) => {
  const requests = await setup(page); await page.goto('/contact');
  await page.route('**/assistant/chat', route => route.fulfill({ json: { success: true, data: { answer: 'Opening your support inbox.', actions: [{ kind: 'support', reason: 'open-inbox' }] } } }));
  await page.getByRole('button', { name: 'Open Veylo Assistant', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Veylo Assistant', exact: true });
  await dialog.getByLabel('Ask Veylo Assistant').fill('Open my support inbox.'); await dialog.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/tab=inbox/); await expect(page.getByRole('heading', { name: 'Support inbox.' })).toBeVisible(); expect(requests).toHaveLength(0);
});
test('signed-out customers can send a message without gaining access to account conversations', async ({ page }) => {
  const requests = await setup(page, { signedIn: false }); await page.goto('/contact');
  await page.getByLabel('Your name', { exact: true }).fill('Bisi'); await page.getByLabel('Reply email').fill('bisi@example.test');
  await page.getByLabel('Your message', { exact: true }).fill('I cannot sign in to my account. Please help me recover access.');
  await page.getByRole('button', { name: 'Send to a person', exact: true }).click(); await expect(page.locator('.vs-sent')).toContainText('bisi@example.test'); expect(requests[0].email).toBe('bisi@example.test');
  await page.getByRole('button', { name: 'Your support inbox' }).click(); await expect(page.getByRole('link', { name: 'Sign in', exact: true }).last()).toBeVisible();
});
