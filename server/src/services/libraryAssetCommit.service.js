import mongoose from 'mongoose';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import { storageCapacityFilter } from './videoQuota.service.js';

// Quota, the saved photo, and an editor return must agree after retries and
// concurrent confirmations. The original bytes stay in R2 throughout.
export async function commitLibraryAsset({ userId, resource, rawResource, fields, limitBytes, collaborationId, sourceAssetId, variationId = 'main', variationName = 'Main edit' }) {
  const session = await mongoose.startSession();
  let result;
  const replay = async (existing, databaseSession) => {
    if ((existing.rawPublicId || '') !== (rawResource?.public_id || '')) throw Object.assign(new Error('This upload has a different camera original.'), { status: 409 });
    if (collaborationId && !await LibraryCollaboration.exists({ _id: collaborationId, userId, status: 'active', expiresAt: { $gt: new Date() }, returnedAssets: { $elemMatch: { assetId: existing._id, sourceAssetId } } }).session(databaseSession || null)) throw Object.assign(new Error('That file is saved in a different upload.'), { status: 409 });
    const user = await User.findById(userId).session(databaseSession || null);
    return { asset: existing, user, replayed: true };
  };
  try {
    await session.withTransaction(async () => {
      const existing = await StorageAsset.findOne({ userId, publicId: resource.public_id }).session(session);
      if (existing) { result = await replay(existing, session); return; }
      const bytes = Number(resource.bytes) + Number(rawResource?.bytes || 0);
      const user = await User.findOneAndUpdate({ _id: userId, ...storageCapacityFilter(bytes, limitBytes) }, { $inc: { storageUsedBytes: bytes } }, { new: true, session });
      if (!user) throw Object.assign(new Error('This photograph would exceed your personal storage. Remove files or download them before trying again.'), { status: 403, code: 'STORAGE_LIMIT_REACHED' });
      const [asset] = await StorageAsset.create([{ ...fields, userId, publicId: resource.public_id, rawPublicId: rawResource?.public_id, rawFormat: rawResource?.format, rawBytes: rawResource?.bytes || 0, format: resource.format, width: resource.width, height: resource.height, bytes, contentHash: resource.etag || undefined, hashAlgorithm: resource.hashAlgorithm, hashVerifiedAt: resource.etag ? new Date() : undefined }], { session });
      if (collaborationId) {
        const job = await LibraryCollaboration.findOne({ _id: collaborationId, userId, kind: 'editor-handoff', status: 'active', expiresAt: { $gt: new Date() }, assetIds: sourceAssetId }).session(session);
        if (!job) throw Object.assign(new Error('This editor link has closed.'), { status: 410 });
        const replaced = (job.approvedReturns || []).filter(item => String(item.sourceAssetId) === String(sourceAssetId) && (item.variationId || 'main') === variationId);
        if (replaced.length && job.acceptedFolderId) await StorageAsset.updateMany({ _id: { $in: replaced.map(item => item.assetId) }, userId, shootId: job.acceptedFolderId }, { $set: { folder: 'Editor returns' }, $unset: { shootId: 1 } }, { session });
        const variationFilter = variationId === 'main' ? { sourceAssetId, $or: [{ variationId: 'main' }, { variationId: { $exists: false } }] } : { sourceAssetId, variationId };
        const linked = await LibraryCollaboration.updateOne({ _id: collaborationId, userId, kind: 'editor-handoff', status: 'active', expiresAt: { $gt: new Date() }, assetIds: sourceAssetId }, { $set: { editorState: 'awaiting-edits' }, $inc: { editorVersion: 1 }, $pull: { approvedReturns: variationFilter }, $push: { returnedAssets: { sourceAssetId, assetId: asset._id, variationId, variationName, uploadedAt: new Date() } } }, { session });
        if (!linked.modifiedCount) throw Object.assign(new Error('This editor link has closed. Ask the photographer for a new link.'), { status: 410 });
      }
      result = { asset, user, replayed: false };
    });
    return result;
  } catch (error) {
    if (error.code === 11000) {
      const existing = await StorageAsset.findOne({ userId, publicId: resource.public_id });
      if (existing) return replay(existing);
    }
    throw error;
  } finally { await session.endSession(); }
}
