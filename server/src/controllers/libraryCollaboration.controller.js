import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { commitLibraryAsset } from '../services/libraryAssetCommit.service.js';
import { saveEditorReview } from '../services/libraryEditorReview.service.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { confirmStorageUpload, createStorageUploadSignature, renewStorageUploadSignature, removeStorageAsset, storageAssetUrls } from '../services/storageMedia.service.js';
import { signedArchiveUrl, signedImageUrl } from '../services/deliveryMedia.service.js';
import { collaborationSchema as createSchema, latestAcceptedReturns, photoIds, revisionFilter, selectionRule, validateChoices } from '../services/libraryWorkflow.service.js';
import { randomToken } from '../utils/auth.js';
import { recordPaidUsage } from '../services/paidUsage.service.js';
import { mediaOffloadEnabled, requireMarkedSelectionPreviews } from '../services/cloudflareMedia.service.js';

const imageFormats = new Set(['jpg', 'jpeg', 'png', 'webp']);
const uploadConfirmSchema = z.object({
  objectKey: z.string().min(5).max(1000),
  uploadToken: z.string().min(20).max(4000),
  sourceAssetId: z.string().regex(/^[a-f\d]{24}$/i),
  originalFilename: z.string().trim().max(180).default('edited-photograph'),
  editorGrant: z.string().min(20).max(4000)
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
  return jwt.sign({ collaborationId: String(collaboration._id), publicId: collaboration.publicId, purpose: 'library-collaboration', accessVersion: collaboration.accessVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: '12h', issuer: 'veylo-api', audience: 'veylo-library-collaboration'
  });
}

function verifyAccessToken(token, collaboration) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-library-collaboration' });
    if (payload.purpose !== 'library-collaboration' || payload.publicId !== collaboration.publicId || payload.collaborationId !== String(collaboration._id) || (payload.accessVersion || 0) !== (collaboration.accessVersion || 0)) throw new Error('invalid scope');
    return true;
  } catch {
    throw Object.assign(new Error('Open this link and enter its access details again.'), { status: 401 });
  }
}

async function activeProFor(userId) {
  const user = await User.findById(userId);
  if (!user || user.accountStatus && user.accountStatus !== 'active') throw Object.assign(new Error('The photographer account is no longer available.'), { status: 410 });
  const entitlements = await resolveEntitlements(user, { includeUsage: false });
  if (entitlements.features.storageMode !== 'read-write') throw Object.assign(new Error('This sharing link is no longer active.'), { status: 410 });
  return { user, entitlements };
}

async function publicCollaboration(publicId, { includePin = false, includePassword = false } = {}) {
  let query = LibraryCollaboration.findOne({ publicId });
  if (includePin) query = query.select('+pinDigest');
  if (includePassword) query = query.select('+passwordDigest');
  const collaboration = await query;
  if (!collaboration || !['active', 'submitted'].includes(collaboration.status) || collaboration.expiresAt <= new Date()) throw Object.assign(new Error('This link has expired or was closed.'), { status: 410 });
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
  const value = collaboration.toObject ? collaboration.toObject() : { ...collaboration };
  delete value.pinDigest;
  delete value.passwordDigest;
  return value;
}

function ownerPhoto(asset) {
  return { ...safeAsset(asset), _id: String(asset._id), folder: asset.folder, ...storageAssetUrls(asset.publicId, asset) };
}

async function ownerDetail(collaboration) {
  const ids = [...collaboration.assetIds, ...(collaboration.returnedAssets || []).map(item => item.assetId), ...(collaboration.submissions || []).flatMap(item => item.selectedAssetIds)];
  const assets = await StorageAsset.find({ userId: collaboration.userId, _id: { $in: ids } }).lean();
  const byId = new Map(assets.map(asset => [String(asset._id), ownerPhoto(asset)]));
  return { ...ownerRecord(collaboration), revision: collaboration.revision || 1, selectionRule: selectionRule(collaboration.selectionRule),
    assets: collaboration.assetIds.map(id => byId.get(String(id))).filter(Boolean),
    selectedPhotos: (collaboration.selectedAssetIds || []).map(id => byId.get(String(id))).filter(Boolean),
    returned: (collaboration.returnedAssets || []).map(item => ({ ...(item.toObject ? item.toObject() : item), photo: byId.get(String(item.assetId)), source: byId.get(String(item.sourceAssetId)) })),
    submissions: (collaboration.submissions || []).map(item => ({ ...(item.toObject ? item.toObject() : item), photos: item.selectedAssetIds.map(id => byId.get(String(id))).filter(Boolean) })),
    approvedAssetIds: latestAcceptedReturns(collaboration).filter(id => byId.has(id))
  };
}

async function publicSourceAsset(collaboration, assetId) {
  if (!/^[a-f\d]{24}$/i.test(String(assetId || '')) || !collaboration.assetIds.some(id => String(id) === String(assetId))) return null;
  return StorageAsset.findOne({ _id: assetId, userId: collaboration.userId }).lean();
}

export async function listLibraryCollaborations(req, res) {
  try {
    const query = { userId: req.user.id };
    if (['preselection', 'editor-handoff'].includes(req.query.kind)) query.kind = req.query.kind;
    const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1)));
    const rows = await LibraryCollaboration.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 24).limit(25).lean();
    const hasMore = rows.length > 24; rows.splice(24);
    const allIds = [...new Set(rows.flatMap(row => [...(row.selectedAssetIds?.length ? row.selectedAssetIds : row.assetIds).slice(0, 4), ...(row.returnedAssets || []).slice(-4).map(item => item.assetId)]).map(String))];
    const assets = await StorageAsset.find({ userId: req.user.id, _id: { $in: allIds } }).lean();
    const photos = new Map(assets.map(asset => [String(asset._id), ownerPhoto(asset)]));
    res.json({ success: true, data: rows.map(row => ({
      ...ownerRecord(row), covers: (row.selectedAssetIds?.length ? row.selectedAssetIds : row.assetIds).slice(0, 4).map(id => photos.get(String(id))).filter(Boolean),
      selectionRule: selectionRule(row.selectionRule), approvedAssetIds: latestAcceptedReturns(row)
    })), page, hasMore });
  } catch {
    res.status(500).json({ success: false, message: 'We could not load your sharing links.' });
  }
}

export async function createLibraryCollaboration(req, res) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    if (parsed.data.kind === 'editor-handoff' && parsed.data.status === 'active' && !parsed.data.password) return res.status(400).json({ success: false, message: 'Set a password for the editor link.' });
    const { entitlements } = await activeProFor(req.user.id);
    if (parsed.data.creationKey) {
      const existing = await LibraryCollaboration.findOne({ userId: req.user.id, creationKey: parsed.data.creationKey });
      if (existing) return res.json({ success: true, data: ownerRecord(existing), replayed: true });
    }
    const assetIds = [...new Set(parsed.data.assetIds)];
    if (assetIds.length !== parsed.data.assetIds.length) return res.status(400).json({ success: false, message: 'Remove duplicate photographs from this link.' });
    const assets = await StorageAsset.find({ _id: { $in: assetIds }, userId: req.user.id }).select('_id').lean();
    if (assets.length !== assetIds.length) return res.status(400).json({ success: false, message: 'Choose photographs from your own image library.' });
    const pinDigest = parsed.data.kind === 'preselection' && parsed.data.pin ? await bcrypt.hash(parsed.data.pin, 12) : undefined;
    const passwordDigest = parsed.data.kind === 'editor-handoff' && parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined;
    const collaboration = await LibraryCollaboration.create({
      userId: req.user.id,
      publicId: randomToken(24),
      kind: parsed.data.kind,
      status: parsed.data.status,
      creationKey: parsed.data.creationKey,
      selectionRule: parsed.data.kind === 'preselection' ? selectionRule(parsed.data.selectionRule) : undefined,
      dueAt: parsed.data.dueAt || undefined,
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
    if (error.code === 11000 && req.body?.creationKey) {
      const existing = await LibraryCollaboration.findOne({ userId: req.user.id, creationKey: req.body.creationKey });
      if (existing) return res.json({ success: true, data: ownerRecord(existing), replayed: true });
    }
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not create that sharing link.' });
  }
}

export async function reopenLibraryPreselection(req, res) {
  try {
    await activeProFor(req.user.id);
    const old = await LibraryCollaboration.findOne({ _id: req.params.id, userId: req.user.id, kind: 'preselection', status: 'submitted', expiresAt: { $gt: new Date() } });
    if (!old) return res.status(404).json({ success: false, message: 'That submitted selection is not available to reopen.' });
    const history = [...(old.submissions || [])];
    if (!history.some(item => item.revision === (old.revision || 1))) history.push({ revision: old.revision || 1, selectedAssetIds: old.selectedAssetIds, submittedAt: old.submittedAt });
    const selected = req.body?.startOver === true ? [] : old.selectedAssetIds;
    const collaboration = await LibraryCollaboration.findOneAndUpdate(
      { _id: old._id, userId: req.user.id, kind: 'preselection', status: 'submitted', expiresAt: { $gt: new Date() }, ...revisionFilter(old.revision || 1) },
      { $set: { status: 'active', revision: (old.revision || 1) + 1, selectedAssetIds: [], submissions: history, selectionDraft: { selectedAssetIds: selected, reviewedAssetIds: selected, cursor: 0, version: 0 } }, $unset: { submittedAt: 1 } },
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
      revision: collaboration.revision || 1,
      selectionRule: selectionRule(collaboration.selectionRule),
      selectionDraft: collaboration.selectionDraft || { selectedAssetIds: [], reviewedAssetIds: [], cursor: 0, version: 0 },
      dueAt: collaboration.dueAt,
      editorState: collaboration.editorState || 'awaiting-edits',
      photographerName: user.studio?.name || user.name,
      status: collaboration.status,
      submitted: collaboration.status === 'submitted',
      assets: assets.map(asset => ({ ...safeAsset(asset), id: String(asset._id), mediaUrl: publicContentUrl(req, asset._id, collaboration.kind) }))
    };
    data.selectedAssetIds = (collaboration.selectedAssetIds || []).map(String);
    if (collaboration.kind === 'editor-handoff') {
      const returns = await StorageAsset.find({ userId: collaboration.userId, _id: { $in: collaboration.returnedAssets.map(item => item.assetId) } }).select('originalFilename').lean();
      const filenames = new Map(returns.map(item => [String(item._id), item.originalFilename || 'Edited photograph']));
      data.returned = collaboration.returnedAssets.map(item => ({ sourceAssetId: String(item.sourceAssetId), assetId: String(item.assetId), filename: filenames.get(String(item.assetId)) || 'Edited photograph', uploadedAt: item.uploadedAt, reviewStatus: item.reviewStatus || 'pending', reviewNote: item.reviewNote || '' }));
    }
    if (!collaboration.openedAt) await LibraryCollaboration.updateOne({ _id: collaboration._id, openedAt: { $exists: false } }, { $set: { openedAt: new Date() } });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }).json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not open these photographs.' });
  }
}

export async function submitPublicPreselection(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'preselection') return res.status(404).json({ success: false, message: 'This link does not accept a photo selection.' });
    const revision = Number(req.body?.revision || 1);
    if (revision !== (collaboration.revision || 1)) return res.status(409).json({ success: false, message: 'This selection has changed. Reload it before sending your choices.' });
    const unique = validateChoices(collaboration, req.body?.assetIds, { final: true });
    if (collaboration.status === 'submitted') {
      if ([...unique].sort().join(',') === collaboration.selectedAssetIds.map(String).sort().join(',')) return res.json({ success: true, data: { submitted: true, selectedCount: unique.length, replayed: true } });
      return res.status(409).json({ success: false, message: 'This selection has already been sent.' });
    }
    const version = req.body?.version;
    if (!Number.isInteger(version) || version !== (collaboration.selectionDraft?.version || 0)) return res.status(409).json({ success: false, code: 'SELECTION_CHANGED', message: 'Choices changed in another window. Load the saved choices before sending.' });
    if (await StorageAsset.countDocuments({ _id: { $in: unique }, userId: collaboration.userId }) !== unique.length) return res.status(409).json({ success: false, message: 'A chosen photograph is no longer available. Ask your photographer to update the link.' });
    const submittedAt = new Date();
    const updated = await LibraryCollaboration.findOneAndUpdate(
      { _id: collaboration._id, status: 'active', expiresAt: { $gt: submittedAt }, submittedAt: { $exists: false }, $and: [revisionFilter(revision), version === 0 ? { $or: [{ 'selectionDraft.version': 0 }, { 'selectionDraft.version': { $exists: false } }] } : { 'selectionDraft.version': version }] },
      { $set: { selectedAssetIds: unique, submittedAt, status: 'submitted' }, $push: { submissions: { revision, selectedAssetIds: unique, submittedAt } } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ success: false, code: 'SELECTION_CHANGED', message: 'This selection changed. Reload its saved choices before sending.' });
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
    const width = req.query.size === 'thumb' ? 480 : req.query.size === 'small' ? 800 : 1600;
    if (collaboration.kind === 'preselection') await requireMarkedSelectionPreviews();
    await streamMedia(req, res, asset.publicId, { width, access: mediaOffloadEnabled() ? { type: 'library', collaborationId: String(collaboration._id), accessVersion: collaboration.accessVersion || 0, assetId: String(asset._id), mode: 'view', ...(collaboration.kind === 'preselection' ? { mark: 'selection' } : {}) } : undefined });
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
    await streamMedia(req, res, asset.rawPublicId || asset.publicId, { resourceType: asset.rawPublicId ? 'raw' : 'image', original: true, attachment: true, downloadFilename: filename, expiresIn: 300, access: mediaOffloadEnabled() ? { type: 'library', collaborationId: String(collaboration._id), accessVersion: collaboration.accessVersion || 0, assetId: String(asset._id), mode: 'download' } : undefined });
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
    const signature = createStorageUploadSignature(collaboration.userId, { resourceType: 'image', contentType: req.body?.contentType });
    const editorGrant = jwt.sign({ purpose: 'editor-return', collaborationId: String(collaboration._id), sourceAssetId, objectKey: signature.objectKey }, process.env.JWT_SECRET, { expiresIn: '20m', issuer: 'veylo-api', audience: 'veylo-editor-upload' });
    res.json({ success: true, data: { ...signature, editorGrant, sourceAssetId } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare this upload.' });
  }
}

export async function confirmPublicEditorUpload(req, res) {
  try {
    const parsed = uploadConfirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'editor-handoff' || collaboration.status !== 'active') return res.status(403).json({ success: false, message: 'This editor link is closed to uploads.' });
    if (!collaboration.assetIds.some(id => String(id) === parsed.data.sourceAssetId)) return res.status(400).json({ success: false, message: 'Choose a source photograph from this link.' });
    let grant;
    try { grant = jwt.verify(parsed.data.editorGrant, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-editor-upload' }); } catch { return res.status(401).json({ success: false, message: 'This upload has expired. Retry the returned edit.' }); }
    if (grant.purpose !== 'editor-return' || grant.collaborationId !== String(collaboration._id) || grant.sourceAssetId !== parsed.data.sourceAssetId || grant.objectKey !== parsed.data.objectKey) return res.status(403).json({ success: false, message: 'This upload belongs to a different editor job or source photograph.' });
    const existingAsset = await StorageAsset.findOne({ userId: collaboration.userId, publicId: parsed.data.objectKey });
    if (existingAsset) {
      if (!collaboration.returnedAssets.some(item => String(item.assetId) === String(existingAsset._id) && String(item.sourceAssetId) === parsed.data.sourceAssetId)) return res.status(409).json({ success: false, message: 'That file is already saved in a different upload.' });
      return res.json({ success: true, data: { asset: { id: String(existingAsset._id), originalFilename: existingAsset.originalFilename }, sourceAssetId: parsed.data.sourceAssetId }, replayed: true });
    }
    const resource = await confirmStorageUpload(collaboration.userId, parsed.data);
    if (!imageFormats.has(String(resource.format).toLowerCase()) || Number(resource.bytes) > 100 * 1024 * 1024) throw Object.assign(new Error('Choose a JPEG, PNG, or WebP edit that is 100 MB or smaller.'), { status: 400 });
    const { entitlements } = await activeProFor(collaboration.userId);
    const storageLimitBytes = Number(entitlements.limits.personalStorageBytes || 0);
    const { asset, user, replayed } = await commitLibraryAsset({ userId: collaboration.userId, resource, limitBytes: storageLimitBytes, collaborationId: collaboration._id, sourceAssetId: parsed.data.sourceAssetId, fields: { originalFilename: parsed.data.originalFilename, folder: 'Editor returns', tags: ['edited'] } });
    await recordPaidUsage(user._id, 'storage', resource.public_id).catch(() => {});
    res.status(replayed ? 200 : 201).json({ success: true, replayed, data: { asset: { id: String(asset._id), originalFilename: asset.originalFilename }, sourceAssetId: parsed.data.sourceAssetId } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not save that edited photograph.' });
  }
}

export async function renewPublicEditorUpload(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    const parsed = uploadConfirmSchema.omit({ originalFilename: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'This upload could not be renewed.' });
    const body = parsed.data;
    let grant;
    try { grant = jwt.verify(body.editorGrant, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-editor-upload', ignoreExpiration: true }); } catch { return res.status(403).json({ success: false, message: 'This upload belongs to a different editor job.' }); }
    if (collaboration.kind !== 'editor-handoff' || collaboration.status !== 'active' || grant.purpose !== 'editor-return' || grant.collaborationId !== String(collaboration._id) || grant.sourceAssetId !== body.sourceAssetId || grant.objectKey !== body.objectKey || !collaboration.assetIds.some(id => String(id) === body.sourceAssetId)) return res.status(403).json({ success: false, message: 'This upload belongs to a different editor job or source.' });
    const signature = renewStorageUploadSignature(collaboration.userId, body);
    const editorGrant = jwt.sign({ purpose: 'editor-return', collaborationId: String(collaboration._id), sourceAssetId: body.sourceAssetId, objectKey: signature.objectKey }, process.env.JWT_SECRET, { expiresIn: '20m', issuer: 'veylo-api', audience: 'veylo-editor-upload' });
    res.json({ success: true, data: { ...signature, editorGrant } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'This upload could not be renewed.' }); }
}

export async function cleanupPublicEditorUpload(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    const body = z.object({ objectKey: z.string().max(1000), editorGrant: z.string().max(4000) }).strict().parse(req.body);
    const grant = jwt.verify(body.editorGrant, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-editor-upload', ignoreExpiration: true });
    if (collaboration.kind !== 'editor-handoff' || grant.purpose !== 'editor-return' || grant.collaborationId !== String(collaboration._id) || grant.objectKey !== body.objectKey) return res.status(403).json({ success: false, message: 'This upload does not belong to this editor job.' });
    if (!await StorageAsset.exists({ publicId: body.objectKey })) await removeStorageAsset(body.objectKey);
    res.json({ success: true });
  } catch { res.status(400).json({ success: false, message: 'This unfinished upload could not be cleaned up.' }); }
}

export async function getLibraryCollaboration(req, res) {
  try {
    const item = await LibraryCollaboration.findOne({ _id: req.params.id, userId: req.user.id });
    if (!item) return res.status(404).json({ success: false, message: 'This link was not found.' });
    res.set('Cache-Control', 'no-store').json({ success: true, data: await ownerDetail(item) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: 'We could not open this link.' }); }
}

export async function updateLibraryCollaboration(req, res) {
  try {
    await activeProFor(req.user.id);
    const item = await LibraryCollaboration.findOne({ _id: req.params.id, userId: req.user.id }).select('+passwordDigest');
    if (!item || item.status !== 'draft') return res.status(409).json({ success: false, message: 'Only an unpublished draft can be changed here.' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const body = parsed.data;
    if (body.kind !== item.kind) return res.status(400).json({ success: false, message: 'Create a separate link for this kind of work.' });
    if (await StorageAsset.countDocuments({ userId: req.user.id, _id: { $in: body.assetIds } }) !== body.assetIds.length) return res.status(400).json({ success: false, message: 'Choose photographs from your own library.' });
    if (item.kind === 'editor-handoff' && body.status === 'active' && !body.password && !item.passwordDigest) return res.status(400).json({ success: false, message: 'Set a password before sharing with your editor.' });
    const fields = { title: body.title, clientName: body.clientName, note: body.note, assetIds: body.assetIds, selectionRule: selectionRule(body.selectionRule), status: body.status, dueAt: body.dueAt || null, expiresAt: new Date(Date.now() + body.expiresInDays * 86400000) };
    if (item.kind === 'preselection') fields.pinDigest = body.pin ? await bcrypt.hash(body.pin, 12) : null;
    if (item.kind === 'editor-handoff' && body.password) fields.passwordDigest = await bcrypt.hash(body.password, 12);
    const updated = await LibraryCollaboration.findOneAndUpdate({ _id: item._id, userId: req.user.id, status: 'draft' }, { $set: fields }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: 'This draft changed in another window. Reload to continue.' });
    res.json({ success: true, data: ownerRecord(updated) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not save this draft.' }); }
}

export async function reviseLibraryPreselection(req, res) {
  try {
    await activeProFor(req.user.id);
    const parsed = createSchema.safeExtend({ revision: z.number().int().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const body = parsed.data;
    if (body.kind !== 'preselection' || body.status !== 'active') return res.status(400).json({ success: false, message: 'Choose a Photo Pre-selection to revise.' });
    const current = await LibraryCollaboration.findOne({ _id: req.params.id, userId: req.user.id, kind: 'preselection', status: { $in: ['active', 'submitted'] } });
    if (!current || (current.revision || 1) !== body.revision) return res.status(409).json({ success: false, message: 'This selection changed. Reopen it before revising.' });
    if (await StorageAsset.countDocuments({ userId: req.user.id, _id: { $in: body.assetIds } }) !== body.assetIds.length) return res.status(400).json({ success: false, message: 'Choose photographs from your own library.' });
    const submissions = [...(current.submissions || [])];
    if (current.status === 'submitted' && !submissions.some(item => item.revision === body.revision)) submissions.push({ revision: body.revision, selectedAssetIds: current.selectedAssetIds, submittedAt: current.submittedAt });
    const fields = { title: body.title, clientName: body.clientName, note: body.note, assetIds: body.assetIds, selectionRule: selectionRule(body.selectionRule), status: 'active', revision: body.revision + 1, selectedAssetIds: [], selectionDraft: { selectedAssetIds: [], reviewedAssetIds: [], cursor: 0, version: 0 }, submissions, expiresAt: new Date(Date.now() + body.expiresInDays * 86400000) };
    // Leaving this field out keeps the existing access PIN. A supplied PIN is
    // deliberately changed by the photographer and invalidates older access.
    if (body.pin) { fields.pinDigest = await bcrypt.hash(body.pin, 12); fields.accessVersion = (current.accessVersion || 0) + 1; }
    const updated = await LibraryCollaboration.findOneAndUpdate({ _id: current._id, userId: req.user.id, status: current.status, ...revisionFilter(body.revision) }, { $set: fields, $unset: { submittedAt: 1 } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: 'This selection changed in another window. Reopen it to continue.' });
    res.json({ success: true, data: ownerRecord(updated) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'This selection could not be revised.' }); }
}

export async function savePublicSelectionDraft(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'preselection' || collaboration.status !== 'active') return res.status(409).json({ success: false, message: 'This selection is closed to changes.' });
    const parsed = z.object({ assetIds: photoIds, reviewedAssetIds: photoIds, cursor: z.number().int().min(0).max(500), version: z.number().int().min(0), revision: z.number().int().min(1) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'These choices could not be saved. Reload the selection.' });
    const body = parsed.data;
    const choices = validateChoices(collaboration, body.assetIds);
    const permitted = new Set(collaboration.assetIds.map(String));
    if (body.reviewedAssetIds.some(id => !permitted.has(id)) || choices.some(id => !body.reviewedAssetIds.includes(id)) || body.cursor > collaboration.assetIds.length) return res.status(400).json({ success: false, message: 'These choices contain an unavailable photograph.' });
    const currentVersion = collaboration.selectionDraft?.version || 0;
    if (body.revision !== (collaboration.revision || 1) || body.version !== currentVersion) return res.status(409).json({ success: false, code: 'SELECTION_CHANGED', message: 'Choices changed in another window. Load the saved choices before continuing.' });
    const draft = { selectedAssetIds: choices, reviewedAssetIds: body.reviewedAssetIds, cursor: body.cursor, version: body.version + 1, updatedAt: new Date() };
    const versionCondition = body.version === 0 ? { $or: [{ 'selectionDraft.version': 0 }, { 'selectionDraft.version': { $exists: false } }] } : { 'selectionDraft.version': body.version };
    const updated = await LibraryCollaboration.findOneAndUpdate({ _id: collaboration._id, status: 'active', expiresAt: { $gt: new Date() }, $and: [revisionFilter(body.revision), versionCondition] }, { $set: { selectionDraft: draft } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, code: 'SELECTION_CHANGED', message: 'This selection changed. Load its saved choices to continue.' });
    res.set('Cache-Control', 'no-store').json({ success: true, data: { version: draft.version, updatedAt: draft.updatedAt } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'Your choices could not be saved.' }); }
}

export async function downloadPublicEditorArchive(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'editor-handoff') return res.status(403).json({ success: false, message: 'Original downloads are only available through Editor Links.' });
    if (!mediaOffloadEnabled()) return res.status(503).json({ success: false, message: 'Batch downloads are temporarily unavailable. Download the originals individually.' });
    const parsed = z.object({ assetIds: photoIds.min(1) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Choose the originals to download.' });
    const permitted = new Set(collaboration.assetIds.map(String));
    if (parsed.data.assetIds.some(id => !permitted.has(id))) return res.status(403).json({ success: false, message: 'Choose photographs from this editor job.' });
    const assets = await StorageAsset.find({ userId: collaboration.userId, _id: { $in: parsed.data.assetIds } }).lean();
    if (assets.length !== parsed.data.assetIds.length) return res.status(409).json({ success: false, message: 'An original is no longer available. Ask the photographer to check the job.' });
    const url = await signedArchiveUrl(assets.map(asset => ({ key: asset.rawPublicId || asset.publicId, name: asset.originalFilename })), collaboration.title, { access: { type: 'library', collaborationId: String(collaboration._id), accessVersion: collaboration.accessVersion || 0, mode: 'archive' } });
    res.json({ success: true, data: { url } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare the originals.' }); }
}

export async function getPublicEditorReturnMedia(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'editor-handoff' || !collaboration.returnedAssets.some(item => String(item.assetId) === req.params.assetId)) return res.status(404).json({ success: false, message: 'Returned photograph not found.' });
    const asset = await StorageAsset.findOne({ _id: req.params.assetId, userId: collaboration.userId }).lean();
    if (!asset) return res.status(404).json({ success: false, message: 'Returned photograph not found.' });
    await streamMedia(req, res, asset.publicId, { width: 800, access: mediaOffloadEnabled() ? { type: 'library', collaborationId: String(collaboration._id), accessVersion: collaboration.accessVersion || 0, assetId: String(asset._id), mode: 'return-view' } : undefined });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not open this edit.' }); }
}

export async function submitPublicEditorEdits(req, res) {
  try {
    const { collaboration } = await authorizedPublic(req);
    if (collaboration.kind !== 'editor-handoff' || collaboration.status !== 'active' || !collaboration.returnedAssets.length) return res.status(400).json({ success: false, message: 'Return at least one edited photograph first.' });
    const updated = await LibraryCollaboration.findOneAndUpdate({ _id: collaboration._id, status: 'active', expiresAt: { $gt: new Date() }, editorState: { $ne: 'complete' } }, { $set: { editorState: 'ready-for-review', editsSubmittedAt: new Date() }, $inc: { editorVersion: 1 } }, { new: true });
    if (!updated && collaboration.editorState === 'complete') return res.json({ success: true, data: { editorState: 'complete' } });
    if (!updated) return res.status(410).json({ success: false, message: 'This editor link has closed.' });
    res.json({ success: true, data: { editorState: updated.editorState } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not send these edits for review.' }); }
}

export async function reviewEditorReturn(req, res) {
  try {
    await activeProFor(req.user.id);
    const parsed = z.object({ status: z.enum(['accepted', 'changes-requested']), note: z.string().trim().max(1000).default('') }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Choose an edit review result and a note under 1,000 characters.' });
    if (parsed.data.status === 'changes-requested' && !parsed.data.note) return res.status(400).json({ success: false, message: 'Tell your editor what to correct.' });
    const updated = await saveEditorReview({ userId: req.user.id, collaborationId: req.params.id, assetId: req.params.assetId, status: parsed.data.status, note: parsed.data.note });
    res.json({ success: true, data: await ownerDetail(updated) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not save this review.' }); }
}
