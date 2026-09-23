import express from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import ContentProject from '../models/ContentProject.js';
import AdminAudit from '../models/AdminAudit.js';
import WorkerHeartbeat from '../models/WorkerHeartbeat.js';
import { briefSchema, revisionSchema, BUSY } from '../contentStudio/schema.js';
import { normalizeImage, uploadMedia, studioError, mediaUrl, removeImage } from '../contentStudio/media.js';
import { providerReadiness } from '../contentStudio/providers.js';
import { presentProject } from '../contentStudio/presentation.js';
import { allowance } from '../contentStudio/allowance.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 2, parts: 3 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
const limited = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.admin._id), message: { message: 'Please wait a minute before starting more content actions.' } });
const action = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const owner = req => ({ ownerId: req.admin._id });
const idle = { 'job.status': { $nin: BUSY } };
const unlocked = () => ({ $or: [{ 'editLock.token': { $exists: false } }, { 'editLock.expiresAt': { $lt: new Date() } }] });
async function getProject(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw studioError('Campaign not found.', 404);
  const project = await ContentProject.findOne({ _id: req.params.id, ...owner(req) }).lean();
  if (!project) throw studioError('Campaign not found.', 404);
  return project;
}
async function audit(req, actionName, id) {
  await AdminAudit.create({ adminId: req.admin._id, action: `content.${actionName}`, resourceType: 'content-project', resourceId: String(id), ipAddress: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 500) });
}
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/status', action(async (req, res) => {
  const heartbeat = await WorkerHeartbeat.findOne({ workerName: 'content-studio' }).sort({ heartbeatAt: -1 }).lean();
  res.json({ providers: providerReadiness(), workerOnline: Boolean(heartbeat && Date.now() - new Date(heartbeat.heartbeatAt).getTime() < 90_000), allowance: await allowance() });
}));
router.get('/projects', action(async (req, res) => {
  const page = Math.max(0, Math.min(10000, parseInt(req.query.page, 10) || 0));
  const projects = await ContentProject.find(owner(req)).sort({ updatedAt: -1 }).skip(page * 24).limit(25).select('title brief job.status job.progress createdAt updatedAt').lean();
  res.json({ projects: projects.slice(0, 24).map(project => ({ id: String(project._id), title: project.title, formats: project.brief.formats, status: project.job.status, updatedAt: project.updatedAt })), hasMore: projects.length > 24 });
}));
router.post('/projects', limited, action(async (req, res) => {
  const brief = briefSchema.parse(req.body);
  const project = await ContentProject.create({ ...owner(req), title: brief.title, brief });
  await audit(req, 'create', project._id);
  res.status(201).json({ project: presentProject(project.toObject()) });
}));
router.get('/projects/:id', action(async (req, res) => res.json({ project: presentProject(await getProject(req)) })));
router.patch('/projects/:id', limited, action(async (req, res) => {
  await getProject(req);
  const brief = briefSchema.parse(req.body);
  const project = await ContentProject.findOneAndUpdate({ _id: req.params.id, ...owner(req), ...idle, ...unlocked() }, { $set: { brief, title: brief.title } }, { new: true }).lean();
  if (!project) throw studioError('Wait for the current job or upload to finish.', 409);
  res.json({ project: presentProject(project) });
}));
router.post('/projects/:id/assets', limited, (req, res, next) => upload.single('image')(req, res, error => {
  if (error) return next(studioError(error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 15 MB or smaller.' : 'Upload one JPEG, PNG, or WebP image at a time.'));
  next();
}), action(async (req, res) => {
  await getProject(req);
  if (!req.file) throw studioError('Choose a JPEG, PNG, or WebP image. Videos are not accepted.');
  const kind = req.body.kind === 'screenshot' ? 'screenshot' : 'photo';
  const token = crypto.randomUUID();
  const project = await ContentProject.findOneAndUpdate({ _id: req.params.id, ...owner(req), ...idle, ...unlocked(), 'assets.23': { $exists: false } }, { $set: { editLock: { token, expiresAt: new Date(Date.now() + 180_000) } } }, { new: true }).lean();
  if (!project) throw studioError('A campaign holds up to 24 images. Wait for any running job or upload to finish.', 409);
  let uploaded;
  try {
    const normalized = await normalizeImage(req.file.buffer);
    const id = crypto.randomUUID();
    uploaded = await uploadMedia(normalized.buffer, { projectId: project._id, key: `assets/${id}` });
    const asset = { id, kind, name: req.file.originalname.replace(/[<>\u0000-\u001f]/g, '').slice(0, 120), publicId: uploaded.public_id, width: normalized.width, height: normalized.height, bytes: uploaded.bytes };
    const result = await ContentProject.findOneAndUpdate({ _id: project._id, 'editLock.token': token }, { $push: { assets: asset }, $unset: { editLock: 1 } }, { new: true }).lean();
    if (!result) throw studioError('The upload lock expired. Please retry.', 409);
    res.status(201).json({ project: presentProject(result) });
  } catch (error) {
    if (uploaded) await removeImage(uploaded.public_id).catch(() => {});
    throw error;
  } finally { await ContentProject.updateOne({ _id: project._id, 'editLock.token': token }, { $unset: { editLock: 1 } }); }
}));
router.delete('/projects/:id/assets/:assetId', limited, action(async (req, res) => {
  const project = await getProject(req);
  if (project.versions.length) throw studioError('Images used by saved versions cannot be removed. Start a new campaign to use a different collection.', 409);
  const asset = project.assets.find(value => value.id === req.params.assetId);
  if (!asset) throw studioError('Image not found.', 404);
  const result = await ContentProject.findOneAndUpdate({ _id: project._id, ...idle, ...unlocked(), 'versions.0': { $exists: false } }, { $pull: { assets: { id: asset.id } } }, { new: true }).lean();
  if (!result) throw studioError('Wait for the current job to finish.', 409);
  await removeImage(asset.publicId);
  res.json({ project: presentProject(result) });
}));

router.post('/projects/:id/jobs', limited, action(async (req, res) => {
  const project = await getProject(req);
  const kind = req.body.kind;
  if (!['generate', 'revise', 'render'].includes(kind)) throw studioError('Choose a valid content action.');
  const previous = project.versions.find(version => version.id === project.activeVersionId);
  if (kind !== 'generate' && !previous) throw studioError('Generate a campaign before revising or exporting it.');
  if (kind !== 'render' && project.versions.length >= 12) throw studioError('This campaign has 12 versions. Start a new campaign for another direction.');
  const revision = kind === 'revise' ? revisionSchema.parse({ instruction: req.body.instruction, ...(req.body.sceneId ? { sceneId: req.body.sceneId } : {}) }) : {};
  if (revision.sceneId && !previous.plan.scenes.some(scene => scene.id === revision.sceneId)) throw studioError('That scene does not exist.');
  const providers = providerReadiness();
  if (!providers.storage || (kind !== 'render' && !providers.ai)) throw studioError('Configure content storage and the creative service before generating.', 503);
  if (project.brief.formats.includes('video') && project.brief.narration && !providers.voice) throw studioError('Configure voice-over or turn it off in the campaign settings.', 503);
  const budget = await allowance();
  if (budget.used >= budget.limit) throw studioError('The daily generation allowance is used up.', 429);
  const job = { id: crypto.randomUUID(), kind, status: 'queued', stage: 'Waiting for the content worker', progress: 0, versionId: kind === 'render' ? project.activeVersionId : crypto.randomUUID(), ...revision, queuedAt: new Date(), attempts: 0, cancelRequested: false };
  const updated = await ContentProject.findOneAndUpdate({ _id: project._id, ...owner(req), ...idle, ...unlocked() }, { $set: { job } }, { new: true }).lean();
  if (!updated) throw studioError('There is already a job or upload running for this campaign.', 409);
  await audit(req, kind, project._id);
  res.status(202).json({ project: presentProject(updated) });
}));
router.post('/projects/:id/retry', limited, action(async (req, res) => {
  const project = await getProject(req);
  if (project.job.attempts >= 5) throw studioError('This job has reached five attempts. Generate a new version instead.');
  const updated = await ContentProject.findOneAndUpdate({ _id: project._id, 'job.status': { $in: ['failed', 'cancelled'] }, ...unlocked() }, { $set: { 'job.status': 'queued', 'job.cancelRequested': false, 'job.error': '', 'job.stage': 'Queued to resume', 'job.queuedAt': new Date() } }, { new: true }).lean();
  if (!updated) throw studioError('Only a failed or cancelled job can be retried.', 409);
  await audit(req, 'retry', project._id);
  res.status(202).json({ project: presentProject(updated) });
}));
router.post('/projects/:id/cancel', limited, action(async (req, res) => {
  const project = await getProject(req);
  if (!BUSY.includes(project.job.status)) throw studioError('There is no running job to cancel.', 409);
  await ContentProject.updateOne({ _id: project._id, 'job.id': project.job.id, 'job.status': 'queued' }, { $set: { 'job.status': 'cancelled', 'job.stage': 'Cancelled' } });
  await ContentProject.updateOne({ _id: project._id, 'job.id': project.job.id, 'job.status': 'running' }, { $set: { 'job.cancelRequested': true } });
  await audit(req, 'cancel', project._id);
  res.json({ project: presentProject(await getProject(req)) });
}));
router.get('/projects/:id/download/:versionId/:outputId', action(async (req, res) => {
  const project = await getProject(req);
  const version = project.versions.find(value => value.id === req.params.versionId);
  const output = version?.outputs?.find(value => value.id === req.params.outputId);
  if (!output) throw studioError('Export not found.', 404);
  res.json({ url: mediaUrl(output.publicId, { resourceType: output.format === 'video' ? 'video' : 'image', format: output.format === 'video' ? 'mp4' : 'png', download: true }) });
}));
router.use((error, req, res, next) => {
  if (error.name === 'ZodError') return res.status(400).json({ message: 'Check the campaign settings. Use plain text and select at least one output format.' });
  if (!error.safe) console.error('[content-studio/api]', error.name || 'Error');
  res.status(error.safe ? error.status : 500).json({ message: error.safe ? error.message : 'Content Studio could not complete that action. Please retry.' });
});
export default router;
