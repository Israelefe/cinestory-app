import mongoose from 'mongoose';
import StorageAsset from '../models/StorageAsset.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import User from '../models/User.js';
import { schedulePortfolioRemoval, finishPortfolioRemoval } from './portfolioLifecycle.service.js';
import { removeStorageAsset } from './storageMedia.service.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';

export async function removeLibraryPhotograph(userId, id) {
  const asset = await StorageAsset.findOne({ _id: id, userId });
  if (!asset) return { id, status: 'missing' };
  const links = await LibraryCollaboration.find({ userId, status: { $in: ['active', 'submitted'] }, expiresAt: { $gt: new Date() }, $or: [{ assetIds: asset._id }, { 'returnedAssets.assetId': asset._id }] }).select('title kind').lean();
  if (links.length) return { id, status: 'protected', links, message: `Close the active link${links.length > 1 ? 's' : ''} before removing this photo: ${links.map(link => link.title).join(', ')}.` };
  const cleanup = await schedulePortfolioRemoval(userId, [asset.publicId]);
  await removeStorageAsset(asset.publicId);
  if (asset.rawPublicId) await removeStorageAsset(asset.rawPublicId, 'raw');
  const session = await mongoose.startSession(); let removed;
  try {
    await session.withTransaction(async () => {
      removed = await StorageAsset.deleteOne({ _id: asset._id, userId }, { session });
      if (removed.deletedCount) {
        const user = await User.findById(userId).select('storageUsedBytes').session(session);
        if (user) await User.updateOne({ _id: userId }, { $inc: { storageUsedBytes: -Math.min(asset.bytes, Math.max(0, user.storageUsedBytes || 0)) } }, { session });
      }
    });
  } finally { await session.endSession(); }
  // The persisted cleanup record is retried by the existing portfolio worker.
  await finishPortfolioRemoval(cleanup).catch(() => {});
  recordAnalyticsEventAsync({ name: 'storage.delete.completed', source: 'server', actorType: 'photographer', userId, status: 'completed', bytes: asset.bytes, metadata: { surface: 'library' } });
  return { id, status: removed.deletedCount ? 'deleted' : 'missing' };
}
