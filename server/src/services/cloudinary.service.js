// Migration-only Cloudinary access. Production media paths use Cloudflare R2.
// This module remains isolated for the one-time media migration and old test fixtures.
import { v2 as cloudinary } from 'cloudinary';

function value(name) { return String(process.env[name] || '').trim(); }

export function configureCloudinary() {
  const cloudName = value('CLOUDINARY_CLOUD_NAME');
  const apiKey = value('CLOUDINARY_API_KEY');
  const apiSecret = value('CLOUDINARY_API_SECRET');
  if (!cloudName || !apiKey || !apiSecret) return false;
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true, hide_sensitive: true });
  return true;
}

export function cloudinaryErrorStatus(error) {
  return Number(error?.http_code || error?.error?.http_code) || undefined;
}

export function safeProviderError(error) {
  return { status: cloudinaryErrorStatus(error), code: /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'PROVIDER_REQUEST_FAILED' };
}

export async function checkCloudinaryConnection() {
  if (!configureCloudinary()) return { ok: false, reason: 'migration credentials are missing' };
  try { await cloudinary.api.ping(); return { ok: true }; }
  catch { return { ok: false, reason: 'Cloudinary rejected the migration connection' }; }
}

export { cloudinary };
