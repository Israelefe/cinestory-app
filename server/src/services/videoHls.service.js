import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export const HLS_SEGMENT_SECONDS = 6;
export function playbackOrigin() {
  try {
    const url = new URL(process.env.VIDEO_PLAYBACK_WORKER_URL || process.env.R2_IMAGE_WORKER_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw Object.assign(new Error('Private video playback is not configured.'), { status: 503, code: 'VIDEO_NOT_CONFIGURED' }); }
}
function secret() {
  const value = process.env.VIDEO_PLAYBACK_SECRET || '';
  if (value.length < 32) throw Object.assign(new Error('Private video playback is not configured.'), { status: 503 });
  return value;
}
export function trustedVideoEdge(value) {
  const expected = secret();
  return typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
export function signedHlsMedia({ assetId, sessionId, version, seconds = 600, now = Date.now() }) {
  if (!/^[a-f\d]{24}$/i.test(String(assetId)) || !/^[a-f\d-]{36}$/i.test(sessionId) || !/^[a-f\d-]{36}$/i.test(version) || !Number.isInteger(seconds) || seconds < 300 || seconds > 900) throw new Error('Invalid playback scope.');
  const exp = Math.floor(now / 1000) + seconds;
  const token = jwt.sign({ purpose: 'video-hls', assetId: String(assetId), sessionId, version, exp, nbf: Math.floor(now / 1000) - 30 }, secret(), { algorithm: 'HS256', issuer: 'veylo-video', audience: 'veylo-video-hls', noTimestamp: true });
  return { hlsUrl: `${playbackOrigin()}/video/${token}/master.m3u8`, expiresAt: new Date(exp * 1000) };
}
export function verifyHlsToken(token) {
  try {
    const claims = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: 'veylo-video', audience: 'veylo-video-hls' });
    if (claims.purpose !== 'video-hls' || !/^[a-f\d]{24}$/i.test(claims.assetId) || !/^[a-f\d-]{36}$/i.test(claims.sessionId) || !/^[a-f\d-]{36}$/i.test(claims.version) || claims.exp > Date.now() / 1000 + 930) throw new Error();
    return claims;
  } catch { throw Object.assign(new Error('Reopen this film to continue playback.'), { status: 401, code: 'VIDEO_SESSION_EXPIRED' }); }
}

// Only files produced and indexed by our encoder can be requested. Neither the
// token nor a client-supplied path grants access to originals or arbitrary R2 keys.
export function hlsFile(asset, file) {
  const hls = asset.hls;
  if (!hls?.version || !hls.prefix?.endsWith(`/${asset._id}/hls/${hls.version}/`)) return null;
  if (file === 'master.m3u8') return { key: hls.prefix + file, contentType: 'application/vnd.apple.mpegurl', seconds: 0, bytes: hls.masterBytes };
  const match = /^(q\d{1,4})\/(index\.m3u8|s(\d{6})\.ts)$/.exec(file);
  const variant = match && hls.variants.find(row => row.name === match[1]);
  if (!variant) return null;
  if (match[2] === 'index.m3u8') return { key: hls.prefix + file, contentType: 'application/vnd.apple.mpegurl', seconds: 0, bytes: variant.playlistBytes };
  const segment = variant.segments[Number(match[3])];
  return segment ? { key: hls.prefix + file, contentType: 'video/mp2t', seconds: segment.seconds, bytes: segment.bytes } : null;
}
