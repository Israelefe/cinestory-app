import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { confirmStorageUpload, createStorageUploadSignature, removeStorageAsset } from '../services/storageMedia.service.js';
import { signedImageUrl } from '../services/deliveryMedia.service.js';
import { randomToken } from '../utils/auth.js';
import { recordPaidUsage } from '../services/paidUsage.service.js';
import { mediaOffloadEnabled } from '../services/cloudflareMedia.service.js';

const rawFormats = new Set(['arw', 'cr2', 'cr3', 'dng', 'nef', 'nrw', 'orf', 'rw2', 'raf', 'pef', 'srw', '3fr', 'iiq', 'mos', 'mef', 'mrw', 'rwl', 'x3f']);
const imageFormats = new Set(['jpg', 'jpeg', 'png', 'webp']);
const createSchema = z.object({
  kind: z.enum(['preselection', 'editor-handoff']),
  title: z.string().trim().min(1).max(100),
  clientName: z.string().trim().max(100).default(''),
  note: z.string().trim().max(500).default(''),
  assetIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(500),
  expiresInDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]).default(30),
  pin: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72).optional()
}).strict();
const uploadConfirmSchema = z.object({
  objectKey: z.string().min(5).max(1000),
  uploadToken: z.string().min(20).max(4000),
  sourceAssetId: z.string().regex(/^[a-f\d]{24}$/i),
  originalFilename: z.string().trim().max(180).default('edited-photograph')
}).strict();

function safeAsset(asset) {
  return {
    id: String(asset._id),
    originalFilename: asset.originalFilename || 'Photograph',
    format: asset.rawFormat || asset.format,
    width: asset.width || null,
    height: asset.height || null,
    bytes: Number(asset.bytes || 0),
    rawOriginal: Boolean(asset.rawPublicId),
    sourceBytes: Number(asset.rawBytes || asset.bytes || 0)
  };
}

function accessToken(collaboration) {
  if (!process.env.JWT_SECRET) throw Object.assign(new Error('Secure sharing is temporarily unavailable.'), { status: 503 });
  return jwt.sign({ collaborationId: String(collaboration._id), publicId: collaboration.publicId, purpose: 'library-collaboration' }, process.env.JWT_SECRET, {
    expiresIn: '12h', issuer: 'veylo-api', audience: 'veylo-library-collaboration'
  });
}

function verifyAccessToken(token, collaboration) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-library-collaboration' });
    if (payload.purpose !== 'library-collaboration' || payload.publicId !== collaboration.publicId || payload.collaborationId !== String(collaboration._id)) throw new Error('invalid scope');
    return true;
  } catch {
    throw Object.assign(new Error('Open this link and enter its access details again.'), { status: 401 });
  }
}

async function activeProFor(userId) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('The photographer account is no longer available.'), { status: 410 });
  const entitlements = await resolveEntitlements(user, { includeUsage: false });
  if (entitlements.features.storageMode !== 'read-write') throw Object.assign(new Error('This sharing link is no longer active.'), { status: 410 });
  return { user, entitlements };
}

async function publicCollaboration(publicId, { includePin = false, includePassword = false } = {}) {
  let query = LibraryCollaboration.findOne({ publicId });
  if (includePin) query = query.select('+pinDigest');
  if (includePassword) query = query.select('+passwordDigest');
  const collaboration = await query;
  if (!collaboration || collaboration.status === 'revoked' || collaboration.expiresAt <= new Date()) throw Object.assign(new Error('This sharing link has expired or was closed.'), { status: 410 });
  const { user } = await activeProFor(collaboration.userId);
  return { collaboration, user };
}

async function authorizedPublic(req) {
  const { collaboration, user } = await publicCollaboration(req.params.publicId);
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '') || String(req.query.access_token || '');
  verifyAccessToken(token, collaboration);
  return { collaboration, user };
}

async function collaborationAssets(collaboration) {
  const rows = await StorageAsset.find({ userId: collaboration.userId, _id: { $in: collaboration.assetIds } }).lean();
  const byId = new Map(rows.map(row => [String(row._id), row]));
  return collaboration.assetIds.map(id => byId.get(String(id))).filter(Boolean);
}

function mediaUrl(publicId, assetId, kind) {
  return `/api/v1/storage/public/${encodeURIComponent(publicId)}/media/${encodeURIComponent(String(assetId))}`;
}

function publicContentUrl(req, assetId, kind) {
  const base = mediaUrl(req.params.publicId, assetId, kind);
  return `${base}?access_token=${encodeURIComponent(String(req.query.access_token || '').replace(/^Bearer\s+/i, ''))}`;
}

function ownerRecord(collaboration) {
  const value = collaboration.toObject();
  delete value.pinDigest;
  delete value.passwordDigest;
  return value;
}

async function publicSourceAsset(collaboration, assetId) {
  if (!/^[a-f\d]{24}$/i.test(String(assetId || '')) || !collaboration.assetIds.some(id => String(id) === String(assetId))) return null;
  return StorageAsset.findOne({ _id: assetId, userId: collaboration.userId }).lean();
}

export async function listLibraryCollaborations(req, res) {
  try {
    const rows = await LibraryCollaboration.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100).lean();
    const allIds = [...new Set(rows.flatMap(row => [...row.assetIds, ...(row.selectedAssetIds || []), ...(row.returnedAssets || []).flatMap(item => [item.sourceAssetId, item.assetId])]).map(String))];
    const assets = await StorageAsset.find({ userId: req.user.id, _id: { $in: allIds } }).select('originalFilename format rawFormat width height bytes').lean();
    const names = new Map(assets.map(asset => [String(asset._id), asset.originalFilename || 'Photograph']));
    res.json({ success: true, data: rows.map(row => ({
      ...row,
      selectedFilenames: (row.selectedAssetIds || []).map(id => names.get(String(id))).filter(Boolean),
      returned: (row.returnedAssets || []).map(item => ({ sourceAssetId: String(item.sourceAssetId), assetId: String(item.assetId), sourceFilename: names.get(String(item.sourceAssetId)) || 'Photograph', filename: names.get(String(item.assetId)) || 'Edited photograph', uploadedAt: item.uploadedAt }))
    })) });
  } catch {
    res.status(500).json({ success: false, message: 'We could not load your sharing links.' });
  }
}

export async function createLibraryCollaboration(req, res) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    if (parsed.data.kind === 'editor-handoff' && !parsed.data.password) return res.status(400).json({ success: false, message: 'Set a password for the editor link.' });
    const { entitlements } = await activeProFor(req.user.id);
    const assetIds = [...new Set(parsed.data.assetIds)];
    if (assetIds.length !== parsed.data.assetIds.length) return res.status(400).json({ success: false, message: 'Remove duplicate photographs from this link.' });
    const assets = await StorageAsset.find({ _id: { $in: assetIds }, userId: req.user.id }).select('_id').lean();
    if (assets.length !== assetIds.length) return res.status(400).json({ success: false, message: 'Choose photographs from your own image library.' });
    const pinDigest = parsed.data.kind === 'preselection' && parsed.data.pin ? await bcrypt.hash(parsed.data.pin, 12) : undefined;
    const passwordDigest = parsed.data.kind === 'editor-handoff' ? await bcrypt.hash(parsed.data.password, 12) : undefined;
    const collaboration = await LibraryCollaboration.create({
      userId: req.user.id,
      publicId: randomToken(24),
      kind: parsed.data.kind,
      title: parsed.data.title,
      clientName: parsed.data.clientName,
      note: parsed.data.note,
      assetIds,
      pinDigest,
      passwordDigest,
      expiresAt: new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    });
    await recordPaidUsage(req.user.id, 'storage', `share:${collaboration._id}`);
    res.status(201).json({ success: true, data: ownerRecord(collaboration), access: entitlements.features.storageMode });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not create that sharing link.' });
  }
}

export async function reopenLibraryPreselection(req, res) {
  try {
    await activeProFor(req.user.id);
    const collaboration = await LibraryCollaboration.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, kind: 'preselection', status: 'submitted', expiresAt: { $gt: new Date() } },
      { $set: { status: 'active', selectedAssetIds: [] }, $unset: { submittedAt: 1 } },
      { new: true }
    );
    if (!collaboration) return res.status(404).json({ success: false, message: 'That submitted selection is not available to reopen.' });
    res.json({ success: true, data: ownerRecord(collaboration) });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not reopen that selection.' });
  }
}

export async function revokeLibraryCollaboration(req, res) {
  try {
    const collaboration = await LibraryCollaboration.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, status: { $ne: 'revoked' } },
      { $set: { status: 'revoked', revokedAt: new Date() } },
      { new: true }
    );
    if (!collaboration) return res.status(404).json({ success: false, message: 'Sharing link not found.' });
    res.json({ success: true, data: ownerRecord(collaboration) });
  } catch {
    res.status(500).json({ success: false, message: 'We could not close that sharing link.' });
  }
}

export async function getPublicLibraryInfo(req, res) {
  try {
    const { collaboration } = await publicCollaboration(req.params.publicId, { includePin: true });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }).json({ success: true, data: {
      kind: collaboration.kind,
      title: collaboration.title,
      clientName: collaboration.clientName,
      requiresSecret: collaboration.kind === 'editor-handoff' || Boolean(collaboration.pinDigest),
      submitted: collaboration.status === 'submitted'
    } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'This sharing link could not be opened.' });
  }
}

export async function unlockPublicLibrary(req, res) {
  try {
    const { collaboration } = await publicCollaboration(req.params.publicId, { includePin: true, includePassword: true });
    const secret = String(req.body?.secret || '');
    const digest = collaboration.kind === 'editor-handoff' ? collaboration.passwordDigest : collaboration.pinDigest;
    if ((collaboration.kind === 'editor-handoff' || collaboration.pinDigest) && (!digest || !secret || !(await bcrypt.compare(secret, digest)))) {
      return res.status(401).json({ success: false, message: 'That password or PIN did not match.' });
    }
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }).json({ success: true, data: { token: accessToken(collaboration) } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'This sharing link could not be opened.' });
  }
}

export async function getPublicLibraryContent(req, res) {
  try {
    const { collaboration, user } = await authorizedPublic(req);
    const assets = await collaborationAssets(collaboration);
    const data = {
      kind: collaboration.kind,
      title: collaboration.title,
      clientName: collaboration.clientName,
      note: collaboration.note,
      photographerName: user.studio?.name || user.name,
      status: collaboration.status,
      submitted: collaboration.status === 'submitted',
      assets: assets.map(asset => ({ ...safeAsset(asset), id: String(asset._id), mediaUrl: publicContentUrl(req, asset._id, collaboration.kind) }))
    };
    data.selectedAssetIds = (collaboration.selectedAssetIds || []).map(String);
    if (collaboration.kind === 'editor-handoff') {
      const returns = await StorageAsset.find({ userId: collaboration.userId, _id: { $in: collaboration.returnedAssets.map(item => item.assetId) } }).select('originalFilename').lean();
      const filenames = new Map(returns.map(item => [String(item._id), item.originalFilename || 'Edited photograph']));
      data.returned = collaboration.returnedAssets.map(item => ({ sourceAssetId: String(item.sourceAssetId), assetId: String(item.assetId), filename: filenames.get(String(item.assetId)) || 'Edited photograph', uploadedAt: item.uploadedAt }));
    }
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }).json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not open these photographs.' });
  }
}

export async function submitPublicPreselection(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'preselection') return res.status(404).json({ success: false, message: 'This link does not accept a photo selection.' });
    if (collaboration.status !== 'active') return res.status(409).json({ success: false, message: 'This selection has already been sent.' });
    const selected = z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(500).safeParse(req.body?.assetIds);
    if (!selected.success || selected.data.length < 1) return res.status(400).json({ success: false, message: 'Choose at least one photograph before sending your selection.' });
    const permitted = new Set(collaboration.assetIds.map(String));
    const unique = [...new Set(selected.data)];
    if (unique.length !== selected.data.length || unique.some(id => !permitted.has(id))) return res.status(400).json({ success: false, message: 'That selection contains a photograph outside this link.' });
    const updated = await LibraryCollaboration.findOneAndUpdate(
      { _id: collaboration._id, status: 'active', submittedAt: { $exists: false } },
      { $set: { selectedAssetIds: unique, submittedAt: new Date(), status: 'submitted' } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ success: false, message: 'This selection has already been sent.' });
    res.json({ success: true, data: { submitted: true, selectedCount: unique.length } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not send this selection.' });
  }
}

async function streamMedia(req, res, publicId, options = {}) {
  try {
    const url = signedImageUrl(publicId, options);
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Referrer-Policy', 'no-referrer');
    return res.redirect(302, url);
  } catch {
    if (!res.headersSent) res.status(502).json({ success: false, message: 'That photograph is temporarily unavailable.' });
    else res.destroy();
  }
}

export async function getPublicLibraryMedia(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    const asset = await publicSourceAsset(collaboration, req.params.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    // Use the 1600px preview for a crisp, reasonably small mobile view.
    // The editor's separate download route is the only one that serves originals.
    await streamMedia(req, res, asset.publicId, { width: 1600, access: mediaOffloadEnabled() ? { type: 'library', collaborationId: String(collaboration._id), assetId: String(asset._id), mode: 'view' } : undefined });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not open that photograph.' });
  }
}

export async function downloadPublicLibraryOriginal(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'editor-handoff') return res.status(404).json({ success: false, message: 'Original downloads are not available from this link.' });
    const asset = await publicSourceAsset(collaboration, req.params.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    const originalFilename = String(asset.originalFilename || 'photograph').replace(/[\r\n"\\]/g, '_').slice(0, 150);
    const filename = originalFilename.includes('.') ? originalFilename : `${originalFilename}.${asset.rawFormat || asset.format}`;
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    await streamMedia(req, res, asset.rawPublicId || asset.publicId, { resourceType: asset.rawPublicId ? 'raw' : 'image', original: true, attachment: true, downloadFilename: filename, expiresIn: 300, access: mediaOffloadEnabled() ? { type: 'library', collaborationId: String(collaboration._id), assetId: String(asset._id), mode: 'download' } : undefined });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare that download.' });
  }
}

export async function signPublicEditorUpload(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'editor-handoff' || collaboration.status !== 'active') return res.status(403).json({ success: false, message: 'This editor link is closed to uploads.' });
    const sourceAssetId = String(req.body?.sourceAssetId || '');
    if (!collaboration.assetIds.some(id => String(id) === sourceAssetId)) return res.status(400).json({ success: false, message: 'Choose a source photograph from this link.' });
    res.json({ success: true, data: { ...createStorageUploadSignature(collaboration.userId, { resourceType: 'image', contentType: req.body?.contentType }), sourceAssetId } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare this upload.' });
  }
}

export async function confirmPublicEditorUpload(req, res) {
  let uploadedPublicId = '';
  let reservedBytes = 0;
  let reservedUserId = '';
  let createdAssetId = '';
  let linkedCollaborationId = '';
  try {
    const parsed = uploadConfirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'editor-handoff' || collaboration.status !== 'active') return res.status(403).json({ success: false, message: 'This editor link is closed to uploads.' });
    if (!collaboration.assetIds.some(id => String(id) === parsed.data.sourceAssetId)) return res.status(400).json({ success: false, message: 'Choose a source photograph from this link.' });
    if (await StorageAsset.exists({ publicId: parsed.data.objectKey })) return res.status(409).json({ success: false, message: 'That edit has already been added.' });
    const resource = await confirmStorageUpload(collaboration.userId, parsed.data);
    uploadedPublicId = resource.public_id;
    if (!imageFormats.has(String(resource.format).toLowerCase()) || Number(resource.bytes) > 100 * 1024 * 1024) throw Object.assign(new Error('Choose a JPEG, PNG, or WebP edit that is 100 MB or smaller.'), { status: 400 });
    const { entitlements } = await activeProFor(collaboration.userId);
    const storageLimitBytes = Number(entitlements.limits.personalStorageBytes || 0);
    const user = await User.findOneAndUpdate({ _id: collaboration.userId, $expr: { $lte: [{ $add: [{ $ifNull: ['$storageUsedBytes', 0] }, resource.bytes] }, storageLimitBytes] } }, { $inc: { storageUsedBytes: resource.bytes } }, { new: true });
    if (!user) throw Object.assign(new Error(`This edit would take the photographer's library above ${Math.round(storageLimitBytes / (1024 ** 3))} GB.`), { status: 403, code: 'STORAGE_LIMIT_REACHED' });
    reservedBytes = Number(resource.bytes);
    reservedUserId = String(user._id);
    const asset = await StorageAsset.create({ userId: user._id, publicId: resource.public_id, originalFilename: parsed.data.originalFilename, format: resource.format, width: resource.width, height: resource.height, bytes: resource.bytes, contentHash: resource.etag || undefined, hashAlgorithm: resource.hashAlgorithm, hashVerifiedAt: resource.etag ? new Date() : undefined, folder: 'Editor returns', tags: ['edited'] });
    createdAssetId = String(asset._id);
    const linked = await LibraryCollaboration.updateOne({ _id: collaboration._id, status: 'active', expiresAt: { $gt: new Date() } }, { $push: { returnedAssets: { sourceAssetId: parsed.data.sourceAssetId, assetId: asset._id, uploadedAt: new Date() } } });
    if (!linked.modifiedCount) {
      throw Object.assign(new Error('This editor link has closed. Ask the photographer for a new link.'), { status: 410 });
    }
    linkedCollaborationId = String(collaboration._id);
    await recordPaidUsage(user._id, 'storage', resource.public_id);
    res.status(201).json({ success: true, data: { asset: { id: String(asset._id), originalFilename: asset.originalFilename }, sourceAssetId: parsed.data.sourceAssetId } });
  } catch (error) {
    if (linkedCollaborationId && createdAssetId) await LibraryCollaboration.updateOne({ _id: linkedCollaborationId }, { $pull: { returnedAssets: { assetId: createdAssetId } } }).catch(() => {});
    if (createdAssetId) await StorageAsset.deleteOne({ _id: createdAssetId }).catch(() => {});
    if (reservedBytes && reservedUserId) await User.updateOne({ _id: reservedUserId }, [{ $set: { storageUsedBytes: { $max: [0, { $subtract: [{ $ifNull: ['$storageUsedBytes', 0] }, reservedBytes] }] } } }]).catch(() => {});
    if (uploadedPublicId) await removeStorageAsset(uploadedPublicId).catch(() => {});
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not save that edited photograph.' });
  }
}
