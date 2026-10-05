import { expect } from '@playwright/test';

export async function completePresentation(view, format) {
  if (format === 'editorial') {
    const button = view.getByRole('button', { name: 'View full gallery', exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeEnabled();
    return;
  }
  const galleryButton = view.getByRole('button', { name: format === 'photo-story' ? 'Open gallery' : 'Open full gallery', exact: true });
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
    await expect(view.locator('.fd-album-cover,.fd-album-reader').first()).toBeVisible();
    const begin = view.getByRole('button', { name: 'Open album', exact: true });
    if (await begin.isVisible()) await begin.click();
    const dots = view.getByRole('button', { name: /^Open album page \d+$/ });
    const count = await dots.count();
    for (let at = 0; at < count; at++) {
      await dots.nth(at).click();
      await expect(view.locator(`.fd-album-stage>[data-spread-index="${at}"] .fd-album-spread`)).toBeVisible();
    }
    if (!count) {
      const next = view.getByRole('button', { name: 'Next page', exact: true });
      while (await next.isEnabled()) { await next.click(); await expect(view.locator('.fd-album-spread')).toHaveCount(1); }
    }
    await expect(view.getByRole('button', { name: 'Open full gallery', exact: true })).toBeVisible();
  } else if (format === 'chapters') {
    await expect(view.locator('.fd-chapter-directory-board,.fd-chapter-room').first()).toBeVisible();
    const directory = view.locator('.fd-chapter-directory-board>button');
    const count = await directory.count() || await view.locator('.fd-chapter-room-copy nav button').count();
    if (!await directory.count()) await view.locator('.fd-chapter-room-copy>button').click();
    for (let at = 0; at < count; at++) {
      await directory.nth(at).click();
      await expect(view.locator('.fd-chapter-room-count')).toHaveText(`0${at + 1} / 0${count}`);
      await view.locator('.fd-chapter-room-art>footer').scrollIntoViewIfNeeded();
      await expect(view.locator('.fd-chapter-room')).toHaveAttribute('data-chapter-explored', 'true');
      await view.locator('.fd-chapter-room-art>footer').getByRole('button', { name: 'All chapters', exact: true }).click();
      await expect(directory.nth(at)).toHaveClass(/is-visited/);
    }
    await expect(view.getByRole('button', { name: 'Open full gallery', exact: true })).toBeVisible();
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
    const ending = { editorial: '.ed-closing', 'event-coverage': '.vec-event-close', campaign: '.vec-campaign-handoff' }[format];
    if (ending) {
      await view.locator(ending).scrollIntoViewIfNeeded();
      await expect(view.getByRole('button', { name: 'Open full gallery', exact: true })).toBeVisible();
    }
  }
}

export async function openPresentationGallery(view, format) {
  await completePresentation(view, format);
  await view.getByRole('button', { name: format === 'photo-story' ? 'Open gallery' : format === 'editorial' ? 'View full gallery' : 'Open full gallery', exact: true }).click();
}
