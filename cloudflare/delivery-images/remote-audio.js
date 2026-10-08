import { mediaError } from './media-protocol.js';

export async function remoteAudioResponse(request, claims) {
  let url;
  try { url = new URL(claims.url); } catch { throw mediaError('Audio source is not approved.', 400, 'AUDIO_SOURCE_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !['cdn.pixabay.com', 'pixabay.com', 'www.pixabay.com'].includes(url.hostname)) throw mediaError('Audio source is not approved.', 400, 'AUDIO_SOURCE_INVALID');
  const maximum = 25 * 1024 * 1024;
  const range = request.headers.get('range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw mediaError('That audio range is not available.', 416, 'AUDIO_RANGE_INVALID');
  const response = await fetch(url, { method: request.method, headers: { 'User-Agent': 'Veylo', Referer: 'https://pixabay.com/', ...(range ? { Range: range } : {}) }, redirect: 'error', signal: AbortSignal.timeout(120_000) });
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  if (response.status === 416) {
    await response.body?.cancel();
    if (response.headers.has('content-range')) headers.set('Content-Range', response.headers.get('content-range'));
    return new Response(null, { status: 416, headers });
  }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
  const length = Number(response.headers.get('content-length'));
  const total = Number(response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1] || length);
  if (!response.ok || !(/^audio\//.test(contentType) || contentType === 'application/octet-stream') || length > maximum || total > maximum) {
    await response.body?.cancel();
    throw mediaError('This recording could not be played.', 502, 'AUDIO_SOURCE_UNAVAILABLE');
  }
  headers.set('Content-Type', contentType === 'application/octet-stream' ? 'audio/mpeg' : contentType);
  for (const name of ['Content-Length', 'Content-Range', 'ETag']) if (response.headers.has(name)) headers.set(name, response.headers.get(name));
  let bytes = 0;
  const body = response.body?.pipeThrough(new TransformStream({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > maximum) throw mediaError('This recording is too large.', 413, 'MEDIA_TOO_LARGE'); controller.enqueue(chunk); } }));
  return new Response(request.method === 'HEAD' ? null : body, { status: response.status, headers });
}
