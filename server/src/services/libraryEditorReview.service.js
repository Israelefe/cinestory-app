import mongoose from 'mongoose';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import LibraryShoot from '../models/LibraryShoot.js';
import StorageAsset from '../models/StorageAsset.js';
import { latestAcceptedReturns } from './libraryWorkflow.service.js';

export async function saveEditorReview({ userId, collaborationId, assetId, status, note }) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const job = await LibraryCollaboration.findOne({ _id: collaborationId, userId, status: { $ne: 'deleted' }, kind: 'editor-handoff', 'returnedAssets.assetId': assetId }).session(session);
      if (!job) throw Object.assign(new Error('This returned edit was not found.'), { status: 404 });
      const accepted = new Set(latestAcceptedReturns(job));
      const key = item => String(item.sourceAssetId) + ':' + (item.variationId || 'main');
      const approvals = new Map(job.returnedAssets.filter(item => accepted.has(String(item.assetId))).map(item => [key(item), item]));
      const item = job.returnedAssets.find(item => String(item.assetId) === assetId);
      if (!await StorageAsset.exists({ _id: item.assetId, userId }).session(session)) throw Object.assign(new Error('This returned photograph is no longer stored.'), { status: 404 });
      const previous = approvals.get(key(item));
      item.reviewStatus = status; item.reviewNote = note; item.reviewedAt = new Date();
      if (status === 'accepted') {
        approvals.set(key(item), item);
        if (!job.acceptedFolderId) {
          const name = `${job.title.slice(0, 70)} - Accepted edits (${String(job._id).slice(-6)})`;
          const folder = await LibraryShoot.findOneAndUpdate({ userId, name }, { $setOnInsert: { userId, name } }, { upsert: true, new: true, session });
          job.acceptedFolder = folder.name; job.acceptedFolderId = folder._id;
        }
        await StorageAsset.updateOne({ _id: item.assetId, userId }, { $set: { folder: job.acceptedFolder, shootId: job.acceptedFolderId } }, { session });
      } else if (String(previous?.assetId) === assetId) approvals.delete(key(item));
      if (previous && String(approvals.get(key(item))?.assetId) !== String(previous.assetId)) await StorageAsset.updateOne({ _id: previous.assetId, userId, shootId: job.acceptedFolderId }, { $set: { folder: 'Editor returns' }, $unset: { shootId: 1 } }, { session });
      job.approvedReturns = [...approvals.values()].map(value => ({ sourceAssetId: value.sourceAssetId, assetId: value.assetId, variationId: value.variationId || 'main' }));
      const latest = new Map(job.returnedAssets.map(value => [key(value), value]));
      const covered = new Set([...approvals.values()].map(value => String(value.sourceAssetId)));
      const corrections = [...latest.values()].some(value => value.reviewStatus === 'changes-requested');
      const pending = [...latest.values()].some(value => !approvals.has(key(value)) && (!value.reviewStatus || value.reviewStatus === 'pending'));
      job.editorState = corrections ? 'changes-requested' : covered.size === job.assetIds.length && !pending ? 'complete' : pending ? 'ready-for-review' : 'awaiting-edits';
      job.editorVersion = (job.editorVersion || 0) + 1;
      await job.save({ session }); result = job;
    });
    return result;
  } finally { await session.endSession(); }
}
