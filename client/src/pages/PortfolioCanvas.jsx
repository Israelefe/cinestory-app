import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Instagram, MessageCircle, Mail, Share2, Menu, X, Image as ImageIcon } from 'lucide-react';
import { directionDefaults, instagramName, readableColors, whatsappNumber } from '../services/portfolio.js';
import { findPortfolioDesign } from '../components/portfolioDesigns.js';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { portfolioPresentation, portfolioCategoryLabel, photoId } from '../services/portfolioPresentation.js';
import { normalizePortfolioContent, sectionVisible, servicePrice } from '../services/portfolioContent.mjs';
import PortfolioEnquiryForm from '../components/PortfolioEnquiryForm.jsx';
import './PortfolioCanvas.css';

function Photograph({ item, eager = false, studioName, full = false, linked = false, onRetryAvailable }) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => setFailed(false), [item.url]);
  const retryPhoto = () => { setRetry(value => value + 1); setFailed(false); };
  if (failed) return <span className="vpc-image-error"><ImageIcon size={24} /><span>Photograph unavailable</span><span>Check your connection.</span>{linked ? <span>Open the project to try again.</span> : onRetryAvailable ? <span className="vpc-retry">Retry photograph</span> : <button type="button" className="vpc-retry" onClick={retryPhoto}>Retry photograph</button>}</span>;
  const retryUrl = url => retry && url ? `${url}${url.includes('?') ? '&' : '?'}retry=${retry}` : url;
  return <img data-photo-id={photoId(item)} src={retryUrl(item.url || item.thumbnailUrl)} srcSet={retry ? undefined : item.srcSet || undefined} sizes={full ? '100vw' : '(min-width:1024px) 45vw,(min-width:640px) 48vw,94vw'} width={item.width || undefined} height={item.height || undefined} alt={item.alt || item.title || `${item.category || 'Photograph'} by ${studioName}`} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" style={{ objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%` }} onError={() => { setFailed(true); onRetryAvailable?.(retryPhoto); }} />;
}
function PhotoButton({ item, studioName, eager, full, onClick, children, ...props }) {
  const [unavailable, setUnavailable] = useState(false), retryRef = useRef(null);
  useEffect(() => setUnavailable(false), [item.url]);
  return <button {...props} type="button" aria-label={unavailable ? 'Retry photograph' : props['aria-label']} onClick={event => { if (unavailable) { setUnavailable(false); retryRef.current?.(); } else onClick?.(event); }}><Photograph item={item} studioName={studioName} eager={eager} full={full} onRetryAvailable={callback => { retryRef.current = callback; setUnavailable(true); }} />{children}</button>;
}

function PhotoRail({ photos, studioName, onOpen, still, label = 'Featured photographs', compact = false }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(0);
  const move = offset => {
    const rail = ref.current;
    const step = rail.children[1] ? rail.children[1].offsetLeft - rail.children[0].offsetLeft : rail.clientWidth;
    rail.scrollBy({ left: step * offset, behavior: still ? 'instant' : 'smooth' });
  };
  return <div className={`vpc-filmstrip ${compact ? 'is-compact' : ''} ${photos.length === 1 ? 'is-single' : ''}`}>
    <div className="vpc-filmstrip-top"><span aria-hidden="true">Scroll to browse</span><div><button type="button" aria-label={`Previous ${label.toLowerCase()}`} disabled={!position} onClick={() => move(-1)}><ArrowLeft size={16} /></button><button type="button" aria-label={`Next ${label.toLowerCase()}`} disabled={position >= photos.length - 1} onClick={() => move(1)}><ArrowRight size={16} /></button></div></div>
    <div ref={ref} className="vpc-filmstrip-track" role="region" aria-label={label === 'Photographs' ? label : `${label} photographs`} tabIndex={0} onKeyDown={event => {
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    }} onScroll={event => {
      const rail = event.currentTarget;
      const step = rail.children[1] ? rail.children[1].offsetLeft - rail.children[0].offsetLeft : rail.clientWidth;
      setPosition(Math.min(photos.length - 1, Math.max(0, Math.round(rail.scrollLeft / step))));
    }}>
      {photos.map((photo, index) => <PhotoButton item={photo} studioName={studioName} key={photo.id || photo.publicId} className={`vpc-filmstrip-photo crop-${photo.crop || 'fit'}`} onClick={event => onOpen(photo, event, photos)} aria-label={`View ${photo.title || `photograph ${index + 1}`}`} />)}
    </div>
  </div>;
}

export default function PortfolioCanvas({ portfolio, preview = false, projectId = '', categoryId = '', serviceId = '', onPhotoOpen, onFilter, onProjectOpen, onContact, onServiceOpen, onShare }) {
  const reduced = useVeyloReducedMotion();
  const content = normalizePortfolioContent(portfolio.content, portfolio.categories);
  const [category, setCategory] = useState(() => content.categoryDetails.find(item => item.id === categoryId)?.name || null);
  const [selectedService, setSelectedService] = useState(serviceId);
  const [shareState, setShareState] = useState('');
  const [previewProject, setPreviewProject] = useState('');
  const [activePhoto, setActivePhoto] = useState(-1);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const dialogRef = useRef(null), canvasRef = useRef(null), triggerRef = useRef(null), touchRef = useRef(null), historyRef = useRef(false);
  const categoryBrowserRef = useRef(null), categoryNavigationRef = useRef(null);
  const direction = { ...directionDefaults, ...(portfolio.direction || {}) };
  const template = findPortfolioDesign(direction.template).id;
  const still = reduced || direction.motion === 'still';
  const expressive = !still && direction.motion === 'expressive';
  const colors = readableColors(direction);
  const items = portfolio.items || [], projects = portfolio.projects || [];
  const itemId = item => item.id || item.publicId;
  const activeProject = projects.find(project => project.id === (preview ? previewProject : projectId));
  const photos = activeProject ? activeProject.photoIds.map(id => items.find(item => itemId(item) === id)).filter(Boolean) : items.filter(item => item.featured !== false);
  const cover = activeProject ? photos.find(photo => itemId(photo) === activeProject.coverId) || photos[0] : items.find(photo => (portfolio.heroId && itemId(photo) === portfolio.heroId) || (portfolio.heroPublicId && photo.publicId === portfolio.heroPublicId)) || photos[0];
  const { opening, companion, categories, selectedCategory, visible, groups, projectCards } = portfolioPresentation({ portfolio: { ...portfolio, direction }, photos, cover, template, category, activeProject: Boolean(activeProject) });
  const openingPhoto = opening[0];
  const prefix = preview === 'compact' ? 'compact' : preview ? 'preview' : 'public';
  const workId = `${prefix}-portfolio-work`, contactId = `${prefix}-portfolio-contact`, topId = `${prefix}-portfolio-top`, projectsId = `${prefix}-portfolio-projects`;
  const digits = whatsappNumber(portfolio.whatsapp), instagram = instagramName(portfolio.instagram);
  const whatsapp = /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
  const instagramValid = /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(instagram) ? instagram : '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.contact.email) ? content.contact.email : '';
  const canContact = direction.showContact && !content.contact.showcaseOnly && (whatsapp || instagramValid || email || content.contact.formEnabled);
  const categoryDetails = content.categoryDetails.find(item => item.name === selectedCategory);
  const services = sectionVisible(content, 'services') ? content.services.filter(item => item.title) : [];
  const activeService = services.find(item => item.id === selectedService);
  const query = new URLSearchParams();
  if (categoryDetails) query.set('category', categoryDetails.id);
  if (activeService) query.set('service', activeService.id);
  const path = `/@${encodeURIComponent(portfolio.handle || '')}${activeProject ? `/projects/${encodeURIComponent(activeProject.id)}` : ''}${query.size ? `?${query}` : ''}`;
  const pageUrl = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  const contextLabel = [activeProject?.title, selectedCategory, activeService?.title].filter(Boolean).join(' · ');
  const enquiry = `Hello ${portfolio.studioName}, I would like to ask about a shoot.${contextLabel ? ` I was looking at ${contextLabel}.` : ''} ${pageUrl}`;
  const whatsappHref = `https://wa.me/${whatsapp}?text=${encodeURIComponent(enquiry)}`;
  const headline = activeProject?.title || selectedCategory || portfolio.headline || portfolio.studioName || 'Your photographs';
  const studioLocation = direction.showLocation ? portfolio.location : '';
  const viewerCollection = activeProject?.title || selectedCategory || 'Main gallery';
  const viewerCaption = viewerPhotos[activePhoto]?.title || (viewerPhotos[activePhoto]?.category ? portfolioCategoryLabel(viewerPhotos[activePhoto].category, categories) : '');

  useEffect(() => { setCategory(content.categoryDetails.find(item => item.id === categoryId)?.name || null); setActivePhoto(-1); }, [categoryId, projectId, previewProject, portfolio.handle]);
  useEffect(() => { setSelectedService(serviceId); }, [serviceId]);
  useEffect(() => { if (category !== null && !categories.includes(category)) setCategory(null); }, [categories, category]);
  useEffect(() => {
    const navigation = categoryNavigationRef.current;
    if (!navigation) return;
    categoryNavigationRef.current = null;
    if (selectedCategory || navigation.top) {
      scrollToTarget(canvasRef.current);
      canvasRef.current?.querySelector('h1')?.focus({ preventScroll: true });
    } else {
      scrollToTarget(categoryBrowserRef.current);
      [...(categoryBrowserRef.current?.querySelectorAll('button') || [])].find(button => button.dataset.category === navigation.name)?.focus({ preventScroll: true });
    }
  }, [selectedCategory]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (activePhoto >= 0 && !dialog?.open) dialog?.showModal();
    if (activePhoto < 0 && dialog?.open) { dialog.close(); triggerRef.current?.focus(); }
  }, [activePhoto]);
  useEffect(() => {
    const pop = () => { historyRef.current = false; setActivePhoto(-1); };
    if (!preview) window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [preview]);

  function closePhoto() {
    if (!preview && historyRef.current && window.history.state?.portfolioPhoto) { historyRef.current = false; window.history.back(); }
    else setActivePhoto(-1);
  }
  function openPhoto(photo, event, collection = visible, sourceProjectId = activeProject?.id) {
    const next = collection.some(item => itemId(item) === itemId(photo)) ? collection : [photo];
    triggerRef.current = event.currentTarget; setViewerPhotos(next); setActivePhoto(next.findIndex(item => itemId(item) === itemId(photo)));
    if (!preview) { historyRef.current = true; window.history.pushState({ ...window.history.state, portfolioPhoto: true }, '', window.location.href); }
    onPhotoOpen?.(items.findIndex(item => itemId(item) === itemId(photo)), photo.category, sourceProjectId);
  }
  function movePhoto(offset) { if (viewerPhotos.length) setActivePhoto(index => (index + offset + viewerPhotos.length) % viewerPhotos.length); }
  function scrollTo(event, id) {
    event.preventDefault();
    scrollToTarget(id === topId ? canvasRef.current : canvasRef.current?.querySelector(`#${id}`));
  }
  function scrollToTarget(target) {
    if (!target) return;
    const viewport = canvasRef.current?.closest('[data-portfolio-scroll]');
    if (viewport) viewport.scrollTo({ top: viewport.scrollTop + target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientTop, behavior: still ? 'instant' : 'smooth' });
    else target.scrollIntoView({ behavior: still ? 'instant' : 'smooth', block: 'start' });
  }
  function contact(event, route) { if (preview) event.preventDefault(); else onContact?.(route, activeProject?.id, selectedCategory, activeService?.id); }
  function chooseCategory(name) {
    categoryNavigationRef.current = { name };
    setCategory(name);
    onFilter?.(name, content.categoryDetails.find(item => item.name === name)?.id);
  }
  function returnToMain(event, top = false) {
    event?.preventDefault();
    categoryNavigationRef.current = { name: selectedCategory, top };
    setCategory(null);
    onFilter?.('Main gallery', '');
  }
  async function share() {
    if (preview) { setShareState('Publish your portfolio to share this page.'); return; }
    try {
      if (navigator.share) await navigator.share({ title: `${headline} · ${portfolio.studioName}`, url: pageUrl });
      else { await navigator.clipboard.writeText(pageUrl); setShareState('Link copied.'); }
      onShare?.();
    } catch (error) { if (error.name !== 'AbortError') setShareState('Sharing is unavailable here. Copy this page’s address from your browser.'); }
  }
  const reveal = (index = 0, kind = 'photo') => still ? { initial: false, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0 } } : {
    initial: { opacity: 0, y: expressive ? template === 'gallery' ? 14 : 30 : 10, ...(expressive && template === 'cinema' && kind === 'photo' ? { scale: 1.025 } : {}) },
    whileInView: { opacity: 1, y: 0, scale: 1 }, viewport: { once: true, amount: .08 },
    transition: { duration: expressive ? .7 : .35, delay: Math.min(index % 3 * .07, .14), ease: [.22, 1, .36, 1] }
  };
  const heading = <motion.div {...reveal(0, 'text')} className="vpc-hero-heading"><h1 tabIndex={-1}>{headline}</h1></motion.div>;
  const comparableCopy = value => String(value || '').toLowerCase().replace(/[\s\p{P}]+/gu, '');
  const openingText = activeProject ? activeProject.description : selectedCategory ? categoryDetails?.description : portfolio.introLine || (direction.showBio ? portfolio.bio : '');
  const introduction = comparableCopy(openingText) !== comparableCopy(headline) ? openingText : '';
  const studioBio = !activeProject && !selectedCategory && direction.showBio && portfolio.introLine && ![headline, introduction].some(copy => comparableCopy(copy) === comparableCopy(portfolio.bio)) ? portfolio.bio : '';
  const openingCopy = introduction && <motion.div {...reveal(1, 'text')} className="vpc-hero-copy"><p className="vpc-intro">{introduction}</p></motion.div>;
  const openingCover = openingPhoto && <motion.figure key={itemId(openingPhoto)} {...(template === 'cinema' ? { initial: still ? false : { opacity: 0 }, animate: { opacity: 1 }, exit: still ? undefined : { opacity: 0 }, transition: { duration: still ? 0 : expressive ? .6 : .25 } } : reveal())} className={`vpc-cover crop-${openingPhoto.crop || 'fit'}`}><PhotoButton item={openingPhoto} studioName={portfolio.studioName} eager full={template === 'cinema'} onClick={event => openPhoto(openingPhoto, event)} aria-label={`View ${openingPhoto.title || 'cover photograph'}`} />{direction.showPhotoTitles && openingPhoto.title && <figcaption><span>{openingPhoto.title}</span></figcaption>}</motion.figure>;
  const projectsSection = projectCards.length > 0 && <section id={projectsId} className="vpc-projects"><motion.header {...reveal(0, 'text')} className="vpc-work-head"><h2>Projects</h2></motion.header><div className="vpc-project-grid">{projectCards.map(({ project, image }, index) => {
    const contents = <>{image && <Photograph linked item={image} studioName={portfolio.studioName} />}<span><strong>{project.title || 'Untitled project'}</strong><span>View project<ArrowUpRight size={18} /></span></span></>;
    return <motion.article {...reveal(index)} key={project.id} className={`vpc-project-entry ${image ? '' : 'is-text'}`}>
      {preview ? <button onClick={() => { setPreviewProject(project.id); scrollToTarget(canvasRef.current); }} className="vpc-project-card">{contents}</button> : <Link onClick={() => onProjectOpen?.(project.id)} to={`/@${portfolio.handle}/projects/${project.id}`} className="vpc-project-card">{contents}</Link>}
    </motion.article>;
  })}</div></section>;
  const otherCategories = categories.filter(name => name !== selectedCategory);
  const categoriesSection = otherCategories.length > 0 && <motion.section ref={categoryBrowserRef} {...reveal(0, 'text')} className="vpc-category-browser"><h2>{selectedCategory ? 'Other categories' : 'Categories'}</h2><nav className="vpc-categories" aria-label="Choose a category">{otherCategories.map(name => <button key={name} data-category={name} onClick={() => chooseCategory(name)}><span>{name}</span><ArrowUpRight size={18} /></button>)}</nav></motion.section>;
  const aboutId = `${prefix}-portfolio-about`, servicesId = `${prefix}-portfolio-services`;
  const portrait = portfolio.profileMedia?.find(item => item.id === content.profile.portraitId);
  const logo = portfolio.profileMedia?.find(item => item.id === content.profile.logoId);
  const hasAbout = direction.showBio && sectionVisible(content, 'about') && (content.profile.about || studioBio || content.profile.serviceAreas || content.profile.travel || portrait);
  const projectLink = project => preview ? <button onClick={() => { setPreviewProject(project.id); scrollToTarget(canvasRef.current); }}>{project.title}<ArrowUpRight size={16} /></button> : <Link to={`/@${portfolio.handle}/projects/${project.id}`} onClick={() => onProjectOpen?.(project.id)}>{project.title}<ArrowUpRight size={16} /></Link>;
  const sections = {
    about: hasAbout && <motion.section id={aboutId} {...reveal(0, 'text')} className={`vpc-business vpc-profile ${portrait ? 'has-portrait' : ''}`}><div><p className="vpc-eyebrow">THE PHOTOGRAPHER</p><h2>About {portfolio.studioName}</h2>{content.profile.about && <p>{content.profile.about}</p>}{studioBio && comparableCopy(studioBio) !== comparableCopy(content.profile.about) && <p>{studioBio}</p>}{content.profile.serviceAreas && <div><h3>Where we work</h3><p>{content.profile.serviceAreas}</p></div>}{content.profile.travel && <div><h3>Travel</h3><p>{content.profile.travel}</p></div>}</div>{portrait && <figure><Photograph item={portrait} studioName={portfolio.studioName} /></figure>}</motion.section>,
    services: services.length > 0 && <motion.section id={servicesId} {...reveal(0, 'text')} className="vpc-business"><p className="vpc-eyebrow">WORK WITH US</p><h2>Services</h2><div className="vpc-services">{services.map(service => <article key={service.id} className="vpc-service"><h3>{service.title}</h3><p>{service.description}</p>{servicePrice(service) && <strong className="vpc-service-price">{servicePrice(service)}</strong>}<dl>{[['Coverage', service.coverage], ['You receive', service.deliverables], ['Delivery', service.turnaround]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{service.projectIds?.length > 0 && <div className="vpc-related"><span>Relevant work</span>{service.projectIds.map(id => projects.find(project => project.id === id)).filter(Boolean).map(project => <React.Fragment key={project.id}>{projectLink(project)}</React.Fragment>)}</div>}{canContact && <button className="vpc-service-enquire" onClick={() => { setSelectedService(service.id); onServiceOpen?.(service.id); scrollToTarget(canvasRef.current?.querySelector(`#${contactId}`)); }}>Ask about {service.title}<ArrowUpRight size={17} /></button>}</article>)}</div></motion.section>,
    testimonials: sectionVisible(content, 'testimonials') && content.testimonials.some(item => item.quote && item.attribution && item.permission && (!activeProject || !item.projectId || item.projectId === activeProject.id)) && <motion.section {...reveal(0, 'text')} className="vpc-business"><p className="vpc-eyebrow">CLIENT FEEDBACK</p><h2>What clients say</h2><div className="vpc-testimonials">{content.testimonials.filter(item => item.quote && item.attribution && item.permission && (!activeProject || !item.projectId || item.projectId === activeProject.id)).map(item => <figure key={item.id}><blockquote>{item.quote}</blockquote><figcaption><strong>{item.attribution}</strong>{item.context && <span>{item.context}</span>}</figcaption>{projects.find(project => project.id === item.projectId) && projectLink(projects.find(project => project.id === item.projectId))}</figure>)}</div></motion.section>,
    process: sectionVisible(content, 'process') && content.process.some(item => item.title && item.description) && <motion.section {...reveal(0, 'text')} className="vpc-business"><p className="vpc-eyebrow">WHAT TO EXPECT</p><h2>How we work</h2><ol className="vpc-process">{content.process.filter(item => item.title && item.description).map(item => <li key={item.id}><h3>{item.title}</h3><p>{item.description}</p></li>)}</ol></motion.section>,
    faqs: sectionVisible(content, 'faqs') && content.faqs.some(item => item.question && item.answer) && <motion.section {...reveal(0, 'text')} className="vpc-business"><h2>Questions before your shoot</h2><div className="vpc-faqs">{content.faqs.filter(item => item.question && item.answer).map(item => <details key={item.id}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></motion.section>
  };
  const studioLinks = <><a href={`#${workId}`} onClick={event => selectedCategory ? returnToMain(event, true) : scrollTo(event, workId)}>Work</a>{hasAbout && <a href={`#${aboutId}`} onClick={event => scrollTo(event, aboutId)}>About</a>}{services.length > 0 && <a href={`#${servicesId}`} onClick={event => scrollTo(event, servicesId)}>Services</a>}{canContact && <a href={`#${contactId}`} onClick={event => scrollTo(event, contactId)}>Enquire<ArrowUpRight size={13} /></a>}</>;

  return <div ref={canvasRef} id={topId} data-design={template} data-motion={still ? 'still' : direction.motion} className={`v-portfolio-canvas design-${template} is-${direction.background} type-${direction.typeStyle} ${preview ? 'is-preview' : ''} ${canContact && content.mobileEnquiry ? 'has-mobile-enquiry' : ''} rhythm-${direction.rhythm} arrangement-${content.galleryArrangement} ${activeProject ? 'is-project' : ''} ${selectedCategory ? 'is-category' : ''} ${!openingPhoto ? 'has-no-cover' : ''}`} style={{ '--portfolio-accent': colors.accent, '--portfolio-accent-text': colors.accentText, '--portfolio-button-text': colors.buttonText }}>
    <header className="vpc-header"><a href={`#${topId}`} onClick={event => selectedCategory ? returnToMain(event, true) : scrollTo(event, topId)} className="vpc-brand">{logo && <img src={logo.thumbnailUrl || logo.url} alt={logo.alt || `${portfolio.studioName} logo`} />}{portfolio.studioName || 'Your studio'}</a><nav className="vpc-header-right" aria-label="Studio navigation">{studioLinks}</nav><details className="vpc-mobile-menu"><summary aria-label="Studio menu"><Menu size={20} /></summary><nav aria-label="Mobile studio navigation" onClick={event => { event.currentTarget.parentElement.removeAttribute('open'); }}>{studioLinks}</nav></details></header>
    <main className="vpc-main">
      {activeProject && (preview ? <button className="vpc-back" onClick={() => setPreviewProject('')}><ArrowLeft size={16} />Back to portfolio</button> : <Link className="vpc-back" to={`/@${portfolio.handle}`}><ArrowLeft size={16} />Back to portfolio</Link>)}
      <section key={`${template}-${activeProject?.id || selectedCategory || 'home'}`} className="vpc-hero">
        {selectedCategory ? <><button className="vpc-back" onClick={returnToMain}><ArrowLeft size={16} />Back to main gallery</button>{heading}{openingCopy}</> : template === 'cinema' ? <><div className="vpc-cinema-stage">{openingCover}{heading}</div>{openingCopy}</> : template === 'folio' ? <><div className="vpc-folio-opening"><div className={`vpc-folio-covers ${!companion ? 'is-single' : ''}`}>{openingCover}{companion && <motion.figure key={itemId(companion)} {...reveal(1)} className={`vpc-companion crop-${companion.crop || 'fit'}`}><PhotoButton item={companion} studioName={portfolio.studioName} onClick={event => openPhoto(companion, event)} aria-label={`View ${companion.title || 'second cover photograph'}`} /></motion.figure>}</div>{heading}</div>{openingCopy && <div className="vpc-opening-bottom">{openingCopy}</div>}</> : <>{openingCover}{heading}{openingCopy}</>}
        <div className="vpc-opening-details">{(studioLocation || content.profile.specialties) && <p>{[content.profile.specialties, studioLocation].filter(Boolean).join(' · ')}</p>}<div className="vpc-opening-actions">{canContact && <a className="vpc-primary" href={`#${contactId}`} onClick={event => scrollTo(event, contactId)}>Enquire<ArrowUpRight size={17} /></a>}<a href={`#${workId}`} onClick={event => scrollTo(event, workId)}>View work<ArrowRight size={17} /></a><button aria-label="Share this portfolio" onClick={share}><Share2 size={17} />Share</button></div>{shareState && <p role="status">{shareState}</p>}</div>

      </section>
      {categoriesSection}
      {content.homeMode === 'projects' && !activeProject && !selectedCategory && projectsSection}
      <section id={workId} className="vpc-work" aria-label={selectedCategory || 'Main gallery'}>
        <div key={`${template}-${selectedCategory}`} className="vpc-work-groups">{groups.map(group => <section key={group.name} className={`vpc-work-group ${group.photos.length === 2 ? 'has-pair' : ''}`}>{template === 'cinema' ? <PhotoRail key={`${template}-${selectedCategory}`} photos={group.photos} studioName={portfolio.studioName} onOpen={(photo, event) => openPhoto(photo, event)} still={still} label={group.name || 'Main gallery'} /> : <motion.div className="vpc-gallery" initial={still ? false : { opacity: .35 }} animate={{ opacity: 1 }} transition={{ duration: still ? 0 : .25 }}>{group.photos.map((photo, index) => <motion.figure {...reveal(index)} key={itemId(photo)} className={`vpc-photo photo-${index % 6} crop-${photo.crop || 'fit'}`}><PhotoButton item={photo} studioName={portfolio.studioName} onClick={event => openPhoto(photo, event)} aria-label={`View ${photo.title || `photograph ${index + 1}`}`} />{direction.showPhotoTitles && photo.title && <figcaption><span>{photo.title}</span></figcaption>}</motion.figure>)}</motion.div>}</section>)}{!visible.length && !projectCards.length && <p className="vpc-empty">{preview ? 'Your photographs will appear here.' : 'There are no photographs in this category.'}</p>}</div>
      </section>
      {(content.homeMode !== 'projects' || activeProject || selectedCategory) && projectsSection}
      {activeProject && ([activeProject.shootType, activeProject.location, activeProject.venue, activeProject.brief, activeProject.approach, activeProject.credits].some(Boolean) || activeProject.narrative?.length || activeProject.relatedIds?.length) && <motion.section {...reveal(0, 'text')} className="vpc-business vpc-project-details"><h2>About this shoot</h2><dl>{[['Shoot', activeProject.shootType], ['Location', activeProject.location], ['Venue', activeProject.venue]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{activeProject.brief && <div><h3>The brief</h3><p>{activeProject.brief}</p></div>}{activeProject.approach && <div><h3>Our approach</h3><p>{activeProject.approach}</p></div>}{activeProject.narrative?.filter(item => item.title || item.text).map(item => <div key={item.id}>{item.title && <h3>{item.title}</h3>}<p>{item.text}</p></div>)}{activeProject.credits && <div><h3>Credits</h3><p>{activeProject.credits}</p></div>}{activeProject.relatedIds?.length > 0 && <div className="vpc-related"><h3>Related work</h3>{activeProject.relatedIds.map(id => projects.find(project => project.id === id)).filter(Boolean).map(project => <React.Fragment key={project.id}>{projectLink(project)}</React.Fragment>)}</div>}</motion.section>}
      {content.sections.map(section => section.visible && sections[section.id] ? <React.Fragment key={section.id}>{sections[section.id]}</React.Fragment> : null)}
      {canContact && <motion.section {...reveal(0, 'text')} id={contactId} className={`vpc-contact ${content.contact.formEnabled ? 'has-form' : ''}`}><div><p className="vpc-eyebrow">For bookings and enquiries</p><h2>Let’s talk about<br />your next shoot.</h2>{contextLabel && <p className="vpc-enquiry-context">Enquiring about {contextLabel}{activeService && <button onClick={() => { setSelectedService(''); onServiceOpen?.(''); }}>Clear service</button>}</p>}{content.contact.responseNote && <p>{content.contact.responseNote}</p>}<div className="vpc-contact-actions">{whatsapp && <a href={preview ? '#' : whatsappHref} onClick={event => contact(event, 'whatsapp')} target={preview ? undefined : '_blank'} rel="noopener noreferrer"><MessageCircle size={18} />{portfolio.contactLabel || 'Ask about a shoot'}<ArrowUpRight size={18} /></a>}{instagramValid && <a className="vpc-social" href={preview ? '#' : `https://instagram.com/${instagramValid}`} onClick={event => contact(event, 'instagram')} target={preview ? undefined : '_blank'} rel="noopener noreferrer"><Instagram size={18} />@{instagramValid}</a>}{email && <a className="vpc-social" href={preview ? '#' : `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Shoot enquiry${contextLabel ? `: ${contextLabel}` : ''}`)}`} onClick={event => contact(event, 'email')}><Mail size={18} />Email the studio</a>}</div></div>{content.contact.formEnabled && <PortfolioEnquiryForm handle={portfolio.handle} preview={Boolean(preview)} context={{ projectId: activeProject?.id, categoryId: categoryDetails?.id, serviceId: activeService?.id, label: contextLabel }} />}</motion.section>}
    </main>
    <footer className="vpc-footer"><span>{portfolio.studioName || 'Your studio'}</span><a href={preview ? '#' : '/'} onClick={preview ? event => event.preventDefault() : undefined}>Portfolio by Veylo</a></footer>
    {canContact && content.mobileEnquiry && <div className="vpc-mobile-enquiry"><a href={`#${contactId}`} onClick={event => scrollTo(event, contactId)}>Ask about a shoot<ArrowUpRight size={17} /></a></div>}
    <dialog ref={dialogRef} className="vpc-lightbox" onCancel={event => { event.preventDefault(); closePhoto(); }} onClose={() => setActivePhoto(-1)} onClick={event => { if (event.target === event.currentTarget) closePhoto(); }} onKeyDown={event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); movePhoto(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); movePhoto(1); }
    }} aria-label="Photograph viewer">
      {activePhoto >= 0 && viewerPhotos[activePhoto] && <div className="vpc-lightbox-content" onTouchStart={event => { touchRef.current = event.touches[0]?.clientX; }} onTouchEnd={event => {
        const delta = (event.changedTouches[0]?.clientX || 0) - touchRef.current;
        if (touchRef.current !== null && Math.abs(delta) > 50) movePhoto(delta > 0 ? -1 : 1);
        touchRef.current = null;
      }}><button className="vpc-lightbox-close" onClick={closePhoto} aria-label="Close photograph"><X size={22} /></button>{viewerPhotos.length > 1 && <button className="vpc-lightbox-prev" onClick={() => movePhoto(-1)} aria-label="Previous photograph"><ArrowLeft size={22} /></button>}<AnimatePresence initial={false} mode="wait"><motion.figure key={itemId(viewerPhotos[activePhoto])} initial={still ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={still ? undefined : { opacity: 0, x: -8 }} transition={{ duration: still ? 0 : .16 }}><Photograph item={viewerPhotos[activePhoto]} studioName={portfolio.studioName} eager full /><figcaption>{viewerCaption}<span aria-live="polite">{activePhoto + 1} / {viewerPhotos.length}{viewerCollection && ` · ${viewerCollection}`}</span></figcaption></motion.figure></AnimatePresence>{viewerPhotos.length > 1 && <button className="vpc-lightbox-next" onClick={() => movePhoto(1)} aria-label="Next photograph"><ArrowRight size={22} /></button>}</div>}
    </dialog>
  </div>;
}
