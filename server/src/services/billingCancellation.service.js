import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import { paystackRequest, decryptBillingToken, encryptBillingToken } from './paystack.service.js';
import { redactBillingSnapshot } from './billingPricing.service.js';

export async function recoverSubscriptionLink(subscription) {
  if (subscription.subscriptionCode || !subscription.customerProviderId) return subscription;
  const matches = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await paystackRequest(`/subscription?customer=${encodeURIComponent(subscription.customerProviderId)}&perPage=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error('Invalid provider subscription list.');
    matches.push(...rows.filter(item => item.customer?.customer_code === subscription.customerCode && item.plan?.plan_code === subscription.planCode && !['completed', 'cancelled', 'canceled'].includes(item.status)));
    if (rows.length < 100) break;
    if (page === 10) throw Object.assign(new Error('Subscription recovery needs support review.'), { status: 409 });
  }
  if (matches.length !== 1) throw Object.assign(new Error('The recurring schedule needs support review. Email payment@veylo.com.ng.'), { status: 409 });
  const match = matches[0];
  if (await Subscription.exists({ subscriptionCode: match.subscription_code, _id: { $ne: subscription._id } })) throw Object.assign(new Error('This recurring schedule is already linked to another checkout.'), { status: 409 });
  subscription.subscriptionCode = match.subscription_code;
  subscription.emailTokenEncrypted = encryptBillingToken(match.email_token);
  subscription.providerSnapshot = redactBillingSnapshot(match); await subscription.save();
  return subscription;
}

export async function subscriptionCredentials(subscription) {
  const data = await paystackRequest(`/subscription/${encodeURIComponent(subscription.subscriptionCode)}`);
  const customer = data.customer?.customer_code;
  const plan = data.plan?.plan_code;
  if ((subscription.customerCode && customer !== subscription.customerCode) || (subscription.planCode && plan !== subscription.planCode)) {
    throw Object.assign(new Error('The provider subscription did not match this account. Contact payment@veylo.com.ng.'), { status: 409 });
  }
  const token = data.email_token || decryptBillingToken(subscription.emailTokenEncrypted);
  if (token && data.email_token) {
    subscription.emailTokenEncrypted = encryptBillingToken(token);
    await subscription.save();
  }
  return { data, token };
}

export async function stopRecurringSubscription(subscription) {
  if (!subscription.subscriptionCode) return;
  subscription.cancelPendingAt ||= new Date();
  await subscription.save();
  const { data, token } = await subscriptionCredentials(subscription);
  if (!['non-renewing', 'cancelled', 'canceled', 'completed'].includes(data.status)) {
    if (!token) throw Object.assign(new Error('Cancellation needs provider support. Email payment@veylo.com.ng; renewal has not been confirmed as stopped.'), { status: 409 });
    await paystackRequest('/subscription/disable', { method: 'POST', body: { code: subscription.subscriptionCode, token } });
  }
  subscription.cancelRequestedAt ||= new Date();
  subscription.providerCanceledAt = new Date();
  subscription.cancelPendingAt = null;
  if (!['refunded', 'disputed'].includes(subscription.status)) subscription.status = subscription.paidThrough > new Date() ? 'canceling' : 'expired';
  await subscription.save();
}

export async function stopAccountRenewals(userId) {
  const linking = await Subscription.find({ userId, provider: 'paystack', subscriptionCode: { $exists: false }, customerCode: { $exists: true } });
  for (const item of linking) await recoverSubscriptionLink(item);
  const unlinked = await Subscription.exists({ userId, provider: 'paystack', status: { $in: ['active', 'past_due', 'canceling'] }, subscriptionCode: { $exists: false }, customerCode: { $exists: true } });
  if (unlinked) throw Object.assign(new Error('Your recurring schedule is still being linked. Refresh billing shortly or email payment@veylo.com.ng before changing the account.'), { status: 409 });
  // Check historical schedules too: a locally expired record can still renew at Paystack.
  const subscriptions = await Subscription.find({ userId, provider: 'paystack', subscriptionCode: { $exists: true, $ne: '' }, providerCanceledAt: null }).select('+emailTokenEncrypted');
  for (const subscription of subscriptions) await stopRecurringSubscription(subscription);
  const unresolved = await Payment.exists({ userId, status: 'pending' });
  if (unresolved) throw Object.assign(new Error('A payment is still pending. Confirm it on the billing page before changing this account. Contact payment@veylo.com.ng if it remains pending.'), { status: 409 });
  return subscriptions.map(item => item._id);
}
