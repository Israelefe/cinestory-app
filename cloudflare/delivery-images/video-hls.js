const encoder = new TextEncoder();
const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const fail = (status, message) => new Response(message, { status, headers: noStore });
function decode(value) {
  if (!/^[a-z\d_-]+$/i.test(value)) throw new Error();
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
}
export async function verifyVideoToken(token, secret, now = Date.now()) {
  try {
    if (!secret || secret.length < 32 || token.length > 2000) return null;
    const parts = token.split('.'); if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || claims.iss !== 'veylo-video' || claims.aud !== 'veylo-video-hls' || claims.purpose !== 'video-hls'
      || !/^[a-f\d]{24}$/i.test(claims.assetId) || !/^[a-f\d-]{36}$/i.test(claims.sessionId) || !/^[a-f\d-]{36}$/i.test(claims.version)
      || !Number.isInteger(claims.exp) || !Number.isInteger(claims.nbf) || claims.nbf > now / 1000 || claims.exp <= now / 1000 || claims.exp > now / 1000 + 930) return null;
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, decode(parts[2]), encoder.encode(parts[0] + '.' + parts[1])) ? claims : null;
  } catch { return null; }
}
function rangeFor(value, bytes) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error();
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(bytes - 1, Number(match[2])) : bytes - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= bytes || start > end || (!match[1] && Number(match[2]) < 1)) throw new Error();
  return { offset: start, length: end - start + 1 };
}
export async function handleVideoHls(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/video/')) return null;
  const origin = request.headers.get('Origin');
  const allowedOrigin = String(env.VEYLO_WEB_ORIGIN || '').replace(/\/$/, '');
  const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges', Vary: 'Origin' };
  const reply = response => { const headers = new Headers(response.headers); for (const [name, value] of Object.entries(cors)) if (value) headers.set(name, value); return new Response(response.body, { status: response.status, headers }); };
  if (!allowedOrigin || (origin && origin !== allowedOrigin)) return fail(403, 'This video cannot be opened from this site.');
  if (request.method === 'OPTIONS') return reply(new Response(null, { status: 204, headers: noStore }));
  if (!['GET', 'HEAD'].includes(request.method)) return reply(fail(405, 'Method not allowed.'));
  const match = /^\/video\/([^/]+)\/(master\.m3u8|q\d{1,4}\/(?:index\.m3u8|s\d{6}\.ts))$/.exec(url.pathname);
  const claims = match && await verifyVideoToken(match[1], env.VIDEO_PLAYBACK_SECRET);
  if (!claims) return reply(fail(401, 'Reopen this film to continue playback.'));
  if (!env.DELIVERY_MEDIA) return reply(fail(503, 'Private video storage is unavailable.'));
  try {
    const api = new URL(env.VEYLO_API_ORIGIN);
    if (api.protocol !== 'https:' || api.username || api.password) throw new Error();
    // Every request is authorised before R2 is read. Never cache a permission
    // decision: PIN changes, expiry, Pro expiry and closed links take effect on
    // the next request. Only the small grant travels through the API host.
    const authorised = await fetch(new URL('/api/v1/videos/media/authorize', api), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-veylo-video-secret': env.VIDEO_PLAYBACK_SECRET }, body: JSON.stringify({ token: match[1], file: match[2], method: request.method }), redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (!authorised.ok) { await authorised.body?.cancel(); return reply(fail([401, 403, 404, 410, 429].includes(authorised.status) ? authorised.status : 503, 'This film is unavailable. Reopen the delivery or contact your photographer.')); }
    const grant = (await authorised.json())?.data;
    const suffix = `/${claims.assetId}/hls/${claims.version}/${match[2]}`;
    if (!grant?.key?.startsWith('veylo/video/') || !grant.key.endsWith(suffix) || grant.key.includes('..') || grant.origin !== allowedOrigin || !Number.isSafeInteger(grant.bytes) || grant.bytes < 1 || grant.bytes > 32_000_000 || !['application/vnd.apple.mpegurl', 'video/mp2t'].includes(grant.contentType)) throw new Error();
    let range; try { range = rangeFor(request.headers.get('Range'), grant.bytes); } catch { return reply(fail(416, 'Invalid video range.')); }
    if (request.method === 'HEAD') return reply(new Response(null, { status: range ? 206 : 200, headers: { ...noStore, 'Content-Type': grant.contentType, 'Content-Length': String(range?.length || grant.bytes), 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${grant.bytes}` } : {}) } }));
    const object = await env.DELIVERY_MEDIA.get(grant.key, range ? { range } : undefined);
    if (!object || object.size !== grant.bytes) { await object?.body?.cancel(); return reply(fail(503, 'This playback file is unavailable. Please try again.')); }
    return reply(new Response(object.body, { status: range ? 206 : 200, headers: { ...noStore, 'Content-Type': grant.contentType, 'Content-Length': String(range?.length || object.size), 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}` } : {}) } }));
  } catch { return reply(fail(503, 'This film could not be loaded. Please try again.')); }
}
