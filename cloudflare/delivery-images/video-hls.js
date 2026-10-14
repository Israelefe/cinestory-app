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
    const original = claims.purpose === 'video-original' && claims.aud === 'veylo-video-original';
    const format = claims.format || (original ? 'file' : 'hls');
    const lifetime = (claims.renewable === true ? 6 * 3600 : 900) + 30;
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || claims.iss !== 'veylo-video' || (!original && (claims.aud !== 'veylo-video-hls' || claims.purpose !== 'video-hls'))
      || !['file', 'hls'].includes(format) || (!original && format !== 'hls')
      || !/^[a-f\d]{24}$/i.test(claims.assetId) || !/^[a-f\d-]{36}$/i.test(claims.sessionId) || (!(original && claims.version === 'original' && format === 'file') && !/^[a-f\d-]{36}$/i.test(claims.version))
      || !Number.isInteger(claims.exp) || !Number.isInteger(claims.nbf) || claims.nbf > now / 1000 || claims.exp <= now / 1000 || claims.exp > now / 1000 + lifetime || claims.exp - claims.nbf > lifetime) return null;
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
  // Both Veylo hostnames serve the client. Keep the API grant bound to its
  // configured origin, while allowing either exact first-party browser origin.
  const browserOrigins = new Set([allowedOrigin]);
  if (['https://veylo.com.ng', 'https://www.veylo.com.ng'].includes(allowedOrigin)) {
    browserOrigins.add('https://veylo.com.ng'); browserOrigins.add('https://www.veylo.com.ng');
  }
  const cors = { 'Access-Control-Allow-Origin': origin && browserOrigins.has(origin) ? origin : allowedOrigin, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges', Vary: 'Origin' };
  const reply = response => { const headers = new Headers(response.headers); for (const [name, value] of Object.entries(cors)) if (value) headers.set(name, value); return new Response(response.body, { status: response.status, headers }); };
  if (!allowedOrigin || (origin && !browserOrigins.has(origin))) return fail(403, 'This video cannot be opened from this site.');
  if (request.method === 'OPTIONS') return reply(new Response(null, { status: 204, headers: noStore }));
  if (!['GET', 'HEAD'].includes(request.method)) return reply(fail(405, 'Method not allowed.'));
  const match = /^\/video\/([^/]+)\/(original|master\.m3u8|q\d{1,4}\/(?:index\.m3u8|s\d{6}\.ts))$/.exec(url.pathname);
  const claims = match && await verifyVideoToken(match[1], env.VIDEO_PLAYBACK_SECRET);
  const original = claims?.purpose === 'video-original';
  const filePlayback = (claims?.format || (original ? 'file' : 'hls')) === 'file';
  if (!claims || (match[2] === 'original') !== filePlayback) return reply(fail(401, 'Reopen this film to continue playback.'));
  if (!env.DELIVERY_MEDIA) return reply(fail(503, 'Private video storage is unavailable.'));
  try {
    const api = new URL(env.VEYLO_API_ORIGIN);
    if (api.protocol !== 'https:' || api.username || api.password) throw new Error();
    // Every request is authorised before R2 is read. Never cache a permission
    // decision: PIN changes, expiry, Pro expiry and closed links take effect on
    // the next request. Only the small grant travels through the API host.
    const authorised = await fetch(new URL('/api/v1/videos/media/authorize', api), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-veylo-video-secret': env.VIDEO_PLAYBACK_SECRET }, body: JSON.stringify({ token: match[1], file: match[2], method: request.method, ...(filePlayback && request.headers.has('Range') ? { range: request.headers.get('Range') } : {}) }), redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (!authorised.ok) { await authorised.body?.cancel(); return reply(fail([401, 403, 404, 410, 416, 429].includes(authorised.status) ? authorised.status : 503, 'This film is unavailable. Reopen the delivery or contact your photographer.')); }
    const grant = (await authorised.json())?.data;
    const suffix = `/${claims.assetId}/${original ? 'original-playback' : 'hls'}/${claims.version}/${filePlayback ? 'playback.mp4' : match[2]}`;
    const scopedKey = filePlayback && claims.version === 'original' ? new RegExp('/' + claims.assetId + '/original\\.(mp4|mov|webm)$').test(grant?.key || '') : grant?.key?.endsWith(suffix);
    if (!grant?.key?.startsWith('veylo/video/') || !scopedKey || grant.key.includes('..') || grant.origin !== allowedOrigin || !Number.isSafeInteger(grant.bytes) || grant.bytes < 1 || grant.bytes > (filePlayback ? 6_600_000_000 : 32_000_000) || !(filePlayback ? ['video/mp4', 'video/quicktime', 'video/webm'] : ['application/vnd.apple.mpegurl', 'video/mp2t']).includes(grant.contentType)) throw new Error();
    let range; try { range = filePlayback ? grant.range : rangeFor(request.headers.get('Range'), grant.bytes); } catch { return reply(fail(416, 'Invalid video range.')); }
    if (filePlayback && Boolean(range) !== request.headers.has('Range')) throw new Error();
    if (range && (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.length) || range.offset < 0 || range.length < 1 || range.offset + range.length > grant.bytes || (filePlayback && range.length > 32 * 1024 ** 2))) throw new Error();
    if (request.method === 'HEAD') return reply(new Response(null, { status: range ? 206 : 200, headers: { ...noStore, 'Content-Type': grant.contentType, 'Content-Length': String(range?.length || grant.bytes), 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${grant.bytes}` } : {}) } }));
    const object = await env.DELIVERY_MEDIA.get(grant.key, range ? { range } : undefined);
    if (!object || object.size !== grant.bytes) { await object?.body?.cancel(); return reply(fail(503, 'This playback file is unavailable. Please try again.')); }
    return reply(new Response(object.body, { status: range ? 206 : 200, headers: { ...noStore, 'Content-Type': grant.contentType, 'Content-Length': String(range?.length || object.size), 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}` } : {}) } }));
  } catch { return reply(fail(503, 'This film could not be loaded. Please try again.')); }
}
