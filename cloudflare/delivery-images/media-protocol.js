import { createHash } from 'node:crypto';

const encoder = new TextEncoder();
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 100_000_000;

export function mediaError(message, status = 400, code = 'MEDIA_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

export function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export function validMediaKey(key) {
  const parts = String(key || '').split('/');
  return String(key || '').length <= 900 && parts.length >= 4 && parts[0] === 'veylo'
    && ['users', 'studios', 'content-studio', 'catalog', 'system'].includes(parts[1])
    && parts.every(part => part && part !== '.' && part !== '..' && /^[A-Za-z0-9._-]+$/.test(part));
}

export function requireMediaKey(key) {
  if (!validMediaKey(key)) throw mediaError('This file could not be prepared.', 400, 'MEDIA_KEY_INVALID');
  return key;
}

export async function signMediaToken(claims, secret) {
  const payload = btoa(String.fromCharCode(...encoder.encode(JSON.stringify(claims)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  const signature = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${payload}.${signature}`;
}

function decode(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export async function verifyMediaToken(token, secret) {
  try {
    if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 4096) return null;
    const [payload, signature, extra] = token.split('.');
    if (extra || !/^[A-Za-z0-9_-]+$/.test(payload || '') || !/^[A-Za-z0-9_-]+$/.test(signature || '')) return null;
    const claims = JSON.parse(new TextDecoder().decode(decode(payload)));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'veylo-media-v2' || !Number.isInteger(claims.exp) || claims.exp <= now || claims.exp > now + 6 * 60 * 60 + 30) return null;
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, decode(signature), encoder.encode(payload)) ? claims : null;
  } catch { return null; }
}

export async function boundedBytes(stream, maximum) {
  const parts = [];
  let bytes = 0;
  for await (const part of stream) {
    bytes += part.byteLength;
    if (bytes > maximum) throw mediaError('This file is too large to process.', 413, 'MEDIA_TOO_LARGE');
    parts.push(part);
  }
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

export async function hashObject(bucket, key, maximum = MAX_MEDIA_BYTES, expectedEtag) {
  const object = await bucket.get(requireMediaKey(key));
  if (!object) throw mediaError('File not found.', 404, 'MEDIA_NOT_FOUND');
  if (object.size < 1 || object.size > maximum) throw mediaError('This file is larger than the upload limit.', 413, 'MEDIA_TOO_LARGE');
  if (expectedEtag && object.etag !== expectedEtag) throw mediaError('This file changed while it was being checked. Please retry.', 409, 'MEDIA_CHANGED');
  const hash = createHash('sha256');
  let bytes = 0;
  // Hash in chunks; a 100 MB original is never held in Worker memory.
  for await (const chunk of object.body) {
    bytes += chunk.byteLength;
    if (bytes > maximum) throw mediaError('This file is larger than the upload limit.', 413, 'MEDIA_TOO_LARGE');
    hash.update(chunk);
  }
  if (bytes !== object.size) throw mediaError('This file could not be read completely. Please retry.', 502, 'MEDIA_INCOMPLETE');
  return { sha256: hash.digest('hex'), bytes, etag: object.etag };
}

export async function authorizeMedia(request, env, token, claims, files) {
  if (!claims.access) return;
  let origin;
  try { origin = new URL(env.VEYLO_API_ORIGIN); } catch { throw mediaError('Private files are temporarily unavailable.', 503, 'MEDIA_AUTH_CONFIG'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw mediaError('Private files are temporarily unavailable.', 503, 'MEDIA_AUTH_CONFIG');
  const response = await fetch(new URL('/api/v1/media/authorize', origin), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(files ? { files } : {}) }), redirect: 'error', signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw mediaError(response.status >= 500 ? 'Private files are temporarily unavailable.' : 'This sharing link is no longer available.', response.status >= 500 ? 503 : 403, 'MEDIA_ACCESS_DENIED');
}
