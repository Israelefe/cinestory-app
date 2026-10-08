import { PLAN_DEFINITIONS } from '../config/plans.js';
import { PRO_PRICING } from '../services/billingPricing.service.js';

export const VEYLO_HELP_KNOWLEDGE_VERSION = '2026-10-08';
const naira = value => `₦${Number(value).toLocaleString('en-NG')}`;
const positive = (value, fallback) => Number.isSafeInteger(value) && value > 0 ? value : fallback;

function currentPlans(runtimeConfig = {}) {
  return Object.fromEntries(['free', 'pro'].map(id => {
    const defaults = PLAN_DEFINITIONS[id], configured = runtimeConfig.plans?.[id] || {};
    return [id, {
      deliveriesPerMonth: configured.deliveriesPerMonth === null && id === 'pro' ? null : positive(configured.deliveriesPerMonth, defaults.deliveriesPerMonth),
      photosPerDelivery: positive(configured.photosPerDelivery, defaults.photosPerDelivery),
      personalStorageBytes: Number.isSafeInteger(configured.personalStorageBytes) && configured.personalStorageBytes >= 0 ? configured.personalStorageBytes : defaults.personalStorageBytes,
      branding: ['studio', 'veylo'].includes(configured.branding) ? configured.branding : defaults.branding,
      portfolio: (configured.portfolio ?? defaults.portfolio) && runtimeConfig.featureFlags?.portfolio !== false
    }];
  }));
}

function planHelp(runtimeConfig) {
  const { free, pro } = currentPlans(runtimeConfig);
  const allowance = pro.deliveriesPerMonth === null ? 'no fixed monthly delivery count, subject to fair use' : `up to ${pro.deliveriesPerMonth} published deliveries each month`;
  return `Free costs ₦0 and allows ${free.deliveriesPerMonth} published deliveries each month, with up to ${free.photosPerDelivery} photographs in each delivery. Pro costs ${naira(PRO_PRICING.monthlyPriceNaira)}/month for everyone, charged in NGN. Pro includes ${allowance}, up to ${pro.photosPerDelivery} photographs per delivery, ${pro.branding === 'studio' ? 'studio branding, ' : ''}a ${Math.round(pro.personalStorageBytes / 1024 ** 3)} GB personal Image Library${pro.portfolio ? ', and Veylo Portfolio' : ''}. Showcase, GridBoard, and Photo Swap use the same plan limits; changing delivery type does not reset the monthly allowance. Publishing uses a delivery allowance; a saved draft does not. Published delivery hosting is separate from the Image Library quota. The Billing page shows the current plan and payment state. The assistant can explain these rules but cannot upgrade, cancel, resume, refund, or delete an account.`;
}

const SHOWCASE_FORMATS = [
  ['photo-story', 'Photo Story', 'a paced sequence with captions, movement, a soundtrack, and optional narration'],
  ['editorial', 'Editorial Page', 'a scrollable publication for portraits, fashion, branding, and lookbooks'],
  ['photo-reveal', 'Photo Reveal', 'a client-controlled reveal of one photograph at a time'],
  ['canvas', 'Canvas', 'a spatial collection with related photographs in groups'],
  ['chapters', 'Chapters', 'a collection divided into named parts'],
  ['album', 'Album', 'a page-by-page photo keepsake'],
  ['event-coverage', 'Event Coverage', 'a presentation for conferences, church services, owambe celebrations, concerts, and other gatherings'],
  ['campaign', 'Campaign Delivery', 'a commercial presentation with named asset sets, variants, download sizes, and usage notes']
];

function formatHelp(runtimeConfig = {}) {
  const available = SHOWCASE_FORMATS.filter(([id]) => runtimeConfig.formats?.[id]?.enabled !== false);
  return `New delivery first offers three delivery types: Showcase Delivery, GridBoard Delivery, and Photo Swap Delivery. Showcase opens with a designed presentation and leads to the complete gallery. GridBoard opens with the complete photo board. Photo Swap opens with a swipeable stack, one finished photo at a time. Photo Swap is separate from Photo Reveal. Showcase formats currently enabled: ${available.map(([, name, description]) => `${name}: ${description}`).join('; ')}. All three delivery types retain every finished photograph and share the same plan limits and publishing controls. Use /formats to compare, /gridboard for GridBoard, and /photoswap for Photo Swap.`;
}

const DOCUMENTS = [
  {
    id: 'what-veylo-is',
    title: 'What Veylo is',
    keywords: ['veylo', 'delivery', 'gallery', 'photo story', 'client', 'photographer', 'finished shoot'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `Veylo is for presenting and delivering finished photographs. A photographer chooses Showcase, GridBoard, or Photo Swap, uploads the edited photographs, reviews the client view, and sends a private link through WhatsApp, email, or another channel. Showcase starts with a designed presentation, GridBoard starts with a complete photo board, and Photo Swap starts with a swipeable photo stack. Captions, likes, downloads, music, and access depend on the delivery and the photographer's settings. Pro also has separate Image Library links for clients to choose photos for editing and editors to return finished files. Those library workflows are separate from final client delivery. Veylo does not retouch photographs or automatically cull a shoot.`
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
    text: planHelp
  },
  {
    id: 'image-library-sharing',
    title: 'Pro Image Library, client choices and editor handoff',
    keywords: ['image library', 'raw', 'camera file', 'client selection', 'preselection', 'editor', 'handoff', 'PIN', 'password', '100 GB', 'preview'],
    audiences: ['studio', 'recipient'],
    text: runtime => `The Pro Image Library includes ${Math.round(currentPlans(runtime).pro.personalStorageBytes / 1024 ** 3)} GB of personal storage, separate from published delivery hosting. Open Image Library, then Client and editor links. Client preselection lets a client choose from up to 500 shared photographs for editing. It can have a six-digit PIN and shows marked previews without download controls. A submitted selection can be reopened with Ask them to choose again. Editor handoff requires a password; editors can download the source files and upload finished JPEG, PNG, or WebP edits to the same link. JPEG, PNG, WebP, supported camera RAW originals, and returned edits are limited to 100 MB per file. RAW originals stay unchanged beside a browser-made JPEG preview; both use storage. Saved folders, tags, and caption notes help organise and reuse the photographs. Sharing links close on expiry, revocation, or loss of Pro access. Keep separate backups of every original.`
  },
  {
    id: 'subscription-cancellation-and-resumption',
    title: 'Canceling, resuming and expired Pro access',
    keywords: ['billing', 'subscription', 'cancel', 'cancellation', 'resume', 'resuming', 'restart', 'renewal', 'expire', 'expired', 'checkout', 'payment method', 'charge', 'grace'],
    audiences: ['studio', 'visitor'],
    text: `Open Billing at /billing. Choose Pro opens a Paystack checkout for the displayed monthly NGN price; Pro begins after payment is confirmed. Cancel subscription stops future renewals when cancellation is confirmed. The remaining paid period stays available and Billing shows its end date. Manage payment method is hidden after cancellation. If paid time remains and cancellation is confirmed, Resume subscription can set up monthly renewals again using the saved payment method. It creates a new schedule whose first charge is after the existing paid period ends; it does not charge for another month immediately. Review the displayed renewal price and first payment date before resuming. If the saved payment method cannot be reused, keep the current paid access and start a new checkout after it ends. If renewal setup is awaiting confirmation, choose Check renewal status; do not submit another checkout to guess whether it worked. Paystack can reject attempts to reactivate the old canceled subscription, so do not promise the old schedule can be enabled. If the user does not resume before paid access ends, they return to Free and must complete a new checkout to get Pro again. A failed renewal may have a short payment grace period; Billing shows whether Pro is still available. Cancellation awaiting confirmation does not mean all renewals have stopped. Send payment issues to payment@veylo.com.ng; never ask for card details.`
  },
  {
    id: 'pro-expiry-and-retention',
    title: 'Image Library and Portfolio after Pro ends',
    keywords: ['expire', 'expiry', 'expired', 'free', 'downgrade', 'retention', 'read-only', 'library', 'storage', 'portfolio', 'unpublished', '30 days'],
    audiences: ['studio', 'visitor'],
    text: runtime => `When Pro access ends, the account returns to Free. The personal Image Library becomes read-only for the configured retention period, currently ${positive(runtime?.retention?.proRetentionDays, 30)} days. During that period the photographer can download or remove stored files but cannot upload or organise them. Public Portfolio access stops; retained portfolio data remains private during retention. Client preselection and editor handoff links stop working without Pro. Renew Pro through Billing to restore paid features. Published delivery hosting is separate from personal library storage; do not claim that every client delivery disappears just because a subscription ends. Keep independent backups and follow the dates and status shown in Billing and Image Library.`
  },
  {
    id: 'billing-refunds',
    title: 'Payment support and refunds',
    keywords: ['refund', 'cancel', 'charged', 'billing', 'payment', 'renewal'],
    audiences: ['studio', 'visitor'],
    text: `Payment support is payment@veylo.com.ng. The refund policy is at /refund-policy. A first payment may qualify for a change-of-mind refund within seven days if no client delivery was published during that paid period and no paid storage or Portfolio feature was used. Deleting work does not reset usage. Used paid periods and normal renewals are not routinely refunded or prorated. Duplicate payments, charges after confirmed cancellation, payments without access, and material service failures can be reviewed regardless of usage; applicable consumer rights still apply. Refunds require support review. Cancellation is separate: use Billing to stop future renewals and check the confirmation and remaining access date. Veylo charges one monthly NGN price for Pro and does not use country detection to set it. A bank or card provider may handle currency conversion. Existing subscribers will be notified before a change to their renewal amount takes effect.`
  },
  {
    id: 'create-delivery',
    title: 'Creating a delivery',
    keywords: ['create', 'creation', 'upload', 'photographs', 'photos', 'image library', 'brief', 'shoot', 'review', 'publish', 'draft'],
    audiences: ['studio'],
    text: `Open New delivery at /create and choose Showcase, GridBoard, or Photo Swap. Give the client name, shoot type, title or purpose requested by that delivery type. Upload finished JPEG, PNG, or WebP photographs up to 20 MB each, or reuse Image Library photographs. Camera RAW originals belong in Image Library; a delivery uses their paired JPEG preview rather than replacing the RAW original. Check upload progress and retry the failed file. If the connection drops, return to the saved draft instead of creating a second delivery. Review all captions and the photo order, then the type's design and audio settings, access, and client preview. Photo Swap has Details, Photos, Captions, Style, Access, and Publish steps. GridBoard has board arrangements and optional slideshow settings; Showcase has its chosen format's presentation settings. Publishing creates the private client link. A saved draft is not a published delivery.`
  },
  {
    id: 'delivery-formats',
    title: 'Delivery types and Showcase formats',
    keywords: ['format', 'delivery type', 'showcase', 'gridboard', 'grid board', 'photo swap', 'photoswap', 'photo story', 'editorial', 'photo reveal', 'canvas', 'chapters', 'album', 'event coverage', 'campaign', 'event', 'conference', 'church', 'owambe', 'lookbook'],
    audiences: ['studio', 'visitor'],
    text: formatHelp
  },
  {
    id: 'photo-swap',
    title: 'Photo Swap: swiping, captions and downloads',
    keywords: ['photo swap', 'photoswap', 'swipe', 'swiping', 'stack', 'cards', 'card', 'tilt', 'slant', 'flicker', 'caption', 'like', 'favourite', 'favorite', 'download'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `Photo Swap presents every finished photograph in a swipeable stack of tilted photo cards. It is its own delivery type, separate from the Showcase format Photo Reveal. A client opens the set and swipes the card to move through the photographs. On a computer they can drag the card or use the keyboard arrow keys. There are no Back or Next navigation buttons. The current photograph is already shown in full; there is no gallery button during swiping. The caption appears below the current photograph. Like and Save controls appear only when the photographer enables likes and individual downloads. At the end, View full gallery opens the complete collection, with favourites available when likes are allowed; Start again replays the stack. Cards have different visual treatments and gentle photo movement. Pause photo motion stops it, and a photographer's still-photo setting is respected. Optional music starts after the client's opening interaction and can be muted. Create a Photo Swap from /create?type=photoswap, read about it at /photoswap, or try /demo/photoswap. The photographer reviews captions, order, colours, type, photo movement, soundtrack, downloads, likes, and access before publishing.`
  },
  {
    id: 'gridboard',
    title: 'GridBoard: the full gallery and optional slideshow',
    keywords: ['gridboard', 'grid board', 'pinboard', 'board', 'arrangements', 'layout', 'moments', 'colour', 'color', 'slideshow', 'groups', 'gallery'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `GridBoard opens with every finished photograph on a board the client can browse freely. Veylo suggests three complete arrangements: Even spread, Scenes together, and Colour-led order. Each arrangement keeps every photograph; it does not remove or cull files. Review useful moment groups, photo order, captions, typography, colours, and the client preview. The client can open photos for a closer look and use likes or downloads if enabled. A slideshow is optional: the client chooses to play it rather than having the gallery automatically start a story. GridBoard music plays during the slideshow, not while browsing the board. GridBoard does not use Showcase narration. Create one at /create?type=pinboard, read about it at /gridboard, or try /demo/gridboard. It uses the same publishing and plan limits as Showcase and Photo Swap.`
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
    text: `Choose a soundtrack from the music library or upload audio you have permission to use, up to 20 MB. Preview, replace, or remove it before publishing. The client's opening interaction allows audio where the browser blocks automatic playback. Photo Swap has optional music while swiping and a mute control. GridBoard music plays only during the optional slideshow. Showcase can have music and optional narration, according to the chosen format and enabled settings; do not promise narration for Photo Swap or GridBoard. Narration uses approved words in their final order, so regenerate it after changing those captions or order. For audio that will not play, finish the opening load, use the viewer's play or audio control, check the device volume, and retry failed media on a stable connection. Pause controls remain available where the viewer offers them.`
  },
  {
    id: 'publish-and-access',
    title: 'Publishing, sharing and access',
    keywords: ['publish', 'private link', 'share', 'pin', 'access code', 'expiry', 'revoke', 'guest', 'vendor', 'organizer', 'organiser', 'download', 'client view'],
    audiences: ['studio', 'recipient'],
    text: `Publishing makes a private client link. Review the client preview first, then copy the published link and send it through WhatsApp or another channel. Opening a preview is not publishing. The photographer can choose a six-digit PIN, an expiry date, likes, individual downloads, and download-all access where offered. Restricted organiser, vendor, or guest invitations are separate share grants; do not promise every recipient can see or download the same files. A delivery can be revoked or expire. Photo Swap shows one full photograph at a time and opens its gallery at the end; GridBoard opens the complete board first; Showcase leads to the gallery after its presentation. Download controls depend on access settings, and a preview or preselection link may have no download controls. On a phone use the browser save prompt or share sheet when offered, then check Files or Downloads. If a link is unavailable, ask the photographer for the current link and permitted access. Help cannot bypass a PIN, password, expired link, or download restriction.`
  },
  {
    id: 'retired-volume-delivery',
    title: 'Older volume-delivery links',
    keywords: ['volume', 'school', 'sports', 'recipient', 'code', 'matching', 'assignment', 'private gallery', 'bulk'],
    audiences: ['studio', 'recipient'],
    text: `The current app does not offer the older volume-delivery creation or recipient-code pages. Do not recommend a volume job, recipient matching, a bulk recipient workflow, or /volume-deliveries as a current feature. For a large finished event, compare Showcase Event Coverage, Chapters, or GridBoard and stay within the plan's photo limit. If an older volume or recipient-code link no longer opens, contact the photographer or Veylo support for the current delivery link. Never reveal another recipient's photographs, code, name, or email.`
  },
  {
    id: 'portfolio',
    title: 'Veylo Portfolio',
    keywords: ['portfolio', 'public page', 'handle', 'instagram', 'whatsapp', 'publish', 'unpublish', 'enquiry', 'contact'],
    audiences: ['studio', 'visitor'],
    text: `Veylo Portfolio is a Pro feature when enabled. It is a public page for selected work, a studio introduction, contact details, and chosen social links. Open /portfolio/manage to edit the handle, work, words, colours, typography, and design; preview and publish the portfolio separately from publishing a delivery. Publishing a client delivery does not automatically make it public portfolio work. Show only work the photographer has permission to publish. Enquiries are available at /portfolio/enquiries. If a public page cannot be found, check the current handle, publication status, and Pro access. The /portfolio page explains the product; it is not the signed-in editor.`
  },
  {
    id: 'emails-and-notifications',
    title: 'Veylo email messages',
    keywords: ['email', 'notification', 'welcome', 'receipt', 'payment', 'delivery ready', 'access code', 'invitation', 'renewal', 'refund'],
    audiences: ['studio', 'recipient', 'visitor'],
    text: `Veylo sends account and service messages when they are needed: email verification, password reset, welcome, password changed, payment receipt, payment failure, renewal failure, subscription cancellation or resumption, Pro access ending, refund status, a delivery-ready message when the photographer sends it, and an invited guest or vendor link. A photographer's delivery email is separate from Veylo account messages and only sends when the photographer chooses to send it. Veylo messages use Veylo branding. If an expected message is missing, check spam, confirm the email address, and contact support without sharing a verification code.`
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

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'from', 'get', 'has', 'have', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'need', 'of', 'on', 'or', 'the', 'to', 'use', 'want', 'what', 'when', 'where', 'why', 'will', 'with', 'you', 'your']);

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\bphoto\s*[- ]?\s*swap\b/g, 'photo swap')
    .replace(/\b(?:grid\s*[- ]?\s*board|pinboard)\b/g, 'grid board').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function documentText(document, runtimeConfig) {
  return typeof document.text === 'function' ? document.text(runtimeConfig) : document.text;
}

function terms(value) {
  return [...new Set(normalize(value).split(/\s+/).filter(item => item.length > 1 && !STOP_WORDS.has(item)).slice(0, 80))];
}

function scoreDocument(document, queryTerms, audience, query = '', runtimeConfig) {
  const searchable = new Set(terms(`${document.title} ${document.keywords.join(' ')} ${documentText(document, runtimeConfig)}`));
  const keywords = new Set(terms(document.keywords.join(' ')));
  const titleTerms = new Set(terms(document.title));
  const normalizedQuery = ` ${normalize(query)} `;
  let score = document.audiences.includes(audience) ? 2 : 0;
  for (const keyword of document.keywords) {
    const phrase = normalize(keyword);
    if (phrase.includes(' ') && normalizedQuery.includes(` ${phrase} `)) score += 18;
  }
  for (const term of queryTerms) {
    if (titleTerms.has(term)) score += 3;
    if (keywords.has(term)) score += 5;
    else if (searchable.has(term)) score += 1;
  }
  return score;
}

export function buildMarketingKnowledge() {
  const topics = new Set(['what-veylo-is', 'delivery-formats', 'photo-swap', 'gridboard', 'create-delivery', 'review-captions-and-design', 'music-and-narration', 'publish-and-access', 'portfolio', 'analytics']);
  return DOCUMENTS.filter(document => topics.has(document.id)).map(document => `${document.title}\n${documentText(document)}`).join('\n\n');
}

export function buildAssistantKnowledge({ query = '', audience = 'visitor', runtimeConfig } = {}) {
  const queryTerms = terms(query);
  const selected = DOCUMENTS
    .filter(document => document.audiences.includes(audience))
    .map(document => ({ document, score: scoreDocument(document, queryTerms, audience, query, runtimeConfig) }))
    .sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
    .filter(item => item.score > 2)
    .slice(0, 5)
    .map(item => item.document);

  const fallback = DOCUMENTS.filter(document => document.audiences.includes(audience)).slice(0, 2);
  const documents = selected.length ? selected : fallback;
  const overview = audience === 'recipient' ? 'Delivery types: Showcase opens with a presentation, GridBoard with a complete board, and Photo Swap with a swipeable stack. Viewing, downloads, likes, and audio depend on the shared delivery settings.'
    : `${planHelp(runtimeConfig)}\n${formatHelp(runtimeConfig)}\nCurrent optional features: music ${runtimeConfig?.featureFlags?.music === false ? 'disabled' : 'enabled'}, narration ${runtimeConfig?.featureFlags?.narration === false || runtimeConfig?.narration?.enabled === false ? 'disabled' : 'enabled'}.`;
  return `Current Veylo product facts (help updated ${VEYLO_HELP_KNOWLEDGE_VERSION}):\n${overview}\n\n${documents.map(document => `## ${document.title}\n${documentText(document, runtimeConfig)}`).join('\n\n')}`;
}

export function assistantTopicLabels({ query = '', audience = 'visitor' } = {}) {
  const queryTerms = terms(query);
  return DOCUMENTS
    .filter(document => document.audiences.includes(audience))
    .map(document => ({ document, score: scoreDocument(document, queryTerms, audience, query) }))
    .sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
    .filter(item => item.score > 2)
    .slice(0, 3)
    .map(item => item.document.title);
}

const RELATED_QUESTIONS = {
  'what-veylo-is': ['How does a client delivery work?'],
  'account-and-profile': ['How do I update my studio profile?', 'How do I reset my password?'],
  'plans-and-storage': ['What is included with Pro?', 'What happens when I cancel Pro?', 'Where can I check my delivery allowance?'],
  'subscription-cancellation-and-resumption': ['Can I resume Pro before it expires?', 'What happens if Pro expires before I resume?'],
  'pro-expiry-and-retention': ['What happens to my Image Library when Pro ends?'],
  'image-library-sharing': ['How do I send a client preselection link?', 'How does editor handoff work?'],
  'create-delivery': ['How do I publish a delivery?', 'Why did one upload fail?'],
  'delivery-formats': ['How do Showcase, GridBoard and Photo Swap differ?', 'Which format fits a large event?'],
  'photo-swap': ['How do I create a Photo Swap?', 'Can clients like and download photos in Photo Swap?'],
  'gridboard': ['What is the difference between Showcase and GridBoard?', 'How does the GridBoard slideshow work?'],
  'review-captions-and-design': ['How do I review captions before publishing?'],
  'music-and-narration': ['Why will the music not play?'],
  'publish-and-access': ['Why can I not open a delivery link?', 'How do I download one photograph?'],
  'retired-volume-delivery': ['Which delivery type fits a large event?'],
  'portfolio': ['What is included with Veylo Portfolio?'],
  'emails-and-notifications': ['Why has my Veylo email not arrived?'],
  'analytics': ['What do delivery views count?'],
  'troubleshooting': ['How do I contact Veylo support?'],
  'privacy-and-support': ['How do I contact Veylo support?']
};

export function assistantSuggestedQuestions(surface = 'public', { query = '', audience } = {}) {
  const resolvedAudience = audience || (surface === 'delivery' ? 'recipient' : surface === 'studio' ? 'studio' : 'visitor');
  const queryTerms = terms(query);
  if (queryTerms.length) {
    const questions = DOCUMENTS.filter(document => document.audiences.includes(resolvedAudience))
      .map(document => ({ document, score: scoreDocument(document, queryTerms, resolvedAudience, query) }))
      .filter(item => item.score > 2)
      .sort((a, b) => b.score - a.score)
      .flatMap(({ document }) => RELATED_QUESTIONS[document.id] || []);
    const related = [...new Set(questions)].filter(question => question.toLowerCase() !== query.trim().toLowerCase()).slice(0, 3);
    if (related.length) return related;
  }
  if (surface === 'delivery') return [
    'How do I download one photograph?',
    'Why will the music not play?',
    'How do I open the captions?'
  ];
  if (surface === 'studio') return [
    'Which delivery type should I choose?',
    'How do I publish a delivery?',
    'What happens when I cancel or resume Pro?'
  ];
  return [
    'What is Veylo?',
    'How do Showcase, GridBoard and Photo Swap differ?',
    'What is included with Pro?'
  ];
}

export const ASSISTANT_DOCUMENT_COUNT = DOCUMENTS.length;
