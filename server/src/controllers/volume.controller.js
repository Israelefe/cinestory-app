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
const subjectsSchema = z.object({ subjects: z.array(z.object({ recipientCode: z.string().trim().min(3).max(40).regex(/^[a-z0-9_-]+$/i), displayName: z.string().trim().min(2).max(100), email: z.email().max(254) }).strict()).min(1).max(1000) }).strict();
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

export async function publishVolumeJob(req, res) {
  try {
    const job = await ownedJob(req.params.id, req.user.id);
    if (!job || job.status !== 'draft') return res.status(404).json({ success: false, message: 'This draft is not available.' });
    if (!job.subjectCount || !job.assignedPhotoCount) return res.status(400).json({ success: false, message: 'Add recipients and assign photographs before publishing.' });
    job.status = 'published';
    job.publishedAt = new Date();
    await job.save();
    res.json({ success: true, data: { publicId: job.publicId, url: `${String(process.env.CLIENT_URL || '').replace(/\/$/, '')}/volume/${job.publicId}` } });
  } catch {
    res.status(500).json({ success: false, message: 'We could not publish this volume delivery.' });
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
    const accessToken = jwt.sign({ jobId: String(job._id), subjectId: String(subject._id) }, process.env.JWT_SECRET, { expiresIn: '12h', issuer: 'veylo-api', audience: 'veylo-volume' });
    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(500).json({ success: false, message: 'We could not verify that code.' });
  }
}

export async function getVolumeGallery(req, res) {
  try {
    const payload = jwt.verify(req.get('x-volume-access') || '', process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-volume' });
    const job = await VolumeJob.findOne({ _id: payload.jobId, publicId: req.params.publicId, status: 'published' }).populate('userId', 'name studio avatar');
    const subject = job ? await VolumeSubject.findOne({ _id: payload.subjectId, jobId: job._id }) : null;
    if (!job || !subject) return res.status(403).json({ success: false, message: 'Open this gallery with a new access code.' });
    const assets = await StorageAsset.find({ userId: job.userId._id, assetId: { $in: subject.assetIds } }).lean();
    const byId = new Map(assets.map(asset => [asset.assetId, asset]));
    const photos = subject.assetIds.map(assetId => byId.get(assetId)).filter(Boolean).map(asset => ({ assetId: asset.assetId, url: signedImageUrl(asset.publicId), thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }), width: asset.width, height: asset.height }));
    res.json({ success: true, data: { title: job.title, organisation: job.organisation, recipientName: subject.displayName, studio: job.userId.studio?.name || job.userId.name, photos } });
  } catch {
    res.status(403).json({ success: false, message: 'Open this gallery with a new access code.' });
  }
}
