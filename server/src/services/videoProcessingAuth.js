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

let wakePending;
let wakeAt = 0;
let wakeTimer;
let wakeAgain = false;
export function wakeVideoProcessing() {
  if (!cloudflareVideoProcessing() || !processingConfigured()) return;
  if (wakePending) { wakeAgain = true; return; }
  if (wakeTimer) return;
  let target;
  try {
    const configured = process.env.VIDEO_PROCESSING_WORKER_URL;
    const media = new URL(process.env.VIDEO_PLAYBACK_WORKER_URL || process.env.R2_IMAGE_WORKER_URL);
    const account = /^[a-z\d-]+\.([a-z\d-]+\.workers\.dev)$/i.exec(media.hostname)?.[1];
    target = new URL(configured || (account ? `https://veylo-video-processing.${account}` : ''));
    if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) return;
  } catch { return; }
  // Upload confirmation must not wait for a cold container to boot. Cron still
  // recovers the durable queue if the immediate wake-up is interrupted. Briefly
  // coalesce a batch, then send a trailing wake if more uploads arrived.
  wakeTimer = setTimeout(() => {
    wakeTimer = null; wakeAt = Date.now();
    wakePending = fetch(target.origin + '/dispatch', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + process.env.VIDEO_PROCESSING_SECRET } })
      .then(response => response.body?.cancel()).catch(() => {}).finally(() => {
        wakePending = null;
        if (wakeAgain) { wakeAgain = false; wakeVideoProcessing(); }
      });
  }, Math.max(100, 1000 - (Date.now() - wakeAt)));
  wakeTimer.unref?.();
}

export function videoReadinessFilter(now = Date.now()) {
  const fresh = { heartbeatAt: { $gt: new Date(now - 120_000) }, status: { $in: ['idle', 'busy'] } };
  if (!cloudflareVideoProcessing()) return { workerName: 'video', ...fresh };
  // A coordinator can be healthy while all encoders are asleep. Its capability
  // proof must come from a booted container, never from a deployment flag.
  return { workerName: 'video-coordinator', instance: 'cloudflare', ...fresh,
    'details.verifiedAt': { $gt: new Date(now - 86400_000), $lte: new Date(now) } };
}
