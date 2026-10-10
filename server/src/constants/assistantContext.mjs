// Only explicit workflow facts cross the assistant boundary. Never send URLs,
// input values, file names, or arbitrary analytics metadata as activity context.
export const ASSISTANT_PAGES = Object.freeze({
  '/': 'Home', '/dashboard': 'Dashboard', '/create': 'New delivery', '/sharing': 'Delivery sharing',
  '/billing': 'Billing', '/library': 'Image Library', '/portfolio/manage': 'Portfolio editor',
  '/portfolio/enquiries': 'Portfolio enquiries', '/portfolio': 'About Portfolio', '/settings': 'Settings',
  '/formats': 'Delivery types', '/photoswap': 'About Photo Swap', '/gridboard': 'About GridBoard',
  '/pricing': 'Plans and pricing', '/contact': 'Support', '/signup': 'Create an account',
  '/signin': 'Sign in', '/onboarding': 'Studio setup', '/changelog': 'Product updates',
  '/forgot-password': 'Reset password', '/verify-email': 'Verify email', '/reset-password': 'Choose a password',
  '/privacy': 'Privacy', '/terms': 'Terms', '/refund-policy': 'Refund policy', '/fair-use': 'Fair use',
  '/about': 'About Veylo', '/client-experience': 'Client experience', '/product': 'Veylo product', '/video-delivery': 'About video delivery', '/videos/library': 'Video library'
});
export const ASSISTANT_STEPS = ['details', 'format', 'photos', 'preparing', 'captions', 'showcase', 'narration', 'narration-job', 'music', 'design', 'style', 'access', 'publish', 'published', 'work', 'studio', 'projects', 'appearance', 'categories', 'services', 'client-feedback', 'faqs', 'publishing', 'presentation'];
export const ASSISTANT_EVENTS = ['page-opened', 'step-opened', 'upload-started', 'upload-ended', 'upload-failed', 'draft-edited', 'form-clean', 'preview-opened', 'request-failed', 'writing-applied'];
export const ASSISTANT_KINDS = ['showcase', 'pinboard', 'photoswap', 'portfolio', 'video'];
export const CONTEXT_TTL = 30 * 60 * 1000;
export function safeAssistantPage(path) { return Object.hasOwn(ASSISTANT_PAGES, path) ? path : ''; }
export function contextLabel(context) {
  const kind = { showcase: 'Showcase', pinboard: 'GridBoard', photoswap: 'PhotoSwap', portfolio: 'Portfolio', video: 'Video delivery' }[context?.workflow?.kind];
  const step = context?.workflow?.step?.replaceAll('-', ' ');
  return [kind || ASSISTANT_PAGES[context?.page] || 'Veylo', step && step[0].toUpperCase() + step.slice(1)].filter(Boolean).join(' · ');
}
export function trimActivity(events, now = Date.now()) {
  return events.filter(event => ASSISTANT_EVENTS.includes(event.event) && safeAssistantPage(event.page) && Number.isFinite(event.at) && event.at <= now && now - event.at < CONTEXT_TTL).slice(-20);
}
