import crypto from 'crypto';
import { PRO_PRICE_KOBO } from '../config/plans.js';

const PAYSTACK_URL = 'https://api.paystack.co';

export function billingConfigured() {
  return process.env.BILLING_ENABLED === 'true' && Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PRO_PLAN_CODE && process.env.BILLING_ENCRYPTION_KEY);
}

function secretKey() {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    const error = new Error('Billing is not available yet.');
    error.status = 503;
    throw error;
  }
  return process.env.PAYSTACK_SECRET_KEY;
}

export async function paystackRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${PAYSTACK_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.status) {
    const error = new Error(payload.message || 'Paystack could not complete this request.');
    error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.providerStatus = response.status;
    throw error;
  }
  return payload.data;
}

let checkedPlan;
export async function validateConfiguredPlan() {
  if (checkedPlan && checkedPlan.expiresAt > Date.now()) return checkedPlan.data;
  const code = process.env.PAYSTACK_PRO_PLAN_CODE;
  if (!code) {
    const error = new Error('Billing is not available yet.');
    error.status = 503;
    throw error;
  }
  const plan = await paystackRequest(`/plan/${encodeURIComponent(code)}`);
  if (plan.interval !== 'monthly' || Number(plan.amount) !== PRO_PRICE_KOBO || plan.currency !== 'NGN') {
    const error = new Error('The configured Paystack plan must charge ₦25,000 monthly in NGN.');
    error.status = 503;
    throw error;
  }
  checkedPlan = { data: plan, expiresAt: Date.now() + 10 * 60 * 1000 };
  return plan;
}

export function verifyPaystackSignature(rawBody, signature) {
  if (!Buffer.isBuffer(rawBody) || !signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function encryptionKey() {
  const source = process.env.BILLING_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error('BILLING_ENCRYPTION_KEY must contain at least 32 characters.');
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptBillingToken(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString('base64url')).join('.');
}

export function decryptBillingToken(value) {
  if (!value) return '';
  const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
