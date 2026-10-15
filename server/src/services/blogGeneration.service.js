import crypto from 'node:crypto';
import mongoose from 'mongoose';
import BlogPost from '../models/BlogPost.js';
import BlogGenerationJob from '../models/BlogGenerationJob.js';
import AdminUser from '../models/AdminUser.js';
import AdminAudit from '../models/AdminAudit.js';
import BlogAsset from '../models/BlogAsset.js';
import { anyModelProviderConfigured } from './modelProvider.service.js';
import { withModelRequestContext } from './modelRequestContext.service.js';
import { generatedArticleSchema, topicSchema, prepareDraft, slugify, blogError } from './blogContent.service.js';
import { writeGroundedBlogContent } from './blogWriting.service.js';
import { assertExactBlogTopicAvailable } from './blogTopics.service.js';
import { prepareGeneratedBlogCover } from './blogCover.service.js';
import { cleanupDeletedBlogPosts } from './blogDeletion.service.js';

export function presentBlogJob(job) {
  return { id: String(job._id), postId: job.postId ? String(job.postId) : null, kind: job.kind, status: job.status, active: job.active, error: job.error,
    topics: job.kind === 'topics' ? job.result?.topics || [] : [], stage: job.stage || '', errorCode: job.errorCode || '', conflicts: job.conflicts || [], createdAt: job.createdAt };
}
export async function queueBlogGeneration({ ownerId, kind, input, postId = null, revision }) {
  if (!anyModelProviderConfigured()) throw blogError('The writing service is not configured. You can still write and publish an article yourself.', 503);
  if (kind === 'article' && input?.topic) await assertExactBlogTopicAvailable(input, postId);
  const id = new mongoose.Types.ObjectId();
  if (postId) {
    const locked = await BlogPost.findOneAndUpdate({ _id: postId, draftRevision: revision, activeJobId: null, status: { $ne: 'archived' } }, { $set: { activeJobId: id } }).lean();
    if (!locked) throw blogError('The article changed or already has a writing job. Reload it and try again.', 409);
  }
  try {
    return await BlogGenerationJob.create({ _id: id, ownerId, postId, kind, input, inputRevision: revision });
  } catch (error) {
    if (postId) await BlogPost.updateOne({ _id: postId, activeJobId: id }, { $set: { activeJobId: null } });
    if (error.code === 11000) throw blogError('Wait for your current writing job to finish, or cancel it first.', 409);
    throw error;
  }
}
export async function cancelBlogGeneration(job) {
  const cancelled = await BlogGenerationJob.findOneAndUpdate({ _id: job._id, status: { $in: ['queued', 'running'] } }, { $set: { status: 'cancelled', active: false, completedAt: new Date() } }, { new: true }).lean();
  if (!cancelled) throw blogError('This writing job has already finished.', 409);
  if (job.postId) await BlogPost.updateOne({ _id: job.postId, activeJobId: job._id }, { $set: { activeJobId: null } });
  controllers.get(String(job._id))?.abort();
  return cancelled;
}
export async function finishBlogGeneration(job) {
  if (job.postId) {
    const post = await BlogPost.findOne({ _id: job.postId, activeJobId: job._id }).lean();
    if (post) {
      const parsed = generatedArticleSchema.parse(job.result);
      const { slug, ...content } = parsed;
      const draft = prepareDraft({ ...post.draft, ...content, ...(job.cover ? { coverId: job.cover.id, coverAlt: job.cover.alt, coverCredit: job.cover.credit } : {}) });
      let nextSlug = slugify(slug || content.title) || 'article';
      if (!post.firstPublishedAt && await BlogPost.exists({ slug: nextSlug, _id: { $ne: post._id } })) nextSlug = `${nextSlug}-${String(post._id).slice(-6)}`;
      await BlogPost.updateOne({ _id: post._id, activeJobId: job._id, draftRevision: job.inputRevision }, {
        $set: { draft, ...(post.firstPublishedAt ? {} : { slug: nextSlug }), activeJobId: null, updatedBy: job.ownerId }, $inc: { draftRevision: 1 }
      });
    }
    await BlogPost.updateOne({ _id: job.postId, activeJobId: job._id }, { $set: { activeJobId: null } });
  }
  await BlogGenerationJob.updateOne({ _id: job._id, status: 'ready' }, { $set: { active: false } });
}
export async function recoverBlogGeneration() {
  const stale = await BlogGenerationJob.find({ status: 'running', heartbeatAt: { $lt: new Date(Date.now() - 120000) } }).lean();
  for (const job of stale) {
    const failed = await BlogGenerationJob.updateOne({ _id: job._id, status: 'running', leaseId: job.leaseId, heartbeatAt: job.heartbeatAt }, { $set: { status: 'failed', active: false, completedAt: new Date(), error: 'The writing process stopped. Retry to generate this draft again.' } });
    if (failed.modifiedCount && job.postId) await BlogPost.updateOne({ _id: job.postId, activeJobId: job._id }, { $set: { activeJobId: null } });
  }
  for (const job of await BlogGenerationJob.find({ status: 'ready', active: true }).lean()) {
    try { await finishBlogGeneration(job); }
    catch (error) {
      if (error.name !== 'ZodError' && error.code !== 11000) throw error;
      await BlogGenerationJob.updateOne({ _id: job._id, status: 'ready', active: true }, { $set: { status: 'failed', active: false, error: 'The generated draft could not be saved. Please retry.' } });
      if (job.postId) await BlogPost.updateOne({ _id: job.postId, activeJobId: job._id }, { $set: { activeJobId: null } });
    }
  }
  // A process can stop after taking a post lock but before creating its job.
  const orphans = await BlogPost.find({ activeJobId: { $ne: null }, updatedAt: { $lt: new Date(Date.now() - 120000) } }).select('activeJobId').lean();
  for (const post of orphans) if (!await BlogGenerationJob.exists({ _id: post.activeJobId, active: true })) await BlogPost.updateOne({ _id: post._id, activeJobId: post.activeJobId }, { $set: { activeJobId: null } });
}
export async function generateBlogContent(job, signal, stage) {
  return writeGroundedBlogContent(job, signal, stage);
}
const controllers = new Map();
let timer, busy = false;
export async function runBlogJob(job, generate = generateBlogContent) {
  const controller = new AbortController();
  let cover = null, accepted = false;
  controllers.set(String(job._id), controller);
  const lease = { _id: job._id, status: 'running', leaseId: job.leaseId };
  const heartbeat = setInterval(() => {
    void BlogGenerationJob.updateOne(lease, { $set: { heartbeatAt: new Date() } }).then(result => { if (!result.matchedCount) controller.abort(); }).catch(() => controller.abort());
  }, 10000);
  heartbeat.unref?.();
  try {
    const admin = await AdminUser.findOne({ _id: job.ownerId, accountStatus: 'active', role: { $in: ['superadmin', 'operations'] } }).lean();
    if (!admin) throw blogError('The administrator no longer has permission to generate this article.', 403);
    const stage = async value => { controller.signal.throwIfAborted(); await BlogGenerationJob.updateOne(lease, { $set: { stage: value } }); };
    const raw = await withModelRequestContext({ signal: controller.signal, background: false, ownerId: `admin:${job.ownerId}` }, () => generate(job, controller.signal, stage));
    const result = (job.kind === 'topics' ? topicSchema : generatedArticleSchema).parse(raw);
    controller.signal.throwIfAborted();
    if (job.kind === 'article') { await stage('Preparing your cover'); cover = await prepareGeneratedBlogCover(job, result.title); }
    controller.signal.throwIfAborted();
    const ready = await BlogGenerationJob.findOneAndUpdate(lease, { $set: { status: 'ready', result, cover, completedAt: new Date() } }, { new: true }).lean();
    if (ready) {
      accepted = true;
      await finishBlogGeneration(ready);
      await AdminAudit.create({ adminId: job.ownerId, action: 'blog.generated', resourceType: 'blog', resourceId: String(job.postId || job._id), details: { kind: job.kind } });
    }
  } catch (error) {
    const failed = await BlogGenerationJob.updateOne(lease, { $set: { status: 'failed', active: false, error: error.safe ? error.message : 'The writing service could not complete this draft. Please retry.', errorCode: error.safe ? error.code || '' : '', conflicts: error.safe ? error.conflicts || [] : [], completedAt: new Date() } });
    if (failed.modifiedCount && job.postId) await BlogPost.updateOne({ _id: job.postId, activeJobId: job._id }, { $set: { activeJobId: null } });
  } finally { clearInterval(heartbeat); controllers.delete(String(job._id)); if (cover && !accepted) await BlogAsset.deleteOne({ _id: cover.id, source: 'generated' }).catch(() => {}); }
}
export function startBlogWorker() {
  if (timer) return;
  const tick = async () => {
    if (busy || mongoose.connection.readyState !== 1) return;
    busy = true;
    try {
      await recoverBlogGeneration();
      await cleanupDeletedBlogPosts();
      const job = await BlogGenerationJob.findOneAndUpdate({ status: 'queued' }, { $set: { status: 'running', leaseId: crypto.randomUUID(), heartbeatAt: new Date() } }, { sort: { createdAt: 1 }, new: true }).lean();
      if (job) await runBlogJob(job);
    } catch (error) { console.error('[blog/worker]', error.safe ? error.message : 'A writing job could not be processed.'); }
    finally { busy = false; }
  };
  timer = setInterval(() => { void tick(); }, 2000); timer.unref?.(); void tick();
}
export function stopBlogWorker() { clearInterval(timer); timer = null; for (const controller of controllers.values()) controller.abort(); }
