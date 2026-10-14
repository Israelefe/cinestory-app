import { expect, test } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { decidePhoto, undoDecision, matchEditorReturns } from '../src/utils/clientSelection.js';

const owner = { _id: '507f1f77bcf86cd799439011', name: 'Amara', studio: { name: 'Amara Studios' }, emailVerified: true, onboardingComplete: true, plan: 'pro' };
const jobId = '507f1f77bcf86cd799439099';
const photo = index => ({ id: (index + 1).toString(16).padStart(24, '0'), _id: (index + 1).toString(16).padStart(24, '0'), originalFilename: `portrait-${index + 1}.jpg`, format: 'jpg', bytes: 2000000, folder: 'Ada at 30', width: 1200, height: 1800, url: '/veylo/web/demo-lora-1-960.webp', thumbnailUrl: '/veylo/web/demo-lora-1-480.webp' });
const image = readFileSync(new URL('../public/veylo/web/demo-lora-1-480.webp', import.meta.url));
const emptyDraft = () => ({ selectedAssetIds: [], reviewedAssetIds: [], cursor: 0, version: 0 });
async function fixture(page, overrides = {}) {
  const photos = Array.from({ length: 65 }, (_, index) => photo(index));
  const state = { photos, drafts: [], submissions: [], creates: [], sourceAssets: photos.slice(0, 4), selectionDraft: emptyDraft(), status: 'active', rule: { mode: 'exactly', count: 2 }, returned: [], deletedFolders: [], deleteBatches: [], ...overrides };
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const json = (data, extra = {}) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, ...extra }) });
    const fail = (message, status = 400) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message }) });
    if (path.endsWith('/auth/me')) return json(null, { user: owner });
    if (path.endsWith('/billing/status')) return json({ plan: 'pro', features: { storageMode: 'read-write' }, limits: { personalStorageBytes: 100e9, photosPerDelivery: 500 }, usage: {} });
    if (/\/public\/.+\/(media\/|returns\/.*\/media)/.test(path)) return route.fulfill({ contentType: 'image/webp', body: image });
    if (path.endsWith('/uploads/sign')) return json({ objectKey: 'veylo/users/' + owner._id + '/library/' + crypto.randomUUID(), uploadToken: 'fixture-upload-token-for-photo', uploadUrl: 'https://fixture.r2.cloudflarestorage.com/bucket/photo', uploadHeaders: {}, editorGrant: 'fixture-scoped-editor-grant' });
    if (path.endsWith('/uploads/confirm')) {
      const body = request.postDataJSON();
      if (body.originalFilename === 'rejected.jpg') return fail('This photograph is not readable.');
      const asset = { ...photo(100 + state.photos.length), originalFilename: body.originalFilename, folder: body.folder || 'Editor returns' };
      state.photos.unshift(asset);
      return json(path.includes('/public/') ? { asset, sourceAssetId: body.sourceAssetId } : asset, { usage: { usedBytes: state.photos.length * 2000000 } });
    }
    if (path.endsWith('/photos/selection')) {
      const filtered = state.photos.filter(photo => (!url.searchParams.get('folder') || photo.folder === url.searchParams.get('folder')) && (!url.searchParams.get('search') || photo.originalFilename.includes(url.searchParams.get('search'))));
      const offset = Number(url.searchParams.get('after') || 0), chunk = filtered.slice(offset, offset + 40);
      return json(chunk.map(photo => photo.id), { hasMore: filtered.length > offset + 40, nextCursor: String(offset + 40), before: new Date().toISOString() });
    }
    if (path.endsWith('/photos/delete')) {
      const ids = request.postDataJSON().assetIds; state.deleteBatches.push(ids);
      const failed = ids.filter(id => state.protectedIds?.includes(id)).map(id => ({ id, status: 'protected', message: 'Close the active link before removing this photo.' }));
      const removedIds = ids.filter(id => !failed.some(row => row.id === id)); state.photos = state.photos.filter(photo => !removedIds.includes(photo.id));
      return json({ removedIds, failed });
    }
    if (path.endsWith('/shoots/delete')) {
      const names = request.postDataJSON().names; state.deletedFolders.push(...names); state.photos = state.photos.map(photo => names.includes(photo.folder) ? { ...photo, folder: 'Unfiled' } : photo);
      return json({ removedNames: names, movedCount: state.photos.length });
    }
    if (path.endsWith('/photos/resolve')) return json(request.postDataJSON().assetIds.map(id => state.photos.find(photo => photo._id === id)).filter(Boolean));
    if (path.endsWith('/storage') && method === 'GET') {
      let filtered = state.photos.filter(photo => (!url.searchParams.get('folder') || photo.folder === url.searchParams.get('folder')) && (!url.searchParams.get('search') || photo.originalFilename.includes(url.searchParams.get('search'))));
      const offset = (Number(url.searchParams.get('page') || 1) - 1) * 60;
      return json(filtered.slice(offset, offset + 60), { total: filtered.length, libraryTotal: state.photos.length, access: 'read-write', shoots: [...new Set(state.photos.map(photo => photo.folder))].map(name => ({ name, count: state.photos.filter(photo => photo.folder === name).length })), usage: { usedBytes: state.photos.length * 2000000, limitBytes: 100e9 }, hasMore: filtered.length > offset + 60 });
    }
    if (path.endsWith('/collaborations') && method === 'POST') { const body = request.postDataJSON(); state.creates.push(body); return json({ ...body, _id: jobId, publicId: 'shared-link', expiresAt: new Date(Date.now() + 86400000).toISOString() }); }
    if (path.endsWith('/collaborations') && method === 'GET') return json([], { hasMore: false });
    if (path.endsWith('/collaborations/' + jobId)) return json({ _id: jobId, publicId: 'shared-link', kind: 'preselection', title: 'Ada at 30', clientName: 'Ada', status: 'submitted', revision: 1, expiresAt: new Date(Date.now() + 86400000).toISOString(), selectionRule: state.rule, assets: state.sourceAssets, selectedPhotos: state.sourceAssets.slice(0, 2), selectedAssetIds: state.sourceAssets.slice(0, 2).map(photo => photo.id), submissions: [], selectionDraft: state.selectionDraft });
    if (path.endsWith('/unlock')) return json({ token: 'fixture-private-access-token' });
    if (path.endsWith('/selection-draft')) { const body = request.postDataJSON(); state.drafts.push(body); if (state.conflict) return fail('Choices changed in another window.', 409); state.selectionDraft = { selectedAssetIds: body.assetIds, reviewedAssetIds: body.reviewedAssetIds, cursor: body.cursor, version: body.version + 1 }; return json({ version: body.version + 1 }); }
    if (path.endsWith('/selections')) { const body = request.postDataJSON(); state.submissions.push(body); state.status = 'submitted'; return json({ submitted: true }); }
    if (path.endsWith('/content')) return json({ kind: state.kind || 'preselection', title: 'Ada at 30', photographerName: 'Amara Studios', clientName: 'Ada', status: state.status, revision: 1, selectionRule: state.rule, selectionDraft: state.selectionDraft, selectedAssetIds: state.submissions.at(-1)?.assetIds || [], assets: state.sourceAssets, returned: state.returned, note: 'Choose your favourites for retouching.' });
    if (path.includes('/storage/public/')) return json({ kind: state.kind || 'preselection', requiresSecret: Boolean(state.secret), title: 'Ada at 30' });
    return json({});
  });
  return state;
}

test('decision undo restores count and deck position; matching never guesses duplicate basenames', () => {
  const original = { selected: [], reviewed: [], cursor: 0, history: [] };
  const chosen = decidePhoto(original, 'one', true, 1, 1);
  expect(chosen.selected).toEqual(['one']); const replaced = decidePhoto(chosen, 'two', true, 2, 1); expect(replaced.selected).toEqual(['two']); expect(undoDecision(replaced)).toMatchObject(chosen);
  expect(undoDecision(chosen)).toMatchObject(original);
  const files = [{ name: 'portrait-1-edit.jpg' }, { name: 'duplicate-edit.jpg' }];
  const matches = matchEditorReturns(files, [{ id: 'one', originalFilename: 'portrait-1.CR2' }, { id: 'two', originalFilename: 'duplicate.CR2' }, { id: 'three', originalFilename: 'duplicate.JPG' }]);
  expect(matches[0].sourceAssetId).toBe('one'); expect(matches[1].sourceAssetId).toBe('');
});

for (const width of [320, 768, 834, 1440]) test(`folder deletion and selecting every photo fit ${width}px`, async ({ page }) => {
  const state = await fixture(page); await page.setViewportSize({ width, height: 1000 }); await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Manage folders', exact: true }).click();
  const folders = page.getByRole('dialog', { name: 'Manage folders', exact: true });
  await folders.getByRole('button', { name: 'Select all folders' }).click(); await expect(folders).toContainText('1 selected');
  await folders.getByRole('button', { name: 'Delete 1 selected' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete this folder?' });
  await expect(confirmation).toContainText('Not in a folder');
  const bounds = await confirmation.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000);
  await confirmation.getByRole('button', { name: 'Delete folders', exact: true }).click(); await expect(confirmation).toHaveCount(0);
  await expect(page.locator('.lib-photo-grid .lib-photo')).toHaveCount(60); expect(state.photos).toHaveLength(65); expect(state.photos.every(photo => photo.folder === 'Unfiled')).toBe(true);
  await page.getByRole('button', { name: 'Select all photographs', exact: true }).click(); await expect(page.locator('.lib-bulk')).toContainText('65 selected');
  await page.getByRole('button', { name: 'Delete selected photographs', exact: true }).click();
  const remove = page.getByRole('dialog', { name: 'Remove 65 photographs?' }); await remove.getByRole('button', { name: 'Remove photographs', exact: true }).click(); await expect(remove).toHaveCount(0);
  await expect(page.locator('.lib-photo-grid .lib-photo')).toHaveCount(0); expect(state.photos).toHaveLength(0); expect(state.deleteBatches.flat()).toHaveLength(65); expect(state.deleteBatches.every(ids => ids.length <= 25)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bulk removal keeps protected photographs selected and explains what to do next', async ({ page }) => {
  const state = await fixture(page, { protectedIds: [photo(0).id] }); await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Select all photographs', exact: true }).click(); await page.getByRole('button', { name: 'Delete selected photographs', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Remove photographs', exact: true }).click();
  await expect(page.locator('.lib-bulk')).toContainText('1 selected'); await expect(page.locator('.lib-photo-grid .lib-photo')).toHaveCount(1);
  await expect(page.getByText('1 kept. Close the active link before removing this photo.')).toBeVisible(); expect(state.photos.map(photo => photo.id)).toEqual([photo(0).id]);
});

test('a failed bulk batch can retry without losing the remaining selection', async ({ page }) => {
  const state = await fixture(page); let attempts = 0;
  await page.route('**/api/v1/storage/photos/delete', route => { attempts++; return attempts === 2 ? route.fulfill({ status: 503, json: { success: false, message: 'Please retry the remaining photographs.' } }) : route.fallback(); });
  await page.goto('/library', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Select all photographs', exact: true }).click(); await page.getByRole('button', { name: 'Delete selected photographs', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Remove photographs', exact: true }).click(); await expect(dialog.locator('.lib-error')).toContainText('Please retry the remaining photographs'); expect(state.photos).toHaveLength(45);
  await dialog.getByRole('button', { name: 'Remove photographs', exact: true }).click(); await expect(dialog).toHaveCount(0); expect(state.photos).toHaveLength(0);
});

test('stopping a bulk deletion finishes its current batch and keeps the remaining photos selected', async ({ page }) => {
  const state = await fixture(page); let release;
  await page.route('**/api/v1/storage/photos/delete', async route => { await new Promise(resolve => { release = resolve; }); await route.fallback(); });
  await page.goto('/library', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Select all photographs', exact: true }).click(); await page.getByRole('button', { name: 'Delete selected photographs', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove photographs', exact: true }).click(); await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole('button', { name: 'Stop after current batch' }).click(); release();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.lib-bulk')).toContainText('45 selected');
  expect(state.photos).toHaveLength(45); expect(state.deleteBatches).toHaveLength(1);
});

for (const kind of ['preselection', 'editor-handoff']) test(`select all ${kind} links includes hidden pages before deleting`, async ({ page }) => {
  await fixture(page); await page.setViewportSize({ width: 390, height: 1000 });
  let jobs = Array.from({ length: 27 }, (_, i) => ({ _id: (100 + i).toString(16).padStart(24, '0'), publicId: 'job-' + i, title: 'Session ' + (i + 1), kind, status: 'active', expiresAt: new Date(Date.now() + 86400000).toISOString(), assetIds: [photo(0).id] }));
  const deleted = [];
  await page.route('**/api/v1/storage/collaborations**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/selection')) return route.fulfill({ json: { success: true, data: jobs.map(job => job._id), hasMore: false } });
    if (url.pathname.endsWith('/delete')) { const body = route.request().postDataJSON(); expect(body.kind).toBe(kind); deleted.push(...body.assetIds); jobs = jobs.filter(job => !body.assetIds.includes(job._id)); return route.fulfill({ json: { success: true, data: { removedIds: body.assetIds, failed: [] } } }); }
    return route.fulfill({ json: { success: true, data: jobs.slice(0, 24), hasMore: jobs.length > 24 } });
  });
  await page.goto(kind === 'preselection' ? '/pre-selection' : '/editor-links', { waitUntil: 'domcontentloaded' }); await expect(page.locator('.lib-job-card')).toHaveCount(24);
  await page.getByRole('button', { name: 'Select all links' }).click(); await page.getByRole('button', { name: 'Delete 27 selected' }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Stored originals, returned edits and accepted photographs are kept'); await dialog.getByRole('button', { name: 'Delete 27 links', exact: true }).click();
  await expect(page.locator('.lib-job-card')).toHaveCount(0); expect(deleted).toHaveLength(27); expect(jobs).toHaveLength(0);
});

test('grid replacement preserves the view, asks which choice to replace, and supports Undo', async ({ page }) => {
  const state = await fixture(page); await page.goto('/select/client', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'View all photographs' }).click();
  for (const number of [1, 2]) await page.getByRole('button', { name: `Choose portrait-${number}.jpg`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose portrait-3.jpg', exact: true }).click();
  const replacement = page.getByRole('dialog', { name: 'Which choice should this replace?' });
  await expect(replacement.getByAltText('New choice')).toBeVisible();
  await replacement.getByRole('button', { name: 'Replace portrait-1.jpg', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove portrait-3.jpg', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View all photographs' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove portrait-1.jpg', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose portrait-3.jpg', exact: true })).toBeVisible();
  await expect.poll(() => state.selectionDraft.selectedAssetIds).toEqual([photo(0).id, photo(1).id]);
  await page.getByRole('button', { name: 'Swipe', exact: true }).click(); await expect(page.locator('.sel-card-photograph')).toBeVisible();
});

test('one-photo choices replace automatically and Undo restores the previous photograph', async ({ page }) => {
  await fixture(page, { rule: { mode: 'exactly', count: 1 } }); await page.goto('/select/client', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'View all photographs' }).click();
  await page.getByRole('button', { name: 'Choose portrait-1.jpg', exact: true }).click();
  await page.getByRole('button', { name: 'Choose portrait-2.jpg', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Remove portrait-2.jpg', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose portrait-1.jpg', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.getByRole('button', { name: 'Remove portrait-1.jpg', exact: true })).toBeVisible();
});

test('folder explanations and invalid allowances give visible feedback', async ({ page }) => {
  await fixture(page); await page.goto('/library', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Add photographs', exact: true }).click();
  const add = page.getByRole('dialog'); await expect(add.getByText('Folders keep photographs from the same client or session together. You can organise them later too.')).toBeVisible();
  await add.getByRole('combobox').selectOption('__new'); await expect(add.getByRole('textbox', { name: 'Folder name' })).toBeVisible(); await page.keyboard.press('Escape');
  await page.goto('/pre-selection/new', { waitUntil: 'domcontentloaded' }); for (const number of [1, 2, 3]) await page.getByRole('button', { name: `Select portrait-${number}.jpg`, exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByRole('textbox', { name: 'Selection name', exact: true }).fill('Ada'); await page.getByRole('spinbutton', { name: 'Number of photographs' }).fill('4');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.lib-error')).toContainText('You have added 3 photographs'); await expect(page.locator('.Toastify__toast')).toContainText('reduce the selection allowance to 3');
});

test('six uploads run together, a seventh waits, and failed previews show a file icon', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    const Native = window.XMLHttpRequest; window.uploadActive = 0; window.uploadPeak = 0; window.uploadCompletions = [];
    window.XMLHttpRequest = class extends Native {
      open(method, url, ...rest) { this.fixture = String(url).includes('fixture.r2.cloudflarestorage.com'); if (!this.fixture) return super.open(method, url, ...rest); }
      setRequestHeader(...args) { if (!this.fixture) return super.setRequestHeader(...args); }
      send(file) { if (!this.fixture) return super.send(file); window.uploadActive++; window.uploadPeak = Math.max(window.uploadPeak, window.uploadActive); window.uploadCompletions.push(() => { window.uploadActive--; Object.defineProperty(this, 'status', { value: 200 }); this.onload?.(new Event('load')); this.onloadend?.(new Event('loadend')); }); }
    };
  });
  await page.goto('/library', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Add photographs', exact: true }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles(Array.from({ length: 7 }, (_, i) => ({ name: `batch-${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from('invalid-thumbnail-fixture') })));
  await expect.poll(() => page.evaluate(() => window.uploadActive)).toBe(6); await expect(page.locator('.lib-upload-thumb img')).toHaveCount(0);
  await page.evaluate(() => window.uploadCompletions.shift()()); await expect.poll(() => page.evaluate(() => window.uploadCompletions.length)).toBe(6);
  await page.evaluate(() => window.uploadCompletions.splice(0).forEach(complete => complete()));
  await expect(page.getByRole('complementary', { name: 'Photograph uploads' })).toContainText('7 photographs added'); expect(await page.evaluate(() => window.uploadPeak)).toBe(6);
});

test('link sharing and dashboard deletion work on phones and tablets', async ({ page }) => {
  const state = await fixture(page); let removed = false, invitations = 0;
  const job = { _id: jobId, kind: 'editor-handoff', publicId: 'editor', title: 'Ada edits', status: 'active', assets: state.sourceAssets, returned: [], approvedAssetIds: [], covers: state.sourceAssets, assetIds: state.sourceAssets.map(photo => photo.id), expiresAt: new Date(Date.now() + 86400000).toISOString() };
  await page.route('**/api/v1/storage/collaborations**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/remove')) { removed = true; return route.fulfill({ json: { success: true } }); }
    if (path.endsWith('/invite')) { invitations++; return route.fulfill({ json: { success: true, notification: { status: 'queued' } } }); }
    return route.fulfill({ json: { success: true, data: path.endsWith('/collaborations') ? removed ? [] : [job] : job, hasMore: false } });
  });
  for (const width of [320, 768, 834]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/editor-links/' + jobId, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', /https:\/\/wa.me\//);
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    const email = page.getByRole('dialog', { name: 'Send a private link' }); await email.getByRole('textbox', { name: 'Recipient email' }).fill('editor@example.test'); await email.getByRole('button', { name: 'Send email invitation' }).click(); await expect(email).toHaveCount(0);
    await page.goto('/editor-links', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Delete Editor Link', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Delete this link?' }), bounds = await confirmation.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    if (width === 834) { await confirmation.getByRole('button', { name: 'Delete link', exact: true }).click(); await expect(page.locator('.lib-job-card')).toHaveCount(0); }
    else await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(invitations).toBe(3); expect(removed).toBe(true);
});

test('Product examples use current selection and accepted edit controls', async ({ page }) => {
  await fixture(page); const errors = []; page.on('pageerror', failure => errors.push(failure.message));
  for (const width of [390, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('/product', { waitUntil: 'domcontentloaded' });
    const selection = page.locator('#client-preselection'); await selection.scrollIntoViewIfNeeded();
    await expect(selection.locator('.sel-card-photograph')).toBeVisible(); await selection.getByRole('button', { name: 'Choose', exact: true }).click(); await expect(selection.locator('.sel-progress')).toContainText('1 of 2 chosen');
    mkdirSync('../.visual-review/library-refinements', { recursive: true }); await page.screenshot({ path: `../.visual-review/library-refinements/product-selection-${width}.png` });
    const editor = page.locator('#editor-handoff'); await editor.getByRole('button', { name: 'Review returned edits' }).click(); await editor.getByRole('button', { name: 'Accept & save to Library' }).first().click();
    await expect(editor.getByRole('button', { name: 'Saved to Photo Library' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 640, 768, 834, 1024, 1440]) test(`Library, selection setup and viewer fit ${width}px`, async ({ page }) => {
  const height = width === 1024 ? 768 : 1000;
  await page.setViewportSize({ width, height }); await fixture(page);
  await page.goto('/library', { waitUntil: 'domcontentloaded' }); await expect(page.getByRole('heading', { name: 'Photo Library', exact: true })).toBeVisible();
  await expect(page.locator('.lib-photo-grid .lib-photo').first()).toBeVisible();
  if ([320, 834, 1440].includes(width)) { mkdirSync('../.visual-review/image-library-rebuild', { recursive: true }); await page.screenshot({ path: `../.visual-review/image-library-rebuild/library-${width}.png`, fullPage: false }); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.locator('.lib-photo-grid').boundingBox()).y).toBeLessThan(width < 640 ? 700 : 600);
  await page.locator('.lib-photo-open').first().click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.goto('/pre-selection/new', { waitUntil: 'domcontentloaded' }); await expect(page.getByRole('heading', { name: 'What should your client choose from?' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if ([390, 834, 1440].includes(width)) { mkdirSync('../.visual-review/image-library-rebuild', { recursive: true }); await page.screenshot({ path: `../.visual-review/image-library-rebuild/setup-${width}.png`, fullPage: true }); }
});

test('server search and selected-only picker include photographs beyond the first page', async ({ page }) => {
  await fixture(page); await page.goto('/pre-selection/new', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Select portrait-1.jpg', exact: true }).click();
  await page.getByRole('button', { name: 'Load more photographs' }).click();
  await page.getByRole('button', { name: 'Select portrait-65.jpg', exact: true }).click();
  await page.getByRole('button', { name: 'Selected only', exact: true }).click();
  await expect(page.locator('.lib-picker-grid>.lib-photo')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Select portrait-65.jpg', exact: true })).toBeVisible();
  await page.goto('/library', { waitUntil: 'domcontentloaded' }); await page.getByRole('textbox', { name: 'Search photo library' }).fill('portrait-65');
  await expect(page.locator('.lib-photo-grid .lib-photo')).toHaveCount(1); await expect(page.locator('.lib-photo-grid')).toContainText('portrait-65.jpg');
});

test('client swipe, undo, saved progress, exact allowance and visual submission', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = await fixture(page);
  await page.goto('/select/client', { waitUntil: 'domcontentloaded' }); const choose = page.getByRole('button', { name: 'Choose', exact: true });
  await expect(choose).toBeEnabled();
  const box = await page.locator('.sel-card').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 130, box.y + box.height / 2 + 3, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('.sel-progress')).toContainText('1 of 2 chosen');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.sel-progress')).toContainText('0 of 2 chosen');
  await expect(choose).toBeEnabled(); await choose.click(); await expect.poll(() => state.selectionDraft.selectedAssetIds.length).toBe(1);
  await page.reload(); await expect(page.locator('.sel-progress')).toContainText('1 of 2 chosen');
  await expect(choose).toBeEnabled(); await choose.click();
  await expect(page.getByRole('button', { name: 'Swipe', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Your choices 2' }).click();
  await expect(page.locator('.sel-review-grid img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Review & send', exact: true }).click(); await expect(page.getByRole('dialog').locator('img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Send my selection', exact: true }).click();
  await expect(page.locator('.sel-receipt')).toContainText('2 photographs sent'); expect(state.submissions).toHaveLength(1); expect(state.submissions[0].version).toBe(state.selectionDraft.version);
  await page.reload(); await expect(page.locator('.sel-review-grid img')).toHaveCount(2);
});

test('offline selections survive reload and save after reconnection', async ({ page }) => {
  const state = await fixture(page); await page.goto('/select/client', { waitUntil: 'domcontentloaded' }); await expect(page.getByRole('button', { name: 'Choose', exact: true })).toBeEnabled();
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
  await page.getByRole('button', { name: 'Choose', exact: true }).click(); await expect(page.locator('.sel-progress')).toContainText('Offline');
  await page.reload(); await expect(page.locator('.sel-progress')).toContainText('1 of 2 chosen'); await expect.poll(() => state.selectionDraft.selectedAssetIds.length).toBe(1);
});

test('client count, full-photo viewing and motion remain usable at tablet and phone sizes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await fixture(page);
  for (const width of [320, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 }); await page.goto('/select/client', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Choose', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const controls = await page.locator('.sel-deck-controls').boundingBox();
    expect(controls.y + controls.height).toBeLessThanOrEqual(width === 1024 ? 768 : 900);
    await page.getByRole('button', { name: 'View photograph larger' }).click(); await expect(page.getByRole('dialog').locator('img')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    if ([320, 834, 1440].includes(width)) { mkdirSync('../.visual-review/image-library-rebuild', { recursive: true }); await page.screenshot({ path: `../.visual-review/image-library-rebuild/client-${width}.png`, fullPage: true }); }
  }
});

test('photographer must set an allowance and can try the swipe view before sharing', async ({ page }) => {
  const state = await fixture(page); await page.goto('/pre-selection/new', { waitUntil: 'domcontentloaded' });
  for (const number of [1, 2, 3]) await page.getByRole('button', { name: `Select portrait-${number}.jpg`, exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('textbox', { name: 'Selection name', exact: true }).fill('Ada portraits');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.lib-error[role=alert]')).toContainText('Set a selection count');
  await page.getByRole('spinbutton', { name: 'Number of photographs' }).fill('2');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Try the client swipe view' }).click();
  const preview = page.getByRole('dialog', { name: 'Choose exactly 2 photographs' });
  await expect(preview.getByRole('button', { name: 'Choose', exact: true })).toBeEnabled();
  await preview.getByRole('button', { name: 'Choose', exact: true }).click();
  await expect(preview.locator('.sel-progress')).toContainText('1 of 2 chosen');
  await preview.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(preview.locator('.sel-progress')).toContainText('0 of 2 chosen');
  await preview.getByRole('button', { name: 'Close client preview' }).click();
  expect(state.drafts).toHaveLength(0); expect(state.submissions).toHaveLength(0);
  await page.getByRole('button', { name: 'Create pre-selection link' }).click();
  await expect(page.getByText('LINK READY', { exact: true })).toBeVisible();
  expect(state.creates[0].selectionRule).toEqual({ mode: 'exactly', count: 2 });
});

test('conflicting choices can load the saved set and continue without losing count', async ({ page }) => {
  const state = await fixture(page, { conflict: true }); await page.goto('/select/client', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Choose', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Choose', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load saved choices' })).toBeVisible();
  state.conflict = false; state.selectionDraft = { selectedAssetIds: [photo(2).id], reviewedAssetIds: [photo(2).id], cursor: 0, version: 1 };
  await page.getByRole('button', { name: 'Load saved choices' }).click();
  await expect(page.getByRole('button', { name: 'Load saved choices' })).toHaveCount(0);
  await expect(page.locator('.sel-progress')).toContainText('1 of 2 chosen');
  await expect(page.getByRole('button', { name: 'Choose', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Choose', exact: true }).click();
  await page.getByRole('button', { name: 'Your choices 2' }).click(); await expect(page.locator('.sel-review-grid img')).toHaveCount(2);
});

test('accepted edits enter normal delivery setup and retry the existing draft', async ({ page }) => {
  const state = await fixture(page), returned = photo(10), draftId = '507f1f77bcf86cd799439088'; state.photos.push(returned);
  let accepted = false, creates = 0, copies = 0;
  await page.route('**/api/v1/storage/collaborations/' + jobId + '**', route => {
    if (route.request().method() === 'PATCH') accepted = true;
    return route.fulfill({ json: { success: true, data: { _id: jobId, publicId: 'editor', kind: 'editor-handoff', title: 'Ada edits', status: 'active', editorVersion: accepted ? 1 : 0, expiresAt: new Date(Date.now() + 86400000).toISOString(), assets: [state.sourceAssets[0]], returned: [{ assetId: returned.id, sourceAssetId: state.sourceAssets[0].id, reviewStatus: accepted ? 'accepted' : 'pending', uploadedAt: new Date().toISOString(), photo: returned }], acceptedFolder: 'Ada accepted edits', approvedAssetIds: accepted ? [returned.id] : [] } } });
  });
  await page.route('**/api/v1/deliveries/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/v3')) { creates++; return route.fulfill({ json: { success: true, data: { _id: draftId, kind: 'pinboard', schemaVersion: 3, assets: [] } } }); }
    if (path.endsWith('/uploads/from-library')) { copies++; expect(route.request().postDataJSON().assetIds).toEqual([returned.id]); return route.fulfill({ status: copies === 1 ? 503 : 200, json: { success: copies > 1, message: 'Please retry this batch.', data: [] } }); }
    return route.fulfill({ json: { success: true, data: { _id: draftId, kind: 'pinboard', clientName: 'Ada', shootType: 'Studio portraits', purpose: 'Birthday portraits for Ada', schemaVersion: 3, assets: [] } } });
  });
  await page.goto('/editor-links/' + jobId, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Create a delivery', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Accept & save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to Photo Library' })).toBeDisabled();
  await page.getByRole('button', { name: 'Create a delivery', exact: true }).click();
  await expect(page.getByRole('heading', { name: /How should this/ })).toBeVisible();
  await page.getByRole('radio', { name: 'GridBoard Delivery' }).check(); await page.getByRole('link', { name: 'Continue with GridBoard' }).click();
  await page.getByRole('textbox', { name: 'Client name', exact: true }).fill('Ada');
  await page.getByRole('textbox', { name: 'Gallery title', exact: true }).fill('Ada at 30');
  await page.getByRole('button', { name: /Continue to photos/ }).click();
  await page.getByRole('button', { name: 'Choose from Photo Library' }).click();
  const picker = page.getByRole('dialog', { name: 'Add photographs to this delivery' });
  await expect(picker.locator('.lib-picker-count')).toContainText('1 selected');
  await picker.getByRole('button', { name: 'Add 1 photographs' }).click(); await expect(picker.locator('.lib-error')).toContainText('Please retry this batch');
  await picker.getByRole('button', { name: 'Add 1 photographs' }).click(); await expect(picker).toHaveCount(0);
  expect(creates).toBe(1); expect(copies).toBe(2);
});

test('owner sees selected images and creates a separate editor job from those IDs', async ({ page }) => {
  const state = await fixture(page); await page.goto('/pre-selection/' + jobId, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.lib-result-grid img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Create Editor Link', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New Editor Link', exact: true })).toBeVisible(); await expect(page.locator('.lib-picker-count')).toContainText('2 selected');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByRole('textbox', { name: 'Job name' }).fill('Ada portrait edits'); await page.getByLabel('Editor password', { exact: true }).fill('private-editor-pass');
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByRole('button', { name: 'Create Editor Link', exact: true }).click();
  await expect(page.getByText('LINK READY', { exact: true })).toBeVisible(); expect(state.creates[0].kind).toBe('editor-handoff'); expect(state.creates[0].assetIds).toEqual(state.sourceAssets.slice(0, 2).map(photo => photo.id));
});

test('editor batch matching shows sources and keeps ambiguous files unassigned', async ({ page }) => {
  await fixture(page, { kind: 'editor-handoff', secret: true }); await page.goto('/edit/editor', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Editor password', { exact: true }).fill('private-editor-pass'); await page.getByRole('button', { name: 'Open editor job' }).click();
  await expect(page.locator('.editor-source-grid img')).toHaveCount(4);
  await page.locator('input[type=file]').setInputFiles([{ name: 'portrait-1-edit.jpg', mimeType: 'image/jpeg', buffer: image }, { name: 'unknown.jpg', mimeType: 'image/jpeg', buffer: image }]);
  const dialog = page.getByRole('dialog'); await expect(dialog.getByAltText('Original: portrait-1.jpg')).toBeVisible();
  await dialog.getByRole('button', { name: 'Upload 2 edits' }).click(); await expect(page.getByText('Match every edit to an original and name each new alternative before uploading.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Match to portrait-2.jpg' }).click();
  await expect(dialog.getByAltText('Original: portrait-2.jpg')).toBeVisible();
  await dialog.getByLabel('Edit version for unknown.jpg').selectOption('__new'); await dialog.getByLabel('Alternative name').fill('Black and white');
  await expect(dialog.getByRole('button', { name: 'Upload 2 edits' })).toBeEnabled();
});

test('upload shows real byte progress, inserts each success, survives navigation and isolates a failure', async ({ page }) => {
  const state = await fixture(page);
  await page.addInitScript(() => {
    const Native = window.XMLHttpRequest;
    window.XMLHttpRequest = class extends Native {
      open(method, url, ...rest) { this.fixtureUpload = String(url).includes('fixture.r2.cloudflarestorage.com'); if (!this.fixtureUpload) return super.open(method, url, ...rest); }
      setRequestHeader(...args) { if (!this.fixtureUpload) return super.setRequestHeader(...args); }
      send(file) {
        if (!this.fixtureUpload) return super.send(file);
        this.tasks = [setTimeout(() => this.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: Math.round(file.size / 2), total: file.size })), 200), setTimeout(() => { Object.defineProperty(this, 'status', { value: 200 }); this.onload?.(new Event('load')); this.onloadend?.(new Event('loadend')); }, file.name === 'later.jpg' ? 2800 : 1300)];
      }
      abort() { if (!this.fixtureUpload) return super.abort(); this.tasks?.forEach(clearTimeout); this.onabort?.(new Event('abort')); this.onloadend?.(new Event('loadend')); }
    };
  });
  await page.goto('/library', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Add photographs', exact: true }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles(['first.jpg', 'rejected.jpg', 'later.jpg'].map(name => ({ name, mimeType: 'image/jpeg', buffer: image })));
  const tray = page.getByRole('complementary', { name: 'Photograph uploads' }); await expect(tray.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '50');
  await expect.poll(() => state.photos.some(photo => photo.originalFilename === 'first.jpg')).toBe(true); await expect(page.locator('.lib-photo-grid')).toContainText('first.jpg');
  await page.getByRole('link', { name: 'Photo Pre-selection', exact: true }).click(); await expect(tray).toBeVisible();
  await expect(tray).toContainText('2 photographs added'); await expect(tray).toContainText('1 need another try'); await expect(tray.getByRole('button', { name: 'Retry rejected.jpg' })).toBeVisible();
  await page.getByRole('link', { name: 'Photo Library', exact: true }).click(); await expect(page.locator('.lib-photo-grid')).toContainText('later.jpg');
});

test('confirmation retries reuse uploaded bytes and sign-out clears private file history', async ({ page }) => {
  await fixture(page); let confirms = 0;
  await page.route('**/api/v1/storage/uploads/confirm', route => {
    confirms++;
    return confirms === 1 ? route.fulfill({ status: 503, json: { success: false, message: 'Please retry saving.' } }) : route.fallback();
  });
  await page.addInitScript(() => {
    const Native = window.XMLHttpRequest;
    window.fixtureTransfers = 0;
    window.XMLHttpRequest = class extends Native {
      open(method, url, ...rest) { this.fixtureUpload = String(url).includes('fixture.r2.cloudflarestorage.com'); if (!this.fixtureUpload) return super.open(method, url, ...rest); }
      setRequestHeader(...args) { if (!this.fixtureUpload) return super.setRequestHeader(...args); }
      send(file) { if (!this.fixtureUpload) return super.send(file); window.fixtureTransfers++; setTimeout(() => { Object.defineProperty(this, 'status', { value: 200 }); this.onload?.(new Event('load')); this.onloadend?.(new Event('loadend')); }, 100); }
    };
  });
  await page.goto('/library', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Add photographs', exact: true }).click();
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'private-shoot.jpg', mimeType: 'image/jpeg', buffer: image });
  const tray = page.getByRole('complementary', { name: 'Photograph uploads' });
  await expect(tray).toContainText('Trying again');
  await expect(tray.getByRole('button', { name: 'Cancel private-shoot.jpg' })).toBeDisabled();
  await expect(tray).toContainText('1 photograph added');
  expect(confirms).toBe(2); expect(await page.evaluate(() => window.fixtureTransfers)).toBe(1);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(tray).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/src/utils/libraryUploadQueue.js')).libraryUploads.getSnapshot().entries.length)).toBe(0);
});
