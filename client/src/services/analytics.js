import { API_BASE_URL } from '../config/env.js';

export const ANALYTICS_CONSENT_KEY = 'veylo_cookie_preferences_v1';
const SESSION_KEY = 'veylo_analytics_session_v1';
const VISITOR_KEY = 'veylo_analytics_visitor_v1';
const LANDING_PATH_KEY = 'veylo_analytics_landing_path_v1';
const CONSENT_EVENT = 'veylo:analytics-consent-changed';
const blockedKey = /password|passcode|pin|token|secret|credential|email|phone|client.?name|studio.?name|full.?name|caption|brief|message|content|signed.?url|original.?filename|filename|photo|pixel|audio|keystroke/i;

let queue = [];
let flushTimer = null;
let installed = false;

function safeStorage(kind) {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch { return null; }
}

export function getAnalyticsConsent() {
  // Service analytics is part of Veylo's first-party operation. Keep this
  // export for older callers, but do not gate event collection on a banner
  // choice. The banner now explains the measurement instead of blocking it.
  return typeof window !== 'undefined';
}

export function setAnalyticsConsent(enabled) {
  if (typeof window === 'undefined') return;
  try {
    const storage = safeStorage('local');
    const current = JSON.parse(storage?.getItem(ANALYTICS_CONSENT_KEY) || '{}');
    storage?.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ ...current, necessary: true, analytics: true, serviceAnalytics: true, version: 3, savedAt: new Date().toISOString() }));
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

function visitorId() {
  const storage = safeStorage('local');
  if (!storage) return '';
  try {
    let value = storage.getItem(VISITOR_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      storage.setItem(VISITOR_KEY, value.slice(0, 160));
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

function storedAttribution(key) {
  if (typeof window === 'undefined') return '';
  try {
    return safeStorage('session')?.getItem(key) || safeStorage('local')?.getItem(key) || '';
  } catch { return ''; }
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
  const utmSource = String(query.get('utm_source') || storedAttribution('veylo_utm_source') || '').trim().slice(0, 80);
  const utmMedium = String(query.get('utm_medium') || storedAttribution('veylo_utm_medium') || '').trim().slice(0, 80);
  const utmCampaign = String(query.get('utm_campaign') || storedAttribution('veylo_utm_campaign') || '').trim().slice(0, 100);
  const utmTerm = String(query.get('utm_term') || storedAttribution('veylo_utm_term') || '').trim().slice(0, 100);
  const utmContent = String(query.get('utm_content') || storedAttribution('veylo_utm_content') || '').trim().slice(0, 100);
  const storedReferrer = storedAttribution('veylo_referrer_host');
  const safeReferrerHost = referrerHost || storedReferrer;
  const acquisitionSource = utmSource || (safeReferrerHost ? 'referral' : 'direct');
  const acquisitionMedium = utmMedium || (safeReferrerHost ? 'referral' : 'direct');
  const landingStorage = safeStorage('session');
  let landingPath = storedAttribution(LANDING_PATH_KEY);
  if (!landingPath) {
    landingPath = routePath();
    try { landingStorage?.setItem(LANDING_PATH_KEY, landingPath); } catch {}
  }
  return { deviceType, browser, operatingSystem, viewport: `${width}x${Number(window.innerHeight || 0)}`.slice(0, 30), connection: String(connection).slice(0, 30), acquisitionSource, acquisitionMedium, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, referrerHost: safeReferrerHost, landingPath };
}

function csrfCookie() {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find(item => item.startsWith('veylo_csrf='))?.split('=').slice(1).join('=') || '';
}

async function flush() {
  flushTimer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/v1/analytics/events`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(csrfCookie() ? { 'X-CSRF-Token': csrfCookie() } : {}) },
      body: JSON.stringify({ events: batch })
    });
    if (!response.ok && response.status !== 202) queue = [...batch.slice(-50), ...queue].slice(-100);
  } catch {
    queue = [...batch.slice(-50), ...queue].slice(-100);
  }
}

export function trackEvent(name, metadata = {}, fields = {}) {
  if (typeof window === 'undefined' || !name) return;
  const safeName = String(name).trim().slice(0, 120);
  const context = browserContext();
  const currentSessionId = sessionId();
  const currentVisitorId = visitorId();
  const event = {
    name: safeName,
    version: 1,
    ...(currentSessionId ? { sessionId: currentSessionId } : {}),
    ...(currentVisitorId ? { visitorId: currentVisitorId } : {}),
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
  const scrollMarks = new Set();
  const reportScrollDepth = () => {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
    for (const mark of [25, 50, 75, 90]) {
      if (depth >= mark && !scrollMarks.has(mark)) {
        scrollMarks.add(mark);
        trackEvent('page.scrolled', { depth: mark });
      }
    }
  };
  document.addEventListener('click', delegatedClick, { passive: true });
  document.addEventListener('error', reportMediaError, { capture: true, passive: true });
  window.addEventListener('error', reportError);
  window.addEventListener('unhandledrejection', reportRejection);
  window.addEventListener('scroll', reportScrollDepth, { passive: true });
  window.setTimeout(() => trackEvent('session.engaged', { trigger: 'ten_seconds' }, { durationMs: 10_000 }), 10_000);
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
