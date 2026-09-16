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
import { handleDeliveryShell } from './deliveryShell.js';

const DELIVERY_PATH = /^\/d\/([^/]+)\/?$/;

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApiProxy(request, env);
    }

    const delivery = pathname.match(DELIVERY_PATH);
    if (delivery) {
      return handleDeliveryShell(request, env, ctx, decodeURIComponent(delivery[1]));
    }

    // Belt and braces: these paths are routed here by `run_worker_first`, so this
    // only runs if that config is missing or edited.
    return env.ASSETS.fetch(request);
  }
};