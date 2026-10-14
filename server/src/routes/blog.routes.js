import express from 'express';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import BlogPost from '../models/BlogPost.js';
import BlogAsset from '../models/BlogAsset.js';
import { publicBlogPage, presentPublicPosts, publishedBlogFilter } from '../services/blogData.service.js';
import { blogError } from '../services/blogContent.service.js';
import { sendBlogImage, BLOG_IMAGE_VARIANTS } from '../services/blogMedia.service.js';

const router = express.Router();
const action = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const listFields = '-draft -notes -published.markdown -activeJobId -createdBy -updatedBy -publishedBy';
const publicCache = res => res.set('Cache-Control', 'public, max-age=0, must-revalidate');
router.use(rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
router.get('/posts', action(async (req, res) => {
  if (req.query.page !== undefined && !/^[1-9]\d{0,5}$/.test(String(req.query.page))) throw blogError('Blog page not found.', 404);
  const data = await publicBlogPage(Number(req.query.page || 1));
  if (!data) throw blogError('Blog page not found.', 404);
  publicCache(res).json({ data });
}));
router.get('/sitemap', action(async (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const posts = await BlogPost.find(publishedBlogFilter).sort({ _id: 1 }).skip((page - 1) * 1000).limit(1001).select('slug publishedUpdatedAt').lean();
  const total = await BlogPost.countDocuments(publishedBlogFilter);
  publicCache(res).json({ posts: posts.slice(0, 1000).map(p => ({ slug: p.slug, lastmod: p.publishedUpdatedAt })), pages: Math.max(1, Math.ceil(total / 1000)), hasMore: posts.length > 1000 });
}));
router.get('/posts/:slug', action(async (req, res) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug) || req.params.slug.length > 120) throw blogError('Article not found.', 404);
  const post = await BlogPost.findOne({ ...publishedBlogFilter, slug: req.params.slug }).select(listFields).lean();
  if (!post) throw blogError('Article not found.', 404);
  const related = await BlogPost.find({ ...publishedBlogFilter, _id: { $ne: post._id } }).sort({ firstPublishedAt: -1, _id: -1 }).limit(3).select(listFields).lean();
  publicCache(res).json({ data: { kind: 'article', post: (await presentPublicPosts([post], true))[0], related: await presentPublicPosts(related) } });
}));
router.get('/media/:id/:variant', action(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !BLOG_IMAGE_VARIANTS.includes(req.params.variant)) throw blogError('Photo not found.', 404);
  // No arbitrary storage keys and no access to draft photos or client deliverables.
  const published = await BlogPost.exists({ ...publishedBlogFilter, 'published.coverId': req.params.id });
  if (!published) throw blogError('Photo not found.', 404);
  await sendBlogImage(res, await BlogAsset.findById(req.params.id).lean(), req.params.variant);
}));
router.use((error, req, res, next) => {
  if (!error.safe) return next(error);
  res.set('Cache-Control', 'no-store').status(error.status).json({ message: error.message });
});
export default router;
