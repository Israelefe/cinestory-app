import crypto from 'node:crypto';
import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { excludedAnalyticsUser } from '../utils/analyticsPrivacy.js';

const events = new Set(['account.activated', 'upload.completed', 'upload.failed', 'delivery.publish.succeeded', 'delivery.publish.failed', 'billing.checkout.started', 'billing.payment.confirmed', 'client.delivery.opened', 'client.experience.started', 'client.photo.download.started', 'client.download.all.started', 'javascript.error', 'assistant.answer.completed', 'assistant.answer.failed']);
const allowedValues = { format: new Set(['photo-story', 'event-coverage', 'campaign', 'campaign-delivery', 'editorial', 'album', 'classic', 'gridboard', 'event', 'story', 'grid', 'slideshow', 'film']), status: new Set(['failed', 'error', 'confirmed', 'opened', 'completed', 'started', 'success', 'published', 'partial_failure']), errorCode: new Set(['BROWSER_EXCEPTION', 'UPLOAD_FAILED', 'IMAGE_LOAD_FAILED', 'AUDIO_LOAD_FAILED', 'DOWNLOAD_FAILED']), deviceType: new Set(['mobile', 'tablet', 'desktop']), browser: new Set(['Chrome', 'Firefox', 'Safari', 'Edg', 'Opera', 'OPR', 'unknown']), operatingSystem: new Set(['Windows NT', 'Mac OS X', 'Android', 'iPhone', 'iPad', 'Linux', 'unknown']), connection: new Set(['slow-2g', '2g', '3g', '4g', 'wifi', 'cellular', 'ethernet', 'unknown']) };
export function posthogConfiguration() {
  const enabled = process.env.POSTHOG_ENABLED === 'true';
  const host = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
  const configured = /^phc_[A-Za-z0-9_-]{10,200}$/.test(process.env.POSTHOG_PROJECT_TOKEN || '') && (process.env.POSTHOG_IDENTITY_SECRET || '').length >= 32 && ['https://eu.i.posthog.com', 'https://us.i.posthog.com'].includes(host);
  return { enabled, configured, host, status: !enabled ? 'disabled' : configured ? 'configured' : 'setup-needed' };
}
export function shouldForward(event) {
  const config = posthogConfiguration();
  return config.enabled && config.configured && !event.excluded && !excludedAnalyticsUser(event.userId) && !['admin', 'system'].includes(event.actorType) && events.has(event.name);
}
export function posthogPayload(event) {
  // Build a new allowlisted payload. Never export metadata, Mongo IDs, IPs,
  // attribution strings, query strings, error messages or request bodies.
  const identity = event.actorType === 'photographer' && event.userId ? `account:${event.userId}` : event.sessionDigest ? `session:${event.sessionDigest}` : `event:${event._id}`;
  const distinctId = crypto.createHmac('sha256', process.env.POSTHOG_IDENTITY_SECRET).update(identity).digest('hex');
  const properties = { distinct_id: distinctId, $process_person_profile: event.actorType === 'photographer', $geoip_disable: true, $insert_id: String(event._id), source: event.source, actor_type: event.actorType };
  for (const key of ['format', 'status', 'errorCode', 'deviceType', 'browser', 'operatingSystem', 'connection']) {
    if (allowedValues[key].has(event[key])) properties[key] = event[key];
  }
  for (const key of ['durationMs', 'count', 'bytes']) if (Number.isFinite(event[key])) properties[key] = event[key];
  if (event.diagnostic) {
    properties.$exception_list = [{ type: event.diagnostic.type, value: 'Browser exception; message excluded for privacy', mechanism: { type: event.diagnostic.mechanism, handled: event.diagnostic.mechanism === 'react' }, stacktrace: { frames: event.diagnostic.frames.map(frame => ({ filename: frame.asset, lineno: frame.line, colno: frame.column })) } }];
    properties.$exception_fingerprint = event.fingerprint;
    properties.release = event.diagnostic.release;
  }
  return { uuid: crypto.createHash('md5').update(String(event._id)).digest('hex').replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5'), event: event.diagnostic ? '$exception' : event.name, properties, timestamp: new Date(event.occurredAt).toISOString() };
}
export async function forwardPosthogBatch({ fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const config = posthogConfiguration();
  if (!config.enabled || !config.configured) return 0;
  await AnalyticsEvent.updateMany({ forwardState: 'sending', forwardAfter: { $lte: now }, forwardAttempts: { $gte: 8 } }, { $set: { forwardState: 'failed', forwardCode: 'RETRY_LIMIT_REACHED' } });
  const claimed = [];
  for (let i = 0; i < 25; i++) {
    const row = await AnalyticsEvent.findOneAndUpdate({ forwardState: { $in: ['pending', 'sending'] }, forwardAfter: { $lte: now }, forwardAttempts: { $lt: 8 } }, { $set: { forwardState: 'sending', forwardAfter: new Date(now.getTime() + 60000) }, $inc: { forwardAttempts: 1 } }, { new: true, sort: { forwardAfter: 1 } }).lean();
    if (!row) break;
    claimed.push(row);
  }
  if (!claimed.length) return 0;
  const eligible = claimed.filter(shouldForward);
  let code = '';
  try {
    if (eligible.length) {
      const result = await fetchImpl(`${config.host}/batch/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: process.env.POSTHOG_PROJECT_TOKEN, batch: eligible.map(posthogPayload) }), signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!result.ok) code = `HTTP_${result.status}`;
      else {
        const body = await result.json();
        if (body?.quota_limited?.length || body?.status === 0) code = 'INGESTION_REJECTED';
      }
    }
  } catch { code = 'DELIVERY_UNCONFIRMED'; }
  for (const row of claimed) {
    const selected = eligible.some(item => String(item._id) === String(row._id));
    if (!selected) { await AnalyticsEvent.updateOne({ _id: row._id, forwardState: 'sending', forwardAttempts: row.forwardAttempts }, { $set: { forwardState: 'skipped' } }); continue; }
    const failed = Boolean(code);
    await AnalyticsEvent.updateOne({ _id: row._id, forwardState: 'sending', forwardAttempts: row.forwardAttempts }, { $set: failed ? { forwardState: row.forwardAttempts >= 8 ? 'failed' : 'pending', forwardAfter: new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** row.forwardAttempts)), forwardCode: code } : { forwardState: 'sent', forwardedAt: now, forwardCode: '' } });
  }
  return eligible.length;
}
export function startPosthogWorker() {
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await forwardPosthogBatch(); } catch { console.error('[posthog] Event forwarding could not complete.'); } finally { busy = false; } };
  const timer = setInterval(tick, 15000); timer.unref(); void tick();
  return () => clearInterval(timer);
}
