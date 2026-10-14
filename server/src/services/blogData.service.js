import BlogPost from '../models/BlogPost.js';
import BlogAsset from '../models/BlogAsset.js';
import { blogChecks } from './blogContent.service.js';

export function presentAdminPost(post) {
  const value = post.toObject ? post.toObject() : post;
  return { id: String(value._id), slug: value.slug, status: value.status, draft: { ...value.draft, coverId: value.draft.coverId ? String(value.draft.coverId) : null },
    notes: value.notes, revision: value.draftRevision, publishedRevision: value.publishedRevision,
    hasUnpublishedChanges: value.publishedRevision !== value.draftRevision, firstPublishedAt: value.firstPublishedAt,
    updatedAt: value.updatedAt, activeJobId: value.activeJobId ? String(value.activeJobId) : null, checks: blogChecks(value.draft) };
}
export function presentPublicPost(post, asset, full = false) {
  const p = post.published;
  const prefix = p.coverId && asset ? `/api/v1/blog/media/${p.coverId}` : '';
  const widths = new Set();
  const srcSet = prefix ? [480, 960, 1440].map(width => ({ variant: width, width: Math.min(width, asset.width) })).filter(item => {
    if (widths.has(item.width)) return false;
    widths.add(item.width); return true;
  }).map(item => `${prefix}/${item.variant} ${item.width}w`).join(', ') : '';
  return { slug: post.slug, title: p.title, excerpt: p.excerpt, readingMinutes: p.readingMinutes,
    publishedAt: new Date(post.firstPublishedAt).toISOString(), updatedAt: new Date(post.publishedUpdatedAt).toISOString(),
    coverAlt: p.coverAlt, coverCredit: p.coverCredit,
    cover: prefix ? { src: `${prefix}/960`, srcSet, og: `${prefix}/og`, width: asset.width, height: asset.height } : null,
    ...(full ? { bodyHtml: p.bodyHtml, toc: p.toc, seoTitle: p.seoTitle, metaDescription: p.metaDescription } : {}) };
}
export async function presentPublicPosts(posts, full = false) {
  const ids = posts.map(p => p.published?.coverId).filter(Boolean);
  const assets = await BlogAsset.find({ _id: { $in: ids } }).select('width height').lean();
  const byId = new Map(assets.map(a => [String(a._id), a]));
  return posts.map(post => presentPublicPost(post, byId.get(String(post.published.coverId)), full));
}
export const publishedBlogFilter = { status: 'published', published: { $ne: null } };
export async function publicBlogPage(page) {
  const total = await BlogPost.countDocuments(publishedBlogFilter), pages = Math.max(1, Math.ceil(total / 12));
  if (page > pages) return null;
  const posts = await BlogPost.find(publishedBlogFilter).sort({ firstPublishedAt: -1, _id: -1 }).skip((page - 1) * 12).limit(12).select('-draft -notes -published.markdown -published.bodyHtml -published.toc').lean();
  return { kind: 'index', page, pages, total, posts: await presentPublicPosts(posts) };
}
