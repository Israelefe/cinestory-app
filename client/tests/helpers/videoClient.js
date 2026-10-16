import { expect } from '@playwright/test';

export async function chooseVideoFilm(page, name) {
  const sidebar = page.getByRole('complementary', { name: 'Films in this delivery' });
  if (await sidebar.isVisible()) {
    await sidebar.getByRole('button', { name }).click();
    return;
  }
  await page.getByRole('button', { name: 'Choose a film', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a film', exact: true });
  await dialog.getByRole('button', { name }).click();
  await expect(dialog).toHaveCount(0);
}

export async function showVideoControls(page) {
  await page.locator('.vv-playback').focus();
}

export async function openVideoQuality(page) {
  await showVideoControls(page);
  const button = page.getByRole('button', { name: 'Playback settings', exact: true });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await expect(page.getByRole('combobox', { name: 'Playback quality' })).toBeVisible();
}
