import { z } from 'zod';
import User from '../models/User.js';
import StorageAsset from '../models/StorageAsset.js';
import Portfolio from '../models/Portfolio.js';
import { PLAN_DEFINITIONS } from '../config/plans.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { confirmStorageUpload, createStorageUploadSignature, removeStorageAsset, storageAssetUrls } from '../services/storageMedia.service.js';

const confirmSchema = z.object({ publicId: z.string().min(5).max(500), version: z.union([z.string(), z.number()]), signature: z.string().min(20).max(200), originalFilename: z.string().trim().max(180).default('photograph'), folder: z.string().trim().max(100).default('All photographs'), tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]) }).strict();
const editSchema = z.object({ folder: z.string().trim().min(1).max(100), tags: z.array(z.string().trim().min(1).max(40)).max(12) }).strict();

function escaped(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function storageAccess(userId) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 });
  return { user, entitlements: await resolveEntitlements(user, { includeUsage: false }) };
}

function output(asset) { return { ...asset.toObject(), ...storageAssetUrls(asset.publicId) }; }

export async function listStorage(req, res) {
  try {
    const { user, entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode === 'unavailable') return res.json({ success: true, data: [], access: entitlements.features.storageMode, usage: { usedBytes: user.storageUsedBytes || 0, limitBytes: PLAN_DEFINITIONS.pro.personalStorageBytes } });
    const query = { userId: user._id };
    if (req.query.folder) query.folder = String(req.query.folder).slice(0, 100);
    if (req.query.search) query.$or = [{ originalFilename: { $regex: escaped(req.query.search), $options: 'i' } }, { tags: { $regex: escaped(req.query.search), $options: 'i' } }];
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const [assets, folders] = await Promise.all([StorageAsset.find(query).sort({ createdAt: -1 }).skip((page - 1) * 60).limit(61), StorageAsset.distinct('folder', { userId: user._id })]);
    const hasMore = assets.length > 60;
    res.json({ success: true, data: assets.slice(0, 60).map(output), folders, access: entitlements.features.storageMode, usage: { usedBytes: user.storageUsedBytes || 0, limitBytes: PLAN_DEFINITIONS.pro.personalStorageBytes }, page, hasMore });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not open your image library.' }); }
}

export async function signStorageUpload(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Personal image storage is included with Veylo Pro.' });
    res.json({ success: true, data: createStorageUploadSignature(req.user.id) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare this upload.' }); }
}

export async function confirmStorageAsset(req, res) {
  let reserved = false;
  let reservedBytes = 0;
  let uploadedPublicId = '';
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Personal image storage is included with Veylo Pro.' });
    if (await StorageAsset.exists({ publicId: parsed.data.publicId })) return res.status(409).json({ success: false, message: 'That photograph is already in your library.' });
    const resource = await confirmStorageUpload(req.user.id, parsed.data);
    uploadedPublicId = resource.public_id;
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(String(resource.format).toLowerCase()) || resource.bytes > 50 * 1024 * 1024) throw Object.assign(new Error('Use a JPEG, PNG, or WebP photograph no larger than 50 MB.'), { status: 400 });
    const user = await User.findOneAndUpdate({ _id: req.user.id, $expr: { $lte: [{ $add: [{ $ifNull: ['$storageUsedBytes', 0] }, resource.bytes] }, PLAN_DEFINITIONS.pro.personalStorageBytes] } }, { $inc: { storageUsedBytes: resource.bytes } }, { new: true });
    if (!user) { await removeStorageAsset(resource.public_id); return res.status(403).json({ success: false, code: 'STORAGE_LIMIT_REACHED', message: 'This upload would take your personal storage above 50 GB.' }); }
    reserved = true;
    reservedBytes = resource.bytes;
    const asset = await StorageAsset.create({ userId: user._id, publicId: resource.public_id, originalFilename: parsed.data.originalFilename, format: resource.format, width: resource.width, height: resource.height, bytes: resource.bytes, folder: parsed.data.folder || 'All photographs', tags: [...new Set(parsed.data.tags.map(tag => tag.toLowerCase()))] });
    res.status(201).json({ success: true, data: output(asset), usage: { usedBytes: user.storageUsedBytes, limitBytes: PLAN_DEFINITIONS.pro.personalStorageBytes } });
  } catch (error) {
    if (reserved && reservedBytes) await User.updateOne(
      { _id: req.user.id },
      [{ $set: { storageUsedBytes: { $max: [0, { $subtract: [{ $ifNull: ['$storageUsedBytes', 0] }, reservedBytes] }] } } }]
    ).catch(() => {});
    if (uploadedPublicId) await removeStorageAsset(uploadedPublicId).catch(() => {});
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not save this photograph.' });
  }
}

export async function editStorageAsset(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'READ_ONLY_STORAGE', message: 'Your retained library is read-only. Download or remove photographs, or renew Pro to organise it.' });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    const asset = await StorageAsset.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { folder: parsed.data.folder, tags: [...new Set(parsed.data.tags.map(tag => tag.toLowerCase()))] }, { new: true });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    res.json({ success: true, data: output(asset) });
  } catch { res.status(500).json({ success: false, message: 'We could not update that photograph.' }); }
}

export async function deleteStorageAsset(req, res) {
  try {
    const asset = await StorageAsset.findOne({ _id: req.params.id, userId: req.user.id });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    await removeStorageAsset(asset.publicId);
    await StorageAsset.deleteOne({ _id: asset._id, userId: req.user.id });
    const portfolio = await Portfolio.findOne({ userId: req.user.id, 'items.publicId': asset.publicId });
    if (portfolio) {
      portfolio.items = portfolio.items.filter(item => item.publicId !== asset.publicId);
      if (portfolio.status === 'published' && portfolio.items.length < 4) { portfolio.status = 'draft'; portfolio.publishedAt = undefined; }
      await portfolio.save();
    }
    await User.updateOne(
      { _id: req.user.id },
      [{ $set: { storageUsedBytes: { $max: [0, { $subtract: [{ $ifNull: ['$storageUsedBytes', 0] }, asset.bytes] }] } } }]
    );
    res.json({ success: true, message: 'Photograph removed from your library.' });
  } catch { res.status(500).json({ success: false, message: 'We could not remove that photograph.' }); }
}

export async function downloadStorageAsset(req, res) {
  try {
    const { entitlements } = await storageAccess(req.user.id);
    if (entitlements.features.storageMode === 'unavailable') return res.status(403).json({ success: false, message: 'This personal image library is no longer available.' });
    const asset = await StorageAsset.findOne({ _id: req.params.id, userId: req.user.id });
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    res.json({ success: true, data: { url: storageAssetUrls(asset.publicId).downloadUrl } });
  } catch { res.status(500).json({ success: false, message: 'We could not prepare that download.' }); }
}
