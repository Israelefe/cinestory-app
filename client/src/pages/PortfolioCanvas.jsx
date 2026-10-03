import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Instagram, MessageCircle, X, Image as ImageIcon } from 'lucide-react';
import { directionDefaults, instagramName, readableColors, whatsappNumber } from '../services/portfolio.js';
import { findPortfolioDesign } from '../components/portfolioDesigns.js';
import { usePortfolioReducedMotion } from '../components/usePortfolioReducedMotion.js';
import { portfolioPresentation, portfolioCategoryLabel, photoId } from '../services/portfolioPresentation.js';
import './PortfolioCanvas.css';

function Photograph({ item, eager = false, studioName, full = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.url]);
  if (failed) return <span className="vpc-image-error"><ImageIcon size={24} /><span>Photograph unavailable</span><span>Try reopening this photograph when you are connected.</span></span>;
  return <img data-photo-id={photoId(item)} src={item.url || item.thumbnailUrl} srcSet={item.srcSet || undefined} sizes={full ? '100vw' : '(min-width:1024px) 45vw,(min-width:640px) 48vw,94vw'} width={item.width || undefined} height={item.height || undefined} alt={item.alt || item.title || `${item.category || 'Photograph'} by ${studioName}`} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" style={{ objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%` }} onError={() => setFailed(true)} />;
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
      {photos.map((photo, index) => <button key={photo.id || photo.publicId} className={`vpc-filmstrip-photo crop-${photo.crop || 'fit'}`} type="button" onClick={event => onOpen(photo, event, photos)} aria-label={`View ${photo.title || `photograph ${index + 1}`}`}><Photograph item={photo} studioName={studioName} /></button>)}
    </div>
  </div>;
}

export default function PortfolioCanvas({ portfolio, preview = false, projectId = '', onPhotoOpen, onFilter, onProjectOpen, onContact }) {
  const reduced = usePortfolioReducedMotion();
  const [category, setCategory] = useState(null);
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
  const canContact = direction.showContact && (whatsapp || instagramValid);
  const path = `/@${encodeURIComponent(portfolio.handle || '')}${activeProject ? `/projects/${encodeURIComponent(activeProject.id)}` : ''}`;
  const pageUrl = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  const enquiry = `Hello ${portfolio.studioName}, I would like to ask about a shoot.${activeProject ? ` I was looking at ${activeProject.title}.` : ''} ${pageUrl}`;
  const whatsappHref = `https://wa.me/${whatsapp}?text=${encodeURIComponent(enquiry)}`;
  const headline = activeProject?.title || selectedCategory || portfolio.headline || portfolio.studioName || 'Your photographs';
  const studioLocation = direction.showLocation ? portfolio.location : '';
  const viewerCollection = activeProject?.title || selectedCategory || 'Main gallery';
  const viewerCaption = viewerPhotos[activePhoto]?.title || (viewerPhotos[activePhoto]?.category ? portfolioCategoryLabel(viewerPhotos[activePhoto].category, categories) : '');

  useEffect(() => { setCategory(null); setActivePhoto(-1); }, [projectId, previewProject, portfolio.handle, template]);
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
  function contact(event, route) { if (preview) event.preventDefault(); else onContact?.(route, activeProject?.id); }
  function chooseCategory(name) {
    categoryNavigationRef.current = { name };
    setCategory(name);
    onFilter?.(name);
  }
  function returnToMain(event, top = false) {
    event?.preventDefault();
    categoryNavigationRef.current = { name: selectedCategory, top };
    setCategory(null);
    onFilter?.('Main gallery');
  }
  const reveal = (index = 0, kind = 'photo') => still ? { initial: false, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0 } } : {
    initial: { opacity: 0, y: expressive ? template === 'gallery' ? 14 : 30 : 10, ...(expressive && template === 'cinema' && kind === 'photo' ? { scale: 1.025 } : {}) },
    whileInView: { opacity: 1, y: 0, scale: 1 }, viewport: { once: true, amount: .08 },
    transition: { duration: expressive ? .7 : .35, delay: Math.min(index % 3 * .07, .14), ease: [.22, 1, .36, 1] }
  };
  const heading = <motion.div {...reveal(0, 'text')} className="vpc-hero-heading"><h1 tabIndex={-1}>{headline}</h1></motion.div>;
  const comparableCopy = value => String(value || '').toLowerCase().replace(/[\s\p{P}]+/gu, '');
  const openingText = activeProject ? activeProject.description : selectedCategory ? '' : portfolio.introLine || (direction.showBio ? portfolio.bio : '');
  const introduction = comparableCopy(openingText) !== comparableCopy(headline) ? openingText : '';
  const studioBio = !activeProject && !selectedCategory && direction.showBio && portfolio.introLine && ![headline, introduction].some(copy => comparableCopy(copy) === comparableCopy(portfolio.bio)) ? portfolio.bio : '';
  const openingCopy = introduction && <motion.div {...reveal(1, 'text')} className="vpc-hero-copy"><p className="vpc-intro">{introduction}</p></motion.div>;
  const openingCover = openingPhoto && <motion.figure key={itemId(openingPhoto)} {...(template === 'cinema' ? { initial: still ? false : { opacity: 0 }, animate: { opacity: 1 }, exit: still ? undefined : { opacity: 0 }, transition: { duration: still ? 0 : expressive ? .6 : .25 } } : reveal())} className={`vpc-cover crop-${openingPhoto.crop || 'fit'}`}><button type="button" onClick={event => openPhoto(openingPhoto, event)} aria-label={`View ${openingPhoto.title || 'cover photograph'}`}><Photograph item={openingPhoto} studioName={portfolio.studioName} eager full={template === 'cinema'} /></button>{direction.showPhotoTitles && openingPhoto.title && <figcaption><span>{openingPhoto.title}</span></figcaption>}</motion.figure>;
  const projectsSection = projectCards.length > 0 && <section id={projectsId} className="vpc-projects"><motion.header {...reveal(0, 'text')} className="vpc-work-head"><h2>Projects</h2></motion.header><div className="vpc-project-grid">{projectCards.map(({ project, image }, index) => {
    const contents = <>{image && <Photograph item={image} studioName={portfolio.studioName} />}<span><strong>{project.title || 'Untitled project'}</strong><span>View project<ArrowUpRight size={18} /></span></span></>;
    return <motion.article {...reveal(index)} key={project.id} className={`vpc-project-entry ${image ? '' : 'is-text'}`}>
      {preview ? <button onClick={() => { setPreviewProject(project.id); scrollToTarget(canvasRef.current); }} className="vpc-project-card">{contents}</button> : <Link onClick={() => onProjectOpen?.(project.id)} to={`/@${portfolio.handle}/projects/${project.id}`} className="vpc-project-card">{contents}</Link>}
    </motion.article>;
  })}</div></section>;
  const otherCategories = categories.filter(name => name !== selectedCategory);
  const categoriesSection = otherCategories.length > 0 && <motion.section ref={categoryBrowserRef} {...reveal(0, 'text')} className="vpc-category-browser"><h2>{selectedCategory ? 'Other categories' : 'Categories'}</h2><nav className="vpc-categories" aria-label="Choose a category">{otherCategories.map(name => <button key={name} data-category={name} onClick={() => chooseCategory(name)}><span>{name}</span><ArrowUpRight size={18} /></button>)}</nav></motion.section>;

  return <div ref={canvasRef} id={topId} data-design={template} data-motion={still ? 'still' : direction.motion} className={`v-portfolio-canvas design-${template} is-${direction.background} type-${direction.typeStyle} rhythm-${direction.rhythm} layout-${direction.layout} ${activeProject ? 'is-project' : ''} ${selectedCategory ? 'is-category' : ''} ${!openingPhoto ? 'has-no-cover' : ''}`} style={{ '--portfolio-accent': colors.accent, '--portfolio-accent-text': colors.accentText, '--portfolio-button-text': colors.buttonText }}>
    <header className="vpc-header"><a href={`#${topId}`} onClick={event => selectedCategory ? returnToMain(event, true) : scrollTo(event, topId)} className="vpc-brand">{portfolio.studioName || 'Your studio'}</a><nav className="vpc-header-right" aria-label="Studio navigation"><a href={`#${workId}`} onClick={event => selectedCategory ? returnToMain(event, true) : scrollTo(event, workId)}>Work</a>{canContact && <a href={`#${contactId}`} onClick={event => scrollTo(event, contactId)}>Contact<ArrowUpRight size={13} /></a>}</nav></header>
    <main className="vpc-main">
      {activeProject && (preview ? <button className="vpc-back" onClick={() => setPreviewProject('')}><ArrowLeft size={16} />Back to portfolio</button> : <Link className="vpc-back" to={`/@${portfolio.handle}`}><ArrowLeft size={16} />Back to portfolio</Link>)}
      <section key={`${template}-${activeProject?.id || selectedCategory || 'home'}`} className="vpc-hero">
        {selectedCategory ? <><button className="vpc-back" onClick={returnToMain}><ArrowLeft size={16} />Back to main gallery</button>{heading}</> : template === 'cinema' ? <><div className="vpc-cinema-stage">{openingCover}{heading}</div>{openingCopy}</> : template === 'folio' ? <><div className="vpc-folio-opening"><div className={`vpc-folio-covers ${!companion ? 'is-single' : ''}`}>{openingCover}{companion && <motion.figure key={itemId(companion)} {...reveal(1)} className={`vpc-companion crop-${companion.crop || 'fit'}`}><button type="button" onClick={event => openPhoto(companion, event)} aria-label={`View ${companion.title || 'second cover photograph'}`}><Photograph item={companion} studioName={portfolio.studioName} /></button></motion.figure>}</div>{heading}</div>{openingCopy && <div className="vpc-opening-bottom">{openingCopy}</div>}</> : <>{openingCover}{heading}{openingCopy}</>}

      </section>
      <section id={workId} className="vpc-work" aria-label={selectedCategory || 'Main gallery'}>
        <div key={`${template}-${selectedCategory}`} className="vpc-work-groups">{groups.map(group => <section key={group.name} className={`vpc-work-group ${group.photos.length === 2 ? 'has-pair' : ''}`}>{template === 'cinema' ? <PhotoRail key={`${template}-${selectedCategory}`} photos={group.photos} studioName={portfolio.studioName} onOpen={(photo, event) => openPhoto(photo, event)} still={still} label={group.name || 'Main gallery'} /> : <motion.div className="vpc-gallery" initial={still ? false : { opacity: .35 }} animate={{ opacity: 1 }} transition={{ duration: still ? 0 : .25 }}>{group.photos.map((photo, index) => <motion.figure {...reveal(index)} key={itemId(photo)} className={`vpc-photo photo-${index % 6} crop-${photo.crop || 'fit'}`}><button type="button" onClick={event => openPhoto(photo, event)} aria-label={`View ${photo.title || `photograph ${index + 1}`}`}><Photograph item={photo} studioName={portfolio.studioName} /></button>{direction.showPhotoTitles && photo.title && <figcaption><span>{photo.title}</span></figcaption>}</motion.figure>)}</motion.div>}</section>)}{!visible.length && !projectCards.length && <p className="vpc-empty">{preview ? 'Your photographs will appear here.' : 'There are no photographs in this category.'}</p>}</div>
      </section>
      {projectsSection}
      {categoriesSection}
      {canContact && <motion.section {...reveal(0, 'text')} id={contactId} className="vpc-contact"><div><p className="vpc-eyebrow">For bookings and enquiries</p><h2>Let’s talk about<br />your next shoot.</h2>{studioBio && <p className="vpc-contact-bio">{studioBio}</p>}{studioLocation && <p className="vpc-studio-location">{studioLocation}</p>}</div><div className="vpc-contact-actions">{whatsapp && <a href={preview ? '#' : whatsappHref} onClick={event => contact(event, 'whatsapp')} target={preview ? undefined : '_blank'} rel="noopener noreferrer"><MessageCircle size={18} />{portfolio.contactLabel || 'Ask about a shoot'}<ArrowUpRight size={18} /></a>}{instagramValid && <a className="vpc-social" href={preview ? '#' : `https://instagram.com/${instagramValid}`} onClick={event => contact(event, 'instagram')} target={preview ? undefined : '_blank'} rel="noopener noreferrer"><Instagram size={18} />@{instagramValid}</a>}</div></motion.section>}
      {!canContact && (studioBio || studioLocation) && <motion.section {...reveal(0, 'text')} className="vpc-about"><h2>About the studio</h2>{studioBio && <p>{studioBio}</p>}{studioLocation && <p className="vpc-studio-location">{studioLocation}</p>}</motion.section>}
    </main>
    <footer className="vpc-footer"><span>{portfolio.studioName || 'Your studio'}</span><a href={preview ? '#' : '/'} onClick={preview ? event => event.preventDefault() : undefined}>Portfolio by Veylo</a></footer>
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
