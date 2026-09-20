import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import StorageAsset from '../models/StorageAsset.js';
import VolumeAccessCode from '../models/VolumeAccessCode.js';
import VolumeJob from '../models/VolumeJob.js';
import VolumeSubject from '../models/VolumeSubject.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { sendVolumeAccessEmail } from '../services/email.service.js';
import { signedImageUrl } from '../services/deliveryMedia.service.js';
import { codeDigest, normalizeEmail, safeEqual } from '../utils/auth.js';

const createSchema = z.object({ title: z.string().trim().min(3).max(120), organisation: z.string().trim().min(2).max(120), category: z.enum(['school', 'sports', 'corporate', 'other']) }).strict();
const updateSchema = createSchema.partial().strict();
const subjectsSchema = z.object({ subjects: z.array(z.object({ recipientCode: z.string().trim().min(3).max(40).regex(/^[a-z0-9_-]+$/i), displayName: z.string().trim().min(2).max(100), email: z.email().max(254) }).strict()).min(1).max(1000) }).strict();
const subjectUpdateSchema = z.object({ recipientCode: z.string().trim().min(3).max(40).regex(/^[a-z0-9_-]+$/i), displayName: z.string().trim().min(2).max(100), email: z.email().max(254) }).strict();
const assignmentSchema = z.object({ assetIds: z.array(z.string().uuid()).max(500) }).strict();
const requestSchema = z.object({ recipientCode: z.string().trim().min(3).max(40), email: z.email().max(254) }).strict();
const verifySchema = requestSchema.extend({ code: z.string().regex(/^\d{6}$/) }).strict();

function validation(res, parsed) {
  return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Check the information you entered.' });
}

async function ownedJob(id, userId) {
  return VolumeJob.findOne({ _id: id, userId });
}

async function requirePro(userId) {
  const user = await User.findById(userId);
  if (!user) return false;
  const entitlements = await resolveEntitlements(user, { includeUsage: false });
  return entitlements.plan === 'pro';
}

export async function listVolumeJobs(req, res) {
  try {
    const jobs = await VolumeJob.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: jobs, limits: { subjects: 1000, assignedPhotos: 5000 } });
  } catch {
    res.status(500).json({ success: false, message: 'We could not open your volume deliveries.' });
  }
}

export async function createVolumeJob(req, res) {
  try {
    if (!(await requirePro(req.user.id))) return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Volume Delivery is available to Pro studios during beta.' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return validation(res, parsed);
    const job = await VolumeJob.create({ userId: req.user.id, ...parsed.data });
    res.status(201).json({ success: true, data: job, limits: { subjects: 1000, assignedPhotos: 5000 } });
  } catch (error) {
    console.error('[volume/create]', error.message);
    res.status(500).json({ success: false, message: 'We could not start this volume delivery.' });
  }
}

export async function getVolumeJob(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, message: 'Volume delivery not found.' });
    const subjects = await VolumeSubject.find({ jobId: job._id, userId: req.user.id }).select('-email').sort({ displayName: 1 }).lean();
    res.json({ success: true, data: { ...job.toObject(), subjects }, limits: { subjects: 1000, assignedPhotos: 5000 } });
  } catch {
    res.status(500).json({ success: false, message: 'We could not open this volume delivery.' });
  }
}

export async function updateVolumeJob(req, res) {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return validation(res, parsed);
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'Only draft volume deliveries can be edited.' });
    Object.assign(job, parsed.data);
    await job.save();
    res.json({ success: true, data: job });
  } catch (error) {
    console.error('[volume/update]', error.message);
    res.status(500).json({ success: false, message: 'We could not save those job details.' });
  }
}

export async function archiveVolumeJob(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, message: 'Volume delivery not found.' });
    job.status = 'archived';
    job.archivedAt = new Date();
    job.accessVersion = Number(job.accessVersion || 1) + 1;
    await job.save();
    res.json({ success: true, message: 'Volume delivery archived.' });
  } catch {
    res.status(500).json({ success: false, message: 'We could not archive this volume delivery.' });
  }
}

export async function deleteVolumeJob(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'Only draft volume deliveries can be deleted.' });
    await Promise.all([
      VolumeSubject.deleteMany({ jobId: job._id, userId: req.user.id }),
      VolumeAccessCode.deleteMany({ jobId: job._id }),
      VolumeJob.deleteOne({ _id: job._id, userId: req.user.id })
    ]);
    res.json({ success: true, message: 'Draft volume delivery deleted.' });
  } catch {
    res.status(500).json({ success: false, message: 'We could not delete this volume delivery.' });
  }
}

export async function addVolumeSubjects(req, res) {
  try {
    const parsed = subjectsSchema.safeParse(req.body);
    if (!parsed.success) return validation(res, parsed);
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'This draft is not available.' });
    const normalized = parsed.data.subjects.map(subject => ({ ...subject, recipientCode: subject.recipientCode.toUpperCase(), email: normalizeEmail(subject.email) }));
    if (new Set(normalized.map(subject => subject.recipientCode)).size !== normalized.length) return res.status(409).json({ success: false, message: 'Each recipient code must be unique.' });
    const existingCount = await VolumeSubject.countDocuments({ jobId: job._id });
    if (existingCount + normalized.length > 1000) return res.status(403).json({ success: false, message: 'A volume delivery can contain up to 1,000 recipients.' });
    const existing = await VolumeSubject.exists({ jobId: job._id, recipientCode: { $in: normalized.map(subject => subject.recipientCode) } });
    if (existing) return res.status(409).json({ success: false, message: 'One or more recipient codes are already in this delivery.' });
    const created = await VolumeSubject.insertMany(normalized.map(subject => ({ ...subject, jobId: job._id, userId: req.user.id })));
    job.subjectCount = existingCount + created.length;
    await job.save();
    res.status(201).json({ success: true, data: created.map(subject => ({ _id: subject._id, recipientCode: subject.recipientCode, displayName: subject.displayName, assetIds: [] })), subjectCount: job.subjectCount });
  } catch (error) {
    console.error('[volume/subjects]', error.message);
    res.status(500).json({ success: false, message: 'We could not add those recipients.' });
  }
}

export async function updateVolumeSubject(req, res) {
  try {
    const parsed = subjectUpdateSchema.safeParse(req.body);
    if (!parsed.success) return validation(res, parsed);
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'This draft is not available.' });
    const normalized = { ...parsed.data, recipientCode: parsed.data.recipientCode.toUpperCase(), email: normalizeEmail(parsed.data.email) };
    const conflict = await VolumeSubject.exists({ jobId: job._id, _id: { $ne: req.params.subjectId }, recipientCode: normalized.recipientCode });
    if (conflict) return res.status(409).json({ success: false, message: 'That recipient code is already in this delivery.' });
    const subject = await VolumeSubject.findOneAndUpdate({ _id: req.params.subjectId, jobId: job._id, userId: req.user.id }, normalized, { new: true, runValidators: true }).select('-email');
    if (!subject) return res.status(404).json({ success: false, message: 'Recipient not found.' });
    await VolumeAccessCode.deleteMany({ subjectId: subject._id });
    res.json({ success: true, data: subject });
  } catch (error) {
    console.error('[volume/subject-update]', error.message);
    res.status(500).json({ success: false, message: 'We could not update that recipient.' });
  }
}

export async function deleteVolumeSubject(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'This draft is not available.' });
    const subject = await VolumeSubject.findOneAndDelete({ _id: req.params.subjectId, jobId: job._id, userId: req.user.id });
    if (!subject) return res.status(404).json({ success: false, message: 'Recipient not found.' });
    await VolumeAccessCode.deleteMany({ subjectId: subject._id });
    job.subjectCount = Math.max(0, job.subjectCount - 1);
    job.assignedPhotoCount = Math.max(0, job.assignedPhotoCount - subject.assetIds.length);
    await job.save();
    res.json({ success: true, data: { subjectCount: job.subjectCount, assignedPhotoCount: job.assignedPhotoCount } });
  } catch {
    res.status(500).json({ success: false, message: 'We could not remove that recipient.' });
  }
}

export async function assignVolumePhotos(req, res) {
  try {
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) return validation(res, parsed);
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'This draft is not available.' });
    const subject = await VolumeSubject.findOne({ _id: req.params.subjectId, jobId: job._id, userId: req.user.id });
    if (!subject) return res.status(404).json({ success: false, message: 'Recipient not found.' });
    const uniqueIds = [...new Set(parsed.data.assetIds)];
    const ownedCount = await StorageAsset.countDocuments({ userId: req.user.id, assetId: { $in: uniqueIds } });
    if (ownedCount !== uniqueIds.length) return res.status(400).json({ success: false, message: 'One or more photographs are not in your Veylo library.' });
    const nextTotal = job.assignedPhotoCount - subject.assetIds.length + uniqueIds.length;
    if (nextTotal > 5000) return res.status(403).json({ success: false, message: 'A volume delivery can contain up to 5,000 recipient-photo assignments.' });
    subject.assetIds = uniqueIds;
    await subject.save();
    job.assignedPhotoCount = nextTotal;
    await job.save();
    res.json({ success: true, data: { _id: subject._id, recipientCode: subject.recipientCode, displayName: subject.displayName, assetIds: subject.assetIds }, assignedPhotoCount: nextTotal });
  } catch (error) {
    console.error('[volume/assign]', error.message);
    res.status(500).json({ success: false, message: 'We could not assign those photographs.' });
  }
}

export async function autoAssignVolumePhotos(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'This draft is not available.' });
    const [subjects, assets] = await Promise.all([
      VolumeSubject.find({ jobId: job._id, userId: req.user.id }).sort({ recipientCode: 1 }),
      StorageAsset.find({ userId: req.user.id }).select('assetId originalFilename').lean()
    ]);
    if (!subjects.length || !assets.length) return res.status(400).json({ success: false, message: 'Add recipients and upload the named photographs to your library first.' });

    const matchers = subjects.map(subject => {
      const escaped = subject.recipientCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { subject, pattern: new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i') };
    });
    const matches = new Map(subjects.map(subject => [String(subject._id), []]));
    const ambiguousFiles = [];
    for (const asset of assets) {
      const filename = String(asset.originalFilename || '').toUpperCase();
      const owners = matchers.filter(item => item.pattern.test(filename)).map(item => item.subject);
      if (owners.length === 1) matches.get(String(owners[0]._id)).push(asset.assetId);
      if (owners.length > 1) ambiguousFiles.push(asset.originalFilename || asset.assetId);
    }

    const assignments = subjects.map(subject => {
      const matched = [...new Set(matches.get(String(subject._id)))].slice(0, 500);
      return { subject, matched: matched.length > 0, assetIds: matched.length ? matched : subject.assetIds };
    });
    const assignedPhotoCount = assignments.reduce((total, item) => total + item.assetIds.length, 0);
    if (assignedPhotoCount > 5000) return res.status(403).json({ success: false, message: 'The filename matches exceed the 5,000 assignment limit. Split this into two volume deliveries.' });
    await VolumeSubject.bulkWrite(assignments.map(item => ({ updateOne: { filter: { _id: item.subject._id, jobId: job._id }, update: { $set: { assetIds: item.assetIds } } } })));
    job.assignedPhotoCount = assignedPhotoCount;
    await job.save();
    const unmatchedRecipients = assignments.filter(item => !item.matched).map(item => ({ recipientCode: item.subject.recipientCode, displayName: item.subject.displayName, existingAssignments: item.subject.assetIds.length }));
    res.json({ success: true, data: { matchedRecipients: assignments.filter(item => item.matched).length, totalRecipients: assignments.length, assignedPhotoCount, unmatchedRecipients, ambiguousFiles: ambiguousFiles.slice(0, 100) } });
  } catch (error) {
    console.error('[volume/auto-assign]', error.message);
    res.status(500).json({ success: false, message: 'We could not match the filenames to recipients.' });
  }
}

export async function publishVolumeJob(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'This draft is not available.' });
    if (!job.subjectCount || !job.assignedPhotoCount) return res.status(400).json({ success: false, message: 'Add recipients and assign photographs before publishing.' });
    const recipientsWithoutPhotos = await VolumeSubject.countDocuments({ jobId: job._id, userId: req.user.id, 'assetIds.0': { $exists: false } });
    if (recipientsWithoutPhotos) return res.status(409).json({ success: false, message: `${recipientsWithoutPhotos} recipient${recipientsWithoutPhotos === 1 ? '' : 's'} still need photographs before publishing.` });
    job.status = 'published';
    job.publishedAt = new Date();
    await job.save();
    res.json({ success: true, data: { publicId: job.publicId, url: `${String(process.env.CLIENT_URL || '').replace(/\/$/, '')}/volume/${job.publicId}` } });
  } catch {
    res.status(500).json({ success: false, message: 'We could not publish this volume delivery.' });
  }
}

function csvCell(value) {
  const raw = String(value ?? '');
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportVolumeJob(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ success: false, message: 'Volume delivery not found.' });
    const subjects = await VolumeSubject.find({ jobId: job._id, userId: req.user.id }).select('+email').sort({ displayName: 1 }).lean();
    const rows = [
      ['recipient_code', 'name', 'email', 'photograph_count'],
      ...subjects.map(subject => [subject.recipientCode, subject.displayName, subject.email, subject.assetIds.length])
    ];
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${job.title.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'volume-delivery'}.csv"`, 'Cache-Control': 'private, no-store' });
    res.send(csv);
  } catch {
    res.status(500).json({ success: false, message: 'We could not export this volume delivery.' });
  }
}

async function publicSubject(publicId, recipientCode, email) {
  const job = await VolumeJob.findOne({ publicId, status: 'published' });
  if (!job) return {};
  const subject = await VolumeSubject.findOne({ jobId: job._id, recipientCode: recipientCode.toUpperCase(), email: normalizeEmail(email) }).select('+email');
  return { job, subject };
}

export async function requestVolumeCode(req, res) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return validation(res, parsed);
  try {
    const { job, subject } = await publicSubject(req.params.publicId, parsed.data.recipientCode, parsed.data.email);
    if (job && subject) {
      const recentlySent = await VolumeAccessCode.exists({ subjectId: subject._id, createdAt: { $gt: new Date(Date.now() - 60 * 1000) } });
      if (!recentlySent) {
        const code = String(crypto.randomInt(100000, 1000000));
        await VolumeAccessCode.deleteMany({ subjectId: subject._id });
        await VolumeAccessCode.create({ jobId: job._id, subjectId: subject._id, codeDigest: codeDigest(subject.email, `volume:${subject._id}`, code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
        await sendVolumeAccessEmail({ to: subject.email, name: subject.displayName, code, organisation: job.organisation });
      }
    }
    res.json({ success: true, message: 'If those details match the delivery, a six-digit code has been sent.' });
  } catch (error) {
    console.error('[volume/access-request]', error.message);
    res.status(500).json({ success: false, message: 'We could not send the access code.' });
  }
}

export async function verifyVolumeCode(req, res) {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return validation(res, parsed);
  try {
    const { job, subject } = await publicSubject(req.params.publicId, parsed.data.recipientCode, parsed.data.email);
    if (!job || !subject) return res.status(403).json({ success: false, message: 'Those details or the code are not correct.' });
    const access = await VolumeAccessCode.findOne({ subjectId: subject._id, usedAt: null, expiresAt: { $gt: new Date() } }).select('+codeDigest');
    if (!access || access.attempts >= 5) return res.status(403).json({ success: false, message: 'That code has expired. Request a new one.' });
    const expected = codeDigest(subject.email, `volume:${subject._id}`, parsed.data.code);
    if (!safeEqual(access.codeDigest, expected)) {
      access.attempts += 1;
      await access.save();
      return res.status(403).json({ success: false, message: 'Those details or the code are not correct.' });
    }
    access.usedAt = new Date();
    await access.save();
    const accessToken = jwt.sign({ jobId: String(job._id), subjectId: String(subject._id), accessVersion: job.accessVersion || 1 }, process.env.JWT_SECRET, { expiresIn: '12h', issuer: 'veylo-api', audience: 'veylo-volume' });
    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(500).json({ success: false, message: 'We could not verify that code.' });
  }
}

export async function getVolumeGallery(req, res) {
  try {
    const payload = jwt.verify(req.get('x-volume-access') || '', process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-volume' });
    const job = await VolumeJob.findOne({ _id: payload.jobId, publicId: req.params.publicId, status: 'published' }).populate('userId', 'name studio avatar');
    const subject = job && Number(payload.accessVersion || 1) === Number(job.accessVersion || 1) ? await VolumeSubject.findOne({ _id: payload.subjectId, jobId: job._id }) : null;
    if (!job || !subject) return res.status(403).json({ success: false, message: 'Open this gallery with a new access code.' });
    const assets = await StorageAsset.find({ userId: job.userId._id, assetId: { $in: subject.assetIds } }).lean();
    const byId = new Map(assets.map(asset => [asset.assetId, asset]));
    const photos = subject.assetIds.map(assetId => byId.get(assetId)).filter(Boolean).map(asset => ({ assetId: asset.assetId, url: signedImageUrl(asset.publicId), thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }), width: asset.width, height: asset.height }));
    res.json({ success: true, data: { title: job.title, organisation: job.organisation, recipientName: subject.displayName, studio: job.userId.studio?.name || job.userId.name, photos } });
  } catch {
    res.status(403).json({ success: false, message: 'Open this gallery with a new access code.' });
  }
}
