import { expect, test } from '@playwright/test';
import { portfolioDesigns } from '../src/components/portfolioDesigns.js';
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
    if (path.includes('/portfolios/public/') && !path.endsWith('/engagement')) { const publicData = { ...state.draft, heroId: state.draft.items.find(item => item.publicId === state.draft.heroPublicId)?.id, items: state.draft.items.map(({ publicId, ...photo }) => photo) }; return reply({ success: true, data: publicData }); }
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
  const draft = initial(); draft.projects = [{ id: 'project-one', title: 'Ada’s portraits', description: 'A portrait session.', category: 'Portraits', coverId: 'photo-0', photoIds: ['photo-0', 'photo-1'] }]; await setup(page, { draft }); await page.goto('/@amara-studio'); await page.locator('.vpc-project-card').click(); await expect(page).toHaveURL(/projects\/project-one/); await expect(page.locator('.vpc-hero h1')).toHaveText('Ada’s portraits'); await expect(page.locator('.vpc-gallery>figure')).toHaveCount(2); const href = await page.locator('.vpc-contact-actions a[href*="wa.me"]').getAttribute('href'); expect(href).toContain('wa.me/2348012345678'); expect(decodeURIComponent(href)).toContain('/@amara-studio/projects/project-one'); await page.reload(); await expect(page.locator('.vpc-hero h1')).toHaveText('Ada’s portraits');
});
test('public portfolios fit 320px phones through wide desktop screens', async ({ page }) => {
  test.setTimeout(60000); await setup(page); for (const width of [320, 390, 768, 834, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.goto('/@amara-studio'); await expect(page.locator('.vpc-gallery>figure')).toHaveCount(4); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `public ${width}`).toBe(true); }
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
    draft.projects = [{ id: 'project-one', title: 'Ada’s portraits', description: 'A portrait session in Lagos.', category: 'Portraits', coverId: 'photo-0', photoIds: ['photo-0', 'photo-1'] }];
    await setup(page, { draft }); await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 834, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto('/@amara-studio');
      await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', template);
      await expect(page.locator('.vpc-gallery > figure')).toHaveCount(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${template} at ${width}`).toBe(true);
      if (width === 390) {
        const boxes = await page.locator('.vpc-gallery > figure').evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, width: node.getBoundingClientRect().width })));
        if (template === 'cinema') { expect(boxes[0].width).toBeGreaterThan(300); await expect(page.getByRole('region', { name: 'Featured photographs', exact: true })).toBeVisible(); }
        if (template === 'editorial' || template === 'gallery') { expect(boxes[1].width).toBeLessThan(180); expect(boxes[2].x).toBeGreaterThan(boxes[1].x); }
        if (template === 'gallery') expect(await page.locator('.vpc-gallery > figure button').first().evaluate(node => parseFloat(getComputedStyle(node).paddingLeft))).toBeGreaterThan(0);
        if (template === 'folio') {
          await expect(page.locator('.vpc-companion')).toBeVisible();
          expect(await page.locator('.vpc-projects').evaluate(node => node.compareDocumentPosition(document.querySelector('.vpc-work')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
        }
        await captureDesign(page, `${template}-390`);
      }
      if (width === 834 || width === 1440) await captureDesign(page, `${template}-${width}`);
    }
    await page.locator('.vpc-project-card').click(); await expect(page).toHaveURL(/projects\/project-one/);
    await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-design', template);
    await expect(page.locator('.vpc-hero h1')).toHaveText('Ada’s portraits');
    await expect(page.locator('.vpc-gallery > figure')).toHaveCount(2);
  });
}

test('cinema filmstrip supports keyboard navigation, scoped viewing and reduced motion', async ({ page }) => {
  const draft = initial(); draft.direction = { ...portfolioDesigns.find(design => design.id === 'cinema').defaults, template: 'cinema', motion: 'expressive' }; await setup(page, { draft });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/@amara-studio');
  await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-motion', 'expressive');
  await page.getByRole('button', { name: 'Next cover photograph', exact: true }).click();
  await expect(page.locator('.vpc-cinema-switch')).toContainText('02 / 04');
  await expect(page.locator('.vpc-cinema-stage').getByRole('button', { name: 'View Portrait 2', exact: true })).toBeVisible();
  const rail = page.getByRole('region', { name: 'Featured photographs', exact: true });
  await rail.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('.vpc-filmstrip-top')).toContainText('02 / 04');
  await rail.getByRole('button').nth(1).click();
  const lightbox = page.getByRole('dialog', { name: 'Photograph viewer' }); await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('figcaption')).toContainText('2 / 4');
  await page.keyboard.press('Escape'); await expect(lightbox).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.v-portfolio-canvas')).toHaveAttribute('data-motion', 'still');
  await expect(page.locator('.vpc-hero-contact')).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.vpc-gallery > figure').last()).toHaveCSS('opacity', '1');
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
