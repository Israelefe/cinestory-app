import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const EDGE_KEY_HEADER = 'x-veylo-edge-key';
const EDGE_CLIENT_IP_HEADER = 'x-veylo-client-ip';

/**
 * Resolves `req.ip` to the real visitor for requests that arrived through the
 * Cloudflare edge.
 *
 * Without this, `trust proxy: 1` (server.js) returns the *rightmost*
 * X-Forwarded-For entry, which in the `visitor -> Cloudflare -> Render -> app`
 * chain is Cloudflare's egress IP. Without the edge key, IP-scoped security
 * checks would treat every visitor as one network, and `req.ip` would also be
 * wrong in the Turnstile check (auth.controller.js) and session audit trail
 * (utils/auth.js).
 *
 * Rewriting the header rather than `req.ip` itself is deliberate: `req.ip` is a
 * getter on the request prototype with no setter, so it can only be shadowed per
 * request, whereas express re-reads X-Forwarded-For every time it resolves the
 * client address. Replacing the chain with a single trusted entry means
 * `trust proxy: 1` lands on that entry.
 *
 * The shared secret is what makes the header trustworthy. A bare
 * `CF-Connecting-IP` lookup would be forgeable, because the Render origin is
 * publicly reachable and `isAllowedOrigin` allows requests with no Origin header
 * (server.js) — so anyone could skip the edge and rotate the header.
 */
export function resolveEdgeClientIp(req, res, next) {
  const expectedKey = process.env.VEYLO_EDGE_KEY;

  // Captured before overwriting, so the value below is the edge's own header
  // (Cloudflare overwrites any client-supplied CF-Connecting-IP) rather than
  // anything the caller sent.
  const claimedIp = req.get(EDGE_CLIENT_IP_HEADER);

  if (expectedKey) {
    if (secretMatches(expectedKey, req.get(EDGE_KEY_HEADER)) && claimedIp && isIP(claimedIp)) {
      req.headers['x-forwarded-for'] = claimedIp;
    }
  }
  // With no secret configured, or no match, nothing changes and `req.ip` keeps
  // its previous (coarse) meaning. The setting is additive, so it can be rolled
  // out on either side first without breaking anything.

  next();
}

function secretMatches(expected, provided) {
  if (typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
