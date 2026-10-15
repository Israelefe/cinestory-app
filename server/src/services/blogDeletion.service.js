import BlogPost from '../models/BlogPost.js';
import BlogAsset from '../models/BlogAsset.js';
import BlogGenerationJob from '../models/BlogGenerationJob.js';
import { deleteR2Object } from './r2.service.js';
import { blogError } from './blogContent.service.js';

export async function cleanupDeletedBlogPosts(postId = null) {
  const due = postId ? { _id: postId } : { $or: [{ deletionCleanupAt: null }, { deletionCleanupAt: { $lte: new Date() } }] };
  const posts = await BlogPost.find({ deletedAt: { $ne: null }, ...due }).select('_id').limit(10).lean();
  for (const post of posts) {
    try {
      await BlogGenerationJob.deleteMany({ postId: post._id, active: false });
      const assets = await BlogAsset.find({ postId: post._id }).select('originalKey variants').lean();
      const prefix = `veylo/blog/${post._id}/`;
      const keys = [...new Set(assets.flatMap(asset => [asset.originalKey, ...Object.values(asset.variants || {})]).filter(key => typeof key === 'string' && key.startsWith(prefix)))];
      for (let offset = 0; offset < keys.length; offset += 8) {
        const results = await Promise.allSettled(keys.slice(offset, offset + 8).map(deleteR2Object));
        if (results.some(result => result.status === 'rejected')) throw new Error('Cover cleanup needs retry');
      }
      await BlogAsset.deleteMany({ postId: post._id });
      await BlogPost.deleteOne({ _id: post._id, deletedAt: { $ne: null } });
    } catch {
      await BlogPost.updateOne({ _id: post._id, deletedAt: { $ne: null } }, { $set: { deletionCleanupAt: new Date(Date.now() + 300000) } });
    }
  }
}

export async function deleteBlogArticle(postId, revision) {
  // Hide and erase the article atomically before removing storage. The small
  // tombstone makes failed storage cleanup retryable across process restarts.
  const post = await BlogPost.findOneAndUpdate({ _id: postId, draftRevision: revision, activeJobId: null, deletedAt: null }, { $set: { status: 'archived', deletedAt: new Date(), deletionCleanupAt: new Date(), draft: {}, published: null, notes: '' } }, { new: true }).lean();
  if (!post) throw blogError('The article changed or has a writing job running. Reload it before deleting.', 409);
  // The existing worker removes cover files and generation records. Deletion
  // returns promptly even if storage is unavailable; access is already closed.
}
