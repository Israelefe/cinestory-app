import crypto from 'node:crypto';

export const REGIONAL_PRICES = Object.freeze({ nigeria: 2_500_000, international: 3_000_000 });
export function planForRegion(region) {
  return region === 'international' ? process.env.PAYSTACK_INTERNATIONAL_PLAN_CODE : process.env.PAYSTACK_PRO_PLAN_CODE;
}
export function regionalPrice(req) {
  const country = req.billingCountry || null;
  const region = country ? (country === 'NG' ? 'nigeria' : 'international') : 'unknown';
  const amountKobo = REGIONAL_PRICES[region] ?? null;
  return { region, country, currency: 'NGN', amountKobo, monthlyPriceNaira: amountKobo === null ? null : amountKobo / 100,
    alternatives: { nigeria: 25000, international: 30000 },
    quote: amountKobo === null ? null : `${region}:${amountKobo}` };
}
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
