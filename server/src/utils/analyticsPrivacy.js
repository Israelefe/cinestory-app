import crypto from 'node:crypto';

const knownSegments = new Set(['api', 'v1', 'auth', 'signup', 'login', 'verify-email', 'onboarding', 'dashboard', 'delivery', 'deliveries', 'create', 'edit', 'publish', 'preview', 'view', 'watch', 'gallery', 'download', 'downloads', 'photos', 'billing', 'checkout', 'verify', 'pricing', 'support', 'tickets', 'portfolio', 'portfolios', 'storage', 'library', 'account', 'settings', 'demo', 'format-demo', 'event-coverage', 'campaign', 'editorial', 'photo-story', 'assistant', 'home', 'cancel', 'callback']);
export function analyticsRoute(value) {
  const path = String(value || '').split(/[?#]/)[0];
  if (!path.startsWith('/') || path.startsWith('//')) return '/other';
  return '/' + path.split('/').filter(Boolean).slice(0, 8).map(segment => knownSegments.has(segment) ? segment : ':id').join('/');
}
export function analyticsDigest(value, purpose = 'event') {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret || !value) return undefined;
  return crypto.createHmac('sha256', secret).update(`${purpose}:${String(value)}`).digest('hex');
}
export function excludedAnalyticsUser(userId) {
  return String(process.env.ANALYTICS_EXCLUDED_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean).includes(String(userId || ''));
}
const errorTypes = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'AggregateError', 'ChunkLoadError']);
export function safeBrowserDiagnostic(value) {
  if (!value || typeof value !== 'object') return undefined;
  const frames = (Array.isArray(value.frames) ? value.frames : []).slice(0, 8).filter(frame => /^\/assets\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,119}\.m?js$/.test(String(frame?.asset || ''))).map(frame => ({
    asset: frame.asset, line: Math.max(0, Math.min(10000000, Math.trunc(Number(frame.line) || 0))), column: Math.max(0, Math.min(10000000, Math.trunc(Number(frame.column) || 0))),
    ...(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(frame.chunkId || '') ? { chunkId: frame.chunkId } : {})
  }));
  return { type: errorTypes.has(value.type) ? value.type : 'Error', mechanism: ['window', 'promise', 'react'].includes(value.mechanism) ? value.mechanism : 'window',
    release: /^[a-zA-Z0-9._-]{1,80}$/.test(String(value.release || '')) ? value.release : 'unknown', frames };
}
export function browserFingerprint(diagnostic, route) {
  return crypto.createHash('sha256').update(JSON.stringify([diagnostic.type, diagnostic.mechanism, analyticsRoute(route), diagnostic.frames])).digest('hex');
}
