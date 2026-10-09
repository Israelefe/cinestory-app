import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { Resend } from 'resend';
import SupportTicket from '../models/SupportTicket.js';
import SupportOutbox from '../models/SupportOutbox.js';
import SupportMailbox from '../models/SupportMailbox.js';
import SupportInbound from '../models/SupportInbound.js';
import { appendSupportMessage, supportText, migrateLegacySupportTickets } from './support.service.js';

const ADDRESSES = { general: 'info@veylo.com.ng', billing: 'payment@veylo.com.ng' };
const MAX_MAIL_BYTES = 8 * 1024 * 1024;
const instance = crypto.randomUUID();
let timer, running = false;
export function mailboxConfig(mailbox) {
  const prefix = mailbox === 'billing' ? 'SUPPORT_BILLING' : 'SUPPORT_GENERAL';
  const host = process.env[`${prefix}_IMAP_HOST`] || process.env.SUPPORT_IMAP_HOST || '';
  return { address: ADDRESSES[mailbox], host, port: Number(process.env[`${prefix}_IMAP_PORT`] || process.env.SUPPORT_IMAP_PORT || 993),
    smtpHost: process.env[`${prefix}_SMTP_HOST`] || process.env.SUPPORT_SMTP_HOST || host, smtpPort: Number(process.env[`${prefix}_SMTP_PORT`] || process.env.SUPPORT_SMTP_PORT || 465),
    user: process.env[`${prefix}_USER`] || ADDRESSES[mailbox], pass: process.env[`${prefix}_PASSWORD`] || '',
    sentFolder: process.env[`${prefix}_SENT_FOLDER`] || '' };
}
export const mailboxConfigured = mailbox => { const config = mailboxConfig(mailbox); return Boolean(config.host && config.pass); };
function imapClient(config) {
  if (config.port !== 993) throw new Error('SECURE_IMAP_PORT_REQUIRED');
  return new ImapFlow({ host: config.host, port: 993, secure: true, auth: { user: config.user, pass: config.pass },
    logger: false, logRaw: false, disableAutoIdle: true, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000, tls: { rejectUnauthorized: true } });
}
export async function supportMailboxHealth() {
  const states = await SupportMailbox.find({}).lean();
  const outbox = await SupportOutbox.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  return { mailboxes: Object.keys(ADDRESSES).map(mailbox => { const state = states.find(item => item.mailbox === mailbox);
    const lastCheck = state?.lastAttemptAt || state?.lastSuccessAt;
    const stale = ['connected', 'syncing'].includes(state?.status) && (!lastCheck || Date.now() - new Date(lastCheck).getTime() > 180000);
    return {
    mailbox, address: ADDRESSES[mailbox], configured: mailboxConfigured(mailbox), status: mailboxConfigured(mailbox) ? stale ? 'stale' : state?.status && state.status !== 'not-configured' ? state.status : 'awaiting-first-sync' : 'not-configured',
    lastSuccessAt: state?.lastSuccessAt || null, lastAttemptAt: state?.lastAttemptAt || null, failureCode: state?.failureCode || null,
    importedCount: state?.importedCount || 0, skippedCount: state?.skippedCount || 0
  }; }), outbox: Object.fromEntries(outbox.map(row => [row._id, row.count])) };
}
export async function importSupportEmail({ mailbox, sourceKey, parsed, receivedAt = new Date() }) {
  if (await SupportInbound.exists({ sourceKey })) return null;
  const address = String(parsed.from?.value?.[0]?.address || '').trim().toLowerCase();
  const messageId = supportText(parsed.messageId, 300);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254 || Object.values(ADDRESSES).includes(address)) {
    await SupportInbound.updateOne({ sourceKey }, { $setOnInsert: { mailbox, status: 'skipped', reason: 'invalid-or-own-sender' } }, { upsert: true }); return null;
  }
  if (messageId && await SupportInbound.exists({ mailbox, emailMessageId: messageId })) {
    await SupportInbound.updateOne({ sourceKey }, { $setOnInsert: { mailbox, status: 'skipped', reason: 'duplicate-message-id' } }, { upsert: true }); return null;
  }
  const references = [...(Array.isArray(parsed.references) ? parsed.references : String(parsed.references || '').split(/\s+/)), parsed.inReplyTo].filter(value => typeof value === 'string' && value.length <= 300).slice(-20);
  const previous = references.length ? await SupportOutbox.findOne({ emailMessageId: { $in: references }, status: { $in: ['sent', 'uncertain'] } }).lean() : null;
  let ticket = previous ? await SupportTicket.findOne({ _id: previous.ticketId, requesterEmail: address, mailbox }) : null;
  const attachmentNote = parsed.attachments?.length ? `\n\n[${parsed.attachments.length} email attachment(s). Open the original email in webmail to inspect these files.]` : '';
  // Only plain text is stored/rendered. No email HTML, tracking pixels, remote images or scripts reach the admin.
  const plain = supportText(parsed.text || 'This email has no readable text. Open it in webmail to inspect the original.', 100000);
  const message = `${plain.slice(0, 3500)}${plain.length > 3500 ? '\n\n[Long email shortened. Open the original in webmail for the complete message.]' : ''}${attachmentNote}`;
  const requestKey = `email:${crypto.createHash('sha256').update(sourceKey).digest('hex')}`;
  if (ticket) ticket = await appendSupportMessage(ticket._id, { authorType: 'requester', channel: 'email', message, requestKey, emailMessageId: messageId, createdAt: receivedAt });
  else {
    ticket = await SupportTicket.findOneAndUpdate({ requestKey }, { $setOnInsert: { requesterEmail: address,
      requesterName: supportText(parsed.from?.value?.[0]?.name || address.split('@')[0], 100),
      subject: supportText(parsed.subject || 'Email support request', 160), category: mailbox === 'billing' ? 'billing' : 'other',
      channel: 'email', mailbox, lastRequesterAt: receivedAt, context: { identity: 'Email sender is unverified. Verify account ownership before account or payment actions.', receivedAt },
      messages: [{ authorType: 'requester', channel: 'email', message, requestKey, emailMessageId: messageId, createdAt: receivedAt }]
    } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  await SupportInbound.updateOne({ sourceKey }, { $setOnInsert: { mailbox, emailMessageId: messageId || undefined, ticketId: ticket._id } }, { upsert: true });
  return ticket;
}
export async function syncSupportMailbox(mailbox) {
  if (!mailboxConfigured(mailbox)) return;
  await SupportMailbox.updateOne({ mailbox }, { $setOnInsert: { mailbox } }, { upsert: true });
  const state = await SupportMailbox.findOneAndUpdate({ mailbox, $or: [{ leaseUntil: { $lte: new Date() } }, { leaseUntil: null }] },
    { $set: { leaseOwner: instance, leaseUntil: new Date(Date.now() + 120000), status: 'syncing', lastAttemptAt: new Date() } }, { new: true });
  if (!state) return;
  let client, lock;
  try {
    client = imapClient(mailboxConfig(mailbox));
    await client.connect(); lock = await client.getMailboxLock('INBOX', { readOnly: true });
    const validity = String(client.mailbox.uidValidity);
    let lastUid = state.uidValidity === validity ? state.lastUid : 0;
    const uids = (await client.search({ uid: `${lastUid + 1}:*` }, { uid: true }) || []).filter(uid => uid > lastUid).sort((a, b) => a - b).slice(0, 20);
    let imported = 0, skipped = 0;
    for (const uid of uids) {
      const metadata = await client.fetchOne(uid, { size: true, internalDate: true }, { uid: true });
      const sourceKey = `${mailbox}:${validity}:${uid}`;
      if (!metadata || metadata.size > MAX_MAIL_BYTES) {
        await SupportInbound.updateOne({ sourceKey }, { $setOnInsert: { mailbox, status: 'skipped', reason: 'message-exceeds-8mb-open-webmail' } }, { upsert: true }); skipped++;
      } else {
        const fetched = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!fetched?.source || fetched.source.length > MAX_MAIL_BYTES) throw new Error('MAIL_SOURCE_UNAVAILABLE');
        let parsed;
        try { parsed = await simpleParser(fetched.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: 200000 }); }
        catch { await SupportInbound.updateOne({ sourceKey }, { $setOnInsert: { mailbox, status: 'skipped', reason: 'unreadable-email-open-webmail' } }, { upsert: true }); skipped++; }
        if (parsed) {
          if (await importSupportEmail({ mailbox, sourceKey, parsed, receivedAt: metadata.internalDate || new Date() })) imported++;
          else skipped++;
        }
      }
      lastUid = uid;
      await SupportMailbox.updateOne({ mailbox, leaseOwner: instance }, { $set: { uidValidity: validity, lastUid, leaseUntil: new Date(Date.now() + 120000) } });
    }
    await SupportMailbox.updateOne({ mailbox, leaseOwner: instance }, { $set: { status: 'connected', lastSuccessAt: new Date(), failureCode: null }, $inc: { importedCount: imported, skippedCount: skipped } });
  } catch {
    await SupportMailbox.updateOne({ mailbox, leaseOwner: instance }, { $set: { status: 'error', failureCode: 'MAILBOX_SYNC_FAILED' } });
  } finally {
    lock?.release(); if (client) await client.logout().catch(() => client.close());
    await SupportMailbox.updateOne({ mailbox, leaseOwner: instance }, { $unset: { leaseUntil: 1, leaseOwner: 1 } });
  }
}
export async function deliverSupportMessage(row, transport) {
  const ticket = await SupportTicket.findById(row.ticketId);
  const item = ticket?.messages.id(row.messageId);
  if (!item || item.internal || !['admin', 'system'].includes(item.authorType)) { await SupportOutbox.deleteOne({ _id: row._id }); return { skipped: true }; }
  const config = mailboxConfig(ticket.mailbox);
  const messageId = row.emailMessageId || `<veylo-support.${row._id}@veylo.com.ng>`;
  const previous = [...ticket.messages].reverse().find(message => message.authorType === 'requester' && message.emailMessageId);
  const url = `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/contact?ticket=${ticket._id}`;
  const mail = { from: `Veylo <${config.address}>`, to: ticket.requesterEmail, replyTo: config.address,
    subject: `[${ticket.ticketNumber}] ${ticket.subject.replace(/[\r\n]/g, ' ')}`, messageId,
    ...(previous ? { inReplyTo: previous.emailMessageId, references: previous.emailMessageId } : {}),
    text: `${item.message}\n\nVeylo support · ${ticket.ticketNumber}\n${ticket.userId ? `Read or reply in your support inbox: ${url}` : 'Reply to this email to continue the conversation.'}` };
  await SupportOutbox.updateOne({ _id: row._id }, { $set: { emailMessageId: messageId } });
  if (transport) await transport(mail);
  else if (config.smtpHost && config.pass) {
    if (![465, 587].includes(config.smtpPort)) throw Object.assign(new Error('SMTP_PORT_INVALID'), { definitelyRejected: true });
    const sender = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465, requireTLS: true,
      auth: { user: config.user, pass: config.pass }, tls: { rejectUnauthorized: true }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
    try {
      const result = await sender.sendMail(mail);
      if (!result.accepted?.some(address => String(address).toLowerCase() === ticket.requesterEmail)) throw Object.assign(new Error('SMTP_RECIPIENT_REJECTED'), { definitelyRejected: true });
    } catch (error) { if (error.responseCode >= 400 || ['EAUTH', 'EENVELOPE'].includes(error.code)) error.definitelyRejected = true; throw error; }
    finally { sender.close(); }
  } else {
    if (!process.env.RESEND_API_KEY) throw Object.assign(new Error('SUPPORT_EMAIL_NOT_CONFIGURED'), { definitelyRejected: true });
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: mail.from, to: mail.to, replyTo: mail.replyTo,
      subject: mail.subject, text: mail.text, headers: { 'Message-ID': messageId, ...(mail.inReplyTo ? { 'In-Reply-To': mail.inReplyTo, References: mail.references } : {}) } }, { idempotencyKey: `support:${row._id}` });
    if (error) throw Object.assign(new Error('SUPPORT_EMAIL_REJECTED'), { definitelyRejected: Number(error.statusCode) >= 400 && Number(error.statusCode) < 500 });
  }
  // Mark accepted before any Sent-folder work; a failed copy must never trigger another send.
  await SupportOutbox.updateOne({ _id: row._id }, { $set: { status: 'sent', sentAt: new Date(), failureCode: null }, $unset: { leaseUntil: 1 } });
  await SupportTicket.updateOne({ _id: ticket._id, 'messages._id': item._id }, { $set: { 'messages.$.deliveryStatus': 'sent', 'messages.$.emailMessageId': messageId } });
  if (!transport && mailboxConfigured(ticket.mailbox)) {
    let client;
    try {
      client = imapClient(config);
      await client.connect();
      const folders = await client.list();
      const sent = config.sentFolder || folders.find(folder => folder.specialUse === '\\Sent')?.path;
      if (!sent) throw new Error('SENT_FOLDER_NOT_FOUND');
      const raw = await new MailComposer(mail).compile().build();
      await client.append(sent, raw, ['\\Seen']);
      await SupportOutbox.updateOne({ _id: row._id }, { $set: { sentCopyStatus: 'saved' } });
    } catch { await SupportOutbox.updateOne({ _id: row._id }, { $set: { sentCopyStatus: 'failed' } }); }
    finally { if (client) await client.logout().catch(() => client.close()); }
  } else await SupportOutbox.updateOne({ _id: row._id }, { $set: { sentCopyStatus: 'unavailable' } });
  return { sent: true };
}
export async function runSupportMaintenance({ transport } = {}) {
  if (running) return;
  running = true;
  try {
    await migrateLegacySupportTickets();
    const stale = await SupportOutbox.find({ status: 'sending', leaseUntil: { $lte: new Date() } }).limit(20);
    for (const row of stale) {
      await SupportOutbox.updateOne({ _id: row._id, status: 'sending' }, { $set: { status: 'uncertain', failureCode: 'SEND_RESULT_UNKNOWN' } });
      await SupportTicket.updateOne({ _id: row.ticketId, 'messages._id': row.messageId }, { $set: { 'messages.$.deliveryStatus': 'uncertain' } });
    }
    // Repair a process interruption between saving the reply and creating its outbox row.
    const tickets = await SupportTicket.find({ messages: { $elemMatch: { deliveryStatus: 'queued', internal: false } } }).limit(20);
    for (const ticket of tickets) for (const item of ticket.messages.filter(message => message.deliveryStatus === 'queued' && !message.internal)) {
      await SupportOutbox.updateOne({ messageId: item._id }, { $setOnInsert: { ticketId: ticket._id, messageId: item._id } }, { upsert: true });
    }
    const rows = await SupportOutbox.find({ $or: [{ status: 'queued' }, { status: 'failed', retryAfter: { $lte: new Date() }, attempts: { $lt: 5 } }] }).sort({ createdAt: 1 }).limit(10);
    for (const row of rows) {
      const claimed = await SupportOutbox.findOneAndUpdate({ _id: row._id, status: { $in: ['queued', 'failed'] } }, { $set: { status: 'sending', leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { new: true });
      if (!claimed) continue;
      try { await deliverSupportMessage(claimed, transport); }
      catch (error) {
        const status = error.definitelyRejected ? 'failed' : 'uncertain';
        // SMTP has no idempotency key. Ambiguous sends require review instead of automatic duplication.
        await SupportOutbox.updateOne({ _id: row._id, status: 'sending' }, { $set: { status, failureCode: status === 'failed' ? 'EMAIL_NOT_ACCEPTED' : 'SEND_RESULT_UNKNOWN', retryAfter: new Date(Date.now() + 60000 * 2 ** claimed.attempts) }, $unset: { leaseUntil: 1 } });
        await SupportTicket.updateOne({ _id: row.ticketId, 'messages._id': row.messageId }, { $set: { 'messages.$.deliveryStatus': status } });
      }
    }
    if (!transport) for (const mailbox of Object.keys(ADDRESSES)) await syncSupportMailbox(mailbox);
  } finally { running = false; }
}
export function startSupportWorker() {
  if (timer) return;
  const run = () => void runSupportMaintenance().catch(() => console.error('[support/worker] Maintenance failed.'));
  setTimeout(run, 20000).unref(); timer = setInterval(run, 60000); timer.unref();
}
