import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const account = { id: 'studio-a', name: 'Amara', emailVerified: true, onboardingComplete: true, plan: 'pro' };
const answer = 'Open **Settings** to update your studio profile.\n\n1. Choose the field you want to change.\n2. Save your changes.\n\n[Settings](/settings)';
const reply = (route, text = answer) => route.fulfill({ json: { success: true, data: { answer: text, suggestions: ['How do I publish a delivery?', 'What is included with Pro?'] } } });

async function setup(page, { user = null } = {}) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, serviceAnalytics: true })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/**', route => {
    if (route.request().url().endsWith('/auth/me')) return route.fulfill({ json: { success: true, user } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  await page.goto('/contact');
  if (user) await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.includes('studio-a_studio')))).toBe(true);
}
async function openChat(page) {
  await page.getByRole('button', { name: 'Open Veylo Help', exact: true }).click();
  return page.getByRole('dialog', { name: 'Veylo Help', exact: true });
}
async function ask(page, question) {
  await page.getByRole('textbox', { name: 'Ask Veylo Help', exact: true }).fill(question);
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
}

test('chat fits phone, tablet and desktop and retains animation with device reduced motion', async ({ page }) => {
  await setup(page);
  for (const [width, height] of [[320, 568], [390, 844], [640, 800], [768, 1024], [834, 1112], [1024, 768], [1440, 900], [834, 430]]) {
    await page.setViewportSize({ width, height });
    const panel = await openChat(page);
    await panel.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    const send = await panel.getByRole('button', { name: 'Send question' }).boundingBox();
    expect(send.height).toBeGreaterThanOrEqual(44);
    expect(send.y + send.height).toBeLessThanOrEqual(height);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(panel).toHaveCSS('animation-name', 'veylo-assistant-rise');
    await panel.getByRole('button', { name: 'Close Veylo Help', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Veylo Help', exact: true })).toBeFocused();
  }
});

test('successful turns retain context and survive reload, and related questions are readable', async ({ page }) => {
  const requests = [];
  await setup(page, { user: account });
  await page.route('**/assistant/chat', route => { requests.push(route.request().postDataJSON()); return reply(route); });
  const panel = await openChat(page);
  await expect(panel.getByRole('heading', { name: 'What are you working on?' })).toBeVisible();
  await ask(page, 'How do I change my profile?');
  await expect(panel.locator('.is-assistant')).toContainText('Save your changes');
  await expect(panel.locator('.veylo-markdown ol')).toHaveCSS('list-style-type', 'decimal');
  await panel.locator('summary').click();
  await expect(panel.getByRole('button', { name: 'How do I publish a delivery?' })).toBeVisible();
  await ask(page, 'Where do I find that?');
  await expect(panel.locator('.is-assistant')).toHaveCount(2);
  expect(requests[1].messages.map(message => message.role)).toEqual(['user', 'assistant', 'user']);
  expect(requests[1].messages[1].content).toBe(answer);
  await page.reload();
  await openChat(page);
  await expect(page.locator('.is-assistant')).toHaveCount(2);
  await expect(page.locator('.is-user')).toHaveCount(2);
});

test('retry answers the failed question once without discarding a new draft', async ({ page }) => {
  await setup(page);
  let count = 0;
  const requests = [];
  await page.route('**/assistant/chat', route => {
    requests.push(route.request().postDataJSON());
    if (++count === 1) return route.fulfill({ status: 503, json: { message: 'Please try again shortly.' } });
    return reply(route);
  });
  const panel = await openChat(page);
  await ask(page, 'How much is Pro?');
  await expect(panel.getByRole('alert')).toContainText('Please try again shortly.');
  await panel.getByRole('textbox').fill('My next question');
  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect(panel.locator('.is-assistant')).toHaveCount(1);
  await expect(panel.locator('.is-user')).toHaveCount(1);
  await expect(panel.getByRole('textbox')).toHaveValue('My next question');
  expect(requests[1].messages).toEqual([{ role: 'user', content: 'How much is Pro?' }]);
});

test('stop and reset isolate cancelled requests from a new request', async ({ page }) => {
  await setup(page);
  let count = 0;
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  let releaseSecond;
  const secondGate = new Promise(resolve => { releaseSecond = resolve; });
  await page.route('**/assistant/chat', async route => {
    const number = ++count;
    if (number === 1) await firstGate;
    if (number === 2) await secondGate;
    await reply(route, number === 1 ? 'Old answer' : 'Current answer').catch(() => {});
  });
  const panel = await openChat(page);
  await ask(page, 'First question');
  await expect.poll(() => count).toBe(1);
  await panel.getByRole('button', { name: 'Stop response' }).click();
  await expect(panel.getByText('This question has no answer yet.')).toBeVisible();
  await panel.getByRole('button', { name: 'Start a new Veylo Help chat' }).click();
  await ask(page, 'Second question');
  await expect.poll(() => count).toBe(2);
  releaseFirst();
  await expect(panel.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await panel.getByRole('textbox').fill('Third question');
  await panel.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  expect(count).toBe(2);
  releaseSecond();
  await expect(panel.locator('.is-assistant')).toHaveText(/Current answer/);
  await expect(panel).not.toContainText('Old answer');
  await expect(panel.getByRole('textbox')).toHaveValue('Third question');
});

test('double submit is locked synchronously and empty answers can be retried', async ({ page }) => {
  await setup(page);
  let count = 0;
  await page.route('**/assistant/chat', route => { count++; return reply(route, count === 1 ? ' ' : answer); });
  const panel = await openChat(page);
  await panel.getByRole('textbox').fill('What is Veylo?');
  await panel.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect(panel.getByRole('alert')).toBeVisible();
  expect(count).toBe(1);
  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect(panel.locator('.is-assistant')).toHaveCount(1);
  expect(count).toBe(2);
});

test('separate accounts do not inherit chat history', async ({ page }) => {
  await setup(page, { user: account });
  await page.route('**/assistant/chat', route => reply(route));
  await openChat(page);
  await ask(page, 'My studio A question');
  await expect(page.locator('.is-assistant')).toHaveCount(1);
  await page.route('**/auth/me', route => route.fulfill({ json: { success: true, user: { ...account, id: 'studio-b' } } }));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.includes('studio-b_studio')))).toBe(true);
  const panel = await openChat(page);
  await expect(panel).not.toContainText('My studio A question');
  await expect(panel.locator('.is-user')).toHaveCount(0);
});

test('a new question leaves failed turns out of the model context', async ({ page }) => {
  await setup(page);
  const requests = [];
  await page.route('**/assistant/chat', route => {
    requests.push(route.request().postDataJSON());
    return requests.length === 1 ? route.fulfill({ status: 502, json: { message: 'Try again.' } }) : reply(route);
  });
  const panel = await openChat(page);
  await ask(page, 'A question that failed');
  await expect(panel.getByRole('alert')).toBeVisible();
  await ask(page, 'A different question');
  await expect(panel.locator('.is-assistant')).toHaveCount(1);
  expect(requests[1].messages).toEqual([{ role: 'user', content: 'A different question' }]);
  await expect(panel.locator('.is-user')).toHaveCount(2);
});

test('copy feedback works and internal answer links close the chat without losing it', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async text => { window.copiedAnswer = text; } }));
  const text = 'Compare the delivery options on the [Formats](/formats) page.';
  await page.route('**/assistant/chat', route => reply(route, text));
  const panel = await openChat(page);
  await ask(page, 'Which format should I use?');
  await expect(panel.locator('.is-assistant')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Copy answer', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Answer copied' })).toBeVisible();
  expect(await page.evaluate(() => window.copiedAnswer)).toBe(text);
  await panel.getByRole('link', { name: 'Formats', exact: true }).click();
  await expect(page).toHaveURL(/\/formats$/);
  await expect(panel).toHaveCount(0);
  await openChat(page);
  await expect(panel.locator('.is-assistant')).toContainText(text.replace('[Formats](/formats)', 'Formats'));
});

test('mobile Enter creates a newline and a resized visual viewport keeps the composer visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const panel = await openChat(page);
  await expect(panel.getByRole('button', { name: 'Close Veylo Help', exact: true })).toBeFocused();
  await panel.getByRole('textbox').fill('First line');
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('textbox')).toHaveValue('First line\n');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 440 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(panel).toHaveCSS('max-height', '440px');
  const box = await panel.getByRole('button', { name: 'Send question' }).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(440);
});

test('modal traps focus, restores page access and never steals focus when an answer arrives', async ({ page }) => {
  await setup(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/assistant/chat', async route => { await gate; return reply(route); });
  const panel = await openChat(page);
  await expect(page.locator('#main-content')).toHaveJSProperty('inert', false);
  expect(await page.locator('#main-content').evaluate(element => !!element.closest('[inert]'))).toBe(true);
  await panel.getByRole('textbox').fill('Profile help');
  await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: 'Close Veylo Help', exact: true }).focus();
  release();
  await expect(panel.locator('.is-assistant')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Close Veylo Help', exact: true })).toBeFocused();
  await panel.getByRole('textbox').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Veylo Help', exact: true })).toBeFocused();
  expect(await page.locator('#main-content').evaluate(element => !!element.closest('[inert]'))).toBe(false);
});

test('long answers, markdown and unsafe links stay inside the chat', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page);
  const requests = [];
  const longAnswer = 'Profile information. '.repeat(190) + '\n\n[Bad](javascript:alert(1)) [External](https://evil.example) [Backslash](/\\evil.example) [Unknown](/admin) [Settings](/settings)\n\n<script>window.chatUnsafe=true</script>\n\n| Setting | Detail |\n| --- | --- |\n| Profile | ' + 'x'.repeat(300) + ' |';
  await page.route('**/assistant/chat', route => { requests.push(route.request().postDataJSON()); return reply(route, longAnswer); });
  const panel = await openChat(page);
  await ask(page, '**My question**');
  await expect(panel.locator('.is-assistant')).toHaveCount(1);
  await expect(panel.locator('.is-user strong')).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings');
  await expect(panel.getByRole('link', { name: /Bad|External|Backslash|Unknown/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.chatUnsafe)).toBeUndefined();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await ask(page, 'And now?');
  await expect(panel.locator('.is-assistant')).toHaveCount(2);
  expect(requests[1].messages[1].content).toBe(longAnswer);
});

test('reading older messages keeps your position until you choose the latest message', async ({ page }) => {
  await setup(page);
  let count = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/assistant/chat', async route => { if (++count === 2) await gate; return reply(route, 'A practical answer.\n\n'.repeat(90)); });
  const panel = await openChat(page);
  await ask(page, 'First question');
  await expect(panel.locator('.is-assistant')).toHaveCount(1);
  await ask(page, 'Second question');
  await expect.poll(() => count).toBe(2);
  await panel.locator('.veylo-assistant-messages').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
  release();
  await expect(panel.locator('.is-assistant')).toHaveCount(2);
  await expect(panel.getByRole('button', { name: 'Latest message' })).toBeVisible();
  expect(await panel.locator('.veylo-assistant-messages').evaluate(element => element.scrollTop)).toBe(0);
  await panel.getByRole('button', { name: 'Latest message' }).click();
  await expect(panel.getByRole('button', { name: 'Latest message' })).toHaveCount(0);
});

test('capture the starting screen and conversation at mobile, tablet and desktop sizes', async ({ page }) => {
  await setup(page, { user: account });
  await page.route('**/assistant/chat', route => reply(route));
  await mkdir('../.visual-review/assistant', { recursive: true });
  for (const width of [390, 768, 834, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const panel = await openChat(page);
    await page.screenshot({ path: `../.visual-review/assistant/start-${width}.png` });
    await ask(page, 'How do I change my profile?');
    await expect(panel.locator('.is-assistant')).toHaveCount(1);
    await page.screenshot({ path: `../.visual-review/assistant/chat-${width}.png` });
    await panel.getByRole('button', { name: 'Start a new Veylo Help chat' }).click();
    await panel.getByRole('button', { name: 'Close Veylo Help', exact: true }).click();
  }
});
