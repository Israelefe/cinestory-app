import { API_BASE_URL } from '../config/env.js';

export const ANALYTICS_CONSENT_KEY = 'veylo_cookie_preferences_v1';
const SESSION_KEY = 'veylo_analytics_session_v1';
const CONSENT_EVENT = 'veylo:analytics-consent-changed';
const blockedKey = /password|passcode|pin|token|secret|credential|email|phone|client.?name|studio.?name|full.?name|caption|brief|message|content|signed.?url|original.?filename|filename|photo|pixel|audio|keystroke/i;

let queue = [];
let flushTimer = null;
let installed = false;

function safeStorage(kind) {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch { return null; }
}

export function getAnalyticsConsent() {
  if (typeof window === 'undefined') return false;
  try { return JSON.parse(safeStorage('local')?.getItem(ANALYTICS_CONSENT_KEY) || 'null')?.analytics === true; } catch { return false; }
}

export function setAnalyticsConsent(enabled) {
  if (typeof window === 'undefined') return;
  try {
    const storage = safeStorage('local');
    const current = JSON.parse(storage?.getItem(ANALYTICS_CONSENT_KEY) || '{}');
    storage?.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ ...current, necessary: true, analytics: Boolean(enabled), version: 2, savedAt: new Date().toISOString() }));
  } catch {}
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function onAnalyticsConsentChange(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

function sessionId() {
  const storage = safeStorage('session');
  if (!storage) return '';
  try {
    let value = storage.getItem(SESSION_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      storage.setItem(SESSION_KEY, value.slice(0, 160));
    }
    return value;
  } catch { return ''; }
}

function cleanValue(value, depth = 0) {
  if (depth > 2 || value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.slice(0, 120);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(item => cleanValue(item, depth + 1)).filter(item => item !== undefined);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !blockedKey.test(key)).slice(0, 20).map(([key, item]) => [key.slice(0, 50), cleanValue(item, depth + 1)]).filter(([, item]) => item !== undefined));
  return undefined;
}

function routePath() {
  return typeof window === 'undefined' ? '' : `${window.location.pathname}`.slice(0, 200);
}

function browserContext() {
  if (typeof window === 'undefined') return {};
  const userAgent = navigator.userAgent || '';
  const browser = userAgent.match(/(Edg|Chrome|Firefox|Safari|Opera|OPR)\/([\d.]+)/i)?.[1] || 'unknown';
  const operatingSystem = userAgent.match(/(Windows NT|Mac OS X|Android|iPhone|iPad|Linux)/i)?.[1] || 'unknown';
  const width = Number(window.innerWidth || 0);
  const deviceType = width < 641 ? 'mobile' : width < 1025 ? 'tablet' : 'desktop';
  const connection = navigator.connection?.effectiveType || navigator.connection?.type || 'unknown';
  const query = new URLSearchParams(window.location.search || '');
  const referrerHost = (() => {
    try { return document.referrer ? new URL(document.referrer).hostname.slice(0, 100) : ''; } catch { return ''; }
  })();
  const utmSource = String(query.get('utm_source') || '').trim().slice(0, 80);
  const utmCampaign = String(query.get('utm_campaign') || '').trim().slice(0, 100);
  const acquisitionSource = utmSource || (referrerHost ? 'referral' : 'direct');
  return { deviceType, browser, operatingSystem, viewport: `${width}x${Number(window.innerHeight || 0)}`.slice(0, 30), connection: String(connection).slice(0, 30), acquisitionSource, utmSource, utmCampaign, referrerHost };
}

function csrfCookie() {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find(item => item.startsWith('veylo_csrf='))?.split('=').slice(1).join('=') || '';
}

async function flush() {
  flushTimer = null;
  if (!queue.length || !getAnalyticsConsent()) { queue = []; return; }
  const batch = queue.splice(0, 50);
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/v1/analytics/events`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-Veylo-Analytics-Consent': 'granted', ...(csrfCookie() ? { 'X-CSRF-Token': csrfCookie() } : {}) },
      body: JSON.stringify({ events: batch })
    });
    if (!response.ok && response.status !== 202) queue = [...batch.slice(-50), ...queue].slice(-100);
  } catch {
    queue = [...batch.slice(-50), ...queue].slice(-100);
  }
}

export function trackEvent(name, metadata = {}, fields = {}) {
  if (typeof window === 'undefined' || !getAnalyticsConsent() || !name) return;
  const safeName = String(name).trim().slice(0, 120);
  const context = browserContext();
  const event = {
    name: safeName,
    version: 1,
    sessionId: sessionId(),
    route: routePath(),
    ...context,
    ...Object.fromEntries(Object.entries(fields || {}).filter(([key]) => ['actorType', 'format', 'status', 'errorCode', 'durationMs', 'count', 'bytes'].includes(key))),
    metadata: cleanValue({ ...context, ...metadata }) || {}
  };
  queue.push(event);
  if (queue.length >= 25) void flush();
  else if (!flushTimer) flushTimer = window.setTimeout(() => { void flush(); }, 750);
}

export function trackApiRequest({ path, status, durationMs, failed = false, errorCode = '' } = {}) {
  const safePath = String(path || '').split('?')[0].slice(0, 160);
  trackEvent(failed ? 'api.request.failed' : 'api.request.completed', { endpoint: safePath }, { status: String(status || ''), durationMs: Number(durationMs) || 0, errorCode: errorCode ? String(errorCode).slice(0, 80) : undefined });
}

export function installAnalyticsListeners() {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  const delegatedClick = event => {
    const element = event.target?.closest?.('[data-analytics-event]');
    if (!element) return;
    const metadata = {};
    for (const [key, value] of Object.entries(element.dataset || {})) if (key !== 'analyticsEvent' && !blockedKey.test(key)) metadata[key] = String(value).slice(0, 100);
    trackEvent(element.dataset.analyticsEvent, metadata);
  };
  const reportError = () => trackEvent('javascript.error', { source: 'window' }, { errorCode: 'UNCAUGHT_ERROR', status: 'failed' });
  const reportRejection = () => trackEvent('javascript.error', { source: 'promise' }, { errorCode: 'UNHANDLED_REJECTION', status: 'failed' });
  const reportMediaError = event => {
    const tag = String(event.target?.tagName || '').toLowerCase();
    if (tag === 'img') trackEvent('media.image.failed', { surface: event.target?.closest?.('[data-media-surface]')?.dataset?.mediaSurface || 'viewer' }, { status: 'failed', errorCode: 'IMAGE_LOAD_FAILED' });
    if (tag === 'audio') trackEvent('media.audio.failed', { surface: event.target?.closest?.('[data-media-surface]')?.dataset?.mediaSurface || 'viewer' }, { status: 'failed', errorCode: 'AUDIO_LOAD_FAILED' });
  };
  const reportVital = entry => {
    const value = Number(entry?.value ?? entry?.startTime ?? 0);
    trackEvent('core.web_vitals', { metric: entry?.name || 'unknown', value: Math.round(value * 100) / 100 }, { durationMs: Math.max(0, Math.round(value)), status: 'measured' });
  };
  document.addEventListener('click', delegatedClick, { passive: true });
  document.addEventListener('error', reportMediaError, { capture: true, passive: true });
  window.addEventListener('error', reportError);
  window.addEventListener('unhandledrejection', reportRejection);
  window.addEventListener('pagehide', () => { if (queue.length) void flush(); }, { passive: true });
  if (typeof PerformanceObserver !== 'undefined') {
    for (const type of ['largest-contentful-paint', 'layout-shift', 'event']) {
      try {
        const observer = new PerformanceObserver(list => {
          const entries = list.getEntries();
          if (entries.length) reportVital(entries[entries.length - 1]);
        });
        observer.observe({ type, buffered: true, ...(type === 'event' ? { durationThreshold: 40 } : {}) });
      } catch {}
    }
  }
}

export function flushAnalytics() {
  return flush();
}
