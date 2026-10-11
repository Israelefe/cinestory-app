import { VIDEO_DEMO_MEDIA } from '../../client/src/constants/videoDemoMedia.js';

const files = new Map(Object.values(VIDEO_DEMO_MEDIA).map(media => [`/demo-videos/${media.filename}`, media]));
const baseHeaders = {
  'Content-Type': 'video/mp4', 'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  'Cross-Origin-Resource-Policy': 'cross-origin', 'Accept-Ranges': 'bytes'
};
const failure = (status, headers = {}) => new Response(null, { status, headers: { ...baseHeaders, 'Cache-Control': 'no-store', ...headers } });

function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || first >= size || first > last || (!match[1] && Number(match[2]) < 1)) return null;
  return { offset: first, length: last - first + 1 };
}

export async function handleDemoVideo(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/demo-videos/')) return null;
  // Never accept a caller-supplied R2 key or expose any private delivery prefix.
  const media = files.get(url.pathname);
  if (!media || url.search) return failure(404);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: baseHeaders });
  if (!['GET', 'HEAD'].includes(request.method)) return failure(405, { Allow: 'GET, HEAD, OPTIONS' });
  if (!env.DELIVERY_MEDIA) return failure(503);
  try {
    const object = await env.DELIVERY_MEDIA.head(media.objectKey);
    if (!object) return failure(404);
    if (object.size !== media.bytes) return failure(503);
    const headers = new Headers({ ...baseHeaders, 'Cache-Control': 'public, max-age=31536000, immutable', ETag: object.httpEtag });
    if (object.uploaded) headers.set('Last-Modified', object.uploaded.toUTCString());
    if (request.headers.get('If-None-Match')?.split(',').map(value => value.trim()).some(value => value === '*' || value.replace(/^W\//, '') === object.httpEtag)) {
      return new Response(null, { status: 304, headers });
    }
    const rangeHeader = request.headers.get('Range');
    const ifRange = request.headers.get('If-Range');
    const useRange = rangeHeader && (!ifRange || ifRange === object.httpEtag || ifRange === headers.get('Last-Modified'));
    const range = useRange ? byteRange(rangeHeader, object.size) : null;
    if (useRange && !range) return failure(416, { 'Content-Range': `bytes */${object.size}` });
    headers.set('Content-Length', String(range?.length ?? object.size));
    if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    const status = range ? 206 : 200;
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    const body = await env.DELIVERY_MEDIA.get(media.objectKey, { ...(range ? { range } : {}), onlyIf: { etagMatches: object.etag } });
    if (!body?.body) return failure(503);
    return new Response(body.body, { status, headers });
  } catch { return failure(503); }
}
