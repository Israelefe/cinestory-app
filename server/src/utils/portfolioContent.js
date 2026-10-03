import { z } from 'zod';
import { PORTFOLIO_LIMITS, PORTFOLIO_SECTIONS, sectionVisible } from '../shared/portfolioContent.mjs';
const text = max => z.string().trim().max(max).default('');
const id = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);
const reference = text(80);
const unique = rows => new Set(rows.map(row => row.id)).size === rows.length;
export const projectDetailsSchema = {
  shootType: text(100), location: text(120), venue: text(120), brief: text(600), approach: text(800), credits: text(300),
  narrative: z.array(z.object({ id, title: text(100), text: text(800) }).strict()).max(6).refine(unique, 'Each project section needs a different ID.').default([]),
  relatedIds: z.array(id).max(8).default([])
};
export const portfolioContentSchema = z.object({
  profile: z.object({ specialties: text(140), about: text(1200), serviceAreas: text(180), travel: text(240), portraitId: reference, logoId: reference }).strict().default({}),
  contact: z.object({ email: text(254), formEnabled: z.boolean().default(false), showcaseOnly: z.boolean().default(false), responseNote: text(240) }).strict().default({}),
  services: z.array(z.object({ id, title: text(100), description: text(600), coverage: text(180), deliverables: text(300), turnaround: text(180), priceMode: z.enum(['hidden', 'starting', 'range', 'quote']).default('hidden'), price: z.number().int().min(0).max(1e9).default(0), priceMax: z.number().int().min(0).max(1e9).default(0), projectIds: z.array(id).max(8).default([]) }).strict()).max(PORTFOLIO_LIMITS.services).refine(unique, 'Each service needs a different ID.').default([]),
  testimonials: z.array(z.object({ id, quote: text(600), attribution: text(100), context: text(100), projectId: reference, permission: z.boolean().default(false) }).strict()).max(PORTFOLIO_LIMITS.testimonials).refine(unique, 'Each testimonial needs a different ID.').default([]),
  process: z.array(z.object({ id, title: text(100), description: text(400) }).strict()).max(PORTFOLIO_LIMITS.process).refine(unique).default([]),
  faqs: z.array(z.object({ id, question: text(180), answer: text(800) }).strict()).max(PORTFOLIO_LIMITS.faqs).refine(unique).default([]),
  categoryDetails: z.array(z.object({ id, name: z.string().trim().min(1).max(50), description: text(400), coverId: reference }).strict()).max(100).refine(unique, 'Each category needs a different ID.').default([]),
  sections: z.array(z.object({ id: z.enum(PORTFOLIO_SECTIONS), visible: z.boolean() }).strict()).max(PORTFOLIO_SECTIONS.length).refine(unique, 'Each section can appear once.').default([]),
  homeMode: z.enum(['gallery', 'projects']).default('gallery'), galleryArrangement: z.enum(['design', 'grid', 'columns']).default('design'), mobileEnquiry: z.boolean().default(false),
  share: z.object({ title: text(100), description: text(240), coverId: reference }).strict().default({})
}).strict().default({});
export function contentErrors(snapshot, publish = false) {
  const { content, profileMedia = [], projects, items } = snapshot;
  const errors = [], projectIds = new Set(projects.map(project => project.id)), mediaIds = new Set(profileMedia.map(item => item.id)), photoIds = new Set(items.map(item => item.id));
  if (new Set(profileMedia.map(item => item.publicId)).size !== profileMedia.length) errors.push('Choose each profile image once.');
  for (const role of ['portraitId', 'logoId']) if (content.profile[role] && !mediaIds.has(content.profile[role])) errors.push('Choose a profile image from your approved selection.');
  for (const category of content.categoryDetails) if (category.coverId && !items.some(item => item.id === category.coverId && item.category === category.name)) errors.push('Choose the category cover from its photographs.');
  for (const project of projects) if (project.relatedIds?.some(id => !projectIds.has(id) || id === project.id)) errors.push('Choose another available project for related work.');
  for (const service of content.services) if (service.projectIds.some(id => !projectIds.has(id))) errors.push('Choose available projects for your services.');
  for (const review of content.testimonials) if (review.projectId && !projectIds.has(review.projectId)) errors.push('Choose an available project for the testimonial.');
  if (content.share.coverId && !photoIds.has(content.share.coverId)) errors.push('Choose a sharing cover from your portfolio photographs.');
  if (publish) {
    if (content.contact.email && !z.email().safeParse(content.contact.email).success) errors.push('Enter a valid public email address.');
    for (const service of sectionVisible(content, 'services') ? content.services : []) {
      if (!service.title || !service.description) errors.push('Give each service a title and description.');
      if (service.priceMode === 'range' && service.priceMax < service.price) errors.push('The upper price must be at least the starting price.');
    }
    for (const review of sectionVisible(content, 'testimonials') ? content.testimonials : []) if (!review.quote || !review.attribution || !review.permission) errors.push('Add real feedback, attribution and permission before publishing a testimonial.');
    for (const faq of sectionVisible(content, 'faqs') ? content.faqs : []) if (!faq.question || !faq.answer) errors.push('Complete each question and answer before publishing.');
    for (const step of sectionVisible(content, 'process') ? content.process : []) if (!step.title || !step.description) errors.push('Complete each process step before publishing.');
    for (const project of projects) if (project.narrative?.some(block => !block.text)) errors.push('Complete each project narrative section before publishing.');
  }
  return errors;
}
