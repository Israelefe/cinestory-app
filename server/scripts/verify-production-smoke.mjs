import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { DELIVERY_SOUNDTRACKS } from '../src/constants/deliverySoundtracks.js';

dotenv.config();

const baseUrl = String(process.env.SMOKE_BASE_URL || 'http://localhost:5050').replace(/\/$/, '');
const checks = [];
const skips = [];

async function request(path, options = {}) {
  const { raw = false, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...fetchOptions });
  const body = raw ? '' : await response.text();
  return { response, body };
}

function pass(name) {
  checks.push(name);
}

function skip(name, reason) {
  skips.push(`${name}: ${reason}`);
}

const health = await request('/health');
assert.equal(health.response.status, 200, `Health check returned ${health.response.status}`);
assert.match(health.body, /"status"\s*:\s*"healthy"/, 'Health response must identify a healthy API');
pass('health endpoint');

const allowedCors = await request('/api/v1/deliveries', {
  method: 'OPTIONS',
  headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' }
});
assert.equal(allowedCors.response.status, 204, `Allowed CORS preflight returned ${allowedCors.response.status}`);
assert.equal(allowedCors.response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
assert.equal(allowedCors.response.headers.get('access-control-allow-credentials'), 'true');
pass('allowed CORS preflight');

const blockedCors = await request('/api/v1/deliveries', {
  method: 'POST',
  headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
  body: '{}'
});
assert.equal(blockedCors.response.status, 403, `Blocked CORS request returned ${blockedCors.response.status}`);
pass('blocked CORS request');

const unauthenticated = await request('/api/v1/deliveries');
assert.equal(unauthenticated.response.status, 401, `Unauthenticated studio request returned ${unauthenticated.response.status}`);
assert.match(unauthenticated.body, /AUTH_REQUIRED/);
pass('authentication boundary');

const proxyRejected = await request('/api/v1/stories/proxy/audio-stream?url=https%3A%2F%2Fevil.example%2Faudio.mp3');
assert.equal(proxyRejected.response.status, 400, `Unapproved audio proxy host returned ${proxyRejected.response.status}`);
pass('legacy audio proxy allowlist');

const soundtrackId = DELIVERY_SOUNDTRACKS[0]?.id;
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
if (soundtrackId && jwtSecret) {
  const expiredToken = jwt.sign({ userId: 'smoke', scope: 'soundtrack-preview' }, jwtSecret, { expiresIn: -1, issuer: 'veylo-api', audience: 'veylo-catalog-media' });
  const expired = await request(`/api/v1/deliveries/soundtracks/${encodeURIComponent(soundtrackId)}/audio?token=${encodeURIComponent(expiredToken)}`);
  assert.equal(expired.response.status, 403, `Expired soundtrack token returned ${expired.response.status}`);

  const token = jwt.sign({ userId: 'smoke', scope: 'soundtrack-preview' }, jwtSecret, { expiresIn: '2h', issuer: 'veylo-api', audience: 'veylo-catalog-media' });
  const range = await request(`/api/v1/deliveries/soundtracks/${encodeURIComponent(soundtrackId)}/audio?token=${encodeURIComponent(token)}`, { headers: { Range: 'bytes=0-127' }, raw: true });
  assert.equal(range.response.status, 206, `Soundtrack range request returned ${range.response.status}`);
  assert.equal(range.response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(range.response.headers.get('content-range')?.startsWith('bytes 0-127/'), true);
  assert.equal((await range.response.arrayBuffer()).byteLength, 128);

  const badRange = await request(`/api/v1/deliveries/soundtracks/${encodeURIComponent(soundtrackId)}/audio?token=${encodeURIComponent(token)}`, { headers: { Range: 'bytes=not-a-range' } });
  assert.equal(badRange.response.status, 416, `Invalid soundtrack range returned ${badRange.response.status}`);
  pass('signed soundtrack access and byte ranges');
} else {
  skip('signed soundtrack access and byte ranges', 'JWT_SECRET or the catalogue is not configured');
}

const accessToken = String(process.env.SMOKE_ACCESS_TOKEN || '').trim();
if (accessToken) {
  const studio = await request('/api/v1/deliveries', { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(studio.response.status, 200, `Configured authenticated delivery request returned ${studio.response.status}`);
  pass('authenticated delivery list');
} else {
  skip('database-backed creation, review, publishing, and ownership flows', 'Set SMOKE_ACCESS_TOKEN to a disposable verified test session; no test credential was present.');
}

console.log(`Production smoke checks passed: ${checks.join(', ')}.`);
if (skips.length) console.log(`Skipped external-state checks: ${skips.join(' | ')}`);
