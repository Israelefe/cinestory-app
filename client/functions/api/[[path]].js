/**
 * Reverse proxy for `/api/*` to the Render-hosted Express API.
 *
 * Replaces the `rewrites` rule in `client/vercel.json`. Keeping the API on the
 * site's own origin is deliberate, not incidental: the client calls it with
 * `withCredentials: true` and the API issues SameSite=Lax cookies, which
 * browsers only attach to same-site requests. Pointing `VITE_API_URL` straight
 * at Render instead would require switching the cookies to SameSite=None.
 */
const DEFAULT_API_ORIGIN = 'https://veylo-api-ptk3.onrender.com';

const EDGE_KEY_HEADER = 'x-veylo-edge-key';
const EDGE_CLIENT_IP_HEADER = 'x-veylo-client-ip';

export async function onRequest(context) {
  const { request, env } = context;
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
  const edgeKey = env?.VEYLO_EDGE_KEY;
  const clientIp = request.headers.get('cf-connecting-ip');
  if (edgeKey && clientIp) {
    headers.set(EDGE_KEY_HEADER, edgeKey);
    headers.set(EDGE_CLIENT_IP_HEADER, clientIp);
  }

  const init = {
    method: request.method,
    headers,
    // Downloads hand the browser a 3xx to a signed Cloudinary URL. Letting the
    // edge follow it would hide that Location from the client.
    redirect: 'manual'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  // Returned untouched rather than rebuilt from `response.headers`: constructing
  // a new Response collapses repeated Set-Cookie headers into one, which would
  // silently break session and CSRF cookies.
  return fetch(new Request(target, init));
}