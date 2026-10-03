import { expect } from '@playwright/test';

export async function completePresentation(view, format) {
  const galleryButton = view.getByRole('button', { name: format === 'photo-story' ? 'Open gallery' : 'Open full gallery', exact: true }).first();
  if (await galleryButton.isVisible()) return;
  if (format === 'photo-story') {
    await expect(view.locator('.v-story-cover,.v-story-frame-count').first()).toBeVisible();
    const begin = view.getByRole('button', { name: 'Begin the story', exact: true });
    if (!await view.locator('.v-story-frame-count').count()) await begin.click();
    const resume = view.getByRole('button', { name: 'Resume story', exact: true });
    if (await resume.isVisible()) await resume.click();
    const counter = view.locator('.v-story-frame-count');
    await expect(counter).toBeVisible();
    const [, current, total] = (await counter.getAttribute('aria-label')).match(/Photograph (\d+) of (\d+)/);
    for (let at = Number(current); at < Number(total); at++) {
      await view.getByRole('button', { name: 'Next photograph', exact: true }).click();
      await expect(counter).toHaveAttribute('aria-label', `Photograph ${at + 1} of ${total}`);
    }
    await expect(view.getByRole('button', { name: 'Open gallery', exact: true })).toBeVisible({ timeout: 15000 });
  } else if (format === 'album') {
    await expect(view.locator('.pv-album-page')).toBeVisible();
    await view.getByRole('button', { name: 'Pages', exact: true }).click();
    const count = await view.locator('.pv-overview>button').count();
    await view.getByRole('button', { name: 'Close pages', exact: true }).click();
    for (let at = 1; at < count; at++) {
      await view.getByRole('button', { name: 'Pages', exact: true }).click();
      await view.locator('.pv-overview>button').nth(at).click();
      await expect(view.locator('.pv-album-toolbar>span')).toHaveText(String(at+1).padStart(2,'0')+' / '+String(count).padStart(2,'0'));
      await expect(view.locator('.pv-album-page')).toHaveAttribute('aria-busy','false');
      await view.locator('.pv-spread-end').scrollIntoViewIfNeeded();
      await expect.poll(async () => parseInt(await view.locator('.pv-album-navigation>span').textContent(),10)).toBeGreaterThanOrEqual(at);
    }
    await expect(view.getByRole('button', { name: 'Open full gallery', exact: true }).first()).toBeVisible();
  } else if (format === 'chapters') {
    const room = view.locator('.pv-chapter-room');
    if (await room.count()) await room.getByRole('button', { name: 'Chapters', exact: true }).click();
    const directory=view.locator('.pv-chapter-cover');
    await expect(directory.first()).toBeVisible();
    const count=await directory.count();
    for(let at=0;at<count;at++){
      await directory.nth(at).click();
      await view.locator('.pv-room-footer').scrollIntoViewIfNeeded();
      await expect.poll(async () => parseInt(await view.locator('.pv-intro small').textContent(),10)).toBeGreaterThanOrEqual(at+1);
      await view.locator('.pv-room-tools').getByRole('button', { name: 'Chapters', exact: true }).click();
    }
    await expect(view.getByRole('button', { name: 'Open full gallery', exact: true }).first()).toBeVisible();
  } else if (format === 'photo-reveal') {
    await expect(view.locator('.rv-opening,.rv-position').first()).toBeVisible();
    const begin = view.getByRole('button', { name: 'Begin reveal', exact: true });
    if (await begin.isVisible()) await begin.click();
    const counter = view.locator('.rv-position');
    await expect(counter).toBeVisible();
    const [, current, total] = (await counter.getAttribute('aria-label')).match(/Photograph (\d+) of (\d+)/);
    for (let at = Number(current); at < Number(total); at++) {
      await view.getByRole('button', { name: 'Reveal next photo', exact: true }).click();
      await expect(counter).toHaveAttribute('aria-label', `Photograph ${at + 1} of ${total}`);
    }
    await view.getByRole('button', { name: 'Complete reveal', exact: true }).click();
  } else {
    const ending = { editorial: '.ed-closing', 'event-coverage': '.pv-ending', campaign: '.pv-ending' }[format];
    if (ending) {
      await view.locator(ending).scrollIntoViewIfNeeded();
      await expect(view.getByRole('button', { name: 'Open full gallery', exact: true }).first()).toBeVisible();
    }
  }
}

export async function openPresentationGallery(view, format) {
  await completePresentation(view, format);
  await view.getByRole('button', { name: format === 'photo-story' ? 'Open gallery' : 'Open full gallery', exact: true }).first().click();
}
