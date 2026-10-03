export const PORTFOLIO_LIMITS = Object.freeze({ services: 6, testimonials: 6, faqs: 8, process: 5, profileMedia: 2 });
export const PORTFOLIO_SECTIONS = ['about', 'services', 'testimonials', 'process', 'faqs'];
export const PROFILE_FIELDS = ['specialties', 'about', 'serviceAreas', 'travel', 'portraitId', 'logoId'];
export const PROJECT_FIELDS = ['shootType', 'location', 'venue', 'brief', 'approach', 'credits'];
export const categoryIdentity = name => {
  let hash = 2166136261;
  for (const character of String(name).trim().replace(/\s+/g, ' ').toLowerCase()) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `c-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
const text = value => typeof value === 'string' ? value : '';
export function normalizePortfolioContent(value = {}, categories = []) {
  const profile = value.profile || {}, contact = value.contact || {}, share = value.share || {};
  const sections = (value.sections || []).filter(section => PORTFOLIO_SECTIONS.includes(section.id));
  const details = categories.map(name => {
    const prior = (value.categoryDetails || []).find(detail => detail.name?.trim().toLowerCase() === name.trim().toLowerCase());
    return { id: prior?.id || categoryIdentity(name), name, description: text(prior?.description), coverId: text(prior?.coverId) };
  });
  return {
    profile: Object.fromEntries(PROFILE_FIELDS.map(key => [key, text(profile[key])])),
    contact: { email: text(contact.email), formEnabled: contact.formEnabled === true, showcaseOnly: contact.showcaseOnly === true, responseNote: text(contact.responseNote) },
    services: (value.services || []).map(service => ({ id: service.id, title: text(service.title), description: text(service.description), coverage: text(service.coverage), deliverables: text(service.deliverables), turnaround: text(service.turnaround), priceMode: service.priceMode || 'hidden', price: service.price ?? 0, priceMax: service.priceMax ?? 0, projectIds: [...(service.projectIds || [])] })),
    testimonials: (value.testimonials || []).map(review => ({ id: review.id, quote: text(review.quote), attribution: text(review.attribution), context: text(review.context), projectId: text(review.projectId), permission: review.permission === true })),
    process: (value.process || []).map(step => ({ id: step.id, title: text(step.title), description: text(step.description) })),
    faqs: (value.faqs || []).map(faq => ({ id: faq.id, question: text(faq.question), answer: text(faq.answer) })),
    categoryDetails: details,
    sections: [...sections.map(section => ({ id: section.id, visible: section.visible !== false })), ...PORTFOLIO_SECTIONS.filter(id => !sections.some(section => section.id === id)).map(id => ({ id, visible: true }))],
    homeMode: value.homeMode === 'projects' ? 'projects' : 'gallery',
    galleryArrangement: ['grid', 'columns'].includes(value.galleryArrangement) ? value.galleryArrangement : 'design',
    mobileEnquiry: value.mobileEnquiry === true,
    share: { title: text(share.title), description: text(share.description), coverId: text(share.coverId) }
  };
}
export const normalizeProjectDetails = project => ({ ...Object.fromEntries(PROJECT_FIELDS.map(key => [key, text(project[key])])), narrative: (project.narrative || []).map(block => ({ id: block.id, title: text(block.title), text: text(block.text) })), relatedIds: [...(project.relatedIds || [])] });
export const sectionVisible = (content, id) => !content?.sections?.some(section => section.id === id && section.visible === false);
export function contentReadiness(content = {}) {
  const errors = [];
  for (const service of sectionVisible(content, 'services') ? content.services || [] : []) {
    if (!service.title || !service.description) errors.push('Give each service a title and description.');
    if (service.priceMode === 'range' && service.priceMax < service.price) errors.push('The upper price must be at least the starting price.');
  }
  for (const review of sectionVisible(content, 'testimonials') ? content.testimonials || [] : []) if (!review.quote || !review.attribution || !review.permission) errors.push('Add real feedback, attribution and permission before publishing a testimonial.');
  for (const faq of sectionVisible(content, 'faqs') ? content.faqs || [] : []) if (!faq.question || !faq.answer) errors.push('Complete each question and answer before publishing.');
  for (const step of sectionVisible(content, 'process') ? content.process || [] : []) if (!step.title || !step.description) errors.push('Complete each process step before publishing.');
  return [...new Set(errors)];
}
export function repairPortfolioReferences(portfolio) {
  if (!portfolio.content) return portfolio;
  const content = normalizePortfolioContent(portfolio.content, portfolio.categories || []), photos = new Set(portfolio.items.map(item => item.id)), projects = new Set(portfolio.projects.map(project => project.id));
  content.categoryDetails.forEach(detail => { if (!portfolio.items.some(item => item.id === detail.coverId && item.category === detail.name)) detail.coverId = ''; });
  if (!photos.has(content.share.coverId)) content.share.coverId = '';
  content.services.forEach(service => { service.projectIds = service.projectIds.filter(id => projects.has(id)); });
  content.testimonials.forEach(review => { if (!projects.has(review.projectId)) review.projectId = ''; });
  return { ...portfolio, content, projects: portfolio.projects.map(project => ({ ...project, relatedIds: (project.relatedIds || []).filter(id => projects.has(id) && id !== project.id) })) };
}
export function servicePrice(service) {
  const amount = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
  return service.priceMode === 'starting' ? `From ${amount(service.price)}` : service.priceMode === 'range' ? `${amount(service.price)} – ${amount(service.priceMax)}` : service.priceMode === 'quote' ? 'Request a quote' : '';
}
