import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../models/User.js';
import StorageAsset from '../models/StorageAsset.js';
import LibraryShoot from '../models/LibraryShoot.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import EmailDelivery from '../models/EmailDelivery.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { libraryId, photoIds, libraryPhotoQuery } from '../services/libraryWorkflow.service.js';
import { removeLibraryPhotograph } from '../services/libraryRemoval.service.js';

const cursorSchema = { after: libraryId.optional(), before: z.string().datetime().optional() };
const kindSchema = z.enum(['preselection', 'editor-handoff']);
const folderName = z.string().trim().min(1).max(100).refine(name => !['All photographs', 'Unfiled'].includes(name), 'Choose a folder you created.');
async function selectionPage(model, query, cursor, res) {
  const before = cursor.before || new Date().toISOString();
  const rows = await model.find({ ...query, createdAt: { $lte: new Date(before) }, ...(cursor.after ? { _id: { $gt: cursor.after } } : {}) }).select('_id').sort({ _id: 1 }).limit(1001).lean();
  const hasMore = rows.length > 1000; rows.splice(1000);
  res.json({ success: true, data: rows.map(row => String(row._id)), before, hasMore, nextCursor: hasMore ? String(rows.at(-1)._id) : null });
}
export async function selectAllLibraryPhotos(req, res) {
  try {
    const filters = z.object({ ...cursorSchema, folder: z.string().max(100).optional(), search: z.string().max(500).optional(), type: z.enum(['', 'raw', 'image']).optional() }).strict().parse(req.query);
    const user = await User.findById(req.user.id);
    if (!user || (await resolveEntitlements(user, { includeUsage: false })).features.storageMode === 'unavailable') return res.status(403).json({ success: false, message: 'Your Photo Library is unavailable.' });
    await selectionPage(StorageAsset, libraryPhotoQuery(req.user.id, filters), filters, res);
  } catch (error) { res.status(error instanceof z.ZodError ? 400 : 500).json({ success: false, message: 'These photographs could not all be selected. Try again.' }); }
}
export async function selectAllLibraryLinks(req, res) {
  try {
    const filters = z.object({ ...cursorSchema, kind: kindSchema }).strict().parse(req.query);
    await selectionPage(LibraryCollaboration, { userId: req.user.id, kind: filters.kind, status: { $ne: 'deleted' } }, filters, res);
  } catch (error) { res.status(error instanceof z.ZodError ? 400 : 500).json({ success: false, message: 'These links could not all be selected. Try again.' }); }
}
export async function deleteLibraryPhotoBatch(req, res) {
  try {
    const { assetIds } = z.object({ assetIds: photoIds.min(1).max(25) }).strict().parse(req.body);
    const results = []; let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, assetIds.length) }, async () => {
      while (cursor < assetIds.length) {
        const id = assetIds[cursor++];
        try { results.push(await removeLibraryPhotograph(req.user.id, id)); }
        catch { results.push({ id, status: 'failed', message: 'This photograph could not be removed. Try again.' }); }
      }
    }));
    res.json({ success: true, data: { removedIds: results.filter(row => ['deleted', 'missing'].includes(row.status)).map(row => row.id), failed: results.filter(row => !['deleted', 'missing'].includes(row.status)) } });
  } catch (error) { res.status(error instanceof z.ZodError ? 400 : 500).json({ success: false, message: 'These photographs could not be removed. Try again.' }); }
}
export async function deleteLibraryLinkBatch(req, res) {
  let session;
  try {
    const { assetIds, kind } = z.object({ assetIds: photoIds.min(1).max(100), kind: kindSchema }).strict().parse(req.body);
    const query = { _id: { $in: assetIds }, userId: req.user.id, kind };
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const rows = await LibraryCollaboration.find(query).select('_id').session(session).lean(), removedIds = rows.map(row => String(row._id));
      await LibraryCollaboration.updateMany({ ...query, status: { $ne: 'deleted' } }, { $set: { status: 'deleted', deletedAt: new Date() }, $inc: { accessVersion: 1 } }, { session });
      if (removedIds.length) await EmailDelivery.updateMany({ userId: req.user.id, eventKey: { $regex: `^library:(${removedIds.join('|')}):` }, status: { $in: ['pending', 'failed'] } }, { $set: { status: 'skipped', skippedAt: new Date() }, $unset: { messageEncrypted: 1 } }, { session });
    });
    // Missing or already removed IDs are safe to retry; they never affect another owner or workspace.
    res.json({ success: true, data: { removedIds: assetIds, failed: [] } });
  } catch (error) { res.status(error instanceof z.ZodError ? 400 : 500).json({ success: false, message: 'These links could not be deleted. Try again.' }); }
  finally { await session?.endSession(); }
}
export async function deleteLibraryFolders(req, res) {
  let session;
  try {
    const { names } = z.object({ names: z.array(folderName).min(1).max(100).refine(values => new Set(values).size === values.length) }).strict().parse(req.body);
    const user = await User.findById(req.user.id);
    if (!user || (await resolveEntitlements(user, { includeUsage: false })).features.storageMode !== 'read-write') return res.status(403).json({ success: false, message: 'Renew Pro to organise folders.' });
    session = await mongoose.startSession(); let movedCount = 0;
    await session.withTransaction(async () => {
      const folders = await LibraryShoot.find({ userId: req.user.id, name: { $in: names } }).session(session).select('_id');
      const ids = folders.map(folder => folder._id);
      const moved = await StorageAsset.updateMany({ userId: req.user.id, $or: [{ folder: { $in: names } }, { shootId: { $in: ids } }] }, { $set: { folder: 'Unfiled' }, $unset: { shootId: 1 } }, { session });
      movedCount = moved.modifiedCount;
      await LibraryCollaboration.updateMany({ userId: req.user.id, $or: [{ acceptedFolderId: { $in: ids } }, { acceptedFolder: { $in: names } }] }, { $unset: { acceptedFolderId: 1, acceptedFolder: 1 }, $inc: { editorVersion: 1 } }, { session });
      await LibraryShoot.deleteMany({ userId: req.user.id, name: { $in: names } }, { session });
    });
    res.json({ success: true, data: { removedNames: names, movedCount } });
  } catch (error) { res.status(error instanceof z.ZodError ? 400 : 500).json({ success: false, message: error instanceof z.ZodError ? 'Choose folders you created. “Not in a folder” cannot be deleted.' : 'These folders could not be deleted. Your photographs are kept.' }); }
  finally { await session?.endSession(); }
}
