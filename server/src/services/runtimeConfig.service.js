import RuntimeConfig from '../models/RuntimeConfig.js';
import { PLAN_DEFINITIONS } from '../config/plans.js';
import { DELIVERY_SOUNDTRACKS } from '../constants/deliverySoundtracks.js';
import { DEFAULT_NARRATION_VOICE_ID, NARRATION_VOICES } from '../constants/narrationVoices.js';

export const FORMAT_IDS = Object.freeze(['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign']);
export const FORMAT_LABELS = Object.freeze({
  'photo-story': 'Photo Story', editorial: 'Editorial Page', 'photo-reveal': 'Photo Reveal', canvas: 'Canvas', chapters: 'Chapters', album: 'Album', 'event-coverage': 'Event Coverage', campaign: 'Campaign'
});

// These are abuse backstops, not Free/Pro product quotas. Workflow limits are
// deliberately generous so a photographer can upload a full delivery, run
// revisions, and prepare several deliveries without being stopped by a hidden
// hourly counter. The middleware applies the right account/session key for
// each surface.
export const RATE_LIMIT_DEFAULTS = Object.freeze({
  authAttemptsPer15m: 30,
  registrationsPerHour: 20,
  emailCodesPerHour: 30,
  aiJobsPerMinute: 120,
  supportTicketsPerHour: 20,
  publicAccessPer15m: 600,
  publicMediaPerHour: 20_000,
  uploadsPerHour: 10_000,
  clientDeliveryEmailsPerHour: 100,
  billingActionsPerHour: 120,
  profileUpdatesPerHour: 120,
  analyticsEventsPer15m: 1_000
});

// Normal product actions must not be configurable below the safe starting
// point. Administrators can raise these values, while the security-only
// counters above remain adjustable for incident response.
const RATE_LIMIT_FLOORS = Object.freeze({
  aiJobsPerMinute: 120,
  publicAccessPer15m: 600,
  publicMediaPerHour: 20_000,
  uploadsPerHour: 10_000,
  clientDeliveryEmailsPerHour: 100,
  billingActionsPerHour: 120,
  profileUpdatesPerHour: 120,
  analyticsEventsPer15m: 1_000
});

function normalizedRateLimits(value = {}) {
  return Object.fromEntries(Object.keys(RATE_LIMIT_DEFAULTS).map(key => {
    const parsed = Number(value?.[key]);
    const floor = RATE_LIMIT_FLOORS[key] || 1;
    return [key, Number.isFinite(parsed) && parsed >= floor ? Math.round(parsed) : RATE_LIMIT_DEFAULTS[key]];
  }));
}

let cache = { expiresAt: 0, value: null, pending: null };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (!base || typeof base !== 'object') return override === undefined ? base : override;
  const output = { ...base };
  if (override && typeof override === 'object' && !Array.isArray(override)) for (const [key, value] of Object.entries(override)) output[key] = key in output ? merge(output[key], value) : value;
  return output;
}

function providerState() {
  return {
    ai: { provider: 'Alibaba Model Studio', configured: Boolean(process.env.ALIBABA_MODEL_STUDIO_API_KEY && process.env.ALIBABA_WORKSPACE_ID), model: process.env.ALIBABA_CREATIVE_MODEL || 'deepseek-v4.1-flash', visionModel: process.env.ALIBABA_VISION_MODEL || process.env.ALIBABA_CREATIVE_MODEL || 'deepseek-v4.1-flash' },
    narration: { provider: 'Deepgram Flux', configured: Boolean(process.env.DEEPGRAM_API_KEY), defaultVoiceId: DEFAULT_NARRATION_VOICE_ID },
    email: { provider: 'Resend', configured: Boolean(process.env.RESEND_API_KEY), from: process.env.RESEND_FROM_EMAIL || 'Veylo <info@veylo.com.ng>' },
    billing: { provider: 'Paystack', configured: Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PRO_PLAN_CODE), enabled: process.env.BILLING_ENABLED === 'true' },
    cloudinary: { provider: 'Cloudinary', configured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) }
  };
}

export function defaultRuntimeConfig() {
  return {
    key: 'global',
    plans: clone(PLAN_DEFINITIONS),
    formats: Object.fromEntries(FORMAT_IDS.map(id => [id, { id, label: FORMAT_LABELS[id], enabled: true }])),
    featureFlags: {
      deliveryPipeline: process.env.DELIVERY_PIPELINE_ENABLED === 'true',
      portfolio: true,
      music: true,
      narration: true,
      volumeDeliveries: true,
    optionalAnalytics: true
    },
    maintenance: { enabled: false, message: 'Veylo is briefly offline for maintenance. Please try again shortly.' },
    providers: providerState(),
    narration: { enabled: true, provider: 'Deepgram Flux', defaultVoiceId: DEFAULT_NARRATION_VOICE_ID, voices: NARRATION_VOICES.map(voice => ({ id: voice.id, name: voice.name, presentation: voice.presentation, tone: voice.tone, bestFor: voice.bestFor })) },
    music: { enabled: true, catalogueCount: DELIVERY_SOUNDTRACKS.length, licence: 'Pixabay Content License', source: 'Pixabay', verifiedCatalogue: true },
    retention: { proRetentionDays: 30, orphanUploadHours: 2, workerIntervalHours: 6, analyticsRetentionDays: 365 },
    rateLimits: normalizedRateLimits(),
    emailTemplates: [
      { id: 'verification', label: 'Email verification', enabled: true },
      { id: 'password-reset', label: 'Password reset', enabled: true },
      { id: 'welcome', label: 'Welcome', enabled: true },
      { id: 'password-changed', label: 'Password changed', enabled: true },
      { id: 'story-ready', label: 'Delivery ready', enabled: true },
      { id: 'volume-access', label: 'Volume access code', enabled: true }
    ]
  };
}

function applyDerivedValues(config) {
  const output = { ...config, providers: providerState() };
  output.rateLimits = normalizedRateLimits(config.rateLimits);
  output.music = { ...(config.music || {}), catalogueCount: DELIVERY_SOUNDTRACKS.length, source: 'Pixabay', licence: 'Pixabay Content License', verifiedCatalogue: true };
  output.narration = { ...(config.narration || {}), voices: NARRATION_VOICES.map(voice => ({ id: voice.id, name: voice.name, presentation: voice.presentation, tone: voice.tone, bestFor: voice.bestFor })) };
  return output;
}

export async function getRuntimeConfig({ fresh = false } = {}) {
  if (!fresh && cache.value && cache.expiresAt > Date.now()) return clone(cache.value);
  if (!fresh && cache.pending) return clone(await cache.pending);
  const load = RuntimeConfig.findOne({ key: 'global' }).lean().then(stored => applyDerivedValues(merge(defaultRuntimeConfig(), stored || {}))).catch(error => {
    if (process.env.NODE_ENV !== 'test') console.error('[runtime-config]', error.message);
    return applyDerivedValues(defaultRuntimeConfig());
  });
  if (!fresh) cache.pending = load;
  const value = await load;
  cache = { value, expiresAt: Date.now() + 30_000, pending: null };
  return clone(value);
}

export async function updateRuntimeConfig(patch, adminId) {
  const update = { ...patch, updatedBy: adminId };
  const stored = await RuntimeConfig.findOneAndUpdate({ key: 'global' }, { $set: update, $setOnInsert: { key: 'global' } }, { new: true, upsert: true, runValidators: true }).lean();
  cache = { expiresAt: 0, value: null, pending: null };
  return applyDerivedValues(merge(defaultRuntimeConfig(), stored));
}

export async function isRuntimeFeatureEnabled(flag, fallback = true) {
  const config = await getRuntimeConfig();
  return config.featureFlags?.[flag] === undefined ? fallback : Boolean(config.featureFlags[flag]);
}

export async function emailTemplateEnabled(kind) {
  const config = await getRuntimeConfig();
  const template = (config.emailTemplates || []).find(item => item.id === kind);
  return template ? template.enabled !== false : true;
}

export async function maintenanceState() {
  const config = await getRuntimeConfig();
  return config.maintenance || { enabled: false, message: '' };
}
