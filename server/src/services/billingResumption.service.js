import Subscription from '../models/Subscription.js';
import { billingConfigured, paystackRequest, validateConfiguredPlan } from './paystack.service.js';
import { proPlanCode, proPricing } from './billingPricing.service.js';
import { confirmScheduledResumption, recoverSubscriptionLink, subscriptionCredentials, stopRecurringSubscription } from './billingCancellation.service.js';

const fail = (message, status = 409, code) => Object.assign(new Error(message), { status, code });
const stoppedStatuses = ['non-renewing', 'cancelled', 'canceled', 'complete', 'completed'];

// A canceled Paystack subscription cannot reliably be enabled again. Keep its paid
// record intact and create a separate schedule, with the first debit after paid access.
export async function restartSubscriptionRenewals(user) {
  if (!billingConfigured()) throw fail('Online billing is not available yet. Contact payment@veylo.com.ng.', 503);
  if (!user || user.accountStatus !== 'active') throw fail('This account is not available for billing.', 403);
  const now = new Date();
  const existing = await Subscription.findOne({ userId: user._id, resumesSubscriptionId: { $exists: true }, status: 'active', cancelPendingAt: null, providerCanceledAt: null }).sort({ createdAt: -1 }).select('+emailTokenEncrypted');
  if (existing) {
    if (existing.resumePendingAt) {
      if (existing.subscriptionCode) await confirmScheduledResumption(existing);
      else await recoverSubscriptionLink(existing);
    }
    return existing;
  }
  const source = await Subscription.findOne({ userId: user._id, provider: 'paystack', status: 'canceling', paidThrough: { $gt: now }, providerCanceledAt: { $ne: null }, cancelPendingAt: null, accountDeletedAt: null, subscriptionCode: { $exists: true, $ne: '' } }).sort({ paidThrough: -1 }).select('+emailTokenEncrypted');
  if (!source) throw fail('There is no paid subscription available to resume.');
  if (await Subscription.exists({ userId: user._id, provider: 'paystack', providerCanceledAt: null, $or: [{ subscriptionCode: { $exists: true, $ne: '' } }, { customerCode: { $exists: true } }, { status: 'checkout_pending' }] })) throw fail('Another billing schedule still needs confirmation. Review billing before resuming.');
  const { data } = await subscriptionCredentials(source);
  if (!stoppedStatuses.includes(data.status)) throw fail('Paystack has not confirmed that the previous renewal schedule stopped. Review billing before resuming.');
  if (data.customer?.customer_code !== source.customerCode || String(data.customer?.email || '').trim().toLowerCase() !== user.email.toLowerCase() || !data.customer?.id) throw fail('The saved payment details did not match this account. Contact payment@veylo.com.ng.');
  if (!data.authorization?.authorization_code || data.authorization.reusable !== true) throw fail('The saved payment method cannot be reused. You keep your paid access; start a new checkout after it ends.');
  const plan = await validateConfiguredPlan();
  const pricing = proPricing();
  for (let page = 1; page <= 10; page++) {
    const rows = await paystackRequest(`/subscription?customer=${encodeURIComponent(data.customer.id)}&perPage=100&page=${page}`);
    if (!Array.isArray(rows)) throw fail('Paystack could not confirm existing renewal schedules.', 502);
    if (rows.some(item => item.customer?.customer_code === source.customerCode && item.plan?.plan_code === proPlanCode() && !stoppedStatuses.includes(item.status))) throw fail('A renewal schedule already exists at Paystack. Contact payment@veylo.com.ng before starting another.');
    if (rows.length < 100) break;
    if (page === 10) throw fail('The renewal schedules need support review. Contact payment@veylo.com.ng.');
  }
  // Round forward to the provider's second precision, so the first debit cannot
  // fall inside the existing paid period. This record grants no additional access.
  const renewalStartsAt = new Date(Math.ceil(source.paidThrough.getTime() / 1000) * 1000);
  if (renewalStartsAt <= new Date()) throw fail('Your paid period has ended. Start a new checkout.');
  const renewal = await Subscription.create({ userId: user._id, status: 'active', customerCode: source.customerCode, customerProviderId: String(data.customer.id), planCode: proPlanCode(), planProviderId: String(plan.id), amountKobo: pricing.amountKobo, currency: pricing.currency, resumesSubscriptionId: source._id, renewalStartsAt, resumePendingAt: new Date(), billingPolicyVersion: '2026-10-07', billingPolicyAcceptedAt: new Date() });
  try {
    const created = await paystackRequest('/subscription', { method: 'POST', body: { customer: source.customerCode, plan: renewal.planCode, authorization: data.authorization.authorization_code, start_date: renewalStartsAt.toISOString() } });
    if (!/^SUB_[a-z0-9_]+$/i.test(created?.subscription_code || '') || created.subscription_code === source.subscriptionCode) throw fail('Paystack did not return a new renewal schedule.', 502);
    renewal.subscriptionCode = created.subscription_code;
    await renewal.save();
    await confirmScheduledResumption(renewal);
    return renewal;
  } catch (error) {
    if (renewal.subscriptionCode && error.code === 'SCHEDULE_MISMATCH') {
      await stopRecurringSubscription(renewal);
      throw fail('Paystack returned a different renewal schedule, so we stopped it. Your existing paid access is unchanged. Contact payment@veylo.com.ng.');
    }
    if (!renewal.subscriptionCode && error.providerStatus >= 400 && error.providerStatus < 500) {
      await Subscription.deleteOne({ _id: renewal._id });
      throw fail('Paystack could not restart renewals with the saved payment method. You keep your paid access; start a new checkout after it ends.');
    }
    throw fail('Renewal setup is awaiting confirmation. Check renewal status before trying again. No additional paid access has been added.', 502, 'RESUMPTION_PENDING');
  }
}
