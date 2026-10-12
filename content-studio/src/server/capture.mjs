import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { readKnowledge, sourceFingerprint } from './knowledge.mjs';
import { setting, setSetting, event } from './database.mjs';
import { hash, atomicWrite, safeFile, contained } from './storage.mjs';
import { tool, run, probe, frameAt } from './media.mjs';

export async function browserOptions() {
  const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  return { headless: true, ...(await fs.access(chrome).then(() => true).catch(() => false) ? { executablePath: chrome } : {}) };
}
const owner = { id: 'local-demo-owner', _id: 'local-demo-owner', name: 'Demo Photographer', email: 'demo@example.invalid', emailVerified: true, onboardingComplete: true, onboardingCompleted: true, plan: 'pro', studio: { name: 'Kora Media Studio' } };
const billing = { plan: 'pro', status: 'active', usage: { deliveriesRemaining: 100, deliveriesThisMonth: 0 }, limits: { photosPerDelivery: 300, maxPhotosPerDelivery: 300, deliveriesPerMonth: null }, features: { branding: 'studio', formats: ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'], photoLibrary: true, videoDelivery: true } };
export function demoApi({ origin, photos, fixture }) {
  let draft = { ...structuredClone(fixture), _id: 'local-demo-delivery', publicId: 'local-demo', status: 'draft', assets: [], curatedAssetIds: [], v3: { step: 'details', revision: 1 }, createdAt: new Date().toISOString() };
  let uploads = 0;
  const libraryPhotos = photos.map((photo, index) => ({ id: photo.id, _id: photo.id, assetId: photo.id, folder: 'The portrait collection', originalFilename: `Portrait-${index + 1}.webp`, format: 'webp', bytes: 120000, width: photo.metadata.width, height: photo.metadata.height, tags: ['portrait'], url: origin + '/__studio-photo/' + photo.id, thumbnailUrl: origin + '/__studio-photo/' + photo.id }));
  const workflows = ['preselection', 'editor-handoff'].map(kind => ({ _id: 'local-' + kind, kind, title: kind === 'preselection' ? 'Portrait selection' : 'Portrait editing handoff', clientName: 'Demo Client', status: kind === 'preselection' ? 'submitted' : 'published', editorState: 'ready-for-review', assetIds: libraryPhotos.map(photo => photo.id), assets: libraryPhotos, covers: libraryPhotos.slice(0, 3), selectedAssetIds: libraryPhotos.slice(0, 3).map(photo => photo.id), selectedPhotos: libraryPhotos.slice(0, 3), selectedCount: 3, approvedAssetIds: [], returnedAssets: [], returned: [], selection: { minimum: 1, maximum: 3 }, history: [], submissions: [], access: {}, publicId: 'local-' + kind, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  return async request => {
    const url = new URL(request.url()), route = url.pathname, method = request.method(); let body = {}; try { body = request.postDataJSON() || {}; } catch {}
    const success = data => ({ success: true, data });
    if (route.endsWith('/auth/me')) return { user: owner };
    if (route.endsWith('/auth/refresh')) return { user: owner };
    if (route.endsWith('/billing/status')) return success(billing);
    if (route.endsWith('/storage')) return { ...success(libraryPhotos), shoots: [{ name: 'The portrait collection', count: libraryPhotos.length }], folders: ['The portrait collection'], total: libraryPhotos.length, libraryTotal: libraryPhotos.length, access: 'read-write', usage: { usedBytes: 720000, limitBytes: 100 * 1024 ** 3 }, hasMore: false };
    if (route.endsWith('/storage/collaborations')) return { ...success(workflows.filter(item => item.kind === url.searchParams.get('kind'))), hasMore: false };
    if (route.includes('/storage/collaborations/')) return success(workflows.find(item => route.endsWith(item._id)) || workflows[0]);
    if (route.endsWith('/studio-name/availability')) return success({ available: true });
    if (route.endsWith('/billing/plans')) return { ...success([]), pricing: { monthlyPriceNaira: 40000 }, billingAvailable: true };
    if (route.includes('/analytics') || route.includes('/events') || route.includes('/assistant')) return success({});
    if (route.endsWith('/stories/my-stories')) return success([]);
    if (route.endsWith('/deliveries/v3/assist')) return success({ format: 'photo-story', reason: 'A focused first viewing for the finished photographs.', purpose: body.purpose });
    if (route.endsWith('/deliveries/v3') && method === 'POST') { draft = { ...draft, clientName: body.clientName, shootType: body.shootType, brief: body.purpose, format: 'photo-story', v3: { ...draft.v3, step: 'format' } }; return success(draft); }
    if (route.endsWith('/uploads/sign') || route.endsWith('/uploads/recover')) return success({ uploadUrl: 'https://local-demo.r2.cloudflarestorage.com/' + body.uploadId, objectKey: body.uploadId, uploadToken: 'local-only', expiresAt: new Date(Date.now() + 3600000).toISOString(), contentType: body.contentType, uploadHeaders: {} });
    if (route.endsWith('/uploads/confirm')) {
      const photo = photos[uploads++ % photos.length], assetId = body.uploadId;
      const asset = { assetId, originalFilename: body.originalFilename, url: origin + '/__studio-photo/' + photo.id, thumbnailUrl: origin + '/__studio-photo/' + photo.id, width: photo.metadata.width, height: photo.metadata.height, sortOrder: draft.assets.length };
      draft.assets.push(asset); return success(asset);
    }
    if (route.endsWith('/v3/format')) { draft.format = body.format; draft.v3.step = 'upload'; return success(draft); }
    if (route.endsWith('/v3/details')) { draft = { ...draft, ...body, brief: body.purpose, v3: { ...draft.v3, step: 'format' } }; return success(draft); }
    if (route.endsWith('/v3/prepare')) {
      const template = structuredClone(fixture), ids = draft.assets.map(asset => asset.assetId);
      draft = { ...draft, title: 'The finished portrait collection', curatedAssetIds: ids.slice(0, 10), presentationOrder: ids.slice(0, 10), galleryAssetIds: ids, galleryOrder: ids, creativeDirection: { ...template.creativeDirection, frames: ids.slice(0, 10).map((assetId, index) => ({ assetId, headline: 'From the portrait session', caption: 'A finished photograph from the collection.', motion: 'still' })) }, generationJob: { type: 'v3-prepare', status: 'completed', progress: 100 }, v3: { ...draft.v3, step: 'showcase', openingAssetId: ids[0], closingAssetId: ids.at(-1), revision: draft.v3.revision + 1 } };
      return success(draft);
    }
    if (route.endsWith('/generation') || route.endsWith('/progress')) return success({ delivery: draft, job: draft.generationJob, ...draft });
    if (route.endsWith('/v3/showcase')) { draft = { ...draft, ...body, creativeDirection: { ...draft.creativeDirection, ...body } }; return success(draft); }
    if (route.endsWith('/v3/narration/skip')) { draft.v3.step = 'music'; return success(draft); }
    if (route.endsWith('/v3/theme')) { draft.creativeDirection = { ...draft.creativeDirection, ...body }; return success(draft); }
    if (route.endsWith('/v3/approve')) { draft.v3.step = 'access'; return success(draft); }
    if (route.endsWith('/v3/access')) { draft.access = { ...draft.access, ...body }; return success(draft); }
    if (route.endsWith('/v3/publish')) { draft.status = 'published'; draft.v3.step = 'published'; return success({ ...draft, url: origin + '/d/local-demo' }); }
    if (route.includes('/deliveries/local-demo-delivery')) return success(draft);
    if (route.includes('/deliveries/public/local-demo')) return success(draft);
    if (route.endsWith('/deliveries')) return success([{ ...draft, title: 'The portrait collection', status: 'published', assets: photos.slice(0, 6).map((photo, i) => ({ assetId: photo.id, thumbnailUrl: origin + '/__studio-photo/' + photo.id, url: origin + '/__studio-photo/' + photo.id, sortOrder: i })), thumbnailUrl: origin + '/__studio-photo/' + photos[0].id }]);
    if (route.includes('/library') || route.includes('/images') || route.includes('/pre-selection') || route.includes('/editor-links') || route.includes('/portfolio')) return success({ shoots: [], assets: [], items: [], folders: [], collections: [], total: 0 });
    if (route.includes('/soundtracks')) return success([]);
    return { success: false, message: 'This local rehearsal endpoint is not implemented.', code: 'LOCAL_DEMO_UNSUPPORTED' };
  };
}
async function boxes(page, started) {
  const targets = await page.locator('button,a,input,select,[role="button"],h1,h2').evaluateAll(elements => elements.filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y >= 0 && r.y < innerHeight; }).slice(0, 45).map((element, index) => { const r = element.getBoundingClientRect(); return { id: 'element-' + index, label: (element.getAttribute('aria-label') || element.innerText || element.getAttribute('placeholder') || element.tagName).slice(0, 100), box: { x: r.x, y: r.y, width: r.width, height: r.height } }; }));
  const labels = new Map();
  return targets.map(target => { const occurrence = labels.get(target.label) || 0; labels.set(target.label, occurrence + 1); return { ...target, id: 'ui-' + hash(target.label + ':' + occurrence).slice(0, 12), at: (Date.now() - started) / 1000 }; });
}
async function clickFirst(page, patterns) {
  for (const pattern of patterns) {
    const matches = page.getByRole('button', { name: pattern });
    for (const element of await matches.all()) if (await element.isVisible() && await element.isEnabled()) { await element.click({ timeout: 5000 }); return true; }
  }
  return false;
}
export async function captureAll({ config, db, signal, progress = () => {}, task }) {
  const knowledge = await readKnowledge(config, db), fingerprint = await sourceFingerprint();
  if (knowledge.stale) throw new Error('Refresh the knowledge pack before recording.');
  const photos = db.prepare("SELECT * FROM assets WHERE kind='image' AND rights='cleared'").all().map(row => ({ ...row, metadata: JSON.parse(row.metadata) })).filter(photo => !photo.metadata.generated && photo.metadata.consent && photo.metadata.width >= 1080);
  const demoVideo = db.prepare("SELECT * FROM assets WHERE kind='video' AND rights='cleared' ORDER BY created_at DESC").all().map(row => ({ ...row, metadata: JSON.parse(row.metadata) })).find(video => !video.metadata.generated && video.metadata.consent);
  if (photos.length < 6) throw new Error('Clear at least six real sample photographs with recorded consent before automated capture. Existing generated/demo images do not count as finished client work.');
  const features = knowledge.features.filter(feature => feature.eligible);
  if (!features.length) throw new Error('Approve the product catalog entries to record first.');
  const fixtureModule = await import(pathToFileURL(path.join(config.repo, 'client/src/constants/deliveryDemoFixtures.js')).href);
  const fixture = fixtureModule.ALBUM_DEMO;
  const clientRequire = createRequire(path.join(config.repo, 'client/package.json'));
  const { default: tailwindConfig } = await import(pathToFileURL(path.join(config.repo, 'client/tailwind.config.js')).href);
  const vite = await createServer({ configFile: false, plugins: [react()], envDir: false, root: path.join(config.repo, 'client'), cacheDir: path.join(config.data, 'temp/capture-vite'), css: { postcss: { plugins: [clientRequire('tailwindcss')({ ...tailwindConfig, content: tailwindConfig.content.map(pattern => path.resolve(config.repo, 'client', pattern)) }), clientRequire('autoprefixer')()] } }, server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [path.join(config.repo, 'client')] } }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__studio-api'), 'import.meta.env.VITE_APP_URL': JSON.stringify(''), 'import.meta.env.VITE_POSTHOG_KEY': JSON.stringify(''), 'import.meta.env.VITE_POSTHOG_API_KEY': JSON.stringify('') }, resolve: { dedupe: ['react', 'react-dom'] } });
  await vite.listen(); const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const browser = await chromium.launch(await browserOptions()), manifest = [], report = [];
  const stop = () => browser.close().catch(() => {}); signal?.addEventListener('abort', stop, { once: true });
  try {
    for (const feature of features) {
      if (signal?.aborted) throw new Error('Cancelled.');
      if (feature.id === 'video' && !demoVideo) { report.push({ id: 'video', error: 'Add and clear one real sample film with consent before recording video delivery.' }); continue; }
      for (const treatment of ['opening', 'interaction', 'gallery']) {
        const id = feature.id.replaceAll(':', '-') + '-' + treatment, folder = contained(config.data, 'temp/capture-' + id); await fs.mkdir(folder, { recursive: true });
        const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, recordVideo: { dir: folder, size: { width: 720, height: 1280 } }, serviceWorkers: 'block', acceptDownloads: false });
        const api = demoApi({ origin, photos, fixture }), used = new Set(), unsupported = new Set(); let photoIndex = 0;
        await context.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (feature.id === 'video' && url.hostname === 'veylo-delivery-images.israelonanefe08157.workers.dev' && url.pathname.startsWith('/demo-videos/')) { used.add(demoVideo.id); return route.fulfill({ status: 200, contentType: 'video/mp4', body: await fs.readFile(await safeFile(config.data, demoVideo.path)) }); }
          if (url.hostname === 'local-demo.r2.cloudflarestorage.com') return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': origin } });
          if (url.origin !== origin) return route.abort('blockedbyclient');
          if (url.pathname.startsWith('/__studio-api/')) { const response = await api(request); if (response.success === false) unsupported.add(url.pathname); return route.fulfill({ status: response.success === false ? 501 : 200, json: response }); }
          const direct = url.pathname.startsWith('/__studio-photo/') ? photos.find(photo => photo.id === url.pathname.split('/').at(-1)) : null;
          if (direct || /\/(?:veylo|photos)\/.*\.(?:webp|png|jpe?g)$/.test(url.pathname) && !/logo|wordmark|brandmark/.test(url.pathname)) { const photo = direct || photos[photoIndex++ % photos.length]; used.add(photo.id); return route.fulfill({ contentType: 'image/webp', body: await fs.readFile(await safeFile(config.data, photo.path)) }); }
          return route.continue();
        });
        const page = await context.newPage(), errors = []; page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
        progress(undefined, 'Recording ' + feature.name + ' / ' + treatment + '.');
        const started = Date.now(); let targets = [], failure, clipStart = 0;
        try {
          await page.goto(origin + feature.route + (feature.route.includes('?') ? '&' : '?') + 'phoneView=1', { waitUntil: 'networkidle', timeout: 60000 });
          await page.waitForTimeout(900); targets.push(...await boxes(page, started));
          await clickFirst(page, [/^Got it$/]);
          clipStart = (Date.now() - started) / 1000;
          if (await page.getByRole('heading', { name: /page not found|Veylo couldn.t open this page/i }).isVisible()) throw new Error('The actual product screen did not load correctly.');
          if (feature.id === 'sharing' || feature.id === 'privacy') {
            await page.getByLabel('Client name', { exact: true }).fill('Demo Client');
            await page.getByRole('combobox').first().selectOption('Portrait');
            await page.getByLabel('Purpose of the shoot').fill('Finished studio portraits for a private client handover.');
            await page.getByRole('button', { name: /Continue to formats/ }).click();
            await page.getByRole('button', { name: 'Continue to photos', exact: true }).click();
            const picker = page.locator('input[type=file][accept*="image"]').first();
            await picker.setInputFiles(await Promise.all(photos.slice(0, 6).map(async photo => ({ name: photo.name.endsWith('.webp') ? photo.name : photo.id + '.webp', mimeType: 'image/webp', buffer: await fs.readFile(await safeFile(config.data, photo.path)) }))));
            await page.getByRole('button', { name: /Review \d+ photos/ }).waitFor({ timeout: 20000 });
            await page.getByRole('button', { name: /Review \d+ photos/ }).click();
            await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ timeout: 20000 });
            targets.push(...await boxes(page, started));
            if (treatment !== 'opening') {
              await page.getByRole('button', { name: 'Continue', exact: true }).click();
              await page.getByRole('button', { name: 'Skip voice', exact: true }).click();
              await page.getByRole('button', { name: 'Continue to design', exact: true }).click();
              await page.getByRole('button', { name: 'Approve and set access', exact: true }).click();
              await page.getByRole('button', { name: 'Publish delivery', exact: true }).waitFor();
              clipStart = (Date.now() - started) / 1000;
              targets = await boxes(page, started);
              if (feature.id === 'sharing') { await page.getByRole('button', { name: 'Publish delivery', exact: true }).click(); await page.getByRole('button', { name: 'Copy link', exact: true }).waitFor(); if (treatment === 'gallery') await page.getByRole('button', { name: 'Open share menu', exact: true }).click(); }
              else { await page.mouse.wheel(0, treatment === 'gallery' ? 400 : 220); }
            }
          } else if (treatment === 'interaction') {
            await clickFirst(page, [/Open album|Begin|Start|View the|Open collection|Explore|Play|Next|Reveal/i]); await page.mouse.wheel(0, 480); await page.waitForTimeout(900);
            await clickFirst(page, [/Next|Continue|Reveal|Turn|Photograph/i]);
          } else if (treatment === 'gallery') {
            await clickFirst(page, [/View (?:all|gallery)|Full gallery|Complete collection|Gallery|Photographs/i]); await page.mouse.wheel(0, 650); await page.waitForTimeout(900);
          }
          targets.push(...await boxes(page, started)); await page.waitForTimeout(4000);
          if (errors.length) throw new Error('Product screen error: ' + errors[0]);
          if (unsupported.size) report.push({ id, note: 'Some optional rehearsal endpoints were unavailable.', endpoints: [...unsupported] });
        } catch (error) { failure = error.message; report.push({ id, error: failure }); await page.screenshot({ path: path.join(folder, 'diagnostic.png') }).catch(() => {}); progress(undefined, id + ' needs attention: ' + failure.slice(0, 200)); }
        const video = page.video(); await page.close(); await context.close();
        if (failure) continue;
        const source = await video.path(), relative = 'captures/' + id + '-' + fingerprint.digest.slice(0, 10) + '.mp4';
        await run(tool('ffmpeg'), ['-y', '-v', 'error', '-ss', String(clipStart), '-i', source, '-t', '30', '-an', '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', contained(config.data, relative)], { signal });
        const info = await probe(contained(config.data, relative), signal);
        const reference = 'knowledge/ui-reference/' + id + '-' + fingerprint.digest.slice(0, 10) + '.png';
        await frameAt(contained(config.data, relative), contained(config.data, reference), Math.min(.5, info.duration / 2), signal);
        // DOM boxes are recorded in viewport coordinates; scale to the actual encoded clip.
        const scaled = targets.filter(target => target.at >= clipStart && target.at <= clipStart + info.duration).map(target => ({ ...target, at: Math.max(0, target.at - clipStart), box: Object.fromEntries(Object.entries(target.box).map(([key, value]) => [key, value * info.width / 540])) }));
        const data = { id, featureId: feature.id, flow: treatment, screen: feature.route, description: `${feature.name}: ${treatment} in the real frontend, using local rehearsed demo data.`, path: relative, duration: info.duration, fps: info.fps, width: info.width, height: info.height, targets: scaled, safeCrop: { x: 0, y: 0, width: info.width, height: info.height }, recordedOn: new Date().toISOString(), sourceDigest: fingerprint.digest, appVersion: fingerprint.digest, assetIds: [...used], benchmarkEligible: false, mode: 'local-rehearsal' };
        data.reference = { id: id + '-screen', path: reference, description: data.description };
        data.digest = hash(data); manifest.push(data);
        progress(manifest.length / (features.length * 3), 'Recorded ' + feature.name + ' / ' + treatment + '.');
      }
    }
    const old = setting(db, 'captures', []).filter(clip => !manifest.some(next => next.id === clip.id));
    setSetting(db, 'captures', [...old, ...manifest]); setSetting(db, 'captureReport', { entries: report, recorded: manifest.length, expected: features.length * 3, createdAt: new Date().toISOString() });
    await atomicWrite(contained(config.data, 'captures/manifest.json'), [...old, ...manifest]);
    await atomicWrite(contained(config.data, 'knowledge/ui-reference/index.json'), [...old, ...manifest].filter(clip => clip.reference).map(clip => ({ ...clip.reference, captureId: clip.id, appVersion: clip.appVersion })));
    event(db, null, 'capture.complete', `${manifest.length} clips recorded. Review each before use.`, { report });
    if (report.some(item => item.error)) throw new Error(`Recorded ${manifest.length} clips; ${report.filter(item => item.error).length} capture recipes need attention. Successful clips were saved. See capture report.`);
  } finally { signal?.removeEventListener('abort', stop); await browser.close(); await vite.close(); }
}
