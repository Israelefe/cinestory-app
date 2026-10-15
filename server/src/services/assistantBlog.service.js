import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import BlogPost from '../models/BlogPost.js';
import { publishedBlogFilter } from './blogData.service.js';

const stop = new Set('a about an and any are article articles at available be blog by can do does find for from guide have help how i in is it know latest me my new of on please posts published read reading recommend show some tell that the there these this to useful use veylo want what where which with write you your'.split(' '));
const canonical = word => ({ photos: 'photo', photographs: 'photo', photograph: 'photo', pictures: 'photo', images: 'photo', picture: 'photo', image: 'photo', clients: 'client', customers: 'client', customer: 'client', weddings: 'wedding', delivering: 'deliver', delivery: 'deliver', send: 'deliver', sending: 'deliver', downloads: 'download', downloading: 'download', captions: 'caption' })[word] || word;
const terms = value => [...new Set(String(value || '').toLowerCase().replace(/photo\s*swap/g, 'photoswap').replace(/grid\s*board/g, 'gridboard').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(word => word.length > 1 && !stop.has(word)).map(canonical))].slice(0, 80);
const plain = value => sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
const validSlug = slug => typeof slug === 'string' && slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

export async function findAssistantBlogReferences(query, { signal } = {}) {
  if (mongoose.connection.readyState !== 1) return { status: 'unavailable', articles: [] };
  const queryTerms = terms(query), explicitBlog = /\b(?:blog|articles?|read|reading)\b/i.test(query);
  const directSlug = String(query).match(/\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\b/)?.[1];
  try {
    const ranked = [];
    // Search the complete public catalogue, rather than only recent articles.
    for await (const post of BlogPost.find(publishedBlogFilter).select('slug firstPublishedAt published.title published.excerpt published.keyword published.toc.text').maxTimeMS(2000).lean().cursor()) {
      signal?.throwIfAborted();
      if (!validSlug(post.slug)) continue;
      const p = post.published, title = new Set(terms(`${p.title} ${p.keyword}`)), headings = new Set(terms((p.toc || []).map(item => item.text).join(' '))), excerpt = new Set(terms(p.excerpt));
      const score = post.slug === directSlug ? 1000 : queryTerms.reduce((sum, term) => sum + (title.has(term) ? 4 : headings.has(term) ? 3 : excerpt.has(term) ? 1 : 0), 0);
      if (score >= 3 || explicitBlog && !queryTerms.length) ranked.push({ id: post._id, score, at: Number(post.firstPublishedAt) || 0 });
    }
    ranked.sort((a, b) => b.score - a.score || b.at - a.at);
    const selected = ranked.slice(0, 3);
    if (!selected.length) return { status: 'available', articles: [] };
    // Read only published fields again so a concurrent unpublish cannot expose a draft.
    const posts = await BlogPost.find({ ...publishedBlogFilter, _id: { $in: selected.map(item => item.id) } }).select('slug published.title published.excerpt published.bodyHtml publishedUpdatedAt').maxTimeMS(2000).lean();
    signal?.throwIfAborted();
    const byId = new Map(posts.map(post => [String(post._id), post]));
    const articles = selected.map(item => byId.get(String(item.id))).filter(Boolean).map(post => {
      const text = plain(post.published.bodyHtml), sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
      const snippets = sentences.map((sentence, index) => ({ sentence: sentence.trim(), index, score: terms(sentence).filter(term => queryTerms.includes(term)).length })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 8).sort((a, b) => a.index - b.index);
      return { title: plain(post.published.title), url: `/blog/${post.slug}`, excerpt: plain(post.published.excerpt), passages: snippets.map(item => item.sentence).join(' ').slice(0, 2400), updatedAt: post.publishedUpdatedAt?.toISOString() || null };
    });
    return { status: 'available', articles };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'unavailable', articles: [] };
  }
}

export async function keepPublishedBlogLinks(reply, references, { signal } = {}) {
  const allowed = new Set();
  if (references.articles.length && mongoose.connection.readyState === 1) {
    try {
      const slugs = references.articles.map(article => article.url.slice('/blog/'.length));
      const current = await BlogPost.find({ ...publishedBlogFilter, slug: { $in: slugs } }).select('slug').maxTimeMS(2000).lean();
      current.forEach(post => allowed.add(`/blog/${post.slug}`));
    } catch (error) { if (signal?.aborted) throw error; }
  }
  signal?.throwIfAborted();
  return reply.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (link, label, href) => {
    try {
      const url = new URL(href, 'https://veylo.com.ng');
      if (url.hostname === 'veylo.com.ng' && url.pathname.startsWith('/blog/')) return url.protocol === 'https:' && !url.username && !url.password && !url.port && allowed.has(url.pathname) && !url.search ? link : label;
    } catch {}
    return link;
  });
}
