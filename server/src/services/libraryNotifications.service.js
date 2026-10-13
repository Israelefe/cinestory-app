import crypto from 'node:crypto';
import { sendLibraryEmail } from './email.service.js';
import User from '../models/User.js';

export const libraryWebUrl = (job, owner = false) => `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/${owner ? job.kind === 'preselection' ? 'pre-selection' : 'editor-links' : job.kind === 'preselection' ? 'select' : 'edit'}/${owner ? job._id : job.publicId}`;

export async function notifyLibrary(job, event, { key = '', note = '', to = '' } = {}) {
  try { return await deliverLibraryNotification(job, event, { key, note, to }); }
  catch { console.error('[email/library] Notification could not be queued.'); return { status: 'unavailable' }; }
}

async function deliverLibraryNotification(job, event, { key, note, to }) {
  const owner = await User.findById(job.userId).select('email name studio.name').lean();
  if (!owner) return { status: 'unavailable' };
  const selection = job.kind === 'preselection';
  const recipientEvent = event === 'invite' || event === 'corrections';
  const recipient = recipientEvent ? to || job.recipientEmail : owner.email;
  if (!recipient) return { status: 'no-address' };
  const title = String(job.title).replace(/[\r\n]/g, ' ');
  const actor = job.clientName || (selection ? 'Your client' : 'Your editor');
  const templates = {
    opened: [`${actor} opened ${title}`, `${actor} has opened the ${selection ? 'photo pre-selection' : 'Editor Link'} for ${title}.`],
    selected: [`Photo choices received: ${title}`, `${actor} has sent their photograph choices for ${title}. Open the selection to see the chosen images.`],
    returned: [`Edits returned: ${title}`, `${actor} has sent a batch of edits for ${title}. Review the photographs and check which originals still need edits.`],
    corrections: [`Corrections requested: ${title}`, `${owner.studio?.name || owner.name} has requested a correction for ${title}.${note ? ' ' + note : ''} Open the Editor Link to read the review and return a new revision.`],
    invite: [`${owner.studio?.name || owner.name} shared ${title}`, `${owner.studio?.name || owner.name} has shared ${selection ? 'a photo pre-selection' : 'an editing job'} with you: ${title}. ${selection ? 'Open the photographs to make your choices.' : 'Open the Editor Link to download the originals and return your edits.'} Access details, if required, are shared separately.`]
  };
  const [subject, message] = templates[event];
  const eventPart = key || (event === 'selected' ? job.revision || 1 : event === 'returned' ? crypto.createHash('sha256').update(job.returnedAssets.map(item => String(item.assetId)).join(',')).digest('hex').slice(0, 32) : 'first');
  const eventKey = `library:${job._id}:${event}:${eventPart}`;
  try {
    const sent = await sendLibraryEmail({ to: recipient, userId: job.userId, eventKey, kind: `library-${event}`, title: subject, message, url: libraryWebUrl(job, !recipientEvent), action: recipientEvent ? 'Open private link' : selection ? 'View selection' : 'Review edits' });
    return { status: ['pending', 'sending', 'failed'].includes(sent.status) ? 'queued' : sent.status, duplicate: Boolean(sent.duplicate) };
  } catch (error) {
    console.error('[email/library] Notification could not be sent.', error.emailDeliveryRecorded ? 'Queued for retry.' : 'Could not queue.');
    return { status: error.emailDeliveryRecorded ? 'queued' : 'unavailable' };
  }
}
