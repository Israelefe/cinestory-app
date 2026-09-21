import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function securitySecret() {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error('OTP_SECRET or JWT_SECRET must be configured for administrator security.');
  return secret;
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) continue;
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function encryptionKey() {
  return crypto.createHash('sha256').update(securitySecret()).digest();
}

export function encryptAdminSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptAdminSecret(value) {
  const [ivPart, tagPart, encryptedPart] = String(value || '').split('.');
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('The administrator security secret is not valid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, 'base64url')), decipher.final()]).toString('utf8');
}

export function createTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function totpUri(secret, username) {
  const label = encodeURIComponent(`Veylo:${String(username || 'admin').trim()}`);
  const issuer = encodeURIComponent('Veylo');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function totpCode(secret, timestamp = Date.now()) {
  const counter = Math.floor(Number(timestamp) / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret, code, timestamp = Date.now()) {
  const cleanCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanCode) || !secret) return false;
  for (const offset of [-30_000, 0, 30_000]) {
    const expected = totpCode(secret, Number(timestamp) + offset);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanCode))) return true;
  }
  return false;
}

export function requestDeviceLabel(req) {
  const userAgent = String(req.get?.('user-agent') || '').trim();
  if (!userAgent) return 'Unknown browser';
  const browser = userAgent.match(/(Edg|Chrome|Firefox|Safari|Opera|OPR)\/([\d.]+)/i)?.[1] || 'Browser';
  const platform = userAgent.match(/(Windows NT|Mac OS X|Android|iPhone|iPad|Linux)/i)?.[1] || 'device';
  return `${browser} on ${platform}`.slice(0, 120);
}

export function requestIp(req) {
  return String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 100);
}

export function requestUserAgent(req) {
  return String(req.get?.('user-agent') || '').slice(0, 500);
}
