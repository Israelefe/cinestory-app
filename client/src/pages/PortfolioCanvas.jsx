import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Instagram, MapPin, MessageCircle, X, Image as ImageIcon } from 'lucide-react';
import { directionDefaults, instagramName, readableColors, whatsappNumber } from '../services/portfolio.js';
import './PortfolioCanvas.css';
function Photograph({
  item,
  eager = false,
  studioName,
  full = false
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.url]);
  if (failed) return <span className="vpc-image-error"><ImageIcon size={24} /><span>Photograph unavailable</span><span>Try reopening this photograph when you are connected.</span></span>;
  return <img src={item.url || item.thumbnailUrl} srcSet={item.srcSet || undefined} sizes={full ? '100vw' : '(min-width:1024px) 45vw,(min-width:640px) 48vw,94vw'} width={item.width || undefined} height={item.height || undefined} alt={item.alt || item.title || `${item.category || 'Photograph'} by ${studioName}`} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" style={{
    objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%`
  }} onError={() => setFailed(true)} />;
}
export default function PortfolioCanvas({
  portfolio,
  preview = false,
  projectId = '',
  onPhotoOpen,
  onFilter,
  onProjectOpen,
  onContact
}) {
  const reduced = useReducedMotion();
  const [category, setCategory] = useState('All');
  const [previewProject, setPreviewProject] = useState('');
  const [activePhoto, setActivePhoto] = useState(-1);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const dialogRef = useRef(null);
  const canvasRef = useRef(null);
  const triggerRef = useRef(null);
  const touchRef = useRef(null);
  const historyRef = useRef(false);
  const direction = {
    ...directionDefaults,
    ...(portfolio.direction || {})
  };
  const colors = readableColors(direction);
  const items = portfolio.items || [];
  const projects = portfolio.projects || [];
  const itemId = item => item.id || item.publicId;
  const activeProject = projects.find(project => project.id === (preview ? previewProject : projectId));
  const photos = activeProject ? activeProject.photoIds.map(id => items.find(item => itemId(item) === id)).filter(Boolean) : items.filter(item => item.featured !== false);
  const cover = activeProject ? photos.find(photo => itemId(photo) === activeProject.coverId) || photos[0] : items.find(photo => itemId(photo) === portfolio.heroId || photo.publicId === portfolio.heroPublicId) || photos[0];
  const categories = useMemo(() => [...new Set(photos.map(photo => photo.category).filter(value => value && value !== 'Selected work'))], [portfolio.items, activeProject?.id, activeProject?.photoIds]);
  const visible = category === 'All' ? photos : photos.filter(photo => photo.category === category);
  const prefix = preview === 'compact' ? 'compact' : preview ? 'preview' : 'public';
  const workId = `${prefix}-portfolio-work`;
  const contactId = `${prefix}-portfolio-contact`;
  const topId = `${prefix}-portfolio-top`;
  const digits = whatsappNumber(portfolio.whatsapp);
  const instagram = instagramName(portfolio.instagram);
  const whatsapp = /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
  const instagramValid = /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(instagram) ? instagram : '';
  const canContact = direction.showContact && (whatsapp || instagramValid);
  const path = `/@${encodeURIComponent(portfolio.handle || '')}${activeProject ? `/projects/${encodeURIComponent(activeProject.id)}` : ''}`;
  const pageUrl = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  const enquiry = `Hello ${portfolio.studioName}, I would like to ask about a shoot.${activeProject ? ` I was looking at ${activeProject.title}.` : ''} ${pageUrl}`;
  const whatsappHref = `https://wa.me/${whatsapp}?text=${encodeURIComponent(enquiry)}`;
  const contactHref = whatsapp ? whatsappHref : `https://instagram.com/${instagramValid}`;
  useEffect(() => {
    setCategory('All');
    setActivePhoto(-1);
  }, [projectId, previewProject, portfolio.handle]);
  useEffect(() => {
    if (category !== 'All' && !categories.includes(category)) setCategory('All');
  }, [categories, category]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (activePhoto >= 0 && !dialog?.open) dialog?.showModal();
    if (activePhoto < 0 && dialog?.open) {
      dialog.close();
      triggerRef.current?.focus();
    }
  }, [activePhoto]);
  useEffect(() => {
    const pop = () => {
      historyRef.current = false;
      setActivePhoto(-1);
    };
    if (!preview) window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [preview]);
  function closePhoto() {
    if (!preview && historyRef.current && window.history.state?.portfolioPhoto) {
      historyRef.current = false;
      window.history.back();
    } else setActivePhoto(-1);
  }
  function openPhoto(photo, event, collection = visible) {
    const next = collection.some(item => itemId(item) === itemId(photo)) ? collection : [photo];
    triggerRef.current = event.currentTarget;
    setViewerPhotos(next);
    setActivePhoto(next.findIndex(item => itemId(item) === itemId(photo)));
    if (!preview) {
      historyRef.current = true;
      window.history.pushState({
        ...window.history.state,
        portfolioPhoto: true
      }, '', window.location.href);
    }
    onPhotoOpen?.(items.findIndex(item => itemId(item) === itemId(photo)), photo.category, activeProject?.id);
  }
  function movePhoto(offset) {
    setActivePhoto(index => (index + offset + viewerPhotos.length) % viewerPhotos.length);
  }
  function scrollTo(event, id) {
    if (preview) {
      event.preventDefault();
      (id === topId ? canvasRef.current : canvasRef.current?.querySelector(`#${id}`))?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  }
  function contact(event, route) {
    if (preview) event.preventDefault();else onContact?.(route, activeProject?.id);
  }
  const reveal = reduced || direction.motion === 'still' ? {
    initial: false
  } : {
    initial: {
      opacity: 0,
      y: 12
    },
    whileInView: {
      opacity: 1,
      y: 0
    },
    viewport: {
      once: true,
      amount: .08
    },
    transition: {
      duration: .35
    }
  };
  return <div ref={canvasRef} id={topId} className={`v-portfolio-canvas is-${direction.background} type-${direction.typeStyle} rhythm-${direction.rhythm} layout-${direction.layout}`} style={{
    '--portfolio-accent': colors.accent,
    '--portfolio-accent-text': colors.accentText,
    '--portfolio-button-text': colors.buttonText
  }}>
    <header className="vpc-header"><a href={`#${topId}`} onClick={event => scrollTo(event, topId)} className="vpc-brand">{portfolio.studioName || 'Your studio'}</a><nav className="vpc-header-right" aria-label="Studio navigation"><a href={`#${workId}`} onClick={event => scrollTo(event, workId)}>Work</a>{canContact && <a href={`#${contactId}`} onClick={event => scrollTo(event, contactId)}>Contact</a>}</nav></header>
    <main className="vpc-main">
      {activeProject && (preview ? <button className="vpc-back" onClick={() => setPreviewProject('')}><ArrowLeft size={16} />Back to portfolio</button> : <Link className="vpc-back" to={`/@${portfolio.handle}`}><ArrowLeft size={16} />Back to portfolio</Link>)}
      <section className="vpc-hero"><div className="vpc-hero-heading"><p className="vpc-eyebrow">{activeProject ? activeProject.category : portfolio.location && direction.showLocation ? portfolio.location : 'Selected photographs'}</p><h1>{activeProject?.title || portfolio.headline || portfolio.studioName || 'Your photographs'}</h1></div>
        {cover && <motion.figure {...reveal} className={`vpc-cover crop-${cover.crop || 'fit'}`}><button type="button" onClick={event => openPhoto(cover, event, photos)} aria-label={`View ${cover.title || 'cover photograph'}`}><Photograph item={cover} studioName={portfolio.studioName} eager /></button>{direction.showPhotoTitles && cover.title && <figcaption>{cover.title}</figcaption>}</motion.figure>}
        <div className="vpc-hero-copy">{activeProject ? activeProject.description && <p className="vpc-intro">{activeProject.description}</p> : <>{portfolio.introLine && <p className="vpc-intro">{portfolio.introLine}</p>}{direction.showBio && portfolio.bio && <p className="vpc-bio">{portfolio.bio}</p>}</>}{direction.showLocation && portfolio.location && <span className="vpc-hero-location"><MapPin size={16} />{portfolio.location}</span>}{canContact && <a className="vpc-hero-contact" href={preview ? '#' : contactHref} onClick={event => contact(event, whatsapp ? 'whatsapp' : 'instagram')} target={preview ? undefined : '_blank'} rel="noopener noreferrer">{whatsapp ? <MessageCircle size={18} /> : <Instagram size={18} />}{whatsapp ? portfolio.contactLabel || 'Ask about a shoot' : 'Message on Instagram'}</a>}</div>
      </section>
      <section id={workId} className="vpc-work"><header className="vpc-work-head"><div><p className="vpc-eyebrow">{activeProject ? 'The project' : 'The photographs'}</p><h2>{activeProject ? 'Inside the shoot' : 'Selected work'}</h2></div><span>{visible.length} {visible.length === 1 ? 'photograph' : 'photographs'}</span></header>
        {direction.showCategories && categories.length > 1 && <nav className="vpc-categories" aria-label="Filter photographs by category">{['All', ...categories].map(name => <button key={name} aria-pressed={category === name} className={category === name ? 'is-active' : ''} onClick={() => {
            setCategory(name);
            onFilter?.(name);
          }}>{name}</button>)}</nav>}
        <div className="vpc-gallery">{visible.map((photo, index) => <motion.figure {...reveal} key={itemId(photo)} className={`vpc-photo photo-${index % 6} crop-${photo.crop || 'fit'}`}><button onClick={event => openPhoto(photo, event)} aria-label={`View ${photo.title || `${photo.category || 'photograph'} ${index + 1}`}`}><Photograph item={photo} studioName={portfolio.studioName} /></button>{direction.showPhotoTitles && (photo.title || photo.category !== 'Selected work') && <figcaption><span>{photo.title || photo.category}</span>{photo.title && photo.category !== 'Selected work' && <small>{photo.category}</small>}</figcaption>}</motion.figure>)}{!visible.length && <p className="vpc-empty">{preview ? 'Your selected photographs will appear here.' : 'There are no photographs in this category.'}</p>}</div>
      </section>
      {!activeProject && projects.length > 0 && <section className="vpc-projects"><header className="vpc-work-head"><div><p className="vpc-eyebrow">A closer look</p><h2>Projects</h2></div></header><div className="vpc-project-grid">{projects.map(project => {
            const cover = items.find(item => itemId(item) === project.coverId);
            const contents = <>{cover && <Photograph item={cover} studioName={portfolio.studioName} />}<span><small>{project.category}</small><strong>{project.title || 'Untitled project'}</strong><span>{project.photoIds.length} photographs<ArrowRight size={18} /></span></span></>;
            return preview ? <button key={project.id} onClick={() => {
              setPreviewProject(project.id);
              canvasRef.current?.scrollIntoView({
                block: 'start'
              });
            }} className="vpc-project-card">{contents}</button> : <Link key={project.id} onClick={() => onProjectOpen?.(project.id)} to={`/@${portfolio.handle}/projects/${project.id}`} className="vpc-project-card">{contents}</Link>;
          })}</div></section>}
      {canContact && <section id={contactId} className="vpc-contact"><div><p className="vpc-eyebrow">For bookings and enquiries</p><h2>Let’s talk about<br />your next shoot.</h2></div><div className="vpc-contact-actions">{whatsapp && <a href={preview ? '#' : whatsappHref} onClick={event => contact(event, 'whatsapp')} target={preview ? undefined : '_blank'} rel="noopener noreferrer"><MessageCircle size={18} />{portfolio.contactLabel || 'Ask about a shoot'}</a>}{instagramValid && <a className="vpc-social" href={preview ? '#' : `https://instagram.com/${instagramValid}`} onClick={event => contact(event, 'instagram')} target={preview ? undefined : '_blank'} rel="noopener noreferrer"><Instagram size={18} />@{instagramValid}</a>}</div></section>}
    </main><footer className="vpc-footer"><span>{portfolio.studioName || 'Your studio'}</span><a href={preview ? '#' : '/'} onClick={preview ? event => event.preventDefault() : undefined}>Portfolio by Veylo</a></footer>
    <dialog ref={dialogRef} className="vpc-lightbox" onCancel={event => {
      event.preventDefault();
      closePhoto();
    }} onClose={() => setActivePhoto(-1)} onClick={event => {
      if (event.target === event.currentTarget) closePhoto();
    }} onKeyDown={event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        movePhoto(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        movePhoto(1);
      }
    }} aria-label="Photograph viewer">
      {activePhoto >= 0 && viewerPhotos[activePhoto] && <div className="vpc-lightbox-content" onTouchStart={event => {
        touchRef.current = event.touches[0]?.clientX;
      }} onTouchEnd={event => {
        const delta = (event.changedTouches[0]?.clientX || 0) - touchRef.current;
        if (touchRef.current !== null && Math.abs(delta) > 50) movePhoto(delta > 0 ? -1 : 1);
        touchRef.current = null;
      }}><button className="vpc-lightbox-close" onClick={closePhoto} aria-label="Close photograph"><X size={22} /></button>{viewerPhotos.length > 1 && <button className="vpc-lightbox-prev" onClick={() => movePhoto(-1)} aria-label="Previous photograph"><ArrowLeft size={22} /></button>}<figure><Photograph key={itemId(viewerPhotos[activePhoto])} item={viewerPhotos[activePhoto]} studioName={portfolio.studioName} eager full /><figcaption>{viewerPhotos[activePhoto].title || viewerPhotos[activePhoto].category}<span aria-live="polite">{activePhoto + 1} / {viewerPhotos.length}</span></figcaption></figure>{viewerPhotos.length > 1 && <button className="vpc-lightbox-next" onClick={() => movePhoto(1)} aria-label="Next photograph"><ArrowRight size={22} /></button>}</div>}
    </dialog>
  </div>;
}
