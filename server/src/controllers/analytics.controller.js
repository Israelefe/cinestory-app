import crypto from 'crypto';
import { z } from 'zod';
import { recordAnalyticsEvent } from '../services/analytics.service.js';
import { isRuntimeFeatureEnabled } from '../services/runtimeConfig.service.js';
import { CLIENT_ANALYTICS_EVENT_SET } from '../constants/analyticsEvents.js';

const eventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  version: z.number().int().min(1).max(20).optional(),
  actorType: z.enum(['photographer', 'client', 'guest', 'anonymous']).optional(),
  sessionId: z.string().trim().min(8).max(160).optional(),
  format: z.string().trim().max(60).optional(),
  status: z.string().trim().max(60).optional(),
  errorCode: z.string().trim().max(120).optional(),
  route: z.string().trim().max(200).optional(),
  deviceType: z.string().trim().max(30).optional(),
  browser: z.string().trim().max(80).optional(),
  operatingSystem: z.string().trim().max(80).optional(),
  viewport: z.string().trim().max(30).optional(),
  connection: z.string().trim().max(30).optional(),
  durationMs: z.number().min(0).max(86_400_000).optional(),
  count: z.number().min(0).max(1_000_000).optional(),
  bytes: z.number().min(0).max(10_000_000_000_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();

const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(50) }).strict();

function digestSession(value) {
  if (!value) return undefined;
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'veylo-anonymous-analytics';
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function inferredActor(req, event) {
  if (req.user?.role === 'admin') return 'admin';
  if (req.user?.id) return 'photographer';
  return event.actorType || (String(event.name).startsWith('client.') || String(event.name).startsWith('volume.') ? 'client' : 'anonymous');
}

export async function collectClientAnalytics(req, res) {
  try {
    const enabled = await isRuntimeFeatureEnabled('optionalAnalytics', true);
    if (!enabled || req.get('x-veylo-analytics-consent') !== 'granted') return res.status(202).json({ success: true, accepted: false, stored: 0 });
    const parsed = batchSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'That analytics payload is not valid.' });
    const events = parsed.data.events.filter(event => CLIENT_ANALYTICS_EVENT_SET.has(event.name));
    if (!events.length) return res.status(202).json({ success: true, accepted: true, stored: 0 });
    await Promise.all(events.map(event => recordAnalyticsEvent({
      ...event,
      source: 'client',
      actorType: inferredActor(req, event),
      userId: req.user?.id,
      sessionDigest: digestSession(event.sessionId)
    })));
    return res.status(202).json({ success: true, accepted: true, stored: events.length });
  } catch (error) {
    console.error('[analytics/collect]', error.message);
    return res.status(500).json({ success: false, message: 'We could not record product analytics.' });
  }
}
