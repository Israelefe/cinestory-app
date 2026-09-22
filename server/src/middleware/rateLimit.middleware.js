import crypto from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { getRuntimeConfig } from '../services/runtimeConfig.service.js';

/**
 * Rate limits protect the API from abuse; they are not photographer quotas.
 *
 * The old middleware put unrelated actions in the same small IP bucket. That
 * meant a studio, a shared office network, or a mobile carrier could block a
 * photographer's normal work. Authenticated work is now keyed to the account,
 * public work is keyed to the delivery/session, and only security-sensitive
 * endpoints keep intentionally tight limits.
 */

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
}

function clientIp(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || '0.0.0.0');
}

function accountKey(req) {
  const accountId = req.user?.id || req.user?._id || req.admin?.id || req.admin?._id;
  return accountId ? `account:${String(accountId)}` : `ip:${clientIp(req)}`;
}

function requestTarget(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return String(body.email || body.username || body.recipientCode || req.params?.publicId || req.params?.handle || '').trim().toLowerCase();
}

function securityIdentityKey(req, prefix) {
  const target = requestTarget(req);
  return `${prefix}:${target ? digest(target) : 'anonymous'}:${clientIp(req)}`;
}

function publicResourceKey(req) {
  const resource = req.params?.publicId || req.params?.handle || req.params?.trackId || req.route?.path || req.path || 'public';
  const visitor = req.cookies?.veylo_client || req.cookies?.veylo_volume_client || req.cookies?.veylo_story_visitor || req.cookies?.veylo_portfolio_client;
  return `public:${digest(resource)}:${visitor ? `visitor:${digest(visitor)}` : `ip:${clientIp(req)}`}`;
}

function analyticsKey(req) {
  const firstEvent = Array.isArray(req.body?.events) ? req.body.events[0] : null;
  const session = firstEvent?.sessionId || firstEvent?.visitorId;
  return session ? `analytics:${digest(session)}` : `analytics:${clientIp(req)}`;
}

function limiter({ windowMs, limit, message, configKey, keyGenerator = accountKey, identifier, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit: configKey ? async () => {
      const runtime = await getRuntimeConfig();
      return Math.max(1, Number(runtime.rateLimits?.[configKey]) || limit);
    } : limit,
    keyGenerator,
    identifier,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res) {
      res.set('Retry-After', String(Math.max(1, Math.ceil(windowMs / 1000))));
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', message });
    }
  });
}

// These limits only guard authentication and account-abuse surfaces. A
// successful sign-in does not consume the failed-attempt budget.
export const authAttemptLimit = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: 'Too many failed sign-in attempts. Please wait before trying again.',
  configKey: 'authAttemptsPer15m',
  keyGenerator: req => securityIdentityKey(req, 'auth'),
  identifier: 'auth-attempts',
  skipSuccessfulRequests: true
});

export const registrationLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Too many new-account attempts from this connection. Please try again later.',
  configKey: 'registrationsPerHour',
  keyGenerator: req => `registration:${clientIp(req)}`,
  identifier: 'registrations'
});

export const emailCodeLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: 'Too many code requests for this address. Please wait before requesting another one.',
  configKey: 'emailCodesPerHour',
  keyGenerator: req => securityIdentityKey(req, 'email-code'),
  identifier: 'email-codes'
});

// A generous per-account burst guard protects the AI provider without turning
// the photographer's delivery workflow into a hidden hourly quota. The real
// product entitlement remains the Free/Pro plan and the job queue controls
// concurrent provider work.
export const aiGenerationLimit = limiter({
  windowMs: 60 * 1000,
  limit: 120,
  message: 'Veylo is receiving many AI requests from this account. Please wait a moment and try again.',
  configKey: 'aiJobsPerMinute',
  identifier: 'ai-jobs-per-minute'
});

export const publicAccessLimit = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: 'This link is receiving many access requests. Please try again shortly.',
  configKey: 'publicAccessPer15m',
  keyGenerator: publicResourceKey,
  identifier: 'public-access'
});

export const clientDeliveryEmailLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 100,
  message: 'Many delivery emails were requested from this account. Please try again later.',
  configKey: 'clientDeliveryEmailsPerHour',
  identifier: 'delivery-emails'
});

// Viewer media is normally served by signed Cloudinary URLs. This high
// backstop is only for origin endpoints such as download tracking and audio;
// it must not behave like a gallery-size quota.
export const publicMediaLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20_000,
  message: 'This delivery is receiving an unusually high number of media requests. Please try again shortly.',
  configKey: 'publicMediaPerHour',
  keyGenerator: publicResourceKey,
  identifier: 'public-media'
});

export const mediaSignatureLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10_000,
  message: 'This account is preparing an unusually large number of uploads. Please try again shortly.',
  configKey: 'uploadsPerHour',
  identifier: 'upload-signatures'
});

export const billingActionLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  message: 'Many billing actions were requested. Please try again shortly.',
  configKey: 'billingActionsPerHour',
  identifier: 'billing-actions'
});

export const profileUpdateLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  message: 'Many profile changes were requested. Please try again shortly.',
  configKey: 'profileUpdatesPerHour',
  identifier: 'profile-updates'
});

export const supportTicketLimit = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Too many support requests were sent. Please try again later.',
  configKey: 'supportTicketsPerHour',
  keyGenerator: req => `support:${clientIp(req)}`,
  identifier: 'support-tickets'
});

// One request can contain up to 50 analytics events. This protects the
// collector without affecting the page or delivery action being measured.
export const clientAnalyticsLimit = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 1_000,
  message: 'Analytics collection is temporarily busy. Your Veylo action can continue.',
  configKey: 'analyticsEventsPer15m',
  keyGenerator: analyticsKey,
  identifier: 'client-analytics'
});
