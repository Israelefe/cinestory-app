import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { openBrowser, selectComposition, renderStill, renderMedia, getVideoMetadata } from '@remotion/renderer';
import { briefSchema, planSchema } from '../src/contentStudio/schema.js';
import { normalizeImage, fetchGeneratedImage } from '../src/contentStudio/media.js';
import { directCampaign, narrate, wordTimings } from '../src/contentStudio/providers.js';
import { makeScore, makeTransitionSound } from '../src/contentStudio/audio.js';
import { timeline, totalFrames } from '../../admin/src/content-studio/timing.js';
import { prepareRenderer } from '../src/contentStudio/render.js';
import contentRoutes from '../src/routes/contentStudio.routes.js';
import ContentProject from '../src/models/ContentProject.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputDir = path.join(root, '.runtime/content-studio-verification');
await fs.mkdir(outputDir, { recursive: true });
const fixture = {
  title: 'A better first look', angle: 'Your final delivery deserves the same care as your photographs.', audience: 'Nigerian photographers', artDirection: 'Photographs first, short copy, clear contrast.', palette: 'ember', musicMood: 'warm', cta: 'Create your first delivery',
  captions: { instagram: 'Your edit is finished. Give the delivery the same care. Try Veylo at veylo.com.ng.', tiktok: 'A better way to deliver your finished photographs. veylo.com.ng', youtube: 'Give your photographs a better first look. Try Veylo.' }, hashtags: ['#Veylo'], requiredAssets: [],
  scenes: [
    { id: 'scene-1', beat: 'hook', sceneType: 'standard', assetIds: ['photo-1'], generatedImagePrompt: '', layout: 'editorial', headline: 'The edit is finished.', body: 'Give the delivery the same care.', eyebrow: 'For photographers', narration: 'Give your finished photographs a better first look.', duration: 3, focalPoint: { x: 50, y: 35 }, motion: 'push', transition: 'fade', grade: 'original', textPosition: 'bottom' },
    { id: 'scene-2', beat: 'flow', sceneType: 'standard', assetIds: ['photo-1'], generatedImagePrompt: '', layout: 'fullbleed', headline: 'One private link.', body: 'Ready to send on WhatsApp.', eyebrow: 'Made for the finished work', narration: 'Send one private link, ready for your clients.', duration: 3, focalPoint: { x: 50, y: 35 }, motion: 'pan', transition: 'slide', grade: 'original', textPosition: 'bottom' },
    { id: 'scene-3', beat: 'cta', sceneType: 'outro_cta', assetIds: [], generatedImagePrompt: '', layout: 'type', headline: 'Let the work do the talking.', body: 'Deliver your next shoot with Veylo.', eyebrow: 'Your next delivery', narration: 'Create your first delivery with Veylo.', duration: 3, focalPoint: { x: 50, y: 50 }, motion: 'still', transition: 'reveal', grade: 'original', textPosition: 'center' }
  ]
};
const brief = briefSchema.parse({ formats: ['video', 'portrait', 'carousel'] });
planSchema.parse(fixture);
assert.equal(briefSchema.safeParse({ formats: [] }).success, false);
assert.equal(briefSchema.safeParse({ formats: ['video'], notes: '<script>bad()</script>' }).success, false);
assert.equal(planSchema.safeParse({ ...fixture, scenes: fixture.scenes.map(scene => ({ ...scene, id: 'scene-1' })) }).success, false);
assert.equal(planSchema.safeParse({ ...fixture, scenes: [{ ...fixture.scenes[0], assetIds: ['https://attacker.test/photo'] }, ...fixture.scenes.slice(1)] }).success, false);
const image = await normalizeImage(await fs.readFile(path.join(root, 'client/public/veylo/pv-green-portrait.jpeg')));
assert.ok(image.width <= 2560 && image.height <= 2560);
await assert.rejects(normalizeImage(Buffer.from('<svg onload="alert(1)"></svg>')));
await assert.rejects(normalizeImage(await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png().toBuffer()));
await assert.rejects(fetchGeneratedImage('http://127.0.0.1/private', new AbortController().signal));
await assert.rejects(fetchGeneratedImage('https://evil-aliyuncs.com/private', new AbortController().signal));
const score = makeScore('editorial', 10);
assert.equal(score.buffer.toString('ascii', 0, 4), 'RIFF');
assert.equal(score.buffer.length, 44 + 10 * 44100 * 2);
assert.equal(makeTransitionSound().toString('ascii', 8, 12), 'WAVE');
const timed = timeline(fixture, { 'scene-1': { duration: 7.8 } }, { bpm: 100 });
assert.ok(timed[0].frames / 30 >= 8.45, 'Scene must not cut off narration');
assert.equal(timed[1].from, timed[0].frames);
console.log('PASS: input validation, image decoding, SSRF rejection, original audio, narration timing');

const realFetch = globalThis.fetch;
const allowanceModel = mongoose.models.ContentAllowance;
const oldUpdate = allowanceModel.updateOne, oldFindUpdate = allowanceModel.findOneAndUpdate;
allowanceModel.updateOne = async () => ({});
allowanceModel.findOneAndUpdate = async () => ({ used: 1 });
process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'verification-key';
process.env.ALIBABA_BASE_URL = 'https://verification.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
process.env.DEEPGRAM_API_KEY = 'verification-key';
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), body: options.body });
  if (String(url).includes('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...fixture, shotList: [{ id: 'shot-1', label: 'Hook', description: 'Phone scroll', mediaType: 'screen_recording', aspectRatio: '9:16', duration: 3, required: true }], scenes: fixture.scenes.map(scene => ({ ...scene, headline: `Updated ${scene.id}` })) }) } }] }), { status: 200 });
  if (String(url).includes('/v2/speak')) return new Response(Buffer.from('sample-audio'), { status: 200 });
  if (String(url).includes('/v1/listen')) return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ words: [{ word: 'Veylo', punctuated_word: 'Veylo.', start: 0, end: 1 }] }] }] } }), { status: 200 });
  throw new Error('Unexpected provider call');
};
try {
  const plan = await directCampaign({ project: { brief, assets: [{ id: 'photo-1', kind: 'photo', analysis: { description: 'Portrait' } }] }, history: [], previous: { plan: fixture }, instruction: 'Shorten the first headline', sceneId: 'scene-1', signal: new AbortController().signal });
  assert.equal(plan.scenes[0].headline, 'Updated scene-1');
  assert.deepEqual(plan.scenes[1], fixture.scenes[1], 'A single-scene revision must preserve other scenes');
  assert.equal(plan.cta, fixture.cta);
  assert.ok(Array.isArray(plan.shotList), 'Plan must include shotList');
  await narrate('Hello Veylo', new AbortController().signal);
  const words = await wordTimings(Buffer.from('audio'), new AbortController().signal);
  assert.equal(words[0].text, 'Veylo.');
  assert.ok(calls.some(call => call.url.includes('/v2/speak?') && call.url.includes('encoding=mp3')));
  const prompt = JSON.parse(calls[0].body).messages[0].content;
  assert.ok(prompt.includes('25000') && prompt.includes('finished photographs'));
  allowanceModel.findOneAndUpdate = async () => null;
  await assert.rejects(narrate('Cannot charge beyond allowance', new AbortController().signal), /allowance/);
} finally { globalThis.fetch = realFetch; allowanceModel.updateOne = oldUpdate; allowanceModel.findOneAndUpdate = oldFindUpdate; }
console.log('PASS: creative revision isolation, product grounding, Flux contract, subtitles, daily allowance');

const projectId = '111111111111111111111111';
const ownerId = '222222222222222222222222';
const realFind = ContentProject.findOne;
ContentProject.findOne = query => ({ lean: async () => query.ownerId === ownerId && String(query._id) === projectId ? { _id: projectId, ownerId, title: 'Owned draft', brief, assets: [], versions: [], job: { status: 'idle' } } : null });
const app = express(); app.use(express.json());
app.use((req, res, next) => { if (!req.headers['x-test-owner']) return res.status(401).end(); req.admin = { _id: req.headers['x-test-owner'] }; next(); });
app.use(contentRoutes);
const apiServer = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
try {
  const base = `http://127.0.0.1:${apiServer.address().port}`;
  assert.equal((await fetch(`${base}/projects/${projectId}`)).status, 401);
  assert.equal((await fetch(`${base}/projects/${projectId}`, { headers: { 'x-test-owner': ownerId } })).status, 200);
  assert.equal((await fetch(`${base}/projects/${projectId}`, { headers: { 'x-test-owner': '333333333333333333333333' } })).status, 404);
  assert.equal((await fetch(`${base}/projects/not-an-id`, { headers: { 'x-test-owner': ownerId } })).status, 404);
  const form = new FormData(); form.append('media', new Blob(['binary'], { type: 'application/x-msdownload' }), 'bad.exe');
  assert.equal((await fetch(`${base}/projects/${projectId}/assets`, { method: 'POST', headers: { 'x-test-owner': ownerId }, body: form })).status, 400);
} finally { ContentProject.findOne = realFind; await new Promise(resolve => apiServer.close(resolve)); }
console.log('PASS: campaign ownership, invalid identifiers, unsupported file rejection');

const browserExecutable = process.env.CONTENT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const images = { 'photo-1': { src: `data:image/png;base64,${image.buffer.toString('base64')}`, kind: 'photo', width: image.width, height: image.height } };
const props = { plan: fixture, images, width: 1080, height: 1920, voice: {}, music: null, still: false, format: 'video' };
const serveUrl = await prepareRenderer();
const browser = await openBrowser('chrome', { browserExecutable, logLevel: 'error' });
try {
  const common = { serveUrl, puppeteerInstance: browser, logLevel: 'error', timeoutInMilliseconds: 60000 };
  if (!process.argv.includes('--ui-only')) {
  const inputProps = { ...props, still: true, sceneIndex: 0, height: 1350, format: 'portrait' };
  const composition = await selectComposition({ ...common, id: 'VeyloContent', inputProps });
  assert.equal(composition.height, 1350);
  await renderStill({ ...common, composition, inputProps, imageFormat: 'png', output: path.join(outputDir, 'portrait.png') });
  const square = { ...inputProps, height: 1080, sceneIndex: 2 };
  const squareComposition = await selectComposition({ ...common, id: 'VeyloContent', inputProps: square });
  await renderStill({ ...common, composition: squareComposition, inputProps: square, imageFormat: 'png', output: path.join(outputDir, 'square.png') });
  const videoComposition = await selectComposition({ ...common, id: 'VeyloContent', inputProps: props });
  assert.equal(videoComposition.durationInFrames, totalFrames(props));
  await renderMedia({ ...common, composition: videoComposition, inputProps: props, codec: 'h264', concurrency: 2, frameRange: [75, 104], crf: 23, outputLocation: path.join(outputDir, 'transition.mp4') });
  const metadata = await getVideoMetadata(path.join(outputDir, 'transition.mp4'));
  assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1920);
  assert.ok(metadata.durationInSeconds >= 0.9);
  console.log('PASS: real 1080px PNG exports and 1080 × 1920 H.264 video across a scene transition');
  }

  if (process.argv.includes('--ui') || process.argv.includes('--ui-only')) {
    const mockProject = { id: projectId, title: fixture.title, brief, assets: [{ id: 'photo-1', name: 'Studio portrait', kind: 'photo', url: images['photo-1'].src }], activeVersionId: 'v1', job: { status: 'ready', progress: 100 }, versions: [{ id: 'v1', plan: fixture, preview: props, outputs: [{ id: 'portrait-1', format: 'portrait', width: 1080, height: 1350 }] }] };
    const ui = express();
    ui.get('/api/v1/admin/auth/me', (req, res) => res.json({ admin: { id: ownerId, name: 'Studio admin', role: 'superadmin' } }));
    ui.get('/api/v1/admin/content-studio/status', (req, res) => res.json({ providers: { ai: true, storage: true, voice: true }, workerOnline: true, allowance: { used: 0, limit: 150 } }));
    ui.get('/api/v1/admin/content-studio/projects', (req, res) => res.json({ projects: [{ id: projectId, title: fixture.title, status: 'ready', formats: brief.formats, updatedAt: new Date() }], hasMore: false }));
    ui.get(`/api/v1/admin/content-studio/projects/${projectId}`, (req, res) => res.json({ project: mockProject }));
    ui.use(express.static(path.join(root, 'admin/dist'))); ui.get('*', (req, res) => res.sendFile(path.join(root, 'admin/dist/index.html')));
    const uiServer = await new Promise(resolve => { const server = ui.listen(5055, '127.0.0.1', () => resolve(server)); });
    const page = await browser.newPage({ context: undefined, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {} });
    try {
      await page.evaluateOnNewDocument(() => localStorage.setItem('veylo_admin_token', 'test-only-local-token'));
      for (const route of ['/content-studio', `/content-studio/${projectId}`]) {
        for (const width of [320, 390, 768, 834, 1024, 1440]) {
          await page.setViewport({ width, height: width > 1000 ? 1000 : 1024, deviceScaleFactor: 1 });
          await page.goto({ url: `http://127.0.0.1:5055${route}`, timeout: 30000 });
          for (let attempt = 0; attempt < 80; attempt++) {
            const ready = await page.evaluate(() => Boolean(document.querySelector('.cs-intro') || document.querySelector('.cs-scene-strip')));
            if (ready) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth, loaded: Boolean(document.querySelector('.cs-intro') || document.querySelector('.cs-scene-strip')), error: document.querySelector('.cs-preview-error')?.textContent }));
          assert.equal(dimensions.loaded, true, `UI did not load at ${width}`);
          assert.ok(dimensions.scroll <= dimensions.viewport, `Horizontal overflow at ${width}: ${dimensions.scroll}`);
          assert.ok(!dimensions.error, dimensions.error);
          if ([320, 834, 1440].includes(width)) {
            const capture = await page._client().send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            await fs.writeFile(path.join(outputDir, `${route.endsWith(projectId) ? 'campaign' : 'studio'}-${width}.png`), Buffer.from(capture.value.data, 'base64'));
          }
        }
      }
      console.log('PASS: campaign list and editor at 320, 390, 768, 834, 1024 and 1440px without horizontal overflow');
    } finally { await page.close(); await new Promise(resolve => uiServer.close(resolve)); }
  }
} finally { await browser.close({ silent: true }); }
console.log(`Verification complete. Artifacts: ${outputDir}`);
