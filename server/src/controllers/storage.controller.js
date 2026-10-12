import { recordPaidUsage } from '../services/paidUsage.service.js';
import { commitLibraryAsset } from '../services/libraryAssetCommit.service.js';
import { schedulePortfolioRemoval, finishPortfolioRemoval } from '../services/portfolioLifecycle.service.js';
import { z } from 'zod';
import User from '../models/User.js';
import StorageAsset from '../models/StorageAsset.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import Portfolio from '../models/Portfolio.js';
import LibraryShoot from '../models/LibraryShoot.js';
import { ensureLibraryShoot } from '../services/libraryShoot.service.js';
import { photoIds } from '../services/libraryWorkflow.service.js';
import { signedArchiveUrl } from '../services/deliveryMedia.service.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { confirmStorageUpload, createStorageUploadSignature, renewStorageUploadSignature, removeStorageAsset, storageAssetUrls, storageFolder, STORAGE_RAW_FORMATS } from '../services/storageMedia.service.js';
import { recordAnalyticsEventAsync } from '../services/analytics.service.js';

const r2UploadSchema = z.object({ objectKey: z.string().min(5).max(1000), uploadToken: z.string().min(20).max(4000) }).strict();
const confirmSchema = z.object({ ...r2UploadSchema.shape, rawOriginal: r2UploadSchema.extend({ format: z.string().min(2).max(12), resourceType: z.literal('raw') }).optional(), originalFilename: z.string().trim().max(180).default('photograph'), folder: z.string().trim().max(100).default('All photographs'), tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]) }).strict();
const cleanupSchema = z.object({ uploads: z.array(z.object({ publicId: z.string().min(5).max(500), resourceType: z.enum(['image', 'raw']) }).strict()).max(2).min(1) }).strict();
const editSchema = z.object({ folder: z.string().trim().min(1).max(100), tags: z.array(z.string().trim().min(1).max(40)).max(12), caption: z.string().trim().max(180).default('') }).strict();

function escaped(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function storageAccess(userId) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 });
  return { user, entitlements: await resolveEntitlements(user, { includeUsage: false }) };
}

function output(asset) { return { ...asset.toObject(), ...storageAssetUrls(asset.publicId, { rawPublicId: asset.rawPublicId, originalFilename: asset.originalFilename, format: asset.format, rawFormat: asset.rawFormat }) }; }

export async function listStorage(req, res) {
  try {
    const { user, entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode === 'unavailable') return res.json({ success: true, data: [], access: entitlements.features.storageMode, usage: { usedBytes: user.storageUsedBytes || 0, reservedBytes: user.storageReservedBytes || 0, videoBytes: user.videoUsedBytes || 0, limitBytes: entitlements.limits.personalStorageBytes } });
    const query = { userId: user._id };
    if (req.query.folder === 'Unfiled') query.folder = { $in: ['All photographs', 'Unfiled', '', null] };
    else if (req.query.folder && req.query.folder !== 'All photographs') query.folder = String(req.query.folder).slice(0, 100);
    if (req.query.type === 'raw') query.rawPublicId = { $exists: true };
    if (req.query.type === 'image') query.rawPublicId = { $exists: false };
    if (req.query.search) query.$or = [{ originalFilename: { $regex: escaped(req.query.search), $options: 'i' } }, { tags: { $regex: escaped(req.query.search), $options: 'i' } }];
    const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1)));
    const [assets, folders, total, groups, shoots] = await Promise.all([
      StorageAsset.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 60).limit(61),
      StorageAsset.distinct('folder', { userId: user._id }), StorageAsset.countDocuments(query),
      StorageAsset.aggregate([{ $match: { userId: user._id } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$folder', count: { $sum: 1 }, publicId: { $first: '$publicId' }, updatedAt: { $first: '$createdAt' } } }]),
      LibraryShoot.find({ userId: user._id }).lean()
    ]);
    const hasMore = assets.length > 60;
    const shootMap = new Map(shoots.map(shoot => [shoot.name, { id: String(shoot._id), name: shoot.name, count: 0 }]));
    for (const group of groups) {
      const name = !group._id || group._id === 'All photographs' ? 'Unfiled' : group._id;
      const previous = shootMap.get(name);
      shootMap.set(name, { ...previous, id: previous?.id || null, name, count: (previous?.count || 0) + group.count, thumbnailUrl: storageAssetUrls(group.publicId).thumbnailUrl, updatedAt: group.updatedAt });
    }
    res.json({ success: true, data: assets.slice(0, 60).map(output), folders, shoots: [...shootMap.values()], total, libraryTotal: groups.reduce((sum, group) => sum + group.count, 0), access: entitlements.features.storageMode, usage: { usedBytes: user.storageUsedBytes || 0, reservedBytes: user.storageReservedBytes || 0, videoBytes: user.videoUsedBytes || 0, limitBytes: entitlements.limits.personalStorageBytes }, page, hasMore });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not open your image library.' }); }
}

export async function signStorageUpload(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Personal image storage is included with Veylo Pro.' });
    const resourceType = req.body?.resourceType === 'raw' ? 'raw' : 'image';
    res.json({ success: true, data: createStorageUploadSignature(req.user.id, { resourceType, format: req.body?.format, contentType: req.body?.contentType }) });
  } catch (error) {
    recordAnalyticsEventAsync({ name: 'upload.failed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'failed', errorCode: error.code || 'STORAGE_UPLOAD_SIGNATURE_FAILED', metadata: { surface: 'library', stage: 'signature' } });
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare this upload.' });
  }
}

export async function confirmStorageAsset(req, res) {
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Personal image storage is included with Veylo Pro.' });
    const existing = await StorageAsset.findOne({ userId: req.user.id, publicId: parsed.data.objectKey });
    if (existing) {
      if ((existing.rawPublicId || '') !== (parsed.data.rawOriginal?.objectKey || '')) return res.status(409).json({ success: false, message: 'This upload has a different camera original.' });
      return res.json({ success: true, data: output(existing), replayed: true });
    }
    const resource = await confirmStorageUpload(req.user.id, parsed.data);
    const allowedImageFormats = ['jpg', 'jpeg', 'png', 'webp'];
    const rawFormats = STORAGE_RAW_FORMATS;
    if (!allowedImageFormats.includes(String(resource.format).toLowerCase()) || Number(resource.bytes) > 100 * 1024 * 1024) throw Object.assign(new Error('Choose a JPEG, PNG, or WebP photograph that is 100 MB or smaller.'), { status: 400 });
    let rawResource = null;
    if (parsed.data.rawOriginal) {
      rawResource = await confirmStorageUpload(req.user.id, parsed.data.rawOriginal, { resourceType: 'raw' });
      if (!rawFormats.includes(String(rawResource.format).toLowerCase()) || Number(rawResource.bytes) > 100 * 1024 * 1024) throw Object.assign(new Error('Choose a supported camera RAW file that is 100 MB or smaller.'), { status: 400 });
      if (!['jpg', 'jpeg'].includes(String(resource.format).toLowerCase())) throw Object.assign(new Error('A RAW camera file needs its paired JPEG preview.'), { status: 400 });
    }
    const totalBytes = Number(resource.bytes) + Number(rawResource?.bytes || 0);
    const storageLimitBytes = Number(entitlements.limits.personalStorageBytes || 0);
    const shoot = await ensureLibraryShoot(req.user.id, parsed.data.folder);
    const { asset, user, replayed } = await commitLibraryAsset({ userId: req.user.id, resource, rawResource, limitBytes: storageLimitBytes, fields: { shootId: shoot?._id, originalFilename: parsed.data.originalFilename, folder: parsed.data.folder || 'Unfiled', tags: [...new Set(parsed.data.tags.map(tag => tag.toLowerCase()))] } });
    await recordPaidUsage(user._id, 'storage', resource.public_id).catch(() => {});
    recordAnalyticsEventAsync({ name: 'upload.completed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'completed', bytes: totalBytes, metadata: { surface: 'library', format: rawResource?.format || resource.format, pairedRawPreview: Boolean(rawResource) } });
    res.status(replayed ? 200 : 201).json({ success: true, replayed, data: output(asset), usage: { usedBytes: user.storageUsedBytes, limitBytes: entitlements.limits.personalStorageBytes } });
  } catch (error) {
    recordAnalyticsEventAsync({ name: 'upload.failed', source: 'server', actorType: 'photographer', userId: req.user?.id, status: 'failed', errorCode: error.code || 'STORAGE_UPLOAD_CONFIRM_FAILED', metadata: { surface: 'library', stage: 'confirm' } });
    res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || 'We could not save this photograph.' });
  }
}

export async function renewLibraryUpload(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, message: 'Renew Pro to upload photographs.' });
    const parsed = r2UploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'This upload could not be renewed.' });
    res.json({ success: true, data: renewStorageUploadSignature(req.user.id, parsed.data) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'This upload could not be renewed.' }); }
}

export async function editStorageAsset(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'READ_ONLY_STORAGE', message: 'Your retained library is read-only. Download or remove photographs, or renew Pro to organise it.' });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const shoot = await ensureLibraryShoot(req.user.id, parsed.data.folder);
    const asset = await StorageAsset.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { $set: { folder: parsed.data.folder, tags: [...new Set(parsed.data.tags.map(tag => tag.toLowerCase()))], caption: parsed.data.caption, ...(shoot ? { shootId: shoot._id } : {}) }, ...(!shoot ? { $unset: { shootId: 1 } } : {}) }, { new: true });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    await recordPaidUsage(req.user.id, 'storage', `edit:${asset._id}`);
    res.json({ success: true, data: output(asset) });
  } catch { res.status(500).json({ success: false, message: 'We could not update that photograph.' }); }
}

export async function deleteStorageAsset(req, res) {
  try {
    const asset = await StorageAsset.findOne({ _id: req.params.id, userId: req.user.id });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    const activeLink = await LibraryCollaboration.exists({ userId: req.user.id, status: { $in: ['active', 'submitted'] }, expiresAt: { $gt: new Date() }, $or: [{ assetIds: asset._id }, { 'returnedAssets.assetId': asset._id }] });
    if (activeLink) {
      const links = await LibraryCollaboration.find({ userId: req.user.id, status: { $in: ['active', 'submitted'] }, expiresAt: { $gt: new Date() }, $or: [{ assetIds: asset._id }, { 'returnedAssets.assetId': asset._id }] }).select('title kind').lean();
      return res.status(409).json({ success: false, message: `Close the active link${links.length > 1 ? 's' : ''} before removing this photo: ${links.map(link => link.title).join(', ')}.`, links });
    }
    const cleanup = await schedulePortfolioRemoval(req.user.id, [asset.publicId]);
    await removeStorageAsset(asset.publicId);
    if (asset.rawPublicId) await removeStorageAsset(asset.rawPublicId, 'raw');
    const removed = await StorageAsset.deleteOne({ _id: asset._id, userId: req.user.id });
    await finishPortfolioRemoval(cleanup);
    if (removed.deletedCount) await User.updateOne(
      { _id: req.user.id, storageUsedBytes: { $gte: asset.bytes } },
      { $inc: { storageUsedBytes: -asset.bytes } }
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
    if (entitlements.plan === 'pro') await recordPaidUsage(req.user.id, 'storage', `download:${asset._id}`);
    res.json({ success: true, data: { url: storageAssetUrls(asset.publicId, { rawPublicId: asset.rawPublicId, originalFilename: asset.originalFilename, format: asset.format, rawFormat: asset.rawFormat }).downloadUrl } });
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
      const validLeaf = /^[a-f\d-]{36}$/i.test(leaf);
      if (!validLeaf) continue;
      const exists = await StorageAsset.exists({ $or: [{ publicId: upload.publicId }, { rawPublicId: upload.publicId }] });
      if (!exists) await removeStorageAsset(upload.publicId, upload.resourceType);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'We could not clean up the unfinished upload.' });
  }
}

export async function createLibraryShoot(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, message: 'Renew Pro to create a shoot.' });
    const parsed = z.object({ name: z.string().trim().min(1).max(100).refine(name => !['All photographs', 'Unfiled'].includes(name), 'Choose a name for this shoot.') }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const shoot = await ensureLibraryShoot(req.user.id, parsed.data.name);
    res.status(201).json({ success: true, data: { id: String(shoot._id), name: shoot.name, count: 0 } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: 'We could not create this shoot.' }); }
}

export async function moveLibraryPhotos(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, message: 'Renew Pro to organise photographs.' });
    const parsed = z.object({ assetIds: photoIds.min(1), folder: z.string().trim().min(1).max(100) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    if (await StorageAsset.countDocuments({ userId: req.user.id, _id: { $in: parsed.data.assetIds } }) !== parsed.data.assetIds.length) return res.status(400).json({ success: false, message: 'Choose photographs from your own library.' });
    const shoot = await ensureLibraryShoot(req.user.id, parsed.data.folder);
    await StorageAsset.updateMany({ userId: req.user.id, _id: { $in: parsed.data.assetIds } }, { $set: { folder: parsed.data.folder, ...(shoot ? { shootId: shoot._id } : {}) }, ...(!shoot ? { $unset: { shootId: 1 } } : {}) });
    res.json({ success: true, data: { movedCount: parsed.data.assetIds.length } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: 'We could not move these photographs.' }); }
}

export async function downloadLibraryArchive(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode === 'unavailable') return res.status(403).json({ success: false, message: 'This library is unavailable.' });
    const parsed = z.object({ assetIds: photoIds.min(1) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Choose photographs to download.' });
    const assets = await StorageAsset.find({ userId: req.user.id, _id: { $in: parsed.data.assetIds } }).lean();
    if (assets.length !== parsed.data.assetIds.length) return res.status(400).json({ success: false, message: 'Choose photographs from your own library.' });
    const url = await signedArchiveUrl(assets.map(asset => ({ key: asset.rawPublicId || asset.publicId, name: asset.originalFilename })), 'veylo-originals');
    res.json({ success: true, data: { url } });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare these originals.' }); }
}

export async function resolveLibraryPhotos(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode === 'unavailable') return res.status(403).json({ success: false, message: 'This library is unavailable.' });
    const parsed = z.object({ assetIds: photoIds }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Choose photographs from your library.' });
    const rows = await StorageAsset.find({ userId: req.user.id, _id: { $in: parsed.data.assetIds } });
    const byId = new Map(rows.map(asset => [String(asset._id), output(asset)]));
    if (rows.length !== parsed.data.assetIds.length) return res.status(409).json({ success: false, message: 'A photograph is no longer in your library. Choose your photographs again.' });
    res.set('Cache-Control', 'no-store').json({ success: true, data: parsed.data.assetIds.map(id => byId.get(id)) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: 'We could not load these photographs.' }); }
}
