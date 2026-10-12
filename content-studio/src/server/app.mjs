import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import busboy from 'busboy';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { configuration, providerDefaults } from './config.mjs';
import { initialiseStorage, atomicWrite, safeFile, hash, redact } from './storage.mjs';
import { openDatabase, setting, setSetting, enqueue, snapshot, event } from './database.mjs';
import { initialiseKnowledge, readKnowledge } from './knowledge.mjs';
import { createOwner, verifyOwner, issueSession, session, endSession } from './auth.mjs';
import { briefSchema, reviewSchema, credentialsSchema, rightsSchema, storyboardSchema } from '../contracts/index.mjs';
import { getJob, createJob, saveStage, revise, approved, recordReview } from './jobs.mjs';
import { capturesFor, handlers, validateEditedScripts } from './pipeline.mjs';
import { credentials } from '../providers/groq.mjs';
import { assetRecord, storeImage } from './assets.mjs';
import { storeMedia } from './media.mjs';
import { startWorker } from './worker.mjs';
import { validateStoryboard } from '../contracts/validators.mjs';

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const idSchema = z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/);
const approvalActions = new Set(['preview', 'final']);
const metricsSchema = z.object({ postedAt: z.string().max(40).default(''), views: z.number().int().min(0).max(1e12).default(0), likes: z.number().int().min(0).max(1e12).default(0), saves: z.number().int().min(0).max(1e12).default(0), profileClicks: z.number().int().min(0).max(1e12).default(0), linkClicks: z.number().int().min(0).max(1e12).default(0), signups: z.number().int().min(0).max(1e12).default(0), notes: z.string().max(2000).default('') }).strict();
function multipart(req) {
  return new Promise((resolve, reject) => {
    const parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: 250 * 1024 * 1024, fields: 0, parts: 1 } });
    let file, chunks = [], size = 0, truncated = false;
    parser.on('file', (field, stream, info) => { file = info; stream.on('data', data => { size += data.length; chunks.push(data); }); stream.on('limit', () => { truncated = true; }); stream.on('error', reject); });
    parser.on('filesLimit', () => { truncated = true; }); parser.on('partsLimit', () => { truncated = true; }); parser.on('error', reject);
    parser.on('close', () => !file || truncated ? reject(new Error('Upload one file under 250 MB at a time.')) : resolve({ ...file, buffer: Buffer.concat(chunks, size) }));
    req.on('aborted', () => reject(new Error('Upload interrupted.'))); req.pipe(parser);
  });
}
export async function createStudio(overrides = {}) {
  const config = configuration(overrides); await initialiseStorage(config); await initialiseKnowledge(); const db = openDatabase(config), app = express();
  app.disable('x-powered-by'); app.set('trust proxy', false);
  app.use((req, res, next) => {
    const allowedHosts = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`]);
    if (!allowedHosts.has(req.headers.host)) return res.status(403).json({ error: 'Use the studio’s local address.' });
    if (req.headers.origin && ![config.origin, `http://localhost:${config.port}`].includes(req.headers.origin)) return res.status(403).json({ error: 'Cross-site requests are blocked.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are blocked.' });
    next();
  });
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null } }, crossOriginEmbedderPolicy: false }));
  app.use(cookieParser()); app.use(express.json({ limit: '200kb', strict: true }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  app.get('/api/session', (req, res) => { const current = session(db, req); res.json({ needsOwner: !db.prepare('SELECT id FROM owner').get(), authenticated: Boolean(current), csrf: current?.csrf }); });
  app.post('/api/login', rateLimit({ windowMs: 60000, limit: 8, standardHeaders: true, legacyHeaders: false }), asyncRoute(async (req, res) => {
    const { password } = z.object({ password: z.string().min(12).max(200) }).strict().parse(req.body);
    if (!db.prepare('SELECT id FROM owner').get()) await createOwner(db, password);
    else if (!await verifyOwner(db, password)) return res.status(401).json({ error: 'That password does not match.' });
    res.json({ csrf: issueSession(db, res) });
  }));
  app.use('/api', (req, res, next) => { const current = session(db, req); if (!current) return res.status(401).json({ error: 'Sign in to your local studio.' }); if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-studio-csrf'] !== current.csrf) return res.status(403).json({ error: 'Reload the studio to refresh your session.' }); next(); });
  app.post('/api/logout', (req, res) => { endSession(db, req, res); res.json({ ok: true }); });
  app.get('/api/overview', asyncRoute(async (req, res) => {
    const jobs = db.prepare('SELECT id,title,state,revision,created_at,updated_at,error FROM jobs ORDER BY updated_at DESC').all();
    const tasks = db.prepare('SELECT id,job_id,type,state,progress,message,attempts FROM tasks ORDER BY created_at DESC LIMIT 80').all();
    const cost = db.prepare("SELECT COALESCE(SUM(COALESCE(actual,estimated)),0) total FROM provider_calls WHERE state!='released'").get().total;
    const history = jobs.map(row => { const job = getJob(db, row.id), variant = job.artifacts.variant?.variant; return { ...row, audience: job.brief.audience, platform: job.brief.platform, angle: variant?.angle || '', hookType: variant?.hookType || '', hook: variant?.voiceover.hook || '', metrics: job.metrics }; });
    res.json({ jobs: history, tasks, cost, caps: setting(db, 'caps', providerDefaults.caps), knowledge: await readKnowledge(config, db), assetCount: db.prepare('SELECT COUNT(*) n FROM assets').get().n });
  }));
  app.get('/api/knowledge', asyncRoute(async (req, res) => res.json(await readKnowledge(config, db))));
  app.get('/api/knowledge/site', asyncRoute(async (req, res) => res.json(JSON.parse(await fs.readFile(path.join(config.data, 'knowledge/site-pages.json'), 'utf8')).map(({ text, ...page }) => ({ ...page, text })))));
  app.post('/api/knowledge/site/review', (req, res, next) => { try { const review = reviewSchema.parse(req.body), crawl = setting(db, 'crawl'); if (!crawl?.digest) throw new Error('Read the public site first.'); recordReview(db, 'site', crawl.digest, review); setSetting(db, 'crawl', { ...crawl, changed: review.decision !== 'approved', message: review.decision === 'approved' ? 'Public page changes reviewed. Product catalog remains the approved claim source.' : 'Public page changes need a product-source decision.' }); res.json({ ok: true }); } catch (error) { next(error); } });
  app.post('/api/features/:id/review', asyncRoute(async (req, res) => { const feature = (await readKnowledge(config, db)).features.find(feature => feature.id === req.params.id); if (!feature) throw new Error('Unknown feature.'); recordReview(db, 'feature:' + feature.id, feature.digest, reviewSchema.parse(req.body)); res.json({ ok: true }); }));
  app.post('/api/system/:action', (req, res, next) => { try { const action = z.enum(['index_samples', 'extract_knowledge', 'crawl_site', 'capture', 'verify_providers', 'calibrate']).parse(req.params.action); res.json(enqueue(db, null, action, { requestedAt: Date.now() })); } catch (error) { next(error); } });
  app.get('/api/settings', asyncRoute(async (req, res) => { const keys = await credentials(config), voice = setting(db, 'voice', ''); res.json({ hasGroq: Boolean(keys.groq), hasDeepgram: Boolean(keys.deepgram), voice, voiceApproved: setting(db, 'voiceApproved', false), caps: setting(db, 'caps', providerDefaults.caps), limits: setting(db, 'groqLimits', providerDefaults.groq), models: setting(db, 'models', providerDefaults.groq), availableModels: setting(db, 'availableModels'), providerProbe: setting(db, 'providerProbe'), fallbackProbe: setting(db, 'fallbackProbe'), setup: setting(db, 'setup', {}), visionThreshold: setting(db, 'visionThreshold', 4), publicSite: setting(db, 'publicSite', 'https://veylo.com.ng'), calibration: setting(db, 'calibration'), auditions: Object.fromEntries(['flux-hannah-en', 'flux-kit-en', 'flux-alexis-en'].map(voice => [voice, setting(db, 'audition:' + voice)])) }); }));
  app.put('/api/settings', asyncRoute(async (req, res) => {
    const input = z.object({ credentials: credentialsSchema.optional(), limits: z.object({ rpm: z.number().int().min(1).max(10000), rpd: z.number().int().min(1).max(1e9), tpm: z.number().int().min(1000).max(1e8), tpd: z.number().int().min(1000).max(1e10) }).strict().optional(), model: z.string().regex(/^[a-zA-Z0-9/_.-]{1,100}$/).optional(), reasoning: z.enum(['none', 'low', 'medium', 'high', 'default']).optional(), setup: z.object({ limitsConfirmed: z.boolean(), soloLicense: z.boolean(), imageSurface: z.string().max(200), imageModel: z.string().max(200), imagePlan: z.string().max(200), imageQuota: z.string().max(200), visibleWatermark: z.boolean() }).strict().optional(), voiceApproved: z.boolean().optional(), visionThreshold: z.number().min(0).max(5).optional(), publicSite: z.string().url().optional() }).strict().parse(req.body);
    if (input.credentials) { const old = await credentials(config), next = { groq: input.credentials.groq || old.groq, deepgram: input.credentials.deepgram || old.deepgram }; await atomicWrite(path.join(config.data, 'credentials.json'), next); if (input.credentials.groq && input.credentials.groq !== old.groq) { setSetting(db, 'providerProbe', null); setSetting(db, 'fallbackProbe', null); } if (input.credentials.voice !== undefined) { if (input.credentials.voice !== setting(db, 'voice', '')) setSetting(db, 'voiceApproved', false); setSetting(db, 'voice', input.credentials.voice); } if (input.credentials.jobCap || input.credentials.dayCap) setSetting(db, 'caps', { ...setting(db, 'caps', providerDefaults.caps), ...(input.credentials.jobCap ? { job: input.credentials.jobCap } : {}), ...(input.credentials.dayCap ? { day: input.credentials.dayCap } : {}) }); }
    if (input.limits) setSetting(db, 'groqLimits', { ...providerDefaults.groq, ...input.limits, recordedAt: new Date().toISOString() });
    if (input.model || input.reasoning) { setSetting(db, 'models', { ...setting(db, 'models', providerDefaults.groq), ...(input.model ? { model: input.model } : {}), ...(input.reasoning ? { reasoning: input.reasoning } : {}) }); setSetting(db, 'providerProbe', null); }
    for (const key of ['setup', 'visionThreshold']) if (input[key] !== undefined) setSetting(db, key, input[key]);
    if (input.voiceApproved !== undefined) { if (input.voiceApproved && !setting(db, 'audition:' + setting(db, 'voice', ''))) throw new Error('Listen to an audition before approving the voice.'); setSetting(db, 'voiceApproved', input.voiceApproved); }
    if (input.publicSite) { const url = new URL(input.publicSite); if (url.protocol !== 'https:' || !/^(?:www\.)?veylo\.(?:com\.ng|co|app|com)$/.test(url.hostname) || url.username || url.password || url.port) throw new Error('Use the public HTTPS Veylo site address.'); setSetting(db, 'publicSite', url.origin); }
    res.json({ ok: true });
  }));
  app.post('/api/audition', (req, res, next) => { try { const voice = z.enum(['flux-hannah-en', 'flux-kit-en', 'flux-alexis-en']).parse(req.body.voice); res.json(enqueue(db, null, 'audition', { voice })); } catch (error) { next(error); } });
  app.put('/api/calibration/:index', asyncRoute(async (req, res) => {
    const index = z.coerce.number().int().min(0).max(9).parse(req.params.index), input = z.object({ hookStrength: z.number().int().min(1).max(5), acceptable: z.boolean(), note: z.string().max(1000) }).strict().parse(req.body), report = setting(db, 'calibration');
    if (!report?.results[index]) throw new Error('Run the calibration before scoring a sample.');
    report.results[index].ownerScore = { ...input, reviewedAt: new Date().toISOString() };
    report.ownerReviewRequired = report.results.some(result => !result.ownerScore);
    setSetting(db, 'calibration', report); await atomicWrite(path.join(config.data, 'knowledge/calibration.json'), report); res.json({ ok: true });
  }));
  app.get('/api/audition/:voice', asyncRoute(async (req, res) => { const item = setting(db, 'audition:' + req.params.voice); if (!item) throw new Error('Record this audition first.'); res.sendFile(await safeFile(config.data, item.path)); }));
  app.get('/api/assets', (req, res) => res.json(db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all().map(assetRecord)));
  app.post('/api/assets/upload', asyncRoute(async (req, res) => {
    const options = z.object({ kind: z.enum(['image', 'video', 'music', 'sfx']), generated: z.enum(['true', 'false']).default('false'), slotId: z.string().max(50).default(''), jobId: z.string().max(100).default(''), model: z.string().max(200).default(''), surface: z.string().max(200).default('') }).strict().parse(req.query);
    const uploaded = await multipart(req), setup = setting(db, 'setup', {}); let prompt = '';
    if (options.generated === 'true' && setup.visibleWatermark) throw new Error('Choose a generation surface without a visible watermark. The studio never removes marks.');
    if (options.jobId && options.slotId) { const job = getJob(db, options.jobId), request = job.artifacts.storyboard?.board.requests.find(slot => slot.id === options.slotId); if (!request) throw new Error('Unknown job slot.'); prompt = request.prompt; }
    const details = { name: uploaded.filename, generated: options.generated === 'true', slotId: options.slotId, prompt, provenance: { model: options.model || setup.imageModel || 'owner supplied', surface: options.surface || setup.imageSurface || 'owner supplied', createdAt: new Date().toISOString() } };
    let asset;
    if (options.kind === 'image') asset = await storeImage(config, db, uploaded.buffer, details);
    else { const id = await storeMedia(config, db, uploaded.buffer, { ...details, kind: options.kind }); asset = assetRecord(db.prepare('SELECT * FROM assets WHERE id=?').get(id)); }
    res.json(asset);
  }));
  app.get('/api/assets/:id/media', asyncRoute(async (req, res) => { const row = db.prepare('SELECT path FROM assets WHERE id=?').get(idSchema.parse(req.params.id)); if (!row) return res.sendStatus(404); res.sendFile(await safeFile(config.data, row.path)); }));
  app.put('/api/assets/:id/rights', (req, res, next) => { try { const input = rightsSchema.parse(req.body), asset = assetRecord(db.prepare('SELECT * FROM assets WHERE id=?').get(idSchema.parse(req.params.id))); if (!asset) throw new Error('Asset not found.'); if (asset.metadata.generated && !input.generated) throw new Error('Generated provenance cannot be removed.'); if (['image', 'video'].includes(asset.kind) && input.rights === 'cleared' && !input.generated && !input.consent) throw new Error('Confirm consent for identifiable people, or confirm this asset contains none.'); db.prepare('UPDATE assets SET rights=?,license_note=?,metadata=? WHERE id=?').run(input.rights, input.licenseNote, JSON.stringify({ ...asset.metadata, generated: input.generated, consent: input.consent, rightsReviewedAt: new Date().toISOString() }), asset.id); event(db, null, 'rights.reviewed', 'Asset rights reviewed.', { assetId: asset.id, rights: input.rights }); res.json({ ok: true }); } catch (error) { next(error); } });
  app.post('/api/assets/:id/index', (req, res, next) => { try { res.json(enqueue(db, null, 'index_asset', { assetId: idSchema.parse(req.params.id) })); } catch (error) { next(error); } });
  app.get('/api/captures', asyncRoute(async (req, res) => res.json(await capturesFor(config, db))));
  app.get('/api/captures/:id/media', asyncRoute(async (req, res) => { const clip = setting(db, 'captures', []).find(clip => clip.id === req.params.id); if (!clip) return res.sendStatus(404); res.sendFile(await safeFile(config.data, clip.path)); }));
  app.get('/api/captures/:id/reference', asyncRoute(async (req, res) => { const clip = setting(db, 'captures', []).find(clip => clip.id === req.params.id); if (!clip?.reference?.path) return res.sendStatus(404); res.sendFile(await safeFile(config.data, clip.reference.path)); }));
  app.post('/api/captures/:id/review', (req, res, next) => { try { const clip = setting(db, 'captures', []).find(clip => clip.id === req.params.id); if (!clip) throw new Error('Capture not found.'); recordReview(db, 'capture:' + clip.id, clip.digest, reviewSchema.parse(req.body)); res.json({ ok: true }); } catch (error) { next(error); } });
  app.post('/api/jobs', asyncRoute(async (req, res) => { const brief = briefSchema.parse(req.body); if (brief.focus !== 'auto' && !(await readKnowledge(config, db)).features.some(feature => feature.id === brief.focus)) throw new Error('Choose a product from the catalog.'); res.json(createJob(db, brief)); }));
  app.get('/api/jobs/:id', (req, res, next) => { try { res.json(getJob(db, idSchema.parse(req.params.id))); } catch (error) { next(error); } });
  app.post('/api/jobs/:id/run/:stage', asyncRoute(async (req, res) => {
    const stage = z.enum(['pitches', 'scripts', 'storyboard', 'voice', 'preview', 'music', 'final', 'export', 'vision_asset', 'revise_prompt', 'regenerate_scene']).parse(req.params.stage), job = getJob(db, idSchema.parse(req.params.id));
    const options = z.object({ sceneId: z.string().max(40).optional(), sfxIds: z.array(idSchema).max(3).optional(), pitchId: z.string().max(100).optional(), assetId: z.string().max(100).optional(), slotId: z.string().max(50).optional(), reason: z.string().max(1500).optional(), silent: z.boolean().optional(), debug: z.boolean().optional() }).strict().parse(req.body || {});
    res.json(enqueue(db, job.id, stage, { revision: job.revision, ...options }));
  }));
  app.put('/api/jobs/:id/scripts', asyncRoute(async (req, res) => { let job = getJob(db, req.params.id); const result = await validateEditedScripts(config, db, job, req.body.variants); job = revise(db, job.id, 'scripts', { scripts: { ...result, review: { passed: false, pending: true, edited: true } } }); enqueue(db, job.id, 'review_scripts', { revision: job.revision }); res.json(getJob(db, job.id)); }));
  app.put('/api/jobs/:id/timing', asyncRoute(async (req, res) => {
    const input = z.object({ seconds: z.number().int().min(20).max(40) }).strict().parse(req.body), job = getJob(db, req.params.id), brief = { ...job.brief, seconds: input.seconds };
    if (job.artifacts.scripts) await validateEditedScripts(config, db, { ...job, brief }, job.artifacts.scripts.variants);
    db.prepare('UPDATE jobs SET brief=? WHERE id=?').run(JSON.stringify(brief), job.id);
    res.json(revise(db, job.id, 'voice'));
  }));
  app.post('/api/jobs/:id/variant', asyncRoute(async (req, res) => { let job = getJob(db, req.params.id); const id = z.string().max(100).parse(req.body.id), variant = job.artifacts.scripts?.variants.find(variant => variant.id === id); if (!variant) throw new Error('Choose a script card first.'); if (!job.artifacts.scripts.review?.passed) throw new Error('Wait for the independent script review to pass before selecting a variant.'); await validateEditedScripts(config, db, job, job.artifacts.scripts.variants); if (job.artifacts.variant) job = revise(db, job.id, 'variant'); saveStage(db, job, 'variant', { variant }, 'variant_chosen'); res.json(getJob(db, job.id)); }));
  app.put('/api/jobs/:id/storyboard', asyncRoute(async (req, res) => {
    let job = getJob(db, req.params.id); const board = storyboardSchema.parse(req.body.board), knowledge = await readKnowledge(config, db), captures = await capturesFor(config, db);
    const errors = validateStoryboard(board, { knowledge, captures, variant: job.artifacts.variant?.variant }); if (errors.length) throw new Error(errors.join(' '));
    const old = job.artifacts.slots?.slots || {}, slots = Object.fromEntries(board.requests.map(request => [request.id, old[request.id] || { attempts: 0, review: 'pending', assetId: '' }]));
    job = revise(db, job.id, 'storyboard', { storyboard: { board }, slots: { slots } }); res.json(job);
  }));
  app.post('/api/jobs/:id/slots/:slotId/assign', (req, res, next) => { try {
    let job = getJob(db, req.params.id), slotId = idSchema.parse(req.params.slotId), board = job.artifacts.storyboard?.board, request = board?.requests.find(item => item.id === slotId), slots = { ...(job.artifacts.slots?.slots || {}) };
    const assetId = idSchema.parse(req.body.assetId), asset = assetRecord(db.prepare('SELECT * FROM assets WHERE id=?').get(assetId));
    if (!request || !asset || asset.kind !== request.kind) throw new Error('Choose media matching this slot.');
    if (request.use === 'finished_work' && asset.metadata.generated) throw new Error('Choose real cleared work for this slot. Generated media belongs in context scenes.');
    const entry = slots[slotId] || { attempts: 0 }; if (entry.attempts >= 3 && asset.metadata.generated) throw new Error('Three attempts reached. Change the scene or choose a cleared library asset.');
    slots[slotId] = { ...entry, assetId, attempts: entry.attempts + 1, vision: null, review: 'pending' };
    job = revise(db, job.id, 'slots', { slots: { slots } }); db.prepare("UPDATE jobs SET state='images_requested' WHERE id=?").run(job.id); res.json(getJob(db, job.id));
  } catch (error) { next(error); } });
  app.post('/api/jobs/:id/slots/:slotId/review', (req, res, next) => { try {
    const job = getJob(db, req.params.id), review = reviewSchema.parse(req.body), slotId = req.params.slotId, entry = job.artifacts.slots?.slots?.[slotId], request = job.artifacts.storyboard?.board.requests.find(item => item.id === slotId), asset = assetRecord(db.prepare('SELECT * FROM assets WHERE id=?').get(entry?.assetId));
    if (!asset || !request || !entry.vision) throw new Error('Run the vision review first.'); if (review.decision === 'approved' && (!entry.vision.passed || asset.rights !== 'cleared' || !asset.metadata.consent && (asset.metadata.subjects || []).length > 0)) throw new Error('Approval is blocked by vision, rights or missing consent.');
    recordReview(db, 'slot:' + job.id + ':' + slotId, hash({ asset: asset.sha256, prompt: request.prompt, rubric: entry.vision }), review); res.json({ ok: true });
  } catch (error) { next(error); } });
  app.post('/api/jobs/:id/review/:stage', (req, res, next) => { try { const job = getJob(db, req.params.id), stage = req.params.stage, item = job.artifacts[stage]; if (!approvalActions.has(stage) || !item) throw new Error('No reviewable render at this stage.'); const review = reviewSchema.parse(req.body); if (review.decision === 'approved' && (stage === 'preview' && item.silent || stage === 'final' && !item.passed)) throw new Error('Voiced preview or passing final QA is required.'); recordReview(db, stage + ':' + job.id, item._digest, review); if (review.decision === 'approved' && stage === 'preview') db.prepare("UPDATE jobs SET state='preview_approved' WHERE id=?").run(job.id); res.json({ ok: true }); } catch (error) { next(error); } });
  app.post('/api/jobs/:id/tweak', (req, res, next) => { try { const from = z.enum(['scripts', 'storyboard', 'slots', 'voice', 'preview', 'music', 'final']).parse(req.body.from); res.json(revise(db, req.params.id, from)); } catch (error) { next(error); } });
  app.get('/api/jobs/:id/file/:stage/:which', asyncRoute(async (req, res) => { const job = getJob(db, req.params.id), stage = z.enum(['voice', 'preview', 'final', 'export']).parse(req.params.stage), which = z.enum(['path', 'cover']).parse(req.params.which), relative = job.artifacts[stage]?.[which]; if (!relative) return res.sendStatus(404); const file = await safeFile(config.data, relative); if (stage === 'export') res.download(file, job.id + '.zip'); else res.sendFile(file); }));
  app.put('/api/jobs/:id/metrics', (req, res, next) => { try { const job = getJob(db, req.params.id), metrics = metricsSchema.parse(req.body); db.prepare('INSERT INTO metrics(job_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(job.id, JSON.stringify(metrics), Date.now()); res.json({ ok: true }); } catch (error) { next(error); } });
  app.get('/api/history.csv', (req, res) => {
    const fields = ['jobId', 'title', 'audience', 'feature', 'platform', 'angle', 'hookType', 'duration', 'cta', 'music', 'postedAt', 'views', 'likes', 'saves', 'profileClicks', 'linkClicks', 'signups'];
    const escape = value => '"' + String(value ?? '').replace(/^[=+\-@]/, "'$&").replaceAll('"', '""') + '"';
    const rows = db.prepare('SELECT id FROM jobs ORDER BY created_at DESC').all().map(({ id }) => { const job = getJob(db, id), variant = job.artifacts.variant?.variant; return [id, job.title, job.brief.audience, variant?.featureId || job.brief.focus, job.brief.platform, variant?.angle, variant?.hookType, job.artifacts.final?.info.duration, variant?.ctaId, job.artifacts.music?.assetId, ...fields.slice(10).map(field => job.metrics[field])].map(escape).join(','); });
    res.type('text/csv').attachment('veylo-video-history.csv').send([fields.join(','), ...rows].join('\r\n'));
  });
  app.post('/api/learnings', asyncRoute(async (req, res) => { const text = z.string().min(10).max(10000).parse(req.body.text); await atomicWrite(path.join(config.root, 'knowledge/learnings.md'), '# Approved learnings\n\nApproved ' + new Date().toISOString() + '\n\n' + text + '\n'); res.json({ ok: true }); }));
  app.get('/api/learnings', asyncRoute(async (req, res) => res.json({ text: await fs.readFile(path.join(config.root, 'knowledge/learnings.md'), 'utf8'), proposal: setting(db, 'learningProposal') })));
  app.post('/api/learnings/suggest', (req, res) => res.json(enqueue(db, null, 'suggest_learnings', { requestedAt: Date.now() })));
  app.post('/api/assets/index-cleared', (req, res) => { const assets = db.prepare("SELECT id,sha256,metadata FROM assets WHERE kind='image' AND rights='cleared'").all().filter(asset => !JSON.parse(asset.metadata).description); res.json({ queued: assets.map(asset => enqueue(db, null, 'index_asset', { assetId: asset.id, digest: asset.sha256 })).length }); });
  app.post('/api/tasks/:id/cancel', (req, res) => { db.prepare("UPDATE tasks SET cancelled=1,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END WHERE id=?").run(req.params.id); res.json({ ok: true }); });
  app.post('/api/tasks/:id/retry', (req, res, next) => { try { const task = db.prepare("SELECT * FROM tasks WHERE id=? AND state IN ('failed','cancelled')").get(req.params.id); if (!task) throw new Error('This task cannot be retried.'); res.json(enqueue(db, task.job_id, task.type, JSON.parse(task.payload))); } catch (error) { next(error); } });
  app.get('/api/events', (req, res) => res.json(db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100').all().map(row => ({ ...row, data: JSON.parse(row.data) }))));
  app.get('/api/*', (req, res) => res.status(404).json({ error: 'Studio endpoint not found.' }));
  app.get('/fonts/outfit.woff2', asyncRoute(async (req, res) => res.type('font/woff2').sendFile(await safeFile(config.repo, 'client/public/veylo/fonts/event-coverage/outfit-normal-latin.woff2'))));
  app.use(express.static(path.join(config.root, 'dist'), { index: false, dotfiles: 'deny' }));
  app.get('*', (req, res) => res.sendFile(path.join(config.root, 'dist/index.html')));
  app.use((error, req, res, next) => { if (res.headersSent) return next(error); res.status(error instanceof z.ZodError ? 400 : error.code === 'ENOENT' || error.message === 'Job not found.' ? 404 : 400).json({ error: redact(error instanceof z.ZodError ? error.issues.map(issue => issue.path.join('.') + ': ' + issue.message).join('; ') : error.message).slice(0, 3000) }); });
  const worker = overrides.worker === false ? null : startWorker(config, db, handlers);
  let backingUp = false;
  const backupTimer = setInterval(async () => { if (backingUp) return; backingUp = true; try { await snapshot(db, config); } catch (error) { event(db, null, 'backup.failed', error.message); } finally { backingUp = false; } }, 6 * 3600000); backupTimer.unref();
  let server;
  return { app, config, db, listen: () => new Promise((resolve, reject) => { server = app.listen(config.port, config.host, () => resolve(server)); server.on('error', reject); }), close: async () => { clearInterval(backupTimer); await worker?.stop(); if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await snapshot(db, config); db.close(); } };
}
