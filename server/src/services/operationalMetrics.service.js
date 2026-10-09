import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import OperationalIssue from '../models/OperationalIssue.js';

export const operationalInstance = `${os.hostname()}:${process.pid}`;
const buckets = new Map();
const MAX_ROUTES = 120;
const boundaries = [50, 100, 250, 500, 1000, 2000, 5000, 15000, Infinity];
let loop, memoryLimitBytes = null, previousCpu = process.cpuUsage(), previousAt = performance.now();
let latestProcess = null;
const issueBudget = new Map();

export function metricRoute(req) {
  // Express route templates exclude IDs, query strings, private links and filenames.
  return `${req.baseUrl || ''}${typeof req.route?.path === 'string' ? req.route.path : '/unmatched'}`.slice(0, 160);
}
export function recordRequest({ route, status, durationMs, now = Date.now() }) {
  const minute = Math.floor(now / 60000);
  for (const key of buckets.keys()) if (key < minute - 59) buckets.delete(key);
  if (!buckets.has(minute)) buckets.set(minute, new Map());
  const routes = buckets.get(minute);
  const key = routes.has(route) || routes.size < MAX_ROUTES ? route : '/other';
  const row = routes.get(key) || { route: key, count: 0, errors: 0, throttled: 0, durationMs: 0, histogram: boundaries.map(() => 0) };
  row.count++; row.errors += status >= 500 ? 1 : 0; row.throttled += status === 429 ? 1 : 0;
  row.durationMs += durationMs;
  row.histogram[boundaries.findIndex(boundary => durationMs <= boundary)]++;
  routes.set(key, row);
}
function percentile(histogram, percent) {
  const target = histogram.reduce((a, b) => a + b, 0) * percent;
  if (!target) return null;
  let accumulated = 0;
  for (let index = 0; index < histogram.length; index++) {
    accumulated += histogram[index];
    if (accumulated >= target) return Number.isFinite(boundaries[index]) ? boundaries[index] : 15000;
  }
  return null;
}
export function requestSnapshot(minutes = 5, now = Date.now()) {
  const cutoff = Math.floor(now / 60000) - minutes + 1;
  const rows = new Map();
  for (const [minute, routes] of buckets) if (minute >= cutoff) for (const row of routes.values()) {
    const total = rows.get(row.route) || { route: row.route, count: 0, errors: 0, throttled: 0, durationMs: 0, histogram: boundaries.map(() => 0) };
    for (const key of ['count', 'errors', 'throttled', 'durationMs']) total[key] += row[key];
    total.histogram = total.histogram.map((value, index) => value + row.histogram[index]); rows.set(row.route, total);
  }
  const routes = [...rows.values()].map(({ histogram, durationMs, ...row }) => ({ ...row, averageMs: Math.round(durationMs / row.count), p95Ms: percentile(histogram, .95), p99Ms: percentile(histogram, .99) }));
  const count = routes.reduce((sum, row) => sum + row.count, 0), errors = routes.reduce((sum, row) => sum + row.errors, 0);
  return { windowMinutes: minutes, count, errors, errorRate: count ? errors / count : 0, routes: routes.sort((a, b) => b.errors - a.errors || b.p95Ms - a.p95Ms).slice(0, MAX_ROUTES) };
}
export function requestMetricsMiddleware(req, res, next) {
  if (req.path.includes('/content-studio') || ['/health', '/ready'].includes(req.path)) return next();
  const started = performance.now();
  res.once('finish', () => {
    const route = `${req.method} ${metricRoute(req)}`;
    if (!req.path.startsWith('/api/v1/admin/')) recordRequest({ route, status: res.statusCode, durationMs: Math.max(0, performance.now() - started) });
    if (res.statusCode >= 500 && !req.operationalErrorCaptured) void captureOperationalError({ code: `HTTP_${res.statusCode}` }, { route });
  });
  next();
}
export function sampleProcess() {
  const now = performance.now(), cpu = process.cpuUsage(), elapsed = Math.max(1, now - previousAt);
  latestProcess = { sampledAt: new Date(), uptimeSeconds: Math.round(process.uptime()), rssBytes: process.memoryUsage().rss, heapBytes: process.memoryUsage().heapUsed, memoryLimitBytes,
    cpuPercent: Math.round((cpu.user - previousCpu.user + cpu.system - previousCpu.system) / (elapsed * 1000) * 1000) / 10,
    eventLoopP95Ms: loop ? Math.round(loop.percentile(95) / 1e6) : null };
  previousCpu = cpu; previousAt = now; loop?.reset();
  return latestProcess;
}
export async function startProcessMetrics() {
  if (loop) return;
  loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
  for (const path of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try { const limit = Number((await readFile(path, 'utf8')).trim()); if (Number.isFinite(limit) && limit > 0 && limit < os.totalmem() * 2) { memoryLimitBytes = limit; break; } } catch { /* Non-Linux hosts have no cgroup memory limit. */ }
  }
  sampleProcess();
}
export function processSnapshot() { return latestProcess || sampleProcess(); }
export function safeErrorDetails(error, route = '') {
  const code = /^[A-Z][A-Z0-9_]{1,79}$/.test(String(error?.code || '')) ? error.code : 'UNEXPECTED_ERROR';
  const frames = String(error?.stack || '').split('\n').slice(1).filter(line => /^\s*at /.test(line)).slice(0, 8)
    .map(line => line.replace(/https?:\/\/[^\s)]+/g, '[remote frame]').replace(/[^a-zA-Z0-9_./:\\()<> @-]/g, '').slice(0, 200));
  const safeRoute = String(route).split('?')[0].slice(0, 160);
  return { code, route: safeRoute, frames, fingerprint: crypto.createHash('sha256').update(`${code}:${safeRoute}:${frames[0] || ''}`).digest('hex') };
}
export async function captureOperationalError(error, { route = '', source = 'api' } = {}) {
  const details = safeErrorDetails(error, route), now = new Date();
  const minute = Math.floor(Date.now() / 60000);
  for (const [key, value] of issueBudget) if (value.minute !== minute) issueBudget.delete(key);
  const budget = issueBudget.get(details.fingerprint) || { minute, count: 0 };
  if (budget.count >= 30 || issueBudget.size >= 120 && !issueBudget.has(details.fingerprint)) return;
  budget.count++; issueBudget.set(details.fingerprint, budget);
  console.error(JSON.stringify({ level: 'error', source, code: details.code, route: details.route, fingerprint: details.fingerprint, instance: operationalInstance, at: now }));
  if (mongoose.connection.readyState !== 1) return;
  try {
    await OperationalIssue.updateOne({ fingerprint: details.fingerprint }, { $set: { code: details.code, route: details.route, frames: details.frames, source, lastSeenAt: now, expiresAt: new Date(Date.now() + 90 * 86400000), }, $inc: { occurrences: 1 }, $setOnInsert: { firstSeenAt: now, status: 'open' } }, { upsert: true });
    await OperationalIssue.updateOne({ fingerprint: details.fingerprint, status: 'resolved' }, { $set: { status: 'open', resolvedAt: null } });
  } catch { /* Telemetry cannot fail the original request. */ }
}
