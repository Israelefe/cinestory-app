import { recordPaidUsage } from '../services/paidUsage.service.js';
import { schedulePortfolioRemoval, finishPortfolioRemoval } from '../services/portfolioLifecycle.service.js';
import { z } from 'zod';
import User from '../models/User.js';
import StorageAsset from '../models/StorageAsset.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import Portfolio from '../models/Portfolio.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { confirmStorageUpload, createStorageUploadSignature, removeStorageAsset, storageAssetUrls, storageFolder, STORAGE_RAW_FORMATS } from '../services/storageMedia.service.js';
import { recordAnalyticsEventAsync } from '../services/analytics.service.js';

const cloudinaryUploadSchema = z.object({ publicId: z.string().min(5).max(500), version: z.union([z.string(), z.number()]), signature: z.string().min(20).max(200) }).strict();
const confirmSchema = z.object({ ...cloudinaryUploadSchema.shape, rawOriginal: cloudinaryUploadSchema.optional(), originalFilename: z.string().trim().max(180).default('photograph'), folder: z.string().trim().max(100).default('All photographs'), tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]) }).strict();
const cleanupSchema = z.object({ uploads: z.array(z.object({ publicId: z.string().min(5).max(500), resourceType: z.enum(['image', 'raw']) }).strict()).max(2).min(1) }).strict();
const editSchema = z.object({ folder: z.string().trim().min(1).max(100), tags: z.array(z.string().trim().min(1).max(40)).max(12), caption: z.string().trim().max(180).default('') }).strict();

function escaped(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function storageAccess(userId) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 });
  return { user, entitlements: await resolveEntitlements(user, { includeUsage: false }) };
}

function output(asset) { return { ...asset.toObject(), ...storageAssetUrls(asset.publicId, { rawPublicId: asset.rawPublicId }) }; }

export async function listStorage(req, res) {
  try {
    const { user, entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode === 'unavailable') return res.json({ success: true, data: [], access: entitlements.features.storageMode, usage: { usedBytes: user.storageUsedBytes || 0, limitBytes: entitlements.limits.personalStorageBytes } });
    const query = { userId: user._id };
    if (req.query.folder) query.folder = String(req.query.folder).slice(0, 100);
    if (req.query.search) query.$or = [{ originalFilename: { $regex: escaped(req.query.search), $options: 'i' } }, { tags: { $regex: escaped(req.query.search), $options: 'i' } }];
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const [assets, folders] = await Promise.all([StorageAsset.find(query).sort({ createdAt: -1 }).skip((page - 1) * 60).limit(61), StorageAsset.distinct('folder', { userId: user._id })]);
    const hasMore = assets.length > 60;
    res.json({ success: true, data: assets.slice(0, 60).map(output), folders, access: entitlements.features.storageMode, usage: { usedBytes: user.storageUsedBytes || 0, limitBytes: entitlements.limits.personalStorageBytes }, page, hasMore });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not open your image library.' }); }
}

export async function signStorageUpload(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Personal image storage is included with Veylo Pro.' });
    const resourceType = req.body?.resourceType === 'raw' ? 'raw' : 'image';
    res.json({ success: true, data: createStorageUploadSignature(req.user.id, { resourceType, format: req.body?.format }) });
  } catch (error) {
    recordAnalyticsEventAsync({ name: 'upload.failed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'failed', errorCode: error.code || 'STORAGE_UPLOAD_SIGNATURE_FAILED', metadata: { surface: 'library', stage: 'signature' } });
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare this upload.' });
  }
}

export async function confirmStorageAsset(req, res) {
  let reserved = false;
  let reservedBytes = 0;
  let uploadedPublicId = '';
  let uploadedRawPublicId = '';
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Personal image storage is included with Veylo Pro.' });
    if (await StorageAsset.exists({ $or: [{ publicId: parsed.data.publicId }, ...(parsed.data.rawOriginal ? [{ rawPublicId: parsed.data.rawOriginal.publicId }] : [])] })) return res.status(409).json({ success: false, message: 'That photograph is already in your library.' });
    const resource = await confirmStorageUpload(req.user.id, parsed.data);
    uploadedPublicId = resource.public_id;
    const allowedImageFormats = ['jpg', 'jpeg', 'png', 'webp'];
    const rawFormats = STORAGE_RAW_FORMATS;
    if (!allowedImageFormats.includes(String(resource.format).toLowerCase()) || Number(resource.bytes) > 100 * 1024 * 1024) throw Object.assign(new Error('Use a JPEG, PNG, or WebP photograph no larger than 100 MB.'), { status: 400 });
    let rawResource = null;
    if (parsed.data.rawOriginal) {
      rawResource = await confirmStorageUpload(req.user.id, parsed.data.rawOriginal, { resourceType: 'raw' });
      uploadedRawPublicId = rawResource.public_id;
      if (!rawFormats.includes(String(rawResource.format).toLowerCase()) || Number(rawResource.bytes) > 100 * 1024 * 1024) throw Object.assign(new Error('That camera original is not supported or is larger than 100 MB.'), { status: 400 });
      if (!['jpg', 'jpeg'].includes(String(resource.format).toLowerCase())) throw Object.assign(new Error('A RAW camera file needs its paired JPEG preview.'), { status: 400 });
    }
    const totalBytes = Number(resource.bytes) + Number(rawResource?.bytes || 0);
    const storageLimitBytes = Number(entitlements.limits.personalStorageBytes || 0);
    const user = await User.findOneAndUpdate({ _id: req.user.id, $expr: { $lte: [{ $add: [{ $ifNull: ['$storageUsedBytes', 0] }, totalBytes] }, storageLimitBytes] } }, { $inc: { storageUsedBytes: totalBytes } }, { new: true });
    if (!user) { await removeStorageAsset(resource.public_id); if (rawResource) await removeStorageAsset(rawResource.public_id, 'raw'); return res.status(403).json({ success: false, code: 'STORAGE_LIMIT_REACHED', message: `This upload would take your personal storage above ${Math.round(storageLimitBytes / (1024 ** 3))} GB.` }); }
    reserved = true;
    reservedBytes = totalBytes;
    await recordPaidUsage(user._id, 'storage', resource.public_id);
    const asset = await StorageAsset.create({ userId: user._id, publicId: resource.public_id, rawPublicId: rawResource?.public_id, rawFormat: rawResource?.format, rawBytes: rawResource?.bytes || 0, originalFilename: parsed.data.originalFilename, format: resource.format, width: resource.width, height: resource.height, bytes: totalBytes, contentHash: resource.etag || undefined, hashAlgorithm: resource.etag ? 'cloudinary-etag' : undefined, hashVerifiedAt: resource.etag ? new Date() : undefined, folder: parsed.data.folder || 'All photographs', tags: [...new Set(parsed.data.tags.map(tag => tag.toLowerCase()))] });
    recordAnalyticsEventAsync({ name: 'upload.completed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'completed', bytes: totalBytes, metadata: { surface: 'library', format: rawResource?.format || resource.format, pairedRawPreview: Boolean(rawResource) } });
    res.status(201).json({ success: true, data: output(asset), usage: { usedBytes: user.storageUsedBytes, limitBytes: entitlements.limits.personalStorageBytes } });
  } catch (error) {
    if (reserved && reservedBytes) await User.updateOne(
      { _id: req.user.id },
      [{ $set: { storageUsedBytes: { $max: [0, { $subtract: [{ $ifNull: ['$storageUsedBytes', 0] }, reservedBytes] }] } } }]
    ).catch(() => {});
    if (uploadedPublicId) await removeStorageAsset(uploadedPublicId).catch(() => {});
    if (uploadedRawPublicId) await removeStorageAsset(uploadedRawPublicId, 'raw').catch(() => {});
    recordAnalyticsEventAsync({ name: 'upload.failed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'failed', errorCode: error.code || 'STORAGE_UPLOAD_CONFIRM_FAILED', metadata: { surface: 'library', stage: 'confirm' } });
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not save this photograph.' });
  }
}

export async function editStorageAsset(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'READ_ONLY_STORAGE', message: 'Your retained library is read-only. Download or remove photographs, or renew Pro to organise it.' });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const asset = await StorageAsset.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { folder: parsed.data.folder, tags: [...new Set(parsed.data.tags.map(tag => tag.toLowerCase()))], caption: parsed.data.caption }, { new: true });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    res.json({ success: true, data: output(asset) });
  } catch { res.status(500).json({ success: false, message: 'We could not update that photograph.' }); }
}

export async function deleteStorageAsset(req, res) {
  try {
    const asset = await StorageAsset.findOne({ _id: req.params.id, userId: req.user.id });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    const activeLink = await LibraryCollaboration.exists({ userId: req.user.id, status: { $in: ['active', 'submitted'] }, expiresAt: { $gt: new Date() }, $or: [{ assetIds: asset._id }, { 'returnedAssets.assetId': asset._id }] });
    if (activeLink) return res.status(409).json({ success: false, message: 'Close or revoke the active sharing link before removing this photograph.' });
    const cleanup = await schedulePortfolioRemoval(req.user.id, [asset.publicId]);
    await removeStorageAsset(asset.publicId);
    if (asset.rawPublicId) await removeStorageAsset(asset.rawPublicId, 'raw');
    await StorageAsset.deleteOne({ _id: asset._id, userId: req.user.id });
    await finishPortfolioRemoval(cleanup);
    await User.updateOne(
      { _id: req.user.id },
      [{ $set: { storageUsedBytes: { $max: [0, { $subtract: [{ $ifNull: ['$storageUsedBytes', 0] }, asset.bytes] }] } } }]
    );
    recordAnalyticsEventAsync({ name: 'storage.delete.completed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'completed', bytes: asset.bytes, metadata: { surface: 'library' } });
    res.json({ success: true, message: 'Photograph removed from your library.' });
  } catch (error) {
    recordAnalyticsEventAsync({ name: 'storage.delete.failed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'failed', errorCode: error.code || 'LIBRARY_DELETE_FAILED', metadata: { surface: 'library', assetId: String(req.params.id || '').slice(0, 80) } });
    res.status(error.status || 500).json({ success: false, message: 'We could not remove that photograph.' });
  }
}

export async function downloadStorageAsset(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode === 'unavailable') return res.status(403).json({ success: false, message: 'This personal image library is no longer available.' });
    const asset = await StorageAsset.findOne({ _id: req.params.id, userId: req.user.id });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    res.json({ success: true, data: { url: storageAssetUrls(asset.publicId, { rawPublicId: asset.rawPublicId }).downloadUrl } });
  } catch { res.status(500).json({ success: false, message: 'We could not prepare that download.' }); }
}

export async function cleanupUnconfirmedStorageUploads(req, res) {
  try {
    const parsed = cleanupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'That upload could not be cleaned up.' });
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Personal image storage is included with Veylo Pro.' });
    const prefix = `${storageFolder(req.user.id)}/`;
    for (const upload of parsed.data.uploads) {
      if (!upload.publicId.startsWith(prefix)) continue;
      const leaf = upload.publicId.slice(prefix.length);
      const validLeaf = upload.resourceType === 'image'
        ? /^[a-f\d-]{36}$/i.test(leaf)
        : /^[a-f\d-]{36}\.(arw|cr2|cr3|dng|nef|nrw|orf|rw2|raf|pef|srw|3fr|iiq|mos|mef|mrw|rwl|x3f)$/i.test(leaf);
      if (!validLeaf) continue;
      const exists = await StorageAsset.exists({ $or: [{ publicId: upload.publicId }, { rawPublicId: upload.publicId }] });
      if (!exists) await removeStorageAsset(upload.publicId, upload.resourceType);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'We could not clean up the unfinished upload.' });
  }
}
