import crypto from 'node:crypto';

const MAX_LINK_SECONDS = 6 * 60 * 60;

export function mediaOffloadEnabled() {
  return process.env.R2_MEDIA_OFFLOAD_ENABLED === 'true';
}

export function mediaWorkerConfig() {
  const value = String(process.env.R2_IMAGE_WORKER_URL || '').trim();
  const secret = String(process.env.R2_IMAGE_WORKER_SECRET || '').trim();
  let url;
  try { url = new URL(value); } catch { /* Report a configuration error below. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || secret.length < 32) {
    throw Object.assign(new Error('File storage is temporarily unavailable. Please try again later.'), { status: 503, code: 'MEDIA_WORKER_CONFIG' });
  }
  return { baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, secret };
}

export function validMediaKey(key) {
  const parts = String(key || '').split('/');
  return String(key || '').length <= 900 && parts.length >= 4 && parts[0] === 'veylo'
    && ['users', 'studios', 'content-studio', 'catalog', 'system'].includes(parts[1])
    && parts.every(part => part && part !== '.' && part !== '..' && /^[A-Za-z0-9._-]+$/.test(part));
}

function signedToken(claims, lifetimeSeconds = 300) {
  const { secret } = mediaWorkerConfig();
  const seconds = Math.max(1, Math.min(MAX_LINK_SECONDS, Math.floor(lifetimeSeconds)));
  const payload = Buffer.from(JSON.stringify({ ...claims, iss: 'veylo-media-v2', exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

export function verifyMediaWorkerToken(token) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const [payload, signature, extra] = token.split('.');
    if (extra || !/^[A-Za-z0-9_-]+$/.test(payload || '') || !/^[A-Za-z0-9_-]+$/.test(signature || '')) return null;
    const expected = crypto.createHmac('sha256', mediaWorkerConfig().secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    return claims.iss === 'veylo-media-v2' && Number.isInteger(claims.exp) && claims.exp > now && claims.exp <= now + MAX_LINK_SECONDS + 30 ? claims : null;
  } catch { return null; }
}

export function signedMediaUrl(key, { preset = '', downloadFilename = '', access, expiresIn = MAX_LINK_SECONDS, archive = false } = {}) {
  if (!validMediaKey(key)) throw Object.assign(new Error('This file could not be prepared.'), { status: 400, code: 'MEDIA_KEY_INVALID' });
  const action = archive ? 'archive' : preset ? 'image' : 'file';
  const token = signedToken({ action, key, ...(preset ? { preset: String(preset) } : {}), ...(downloadFilename ? { filename: String(downloadFilename).slice(0, 180) } : {}), ...(access ? { access } : {}) }, expiresIn);
  return `${mediaWorkerConfig().baseUrl}/v2/${action}/${token}`;
}

export function signedRemoteAudioUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !['cdn.pixabay.com', 'pixabay.com', 'www.pixabay.com'].includes(url.hostname) || url.toString().length > 1500) throw Object.assign(new Error('Audio source is not approved.'), { status: 400 });
  const key = `veylo/catalog/external-audio/${crypto.createHash('sha256').update(url.toString()).digest('hex')}`;
  return `${mediaWorkerConfig().baseUrl}/v2/audio/${signedToken({ action: 'audio', key, url: url.toString() }, 3600)}`;
}

export async function mediaWorkerRequest(operation, data = {}, { timeoutMs = 120_000, signal } = {}) {
  const body = JSON.stringify(data);
  if (Buffer.byteLength(body) > 512 * 1024) throw Object.assign(new Error('Too many files were requested together.'), { status: 400 });
  const token = signedToken({ action: 'rpc', operation, digest: crypto.createHash('sha256').update(body).digest('hex') }, 300);
  let response;
  try {
    response = await fetch(`${mediaWorkerConfig().baseUrl}/v2/rpc/${operation}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw Object.assign(new Error('Cloudflare could not finish preparing this file. Please retry.'), { status: 502, code: 'MEDIA_WORKER_UNAVAILABLE' });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    // A failed service signature must never log the photographer out.
    const status = [401, 403, 404].includes(response.status) ? 503 : response.status;
    throw Object.assign(new Error(result.message || 'Cloudflare could not finish preparing this file. Please retry.'), { status, code: result.code || 'MEDIA_WORKER_REQUEST_FAILED' });
  }
  return result;
}

export async function checkMediaWorker() {
  return mediaWorkerRequest('health');
}

export async function prepareCloudflareImage(key, { maxBytes = 100 * 1024 * 1024 } = {}) {
  return mediaWorkerRequest('inspect', { key, maxBytes, resourceType: 'image' });
}

export async function createCloudflareArchive(files, filename, { access } = {}) {
  const result = await mediaWorkerRequest('archive', { files, filename });
  return signedMediaUrl(result.key, { archive: true, access, expiresIn: 20 * 60 });
}
