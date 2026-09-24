import { Resend } from 'resend';
import EmailDelivery from '../models/EmailDelivery.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';
import { emailTemplateEnabled } from './runtimeConfig.service.js';

let client;

function resend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
  client ||= new Resend(process.env.RESEND_API_KEY);
  return client;
}

function appUrl() {
  return String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '');
}

function logoUrl() {
  return `${appUrl()}/veylo/veylo-logo.png`;
}

function fromAddress() {
  const configured = String(process.env.RESEND_FROM_EMAIL || 'info@veylo.com.ng').trim();
  const address = configured.match(/<([^>]+)>/)?.[1] || configured;
  return `Veylo <${address.trim()}>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function safeUrl(value = '') {
  try {
    const parsed = new URL(String(value), appUrl());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : appUrl();
  } catch {
    return appUrl();
  }
}

function firstName(value = 'there') {
  return escapeHtml(String(value).trim().split(/\s+/)[0] || 'there');
}

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(date);
}

function naira(amountKobo = 0) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(amountKobo || 0) / 100);
}

function shell(content, { preheader = '' } = {}) {
  const safePreheader = escapeHtml(preheader);
  return `<div style="margin:0;background:#070709;padding:24px 12px;color:#f1efe9;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${safePreheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto;border:1px solid #29292f;background:#0c0c10"><tr><td style="padding:28px 24px 22px;border-bottom:1px solid #29292f"><img src="${escapeHtml(logoUrl())}" width="132" height="36" alt="Veylo" style="display:block;width:132px;height:36px;object-fit:contain;object-position:left center;border:0"></td></tr><tr><td style="padding:32px 24px 36px">${content}</td></tr><tr><td style="padding:20px 24px;border-top:1px solid #29292f;color:#817c76;font-size:12px;line-height:1.7">Don’t just deliver photos. Showcase them.<br><a href="${escapeHtml(appUrl())}" style="color:#ff9b8e;text-decoration:none">veylo.com.ng</a></td></tr></table></div>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 14px;color:#b8b1aa;line-height:1.75">${text}</p>`;
}

function button(label, url) {
  return `<a href="${escapeHtml(safeUrl(url))}" style="display:inline-block;margin-top:12px;background:#ff5a47;color:#100c0b;padding:14px 22px;text-decoration:none;font-size:13px;font-weight:700">${escapeHtml(label)}</a>`;
}

async function send(kind, message) {
  try {
    if (!(await emailTemplateEnabled(kind))) {
      console.info(`[email/${kind}] disabled by runtime configuration`);
      return null;
    }
    const { data, error } = await resend().emails.send({
      from: fromAddress(),
      ...message
    });
    if (error) {
      console.error(`[email/${kind}] rejected`, error.name || error.statusCode || 'provider_error', error.message || 'Email could not be sent.');
      const failure = new Error(error.message || 'Email could not be sent.');
      failure.code = error.name || 'EMAIL_PROVIDER_REJECTED';
      throw failure;
    }
    recordAnalyticsEventAsync({ name: 'email.send.succeeded', source: 'server', actorType: 'system', status: 'accepted', metadata: { kind } });
    console.info(`[email/${kind}] accepted`, data?.id || 'no_delivery_id');
    return data;
  } catch (error) {
    recordAnalyticsEventAsync({ name: 'email.send.failed', source: 'server', actorType: 'system', status: 'failed', errorCode: error.code || 'EMAIL_SEND_FAILED', metadata: { kind } });
    throw error;
  }
}

/**
 * Sends an event-keyed email at most once while still allowing a failed send
 * to be retried. This protects Paystack webhook retries and duplicate browser
 * requests from sending the same receipt or invitation twice.
 */
export async function sendOnce({ eventKey, kind, to, userId, deliveryId, subject, text, html }) {
  const recipientEmail = String(to || '').trim().toLowerCase();
  if (!eventKey || !recipientEmail) throw new Error('An email event key and recipient are required.');
  let record;
  try {
    record = await EmailDelivery.findOneAndUpdate(
      { eventKey: String(eventKey).slice(0, 240) },
      { $setOnInsert: { eventKey: String(eventKey).slice(0, 240), kind, recipientEmail, ...(userId ? { userId } : {}), ...(deliveryId ? { deliveryId } : {}), status: 'pending', attempts: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    record = await EmailDelivery.findOne({ eventKey: String(eventKey).slice(0, 240) });
  }
  if (!record) throw new Error('The email delivery record could not be created.');
  if (['sent', 'skipped'].includes(record.status)) return { sent: false, duplicate: true, status: record.status };

  const now = new Date();
  const claimed = await EmailDelivery.findOneAndUpdate(
    {
      _id: record._id,
      $or: [
        { status: 'pending' },
        { status: 'failed' },
        { status: 'sending', leaseUntil: { $lte: now } },
        { status: 'sending', leaseUntil: { $exists: false } }
      ]
    },
    { $set: { status: 'sending', leaseUntil: new Date(now.getTime() + 10 * 60 * 1000), failure: null }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!claimed) return { sent: false, duplicate: true, status: record.status };

  try {
    const result = await send(kind, { to: recipientEmail, subject, text, html });
    if (!result) {
      await EmailDelivery.updateOne({ _id: claimed._id }, { $set: { status: 'skipped', skippedAt: new Date() }, $unset: { leaseUntil: 1 } });
      return { sent: false, skipped: true, status: 'skipped' };
    }
    await EmailDelivery.updateOne({ _id: claimed._id }, { $set: { status: 'sent', sentAt: new Date(), providerId: result.id || '' }, $unset: { leaseUntil: 1, failure: 1 } });
    return { sent: true, providerId: result.id || null, status: 'sent' };
  } catch (error) {
    await EmailDelivery.updateOne({ _id: claimed._id }, { $set: { status: 'failed', failure: String(error.message || 'Email could not be sent.').slice(0, 500) }, $unset: { leaseUntil: 1 } });
    throw error;
  }
}

export function sendVerificationEmail({ to, name, code }) {
  const safeCode = escapeHtml(code);
  return send('verification', {
    to,
    subject: `${code} is your Veylo verification code`,
    text: `Hi ${name}, your Veylo verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">VERIFY YOUR EMAIL</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">One quick step, ${firstName(name)}.</h1>${paragraph('Enter this code in Veylo to confirm your email address and finish setting up your account.')}<p style="margin:28px 0;padding:20px;border:1px solid #ff9b8e55;background:#ff9b8e0b;color:#fff;font-size:34px;font-weight:700;letter-spacing:10px;text-align:center">${safeCode}</p>${paragraph('<span style="color:#8f8983;font-size:13px">This code expires in 10 minutes. If you did not create this account, you can ignore this email.</span>')}`, { preheader: `Your Veylo verification code is ${code}.` })
  });
}

export function sendPasswordResetEmail({ to, name, code }) {
  const safeCode = escapeHtml(code);
  return send('password-reset', {
    to,
    subject: `${code} is your Veylo password reset code`,
    text: `Hi ${name}, your Veylo password reset code is ${code}. It expires in 10 minutes. If you did not request this, leave your password unchanged.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">PASSWORD RESET</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Choose a new password.</h1>${paragraph(`Hi ${firstName(name)}, enter this code to continue resetting your Veylo password.`)}<p style="margin:28px 0;padding:20px;border:1px solid #ff9b8e55;background:#ff9b8e0b;color:#fff;font-size:34px;font-weight:700;letter-spacing:10px;text-align:center">${safeCode}</p>${paragraph('<span style="color:#8f8983;font-size:13px">This code expires in 10 minutes. If you did not request a reset, leave your password unchanged.</span>')}`, { preheader: `Your Veylo password reset code is ${code}.` })
  });
}

export function sendWelcomeEmail({ to, name }) {
  const rawFirstName = String(name).trim().split(/\s+/)[0].replace(/[\r\n]/g, '') || 'there';
  const first = escapeHtml(rawFirstName);
  const url = `${appUrl()}/onboarding`;
  return send('welcome', {
    to,
    subject: `Welcome to Veylo, ${rawFirstName}`,
    text: `Hi ${rawFirstName}, welcome to Veylo. Set up your studio, then prepare your first client delivery: ${url}`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">YOUR VEYLO ACCOUNT IS READY</p><h1 style="margin:0 0 18px;font-size:30px;font-weight:500">Welcome to Veylo, ${first}.</h1>${paragraph('Your finished photographs deserve a better handover than a cold folder link. Veylo helps you prepare a delivery your client will enjoy opening.')}<div style="margin:24px 0;padding:18px;border:1px solid #29292f;background:#111116"><p style="margin:0 0 9px;color:#fff;font-weight:700">Start here</p><p style="margin:0;color:#a8a19a;line-height:1.7;font-size:13px">Add your studio details, upload a finished shoot, and choose the way your client should experience it.</p></div>${button('Set up your studio', url)}`, { preheader: 'Your Veylo account is ready. Set up your studio and prepare your first delivery.' })
  });
}

export function sendPasswordChangedEmail({ to, name }) {
  return send('password-changed', {
    to,
    subject: 'Your Veylo password was changed',
    text: `Hi ${name}, your Veylo password was changed and your previous sessions were signed out. If this was not you, contact info@veylo.com.ng.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">ACCOUNT SECURITY</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your password was changed.</h1>${paragraph(`Hi ${firstName(name)}, your Veylo password has been updated and your previous sessions have been signed out.`)}${paragraph('<span style="color:#8f8983;font-size:13px">If this was not you, contact <a style="color:#ff9b8e" href="mailto:info@veylo.com.ng">info@veylo.com.ng</a> as soon as possible.</span>')}`, { preheader: 'Your Veylo password was changed.' })
  });
}

export async function sendStoryReadyEmail({ to, clientName, storyTitle, storyUrl, photographerName }) {
  const safeTitle = escapeHtml(storyTitle || 'your photographs');
  const sender = photographerName ? ` prepared by ${escapeHtml(photographerName)}` : '';
  return send('story-ready', {
    to,
    subject: `Your photographs are ready — ${storyTitle}`,
    text: `${clientName}, your photographs${sender} are ready. Open your delivery: ${storyUrl}`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">YOUR PHOTOGRAPHS ARE READY</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your delivery is ready.</h1>${paragraph(`${escapeHtml(clientName)}, your photographs${sender} are ready to open.`)}${paragraph(`The delivery is called <strong style="color:#fff">${safeTitle}</strong>. Open it when you have a quiet moment.`)}${button('Open your delivery', storyUrl)}${paragraph('<span style="display:block;margin-top:16px;color:#8f8983;font-size:13px">If your photographer gave you a PIN, keep it nearby. Veylo will ask for it before opening a protected delivery.</span>')}`, { preheader: `${clientName}, your photographs are ready to open.` })
  });
}

export function sendVolumeAccessEmail({ to, name, code, organisation }) {
  const safeName = firstName(name);
  const safeOrganisation = escapeHtml(organisation || 'your photo gallery');
  const safeCode = escapeHtml(code);
  return send('volume-access', {
    to,
    subject: `${code} opens your private photo gallery`,
    text: `Hi ${name}, use ${code} to open your private ${organisation || 'photo'} gallery. It expires in 10 minutes.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">PRIVATE GALLERY ACCESS</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your access code is ready.</h1>${paragraph(`Hi ${safeName}, enter this code to see the photographs assigned to you from ${safeOrganisation}.`)}<p style="margin:28px 0;padding:20px;border:1px solid #ff9b8e55;background:#ff9b8e0b;color:#fff;font-size:34px;font-weight:700;letter-spacing:10px;text-align:center">${safeCode}</p>${paragraph('<span style="color:#8f8983;font-size:13px">The code expires in 10 minutes. Do not forward it to anyone else.</span>')}`, { preheader: `Your private gallery access code is ${code}.` })
  });
}

export function sendShareGrantEmail({ to, role, label, deliveryTitle, clientName, shareUrl, expiresAt, usageTerms, userId, deliveryId, eventKey }) {
  const safeRole = escapeHtml(role || 'guest');
  const safeLabel = escapeHtml(label || 'private link');
  const expiry = expiresAt ? `This link expires ${escapeHtml(displayDate(expiresAt))}.` : 'This link does not have a scheduled expiry.';
  const terms = usageTerms ? `<div style="margin:22px 0;padding:16px;border:1px solid #29292f;background:#111116"><p style="margin:0 0 7px;color:#fff;font-weight:700">Usage terms</p><p style="margin:0;color:#a8a19a;line-height:1.7;font-size:13px">${escapeHtml(usageTerms)}</p></div>` : '';
  return sendOnce({
    eventKey: eventKey || `share-grant:${deliveryId}:${label}:${to}`,
    kind: 'share-invitation',
    to,
    userId,
    deliveryId,
    subject: `A private ${safeRole} photo link from Veylo`,
    text: `You have been given a private ${role || 'guest'} link for ${deliveryTitle || 'a photo delivery'}${clientName ? ` for ${clientName}` : ''}. Open it here: ${shareUrl}. ${expiry}${usageTerms ? ` Usage terms: ${usageTerms}` : ''}`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">PRIVATE EVENT ACCESS</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your private photo link is ready.</h1>${paragraph(`You have been given a <strong style="color:#fff">${safeRole}</strong> link for <strong style="color:#fff">${safeLabel}</strong>.`)}${deliveryTitle ? paragraph(`Delivery: <strong style="color:#fff">${escapeHtml(deliveryTitle)}</strong>${clientName ? ` for ${escapeHtml(clientName)}` : ''}.`) : ''}${terms}${paragraph(`<span style="color:#8f8983;font-size:13px">${expiry} Keep this link private and share the photographs only under the agreed terms.</span>`)}${button('Open private link', shareUrl)}`, { preheader: `Your private ${role || 'guest'} photo link is ready.` })
  });
}

export function sendProWelcomeEmail({ to, name, amountKobo, paidAt, paidThrough, reference, userId }) {
  const first = firstName(name);
  const billingUrl = `${appUrl()}/billing`;
  return sendOnce({
    eventKey: `billing:pro-welcome:${reference || userId}`,
    kind: 'pro-welcome',
    to,
    userId,
    subject: 'Welcome to Veylo Pro — your payment went through',
    text: `Hi ${name}, welcome to Veylo Pro. We received your ${naira(amountKobo)} payment on ${displayDate(paidAt)}. Your access is active through ${displayDate(paidThrough)}. Manage billing: ${billingUrl}`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">VEYLO PRO</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Welcome to Pro, ${first}.</h1>${paragraph('Your payment went through and Pro access is now active on your account.')}<div style="margin:24px 0;padding:18px;border:1px solid #29292f;background:#111116"><p style="margin:0 0 9px;color:#fff;font-weight:700">Payment received</p><p style="margin:0;color:#a8a19a;line-height:1.8;font-size:13px">${naira(amountKobo)} · ${escapeHtml(displayDate(paidAt))}<br>Pro access through ${escapeHtml(displayDate(paidThrough))}</p></div>${paragraph('You can now prepare larger deliveries, use studio presentation features, and keep your client handover in one place.')} ${button('Open billing', billingUrl)}`, { preheader: 'Welcome to Veylo Pro. Your payment was received and access is active.' })
  });
}

export function sendPaymentReceiptEmail({ to, name, amountKobo, paidAt, paidThrough, reference, userId }) {
  return sendOnce({
    eventKey: `billing:payment-receipt:${reference || userId}:${paidAt || ''}`,
    kind: 'payment-success',
    to,
    userId,
    subject: 'Veylo Pro payment received',
    text: `Hi ${name}, we received your Veylo Pro payment of ${naira(amountKobo)} on ${displayDate(paidAt)}. Your access is active through ${displayDate(paidThrough)}. Reference: ${reference || 'not available'}.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">PAYMENT RECEIVED</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your Pro renewal is confirmed.</h1>${paragraph(`Hi ${firstName(name)}, we received your Veylo Pro payment.`)}<div style="margin:24px 0;padding:18px;border:1px solid #29292f;background:#111116"><p style="margin:0;color:#a8a19a;line-height:1.8;font-size:13px">Amount: <strong style="color:#fff">${escapeHtml(naira(amountKobo))}</strong><br>Paid: ${escapeHtml(displayDate(paidAt))}<br>Access through: ${escapeHtml(displayDate(paidThrough))}<br>Reference: ${escapeHtml(reference || '—')}</p></div>`, { preheader: 'Your Veylo Pro renewal payment was received.' })
  });
}

export function sendPaymentFailedEmail({ to, name, reference, amountKobo, userId }) {
  return sendOnce({
    eventKey: `billing:payment-failed:${reference || userId}`,
    kind: 'payment-failed',
    to,
    userId,
    subject: 'Your Veylo Pro payment did not go through',
    text: `Hi ${name}, Paystack could not complete your Veylo Pro payment${amountKobo ? ` of ${naira(amountKobo)}` : ''}. No Pro access was added. Open Veylo billing to try again: ${appUrl()}/billing`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">PAYMENT NOT COMPLETED</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">We could not complete that payment.</h1>${paragraph(`Hi ${firstName(name)}, Paystack did not confirm your Veylo Pro payment${amountKobo ? ` of <strong style="color:#fff">${escapeHtml(naira(amountKobo))}</strong>` : ''}. Pro access was not added.`)}${paragraph('You can try again from your Veylo billing page. If your bank shows a charge, wait for Paystack to reverse it or contact us with your payment reference.')}${button('Open billing', `${appUrl()}/billing`)}`, { preheader: 'Your Veylo Pro payment was not completed.' })
  });
}

export function sendRenewalFailedEmail({ to, name, graceEndsAt, userId, eventKey }) {
  return sendOnce({
    eventKey: eventKey || `billing:renewal-failed:${userId}:${graceEndsAt || ''}`,
    kind: 'renewal-failed',
    to,
    userId,
    subject: 'Your Veylo Pro renewal needs attention',
    text: `Hi ${name}, your Veylo Pro renewal did not go through. Your current access remains active during the payment grace period, which ends ${displayDate(graceEndsAt)}. Update billing: ${appUrl()}/billing`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">RENEWAL NEEDS ATTENTION</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your Pro renewal did not go through.</h1>${paragraph(`Hi ${firstName(name)}, Paystack could not collect your latest Veylo Pro renewal.`)}${paragraph(`Your current Pro access remains available during the grace period. It ends <strong style="color:#fff">${escapeHtml(displayDate(graceEndsAt))}</strong> if the payment is not corrected.`)}${button('Review billing', `${appUrl()}/billing`)}${paragraph('<span style="display:block;margin-top:16px;color:#8f8983;font-size:13px">If your bank already shows a charge, do not pay again immediately. Contact support with the payment reference.</span>')}`, { preheader: `Your Pro renewal needs attention before ${displayDate(graceEndsAt)}.` })
  });
}

export function sendSubscriptionCancellationEmail({ to, name, paidThrough, userId, eventKey }) {
  return sendOnce({
    eventKey: eventKey || `billing:subscription-cancelled:${userId}`,
    kind: 'subscription-canceled',
    to,
    userId,
    subject: 'Your Veylo Pro subscription is set to end',
    text: `Hi ${name}, your Veylo Pro subscription will not renew. You keep Pro access through ${displayDate(paidThrough)}. You can resume it from Veylo billing before then: ${appUrl()}/billing`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">SUBSCRIPTION UPDATE</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your subscription will not renew.</h1>${paragraph(`Hi ${firstName(name)}, your Veylo Pro subscription has been cancelled for renewal.`)}${paragraph(`Nothing changes today. You keep Pro access through <strong style="color:#fff">${escapeHtml(displayDate(paidThrough))}</strong>.`)}${button('Review billing', `${appUrl()}/billing`)}`, { preheader: `Your Veylo Pro access continues through ${displayDate(paidThrough)}.` })
  });
}

export function sendSubscriptionResumedEmail({ to, name, paidThrough, userId, eventKey }) {
  return sendOnce({
    eventKey: eventKey || `billing:subscription-resumed:${userId}:${paidThrough || ''}`,
    kind: 'subscription-resumed',
    to,
    userId,
    subject: 'Your Veylo Pro subscription will continue',
    text: `Hi ${name}, your Veylo Pro subscription will continue and Pro access remains active. Your current period ends ${displayDate(paidThrough)}.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">SUBSCRIPTION RESUMED</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your Pro subscription will continue.</h1>${paragraph(`Hi ${firstName(name)}, your cancellation has been reversed. Pro access remains active.`)}${paragraph(`Your current paid period ends <strong style="color:#fff">${escapeHtml(displayDate(paidThrough))}</strong>.`)}`, { preheader: 'Your Veylo Pro subscription will continue.' })
  });
}

export function sendProEndedEmail({ to, name, retentionUntil, userId, eventKey }) {
  return sendOnce({
    eventKey: eventKey || `billing:pro-ended:${userId}:${retentionUntil || ''}`,
    kind: 'pro-ended',
    to,
    userId,
    subject: 'Your Veylo Pro access has ended',
    text: `Hi ${name}, your Veylo Pro access has ended because the renewal was not completed. Veylo will keep your Pro delivery data until ${displayDate(retentionUntil)}. Review billing: ${appUrl()}/billing`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">PRO ACCESS UPDATE</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your Pro access has ended.</h1>${paragraph(`Hi ${firstName(name)}, your Veylo Pro access ended because the renewal was not completed.`)}${paragraph(`Your Pro delivery data remains in its retention window until <strong style="color:#fff">${escapeHtml(displayDate(retentionUntil))}</strong>. Review billing if you want to restore Pro access.`)}${button('Open billing', `${appUrl()}/billing`)}`, { preheader: 'Your Veylo Pro access has ended.' })
  });
}

export function sendRefundProcessedEmail({ to, name, amountKobo, reference, userId, eventKey }) {
  return sendOnce({
    eventKey: eventKey || `billing:refund-processed:${reference || userId}:${amountKobo}`,
    kind: 'refund-completed',
    to,
    userId,
    subject: 'Your Veylo refund has been processed',
    text: `Hi ${name}, Paystack confirmed a ${naira(amountKobo)} refund for your Veylo payment${reference ? ` (${reference})` : ''}. It may take a few business days to appear with your bank.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">REFUND PROCESSED</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your refund is on its way.</h1>${paragraph(`Hi ${firstName(name)}, Paystack confirmed a refund of <strong style="color:#fff">${escapeHtml(naira(amountKobo))}</strong> for your Veylo payment.`)}${paragraph('Your bank may take a few business days to show the funds. If you do not see it after that, contact your bank with the payment reference.')}${reference ? paragraph(`<span style="color:#8f8983;font-size:13px">Reference: ${escapeHtml(reference)}</span>`) : ''}`, { preheader: `Paystack confirmed your ${naira(amountKobo)} Veylo refund.` })
  });
}

export function sendRefundFailedEmail({ to, name, reference, userId, eventKey }) {
  return sendOnce({
    eventKey: eventKey || `billing:refund-failed:${reference || userId}`,
    kind: 'refund-failed',
    to,
    userId,
    subject: 'Your Veylo refund needs attention',
    text: `Hi ${name}, Paystack could not complete your Veylo refund yet. Veylo is reviewing it and will try again. Payment reference: ${reference || 'not available'}.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">REFUND UPDATE</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your refund needs attention.</h1>${paragraph(`Hi ${firstName(name)}, Paystack could not complete your refund yet. The Veylo team has the failed request and will review it.`)}${reference ? paragraph(`<span style="color:#8f8983;font-size:13px">Payment reference: ${escapeHtml(reference)}</span>`) : ''}${paragraph('<span style="color:#8f8983;font-size:13px">You do not need to submit another request. Contact info@veylo.com.ng if you have questions.</span>')}`, { preheader: 'Your Veylo refund needs attention.' })
  });
}

export function sendPaymentDisputeEmail({ to, name, reference, userId, eventKey }) {
  return sendOnce({
    eventKey: eventKey || `billing:payment-dispute:${reference || userId}`,
    kind: 'payment-dispute',
    to,
    userId,
    subject: 'There is a payment dispute on your Veylo account',
    text: `Hi ${name}, Paystack reported a dispute for your Veylo payment${reference ? ` (${reference})` : ''}. Veylo may pause the related Pro access while the payment is reviewed. Contact info@veylo.com.ng if this is unexpected.`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">PAYMENT REVIEW</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">We received a payment dispute.</h1>${paragraph(`Hi ${firstName(name)}, Paystack reported a dispute for a Veylo payment${reference ? ` with reference <strong style="color:#fff">${escapeHtml(reference)}</strong>` : ''}.`)}${paragraph('The related Pro access may be paused while the payment is reviewed. If this is unexpected, contact <a style="color:#ff9b8e" href="mailto:info@veylo.com.ng">info@veylo.com.ng</a>.')}`, { preheader: 'Paystack reported a payment dispute for your Veylo account.' })
  });
}

export function sendDeliveryViewedEmail({ to, photographerName, clientName, deliveryTitle, deliveryId, dashboardUrl }) {
  const safeClient = escapeHtml(clientName || 'Your client');
  const safeTitle = escapeHtml(deliveryTitle || 'photographs');
  const first = firstName(photographerName);
  const targetUrl = safeUrl(dashboardUrl || `${appUrl()}/dashboard`);
  return sendOnce({
    eventKey: `delivery:viewed:${deliveryId}:${new Date().toISOString().slice(0, 10)}`,
    kind: 'delivery-viewed',
    to,
    deliveryId,
    subject: `${clientName ? `${clientName} just opened their photographs` : `Your delivery "${deliveryTitle}" was just opened`}`,
    text: `Hi ${photographerName || 'there'}, ${clientName ? `${clientName} just opened their photo delivery` : 'someone just opened your photo delivery'} ("${deliveryTitle}"). View your dashboard: ${targetUrl}`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">DELIVERY OPENED</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">${safeClient} opened their photos.</h1>${paragraph(`Hi ${first}, your delivery <strong style="color:#fff">${safeTitle}</strong> was just opened.`)}${paragraph('You can check viewing details and guest activity directly from your dashboard.')}${button('View delivery dashboard', targetUrl)}`, { preheader: `${safeClient} just opened their photos.` })
  });
}

export function sendDeliveryDownloadedEmail({ to, photographerName, clientName, deliveryTitle, deliveryId, dashboardUrl }) {
  const safeClient = escapeHtml(clientName || 'Your client');
  const safeTitle = escapeHtml(deliveryTitle || 'photographs');
  const first = firstName(photographerName);
  const targetUrl = safeUrl(dashboardUrl || `${appUrl()}/dashboard`);
  return sendOnce({
    eventKey: `delivery:first-download:${deliveryId}`,
    kind: 'delivery-downloaded',
    to,
    deliveryId,
    subject: `First download started for ${deliveryTitle || 'your delivery'}`,
    text: `Hi ${photographerName || 'there'}, the first photograph from "${deliveryTitle}" was just downloaded. View your dashboard: ${targetUrl}`,
    html: shell(`<p style="margin:0 0 14px;color:#ff9b8e;font-size:11px;font-weight:700;letter-spacing:1.6px">DOWNLOAD STARTED</p><h1 style="margin:0 0 16px;font-size:30px;font-weight:500">First photograph downloaded.</h1>${paragraph(`Hi ${first}, someone just started downloading photographs from <strong style="color:#fff">${safeTitle}</strong>${clientName ? ` (${safeClient})` : ''}.`)}${paragraph('You can monitor download activity from your dashboard.')}${button('View delivery dashboard', targetUrl)}`, { preheader: `First download started for ${safeTitle}.` })
  });
}
