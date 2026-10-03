import { applyShareMeta, escapeHtml } from './deliveryShell.js';
import { publishedPortfolioHtml, portfolioStructuredData, scriptJson } from './portfolioPublished.js';
export const PORTFOLIO_PATH = /^\/@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\/projects\/([A-Za-z0-9_-]{8,80}))?\/?$/;
export async function handlePortfolioShell(request, env, handle, projectId = '') {
  const api = String(env.VEYLO_API_ORIGIN || 'https://veylo-api-ptk3.onrender.com').replace(/\/$/, '');
  const web = String(env.VEYLO_WEB_ORIGIN || 'https://veylo.com.ng').replace(/\/$/, '');
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' };
  try {
    const query = new URLSearchParams();
    const incoming = new URL(request.url).searchParams;
    for (const key of ['category', 'service']) if (incoming.has(key)) query.set(key, incoming.get(key));
    const response = await fetch(`${api}/api/v1/portfolios/public/${encodeURIComponent(handle)}${projectId ? `/projects/${encodeURIComponent(projectId)}` : ''}/share-meta${query.size ? `?${query}` : ''}`, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    if (response.status === 404) return new Response('<!doctype html><title>Portfolio unavailable</title><meta name="robots" content="noindex"><p>This portfolio is unavailable.</p>', { status: 404, headers });
    if (!response.ok) throw new Error('Metadata unavailable');
    const { data } = await response.json();
    const canonical = data.canonical;
    if (!canonical?.startsWith(`${web}/@`)) throw new Error('Invalid canonical');
    if (data.redirectedFrom) return new Response(null, { status: 301, headers: { Location: canonical, 'Cache-Control': 'no-store' } });
    const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    if (!shell.ok) throw new Error('Shell unavailable');
    let html = applyShareMeta(await shell.text(), data, canonical);
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '').replace('</head>', () => `<link rel="canonical" href="${escapeHtml(canonical)}" /></head>`);
    html = html.replace('</head>', () => `${portfolioStructuredData(data)}</head>`).replace('</body>', () => `${publishedPortfolioHtml(data)}<script id="portfolio-published-data" type="application/json">${scriptJson({ portfolio: data.portfolio, projectId: data.projectId || '', categoryId: data.categoryId || '', serviceId: data.serviceId || '' })}</script></body>`);
    return new Response(html, { status: 200, headers });
  } catch {
    const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    return new Response(await shell.text(), { status: 503, headers: { ...headers, 'Retry-After': '30' } });
  }
}
export async function handlePortfolioSitemap(request, env, page = null) {
  const api = String(env.VEYLO_API_ORIGIN || 'https://veylo-api-ptk3.onrender.com').replace(/\/$/, '');
  const web = String(env.VEYLO_WEB_ORIGIN || 'https://veylo.com.ng').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    const response = await fetch(`${api}/api/v1/portfolios/sitemap${page === null ? '' : `?page=${page}`}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return new Response('Sitemap unavailable.', { status: response.status, headers });
    const data = await response.json();
    const contents = page === null ? `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: Math.min(data.pages || 0, 50000) }, (_, index) => `<sitemap><loc>${escapeHtml(`${web}/portfolio-sitemap-${index}.xml`)}</loc></sitemap>`).join('')}</sitemapindex>` : `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${(data.urls || []).filter(item => item.loc.startsWith(`${web}/@`)).map(item => `<url><loc>${escapeHtml(item.loc)}</loc>${item.lastmod ? `<lastmod>${escapeHtml(item.lastmod)}</lastmod>` : ''}</url>`).join('')}</urlset>`;
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>${contents}`, { headers });
  } catch { return new Response('Sitemap temporarily unavailable.', { status: 503, headers: { ...headers, 'Retry-After': '30' } }); }
}
