import crypto from 'node:crypto';
import { PRO_PRICE_KOBO, PRO_PRICE_NAIRA } from '../config/plans.js';

export const LEGACY_PRO_PRICES_KOBO = Object.freeze([2_500_000, 3_000_000]);
export const PRO_PRICING = Object.freeze({ currency: 'NGN', amountKobo: PRO_PRICE_KOBO, monthlyPriceNaira: PRO_PRICE_NAIRA, quote: `pro:${PRO_PRICE_KOBO}` });
export function proPlanCode() { return process.env.PAYSTACK_PRO_PLAN_CODE; }
export function proPricing() { return { ...PRO_PRICING }; }
export function redactBillingSnapshot(value) {
  if (Array.isArray(value)) return value.map(redactBillingSnapshot);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|authorization_code|signature|access_code|password|secret|card_number|account_number/i.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (key === 'authorization') { result[key] = { channel: item?.channel, brand: item?.brand, reusable: item?.reusable }; continue; }
    result[key] = redactBillingSnapshot(item);
  }
  return result;
}
export function billingEventIdentity(event) {
  const data = event.data || {};
  const identity = event.event === 'charge.success' ? data.reference
    : event.event?.startsWith('refund.') ? `${data.id || data.refund_reference || ''}:${data.transaction_reference || data.transaction?.reference || ''}:${data.amount || ''}`
    : data.invoice_code || data.id;
  // Lifecycle events can repeat in different cancellation cycles; include their provider timestamp.
  const material = identity ? `${event.event}:${identity}:${event.event?.startsWith('subscription.') ? data.updatedAt || data.updated_at || '' : ''}` : JSON.stringify(event);
  return crypto.createHash('sha256').update(material).digest('hex');
}
