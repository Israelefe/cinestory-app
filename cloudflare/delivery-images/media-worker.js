import { createHash } from 'node:crypto';
import { authorizeMedia, boundedBytes, hashObject, jsonResponse, MAX_MEDIA_BYTES, mediaError, requireMediaKey, signMediaToken, verifyMediaToken } from './media-protocol.js';
import { inspectImage } from './image-metadata.js';
import { prepareZipFiles, zipContentLength, zipStream } from './zip.js';
import { createNarration, joinNarration } from './narration.js';
import { importGeneratedImage } from './provider-image.js';
import { remoteAudioResponse } from './remote-audio.js';

const presets = new Set(['400', '480', '640', '800', '960', '1024', '1200', '1600', 'thumb', 'og']);
const manifestPrefix = 'veylo/system/media-manifests/';
const maxManifestBytes = 2 * 1024 * 1024;

function mediaHeaders() {
  return new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
}

function disposition(name) {
  const safe = String(name).replace(/[\u0000-\u001f\u007f"\\/]/g, '_').slice(0, 180) || 'photograph';
  return `attachment; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16))}`;
}

async function fileResponse(request, env, claims) {
  const head = await env.DELIVERY_MEDIA.head(requireMediaKey(claims.key));
  if (!head) throw mediaError('File not found.', 404, 'MEDIA_NOT_FOUND');
  const headers = mediaHeaders();
  headers.set('Content-Type', head.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', head.httpEtag || `"${head.etag}"`);
  if (claims.filename) headers.set('Content-Disposition', disposition(claims.filename));
  let range;
  const requested = request.headers.get('range');
  if (requested && (!request.headers.get('if-range') || request.headers.get('if-range') === headers.get('ETag'))) {
    const match = requested.match(/^bytes=(\d*)-(\d*)$/);
    let start;
    let end;
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, head.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), head.size - 1) : head.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= head.size || end < start || !match[1] && Number(match[2]) === 0) {
      headers.set('Content-Range', `bytes */${head.size}`);
      return new Response(null, { status: 416, headers });
    }
    range = { offset: start, length: end - start + 1 };
    headers.set('Content-Range', `bytes ${start}-${end}/${head.size}`);
  }
  headers.set('Content-Length', String(range?.length || head.size));
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
  const object = await env.DELIVERY_MEDIA.get(claims.key, range ? { range } : undefined);
  if (!object || object.etag !== head.etag) throw mediaError('This file changed. Reopen the gallery and retry.', 409, 'MEDIA_CHANGED');
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

function transformFor(preset) {
  if (preset === 'thumb') return { width: 480, height: 600, fit: 'cover', format: 'webp', quality: 82 };
  if (preset === 'og') return { width: 1200, height: 630, fit: 'cover', format: 'jpeg', quality: 86 };
  return { width: Number(preset), fit: 'scale-down', format: 'webp', quality: 84 };
}

async function transformedImage(request, env, key, preset, head) {
  const options = transformFor(preset);
  if (head.size <= 20_000_000) {
    const object = await env.DELIVERY_MEDIA.get(key);
    if (!object || object.etag !== head.etag) throw mediaError('This photograph changed. Please retry.', 409, 'MEDIA_CHANGED');
    const { format, quality, ...transform } = options;
    return (await env.IMAGES.input(object.body).transform(transform).output({ format: `image/${format}`, quality })).response();
  }
  // URL transformations accept larger images than the Images binding. This
  // source route returns R2 bytes directly and never applies another transform.
  const token = await signMediaToken({ iss: 'veylo-media-v2', action: 'source', key, etag: head.etag, exp: Math.floor(Date.now() / 1000) + 300 }, env.IMAGE_SIGNING_SECRET);
  const source = new URL(`/v2/source/${token}`, request.url);
  const response = await fetch(source, { cf: { image: options }, redirect: 'manual' });
  if (!response.ok) { await response.body?.cancel(); throw mediaError('Cloudflare could not create this photograph preview. Please retry.', 502, 'IMAGE_TRANSFORM_FAILED'); }
  return response;
}

async function imageResponse(request, env, ctx, claims) {
  if (!presets.has(claims.preset)) throw mediaError('This photograph preview is not available.', 400, 'IMAGE_PRESET_INVALID');
  const key = requireMediaKey(claims.key);
  const head = await env.DELIVERY_MEDIA.head(key);
  if (!head) throw mediaError('Photograph not found.', 404, 'MEDIA_NOT_FOUND');
  if (!head.size || head.size > MAX_MEDIA_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(head.httpMetadata?.contentType)) throw mediaError('This photograph cannot be previewed.', 415, 'UNSUPPORTED_IMAGE');
  const digest = createHash('sha256').update(`${key}\0${head.etag}\0${claims.preset}`).digest('hex');
  const cacheKey = new Request(new URL(`/__media-cache/${digest}`, request.url));
  let response;
  try { response = await caches.default.match(cacheKey); } catch { /* A miss is safe. */ }
  if (!response) {
    response = await transformedImage(request, env, key, claims.preset, head);
    if (!response.ok) throw mediaError('The photograph preview could not be created.', 502, 'IMAGE_TRANSFORM_FAILED');
    const cacheHeaders = new Headers(response.headers);
    cacheHeaders.set('Cache-Control', 'public, max-age=86400');
    cacheHeaders.delete('Set-Cookie');
    response = new Response(response.body, { headers: cacheHeaders });
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch(() => {}));
  }
  const headers = new Headers(response.headers);
  for (const [name, value] of mediaHeaders()) headers.set(name, value);
  return new Response(request.method === 'HEAD' ? null : response.body, { headers });
}

async function inspectResource(request, env, data) {
  requireMediaKey(data.key);
  const maximum = Number(data.maxBytes);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_MEDIA_BYTES) throw mediaError('The upload limit could not be verified.', 400, 'MEDIA_LIMIT_INVALID');
  if (data.resourceType === 'image') {
    const info = await inspectImage(env.DELIVERY_MEDIA, env.IMAGES, data.key, maximum);
    const head = await env.DELIVERY_MEDIA.head(data.key);
    if (!head || head.etag !== info.etag) throw mediaError('This file changed. Please retry.', 409, 'MEDIA_CHANGED');
    // A header alone cannot confirm that all photograph pixels are readable.
    const preview = await transformedImage(request, env, data.key, '400', head);
    if (!preview.ok) throw mediaError('This file is not a readable photograph.', 415, 'INVALID_IMAGE');
    await boundedBytes(preview.body, 4 * 1024 * 1024);
    return info;
  }
  if (!['raw', 'audio', 'video'].includes(data.resourceType)) throw mediaError('This upload type is not supported.', 400, 'MEDIA_TYPE_INVALID');
  const head = await env.DELIVERY_MEDIA.head(data.key);
  if (!head || head.size < 1) throw mediaError('File not found.', 404, 'MEDIA_NOT_FOUND');
  if (head.size > maximum) throw mediaError('This file is larger than the upload limit.', 413, 'MEDIA_TOO_LARGE');
  const object = await env.DELIVERY_MEDIA.get(data.key, { range: { offset: 0, length: Math.min(head.size, 512) } });
  if (!object || object.etag !== head.etag) throw mediaError('This file changed. Please retry.', 409, 'MEDIA_CHANGED');
  const bytes = await boundedBytes(object.body, 512);
  const text = (start, length) => new TextDecoder().decode(bytes.subarray(start, start + length));
  const tiff = text(0, 2) === 'II' && bytes[2] === 42 && bytes[3] === 0 || text(0, 2) === 'MM' && bytes[2] === 0 && bytes[3] === 42;
  const cameraTiff = ['IIRO', 'IIRS', 'MMOR'].includes(text(0, 4)) || text(0, 2) === 'II' && bytes[2] === 85 && bytes[3] === 0;
  const raw = bytes.length >= 16 && (tiff || cameraTiff || text(4, 4) === 'ftyp' && text(8, 4) === 'crx ' || text(0, 8) === 'FUJIFILM' || text(0, 4) === 'FOVb' || bytes[0] === 0 && text(1, 3) === 'MRM');
  const audio = text(0, 3) === 'ID3' || bytes[0] === 255 && (bytes[1] & 224) === 224 || text(0, 4) === 'RIFF' && text(8, 4) === 'WAVE' || text(4, 4) === 'ftyp' || text(0, 4) === 'OggS' || text(0, 4) === 'fLaC' || text(0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(text(8, 4));
  const video = text(4, 4) === 'ftyp' || bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (data.resourceType === 'raw' ? !raw : data.resourceType === 'video' ? !video : !audio) throw mediaError(data.resourceType === 'raw' ? 'This file does not look like a supported camera RAW original.' : 'This file does not look like a supported recording.', 415, 'MEDIA_TYPE_MISMATCH');
  return hashObject(env.DELIVERY_MEDIA, data.key, maximum, head.etag);
}

async function rpcResponse(request, env, operation) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const claims = await verifyMediaToken(token, env.IMAGE_SIGNING_SECRET);
  if (!claims || claims.action !== 'rpc' || claims.operation !== operation) throw mediaError('The file service could not verify this request.', 401, 'MEDIA_SIGNATURE_INVALID');
  if (Number(request.headers.get('content-length')) > 512 * 1024) throw mediaError('This request contains too many files.', 413, 'MEDIA_REQUEST_TOO_LARGE');
  const body = await boundedBytes(request.body, 512 * 1024);
  if (createHash('sha256').update(body).digest('hex') !== claims.digest) throw mediaError('This request could not be verified.', 403, 'MEDIA_SIGNATURE_INVALID');
  let data;
  try { data = JSON.parse(new TextDecoder().decode(body)); } catch { throw mediaError('This request could not be read.'); }
  if (operation === 'health') return jsonResponse({ ok: true, protocol: 2, storage: Boolean(env.DELIVERY_MEDIA), images: Boolean(env.IMAGES), narration: Boolean(env.DEEPGRAM_API_KEY), authorization: Boolean(env.VEYLO_API_ORIGIN) });
  if (operation === 'inspect') return jsonResponse(await inspectResource(request, env, data));
  if (operation === 'narration') return jsonResponse(await createNarration(env, data));
  if (operation === 'join-narration') return jsonResponse(await joinNarration(env, data));
  if (operation === 'import-image') return jsonResponse(await importGeneratedImage(env, data));
  if (operation === 'archive') {
    const files = await prepareZipFiles(env.DELIVERY_MEDIA, data.files);
    const key = `${manifestPrefix}${crypto.randomUUID()}`;
    const filename = `${String(data.filename || 'veylo-photographs').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80)}.zip`;
    await env.DELIVERY_MEDIA.put(key, JSON.stringify({ files, filename, expiresAt: Date.now() + 30 * 60 * 1000 }), { httpMetadata: { contentType: 'application/json' } });
    return jsonResponse({ key });
  }
  throw mediaError('This file operation is not supported.', 404, 'MEDIA_OPERATION_UNKNOWN');
}

function withCors(request, response, env) {
  const origin = request.headers.get('origin');
  const allowed = new Set(['https://veylo.com.ng', 'https://www.veylo.com.ng', ...String(env.MEDIA_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)]);
  const headers = new Headers(response.headers);
  if (allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, If-Range');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, Content-Range, ETag');
    headers.append('Vary', 'Origin');
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function handleMediaRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v2/')) return null;
  try {
    if (!env.DELIVERY_MEDIA || !env.IMAGES) throw mediaError('File storage is temporarily unavailable.', 503, 'MEDIA_BINDING_MISSING');
    if (request.method === 'OPTIONS') return withCors(request, new Response(null, { status: 204 }), env);
    const rpc = url.pathname.match(/^\/v2\/rpc\/([a-z-]{1,40})$/);
    if (rpc && request.method === 'POST') return await rpcResponse(request, env, rpc[1]);
    if (!['GET', 'HEAD'].includes(request.method)) throw mediaError('This file request is not supported.', 405, 'METHOD_NOT_ALLOWED');
    const match = url.pathname.match(/^\/v2\/(file|image|source|archive|audio)\/([A-Za-z0-9_.-]{1,4096})$/);
    const claims = match && await verifyMediaToken(match[2], env.IMAGE_SIGNING_SECRET);
    if (!claims || claims.action !== match[1]) throw mediaError('This file link has expired. Reopen the gallery to continue.', 401, 'MEDIA_LINK_EXPIRED');
    requireMediaKey(claims.key);
    let response;
    if (claims.action === 'archive') {
      if (!claims.key.startsWith(manifestPrefix)) throw mediaError('This gallery download is not available.', 403, 'ARCHIVE_SCOPE_INVALID');
      const object = await env.DELIVERY_MEDIA.get(claims.key);
      if (!object || object.size > maxManifestBytes) throw mediaError('This download link has expired. Return to the gallery and retry.', 410, 'ARCHIVE_EXPIRED');
      const manifest = JSON.parse(new TextDecoder().decode(await boundedBytes(object.body, maxManifestBytes)));
      if (manifest.expiresAt <= Date.now()) throw mediaError('This download link has expired. Return to the gallery and retry.', 410, 'ARCHIVE_EXPIRED');
      await authorizeMedia(request, env, match[2], claims, manifest.files.map(file => ({ key: file.key })));
      const headers = mediaHeaders();
      headers.set('Content-Type', 'application/zip'); headers.set('Content-Disposition', disposition(manifest.filename));
      headers.set('Content-Length', String(zipContentLength(manifest.files)));
      response = new Response(request.method === 'HEAD' ? null : zipStream(env.DELIVERY_MEDIA, manifest.files), { headers });
    } else {
      await authorizeMedia(request, env, match[2], claims);
      if (claims.action === 'source') {
        const head = await env.DELIVERY_MEDIA.head(claims.key);
        if (!head || head.etag !== claims.etag) throw mediaError('This photograph changed.', 409, 'MEDIA_CHANGED');
      }
      response = claims.action === 'image' ? await imageResponse(request, env, ctx, claims) : claims.action === 'audio' ? await remoteAudioResponse(request, claims) : await fileResponse(request, env, claims);
    }
    return withCors(request, response, env);
  } catch (error) {
    return withCors(request, jsonResponse({ code: error.code || 'MEDIA_UNAVAILABLE', message: error.status ? error.message : 'This file is temporarily unavailable. Please retry.' }, error.status || 502), env);
  }
}

export async function cleanMediaManifests(env) {
  let cursor;
  // Bound each scheduled run; subsequent runs continue clearing older records.
  for (let page = 0; page < 10; page += 1) {
    const result = await env.DELIVERY_MEDIA.list({ prefix: manifestPrefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    const expired = result.objects.filter(object => object.uploaded.getTime() < Date.now() - 60 * 60 * 1000).map(object => object.key);
    for (let offset = 0; offset < expired.length; offset += 100) await env.DELIVERY_MEDIA.delete(expired.slice(offset, offset + 100));
    if (!result.truncated) break;
    cursor = result.cursor;
  }
}
