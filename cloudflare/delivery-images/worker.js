const MAX_IMAGE_BYTES = 20_000_000;
const IMAGE_WIDTHS = new Set([400, 480, 640, 800, 960, 1024, 1200, 1600]);
const IMAGE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp']);
const encoder = new TextEncoder();

function json(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function isDeliveryObjectKey(value) {
  const parts = String(value || '').split('/');
  return parts.length === 6
    && parts[0] === 'veylo'
    && parts[1] === 'users'
    && parts[2].length > 0
    && parts[3] === 'deliveries'
    && parts[4].length > 0
    && parts[5].length > 0
    && parts.every(part => part !== '.' && part !== '..' && /^[A-Za-z0-9._-]+$/.test(part));
}

function isAllowedPreset(value) {
  if (value === 'info' || value === 'thumb' || value === 'og') return true;
  const width = Number(value);
  return Number.isInteger(width) && IMAGE_WIDTHS.has(width);
}

async function verifyToken(token, secret) {
  if (!secret || secret.length < 32 || token.length > 2500) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payloadBytes = decodeBase64Url(parts[0]);
  const signature = decodeBase64Url(parts[1]);
  if (!payloadBytes || !signature) return null;

  let claims;
  try { claims = JSON.parse(new TextDecoder().decode(payloadBytes)); } catch { return null; }
  if (claims?.iss !== 'veylo-delivery-image'
    || !isDeliveryObjectKey(claims.key)
    || !isAllowedPreset(claims.preset)
    || !Number.isInteger(claims.exp)
    || claims.exp <= Math.floor(Date.now() / 1000)
    || claims.exp > Math.floor(Date.now() / 1000) + (6 * 60 * 60) + 30) return null;

  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(parts[0]));
    return valid ? claims : null;
  } catch {
    return null;
  }
}

function normalizedFormat(value) {
  const format = String(value || '').toLowerCase().replace(/^image\//, '');
  if (format === 'jpg') return 'jpeg';
  return IMAGE_FORMATS.has(format) ? format : '';
}

function privateImageResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}

async function originalImageResponse(env, key) {
  try {
    const object = await env.DELIVERY_MEDIA.get(key);
    if (!object) return json(404, 'IMAGE_NOT_FOUND', 'Photograph not found.');
    if (!object.size || object.size > MAX_IMAGE_BYTES) return json(413, 'IMAGE_TOO_LARGE', 'This delivery photograph is larger than 20 MB.');
    const headers = new Headers({ 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff' });
    const contentType = String(object.httpMetadata?.contentType || '').toLowerCase();
    if (contentType && !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return json(415, 'UNSUPPORTED_IMAGE', 'Use a still JPEG, PNG, or WebP photograph.');
    if (['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) headers.set('Content-Type', contentType);
    if (Number.isSafeInteger(object.size) && object.size > 0) headers.set('Content-Length', String(object.size));
    return new Response(object.body, { headers });
  } catch {
    return json(503, 'IMAGE_SERVICE_UNAVAILABLE', 'This photograph preview is temporarily unavailable. Try again.');
  }
}

async function cacheKeyFor(requestUrl, key, preset, objectVersion) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${key}\0${objectVersion}\0${preset}`));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return new Request(new URL(`/__delivery-image-cache/${hash}`, requestUrl));
}

async function handleImage(request, env, ctx) {
  if (request.method !== 'GET') return json(405, 'METHOD_NOT_ALLOWED', 'Use GET to request a photograph.');
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/v1\/([A-Za-z0-9_.-]{1,2500})$/);
  if (!match) return json(404, 'IMAGE_NOT_FOUND', 'Photograph not found.');

  const claims = await verifyToken(match[1], env.IMAGE_SIGNING_SECRET);
  if (!claims) return json(401, 'IMAGE_LINK_EXPIRED', 'This photograph link has expired. Reopen the delivery to continue.');
  if (!env.DELIVERY_MEDIA || !env.IMAGES) return json(503, 'IMAGE_SERVICE_UNAVAILABLE', 'Delivery photo previews are temporarily unavailable.');

  let object;
  try { object = await env.DELIVERY_MEDIA.get(claims.key); } catch { return json(502, 'IMAGE_STORAGE_UNAVAILABLE', 'The photograph could not be opened. Try again.'); }
  if (!object) return json(404, 'IMAGE_NOT_FOUND', 'Photograph not found.');
  if (!object.size || object.size > MAX_IMAGE_BYTES) return json(413, 'IMAGE_TOO_LARGE', 'This delivery photograph is larger than 20 MB.');

  const sourceType = String(object.httpMetadata?.contentType || '').toLowerCase();
  if (sourceType && !['image/jpeg', 'image/png', 'image/webp'].includes(sourceType)) {
    return json(415, 'UNSUPPORTED_IMAGE', 'Use a still JPEG, PNG, or WebP photograph.');
  }

  if (claims.preset === 'info') {
    try {
      const info = await env.IMAGES.info(object.body);
      const format = normalizedFormat(info?.format);
      const width = Number(info?.width);
      const height = Number(info?.height);
      if (!format || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
        return json(415, 'UNSUPPORTED_IMAGE', 'Use a still JPEG, PNG, or WebP photograph.');
      }
      return new Response(JSON.stringify({ format, width, height, bytes: object.size }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
      });
    } catch {
      return json(415, 'INVALID_IMAGE', 'Veylo could not read this photograph. Choose a still JPEG, PNG, or WebP file.');
    }
  }

  const cacheKey = await cacheKeyFor(url.origin, claims.key, claims.preset, object.etag || object.size);
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return privateImageResponse(cached);
  } catch {
    // A cache miss should still serve the image. Cloudflare can regenerate it.
  }

  let transform;
  let output;
  if (claims.preset === 'thumb') {
    transform = { width: 480, height: 600, fit: 'cover' };
    output = { format: 'image/webp', quality: 82 };
  } else if (claims.preset === 'og') {
    transform = { width: 1200, height: 630, fit: 'cover' };
    output = { format: 'image/jpeg', quality: 86 };
  } else {
    transform = { width: Number(claims.preset), fit: 'scale-down' };
    output = { format: 'image/webp', quality: 84 };
  }

  try {
    const resized = await env.IMAGES.input(object.body).transform(transform).output(output).response({
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' }
    });
    if (!resized.ok) return originalImageResponse(env, claims.key);
    ctx.waitUntil(caches.default.put(cacheKey, resized.clone()).catch(() => {}));
    return privateImageResponse(resized);
  } catch {
    return originalImageResponse(env, claims.key);
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleImage(request, env, ctx);
  }
};
