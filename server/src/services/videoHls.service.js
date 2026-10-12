import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export const HLS_SEGMENT_SECONDS = 6;
// The media URL stays stable through a long film. It grants no access without
// the independently renewed, short-lived database session checked on every read.
export const VIDEO_MEDIA_SECONDS = 6 * 3600;
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
export function signedHlsMedia({ assetId, sessionId, version, original = false, format = original ? 'file' : 'hls', renewable = false, seconds = 600, now = Date.now() }) {
  version = original && !version ? 'original' : version;
  const validVersion = original && version === 'original' && format === 'file' || /^[a-f\d-]{36}$/i.test(version);
  if (!/^[a-f\d]{24}$/i.test(String(assetId)) || !/^[a-f\d-]{36}$/i.test(sessionId) || !validVersion || !['file', 'hls'].includes(format) || (!original && format !== 'hls') || !Number.isInteger(seconds) || seconds < 300 || seconds > (renewable ? VIDEO_MEDIA_SECONDS : 900)) throw new Error('Invalid playback scope.');
  const exp = Math.floor(now / 1000) + seconds;
  const token = jwt.sign({ purpose: original ? 'video-original' : 'video-hls', assetId: String(assetId), sessionId, version, format, ...(renewable ? { renewable: true } : {}), exp, nbf: Math.floor(now / 1000) - 30 }, secret(), { algorithm: 'HS256', issuer: 'veylo-video', audience: original ? 'veylo-video-original' : 'veylo-video-hls', noTimestamp: true });
  return { hlsUrl: `${playbackOrigin()}/video/${token}/${format === 'file' ? 'original' : 'master.m3u8'}`, expiresAt: new Date(exp * 1000) };
}
export function verifyHlsToken(token) {
  try {
    const claims = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: 'veylo-video', audience: ['veylo-video-hls', 'veylo-video-original'] });
    const original = claims.purpose === 'video-original' && claims.aud === 'veylo-video-original';
    const format = claims.format || (original ? 'file' : 'hls');
    const lifetime = (claims.renewable === true ? VIDEO_MEDIA_SECONDS : 900) + 30;
    if ((!original && (claims.purpose !== 'video-hls' || claims.aud !== 'veylo-video-hls')) || !['file', 'hls'].includes(format) || (!original && format !== 'hls') || !/^[a-f\d]{24}$/i.test(claims.assetId) || !/^[a-f\d-]{36}$/i.test(claims.sessionId) || (!(original && claims.version === 'original' && format === 'file') && !/^[a-f\d-]{36}$/i.test(claims.version)) || !Number.isInteger(claims.exp) || !Number.isInteger(claims.nbf) || claims.exp - claims.nbf > lifetime || claims.exp > Date.now() / 1000 + lifetime) throw new Error();
    return claims;
  } catch { throw Object.assign(new Error('Reopen this film to continue playback.'), { status: 401, code: 'VIDEO_SESSION_EXPIRED' }); }
}

// Only files produced and indexed by our encoder can be requested. Neither the
// token nor a client-supplied path grants access to originals or arbitrary R2 keys.
export function hlsFile(asset, file, original = false) {
  const hls = original ? asset.originalPlayback?.hls : asset.hls;
  if (!hls?.version || !hls.prefix?.endsWith(`/${asset._id}/${original ? 'original-playback' : 'hls'}/${hls.version}/`)) return null;
  if (file === 'master.m3u8') return { key: hls.prefix + file, contentType: 'application/vnd.apple.mpegurl', seconds: 0, bytes: hls.masterBytes };
  const match = /^(q\d{1,4})\/(index\.m3u8|s(\d{6})\.ts)$/.exec(file);
  const variant = match && hls.variants.find(row => row.name === match[1]);
  if (!variant) return null;
  if (match[2] === 'index.m3u8') return { key: hls.prefix + file, contentType: 'application/vnd.apple.mpegurl', seconds: 0, bytes: variant.playlistBytes };
  const segment = variant.segments[Number(match[3])];
  return segment ? { key: hls.prefix + file, contentType: 'video/mp2t', seconds: segment.seconds, bytes: segment.bytes } : null;
}
