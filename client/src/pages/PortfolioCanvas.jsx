import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Instagram, MapPin, MessageCircle, X } from 'lucide-react';
import './PortfolioCanvas.css';

const directionDefaults = {
  background: 'ink', accent: '#ff9b8e', typeStyle: 'editorial', rhythm: 'measured', layout: 'editorial', motion: 'subtle',
  showBio: true, showLocation: true, showCategories: true, showPhotoTitles: true, showContact: true
};

export default function PortfolioCanvas({ portfolio, preview = false, onPhotoOpen, onFilter }) {
  const reduced = useReducedMotion();
  const [category, setCategory] = useState('All');
  const [activePhoto, setActivePhoto] = useState(-1);
  const dialogRef = useRef(null);
  const canvasRef = useRef(null);
  const direction = { ...directionDefaults, ...(portfolio.direction || {}) };
  const idPrefix = preview === 'compact' ? 'compact-' : preview ? 'full-' : 'public-';
  const topId = `${idPrefix}portfolio-top`;
  const workId = `${idPrefix}portfolio-work`;
  const contactId = `${idPrefix}portfolio-contact`;
  const photos = portfolio.items || [];
  const categories = useMemo(() => [...new Set(photos.map(photo => photo.category).filter(category => category && category !== 'Selected work'))], [photos]);
  const cover = photos.find(photo => photo.publicId === portfolio.heroPublicId) || photos[0];
  const gallery = photos.filter(photo => photo.publicId !== cover?.publicId);
  const visiblePhotos = category === 'All' ? gallery : photos.filter(photo => photo.category === category);
  const whatsappDigits = String(portfolio.whatsapp || '').replace(/\D/g, '');
  const instagram = String(portfolio.instagram || '').replace(/^@/, '');
  const canContact = direction.showContact && (whatsappDigits || instagram);
  const allPhotos = photos;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activePhoto >= 0 && !dialog.open) dialog.showModal();
    if (activePhoto < 0 && dialog.open) dialog.close();
  }, [activePhoto]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const onClose = () => setActivePhoto(-1);
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  function chooseCategory(next) {
    setCategory(next);
    onFilter?.(next);
  }

  function followPreviewLink(event, targetId) {
    if (!preview) return;
    event.preventDefault();
    const target = targetId === topId ? canvasRef.current : canvasRef.current?.querySelector(`#${targetId}`);
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  function openPhoto(photo) {
    const index = allPhotos.findIndex(item => item.publicId === photo.publicId);
    if (index < 0) return;
    setActivePhoto(index);
    onPhotoOpen?.(index, photo.category);
  }

  function movePhoto(offset) {
    setActivePhoto(index => (index + offset + allPhotos.length) % allPhotos.length);
  }

  const contactHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(`Hello ${portfolio.studioName}, I found your portfolio on Veylo and would like to ask about a shoot.`)}`
    : instagram ? `https://instagram.com/${instagram}` : '';

  return <div ref={canvasRef} id={topId} className={`v-portfolio-canvas is-${direction.background} type-${direction.typeStyle} rhythm-${direction.rhythm} layout-${direction.layout}${preview === 'compact' ? ' is-preview' : ''}`} style={{ '--portfolio-accent': direction.accent }}>
    <header className="vpc-header">
      <a href={`#${topId}`} onClick={event => followPreviewLink(event, topId)} className="vpc-brand">{portfolio.studioName || 'Your studio'}</a>
      <div className="vpc-header-right">
        <a href={`#${workId}`} onClick={event => followPreviewLink(event, workId)}>Work</a>
        {canContact && <a href={`#${contactId}`} onClick={event => followPreviewLink(event, contactId)}>Contact</a>}
      </div>
    </header>

    <main className="vpc-main">
      <section className={`vpc-hero${cover ? ' has-cover' : ''}`}>
        <div className="vpc-hero-copy">
          <p className="vpc-eyebrow">{portfolio.studioName || 'Photographer'} / Portfolio</p>
          <h1>{portfolio.headline || portfolio.studioName || 'Your photographs'}</h1>
          {portfolio.introLine && <p className="vpc-intro">{portfolio.introLine}</p>}
          {direction.showBio && portfolio.bio && <p className="vpc-bio">{portfolio.bio}</p>}
          {direction.showLocation && portfolio.location && <span className="vpc-hero-location"><MapPin size={14} />{portfolio.location}</span>}
        </div>
        {cover && <motion.figure className="vpc-cover" initial={reduced || direction.motion === 'still' ? false : { opacity: 0, y: 12 }} whileInView={direction.motion === 'still' ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: reduced || direction.motion === 'still' ? 0 : 0.45 }}>
          <button type="button" onClick={() => openPhoto(cover)} aria-label={`View ${cover.title || cover.category || 'cover photograph'}`}>
            <img src={cover.url || cover.thumbnailUrl} alt={cover.title || `${portfolio.studioName} portfolio cover`} fetchPriority="high" />
          </button>
          {direction.showPhotoTitles && (cover.title || (cover.category && cover.category !== 'Selected work')) && <figcaption><span>{cover.title || cover.category}</span>{cover.title && cover.category && cover.category !== 'Selected work' && <small>{cover.category}</small>}</figcaption>}
        </motion.figure>}
      </section>

      <section id={workId} className="vpc-work">
        <header className="vpc-work-head"><div><p className="vpc-eyebrow">The photographs</p><h2>Selected work</h2></div><span>{photos.length} photographs</span></header>
        {direction.showCategories && categories.length > 1 && <nav className="vpc-categories" aria-label="Filter photographs by category">
          {['All', ...categories].map(name => <button type="button" key={name} aria-pressed={category === name} className={category === name ? 'is-active' : ''} onClick={() => chooseCategory(name)}>{name}</button>)}
        </nav>}
        <div className={`vpc-gallery${visiblePhotos.length ? '' : ' is-empty'}`}>
          {visiblePhotos.map((photo, index) => <motion.figure key={photo.publicId} className={`vpc-photo photo-${index % 6}`} initial={reduced || direction.motion === 'still' ? false : { opacity: 0, y: 15 }} whileInView={direction.motion === 'still' ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: reduced || direction.motion === 'still' ? 0 : 0.4, delay: reduced || direction.motion === 'still' ? 0 : Math.min(index % 3, 2) * 0.04 }}>
            <button type="button" onClick={() => openPhoto(photo)} aria-label={`View ${photo.title || photo.category || `photograph ${index + 2}`}`}>
              <img src={photo.url || photo.thumbnailUrl} alt={photo.title || `${photo.category || 'Selected work'} by ${portfolio.studioName}`} loading="lazy" decoding="async" />
            </button>
            {direction.showPhotoTitles && (photo.title || (photo.category && photo.category !== 'Selected work')) && <figcaption><span>{photo.title || photo.category}</span><small>{photo.category && photo.category !== 'Selected work' && photo.title ? photo.category : ''}</small></figcaption>}
          </motion.figure>)}
          {!visiblePhotos.length && <p className="vpc-empty">No photographs in this category yet.</p>}
        </div>
      </section>

      {canContact && <section id={contactId} className="vpc-contact">
        <div><p className="vpc-eyebrow">For bookings and enquiries</p><h2>Contact {portfolio.studioName || 'the studio'}</h2></div>
        <div className="vpc-contact-actions">
          {whatsappDigits && <a href={preview ? '#' : contactHref} onClick={preview ? event => event.preventDefault() : undefined} target={preview ? undefined : '_blank'} rel={preview ? undefined : 'noreferrer'}><MessageCircle size={17} />{portfolio.contactLabel || 'Ask about a shoot'}</a>}
          {instagram && <a className="vpc-social" href={preview ? '#' : `https://instagram.com/${instagram}`} onClick={preview ? event => event.preventDefault() : undefined} target={preview ? undefined : '_blank'} rel={preview ? undefined : 'noreferrer'}><Instagram size={17} />@{instagram}</a>}
        </div>
      </section>}
    </main>

    <footer className="vpc-footer"><span>{portfolio.studioName || 'Your studio'}</span><a href={preview ? '#' : '/'} onClick={preview ? event => event.preventDefault() : undefined}>Portfolio by Veylo</a></footer>

    <dialog ref={dialogRef} className="vpc-lightbox" onClick={event => { if (event.target === event.currentTarget) setActivePhoto(-1); }} onKeyDown={event => { if (event.key === 'ArrowLeft') movePhoto(-1); if (event.key === 'ArrowRight') movePhoto(1); }} onClose={() => setActivePhoto(-1)} aria-label="Photograph viewer">
      {activePhoto >= 0 && allPhotos[activePhoto] && <div className="vpc-lightbox-content">
        <button type="button" className="vpc-lightbox-close" onClick={() => setActivePhoto(-1)} aria-label="Close photograph"><X size={21} /></button>
        {allPhotos.length > 1 && <button type="button" className="vpc-lightbox-prev" onClick={() => movePhoto(-1)} aria-label="Previous photograph"><ArrowLeft size={20} /></button>}
        <figure><img src={allPhotos[activePhoto].url || allPhotos[activePhoto].thumbnailUrl} alt={allPhotos[activePhoto].title || `${allPhotos[activePhoto].category || 'Photograph'} by ${portfolio.studioName}`} /><figcaption>{allPhotos[activePhoto].title || allPhotos[activePhoto].category || portfolio.studioName}</figcaption></figure>
        {allPhotos.length > 1 && <button type="button" className="vpc-lightbox-next" onClick={() => movePhoto(1)} aria-label="Next photograph"><ArrowRight size={20} /></button>}
      </div>}
    </dialog>
  </div>;
}
