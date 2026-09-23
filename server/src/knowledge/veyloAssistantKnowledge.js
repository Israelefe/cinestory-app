const DOCUMENTS = [
  {
    id: 'what-veylo-is',
    title: 'What Veylo is',
    keywords: ['veylo', 'delivery', 'gallery', 'photo story', 'client', 'photographer', 'finished shoot'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `Veylo is for delivering finished photographs from photographers and studios. A photographer uploads the edited photographs, reviews the presentation, and sends one private link. Clients can experience the presentation, browse the complete gallery, read captions, and download photographs. Veylo does not replace the photographer's original pixels, retouch a finished photograph, or act as a culling tool.`
  },
  {
    id: 'account-and-profile',
    title: 'Account, sign-in and studio profile',
    keywords: ['account', 'sign up', 'sign in', 'login', 'email', 'verification', 'otp', 'password', 'profile', 'studio name', 'logo', 'branding', 'settings'],
    audiences: ['studio', 'visitor'],
    text: `Create an account with your name and email, verify the email code, then finish the studio setup. If a code expires, request a new one and use the newest code. Password reset starts from Forgot password. Profile settings are where the photographer edits personal details, studio details, profile image, studio image, and branding. Public studio names and portfolio handles have change rules so links do not change constantly. Never share a password, verification code, payment details, or private client information with support or with this assistant.`
  },
  {
    id: 'plans-and-storage',
    title: 'Free and Pro plans',
    keywords: ['free', 'pro', 'price', 'pricing', 'storage', 'limit', 'photos', 'deliveries', 'subscription', 'upgrade', 'cancel', 'renewal'],
    audiences: ['studio', 'visitor'],
    text: `Veylo Free is ₦0, allows up to 3 published deliveries each month, and up to 100 photographs in one delivery. Veylo Pro is ₦25,000 per month, removes the monthly delivery count, allows up to 500 photographs in one delivery, includes studio branding, includes a 50 GB personal image library, and includes Veylo Portfolio. Plan details shown in the Billing page are the source of truth. Cancelling stops the next renewal and normally leaves paid access until the paid period ends. A failed renewal can place an account into the billing recovery process and may end Pro access if payment is not recovered. The assistant cannot change a plan, issue a refund, or delete an account.`
  },
  {
    id: 'create-delivery',
    title: 'Creating a delivery',
    keywords: ['create', 'creation', 'upload', 'photographs', 'photos', 'image library', 'brief', 'shoot', 'review', 'publish', 'draft'],
    audiences: ['studio'],
    text: `Start from New delivery or a finished shoot in the Dashboard. Tell Veylo who the photographs are for, what the shoot celebrates, and anything the presentation should understand. Upload the final edited files, or add photographs from the image library. JPEG, PNG, and WebP files are accepted within the size shown in the uploader. The upload screen reports each file and allows a retry for a failed file. Review the order, captions, sections, design, music, narration, and exact client preview before publishing. A draft can be resumed; publishing creates the private client delivery.`
  },
  {
    id: 'delivery-formats',
    title: 'Choosing a delivery format',
    keywords: ['format', 'photo story', 'editorial', 'photo reveal', 'canvas', 'chapters', 'album', 'event coverage', 'campaign', 'event', 'conference', 'church', 'owambe', 'lookbook'],
    audiences: ['studio', 'visitor'],
    text: `Photo Story is a directed sequence with pacing, captions, motion, music, and optional narration. Editorial Page is a scrollable publication for fashion, portraits, branding, campaigns, and studio sessions. Photo Reveal advances one photograph at a time when the client is ready. Canvas is a spatial field where related photographs sit in clusters. Chapters divides a large collection into natural parts. Album is a page-by-page keepsake. Event Coverage is for conferences, church services, owambe celebrations, concerts, corporate events, and gatherings where the story is about many people and scenes rather than one person. Campaign Delivery is for commercial work and follows the presentation with named asset sets, variants, download sizes, and usage notes.`
  },
  {
    id: 'review-captions-and-design',
    title: 'Review, captions and design',
    keywords: ['caption', 'headline', 'review', 'order', 'layout', 'typography', 'colour', 'color', 'spacing', 'section', 'preview', 'creative director'],
    audiences: ['studio'],
    text: `Veylo prepares a direction from the shoot brief and the photographs, but the photographer approves the result. Every photograph should have a meaningful caption. Captions can be edited or regenerated, photographs can be reordered, and sections can be changed during review. Format settings control typography, colour, spacing, image arrangement, and caption placement. The client preview should use the same photograph order, captions, sections, audio, access rules, and loading behaviour that publishing will use. If an AI job fails or returns an incomplete result, retry it and check every photograph before publishing.`
  },
  {
    id: 'music-and-narration',
    title: 'Music and narration',
    keywords: ['music', 'soundtrack', 'song', 'audio', 'narration', 'voice', 'play', 'pause', 'mute', 'volume', 'caption timing', 'loading'],
    audiences: ['studio', 'recipient'],
    text: `A soundtrack can be selected during review and replaced before publishing. The viewer loads the required media before the experience starts, then begins audio after the client's opening interaction where the browser requires it. Narration reads the approved captions in their final order; it is not a word-count timer. Pause, mute, resume, retry, and audio-loading states should remain clear. If captions or photograph order change, narration must be regenerated before publishing. If music or narration will not play, check that the delivery finished loading, try the viewer's audio control, check the device volume and browser permissions, and retry on a stable connection.`
  },
  {
    id: 'publish-and-access',
    title: 'Publishing, sharing and access',
    keywords: ['publish', 'private link', 'share', 'pin', 'access code', 'expiry', 'revoke', 'guest', 'vendor', 'organizer', 'organiser', 'download', 'client view'],
    audiences: ['studio', 'recipient'],
    text: `A published delivery has a private link. Depending on the photographer's settings it can use a PIN, an expiry date, and restricted share roles. Organisers, vendors, and guests can receive different access when the photographer creates those grants. A link can be revoked or expire. The client view loads photographs, captions, and audio before opening the experience. Clients can browse the shared gallery and download individual photographs. On mobile, use the browser download prompt or the device share sheet when offered; the exact save location is controlled by iOS or Android.`
  },
  {
    id: 'volume-delivery',
    title: 'High-volume recipient deliveries',
    keywords: ['volume', 'school', 'sports', 'recipient', 'code', 'matching', 'assignment', 'private gallery', 'bulk'],
    audiences: ['studio', 'recipient'],
    text: `When the volume delivery workflow is enabled for an account, a photographer can create a job with many recipients, assign photographs, and publish private recipient galleries. A recipient uses the code or link supplied for them and only sees the photographs assigned to that recipient. Photographers should check unmatched files, duplicate codes, and recipient assignments before publishing. The assistant must not reveal another recipient's photographs, code, name, or email.`
  },
  {
    id: 'portfolio',
    title: 'Veylo Portfolio',
    keywords: ['portfolio', 'public page', 'handle', 'instagram', 'whatsapp', 'publish', 'unpublish', 'enquiry', 'contact'],
    audiences: ['studio', 'visitor'],
    text: `Veylo Portfolio is available with Pro. It is a public page for selected published work, a studio introduction, contact details, and links a photographer chooses to show. The portfolio editor controls the handle, work order, text, and design direction. Publish only work the photographer has permission to show. If a public link cannot be found, check the handle and publication status in Portfolio settings, then use the current public link shown by Veylo.`
  },
  {
    id: 'emails-and-notifications',
    title: 'Veylo email messages',
    keywords: ['email', 'notification', 'welcome', 'receipt', 'payment', 'delivery ready', 'access code', 'invitation', 'renewal', 'refund'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `Veylo sends account and service messages when they are needed: email verification, password reset, welcome, password changed, payment receipt, payment failure, renewal failure, subscription cancellation or resumption, Pro access ending, refund status, a delivery-ready message when the photographer sends it, a volume access code, and an invited guest or vendor link. A photographer's delivery email is separate from Veylo account messages and only sends when the photographer chooses to send it. Veylo messages use Veylo branding. If an expected message is missing, check spam, confirm the email address, and contact support without sharing a verification code.`
  },
  {
    id: 'analytics',
    title: 'Delivery and visitor analytics',
    keywords: ['analytics', 'views', 'visitors', 'downloads', 'likes', 'traffic', 'count', 'unique', 'tracking'],
    audiences: ['studio'],
    text: `Veylo analytics show product and delivery activity such as delivery opens, unique visitor estimates, photograph views, likes, downloads, and selected creation actions. Counts can arrive after a short delay and may not equal the number of people because one person can return, refresh, or use more than one device. Analytics do not expose private passwords, payment data, or the identity of an anonymous visitor. The assistant can explain a metric but cannot reveal raw visitor records.`
  },
  {
    id: 'troubleshooting',
    title: 'Common problems',
    keywords: ['error', 'failed', 'not loading', 'reload', 'stuck', 'broken', 'download', 'upload', 'network', 'browser', 'mobile', 'blank', 'missing'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `For a page that will not load, refresh once, check the connection, and try a current Chrome, Safari, or Firefox window without a blocked script or extension. For an upload, retry only the failed file and check its format and size. For a delivery that remains locked, wait for the preloader to finish and retry the failed media; publishing should not be reported as ready until required media is available. For a download, try one photograph first, allow the browser download, and check the device Files or Downloads area. If the problem continues, contact Veylo support with the delivery link or ID and the exact message, but never include a password, PIN, card number, or private client information.`
  },
  {
    id: 'privacy-and-support',
    title: 'Privacy, security and support',
    keywords: ['privacy', 'security', 'data', 'delete', 'support', 'ticket', 'personal information', 'account deletion'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `Veylo support can help with account, billing, upload, delivery, access, and privacy problems. Use the Contact support form and include only the information needed to find the problem. Never send passwords, access codes, payment-card details, signed media links, or confidential client information. Account deletion is handled from the account settings flow or by a verified support request; the assistant does not delete accounts in chat. Private delivery access is controlled by the photographer's link, PIN, expiry, and revocation settings.`
  }
];

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'why', 'with', 'you', 'your']);

function terms(value) {
  return [...new Set(String(value || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(item => item.length > 1 && !STOP_WORDS.has(item)).slice(0, 80))];
}

function scoreDocument(document, queryTerms, audience) {
  const searchable = `${document.title} ${document.keywords.join(' ')} ${document.text}`.toLowerCase();
  let score = document.audiences.includes(audience) ? 2 : 0;
  for (const term of queryTerms) {
    if (document.keywords.some(keyword => keyword.toLowerCase().includes(term))) score += 5;
    else if (searchable.includes(term)) score += 1;
  }
  return score;
}

export function buildMarketingKnowledge() {
  const topics = new Set(['what-veylo-is', 'delivery-formats', 'create-delivery', 'review-captions-and-design', 'music-and-narration', 'publish-and-access', 'portfolio', 'analytics']);
  return DOCUMENTS.filter(document => topics.has(document.id)).map(document => `${document.title}\n${document.text}`).join('\n\n');
}

export function buildAssistantKnowledge({ query = '', audience = 'visitor' } = {}) {
  const queryTerms = terms(query);
  const selected = DOCUMENTS
    .map(document => ({ document, score: scoreDocument(document, queryTerms, audience) }))
    .sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
    .filter(item => item.score > 0)
    .slice(0, 5)
    .map(item => item.document);

  const fallback = DOCUMENTS.filter(document => document.audiences.includes(audience)).slice(0, 2);
  const documents = selected.length ? selected : fallback;
  return documents.map(document => `## ${document.title}\n${document.text}`).join('\n\n');
}

export function assistantTopicLabels({ query = '', audience = 'visitor' } = {}) {
  const queryTerms = terms(query);
  return DOCUMENTS
    .map(document => ({ document, score: scoreDocument(document, queryTerms, audience) }))
    .sort((a, b) => b.score - a.score)
    .filter(item => item.score > 0)
    .slice(0, 3)
    .map(item => item.document.title);
}

export function assistantSuggestedQuestions(surface = 'public') {
  if (surface === 'delivery') return [
    'How do I download one photograph?',
    'Why will the music not play?',
    'How do I open the captions?'
  ];
  if (surface === 'studio') return [
    'Which format fits a large event?',
    'How do I publish a delivery?',
    'Why did one upload fail?'
  ];
  return [
    'What is Veylo?',
    'How does a client delivery work?',
    'What is included with Pro?'
  ];
}

export const ASSISTANT_DOCUMENT_COUNT = DOCUMENTS.length;
