export const VIDEO_DEFAULTS = Object.freeze({
  enabled: false, publicAvailable: false, uploadsEnabled: true, publishingEnabled: true,
  playbackEnabled: true, aiEnabled: true, maxVideos: 10, maxFileBytes: 5_000_000_000,
  maxDurationSeconds: 10_800, storedSeconds: 60_000, monthlyDeliveredMinutes: 5_000,
  accountTransfers: 2, platformTransfers: 100, platformEncodes: 100, accountViewers: 100,
  partBytes: 16 * 1024 * 1024, reservationHours: 24, recoveryDays: 30,
  tokenSeconds: 600, usageMaxLagSeconds: 1800, aiMonthlyBudgetUsd: 10,
  aiPlatformDailyBudgetUsd: 20, workerConcurrency: 2
});

const bounds = {
  maxVideos: [1, 10], maxFileBytes: [1, 5_000_000_000], maxDurationSeconds: [1, 10_800],
  storedSeconds: [60, 600_000], monthlyDeliveredMinutes: [1, 1_000_000],
  accountTransfers: [1, 2], platformTransfers: [1, 100], platformEncodes: [1, 100],
  accountViewers: [1, 1000], partBytes: [5 * 1024 * 1024, 32 * 1024 * 1024],
  reservationHours: [1, 72], recoveryDays: [1, 30], tokenSeconds: [300, 900],
  usageMaxLagSeconds: [300, 7200], aiMonthlyBudgetUsd: [0, 100],
  aiPlatformDailyBudgetUsd: [0, 1000], workerConcurrency: [1, 4]
};

export function normalizeVideoSettings(value = {}) {
  const result = { ...VIDEO_DEFAULTS };
  for (const [key, fallback] of Object.entries(result)) {
    if (typeof fallback === 'boolean') result[key] = typeof value[key] === 'boolean' ? value[key] : fallback;
    else if (Object.hasOwn(value, key)) {
      const number = Number(value[key]);
      const [min, max] = bounds[key];
      if (!Number.isFinite(number) || number < min || number > max) throw Object.assign(new Error('Invalid video setting: ' + key), { status: 400 });
      result[key] = key.includes('Usd') ? number : Math.floor(number);
    }
  }
  return result;
}

export function videoInfrastructure() {
  const has = names => names.every(name => Boolean(String(process.env[name] || '').trim()));
  return {
    storage: has(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']),
    stream: has(['CLOUDFLARE_STREAM_ACCOUNT_ID', 'CLOUDFLARE_STREAM_API_TOKEN', 'CLOUDFLARE_STREAM_CUSTOMER_CODE', 'CLOUDFLARE_STREAM_KEY_ID', 'CLOUDFLARE_STREAM_PRIVATE_KEY', 'CLOUDFLARE_STREAM_WEBHOOK_SECRET']),
    ai: has(['CLOUDFLARE_AI_ACCOUNT_ID', 'CLOUDFLARE_AI_API_TOKEN']) && process.env.VIDEO_AI_MODEL_READY === 'true',
    media: process.env.VIDEO_MEDIA_WORKER_ENABLED === 'true'
  };
}

export function publicVideoSettings(settings) {
  const infrastructure = videoInfrastructure();
  const configured = infrastructure.storage && infrastructure.stream && infrastructure.media;
  return { ...Object.fromEntries(['maxVideos', 'maxFileBytes', 'maxDurationSeconds', 'storedSeconds', 'monthlyDeliveredMinutes', 'accountTransfers', 'recoveryDays'].map(key => [key, settings[key]])),
    available: Boolean(settings.enabled && settings.publicAvailable && configured && process.env.VIDEO_DELIVERY_QUALIFIED === 'true'),
    configured, writeAvailable: Boolean(settings.enabled && configured), aiAvailable: Boolean(settings.aiEnabled && infrastructure.ai), playbackResolution: '1080p' };
}
