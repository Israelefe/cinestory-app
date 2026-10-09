import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useInView, useMotionValue, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowRight, ChevronDown, Download, FileCheck2, Maximize2, Pause, Play } from 'lucide-react';
import { toast } from 'react-toastify';
import { Photo } from '../PublicDesign.jsx';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { CAMPAIGN_DEMO_PHOTOS } from '../../constants/campaignDemo.js';
import { DELIVERY_DEMO_DIMENSIONS } from '../../constants/deliveryDemoMetadata.js';
import { campaignPhotoKey, campaignPresentation, campaignSetAnchor } from '../../utils/campaignPresentation.js';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { useClosingGallery } from '../../utils/useClosingGallery.js';
import { DemoGallery, DemoHeader, formatFrameAttributes, formatFrameStyle, frameMotionTransition, frameMotionValues, getFormatThemeStyles, imageSrc, normalizeDeliveryPhotos } from '../../pages/FormatDemo.jsx';
import './CampaignDelivery.css';

const ease = [.22, 1, .36, 1];
const viewport = { once: true, amount: .12 };
const sequence = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: .7, ease, staggerChildren: .12 } } };
const piece = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: .8, ease } } };
const demoBranding = { type: 'studio', name: 'Mayflower Visuals', logoUrl: '' };
const driftPosition = value => `${(.5 - Math.max(0, Math.min(1, value))) * 5}%`;

function StudioIdentity({ branding }) {
  const [failedLogo, setFailedLogo] = useState('');
  const studio = branding?.type === 'studio';
  const name = branding?.name || (studio ? 'Your photographer' : 'Veylo');
  const logoUrl = branding?.logoUrl || '';
  return <motion.div className="cp-brand" initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={viewport} transition={{ duration: .6, ease }} onErrorCapture={event => {
    if (studio && event.target.tagName === 'IMG') setFailedLogo(logoUrl);
  }}>
    <DeliveryBrandMark branding={{ ...branding, name, logoUrl: failedLogo === logoUrl ? '' : logoUrl }} className="cp-brand-mark" />
    <div><span>{studio ? 'Photography by' : 'Delivered with'}</span><strong>{name}</strong></div>
  </motion.div>;
}

function CaptionCopy({ text, label }) {
  const end = text.search(/[.!?]\s+/);
  return <span className="cp-caption-copy">{label && <span className="cp-caption-label">{label}</span>}{end >= 12 && end < 90 ? <><strong>{text.slice(0, end + 1)}</strong>{text.slice(end + 1)}</> : text}</span>;
}

function normalizeCampaignPhotos(delivery, includeAll = false) {
  const labels = new Map((delivery?.formatConfig?.campaign?.assetLabels || []).map(item => [String(item.assetId), item.label]));
  return normalizeDeliveryPhotos(delivery, delivery ? [] : CAMPAIGN_DEMO_PHOTOS, includeAll).map(photo => ({ ...photo, campaignLabel: labels.get(campaignPhotoKey(photo)) || '' }));
}

function PhotoDrift({ target, visible, paused, children }) {
  const y = useMotionValue('0%');
  const { scrollYProgress } = useScroll({ target, offset: ['start end', 'end start'] });
  useMotionValueEvent(scrollYProgress, 'change', value => { if (visible && !paused) y.set(driftPosition(value)); });
  useEffect(() => { if (visible && !paused) y.set(driftPosition(scrollYProgress.get())); }, [visible, paused, y, scrollYProgress]);
  // A small overscan keeps the image edges inside its frame while it moves.
  return <motion.div className="cp-photo-drift" style={{ y, scale: 1.07 }}>{children}</motion.div>;
}

function PhotoMotion({ photo, index, paused, lead, children }) {
  const target = useRef(null);
  const visible = useInView(target);
  const controls = useAnimationControls();
  const reduced = useVeyloReducedMotion();
  const still = reduced || photo.motion === 'still';
  useEffect(() => {
    if (still) controls.set({ scale: 1, x: 0, y: 0 });
    else if (visible && !paused) controls.start({ ...frameMotionValues(photo), transition: frameMotionTransition(photo, index) });
    else controls.stop();
    return () => controls.stop();
  }, [controls, visible, paused, still, photo.motion, index]);
  return <motion.div ref={target} className="cp-photo-motion" initial={false} animate={controls}>
    {lead && !still ? <PhotoDrift target={target} visible={visible} paused={paused}>{children}</PhotoDrift> : children}
  </motion.div>;
}

function PhotoCard({ photo, position, paused, onOpen, label, index = 0, lead = false, entrance = 'fade', eager = false, highlight = false, showCaption = true, className = '', sizes = '(max-width: 767px) 92vw, 48vw' }) {
  const [loadedDimensions, setLoadedDimensions] = useState(null);
  const reduced = useVeyloReducedMotion();
  if (!photo) return null;
  const source = photo.url || photo.name;
  const dimensions = photo.width && photo.height ? photo : DELIVERY_DEMO_DIMENSIONS[source];
  const ratio = dimensions ? dimensions.width / dimensions.height : loadedDimensions?.source === source ? loadedDimensions.ratio : 1.5;
  const still = reduced || photo.motion === 'still';
  const revealPhoto = !still && entrance !== 'fade';
  const horizontal = entrance === 'across' || entrance === 'split';
  const uncovered = horizontal ? { scaleX: 0 } : { scaleY: 0 };
  const delay = Math.min(index % 3, 2) * .1;
  const settled = { opacity: 1, y: 0, scale: 1 };
  const caption = photo.caption || photo.headline;
  return <motion.figure className={`cp-photo-card ${className}`} data-photo-id={campaignPhotoKey(photo)} data-orientation={ratio < 1 ? 'portrait' : 'landscape'} data-highlight={highlight} {...formatFrameAttributes(photo)} style={{ ...formatFrameStyle(photo), '--cp-photo-ratio': ratio }}
    initial={{ opacity: 0, y: still ? 0 : 28, scale: still ? 1 : .99 }} animate={paused ? settled : undefined} whileInView={settled} viewport={viewport} transition={{ duration: paused ? 0 : .95, ease, delay: paused ? 0 : delay }}>
    <button type="button" className="cp-photo-button" onClick={() => onOpen(photo)} aria-label={label} onLoadCapture={event => {
      const image = event.target;
      if (!dimensions && image.tagName === 'IMG' && image.naturalWidth && image.naturalHeight) setLoadedDimensions({ source, ratio: image.naturalWidth / image.naturalHeight });
    }}>
      <PhotoMotion photo={photo} index={index} paused={paused} lead={lead}>
        <Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt || photo.caption || ''} eager={eager} sizes={sizes} style={photo.focalPoint ? { objectPosition: photo.focalPoint } : undefined} />
      </PhotoMotion>
      {revealPhoto && (entrance === 'split' ? ['left', 'right'] : [entrance === 'across' ? 'left' : 'bottom']).map(side => <motion.span key={side} className={`cp-photo-curtain${entrance === 'split' ? ` cp-curtain-${side}` : ''}`} aria-hidden="true" style={{ transformOrigin: side }} initial={horizontal ? { scaleX: 1 } : { scaleY: 1 }} animate={paused ? uncovered : undefined} whileInView={uncovered} viewport={viewport} transition={{ duration: paused ? 0 : 1.1, ease, delay: paused ? 0 : delay }} />)}
      <span className="cp-photo-open" aria-hidden="true"><Maximize2 size={16} /></span>
    </button>
    {showCaption && caption && <motion.figcaption className="vec-photo-caption" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={viewport} transition={{ duration: .7, delay: .12, ease }}>
      <span className="cp-photo-number" aria-hidden="true">{String(position).padStart(2, '0')}</span><CaptionCopy text={caption} label={photo.campaignLabel} />
    </motion.figcaption>}
  </motion.figure>;
}

function SetSpread({ set, paused, onOpen, positions, highlights, register, anchor }) {
  const heading = <motion.header className="cp-set-copy" variants={sequence} initial="hidden" whileInView="visible" viewport={viewport}>
    <motion.span className="cp-set-number" variants={piece} aria-hidden="true">{String(set.index + 1).padStart(2, '0')}</motion.span>
    <motion.div variants={piece}>{set.label && <span className="cp-set-label">{set.label}</span>}<h2 id={`${anchor}-title`}>{set.title}</h2></motion.div>
    {set.copy && <motion.p variants={piece}>{set.copy}</motion.p>}
  </motion.header>;
  const cards = set.photos.map((photo, index) => <PhotoCard key={campaignPhotoKey(photo)} photo={photo} index={index} position={positions.get(campaignPhotoKey(photo))} highlight={highlights.has(campaignPhotoKey(photo))} paused={paused} onOpen={onOpen} lead={index === 0} entrance={set.design === 'detail' ? index === 0 ? 'across' : 'up' : set.design === 'collection' ? 'up' : 'fade'} className={index === 0 ? 'cp-set-lead' : ''} label={`Open ${set.title} photograph ${index + 1}`} />);
  return <article ref={register} id={anchor} className="cp-set" data-design={set.design} data-layout={set.layout} data-count={set.photos.length} data-long-title={set.title.length > 40} tabIndex={-1} aria-labelledby={`${anchor}-title`} style={set.accent ? { '--cp-set-accent': set.accent } : undefined}>
    <motion.span className="cp-set-rule" aria-hidden="true" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={viewport} transition={{ duration: 1, ease }} />
    {set.design === 'collection' ? <><div className="cp-collection-opening">{cards[0]}{heading}</div>{cards.length > 1 && <div className="cp-set-photos cp-collection-support">{cards.slice(1)}</div>}</> : <>{heading}<div className="cp-set-photos">{cards}</div></>}
  </article>;
}

export function CampaignDeliveryViewer({ delivery, galleryProps: suppliedGalleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const instance = `campaign-${useId().replace(/:/g, '')}`;
  const viewer = useRef(null), navigation = useRef(null), menu = useRef(null);
  const setElements = useRef(new Map());
  const [gallery, setGallery] = useState(false), [galleryIndex, setGalleryIndex] = useState(null);
  const [demoLiked, setDemoLiked] = useState(() => new Set());
  const [activeSet, setActiveSet] = useState('');
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [navigationOffset, setNavigationOffset] = useState(100);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const { scrollYProgress } = useScroll({ target: viewer, offset: ['start start', 'end end'] });
  const photos = useMemo(() => normalizeCampaignPhotos(delivery), [delivery]);
  const collection = useMemo(() => normalizeCampaignPhotos(delivery, true), [delivery]);
  const { openingPhoto, closingPhoto, sets, galleryPhotos, highlights } = useMemo(() => campaignPresentation(delivery, photos, collection), [delivery, photos, collection]);
  const identity = `${delivery?.publicId || delivery?._id || 'campaign-demo'}:${photos.map(campaignPhotoKey).join('|')}`;
  const { galleryUnlocked, closingRef } = useClosingGallery(identity);
  const positions = useMemo(() => new Map(galleryPhotos.map((photo, index) => [campaignPhotoKey(photo), index + 1])), [galleryPhotos]);
  const title = delivery?.title || delivery?.clientName || 'Carry it forward';
  const opening = delivery?.creativeDirection?.openingLine || delivery?.brief || (delivery ? '' : 'A handbag, its details, and the places it goes.');
  const closing = delivery?.creativeDirection?.closingLine || 'The collection is yours.';
  const branding = delivery ? delivery.branding : demoBranding;
  const usage = delivery?.formatConfig?.usageTerms;
  const styles = getFormatThemeStyles(delivery, { bg: '#080b10', surface: '#111720', text: '#f3eee4', accent: '#d1a782', fontDisplay: "'Cormorant Garamond', Georgia, serif", fontBody: "'Manrope', sans-serif" });
  const hasPhotoMotion = [openingPhoto, closingPhoto, ...photos].some(photo => photo && photo.motion !== 'still');
  const paused = motionPaused || !pageVisible || gallery;
  const currentSet = sets.find(set => campaignSetAnchor(set) === activeSet) || sets[0];
  const titleWords = title.trim().split(/\s+/);
  const splitTitle = titleWords.length >= 3 && title.length <= 38;
  const galleryProps = suppliedGalleryProps || (!delivery ? {
    liked: demoLiked,
    onLike: key => setDemoLiked(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; }),
    onDownload: (key, index) => {
      const photo = galleryPhotos.find((item, at) => String(item.assetId || item.id || item.name || at) === String(key)) || galleryPhotos[index];
      if (!photo) return;
      const link = document.createElement('a');
      link.href = imageSrc(photo);
      link.download = `${String(photo.name || `photograph-${index + 1}`).split('/').pop().replace(/[^a-z0-9_-]+/gi, '-')}.webp`;
      document.body.appendChild(link); link.click(); link.remove();
    },
    onDownloadAll: () => toast.info('These are sample files. Open a photograph to download a sample.')
  } : {});
  const canDownloadAll = galleryUnlocked && galleryProps.onDownloadAll && delivery?.access?.allowDownloadAll !== false;

  useEffect(() => { setGallery(false); setGalleryIndex(null); setMotionPaused(false); }, [identity]);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const element = navigation.current;
    if (!element) return undefined;
    const measure = () => {
      const offset = Math.ceil((parseFloat(getComputedStyle(element).top) || 0) + element.getBoundingClientRect().height + 24);
      viewer.current?.style.setProperty('--cp-scroll-offset', `${offset}px`);
      setNavigationOffset(offset); setViewportHeight(window.innerHeight);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [sets.length, hasPhotoMotion]);
  useEffect(() => {
    setActiveSet(sets[0] ? campaignSetAnchor(sets[0]) : '');
    const observer = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (current) setActiveSet(current.target.dataset.setAnchor);
    }, { rootMargin: `-${navigationOffset}px 0px -${Math.max(0, viewportHeight - navigationOffset - 140)}px 0px`, threshold: 0 });
    setElements.current.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [sets, navigationOffset, viewportHeight]);
  useEffect(() => {
    const close = event => { if (menu.current && !menu.current.contains(event.target)) menu.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const openPhoto = photo => {
    const index = galleryPhotos.findIndex(item => campaignPhotoKey(item) === campaignPhotoKey(photo));
    if (index < 0) return;
    setGalleryIndex(index); setGallery(true); onNarrationNavigate?.(photo.assetId);
  };
  const browseSet = (event, set) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); menu.current.open = false;
    const element = setElements.current.get(campaignSetAnchor(set));
    element?.focus({ preventScroll: true }); element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <div ref={viewer} className="fd-page vec-campaign cp-viewer" data-heading-kind={styles['--delivery-font-heading'].includes('Georgia') ? 'serif' : 'sans'} data-photo-motion-paused={paused} data-composition={styles['--fd-composition']} style={styles}>
    <div className="cp-masthead"><StudioIdentity branding={branding} /><DemoHeader format="Campaign Delivery" client={title} sectionId="campaign" delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} /></div>
    <main>
      <section className="cp-cover" data-title-size={title.length > 65 ? 'long' : 'short'} data-design="cover" aria-labelledby={`${instance}-title`} style={splitTitle ? { '--cp-title-size': `${Math.min(17, 120 / titleWords.at(-1).length)}vw`, '--cp-mobile-title-size': `${Math.min(24, 168 / titleWords.at(-1).length)}vw` } : undefined}>
        <motion.div className="cp-cover-heading" variants={sequence} initial="hidden" whileInView="visible" viewport={viewport}>
          <motion.div className="cp-cover-top" variants={piece}><span>Campaign Delivery</span>{delivery?.clientName && <span>For {delivery.clientName}</span>}</motion.div>
          <motion.h1 id={`${instance}-title`} variants={piece}>{splitTitle ? <><span className="cp-title-prefix">{titleWords.slice(0, -1).join(' ')} </span><span className="cp-title-word">{titleWords.at(-1)}</span></> : title}</motion.h1>
        </motion.div>
        <PhotoCard photo={openingPhoto} position={positions.get(campaignPhotoKey(openingPhoto))} paused={paused} onOpen={openPhoto} label="Open the campaign cover photograph" eager lead entrance="split" highlight={highlights.has(campaignPhotoKey(openingPhoto))} className="cp-cover-photo" sizes="(max-width: 1480px) 100vw, 1480px" />
        <motion.div className="cp-cover-note" variants={sequence} initial="hidden" whileInView="visible" viewport={viewport}>{opening && <motion.p variants={piece}>{opening}</motion.p>}<motion.span variants={piece}>{galleryPhotos.length} {galleryPhotos.length === 1 ? 'photograph' : 'photographs'}</motion.span></motion.div>
      </section>

      {(sets.length > 0 || hasPhotoMotion) && <section ref={navigation} className="cp-tools" aria-label="Campaign navigation and actions">
        <div className="cp-tools-inner">
          {currentSet && <details ref={menu} className="cp-set-menu" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}>
            <summary aria-label="Browse campaign sets"><span className="cp-current-number" aria-hidden="true">{String(currentSet.index + 1).padStart(2, '0')}</span><motion.span key={currentSet.id + currentSet.index} className="cp-current-title" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>{currentSet.title}</motion.span><ChevronDown size={15} aria-hidden="true" /></summary>
            <nav aria-label="Campaign asset sets" className="cp-set-nav">{sets.map(set => <a key={campaignSetAnchor(set)} href={`#${instance}-${campaignSetAnchor(set)}`} onClick={event => browseSet(event, set)} aria-current={activeSet === campaignSetAnchor(set) ? 'location' : undefined}><span aria-hidden="true">{String(set.index + 1).padStart(2, '0')}</span><span>{set.title}</span><small>{set.photos.length} {set.photos.length === 1 ? 'photo' : 'photos'}</small></a>)}</nav>
          </details>}
          {hasPhotoMotion && <button className="cp-motion-toggle" type="button" onClick={() => setMotionPaused(value => !value)} aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'} aria-pressed={motionPaused}>{motionPaused ? <Play size={16} /> : <Pause size={16} />}</button>}
        </div>
        <motion.span className="cp-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
      </section>}

      <section className="cp-sets" aria-label="The campaign photographs">{sets.map(set => <SetSpread key={campaignSetAnchor(set)} set={set} paused={paused} onOpen={openPhoto} positions={positions} highlights={highlights} anchor={`${instance}-${campaignSetAnchor(set)}`} register={element => {
        const key = campaignSetAnchor(set);
        if (element) { element.dataset.setAnchor = key; setElements.current.set(key, element); } else setElements.current.delete(key);
      }} />)}</section>

      <footer className="cp-ending" data-design="closing">
        {closingPhoto && <PhotoCard photo={closingPhoto} position={positions.get(campaignPhotoKey(closingPhoto))} paused={paused} onOpen={openPhoto} label="Open the closing campaign photograph" lead entrance="up" className="cp-closing-photo" highlight={highlights.has(campaignPhotoKey(closingPhoto))} />}
        <div ref={closingRef} className="cp-ending-actions">
          <motion.div className="cp-ending-copy" variants={sequence} initial="hidden" whileInView="visible" viewport={viewport} data-long-copy={closing.length > 65}>
            <motion.h2 variants={piece}>{closing}</motion.h2>
            {galleryPhotos.length > 0 && <motion.button className="cp-gallery-link" type="button" variants={piece} whileHover={galleryUnlocked ? { y: -2 } : undefined} whileTap={galleryUnlocked ? { scale: .97 } : undefined} disabled={!galleryUnlocked} onClick={() => { if (galleryUnlocked) { setGalleryIndex(null); setGallery(true); } }} aria-label={galleryUnlocked ? 'Open full gallery' : 'View gallery after the presentation'}><span>View {galleryPhotos.length === 1 ? 'the photograph' : `all ${galleryPhotos.length} photographs`}</span><ArrowRight size={20} aria-hidden="true" /></motion.button>}
            {canDownloadAll && <button className="cp-download" type="button" disabled={Boolean(galleryProps.busy)} aria-busy={galleryProps.busy === 'all'} onClick={() => { if (!galleryProps.busy) galleryProps.onDownloadAll(); }}>{galleryProps.busy === 'all' ? 'Starting downloads...' : 'Download all photos'}<Download size={17} aria-hidden="true" /></button>}
            {usage && <details className="cp-usage"><summary><FileCheck2 size={16} aria-hidden="true" />Usage terms<ChevronDown size={14} aria-hidden="true" /></summary><p>{usage}</p></details>}
          </motion.div>
          <StudioIdentity branding={branding} />
        </div>
      </footer>
    </main>
    <AnimatePresence>{gallery && <DemoGallery {...galleryProps} photos={galleryPhotos} title={title} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} fontStyles={styles} singlePhoto={galleryIndex !== null} />}</AnimatePresence>
  </div>;
}
