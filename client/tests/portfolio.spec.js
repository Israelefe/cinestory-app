import { expect, test } from '@playwright/test';
import { portfolioDesigns } from '../src/components/portfolioDesigns.js';
import { hasPortfolioCategory } from '../src/services/portfolioCategories.js';
const account = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, accountStatus: 'active', plan: 'pro', studio: { name: 'Amara Studio' } };
const photographs = ['/veylo/pv-marvis.jpeg', '/veylo/pv-white-suit.jpeg', '/veylo/wedding/wedding-1.jpg', '/veylo/wedding/wedding-2.jpg'].map((url, index) => ({ id: `photo-${index}`, publicId: `studio/photo-${index}`, title: `Portrait ${index + 1}`, alt: `Finished portrait ${index + 1}`, category: index < 2 ? 'Portraits' : 'Weddings', featured: true, crop: 'fit', focalX: 50, focalY: 50, width: 1200, height: 1800, url, thumbnailUrl: url }));
function initial() { return { handle: 'amara-studio', studioName: 'Amara Studio', bio: 'Wedding and portrait photography in Lagos.', headline: 'People, as they are.', introLine: 'Photographs for families and celebrations.', location: 'Lagos, Nigeria', contactLabel: 'Ask about a shoot', whatsapp: '08012345678', instagram: 'https://instagram.com/amara.studio/', heroPublicId: photographs[0].publicId, items: structuredClone(photographs), projects: [], direction: {} }; }
async function captureDesign(page, filename) {
  // Full-page screenshots do not scroll to trigger native lazy loading.
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); }));
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: `../.visual-review/portfolio-designs/${filename}.png`, fullPage: true });
}
async function setup(page, options = {}) {
  const state = { draft: initial(), revision: 1, publishedRevision: 1, status: 'published', saves: [], publishes: [], fail: false, conflict: false, ...options };
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 3, necessary: true, analytics: false, marketing: false })));
  const envelope = () => ({ success: true, data: state.draft, access: 'public', status: state.status, draftRevision: state.revision, publishedRevision: state.publishedRevision, hasUnpublishedChanges: state.revision > state.publishedRevision, live: state.status === 'published' ? { handle: 'amara-studio' } : null, accountId: account._id, redesignEnabled: true, latestJob: state.job });
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()); const path = url.pathname; const method = route.request().method();
    const reply = (data, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) });
    if (path.endsWith('/auth/me')) return reply({ success: true, user: account });
    if (path.endsWith('/portfolios/mine')) {
      if (method === 'PUT') {
        const payload = route.request().postDataJSON(); state.saves.push(payload);
        if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
        if (state.fail) return reply({ message: 'You are offline. Try again.' }, 503);
        if (state.conflict || payload.expectedDraftRevision !== state.revision) { state.conflict = false; state.revision += 1; return reply({ message: 'This draft changed in another window.', current: envelope() }, 409); }
        const { expectedDraftRevision, ...content } = payload;
        state.draft = { ...content, items: content.items.map(item => ({ ...item, ...Object.fromEntries(['url', 'thumbnailUrl', 'width', 'height'].map(key => [key, state.draft.items.find(photo => photo.id === item.id)?.[key] || photographs.find(photo => photo.id === item.id)?.[key]])) })) };
        state.revision += 1;
      }
      return reply(envelope());
    }
    if (path.endsWith('/mine/publish')) { const payload = route.request().postDataJSON(); state.publishes.push(payload); state.status = 'published'; state.publishedRevision = state.revision; return reply(envelope()); }
    if (path.endsWith('/mine/unpublish')) { state.status = 'draft'; state.revision += 1; return reply(envelope()); }
    if (path.endsWith('/mine/jobs/job-one/review')) { state.job.reviewDecision = route.request().postDataJSON().decision; return reply({ success: true }); }
    if (path.includes('/handles/')) return reply({ success: true, available: true });
    if (path.endsWith('/mine/activity')) return reply({ success: true, data: { views: 18, uniqueVisitors: 12, projectOpens: 4, contactClicks: 2 } });
    if (path.endsWith('/portfolios/sources')) {
      const data = url.searchParams.get('kind') === 'deliveries' ? [{ sourceId: 'delivery-one', title: 'Ada birthday', photoCount: 1 }] : [{ ...photographs[0], id: 'photo-added', publicId: 'studio/added-photo', filename: 'DSC_1088.jpg', title: '' }];
      return reply({ success: true, data, nextCursor: null });
    }
    if (path.includes('/portfolios/public/') && !path.endsWith('/engagement')) { const projectIds = new Set((state.draft.projects || []).flatMap(project => project.photoIds)); const publicData = { ...state.draft, heroId: state.draft.items.find(item => item.publicId === state.draft.heroPublicId)?.id, items: state.draft.items.filter(photo => photo.featured !== false || (state.draft.direction.showCategories !== false && hasPortfolioCategory(photo.category)) || projectIds.has(photo.id)).map(({ publicId, ...photo }) => photo) }; return reply({ success: true, data: publicData }); }
    return reply({ success: true, data: {} });
  });
  return state;
}
test('autosave keeps edits private and publish waits for the latest in-flight save', async ({ page }) => {
  const state = await setup(page, { delay: 400 }); await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Studio', exact: true }).click(); await page.getByLabel('About your studio').fill('A new private introduction.');
  await expect.poll(() => state.saves.length).toBe(1); await page.getByLabel('About your studio').fill('The final introduction for clients.');
  await page.getByRole('button', { name: 'Publish changes' }).click(); const dialog = page.getByRole('dialog', { name: 'Publish your portfolio' });
  await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(dialog).toHaveCount(0); expect(state.draft.bio).toBe('The final introduction for clients.'); expect(state.publishes[0].expectedDraftRevision).toBe(state.revision); expect(state.saves.every(payload => !('publishedAt' in payload))).toBe(true);
});
test('a draft conflict requires review before replacing the saved version', async ({ page }) => {
  const state = await setup(page, { conflict: true }); await page.goto('/portfolio/manage'); await page.getByRole('button', { name: 'Studio', exact: true }).click(); await page.getByLabel('About your studio').fill('My reviewed introduction.');
  await expect(page.getByRole('heading', { name: 'Review your draft before saving' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Publish changes' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save my version' }).click(); await expect(page.getByRole('heading', { name: 'Review your draft before saving' })).toHaveCount(0); await expect.poll(() => state.draft.bio).toBe('My reviewed introduction.');
});
test('failed saves can be retried without losing the typed draft', async ({ page }) => {
  const state = await setup(page, { fail: true }); await page.goto('/portfolio/manage'); await page.getByRole('button', { name: 'Studio', exact: true }).click(); await page.getByLabel('About your studio').fill('Keep these words while offline.'); await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible(); state.fail = false; await page.getByRole('button', { name: 'Retry save' }).click(); await expect.poll(() => state.draft.bio).toBe('Keep these words while offline.');
});
test('browser recovery stays pending until explicitly restored and saved', async ({ page }) => {
  const state = await setup(page); const recovered = initial(); recovered.bio = 'Recovered private work.';
  await page.addInitScript(({ form, accountId }) => sessionStorage.setItem(`veylo_portfolio_draft:${accountId}`, JSON.stringify({ form, revision: 1, savedAt: Date.now() })), { form: recovered, accountId: account._id }); await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Restore browser changes' }).click(); expect(state.saves.length).toBe(0); await page.getByRole('button', { name: 'Save my version' }).click(); await expect.poll(() => state.draft.bio).toBe('Recovered private work.');
});
test('photo picker commits a selection, uses blank captions and restores focus on Escape', async ({ page }) => {
  await setup(page); await page.goto('/portfolio/manage'); const opener = page.getByRole('button', { name: 'Add photographs', exact: true }); await opener.click(); const picker = page.getByRole('dialog', { name: 'Add photographs' }); await expect(picker.getByRole('button', { name: 'Close photograph picker' })).toBeFocused(); await page.keyboard.press('Escape'); await expect(opener).toBeFocused(); await opener.click(); await picker.getByRole('button', { name: /Ada birthday/ }).click(); await picker.getByRole('button', { name: /DSC_1088/ }).click(); await picker.getByRole('button', { name: 'Add selected photographs' }).click(); await expect(page.locator('.v-pedit-photo')).toHaveCount(5); await page.getByRole('button', { name: 'Edit photograph 5', exact: true }).click(); await expect(page.getByLabel('Caption', { exact: true })).toHaveValue('');
});
test('accessible reorder and projects share the existing photographs', async ({ page }) => {
  const state = await setup(page); await page.goto('/portfolio/manage'); await page.getByRole('button', { name: 'Move photograph 1 later', exact: true }).click(); await expect.poll(() => state.draft.items[0].id).toBe('photo-1');
  await page.getByRole('button', { name: 'Projects', exact: true }).click(); await page.getByRole('button', { name: 'Add project' }).click(); const sheet = page.getByRole('dialog', { name: 'Project details' }); await sheet.getByLabel('Project title').fill('Ada’s portraits'); await sheet.locator('.v-pedit-project-photos button').first().click(); await sheet.getByRole('button', { name: 'Done', exact: true }).click(); await expect.poll(() => state.draft.projects.length).toBe(1); expect(state.draft.items.length).toBe(4); expect(state.draft.projects[0].photoIds).toEqual(['photo-1']);
});
test('pointer dragging reorders photographs and Escape cancels a keyboard drag', async ({ page }) => {
  const state = await setup(page); await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto('/portfolio/manage');
  const handle = page.getByRole('button', { name: 'Drag photograph 1 to reorder', exact: true }); const first = await handle.boundingBox(); const second = await page.locator('.v-pedit-photo').nth(1).boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down(); await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 15 }); await page.waitForTimeout(300); await page.mouse.up();
  await expect.poll(() => state.draft.items[0].id).toBe('photo-1');
  const order = state.draft.items.map(item => item.id); await page.getByRole('button', { name: 'Drag photograph 1 to reorder', exact: true }).focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape'); expect(state.draft.items.map(item => item.id)).toEqual(order);
});
test('removal repairs project selections and can be undone before publishing', async ({ page }) => {
  const draft = initial(); draft.projects = [{ id: 'project-one', title: 'Portraits', photoIds: ['photo-0', 'photo-1'], coverId: 'photo-0' }]; await setup(page, { draft }); await page.goto('/portfolio/manage'); await page.getByRole('button', { name: 'Select photograph 1', exact: true }).click(); await page.getByRole('button', { name: 'Remove selected' }).click(); await page.getByRole('dialog', { name: 'Remove from your draft?' }).getByRole('button', { name: 'Remove', exact: true }).click(); await expect(page.locator('.v-pedit-photo')).toHaveCount(3); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.v-pedit-photo')).toHaveCount(4);
});
test('editor and exact-width previews fit phones, tablets and desktops', async ({ page }) => {
  test.setTimeout(90000); await setup(page);
  for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 400 ? 720 : 900 }); await page.goto('/portfolio/manage'); await expect(page.locator('.v-pedit-photo')).toHaveCount(4); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `editor ${width}`).toBe(true);
    await page.getByRole('button', { name: 'Preview', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Preview your portfolio' }); await dialog.getByRole('button', { name: 'Tablet', exact: true }).click(); await expect(dialog.locator('.v-pedit-preview-scroll>div')).toHaveCSS('width', '834px'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `preview ${width}`).toBe(true); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  }
});
test('public filters scope the lightbox, restore focus and respect browser Back', async ({ page }) => {
  await setup(page); await page.goto('/@amara-studio'); await page.getByRole('button', { name: 'Weddings', exact: true }).click(); const photo = page.locator('.vpc-gallery button').first(); await photo.click(); const dialog = page.getByRole('dialog', { name: 'Photograph viewer' }); await expect(dialog).toBeVisible(); await expect(dialog.locator('figcaption')).toContainText('1 / 2'); await page.keyboard.press('ArrowRight'); await expect(dialog.locator('figcaption')).toContainText('2 / 2'); await page.goBack(); await expect(dialog).not.toBeVisible(); await expect(photo).toBeFocused(); expect(new URL(page.url()).pathname).toBe('/@amara-studio');
});
test('public project routes and normalized contact links use the current project', async ({ page }) => {
  const draft = initial(); draft.projects = [{ id: 'project-one', title: 'Ada’s portraits', description: 'A portrait session.', category: 'Portraits', coverId: 'photo-0', photoIds: ['photo-0', 'photo-1'] }]; await setup(page, { draft }); await page.goto('/@amara-studio'); await page.locator('.vpc-project-card').click(); await expect(page).toHaveURL(/projects\/project-one/); await expect(page.locator('.vpc-hero h1')).toHaveText('Ada’s portraits'); await uniquePhotographs(page, 2); const href = await page.locator('.vpc-contact-actions a[href*="wa.me"]').getAttribute('href'); expect(href).toContain('wa.me/2348012345678'); expect(decodeURIComponent(href)).toContain('/@amara-studio/projects/project-one'); await page.reload(); await expect(page.locator('.vpc-hero h1')).toHaveText('Ada’s portraits');
});
test('public portfolios fit 320px phones through wide desktop screens', async ({ page }) => {
  test.setTimeout(60000); await setup(page); for (const width of [320, 390, 768, 834, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.goto('/@amara-studio'); await uniquePhotographs(page, 4); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `public ${width}`).toBe(true); }
});
test('suggestions survive refresh, need review, and undo preserves later captions', async ({ page }) => {
  const state = await setup(page, { job: { _id: 'job-one', status: 'review', inputRevision: 1, result: { direction: { headline: 'Suggested headline', introLine: 'Suggested opening line', heroPublicId: photographs[1].publicId, orderedPublicIds: [photographs[1].publicId, photographs[0].publicId, photographs[2].publicId, photographs[3].publicId], background: 'ivory', layout: 'grid', designReason: 'A clear opening and a simple grid for these portraits.' } } } });
  await page.goto('/portfolio/manage'); await page.reload(); await page.getByRole('button', { name: 'Design', exact: true }).click(); await expect(page.getByText('Suggested headline', { exact: true })).toBeVisible(); expect(state.draft.headline).toBe('People, as they are.');
  await page.getByRole('button', { name: 'Use these suggestions' }).click(); await expect.poll(() => state.draft.headline).toBe('Suggested headline');
  await page.getByRole('button', { name: /^Work/ }).click(); await page.getByRole('button', { name: 'Edit photograph 1', exact: true }).click(); await page.getByLabel('Caption', { exact: true }).fill('My caption after the suggestions.'); await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.getByRole('button', { name: 'Undo suggestions' }).click();
  await expect.poll(() => state.draft.headline).toBe('People, as they are.'); await expect.poll(() => state.draft.items.find(item => item.id === 'photo-1').title).toBe('My caption after the suggestions.'); expect(state.draft.items[0].id).toBe('photo-0'); expect(state.publishes.length).toBe(0);
});

test('design previews are private until chosen and the chosen design survives publishing and refresh', async ({ page }) => {
  const state = await setup(page); await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: 'Portfolio design' }).getByRole('radio')).toHaveCount(4);
  await page.getByRole('button', { name: 'Preview Cinema', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Preview your portfolio' });
  await expect(preview.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', 'cinema');
  await preview.getByLabel('Preview design').selectOption('gallery');
  await expect(preview.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', 'gallery');
  expect(state.saves.length).toBe(0);
  await page.keyboard.press('Escape'); await page.getByRole('radio', { name: 'Folio design', exact: true }).check();
  await expect.poll(() => state.draft.direction.template).toBe('folio');
  expect(state.publishes.length).toBe(0);
  await page.reload(); await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Folio design', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Gallery design', exact: true }).check();
  await page.getByRole('radio', { name: 'Folio design', exact: true }).check();
  await page.reload(); await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Folio design', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Restore browser changes', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Publish changes' }).click();
  const confirm = page.getByRole('dialog', { name: 'Publish your portfolio' });
  await confirm.getByRole('checkbox').check(); await confirm.getByRole('button', { name: 'Publish now' }).click();
  await expect(confirm).toHaveCount(0); expect(state.publishes.length).toBe(1);
  await page.goto('/@amara-studio'); await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', 'folio');
});

for (const template of ['editorial', 'cinema', 'gallery', 'folio']) {
  test(`${template} has a distinct phone layout and fits phone, tablet and desktop widths`, async ({ page }) => {
    test.setTimeout(90000);
    const draft = initial(); draft.direction = { ...portfolioDesigns.find(design => design.id === template).defaults, template, motion: 'expressive' };
    draft.items.push(...['demo-sharon-2', 'demo-courage-2'].map((asset, index) => ({ ...photographs[index], id: `photo-${index + 4}`, publicId: `studio/photo-${index + 4}`, title: `Portrait ${index + 5}`, url: `/veylo/web/${asset}-960.webp`, thumbnailUrl: `/veylo/web/${asset}-480.webp` })));
    draft.projects = [{ id: 'project-one', title: 'Ada’s portraits', description: 'A portrait session in Lagos.', category: 'Portraits', coverId: 'photo-0', photoIds: ['photo-0', 'photo-1'] }];
    await setup(page, { draft }); await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 834, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto('/@amara-studio');
      await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', template);
      await uniquePhotographs(page, 6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${template} at ${width}`).toBe(true);
      if (width === 390) {
        const boxes = await page.locator('.vpc-gallery > figure').evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, width: node.getBoundingClientRect().width })));
        if (template === 'cinema') { const rail = page.getByRole('region', { name: 'Main gallery photographs', exact: true }); await expect(rail).toBeVisible(); expect((await rail.getByRole('button').first().boundingBox()).width).toBeGreaterThan(250); }
        if (template === 'editorial' || template === 'gallery') { expect(boxes[1].width).toBeLessThan(180); expect(boxes[2].x).toBeGreaterThan(boxes[1].x); }
        if (template === 'gallery') expect(await page.locator('.vpc-gallery > figure button').first().evaluate(node => parseFloat(getComputedStyle(node).paddingLeft))).toBeGreaterThan(0);
        if (template === 'folio') {
          await expect(page.locator('.vpc-companion')).toBeVisible();
          expect(await page.locator('.vpc-work').evaluate(node => node.compareDocumentPosition(document.querySelector('.vpc-projects')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
        }
        await captureDesign(page, `${template}-390`);
      }
      if (width === 834 || width === 1440) await captureDesign(page, `${template}-${width}`);
      await expect(page.locator('.vpc-categories').getByRole('button', { name: 'All', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Selected work', exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Explore the work', exact: true })).toHaveCount(0);
      await expect(page.locator('.vpc-main')).not.toContainText(/\b\d+\s+(photographs|collections)\b/);
      await page.getByRole('button', { name: 'Weddings', exact: true }).click();
      await uniquePhotographs(page, 2);
      expect(await page.locator('.vpc-main img[data-photo-id]').evaluateAll(nodes => nodes.map(node => node.dataset.photoId).sort())).toEqual(['photo-2', 'photo-3']);
      await expect(page.locator('.vpc-project-card')).toHaveCount(0);
      await expect(page.locator('.vpc-hero h1')).toHaveText('Weddings');
      await expect(page.getByText(draft.headline, { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Portraits', exact: true }).click();
      await uniquePhotographs(page, 4);
    }
    await page.locator('.vpc-project-card').click(); await expect(page).toHaveURL(/projects\/project-one/);
    await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', template);
    await expect(page.locator('.vpc-hero h1')).toHaveText('Ada’s portraits');
    await uniquePhotographs(page, 2);
  });
}

test('cinema category strips support keyboard navigation, scoped viewing and reduced motion', async ({ page }) => {
  const draft = initial(); draft.direction = { ...portfolioDesigns.find(design => design.id === 'cinema').defaults, template: 'cinema', motion: 'expressive' };
  draft.items.push({ ...photographs[2], id: 'photo-4', publicId: 'studio/photo-4', title: 'Wedding portrait' }); await setup(page, { draft });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/@amara-studio');
  await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-motion', 'expressive');
  await uniquePhotographs(page, 5);
  await page.getByRole('button', { name: 'Weddings', exact: true }).click();
  await expect(page.locator('.vpc-cover')).toHaveCount(0);
  await uniquePhotographs(page, 3);
  const rail = page.getByRole('region', { name: 'Weddings photographs', exact: true });
  await rail.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Previous weddings', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next weddings', exact: true })).toBeEnabled();
  await rail.getByRole('button').nth(1).click();
  const lightbox = page.getByRole('dialog', { name: 'Photograph viewer' }); await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('figcaption')).toContainText('2 / 3');
  await page.keyboard.press('Escape'); await expect(lightbox).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-motion', 'still');
  await expect(page.locator('.vpc-filmstrip-photo').first()).toHaveCSS('transition-duration', '0s');
});

test('design picker and preview controls fit a small phone and both tablet widths', async ({ page }) => {
  const state = await setup(page); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/portfolio/manage'); await page.getByRole('button', { name: 'Design', exact: true }).click();
    await page.getByRole('radio', { name: 'Editorial design', exact: true }).check();
    await expect.poll(() => state.draft.direction.template || 'editorial').toBe('editorial');
    await expect(page.getByRole('radio', { name: 'Cinema design', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `design picker at ${width}`).toBe(true);
    if (width === 390 || width === 1440) await captureDesign(page, `picker-${width}`);
    await page.getByRole('button', { name: 'Preview Cinema', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Preview your portfolio' });
    await preview.getByRole('button', { name: 'Tablet', exact: true }).click();
    await expect(preview.locator('.v-pedit-preview-scroll > div')).toHaveCSS('width', '834px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `design preview at ${width}`).toBe(true);
    await preview.getByRole('button', { name: 'Use Cinema design', exact: true }).click(); await expect(preview).toHaveCount(0);
    await expect.poll(() => state.draft.direction.template).toBe('cinema');
  }
});

async function uniquePhotographs(page, count) {
  const images = page.locator('.vpc-main img[data-photo-id]');
  await expect(images).toHaveCount(count);
  const ids = await images.evaluateAll(nodes => nodes.map(node => node.dataset.photoId));
  expect(new Set(ids).size).toBe(count);
}

test('categories can be created, assigned, renamed, and removed without deleting photographs', async ({ page }) => {
  const state = await setup(page); await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  let sheet = page.getByRole('dialog', { name: 'New category', exact: true });
  await sheet.getByLabel('Category name', { exact: true }).fill('Birthdays');
  await sheet.getByRole('button', { name: 'Group photograph 2', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect.poll(() => state.draft.items[1].category).toBe('Birthdays');
  await expect.poll(() => state.draft.categories.includes('Birthdays')).toBe(true);
  await page.reload(); await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Birthdays category', exact: true }).click();
  sheet = page.getByRole('dialog', { name: 'Edit category', exact: true });
  await sheet.getByLabel('Category name', { exact: true }).fill('Weddings');
  await sheet.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText('That category already exists. Choose a different name.');
  await sheet.getByLabel('Category name', { exact: true }).fill('Milestones');
  await sheet.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect.poll(() => state.draft.items[1].category).toBe('Milestones');
  await page.getByRole('button', { name: /^Work/ }).click();
  await page.getByRole('button', { name: 'Select photograph 1', exact: true }).click();
  await page.getByLabel('Category for selected photographs', { exact: true }).selectOption('Milestones');
  await page.getByRole('button', { name: 'Apply category', exact: true }).click();
  await expect.poll(() => state.draft.items[0].category).toBe('Milestones');
  await page.getByRole('button', { name: 'Edit photograph 3', exact: true }).click();
  await page.getByRole('dialog', { name: 'Photograph details' }).getByLabel('Category', { exact: true }).selectOption('Milestones');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => state.draft.items[2].category).toBe('Milestones');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Preview your portfolio' });
  await preview.getByRole('button', { name: 'Milestones', exact: true }).click();
  await expect(preview.locator('.vpc-gallery > figure')).toHaveCount(3);
  await uniquePhotographs(page, 3);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Milestones category', exact: true }).click();
  await page.getByRole('dialog', { name: 'Remove category?' }).getByRole('button', { name: 'Remove category', exact: true }).click();
  await expect.poll(() => state.draft.items[0].category).toBe('Selected work');
  expect(state.draft.items.length).toBe(4);
  expect(state.draft.categories).not.toContain('Milestones');
  expect(state.publishes.length).toBe(0);
});

test('main-gallery choices survive publication without changing category membership or leaving an excluded cover', async ({ page }) => {
  const state = await setup(page); await page.goto('/portfolio/manage');
  await page.getByRole('button', { name: 'Edit photograph 1', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Photograph details' });
  await details.getByRole('checkbox', { name: 'Show in main gallery', exact: true }).uncheck();
  await expect(details.getByRole('button', { name: 'Use as cover', exact: true })).toBeDisabled();
  await details.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => state.draft.items[0].featured).toBe(false);
  expect(state.draft.items[0].category).toBe('Portraits');
  expect(state.draft.heroPublicId).toBe(photographs[1].publicId);
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Publish your portfolio' });
  await confirmation.getByRole('checkbox').check();
  await confirmation.getByRole('button', { name: 'Publish now', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await page.goto('/@amara-studio');
  await uniquePhotographs(page, 3);
  await expect(page.locator('.vpc-cover img')).toHaveAttribute('data-photo-id', 'photo-1');
  await page.getByRole('button', { name: 'Portraits', exact: true }).click();
  await uniquePhotographs(page, 2);
  expect(await page.locator('.vpc-main img[data-photo-id]').evaluateAll(nodes => nodes.map(node => node.dataset.photoId).sort())).toEqual(['photo-0', 'photo-1']);
});

test('category editor and membership controls fit small phones and tablets', async ({ page }) => {
  await setup(page); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 834, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 800 }); await page.goto('/portfolio/manage');
    await page.getByRole('button', { name: 'Categories', exact: true }).click();
    await expect(page.locator('.v-pcategory-card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Edit Portraits category', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit category', exact: true });
    await expect(sheet.getByRole('button', { name: 'Save category', exact: true })).toBeVisible();
    const saveButton = await sheet.getByRole('button', { name: 'Save category', exact: true }).boundingBox();
    expect(saveButton.y).toBeGreaterThan(0);
    expect(saveButton.y + saveButton.height).toBeLessThanOrEqual(page.viewportSize().height - 12);
    expect(await sheet.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Edit Portraits category', exact: true })).toBeFocused();
  }
});

test('public Portfolio examples use all four real designs and support browsing without leaving the sample', async ({ page }) => {
  test.setTimeout(90000); await setup(page); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/portfolio');
    const designs = page.getByRole('group', { name: 'Sample portfolio design' });
    for (const design of portfolioDesigns) {
      await designs.getByRole('button', { name: new RegExp('^' + design.name) }).click();
      await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', design.id);
      await uniquePhotographs(page, 8);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.v-portfolio-canvas').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await page.getByRole('navigation', { name: 'Sample screen size' }).getByRole('button', { name: 'Phone', exact: true }).click();
    await expect(page.locator('.v-portfolio-showcase-screen')).toHaveCSS('width', '390px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('.vpc-project-card').click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.locator('.vpc-hero h1')).toHaveText('Folake & Tunde');
  await uniquePhotographs(page, 3);
  await page.getByRole('button', { name: 'Back to portfolio', exact: true }).click();
  await page.locator('.vpc-categories').getByRole('button', { name: 'Weddings', exact: true }).click();
  await expect(page.locator('.vpc-work-group')).toHaveCount(1);
  await expect(page.locator('.vpc-group-heading')).toHaveCount(0);
  await expect(page.locator('.vpc-hero h1')).toHaveText('Weddings');
  await expect(page.locator('.vpc-cover')).toHaveCount(0);
  await page.locator('.vpc-gallery button').first().click();
  const viewer = page.getByRole('dialog', { name: 'Photograph viewer' });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('figcaption')).toContainText('1 / 3');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/portfolio$/);
});

test('main photographs come first and categories do not repeat the welcome or force their photographs into the main gallery', async ({ page }) => {
  test.setTimeout(60000);
  const draft = initial(); draft.items[0].category = 'Selected work'; draft.items[1].category = '';
  draft.headline = 'Welcome to Veylo Media';
  draft.introLine = draft.headline; draft.bio = `${draft.headline}.`;
  draft.items.push({ ...photographs[2], id: 'photo-4', publicId: 'studio/category-only', featured: false, url: '/veylo/web/demo-wedding-3-960.webp' }, { ...photographs[0], id: 'photo-5', publicId: 'studio/hidden', featured: false, category: 'Selected work' });
  const state = await setup(page, { draft }); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const design of portfolioDesigns) {
    state.draft.direction = { ...design.defaults, template: design.id };
    await page.goto('/@amara-studio');
    const categories = page.getByRole('navigation', { name: 'Choose a category' });
    await expect(categories.getByRole('button')).toHaveText(['Weddings']);
    await uniquePhotographs(page, 4);
    expect(await page.locator('.vpc-main img[data-photo-id]').evaluateAll(nodes => nodes.map(node => node.dataset.photoId).sort())).toEqual(['photo-0', 'photo-1', 'photo-2', 'photo-3']);
    await expect(page.locator('.vpc-hero h1')).toHaveText(draft.headline);
    expect(await page.locator('.vpc-main').innerText()).toMatch(/Welcome to Veylo Media/);
    expect((await page.locator('.vpc-main').innerText()).match(/Welcome to Veylo Media/g)).toHaveLength(1);
    expect(await page.locator('.vpc-work').evaluate(node => node.compareDocumentPosition(document.querySelector('.vpc-category-browser')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    await expect(page.locator('.vpc-hero')).not.toContainText(draft.location);
    await expect(page.locator('.vpc-contact')).toContainText(draft.location);
    await page.locator('.vpc-cover button').click();
    const viewer = page.getByRole('dialog', { name: 'Photograph viewer' });
    await expect(viewer.locator('figcaption')).toContainText('1 / 4 · Main gallery');
    await page.keyboard.press('Escape');
    await categories.getByRole('button', { name: 'Weddings', exact: true }).click();
    await uniquePhotographs(page, 3);
    expect(await page.locator('.vpc-main img[data-photo-id]').evaluateAll(nodes => nodes.map(node => node.dataset.photoId).sort())).toEqual(['photo-2', 'photo-3', 'photo-4']);
    await expect(page.locator('.vpc-hero h1')).toHaveText('Weddings');
    await expect(page.locator('.vpc-hero h1')).toBeFocused();
    await expect(page.locator('.vpc-main')).not.toContainText(draft.headline);
    await expect(page.locator('.vpc-main')).not.toContainText('Selected work');
    await expect(page.locator('.vpc-main')).not.toContainText('Explore the work');
    await page.locator('.vpc-photo button, .vpc-filmstrip-photo').first().click();
    await expect(viewer.locator('figcaption')).toContainText('1 / 3 · Weddings');
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('figcaption')).toContainText('2 / 3 · Weddings');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Back to main gallery', exact: true }).click();
    await uniquePhotographs(page, 4);
    await expect(page.locator('.vpc-hero h1')).toHaveText(draft.headline);
    await expect(categories.getByRole('button', { name: 'Weddings', exact: true })).toBeFocused();
  }
});

test('excluded project covers stay out of the main gallery and studio copy appears once', async ({ page }) => {
  const draft = initial(); draft.heroPublicId = photographs[2].publicId;
  draft.items[2].featured = false;
  draft.projects = [{ id: 'wedding-one', title: 'Wedding portraits', category: 'Weddings', photoIds: ['photo-2', 'photo-3'], coverId: 'photo-2' }];
  await setup(page, { draft });
  await page.goto('/@amara-studio');
  await expect(page.locator('.vpc-cover img')).toHaveAttribute('data-photo-id', 'photo-0');
  await uniquePhotographs(page, 3);
  await expect(page.getByText(draft.introLine, { exact: true })).toHaveCount(1);
  await expect(page.getByText(draft.location, { exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Ask about a shoot', exact: true })).toHaveCount(1);
});

test('matching introduction and bio are shown once while a distinct studio bio respects its visibility setting', async ({ page }) => {
  const draft = initial(); draft.bio = draft.introLine;
  const state = await setup(page, { draft }); await page.goto('/@amara-studio');
  await expect(page.getByText(draft.introLine, { exact: true })).toHaveCount(1);
  await expect(page.locator('.vpc-contact-bio')).toHaveCount(0);
  state.draft.bio = 'Based in Lagos, photographing weddings across Nigeria since 2018.';
  await page.reload();
  await expect(page.locator('.vpc-contact-bio')).toHaveText(state.draft.bio);
  state.draft.direction.showBio = false;
  await page.reload();
  await expect(page.locator('.vpc-contact-bio')).toHaveCount(0);
  await expect(page.getByText(draft.introLine, { exact: true })).toHaveCount(1);
});
