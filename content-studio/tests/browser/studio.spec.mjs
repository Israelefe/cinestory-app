import { test, expect } from '@playwright/test';
import { createStudio } from '../../src/server/app.mjs';
import { root } from '../../src/server/config.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createJob, saveStage, getJob } from '../../src/server/jobs.mjs';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { run, tool } from '../../src/server/media.mjs';
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

test('Google Flow clip uploads with its original filename through bulk and scene controls', async ({ page }) => {
  const job = createJob(studio.db, { title: 'Flow filename upload', audience: 'studio', focus: 'photoswap', platform: 'both', seconds: 32, notes: '' });
  const request = { id: 'studio-context', kind: 'video', use: 'context', purpose: 'Studio owner planning a handover', prompt: 'A professional studio context clip.', aspectRatio: '9:16', resolution: '1080p', sourceSeconds: 4, references: [], filename: 'studio-context.mp4' };
  saveStage(studio.db, job, 'storyboard', { board: { title: job.title, scenes: [], requests: [request], coverSceneId: '' } }, 'images_requested');
  saveStage(studio.db, job, 'slots', { slots: {} });
  const clip = path.join(studio.config.data, 'temp/flow-upload.mp4');
  const source = path.join(studio.config.data, 'temp/flow-upload.png');
  await sharp({ create: { width: 540, height: 960, channels: 3, background: '#282828' } }).png().toFile(source);
  await run(tool('ffmpeg'), ['-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', source, '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
  const file = { name: 'Studio_owner_planning_video_clip_20261013021253.mp4', mimeType: 'video/mp4', buffer: await fs.readFile(clip) };
  await page.goto('/'); await page.getByLabel('Studio password').fill('browser-local-password'); await page.getByRole('button', { name: 'Open studio', exact: true }).click();
  await page.getByRole('button', { name: /Flow filename upload/ }).first().click();
  await page.getByRole('tab', { name: /03 Scenes/ }).click();
  await page.locator('.slot-upload input[type=file]').setInputFiles(file);
  await expect(page.locator('.slot-card video')).toBeVisible();
  let saved = getJob(studio.db, job.id), entry = saved.artifacts.slots.slots[request.id];
  expect(entry.assetId).toBeTruthy(); expect(entry.attempts).toBe(1);
  expect(entry.review).toBe('approved'); expect(saved.state).toBe('images_ready');
  const stored = studio.db.prepare('SELECT name,metadata FROM assets WHERE id=?').get(entry.assetId);
  expect(stored.name).toBe(file.name); expect(JSON.parse(stored.metadata).slotId).toBe(request.id);
  expect(JSON.parse(stored.metadata).prompt).toBe(request.prompt);
  expect(JSON.parse(stored.metadata).ownerSelected).toBe(true);
  expect(JSON.parse(stored.metadata).consent).toBe(false);
  await expect(page.locator('.slot-card').getByRole('button', { name: 'Rights', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve media', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.slot-upload input[type=file]')).toBeEnabled();
  await page.getByLabel('Upload media for studio-context').setInputFiles(file);
  await expect.poll(() => getJob(studio.db, job.id).artifacts.slots.slots[request.id].attempts).toBe(2);
  for (const width of [320, 768, 834, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); }
  await expect(page.getByRole('alert')).toHaveCount(0);
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
