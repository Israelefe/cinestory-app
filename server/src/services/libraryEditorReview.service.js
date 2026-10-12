import mongoose from 'mongoose';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import { latestAcceptedReturns } from './libraryWorkflow.service.js';

export async function saveEditorReview({ userId, collaborationId, assetId, status, note }) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const job = await LibraryCollaboration.findOne({ _id: collaborationId, userId, kind: 'editor-handoff', 'returnedAssets.assetId': assetId }).session(session);
      if (!job) throw Object.assign(new Error('This returned edit was not found.'), { status: 404 });
      const accepted = new Set(latestAcceptedReturns(job));
      const approvals = new Map(job.returnedAssets.filter(item => accepted.has(String(item.assetId))).map(item => [String(item.sourceAssetId), item.assetId]));
      const item = job.returnedAssets.find(item => String(item.assetId) === assetId);
      item.reviewStatus = status; item.reviewNote = note; item.reviewedAt = new Date();
      if (status === 'accepted') approvals.set(String(item.sourceAssetId), item.assetId);
      else if (String(approvals.get(String(item.sourceAssetId))) === assetId) approvals.delete(String(item.sourceAssetId));
      job.approvedReturns = [...approvals].map(([sourceAssetId, approvedId]) => ({ sourceAssetId, assetId: approvedId }));
      const latest = new Map(job.returnedAssets.map(item => [String(item.sourceAssetId), item]));
      job.editorState = approvals.size === job.assetIds.length ? 'complete' : [...latest.values()].some(item => item.reviewStatus === 'changes-requested') ? 'changes-requested' : [...latest.values()].some(item => !item.reviewStatus || item.reviewStatus === 'pending') ? 'ready-for-review' : 'awaiting-edits';
      job.editorVersion = (job.editorVersion || 0) + 1;
      await job.save({ session }); result = job;
    });
    return result;
  } finally { await session.endSession(); }
}
