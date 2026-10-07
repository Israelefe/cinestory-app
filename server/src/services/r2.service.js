import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';

const REGION = 'auto';
const SERVICE = 's3';
const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_DOWNLOAD_SECONDS = 6 * 60 * 60;
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw Object.assign(new Error('Image storage is temporarily unavailable.'), { status: 503, code: 'R2_NOT_CONFIGURED' });
  return value;
}

export function r2Configured() {
  return ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'].every(name => String(process.env[name] || '').trim());
}

export function isR2PresignedUrl(value) {
  try {
    const target = new URL(String(value || ''));
    const settings = config();
    return target.protocol === 'https:' && target.hostname === new URL(settings.endpoint).hostname && !target.username && !target.password && !target.port && target.pathname.startsWith(`/${encode(settings.bucket)}/`) && target.searchParams.has('X-Amz-Signature');
  } catch { return false; }
}

export async function checkR2Connection() {
  if (!r2Configured()) return { ok: false, reason: 'one or more R2 environment values are missing' };
  try {
    await listR2Objects('veylo/', { maxObjects: 1 });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error?.message || 'R2 rejected the connection').replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]').slice(0, 180) };
  }
}

function config() {
  const accountId = required('R2_ACCOUNT_ID');
  return {
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET_NAME'),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`
  };
}

function encode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKey(key) {
  return String(key).split('/').map(encode).join('/');
}

function hmac(key, value, encoding) {
  const result = crypto.createHmac('sha256', key).update(value, 'utf8');
  return encoding ? result.digest(encoding) : result.digest();
}

function signingKey(secret, date) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, 'aws4_request');
}

function sortedQuery(params) {
  return [...params.entries()]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('&');
}

function r2Path(bucket, key) {
  return `/${encode(bucket)}/${encodeKey(key)}`;
}

export function presignR2Object(key, { method = 'GET', expiresIn = DEFAULT_DOWNLOAD_SECONDS, contentType = '', downloadFilename = '' } = {}) {
  const settings = config();
  const normalizedKey = String(key || '').replace(/^\/+/, '');
  if (!normalizedKey || normalizedKey.includes('..') || normalizedKey.length > 900) throw Object.assign(new Error('That file could not be prepared.'), { status: 400 });
  const expires = Math.max(1, Math.min(MAX_PRESIGN_SECONDS, Math.floor(Number(expiresIn) || DEFAULT_DOWNLOAD_SECONDS)));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const host = new URL(settings.endpoint).host;
  const headers = contentType ? { 'content-type': String(contentType).trim().toLowerCase().replace(/\s+/g, ' ') } : {};
  const signedHeaders = [...Object.keys(headers), 'host'].sort().join(';');
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${settings.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders
  });
  if (downloadFilename && method === 'GET') {
    const safe = String(downloadFilename).replace(/[\r\n"\\]/g, '_').slice(0, 150) || 'photograph';
    query.set('response-content-disposition', `attachment; filename*=UTF-8''${encode(safe)}`);
  }
  const canonicalHeaders = [...Object.entries(headers), ['host', host]].sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}:${value}\n`).join('');
  const path = r2Path(settings.bucket, normalizedKey);
  const canonicalRequest = [method.toUpperCase(), path, sortedQuery(query), canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const signature = hmac(signingKey(settings.secretAccessKey, date), stringToSign, 'hex');
  query.set('X-Amz-Signature', signature);
  const url = `${settings.endpoint}${path}?${sortedQuery(query)}`;
  return { url, headers: contentType ? { 'Content-Type': contentType } : {}, expiresAt: new Date(now.getTime() + expires * 1000) };
}

export function createUploadToken({ key, userId, contentType, resourceType = 'image', maxBytes = MAX_IMAGE_BYTES }) {
  const secret = required('JWT_SECRET');
  return jwt.sign({ purpose: 'r2-upload', key, userId: String(userId), contentType, resourceType, maxBytes }, secret, { expiresIn: '20m', issuer: 'veylo-r2-upload' });
}

export function verifyUploadToken(token, { key, userId, resourceType } = {}) {
  try {
    const payload = jwt.verify(String(token || ''), required('JWT_SECRET'), { issuer: 'veylo-r2-upload' });
    if (payload.purpose !== 'r2-upload' || payload.key !== key || payload.userId !== String(userId) || (resourceType && payload.resourceType !== resourceType)) throw new Error('wrong scope');
    return payload;
  } catch {
    throw Object.assign(new Error('This upload has expired. Start it again and retry.'), { status: 401, code: 'UPLOAD_TOKEN_INVALID' });
  }
}

export function createR2Upload({ key, userId, contentType, resourceType = 'image', maxBytes = MAX_IMAGE_BYTES }) {
  const signed = presignR2Object(key, { method: 'PUT', expiresIn: 20 * 60, contentType });
  return { objectKey: key, uploadUrl: signed.url, uploadHeaders: signed.headers, contentType, uploadToken: createUploadToken({ key, userId, contentType, resourceType, maxBytes }), maxBytes };
}

function r2NetworkFailure(method, cause) {
  const rawCauseCode = String(cause?.cause?.code || cause?.cause?.name || cause?.code || '').trim();
  const causeCode = /^[A-Za-z0-9_-]{1,80}$/.test(rawCauseCode) ? rawCauseCode : '';
  const detail = causeCode ? ` (${causeCode})` : '';
  return Object.assign(new Error(`Image storage connection failed during ${method}${detail}.`), {
    status: 502,
    code: 'R2_NETWORK_ERROR',
    operation: method,
    causeCode
  });
}

async function requestR2(key, { method = 'GET', contentType = '', body, query = {}, downloadFilename, expiresIn, timeoutMs = 120_000 } = {}) {
  const signed = presignR2Object(key, { method, contentType, downloadFilename, expiresIn });
  // Listing uses a bucket-level URL and is signed separately below.
  let response;
  try {
    response = await fetch(signed.url, { method, headers: contentType ? { 'Content-Type': contentType } : undefined, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw r2NetworkFailure(method.toUpperCase(), error);
  }
  if (!response.ok) {
    const error = Object.assign(new Error(response.status === 404 ? 'File not found.' : 'Image storage could not complete this request.'), { status: response.status === 404 ? 404 : 502, code: response.status === 404 ? 'R2_OBJECT_NOT_FOUND' : 'R2_REQUEST_FAILED' });
    throw error;
  }
  return response;
}

export async function putR2Object(key, buffer, { contentType = 'application/octet-stream' } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const response = await requestR2(key, { method: 'PUT', contentType, body: bytes });
  return { key, bytes: bytes.length, etag: response.headers.get('etag')?.replace(/^"|"$/g, '') || '' };
}

export async function putR2ObjectStream(key, body, { contentType = 'application/octet-stream', bytes, timeoutMs = 15 * 60 * 1000 } = {}) {
  const length = Number(bytes);
  if (!Number.isSafeInteger(length) || length < 1) throw Object.assign(new Error('The file size could not be verified.'), { status: 400, code: 'R2_CONTENT_LENGTH_REQUIRED' });
  const signed = presignR2Object(key, { method: 'PUT', contentType });
  const response = await fetch(signed.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(length) },
    body,
    duplex: 'half',
    signal: AbortSignal.timeout(Math.max(1_000, Number(timeoutMs) || 15 * 60 * 1000))
  });
  if (!response.ok) throw Object.assign(new Error('Image storage could not complete this request.'), { status: 502, code: 'R2_REQUEST_FAILED' });
  return { key, bytes: length, etag: response.headers.get('etag')?.replace(/^"|"$/g, '') || '' };
}

export async function headR2Object(key) {
  const response = await requestR2(key, { method: 'HEAD' });
  return {
    key,
    bytes: Number(response.headers.get('content-length') || 0),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    etag: response.headers.get('etag')?.replace(/^"|"$/g, '') || '',
    lastModified: response.headers.get('last-modified') || ''
  };
}

export async function getR2ObjectBuffer(key, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  const response = await requestR2(key, { method: 'GET' });
  const declaredBytes = Number(response.headers.get('content-length') || 0);
  if (declaredBytes > maxBytes) { await response.body?.cancel().catch(() => {}); throw Object.assign(new Error('That file is too large to process.'), { status: 413, code: 'R2_OBJECT_TOO_LARGE' }); }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) { await response.body.cancel().catch(() => {}); throw Object.assign(new Error('That file is too large to process.'), { status: 413, code: 'R2_OBJECT_TOO_LARGE' }); }
    chunks.push(Buffer.from(chunk));
  }
  return { buffer: Buffer.concat(chunks, size), contentType: response.headers.get('content-type') || 'application/octet-stream', etag: response.headers.get('etag')?.replace(/^"|"$/g, '') || '' };
}

export async function getR2ObjectStream(key, options = {}) {
  const response = await requestR2(key, { method: 'GET', timeoutMs: Number(options.timeoutMs) || 120_000 });
  return { body: response.body, contentType: response.headers.get('content-type') || 'application/octet-stream', bytes: Number(response.headers.get('content-length') || 0) };
}

export async function deleteR2Object(key) {
  try { await requestR2(key, { method: 'DELETE' }); return true; }
  catch (error) { if (error.status === 404) return true; throw error; }
}

function xmlValue(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function listR2Page(prefix, continuationToken) {
  const settings = config();
  const endpoint = new URL(settings.endpoint);
  const path = `/${encode(settings.bucket)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const params = new URLSearchParams({ 'list-type': '2', 'encoding-type': 'url', prefix });
  if (continuationToken) params.set('continuation-token', continuationToken);
  params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  params.set('X-Amz-Credential', `${settings.accessKeyId}/${scope}`);
  params.set('X-Amz-Date', amzDate);
  params.set('X-Amz-Expires', '60');
  params.set('X-Amz-SignedHeaders', 'host');
  const query = sortedQuery(params);
  const canonicalRequest = ['GET', path, query, `host:${endpoint.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  params.set('X-Amz-Signature', hmac(signingKey(settings.secretAccessKey, date), stringToSign, 'hex'));
  const response = await fetch(`${settings.endpoint}${path}?${sortedQuery(params)}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw Object.assign(new Error('Image storage could not list its files.'), { status: 502, code: 'R2_LIST_FAILED' });
  const xml = await response.text();
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(match => {
    const block = match[1];
    const rawKey = block.match(/<Key>([^<]*)<\/Key>/)?.[1] || '';
    const encodedKey = xmlValue(rawKey);
    let key = encodedKey;
    try { key = decodeURIComponent(encodedKey); } catch { /* Keep the XML key if it is not valid URI encoding. */ }
    return { key, lastModified: xmlValue(block.match(/<LastModified>([^<]*)<\/LastModified>/)?.[1] || ''), bytes: Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] || 0) };
  });
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
  return { objects, next: truncated && next ? xmlValue(next) : null };
}

export async function listR2Objects(prefix, { maxObjects = Infinity } = {}) {
  const objects = [];
  let cursor = null;
  do {
    const page = await listR2Page(prefix, cursor);
    objects.push(...page.objects.map(object => object.key));
    cursor = page.next;
  } while (cursor && objects.length < maxObjects);
  return objects.slice(0, maxObjects);
}

export async function listR2ObjectRecords(prefix, { maxObjects = Infinity } = {}) {
  const objects = [];
  let cursor = null;
  do {
    const page = await listR2Page(prefix, cursor);
    objects.push(...page.objects);
    cursor = page.next;
  } while (cursor && objects.length < maxObjects);
  return objects.slice(0, maxObjects);
}

export async function deleteR2Prefix(prefix) {
  const keys = await listR2Objects(prefix);
  for (let offset = 0; offset < keys.length; offset += 20) await Promise.all(keys.slice(offset, offset + 20).map(deleteR2Object));
  return keys.length;
}

export async function copyR2Object(sourceKey, targetKey, { contentType } = {}) {
  const source = await getR2ObjectBuffer(sourceKey);
  return putR2Object(targetKey, source.buffer, { contentType: contentType || source.contentType });
}

export function imageVariantKey(key, variant) {
  return `${String(key)}.__veylo/${String(variant)}.webp`;
}

export async function prepareR2Image(key, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  const source = await getR2ObjectBuffer(key, { maxBytes });
  const base = sharp(source.buffer, { limitInputPixels: 100_000_000, failOn: 'error' });
  const metadata = await base.metadata().catch(() => { throw Object.assign(new Error('This file is not a readable photograph.'), { status: 400, code: 'INVALID_IMAGE' }); });
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1 || !metadata.width || !metadata.height) throw Object.assign(new Error('Use a still JPEG, PNG, or WebP photograph.'), { status: 400, code: 'UNSUPPORTED_IMAGE' });
  const variants = {};
  const widths = [400, 480, 640, 800, 960, 1024, 1200, 1600];
  for (let offset = 0; offset < widths.length; offset += 2) {
    await Promise.all(widths.slice(offset, offset + 2).map(async width => {
      const variant = String(width);
      const image = await sharp(source.buffer, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate().resize({ width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, effort: 4 }).toBuffer();
      const variantKey = imageVariantKey(key, variant);
      await putR2Object(variantKey, image, { contentType: 'image/webp' });
      variants[variant] = variantKey;
    }));
  }
  const thumb = await sharp(source.buffer, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate().resize({ width: 480, height: 600, fit: 'cover', position: 'attention' }).webp({ quality: 82, effort: 4 }).toBuffer();
  const thumbKey = imageVariantKey(key, 'thumb');
  await putR2Object(thumbKey, thumb, { contentType: 'image/webp' });
  variants.thumb = thumbKey;
  const og = await sharp(source.buffer, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate().resize({ width: 1200, height: 630, fit: 'cover', position: 'attention' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const ogKey = imageVariantKey(key, 'og');
  await putR2Object(ogKey, og, { contentType: 'image/jpeg' });
  variants.og = ogKey;
  return { ...metadata, contentType: source.contentType, bytes: source.buffer.length, etag: source.etag, sha256: crypto.createHash('sha256').update(source.buffer).digest('hex'), variants };
}

export function presignedR2Get(key, { downloadFilename = '', expiresIn = DEFAULT_DOWNLOAD_SECONDS } = {}) {
  return presignR2Object(key, { method: 'GET', expiresIn, downloadFilename }).url;
}

export { MAX_IMAGE_BYTES, DEFAULT_DOWNLOAD_SECONDS };
