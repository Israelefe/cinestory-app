import crypto from 'node:crypto';

export function processingAuthorized(header, secret = process.env.VIDEO_PROCESSING_SECRET) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof header !== 'string' || header.length > 512) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from('Bearer ' + secret);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function cloudflareVideoProcessing() {
  return process.env.VIDEO_PROCESSING_MODE === 'cloudflare-containers';
}

export function processingConfigured() {
  if (!cloudflareVideoProcessing()) return true;
  return (process.env.VIDEO_PROCESSING_SECRET || '').length >= 32;
}

export function videoReadinessFilter(now = Date.now()) {
  const fresh = { heartbeatAt: { $gt: new Date(now - 120_000) }, status: { $in: ['idle', 'busy'] } };
  if (!cloudflareVideoProcessing()) return { workerName: 'video', ...fresh };
  // A coordinator can be healthy while all encoders are asleep. Its capability
  // proof must come from a booted container, never from a deployment flag.
  return { workerName: 'video-coordinator', instance: 'cloudflare', ...fresh,
    'details.verifiedAt': { $gt: new Date(now - 86400_000), $lte: new Date(now) } };
}
