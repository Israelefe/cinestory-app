import { escapeHtml } from './deliveryShell.js';
import { sectionVisible, servicePrice } from '../src/services/portfolioContent.mjs';
const e = escapeHtml;
export const scriptJson = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
export function publishedPortfolioHtml(data) {
  const p = data.portfolio;
  if (!p) return '';
  const content = p.content, project = p.projects.find(item => item.id === data.projectId), category = content.categoryDetails.find(item => item.id === data.categoryId);
  const projectOrder = project ? [project.coverId, ...project.photoIds.filter(id => id !== project.coverId)] : [];
  const photos = project ? projectOrder.map(id => p.items.find(item => item.id === id)).filter(Boolean) : p.items.filter(item => category ? item.category === category.name : item.featured !== false);
  const title = project?.title || category?.name || p.headline || p.studioName;
  const block = (heading, text) => text ? `<h3>${e(heading)}</h3><p>${e(text)}</p>` : '';
  const base = new URL(data.canonical).origin;
  const photoUrl = url => url?.startsWith('/api/') ? `${base}${url}` : url;
  const about = p.direction.showBio && sectionVisible(content, 'about') ? `<section><h2>About ${e(p.studioName)}</h2><p>${e(content.profile.about || p.bio)}</p>${block('Where we work', content.profile.serviceAreas)}${block('Travel', content.profile.travel)}</section>` : '';
  const services = sectionVisible(content, 'services') && content.services.length ? `<section><h2>Services</h2>${content.services.map(service => `<article><h3>${e(service.title)}</h3><p>${e(service.description)}</p><p>${e(servicePrice(service))}</p>${block('Coverage', service.coverage)}${block('You receive', service.deliverables)}${block('Delivery', service.turnaround)}</article>`).join('')}</section>` : '';
  const testimonials = sectionVisible(content, 'testimonials') && content.testimonials.length ? `<section><h2>Client feedback</h2>${content.testimonials.filter(item => item.permission).map(item => `<blockquote><p>${e(item.quote)}</p><footer>${e(item.attribution)}</footer></blockquote>`).join('')}</section>` : '';
  const process = sectionVisible(content, 'process') && content.process.length ? `<section><h2>How we work</h2><ol>${content.process.map(item => `<li><h3>${e(item.title)}</h3><p>${e(item.description)}</p></li>`).join('')}</ol></section>` : '';
  const faqs = sectionVisible(content, 'faqs') && content.faqs.length ? `<section><h2>Questions before your shoot</h2>${content.faqs.map(item => block(item.question, item.answer)).join('')}</section>` : '';
  const sections = { about, services, testimonials, process, faqs };
  const links = p.projects.map(item => `<a href="${e(`${base}/@${p.handle}/projects/${item.id}`)}">${e(item.title)}</a>`).join('');
  const details = project && ([project.shootType, project.location, project.venue, project.brief, project.approach, project.credits].some(Boolean) || project.narrative.length) ? `<section><h2>About this shoot</h2>${[['Shoot', project.shootType], ['Location', project.location], ['Venue', project.venue], ['The brief', project.brief], ['Our approach', project.approach], ['Credits', project.credits]].map(([title, text]) => block(title, text)).join('')}${project.narrative.map(item => block(item.title, item.text)).join('')}</section>` : '';
  return `<main id="portfolio-server-preview" style="max-width:1000px;margin:auto;padding:40px 24px;background:#08080b;color:#f4eee8;font-family:Arial,sans-serif;line-height:1.8"><header><p>${e(p.studioName)}</p></header><h1>${e(title)}</h1><p>${e(project?.description || category?.description || p.introLine || p.bio)}</p>${p.direction.showLocation && p.location ? `<p>${e(p.location)}</p>` : ''}<section aria-label="Photographs">${photos.map((photo, index) => `<figure><img src="${e(photoUrl(photo.url))}" alt="${e(photo.alt || photo.title || `Photograph by ${p.studioName}`)}" width="${Number(photo.width) || 800}" height="${Number(photo.height) || 1000}" loading="${index ? 'lazy' : 'eager'}" style="max-width:100%;height:auto"/>${p.direction.showPhotoTitles && photo.title ? `<figcaption>${e(photo.title)}</figcaption>` : ''}</figure>`).join('')}</section>${links ? `<nav aria-label="Projects">${links}</nav>` : ''}${details}${content.sections.map(section => section.visible ? sections[section.id] : '').join('')}${p.direction.showContact && !content.contact.showcaseOnly ? `<section><h2>Enquiries</h2>${p.whatsapp ? `<a href="https://wa.me/${e(p.whatsapp)}?text=${encodeURIComponent(`Hello ${p.studioName}, I would like to ask about a shoot. ${data.canonical}`)}">Ask about a shoot on WhatsApp</a>` : ''}${content.contact.email ? `<p><a href="mailto:${encodeURIComponent(content.contact.email)}">Email the studio</a></p>` : ''}${content.contact.formEnabled ? '<p>Enable JavaScript to send an enquiry through this page.</p>' : ''}</section>` : ''}<footer>Portfolio by Veylo</footer></main>`;
}
export function portfolioStructuredData(data) {
  const p = data.portfolio;
  if (!p) return '';
  return `<script type="application/ld+json">${scriptJson({ '@context': 'https://schema.org', '@type': 'ProfessionalService', name: p.studioName, url: data.canonical, description: data.description, image: data.image, ...(p.direction.showLocation && p.location ? { location: { '@type': 'Place', name: p.location } } : {}), ...(sectionVisible(p.content, 'about') && p.content.profile.serviceAreas ? { areaServed: p.content.profile.serviceAreas } : {}), ...(!p.content.contact.showcaseOnly && p.direction.showContact && p.content.contact.email ? { email: p.content.contact.email } : {}) })}</script>`;
}
