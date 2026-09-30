import { v2 as cloudinary } from 'cloudinary';

function value(name) {
  return String(process.env[name] || '').trim();
}

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
  // SDK rejection objects can contain request authentication and signed URLs.
  return { status: cloudinaryErrorStatus(error), code: /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'PROVIDER_REQUEST_FAILED' };
}

export async function checkCloudinaryConnection() {
  if (!configureCloudinary()) return { ok: false, reason: 'one or more Cloudinary environment values are missing' };
  try {
    await cloudinary.api.ping();
    return { ok: true };
  } catch (error) {
    const reason = String(error?.message || error?.error?.message || 'Cloudinary rejected the connection')
      .replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]')
      .slice(0, 180);
    return { ok: false, reason };
  }
}

export { cloudinary };
