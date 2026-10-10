/**
 * Reverse proxy for `/api/*` to the Render-hosted Express API.
 *
 * Keeping the API on the site's own origin is deliberate, not incidental: the
 * client calls it with `withCredentials: true` and the API issues SameSite=Lax
 * cookies, which browsers only attach to same-site requests. Pointing
 * `VITE_API_URL` straight at Render instead would require SameSite=None.
 */
const DEFAULT_API_ORIGIN = 'https://veylo-api-ptk3.onrender.com';
import { handleVideoDownload } from './videoDownload.js';

const EDGE_KEY_HEADER = 'x-veylo-edge-key';
const EDGE_CLIENT_IP_HEADER = 'x-veylo-client-ip';

export async function handleApiProxy(request, env) {
  const apiOrigin = (env?.VEYLO_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');

  const incoming = new URL(request.url);
  const target = new URL(apiOrigin);
  // `VEYLO_API_ORIGIN` is a bare origin, so the path is rebuilt from scratch:
  // /api/v1/... -> https://<api-origin>/api/v1/...
  target.pathname = `/api${incoming.pathname.slice('/api'.length)}`;
  target.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete('host');

  // Tell the API who the visitor really is. `trust proxy` on the server resolves
  // `req.ip` to the rightmost hop, which without this is Cloudflare's egress IP —
  // so every visitor would share one rate-limit bucket and every session record
  // would log the same address. The shared secret is what lets the server trust
  // the value, since the Render origin is publicly reachable.
  //
  // Both headers are deleted first so a caller cannot smuggle their own; the IP
  // comes from `cf-connecting-ip`, which Cloudflare sets and overwrites.
  headers.delete(EDGE_KEY_HEADER);
  headers.delete(EDGE_CLIENT_IP_HEADER);
  headers.delete('x-veylo-country');
  headers.delete('x-veylo-video-download-proxy');
  headers.delete('x-veylo-video-download-method');
  const edgeKey = env?.VEYLO_EDGE_KEY;
  const clientIp = request.headers.get('cf-connecting-ip');
  if (edgeKey && clientIp) {
    headers.set(EDGE_KEY_HEADER, edgeKey);
    headers.set(EDGE_CLIENT_IP_HEADER, clientIp);
  }
  if (edgeKey && ['GET', 'HEAD'].includes(request.method) && /^\/api\/v1\/videos\/(?:public\/[A-Za-z0-9_-]+\/)?assets\/[a-f\d]{24}\/download$/.test(incoming.pathname)) {
    headers.set(EDGE_KEY_HEADER, edgeKey);
    return handleVideoDownload(request, target, headers);
  }

  const init = {
    method: request.method,
    headers,
    // Downloads hand the browser a 3xx to a signed object-storage URL. Letting the
    // edge follow it would hide that Location from the client.
    redirect: 'manual',
    signal: request.signal
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  const proxyRequest = new Request(target, init);
  const retryV3Assist = request.method === 'POST' && incoming.pathname === '/api/v1/deliveries/v3/assist';
  let response;
  try {
    // V3 assist only asks the model for wording or a recommendation; retrying
    // this one inference request cannot duplicate a delivery write.
    response = await fetch(proxyRequest.clone());
  } catch (error) {
    if (!retryV3Assist || request.signal.aborted) throw error;
    console.warn('[api-proxy] V3 assist upstream request failed; retrying once.');
  }

  if (response) {
    if (!retryV3Assist || ![502, 503, 504].includes(response.status) || request.signal.aborted) return response;
    try { await response.body?.cancel?.(); } catch { /* Retry the safe inference request below. */ }
    console.warn('[api-proxy] V3 assist upstream returned HTTP ' + response.status + '; retrying once.');
  }

  if (!retryV3Assist) return response;
  await new Promise(resolve => setTimeout(resolve, 300));

  // Returned untouched rather than rebuilt from `response.headers`: constructing
  // a new Response collapses repeated Set-Cookie headers into one, which would
  // silently break session and CSRF cookies.
  return fetch(proxyRequest);
}
