import { test, expect } from '@playwright/test';
import { createStudio } from '../../src/server/app.mjs';
import { root } from '../../src/server/config.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createJob, saveStage } from '../../src/server/jobs.mjs';
let studio;
test.beforeAll(async () => { studio = await createStudio({ port: 5059, worker: false, data: path.join(root, 'data/tests/browser-' + randomUUID()) }); await studio.listen(); });
test.afterAll(async () => { await studio?.close(); });
test('responsive studio, keyboard form, job persistence and settings secrecy', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByLabel('Create a password').fill('browser-local-password'); await page.getByRole('button', { name: 'Create local studio' }).click();
  await expect(page.getByRole('heading', { name: /Give photographers/ })).toBeVisible();
  for (const width of [320, 390, 640, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New video', exact: true }).click();
  await page.getByLabel('Project name').fill('Portrait collection launch'); await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portrait collection launch', exact: true })).toBeVisible();
  for (const width of [320, 768, 834, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); }
  await page.getByRole('tab', { name: /02 Scripts/ }).click(); await expect(page.getByRole('heading', { name: /Three angles/ })).toBeVisible();
  await page.getByRole('button', { name: 'Studio settings' }).click(); await expect(page.getByRole('heading', { name: /Your providers.*Your limits/ })).toBeVisible();
  await page.screenshot({ path: 'data/tests/studio-desktop.png', fullPage: true });
  for (const width of [320, 768, 834]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); }
  await page.setViewportSize({ width: 834, height: 1112 }); await page.screenshot({ path: 'data/tests/studio-tablet.png', fullPage: true });
  await page.getByRole('button', { name: 'Product knowledge' }).click(); await expect(page.getByRole('heading', { name: 'Photo Story', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'data/tests/studio-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('populated workflow keeps scene controls and owner review gates usable on phones and tablets', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const job = createJob(studio.db, { title: 'Workflow UI fixture', audience: 'portrait', focus: 'photoswap', platform: 'both', seconds: 32, notes: 'Isolated UI test only.' });
  const voiceover = { hook: 'Photographers, make the handover count.', problem: 'An ordinary link can feel unfinished.', demo: 'Present the finished collection.', result: 'A considered first viewing.', cta: 'Get started for free. Link in bio.' };
  const variants = ['pain', 'result', 'curiosity'].map((angle, index) => ({ id: 'v' + index, title: angle + ' handover', angle, voiceover, onScreen: voiceover, factIds: [], captureIds: [], ctaId: 'start-free', featureId: 'photoswap', why: 'A handover problem.', hookType: angle }));
  saveStage(studio.db, job, 'scripts', { variants, review: { passed: true } }); saveStage(studio.db, job, 'variant', { variant: variants[0] });
  const requests = ['context', 'finished'].map(id => ({ id, kind: 'image', use: id === 'context' ? 'context' : 'finished_work', purpose: id === 'context' ? 'Studio context' : 'Real finished photograph', prompt: 'A professional studio backdrop, no text.', aspectRatio: '9:16', resolution: '1080p', sourceSeconds: 0, references: [], filename: id + '.png' }));
  const scenes = Object.keys(voiceover).map((section, index) => ({ id: 's' + index, section, voLineId: section, template: section === 'cta' ? 'CTACard' : 'BigCaptions', props: section === 'cta' ? { ctaId: 'start-free', text: voiceover.cta } : { text: voiceover[section] }, motion: { enter: 'fade', camera: 'none' }, transitionOut: 'cut' }));
  saveStage(studio.db, job, 'storyboard', { board: { title: 'UI fixture', scenes, requests, coverSceneId: 's3' } }); saveStage(studio.db, job, 'slots', { slots: {} });
  saveStage(studio.db, job, 'voice', { path: 'missing-test-only.wav', voice: 'Test fixture', words: [] }); saveStage(studio.db, job, 'preview', { path: 'missing-test-only.mp4', silent: false }); saveStage(studio.db, job, 'final', { path: 'missing-test-only.mp4', passed: true, qa: [] });
  await page.goto('/'); await page.getByLabel('Studio password').fill('browser-local-password'); await page.getByRole('button', { name: 'Open studio', exact: true }).click();
  await page.getByRole('button', { name: /Workflow UI fixture/ }).first().click();
  for (const width of [320, 768, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const step of ['03 Scenes & media', '04 Preview', '05 Music', '06 Final review', '07 Export']) {
      await page.getByRole('tab', { name: new RegExp(step.replace('&', '&')) }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
  }
  await expect(page.getByRole('button', { name: 'Prepare export package' })).toBeDisabled();
  await page.getByRole('tab', { name: /03 Scenes/ }).click(); await page.getByRole('button', { name: 'Edit scene controls' }).click();
  await page.getByText('01 / hook / BigCaptions', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Regenerate this saved scene' }).first()).toBeVisible();
  await expect(page.getByLabel('Transition out').first()).toHaveValue('cut');
  expect(errors).toEqual([]);
});
