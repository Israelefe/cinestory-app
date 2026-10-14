/**
 * Worker entry point for the Veylo client.
 *
 * The Vite build output is served as static assets; this script handles only the
 * two dynamic routes, which `wrangler.toml` routes here first via
 * `assets.run_worker_first`. Everything else is served straight from the asset
 * layer using `assets.not_found_handling = "single-page-application"`, which
 * reproduces the SPA fallback, so it never reaches this code and never pays for
 * a Worker invocation.
 */
import { handleApiProxy } from './apiProxy.js';
import { handleBlogShell, handleBlogSitemap } from './blogShell.js';
import { handleDeliveryShell } from './deliveryShell.js';
import { handleLibraryShell } from './libraryShell.js';
import { handlePortfolioShell, handlePortfolioSitemap, PORTFOLIO_PATH } from './portfolioShell.js';

const DELIVERY_PATH = /^\/(d|v)\/([^/]+)\/?$/;

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/blog' || pathname.startsWith('/blog/')) return handleBlogShell(request, env);
    if (pathname === '/blog-sitemap.xml') return handleBlogSitemap(request, env);
    const blogSitemap = pathname.match(/^\/blog-sitemap-([1-9]\d{0,5})\.xml$/);
    if (blogSitemap) return handleBlogSitemap(request, env, Number(blogSitemap[1]));
    if (pathname === '/robots.txt') {
      const web = String(env.VEYLO_WEB_ORIGIN || 'https://veylo.com.ng').replace(/\/$/, '');
      return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/v1/blog/media/\nDisallow: /portfolio/manage\nDisallow: /portfolio/enquiries\nSitemap: ${web}/portfolio-sitemap.xml\nSitemap: ${web}/blog-sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (pathname === '/portfolio-sitemap.xml') return handlePortfolioSitemap(request, env);
    const sitemap = pathname.match(/^\/portfolio-sitemap-(\d{1,6})\.xml$/);
    if (sitemap) return handlePortfolioSitemap(request, env, Number(sitemap[1]));

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApiProxy(request, env);
    }

    const delivery = pathname.match(DELIVERY_PATH);
    const library = pathname.match(/^\/(select|edit)\/([^/]+)\/?$/);
    if (library) return handleLibraryShell(request, env, library[2], library[1]);
    if (delivery) {
      return handleDeliveryShell(request, env, ctx, decodeURIComponent(delivery[2]), delivery[1]);
    }
    const portfolio = pathname.match(PORTFOLIO_PATH);
    if (portfolio) return handlePortfolioShell(request, env, portfolio[1], portfolio[2] || '');
    if (pathname.startsWith('/@')) return new Response('Portfolio not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } });

    // Belt and braces: these paths are routed here by `run_worker_first`, so this
    // only runs if that config is missing or edited.
    return env.ASSETS.fetch(request);
  }
};
