import crypto from 'crypto';
import { z } from 'zod';
import { recordAnalyticsEvent } from '../services/analytics.service.js';
import { CLIENT_ANALYTICS_EVENT_SET } from '../constants/analyticsEvents.js';

const eventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  version: z.number().int().min(1).max(20).optional(),
  actorType: z.enum(['photographer', 'client', 'guest', 'anonymous']).optional(),
  sessionId: z.string().trim().min(8).max(160).optional(),
  visitorId: z.string().trim().min(8).max(160).optional(),
  format: z.string().trim().max(60).optional(),
  status: z.string().trim().max(60).optional(),
  errorCode: z.string().trim().max(120).optional(),
  route: z.string().trim().max(200).optional(),
  deviceType: z.string().trim().max(30).optional(),
  browser: z.string().trim().max(80).optional(),
  operatingSystem: z.string().trim().max(80).optional(),
  viewport: z.string().trim().max(30).optional(),
  connection: z.string().trim().max(30).optional(),
  acquisitionSource: z.string().trim().max(80).optional(),
  acquisitionMedium: z.string().trim().max(80).optional(),
  utmSource: z.string().trim().max(80).optional(),
  utmMedium: z.string().trim().max(80).optional(),
  utmCampaign: z.string().trim().max(100).optional(),
  utmTerm: z.string().trim().max(100).optional(),
  utmContent: z.string().trim().max(100).optional(),
  referrerHost: z.string().trim().max(100).optional(),
  landingPath: z.string().trim().max(200).optional(),
  durationMs: z.number().min(0).max(86_400_000).optional(),
  count: z.number().min(0).max(1_000_000).optional(),
  bytes: z.number().min(0).max(10_000_000_000_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();

const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(50) }).strict();

function digestIdentity(value, purpose) {
  if (!value) return undefined;
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'veylo-anonymous-analytics';
  return crypto.createHmac('sha256', secret).update(`${purpose}:${String(value)}`).digest('hex');
}

function edgeLocation(req) {
  const countryCode = String(req.get('cf-ipcountry') || req.get('x-vercel-ip-country') || req.get('x-country-code') || '').trim().toUpperCase();
  const regionCode = String(req.get('x-vercel-ip-country-region') || req.get('x-region-code') || '').trim();
  return {
    countryCode: /^[A-Z]{2,3}$/.test(countryCode) ? countryCode : undefined,
    regionCode: regionCode && /^[A-Za-z0-9_-]{1,80}$/.test(regionCode) ? regionCode : undefined
  };
}

function inferredActor(req, event) {
  if (req.user?.role === 'admin') return 'admin';
  if (req.user?.id) return 'photographer';
  return event.actorType || (String(event.name).startsWith('client.') || String(event.name).startsWith('volume.') ? 'client' : 'anonymous');
}

export async function collectClientAnalytics(req, res) {
  try {
    const parsed = batchSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'That analytics payload is not valid.' });
    const events = parsed.data.events.filter(event => CLIENT_ANALYTICS_EVENT_SET.has(event.name));
    if (!events.length) return res.status(202).json({ success: true, accepted: true, stored: 0 });
    const location = edgeLocation(req);
    await Promise.all(events.map(event => recordAnalyticsEvent({
      ...event,
      source: 'client',
      actorType: inferredActor(req, event),
      userId: req.user?.id,
      sessionDigest: digestIdentity(event.sessionId, 'session'),
      visitorDigest: digestIdentity(event.visitorId, 'visitor'),
      trafficSource: event.acquisitionSource || event.utmSource,
      trafficMedium: event.acquisitionMedium || event.utmMedium,
      trafficCampaign: event.utmCampaign,
      trafficTerm: event.utmTerm,
      trafficContent: event.utmContent,
      referrerHost: event.referrerHost,
      landingPath: event.landingPath,
      ...location
    })));
    return res.status(202).json({ success: true, accepted: true, stored: events.length });
  } catch (error) {
    console.error('[analytics/collect]', error.message);
    return res.status(500).json({ success: false, message: 'We could not record product analytics.' });
  }
}
