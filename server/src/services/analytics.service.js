import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { analyticsRoute, analyticsDigest, excludedAnalyticsUser, safeBrowserDiagnostic, browserFingerprint } from '../utils/analyticsPrivacy.js';
import { shouldForward } from './posthog.service.js';

// Analytics must describe product behaviour without becoming a second copy of
// the photographer's private work. These keys are never accepted in event
// metadata, even if a future caller accidentally passes them.
const blockedKey = /password|passcode|pin|token|secret|credential|email|phone|client.?name|studio.?name|full.?name|caption|brief|message|content|signed.?url|original.?filename|filename|photo|pixel|audio|keystroke|__proto__|constructor|prototype/i;

export function sanitizeAnalyticsMetadata(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    if (/https?:\/\/|@|Bearer\s|[?&](?:token|pin|password|secret)=/i.test(value)) return undefined;
    return value.startsWith('/') ? analyticsRoute(value) : value.slice(0, 180);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map(item => sanitizeAnalyticsMetadata(item, depth + 1)).filter(item => item !== undefined);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !blockedKey.test(key))
      .slice(0, 40)
      .map(([key, item]) => [key.slice(0, 60), sanitizeAnalyticsMetadata(item, depth + 1)])
      .filter(([, item]) => item !== undefined));
  }
  return undefined;
}

export async function recordAnalyticsEvent(input = {}) {
  if (!input.name) return null;
  const metadata = sanitizeAnalyticsMetadata(input.metadata || {});
  const diagnostic = input.name === 'javascript.error' ? safeBrowserDiagnostic(input.diagnostic) : undefined;
  const event = {
    name: String(input.name).trim().slice(0, 120),
    ...(input.occurredAt instanceof Date && Number.isFinite(+input.occurredAt) ? { occurredAt: input.occurredAt } : {}),
    ...(Number.isSafeInteger(input.sequence) ? { sequence: input.sequence } : {}),
    version: Number.isInteger(input.version) ? input.version : 1,
    source: ['client', 'server', 'system'].includes(input.source) ? input.source : 'server',
    actorType: ['photographer', 'client', 'guest', 'admin', 'system', 'anonymous'].includes(input.actorType) ? input.actorType : 'system',
    excluded: input.actorType === 'admin' || excludedAnalyticsUser(input.userId) || process.env.NODE_ENV === 'test',
    ...(input.flowKey ? { flowDigest: analyticsDigest(input.flowKey, 'flow') } : {}),
    ...(input.actorType === 'client' && /^\/(d|view|watch)\/[^/?#]+/.test(input.route || '') ? { resourceDigest: analyticsDigest(String(input.route).split(/[?#]/)[0].split('/').slice(0, 3).join('/'), 'client-delivery') } : {}),
    ...(input.eventKey ? { eventKey: analyticsDigest(input.eventKey, 'deduplication') } : {}),
    ...(diagnostic ? { diagnostic, fingerprint: browserFingerprint(diagnostic, input.route) } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
    ...(input.sessionDigest ? { sessionDigest: String(input.sessionDigest).slice(0, 128) } : {}),
    ...(input.visitorDigest ? { visitorDigest: String(input.visitorDigest).slice(0, 128) } : {}),
    ...(input.format ? { format: String(input.format).slice(0, 60) } : {}),
    ...(input.status ? { status: String(input.status).slice(0, 60) } : {}),
    ...(input.errorCode ? { errorCode: String(input.errorCode).slice(0, 120) } : {}),
    ...(input.route ? { route: analyticsRoute(input.route) } : {}),
    ...(input.deviceType ? { deviceType: String(input.deviceType).slice(0, 30) } : {}),
    ...(input.browser ? { browser: String(input.browser).slice(0, 80) } : {}),
    ...(input.operatingSystem ? { operatingSystem: String(input.operatingSystem).slice(0, 80) } : {}),
    ...(input.viewport ? { viewport: String(input.viewport).slice(0, 30) } : {}),
    ...(input.connection ? { connection: String(input.connection).slice(0, 30) } : {}),
    ...(input.trafficSource ? { trafficSource: String(input.trafficSource).slice(0, 80) } : {}),
    ...(input.trafficMedium ? { trafficMedium: String(input.trafficMedium).slice(0, 80) } : {}),
    ...(input.trafficCampaign ? { trafficCampaign: String(input.trafficCampaign).slice(0, 100) } : {}),
    ...(input.trafficTerm ? { trafficTerm: String(input.trafficTerm).slice(0, 100) } : {}),
    ...(input.trafficContent ? { trafficContent: String(input.trafficContent).slice(0, 100) } : {}),
    ...(input.referrerHost ? { referrerHost: String(input.referrerHost).slice(0, 100) } : {}),
    ...(input.landingPath ? { landingPath: analyticsRoute(input.landingPath) } : {}),
    ...(input.countryCode ? { countryCode: String(input.countryCode).trim().toUpperCase().slice(0, 3) } : {}),
    ...(input.regionCode ? { regionCode: String(input.regionCode).slice(0, 80) } : {}),
    ...(Number.isFinite(input.durationMs) ? { durationMs: Math.max(0, Math.min(86_400_000, Number(input.durationMs))) } : {}),
    ...(Number.isFinite(input.count) ? { count: Math.max(0, Math.min(1_000_000, Number(input.count))) } : {}),
    ...(Number.isFinite(input.bytes) ? { bytes: Math.max(0, Math.min(10_000_000_000_000, Number(input.bytes))) } : {}),
    ...(metadata && Object.keys(metadata).length ? { metadata } : {})
  };
  if (shouldForward(event)) Object.assign(event, { forwardState: 'pending', forwardAfter: new Date() });
  try { return await AnalyticsEvent.create(event); }
  catch (error) { if (error.code === 11000 && event.eventKey) return null; throw error; }
}

export function recordAnalyticsEventAsync(input = {}) {
  return void recordAnalyticsEvent(input).catch(error => {
    console.error('[analytics]', error.message);
  });
}
