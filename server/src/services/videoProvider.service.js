import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { presignR2Object } from './r2.service.js';

const apiRoot = 'https://api.cloudflare.com/client/v4/';
const uidPattern = /^[a-f\d]{32}$/i;
export const streamCreator = userId => crypto.createHash('sha256').update('veylo-video:' + String(userId)).digest('hex');
function streamAccount() {
  const value = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID || '';
  if (!/^[a-f\d]{32}$/i.test(value)) throw Object.assign(new Error('Video playback is not configured.'), { status: 503, code: 'VIDEO_NOT_CONFIGURED' });
  return value;
}

async function cloudflare(path, { method = 'GET', body, token = process.env.CLOUDFLARE_STREAM_API_TOKEN } = {}) {
  let response;
  try { response = await fetch(apiRoot + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90_000) }); }
  catch { throw Object.assign(new Error('The video service could not be reached. Please try again.'), { status: 502, code: 'VIDEO_PROVIDER_NETWORK' }); }
  if (response.status === 404) throw Object.assign(new Error('Video not found.'), { status: 404 });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false || data.errors?.length) throw Object.assign(new Error('The video service could not complete this request.'), { status: response.status === 429 ? 429 : 502, code: 'VIDEO_PROVIDER_FAILED' });
  return data.result ?? data.data;
}

export async function importStreamVideo(asset) {
  const source = presignR2Object(asset.objectKey, { expiresIn: 6 * 60 * 60 }).url;
  const origins = [process.env.CLIENT_URL].filter(Boolean).map(value => new URL(value).hostname);
  const result = await cloudflare('accounts/' + streamAccount() + '/stream/copy', { method: 'POST', body: { url: source, requireSignedURLs: true, creator: streamCreator(asset.userId), allowedOrigins: origins, meta: { assetId: String(asset._id) } } });
  if (uidPattern.test(result?.uid || '') && result.requireSignedURLs !== true) await deleteStreamVideo(result.uid);
  if (!uidPattern.test(result?.uid || '') || result.requireSignedURLs !== true) throw Object.assign(new Error('Private video preparation could not be verified.'), { code: 'VIDEO_PRIVATE_IMPORT_FAILED' });
  return result.uid;
}

export async function streamDetails(uid) {
  if (!uidPattern.test(uid || '')) throw new Error('Invalid Stream video.');
  return cloudflare('accounts/' + streamAccount() + '/stream/' + uid);
}

export async function deleteStreamVideo(uid) {
  if (!uid) return;
  try { await cloudflare('accounts/' + streamAccount() + '/stream/' + uid, { method: 'DELETE' }); }
  catch (error) { if (error.status !== 404) throw error; }
}

export function signedStreamMedia(uid, { seconds = 600, posterSeconds = 0, now = Date.now() } = {}) {
  if (!uidPattern.test(uid || '')) throw new Error('Invalid Stream video.');
  const keyId = process.env.CLOUDFLARE_STREAM_KEY_ID || '';
  const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '';
  if (!/^[a-z\d-]+$/i.test(code) || !/^[a-z\d]+$/i.test(keyId)) throw Object.assign(new Error('Video playback is not configured.'), { status: 503 });
  const rawKey = String(process.env.CLOUDFLARE_STREAM_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const pem = rawKey.includes('-----BEGIN') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf8');
  const exp = Math.floor(now / 1000) + seconds;
  const token = jwt.sign({ sub: uid, kid: keyId, exp, nbf: Math.floor(now / 1000) - 30, downloadable: false }, pem, { algorithm: 'RS256', keyid: keyId, noTimestamp: true });
  const base = 'https://customer-' + code.replace(/^customer-/, '') + '.cloudflarestream.com/' + token;
  return { hlsUrl: base + '/manifest/video.m3u8', posterUrl: base + '/thumbnails/thumbnail.jpg?time=' + Math.max(0, Number(posterSeconds) || 0) + 's&width=960', expiresAt: new Date(exp * 1000) };
}

export function verifyStreamWebhook(body, header, secret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET, now = Date.now()) {
  if (!Buffer.isBuffer(body) || !secret || typeof header !== 'string') return false;
  const fields = Object.fromEntries(header.split(',').map(value => value.trim().split('=')));
  if (!/^\d{10}$/.test(fields.time || '') || !/^[a-f\d]{64}$/i.test(fields.sig1 || '') || Math.abs(now / 1000 - Number(fields.time)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(fields.time + '.').update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(fields.sig1, 'hex'));
}

export async function getStreamMinutes(userId, start, end) {
  // The server-side delivery dataset includes buffering. Client watch events do not.
  const query = 'query($account: string!, $start: Time!, $end: Time!, $creator: string!) { viewer { accounts(filter: {accountTag: $account}) { streamMinutesViewedAdaptiveGroups(limit: 1, filter: {datetime_geq: $start, datetime_lt: $end, creator: $creator}) { sum { minutesViewed } } } } }';
  const result = await cloudflare('graphql', { method: 'POST', token: process.env.CLOUDFLARE_STREAM_ANALYTICS_TOKEN || process.env.CLOUDFLARE_STREAM_API_TOKEN, body: { query, variables: { account: streamAccount(), start: start.toISOString(), end: end.toISOString(), creator: streamCreator(userId) } } });
  const groups = result?.viewer?.accounts?.[0]?.streamMinutesViewedAdaptiveGroups;
  if (!Array.isArray(groups)) throw new Error('Video usage is temporarily unavailable.');
  if (groups.some(item => typeof item.sum?.minutesViewed !== 'number' || !Number.isFinite(item.sum.minutesViewed) || item.sum.minutesViewed < 0)) throw new Error('Video usage could not be verified.');
  const minutes = groups.reduce((sum, item) => sum + item.sum.minutesViewed, 0);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('Video usage could not be verified.');
  return minutes;
}

export async function listOwnedStreamVideos(userId) {
  // Used after an import timeout and during cleanup: the provider may have
  // accepted an import even when the application did not receive its UID.
  const videos = new Map(); let after = '';
  for (let page = 0; page < 1000; page++) {
    const query = new URLSearchParams({ creator: streamCreator(userId), limit: '1000', asc: 'true', ...(after ? { after } : {}) });
    const rows = await cloudflare('accounts/' + streamAccount() + '/stream?' + query);
    if (!Array.isArray(rows)) throw new Error('Provider video reconciliation is unavailable.');
    for (const row of rows) videos.set(row.uid, row);
    if (rows.length < 1000) return [...videos.values()];
    const last = rows.at(-1)?.created;
    if (!last || last === after) throw new Error('Provider video pagination could not be completed.');
    // Overlap one millisecond and deduplicate to avoid dropping equal-time rows.
    after = new Date(new Date(last).getTime() - 1).toISOString();
  }
  throw new Error('Provider video reconciliation exceeded its page limit.');
}

export async function workersAI(model, input) {
  const account = process.env.CLOUDFLARE_AI_ACCOUNT_ID || '';
  if (!/^[a-f\d]{32}$/i.test(account) || !['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/openai/whisper-large-v3-turbo'].includes(model)) throw new Error('Video analysis is not configured.');
  return cloudflare('accounts/' + account + '/ai/run/' + model, { method: 'POST', token: process.env.CLOUDFLARE_AI_API_TOKEN, body: input });
}
