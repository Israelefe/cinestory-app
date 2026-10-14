import { applyShareMeta } from './deliveryShell.js';
import { blogMetadata, blogStructuredData, blogScriptJson, escapeBlogHtml, renderBlogShell } from '../../shared/blogPresentation.mjs';

const e = escapeBlogHtml;
const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' };
function apiHeaders(request, env) {
  return { Accept: 'application/json', ...(env.VEYLO_EDGE_KEY && request.headers.get('cf-connecting-ip') ? { 'x-veylo-edge-key': env.VEYLO_EDGE_KEY, 'x-veylo-client-ip': request.headers.get('cf-connecting-ip') } : {}) };
}
function unavailable(status) {
  const missing = status === 404;
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${missing ? 'Page not found' : 'Blog temporarily unavailable'} · Veylo</title><body style="background:#070709;color:#f4efe9;font:16px/1.8 system-ui;margin:0;padding:12vh 24px"><main style="max-width:600px;margin:auto"><h1>${missing ? 'Page not found.' : 'The blog is temporarily unavailable.'}</h1><p>${missing ? 'This article or blog page is no longer available.' : 'Please try again in a moment.'}</p><a style="color:#ff9b8e" href="/blog">Back to the blog</a></main></body></html>`, { status, headers: { ...headers, 'Cache-Control': 'no-store', ...(missing ? {} : { 'Retry-After': '30' }) } });
}
export async function handleBlogShell(request, env) {
  const url = new URL(request.url), api = String(env.VEYLO_API_ORIGIN || 'https://veylo-api-ptk3.onrender.com').replace(/\/$/, ''), web = env.VEYLO_WEB_ORIGIN || 'https://veylo.com.ng';
  const match = url.pathname.match(/^\/blog(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?\/?$/);
  const page = url.searchParams.get('page') || '1';
  if (!match || !/^[1-9]\d{0,5}$/.test(page) || (match[1]?.length || 0) > 120) return unavailable(404);
  if (url.pathname.endsWith('/')) { url.pathname = url.pathname.slice(0, -1); return new Response(null, { status: 301, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } }); }
  try {
    const response = await fetch(`${api}/api/v1/blog/posts${match[1] ? `/${encodeURIComponent(match[1])}` : `?page=${page}`}`, { signal: AbortSignal.timeout(15000), headers: apiHeaders(request, env) });
    if (response.status === 404) return unavailable(404);
    if (!response.ok) return unavailable(503);
    const { data } = await response.json(), meta = blogMetadata(data, web);
    const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    if (!shell.ok) return unavailable(503);
    let html = applyShareMeta(await shell.text(), meta, meta.canonical);
    html = html.replace(/<html\b([^>]*)>/i, (_, attributes) => `<html${attributes} data-blog-ssr>`);
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, () => `<meta name="description" content="${e(meta.description)}">`).replace(/<meta\s+property=["']og:type["'][^>]*>/i, () => `<meta property="og:type" content="${e(meta.type)}">`);
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '').replace(/<meta\s+name=["']robots["'][^>]*>/gi, '');
    html = html.replace('</head>', () => `<link rel="canonical" href="${e(meta.canonical)}"><meta name="robots" content="index,follow">${data.kind === 'article' ? `<meta property="article:published_time" content="${e(data.post.publishedAt)}"><meta property="article:modified_time" content="${e(data.post.updatedAt)}">` : ''}${blogStructuredData(data, web).map(value => `<script type="application/ld+json" data-blog-schema="true">${blogScriptJson(value)}</script>`).join('')}</head>`);
    html = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
    html = html.replace('</body>', () => `${renderBlogShell(data)}<script id="blog-published-data" type="application/json">${blogScriptJson({ key: match[1] ? `/blog/${match[1]}` : `/blog?page=${page}`, data })}</script></body>`);
    return new Response(html, { status: 200, headers });
  } catch { return unavailable(503); }
}
export async function handleBlogSitemap(request, env, page = null) {
  const api = String(env.VEYLO_API_ORIGIN || 'https://veylo-api-ptk3.onrender.com').replace(/\/$/, ''), web = String(env.VEYLO_WEB_ORIGIN || 'https://veylo.com.ng').replace(/\/$/, '');
  try {
    const response = await fetch(`${api}/api/v1/blog/sitemap?page=${page || 1}`, { signal: AbortSignal.timeout(15000), headers: apiHeaders(request, env) });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    const contents = page === null ? `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: Math.min(data.pages || 1, 50000) }, (_, i) => `<sitemap><loc>${e(`${web}/blog-sitemap-${i + 1}.xml`)}</loc></sitemap>`).join('')}</sitemapindex>` : `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${page === 1 ? `<url><loc>${e(`${web}/blog`)}</loc></url>` : ''}${data.posts.filter(p => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)).map(p => `<url><loc>${e(`${web}/blog/${p.slug}`)}</loc><lastmod>${e(p.lastmod)}</lastmod></url>`).join('')}</urlset>`;
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>${contents}`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
  } catch { return new Response('Blog sitemap temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } }); }
}
