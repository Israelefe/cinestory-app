import { Resend } from 'resend';

let client;
function resend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
  client ||= new Resend(process.env.RESEND_API_KEY);
  return client;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function shell(content) {
  return `<div style="margin:0;background:#070709;padding:40px 18px;color:#f1efe9;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;border:1px solid #29292f;background:#0c0c10;padding:38px"><p style="margin:0 0 28px;color:#ff9b8e;font-size:12px;font-weight:700;letter-spacing:2px">VEYLO</p>${content}<p style="margin:34px 0 0;border-top:1px solid #29292f;padding-top:20px;color:#817c76;font-size:12px;line-height:1.7">Don’t just deliver photos. Showcase them.</p></div></div>`;
}

async function send(message) {
  const { data, error } = await resend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Veylo <hello@updates.veylo.com.ng>',
    ...message
  });
  if (error) throw new Error(error.message || 'Email could not be sent.');
  return data;
}

export function sendVerificationEmail({ to, name, code }) {
  const safeName = escapeHtml(name.split(' ')[0] || 'there');
  return send({
    to,
    subject: `${code} is your Veylo verification code`,
    text: `Hi ${name}, use ${code} to verify your Veylo email address. It expires in 10 minutes.`,
    html: shell(`<h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Confirm your email</h1><p style="color:#b8b1aa;line-height:1.75">Hi ${safeName}, enter this code to finish creating your Veylo account.</p><p style="margin:30px 0;padding:20px;border:1px solid #ff9b8e55;background:#ff9b8e0b;color:#fff;font-size:34px;font-weight:700;letter-spacing:10px;text-align:center">${code}</p><p style="color:#8f8983;font-size:13px;line-height:1.7">The code expires in 10 minutes. If you did not create this account, you can ignore this email.</p>`)
  });
}

export function sendPasswordResetEmail({ to, name, code }) {
  const safeName = escapeHtml(name.split(' ')[0] || 'there');
  return send({
    to,
    subject: `${code} is your Veylo password reset code`,
    text: `Hi ${name}, use ${code} to reset your Veylo password. It expires in 10 minutes.`,
    html: shell(`<h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Reset your password</h1><p style="color:#b8b1aa;line-height:1.75">Hi ${safeName}, enter this code to choose a new Veylo password.</p><p style="margin:30px 0;padding:20px;border:1px solid #ff9b8e55;background:#ff9b8e0b;color:#fff;font-size:34px;font-weight:700;letter-spacing:10px;text-align:center">${code}</p><p style="color:#8f8983;font-size:13px;line-height:1.7">The code expires in 10 minutes. If you did not request this, leave your password unchanged.</p>`)
  });
}

export function sendWelcomeEmail({ to, name }) {
  const firstName = escapeHtml(name.split(' ')[0] || 'there');
  const url = `${process.env.CLIENT_URL || 'https://veylo.com.ng'}/onboarding`;
  return send({
    to,
    subject: 'Your Veylo account is ready',
    text: `Welcome to Veylo, ${name}. Finish setting up your studio and create your first delivery: ${url}`,
    html: shell(`<h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Welcome to Veylo, ${firstName}.</h1><p style="color:#b8b1aa;line-height:1.75">Your account is ready. Tell us a little about your studio, then you can prepare your first client delivery.</p><a href="${url}" style="display:inline-block;margin-top:24px;background:#ff5a47;color:#100c0b;padding:14px 22px;text-decoration:none;font-size:13px;font-weight:700">Finish setting up</a>`)
  });
}

export function sendPasswordChangedEmail({ to, name }) {
  return send({
    to,
    subject: 'Your Veylo password was changed',
    text: `Hi ${name}, your Veylo password was changed. Contact info@veylo.com.ng if this was not you.`,
    html: shell(`<h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your password was changed</h1><p style="color:#b8b1aa;line-height:1.75">Hi ${escapeHtml(name.split(' ')[0] || 'there')}, your Veylo password has been updated and your previous sessions have been signed out.</p><p style="color:#8f8983;font-size:13px;line-height:1.7">If this was not you, contact <a style="color:#ff9b8e" href="mailto:info@veylo.com.ng">info@veylo.com.ng</a>.</p>`)
  });
}

export async function sendStoryReadyEmail({ to, clientName, storyTitle, storyUrl }) {
  return send({ to, subject: `Your photographs are ready — ${storyTitle}`, text: `${clientName}, your photographs are ready: ${storyUrl}`, html: shell(`<h1 style="margin:0 0 16px;font-size:30px;font-weight:500">Your photographs are ready.</h1><p style="color:#b8b1aa;line-height:1.75">${escapeHtml(clientName)}, your photographer has prepared ${escapeHtml(storyTitle)} for you.</p><a href="${escapeHtml(storyUrl)}" style="display:inline-block;margin-top:24px;background:#ff5a47;color:#100c0b;padding:14px 22px;text-decoration:none;font-size:13px;font-weight:700">Open your delivery</a>`) });
}
