import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import BlogPost from '../models/BlogPost.js';
import BlogAsset from '../models/BlogAsset.js';
import BlogGenerationJob from '../models/BlogGenerationJob.js';
import AdminAudit from '../models/AdminAudit.js';
import { saveSchema, prepareDraft, slugify, blogError, blogChecks } from '../services/blogContent.service.js';
import { presentAdminPost } from '../services/blogData.service.js';
import { uploadBlogCover, sendBlogImage } from '../services/blogMedia.service.js';
import { queueBlogGeneration, cancelBlogGeneration, presentBlogJob } from '../services/blogGeneration.service.js';
import { anyModelProviderConfigured } from '../services/modelProvider.service.js';
import { createBlogCover, blogCoverPhotoList } from '../services/blogCover.service.js';
import { BLOG_COVER_PHOTOS } from '../constants/blogCoverPhotos.js';
import { assertExactBlogTopicAvailable } from '../services/blogTopics.service.js';
import { deleteBlogArticle } from '../services/blogDeletion.service.js';

const router = express.Router();
const action = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const edit = (req, res, next) => ['superadmin', 'operations'].includes(req.admin?.role) ? next() : res.status(403).json({ message: 'Your administrator role cannot change blog articles.' });
const limited = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.admin._id), message: { message: 'Please wait a minute before starting more writing jobs.' } });
const uploadLimited = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.admin._id) });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2 } });
const revisionSchema = z.object({ revision: z.number().int().positive() }).strict();
const generationSchema = z.object({ kind: z.enum(['topics', 'article']), postId: z.string().regex(/^[a-f\d]{24}$/i).optional(), revision: z.number().int().positive().optional(), topic: z.string().trim().max(180).default(''), keyword: z.string().trim().max(150).default(''), notes: z.string().trim().max(12000).default(''), rewrite: z.boolean().default(false) }).strict();
async function audit(req, name, id, details = {}) {
  await AdminAudit.create({ adminId: req.admin._id, action: `blog.${name}`, resourceType: 'blog', resourceId: String(id), details, ipAddress: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 500) });
}
async function getPost(id) {
  if (!mongoose.isValidObjectId(id)) throw blogError('Article not found.', 404);
  const post = await BlogPost.findOne({ _id: id, deletedAt: null }).lean();
  if (!post) throw blogError('Article not found.', 404);
  return post;
}
async function getJob(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw blogError('Writing job not found.', 404);
  const job = await BlogGenerationJob.findOne({ _id: req.params.id, ...(['superadmin', 'read-only'].includes(req.admin.role) ? {} : { ownerId: req.admin._id }) }).lean();
  if (!job) throw blogError('Writing job not found.', 404);
  return job;
}
async function checkCover(postId, coverId) {
  if (coverId && !await BlogAsset.exists({ _id: coverId, postId })) throw blogError('This cover photo does not belong to this article.', 403);
}
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['superadmin', 'operations', 'read-only'].includes(req.admin?.role)) return res.status(403).json({ message: 'Your administrator role cannot access the blog workspace.' });
  next();
});
router.get('/posts', action(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1)));
  const filter = { deletedAt: null };
  if (['draft', 'published', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
  if (query) filter['draft.title'] = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [posts, total, activeJobs] = await Promise.all([
    BlogPost.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * 24).limit(24).select('-draft.markdown -draft.bodyHtml -published -notes').lean(),
    BlogPost.countDocuments(filter), BlogGenerationJob.find({ ownerId: req.admin._id, active: true }).lean()
  ]);
  res.json({ posts: posts.map(p => ({ id: String(p._id), title: p.draft.title || 'Untitled article', slug: p.slug, status: p.status, updatedAt: p.updatedAt, hasUnpublishedChanges: p.publishedRevision !== p.draftRevision })), page, pages: Math.max(1, Math.ceil(total / 24)), activeJobs: activeJobs.map(presentBlogJob), aiConfigured: anyModelProviderConfigured() });
}));
router.post('/posts', edit, action(async (req, res) => {
  const id = new mongoose.Types.ObjectId();
  const post = await BlogPost.create({ _id: id, slug: `article-${id}`, createdBy: req.admin._id, updatedBy: req.admin._id });
  await audit(req, 'created', id);
  res.status(201).json({ post: presentAdminPost(post) });
}));
router.get('/cover-photos', (req, res) => res.json({ photos: blogCoverPhotoList() }));
router.post('/articles/generate', edit, limited, action(async (req, res) => {
  const input = generationSchema.omit({ kind: true, postId: true, revision: true, rewrite: true }).extend({ topic: z.string().trim().min(3).max(180) }).parse(req.body);
  if (!anyModelProviderConfigured()) throw blogError('The writing service is not configured. You can still write articles manually.', 503);
  await assertExactBlogTopicAvailable(input);
  const id = new mongoose.Types.ObjectId();
  const post = await BlogPost.create({ _id: id, slug: `article-${id}`, draft: { title: input.topic, keyword: input.keyword }, notes: input.notes, createdBy: req.admin._id, updatedBy: req.admin._id });
  try {
    const job = await queueBlogGeneration({ ownerId: req.admin._id, kind: 'article', postId: id, revision: post.draftRevision, input });
    await audit(req, 'generation-started', id, { kind: 'article' });
    const current = await getPost(id);
    res.status(202).json({ post: presentAdminPost(current), job: presentBlogJob(job) });
  } catch (error) {
    await BlogPost.deleteOne({ _id: id, draftRevision: 1, activeJobId: null, status: 'draft', createdBy: req.admin._id });
    throw error;
  }
}));
router.get('/posts/:id', action(async (req, res) => res.json({ post: presentAdminPost(await getPost(req.params.id)) })));
router.delete('/posts/:id', edit, action(async (req, res) => {
  const { revision } = revisionSchema.parse(req.body), post = await getPost(req.params.id);
  await deleteBlogArticle(post._id, revision);
  await audit(req, 'deleted', post._id, { wasPublished: post.status === 'published' });
  res.json({ deleted: true });
}));
router.patch('/posts/:id', edit, action(async (req, res) => {
  const input = saveSchema.parse(req.body), post = await getPost(req.params.id);
  const slug = slugify(input.slug);
  if (!slug) throw blogError('Add a URL containing letters or numbers.');
  if (post.firstPublishedAt && slug !== post.slug) throw blogError('The URL is fixed after first publication to keep shared links working.', 409);
  await checkCover(post._id, input.draft.coverId);
  const updated = await BlogPost.findOneAndUpdate({ _id: post._id, draftRevision: input.revision, firstPublishedAt: post.firstPublishedAt || null, activeJobId: null, status: { $ne: 'archived' } }, { $set: { slug, notes: input.notes, draft: prepareDraft(input.draft), updatedBy: req.admin._id }, $inc: { draftRevision: 1 } }, { new: true }).lean();
  if (!updated) throw blogError('This draft changed, is archived, or has a writing job running. Reload it before editing.', 409);
  await audit(req, 'saved', post._id, { revision: updated.draftRevision });
  res.json({ post: presentAdminPost(updated) });
}));
router.post('/preview', action(async (req, res) => {
  const input = z.object({ markdown: z.string().max(80000) }).strict().parse(req.body);
  res.json(prepareDraft({ markdown: input.markdown }));
}));
router.post('/posts/:id/publish', edit, action(async (req, res) => {
  const input = revisionSchema.extend({ reviewed: z.literal(true) }).parse(req.body), post = await getPost(req.params.id);
  if (post.draftRevision !== input.revision) throw blogError('This draft changed. Reload and review the current version before publishing.', 409);
  if (post.status === 'published' && post.publishedRevision === input.revision) return res.json({ post: presentAdminPost(post) });
  const checks = blogChecks(post.draft);
  if (checks.errors.length) return res.status(422).json({ message: 'Complete the article before publishing.', checks });
  await checkCover(post._id, post.draft.coverId);
  const now = new Date();
  const sameContent = post.published && Object.keys(post.draft).every(key => JSON.stringify(post.draft[key]) === JSON.stringify(post.published[key]));
  const updated = await BlogPost.findOneAndUpdate({ _id: post._id, draftRevision: input.revision, activeJobId: null, status: { $ne: 'archived' } }, { $set: { published: post.draft, status: 'published', publishedRevision: input.revision, firstPublishedAt: post.firstPublishedAt || now, publishedUpdatedAt: sameContent ? post.publishedUpdatedAt : now, publishedBy: req.admin._id } }, { new: true }).lean();
  if (!updated) throw blogError('This draft changed or has a writing job running. Review the current draft before publishing.', 409);
  await audit(req, 'published', post._id, { revision: input.revision });
  res.json({ post: presentAdminPost(updated) });
}));
for (const [operation, status] of [['unpublish', 'draft'], ['archive', 'archived'], ['restore', 'draft']]) router.post(`/posts/:id/${operation}`, edit, action(async (req, res) => {
  const { revision } = revisionSchema.parse(req.body), post = await getPost(req.params.id);
  const updated = await BlogPost.findOneAndUpdate({ _id: post._id, draftRevision: revision, activeJobId: null }, { $set: { status, updatedBy: req.admin._id } }, { new: true }).lean();
  if (!updated) throw blogError('The article changed or has a writing job running. Reload it and try again.', 409);
  await audit(req, operation, post._id);
  res.json({ post: presentAdminPost(updated) });
}));
router.post('/posts/:id/cover', edit, uploadLimited, upload.single('cover'), action(async (req, res) => {
  const post = await getPost(req.params.id);
  if (post.activeJobId || post.status === 'archived') throw blogError('Wait for the writing job to finish, or restore the article before uploading.', 409);
  const asset = await uploadBlogCover(req.file, post._id, req.admin._id, { title: post.draft.title });
  await audit(req, 'cover-uploaded', post._id, { assetId: String(asset._id) });
  res.status(201).json({ coverId: String(asset._id) });
}));
router.post('/posts/:id/cover/generate', edit, uploadLimited, action(async (req, res) => {
  const { revision, photoId } = revisionSchema.extend({ photoId: z.enum(BLOG_COVER_PHOTOS.map(photo => photo.id)).optional() }).parse(req.body), post = await getPost(req.params.id);
  if (post.draftRevision !== revision || post.activeJobId || post.status === 'archived') throw blogError('The article changed or has a writing job running. Reload it and try again.', 409);
  if (!post.draft.title.trim()) throw blogError('Add and save the article title before generating a cover.');
  const cover = await createBlogCover(post._id, req.admin._id, post.draft.title, { photoId });
  await audit(req, 'cover-generated', post._id, { assetId: cover.id });
  res.status(201).json({ coverId: cover.id, coverAlt: cover.alt, coverCredit: cover.credit });
}));
router.get('/media/:id/:variant', action(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw blogError('Photo not found.', 404);
  const asset = await BlogAsset.findById(req.params.id).lean();
  if (!asset || !await BlogPost.exists({ _id: asset.postId, deletedAt: null })) throw blogError('Photo not found.', 404);
  await sendBlogImage(res, asset, req.params.variant, true);
}));
router.post('/generations', edit, limited, action(async (req, res) => {
  const input = generationSchema.parse(req.body);
  if (input.kind === 'article' && (!input.postId || !input.revision || !input.topic)) throw blogError('Choose an article and add a topic before generating.');
  if (input.kind === 'topics' && input.postId) throw blogError('Topic suggestions do not need an article.');
  const job = await queueBlogGeneration({ ownerId: req.admin._id, kind: input.kind, postId: input.postId, revision: input.revision, input: { topic: input.topic, keyword: input.keyword, notes: input.notes, rewrite: input.rewrite } });
  await audit(req, 'generation-started', input.postId || job._id, { kind: input.kind });
  res.status(202).json({ job: presentBlogJob(job) });
}));
router.get('/generations/:id', action(async (req, res) => res.json({ job: presentBlogJob(await getJob(req)) })));
router.get('/generations', action(async (req, res) => {
  const jobs = await BlogGenerationJob.find({ ownerId: req.admin._id }).sort({ createdAt: -1 }).limit(10).lean();
  res.json({ jobs: jobs.map(presentBlogJob) });
}));
router.post('/generations/:id/cancel', edit, action(async (req, res) => {
  const job = await cancelBlogGeneration(await getJob(req));
  await audit(req, 'generation-cancelled', job.postId || job._id);
  res.json({ job: presentBlogJob(job) });
}));
router.post('/generations/:id/retry', edit, limited, action(async (req, res) => {
  const previous = await getJob(req);
  if (!['failed', 'cancelled'].includes(previous.status)) throw blogError('Only a failed or cancelled writing job can be retried.', 409);
  const post = previous.postId ? await getPost(previous.postId) : null;
  if (post && previous.inputRevision !== post.draftRevision) throw blogError('The draft has changed. Start a new writing job with your current brief.', 409);
  const job = await queueBlogGeneration({ ownerId: req.admin._id, kind: previous.kind, postId: previous.postId, revision: previous.inputRevision, input: previous.input });
  await audit(req, 'generation-retried', previous.postId || previous._id);
  res.status(202).json({ job: presentBlogJob(job) });
}));
router.use((error, req, res, next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ message: 'Check the article fields and try again.', fields: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
  if (error.code === 11000) return res.status(409).json({ message: 'That article URL is already in use. Choose another URL.' });
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'The cover photo must be 5 MB or smaller.' });
  if (error.safe) return res.status(error.status).json({ message: error.message, ...(error.code ? { code: error.code } : {}), ...(error.conflicts ? { conflicts: error.conflicts } : {}) });
  next(error);
});
export default router;
