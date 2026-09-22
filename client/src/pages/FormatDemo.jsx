import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Download, Grid2X2, Heart, Images, LoaderCircle, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { Photo } from '../components/PublicDesign.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import ClientGallery from '../components/delivery/ClientGallery.jsx';
import { EVENT_COVERAGE_DEMO_PHOTOS } from '../constants/eventCoverageDemo.js';
import { getDeliveryCapabilities } from '../constants/deliveryCapabilities.js';
import '../styles/format-demos.css';

export const editorialPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-ada-${index + 1}`, alt: `Ada's fashion portrait ${index + 1}` }));
export const revealPhotos = Array.from({ length: 4 }, (_, index) => ({ name: `demo-sharon-${index + 1}`, alt: `Sharon's studio portrait ${index + 1}` }));
export const couragePhotos = Array.from({ length: 6 }, (_, index) => ({ name: `demo-courage-${index + 1}`, alt: `Courage's graduation portrait ${index + 1}` }));
export const weddingPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-wedding-${index + 1}`, alt: `Folake and Tunde's wedding portrait ${index + 1}` }));
export const albumPhotos = ['demo-album-fa-source', 'demo-album-fa-2', 'demo-album-fa-3', 'demo-album-fa-4', 'demo-album-fa-5'].map((name, index) => ({ name, alt: `The Adeyemi family album portrait ${index + 1}` }));
export const eventCoveragePhotos = EVENT_COVERAGE_DEMO_PHOTOS;
export const campaignPhotos = [
  { name: '/veylo/demo/campaign/campaign-01-hero.webp', alt: 'Tan leather handbag and wallet on an indigo pedestal', caption: 'The campaign opens with the pieces together: warm leather, clean shape, and a confident point of view.', assetType: 'CAMPAIGN HERO', deliveryLabel: 'MASTER / WEB', campaignType: 'hero' },
  { name: '/veylo/demo/campaign/campaign-02-detail.webp', alt: 'Close detail of leather stitching and brass hardware', caption: 'Stitching, grain, and hardware are kept close enough to inspect.', assetType: 'DETAIL', deliveryLabel: 'DETAIL / CROP', campaignType: 'detail' },
  { name: '/veylo/demo/campaign/campaign-03-lifestyle.webp', alt: 'Woman carrying a tan leather handbag through a modern lobby', caption: 'The everyday frame shows how the bag sits in a real working day.', assetType: 'LIFESTYLE', deliveryLabel: 'SOCIAL / 4:5', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-04-kit.webp', alt: 'A leather handbag, wallet, card holder and packaging arranged overhead', caption: 'The complete kit is laid out for a quick, useful handoff.', assetType: 'KIT', deliveryLabel: 'CATALOG / FLATLAY', campaignType: 'kit' },
  { name: '/veylo/demo/campaign/campaign-05-context.webp', alt: 'Woman seated beside a tan leather handbag at an indigo table', caption: 'A quieter context frame gives the campaign room to breathe across a feed or landing page.', assetType: 'CONTEXT', deliveryLabel: 'SOCIAL / 1:1', campaignType: 'context' },
  { name: '/veylo/demo/campaign/campaign-06-detail-clasp.webp', alt: 'Macro view of a tan leather handbag clasp and card holder on indigo fabric', caption: 'The clasp, edge paint, and fine stitch line give the detail set its close-up proof.', assetType: 'DETAIL', deliveryLabel: 'DETAIL / MACRO', campaignType: 'detail' },
  { name: '/veylo/demo/campaign/campaign-07-lifestyle-courtyard.webp', alt: 'Nigerian woman carrying a tan leather handbag through a bright office courtyard', caption: 'A clear daytime frame shows the bag moving naturally through a working day.', assetType: 'LIFESTYLE', deliveryLabel: 'SOCIAL / 4:5', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-08-in-use-desk.webp', alt: 'Professional carrying a tan leather handbag beside a desk at sunset', caption: 'The in-use frame places the bag beside the work it was made to carry.', assetType: 'LIFESTYLE', deliveryLabel: 'WEB / LANDSCAPE', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-09-boutique-shelf.webp', alt: 'Tan leather handbag and small goods arranged on a boutique shelf', caption: 'A retail-ready arrangement gives the team a clean display and catalogue option.', assetType: 'KIT', deliveryLabel: 'RETAIL / DISPLAY', campaignType: 'kit' },
  { name: '/veylo/demo/campaign/campaign-10-unboxing.webp', alt: 'Tan leather handbag in cream tissue inside a presentation box', caption: 'Packaging and product arrive together in a frame that suits launch and unboxing use.', assetType: 'KIT', deliveryLabel: 'SOCIAL / UNBOXING', campaignType: 'kit' },
  { name: '/veylo/demo/campaign/campaign-11-travel.webp', alt: 'Tan leather handbag resting beside a passenger in a sunlit car', caption: 'A travel context gives the campaign a practical moment beyond the studio.', assetType: 'LIFESTYLE', deliveryLabel: 'CAMPAIGN / CONTEXT', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-12-cafe.webp', alt: 'Nigerian woman seated at a cafe with a tan leather handbag beside her', caption: 'The café portrait gives the product a human setting without turning the frame into a posed advert.', assetType: 'CONTEXT', deliveryLabel: 'SOCIAL / PORTRAIT', campaignType: 'context' }
];

export const imageSrc = (photo, width = 1440) => {
  if (photo?.url) return photo.url;
  const name = typeof photo === 'string' ? photo : photo?.name;
  if (typeof name === 'string' && (name.startsWith('http') || name.startsWith('/'))) return name;
  return `/veylo/web/${name || photo}-${width}.webp`;
};

function getFontFamily(type, fallback = "'Playfair Display', Georgia, serif") {
  switch (type) {
    case 'editorial-serif':
      return "'Playfair Display', Georgia, serif";
    case 'soft-serif':
      return "'Cormorant Garamond', 'Playfair Display', Georgia, serif";
    case 'condensed-sans':
      return "'Outfit', 'Plus Jakarta Sans', sans-serif";
    case 'clean-sans':
      return "'Plus Jakarta Sans', system-ui, sans-serif";
    default:
      return type ? `"${type}", ${fallback}` : fallback;
  }
}

export function getFormatThemeStyles(delivery, fallback = {}) {
  const cd = delivery?.creativeDirection;
  const palette = cd?.palette || {};
  const typography = cd?.typography || {};

  const accent = palette.accent || palette.accentColor || fallback.accent || '#ff5a47';
  const bg = palette.background || palette.backgroundColor || fallback.bg || '#070709';
  const surface = palette.surface || palette.surfaceColor || fallback.surface || '#0e0e13';
  const text = palette.text || palette.textColor || fallback.text || '#f2eee8';
  const displayFont = getFontFamily(typography.display || typography.displayFont, fallback.fontDisplay || "'Playfair Display', Georgia, serif");
  const bodyFont = getFontFamily(typography.body || typography.bodyFont, fallback.fontBody || "'Plus Jakarta Sans', sans-serif");
  const variation = cd?.variation || {};
  // A delivery must never recolour or re-grade the photographer's finished files.
  // The selected treatment remains available to the art direction record, while the
  // viewer always renders the supplied photograph faithfully.
  const imageFilter = 'none';
  const densityGap = variation.density === 'spacious' ? '1.28' : variation.density === 'layered' ? '.84' : '1';

  return {
    '--fd-accent': accent,
    '--fd-accent-soft': `${accent}26`,
    '--fd-bg': bg,
    '--fd-surface': surface,
    '--fd-text': text,
    '--fd-font-display': displayFont,
    '--fd-font-body': bodyFont,
    '--fd-image-filter': imageFilter,
    '--fd-density-gap': densityGap,
    '--fd-caption-weight': variation.captionTreatment === 'bold' ? '650' : variation.captionTreatment === 'quiet' ? '400' : '500',
    '--fd-accent-placement': variation.accentPlacement || 'rules',
    '--fd-composition': variation.composition || 'quiet',
    '--fd-pace': cd?.pace || 'warm'
  };
}

export function normalizeDeliveryPhotos(delivery, fallbackPhotos) {
  if (delivery?.assets?.length) {
    const frames = new Map((delivery.creativeDirection?.frames || []).map(frame => [String(frame.assetId), frame]));
    return delivery.assets.map((a, i) => ({
      ...a,
      name: a.assetId,
      assetId: a.assetId,
      alt: a.originalFilename || `Photograph ${i + 1}`,
      caption: frames.get(String(a.assetId))?.caption || '',
      headline: frames.get(String(a.assetId))?.headline || '',
      eventType: frames.get(String(a.assetId))?.eventType || frames.get(String(a.assetId))?.category || frames.get(String(a.assetId))?.sceneType || '',
      campaignType: frames.get(String(a.assetId))?.campaignType || frames.get(String(a.assetId))?.assetType || frames.get(String(a.assetId))?.assetRole || '',
      duration: frames.get(String(a.assetId))?.duration,
      motion: frames.get(String(a.assetId))?.motion,
      transition: frames.get(String(a.assetId))?.transition,
      layout: frames.get(String(a.assetId))?.layout,
      typographyStyle: frames.get(String(a.assetId))?.typographyStyle,
      textBackground: frames.get(String(a.assetId))?.textBackground,
      captionPosition: frames.get(String(a.assetId))?.captionPosition,
      textAnimation: frames.get(String(a.assetId))?.textAnimation,
      focalPoint: frames.get(String(a.assetId))?.focalPoint,
      colorAccent: frames.get(String(a.assetId))?.colorAccent,
      url: a.url, // Original photographer upload quality preserved
      thumbnailUrl: a.thumbnailUrl || a.url
    }));
  }
  return fallbackPhotos.map(photo => ({ ...photo, caption: photo.caption || '' }));
}

export function DemoHeader({ format, client, sectionId, onGallery, light = false, delivery, audioState, toggleAudio, hideSoundtrack = false }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isFromFormats =
    location.state?.from === 'formats' ||
    searchParams.get('from') === 'formats' ||
    Boolean(location.state?.returnTo?.includes('/formats'));
  const isFromNiche =
    location.state?.from === 'niche' ||
    Boolean(location.state?.returnTo?.startsWith('/for/'));

  const backDestination = location.state?.returnTo ||
    (isFromFormats ? `/formats#${sectionId}` : `/#${sectionId}`);

  const backLabel = isFromFormats ? 'Back to formats' : isFromNiche ? 'Back to this page' : 'Back home';
  const backAria = isFromFormats
    ? `Back to the ${format} section on the formats page`
    : isFromNiche
      ? 'Back to the page you opened this demo from'
    : `Back to the ${format} section on the homepage`;

  const handleBack = (e) => {
    if (window.history.length > 1 && (isFromFormats || isFromNiche)) {
      e.preventDefault();
      navigate(-1);
    }
  };

  const brandName = delivery?.branding?.name || 'Veylo';
  const capabilities = getDeliveryCapabilities(delivery?.format);
  const soundtrackLoading = audioState?.loading === 'soundtrack';
  const narrationLoading = audioState?.loading === 'narration';

  return <header className={'fd-header ' + (light ? 'is-light' : '')}>
    {delivery ? (
      <div className="fd-header-brand">
        {delivery.branding?.logoUrl && (
          <img src={delivery.branding.logoUrl} alt="" className="fd-header-logo" />
        )}
        <span>{brandName}</span>
      </div>
    ) : (
      <Link className="fd-back" to={backDestination} onClick={handleBack} aria-label={backAria}>
        <ArrowLeft size={17} />
        <span>{backLabel}</span>
      </Link>
    )}

    <div className="fd-header-title"><span>{format}</span><strong>{client}</strong></div>

    <div className="fd-header-actions">
      {audioState && toggleAudio && capabilities.music && delivery?.soundtrack?.url && !hideSoundtrack && (
        <button
          type="button"
          className={`fd-header-audio-btn ${audioState.playing === 'soundtrack' ? 'is-active' : ''} ${soundtrackLoading ? 'is-loading' : ''}`}
          onClick={() => toggleAudio('soundtrack')}
          aria-label={soundtrackLoading ? 'Cancel loading soundtrack' : audioState.playing === 'soundtrack' ? 'Pause soundtrack' : 'Play soundtrack'}
          aria-busy={soundtrackLoading}
        >
          {soundtrackLoading ? <LoaderCircle className="v-spin" size={16} /> : audioState.playing === 'soundtrack' ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span className="fd-audio-label" aria-live="polite">{soundtrackLoading ? 'Loading music…' : audioState.playing === 'soundtrack' ? 'Sound on' : 'Sound off'}</span>
        </button>
      )}

      {audioState && toggleAudio && capabilities.narration && delivery?.narration?.url && (
        <button
          type="button"
          className={`fd-header-audio-btn ${audioState.playing === 'narration' ? 'is-active' : ''} ${narrationLoading ? 'is-loading' : ''}`}
          onClick={() => toggleAudio('narration')}
          aria-label={narrationLoading ? 'Cancel loading narration' : audioState.playing === 'narration' ? 'Pause narration' : 'Play narration'}
          aria-busy={narrationLoading}
        >
          {narrationLoading ? <LoaderCircle className="v-spin" size={16} /> : <Volume2 size={16} />}
          <span className="fd-audio-label" aria-live="polite">{narrationLoading ? 'Loading voice…' : 'Narration'}</span>
        </button>
      )}

      {onGallery ? <button className="fd-gallery-button" type="button" onClick={onGallery} aria-label="Open full gallery"><Images size={17} /><span>Full gallery</span></button> : <span aria-hidden="true" />}
    </div>
  </header>;
}

function LegacyDemoGallery({ photos, title, onClose, initialIndex = null, liked, onLike, onDownload, onDownloadAll, busy, delivery }) {
  const [selected, setSelected] = useState(initialIndex);
  const panel = useRef(null);
  useDialogFocus(true, panel, onClose);

  useEffect(() => {
    const onKey = event => {
      if (selected === null) return;
      if (event.key === 'ArrowLeft') setSelected(value => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setSelected(value => Math.min(photos.length - 1, value + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, selected]);

  const activePhoto = selected !== null ? photos[selected] : null;
  const allowDownloadAll = delivery ? delivery.access?.allowDownloadAll !== false : true;
  const allowIndividualDownloads = delivery ? delivery.access?.allowIndividualDownloads !== false : true;
  const allowLikes = delivery ? Boolean(delivery.access?.allowLikes && onLike) : false;

  return <motion.div className="fd-gallery-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={panel} className="fd-gallery" role="dialog" aria-modal="true" aria-labelledby="fd-gallery-title" tabIndex={-1} initial={{ opacity: 0, y: 24, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 15 }} transition={{ type: 'spring', damping: 27, stiffness: 240 }}>
      <header>
        <div>
          <span>THE COMPLETE COLLECTION{delivery ? ` · ${photos.length} PHOTOGRAPHS` : ''}</span>
          <h2 id="fd-gallery-title">{title}</h2>
        </div>
        <div className="fd-gallery-head-actions">
          {allowDownloadAll && onDownloadAll && (
            <button
              type="button"
              className="fd-download-all-btn"
              onClick={onDownloadAll}
              disabled={Boolean(busy)}
            >
              <Download size={15} />
              <span>{busy === 'all' ? 'Starting...' : 'Download all photos'}</span>
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close gallery"><X size={20} /></button>
        </div>
      </header>
      {selected === null ? <div className="fd-gallery-grid">{photos.map((photo, index) => {
        const photoKey = photo.assetId || photo.name || index;
        return <figure key={photoKey}>
          <button type="button" onClick={() => setSelected(index)} aria-label={`Open photograph ${index + 1}`}>
            <Photo name={photo.name} url={photo.url} srcSet={photo.srcSet} alt={photo.alt} sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 22vw" />
          </button>
          <figcaption>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div className="fd-gallery-actions">
              {allowLikes && (
                <button
                  type="button"
                  onClick={() => onLike(photo.assetId || index)}
                  className={`fd-like-btn ${liked?.has(photo.assetId || index) ? 'is-liked' : ''}`}
                  aria-label={liked?.has(photo.assetId || index) ? 'Unlike' : 'Like'}
                >
                  <Heart size={15} fill={liked?.has(photo.assetId || index) ? 'currentColor' : 'none'} />
                </button>
              )}
              {allowIndividualDownloads && (onDownload ? (
                <button
                  type="button"
                  onClick={() => onDownload(photo.assetId || index)}
                  disabled={busy === (photo.assetId || index)}
                  aria-label="Download photograph"
                >
                  <Download size={14} />
                </button>
              ) : (
                <a href={imageSrc(photo)} download={`${photo.name || 'photograph'}.webp`}>
                  Download<Download size={13} />
                </a>
              ))}
            </div>
          </figcaption>
        </figure>;
      })}</div> : <div className="fd-lightbox">
        <AnimatePresence mode="wait">
          <motion.img
            key={activePhoto?.url || activePhoto?.name || selected}
            src={imageSrc(activePhoto)}
            alt={activePhoto?.alt || ''}
            initial={{ opacity: 0, scale: .985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          />
        </AnimatePresence>
        <p className="fd-lightbox-caption">{activePhoto?.caption || ''}</p>
        <div className="fd-lightbox-controls">
          <button type="button" onClick={() => setSelected(value => Math.max(0, value - 1))} disabled={selected === 0} aria-label="Previous photograph">
            <ChevronLeft size={20} />
          </button>
          <button type="button" onClick={() => setSelected(null)}>Back to gallery</button>
          {allowLikes && (
            <button
              type="button"
              onClick={() => onLike(activePhoto?.assetId || selected)}
              className={`fd-like-btn ${liked?.has(activePhoto?.assetId || selected) ? 'is-liked' : ''}`}
              aria-label={liked?.has(activePhoto?.assetId || selected) ? 'Unlike' : 'Like'}
            >
              <Heart size={16} fill={liked?.has(activePhoto?.assetId || selected) ? 'currentColor' : 'none'} />
            </button>
          )}
          {allowIndividualDownloads && (onDownload ? (
            <button
              type="button"
              onClick={() => onDownload(activePhoto?.assetId || selected)}
              disabled={busy === (activePhoto?.assetId || selected)}
            >
              <Download size={15} /><span>Download</span>
            </button>
          ) : (
            <a href={imageSrc(activePhoto)} download={`${activePhoto?.name || 'photograph'}.webp`}>
              Download<Download size={15} />
            </a>
          ))}
          <button type="button" onClick={() => setSelected(value => Math.min(photos.length - 1, value + 1))} disabled={selected === photos.length - 1} aria-label="Next photograph">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>}
    </motion.section>
  </motion.div>;
}

export const DemoGallery = ClientGallery;

function EditorialPhoto({ photo, className = '', caption, sizes, direction = 1, horizontal = false, onNarrationNavigate, accent, frame }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], direction > 0 ? [-24, 24] : [24, -24]);
  const x = useTransform(scrollYProgress, [0, 1], direction > 0 ? [-18, 18] : [18, -18]);
  const scale = useTransform(scrollYProgress, [0, .5, 1], [1.07, 1.025, 1.07]);
  return <motion.figure ref={ref} className={className} data-frame-layout={frame?.layout || undefined} data-caption-position={frame?.captionPosition || undefined} data-text-background={frame?.textBackground || undefined} data-type-style={frame?.typographyStyle || undefined} style={accent ? { '--frame-accent': accent } : undefined} initial={reduced ? false : { opacity: .72, clipPath: horizontal ? 'inset(0 18% 0 0)' : 'inset(0 0 18% 0)' }} whileInView={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }} viewport={{ once: true, amount: .08 }} onViewportEnter={() => onNarrationNavigate?.(photo?.assetId)} transition={{ duration: reduced ? 0 : .95, ease: [0.22, 1, 0.36, 1] }}>
    <motion.div className="fd-ed-photo-motion" style={reduced ? undefined : { y: horizontal ? 0 : y, x: horizontal ? x : 0, scale }}>
      <Photo name={photo.name} url={photo.url} alt={photo.alt} sizes={sizes} style={frame?.focalPoint ? { objectPosition: frame.focalPoint } : undefined} />
    </motion.div>
    {caption && <figcaption>{caption}</figcaption>}
  </motion.figure>;
}

export function EditorialDemo({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const [gallery, setGallery] = useState(false);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const reveal = (delay = 0) => reduced ? {} : { initial: { opacity: 0, y: 34 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .3 }, transition: { duration: .72, delay, ease: [0.22, 1, 0.36, 1] } };

  const photos = normalizeDeliveryPhotos(delivery, editorialPhotos);
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);
  const sections = delivery?.creativeDirection?.sections || [];
  const sectionByAsset = useMemo(() => new Map(sections.flatMap(section => (section.assetIds || []).map(assetId => [String(assetId), section]))), [sections]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / ${delivery.title}` : delivery.title) : 'Ada / The Style Issue';
  const masthead = delivery?.branding?.name ? `${delivery.branding.name.toUpperCase()} EDITORIAL / 001` : 'VEYLO EDITORIAL / 001';
  const openingLine = delivery?.creativeDirection?.openingLine || 'One green suit. Five portraits. Ada gave every frame a different attitude.';
  const closingLine = delivery?.creativeDirection?.closingLine || 'The feature ends here. Ada’s complete finished collection is ready when you are.';

  const title = delivery?.creativeDirection?.title || delivery?.title || 'The Style Issue';
  const words = title.split(' ');
  const titleLines = [];
  for (let i = 0; i < words.length; i += 2) {
    titleLines.push(words.slice(i, i + 2).join(' '));
  }
  if (!titleLines.length) titleLines.push(title);

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#e7dfd1',
    text: '#17130f',
    accent: '#a82f25',
    surface: '#ded4c4'
  });

  const coverPhoto = photos[0];
  const photo2 = photos[1] || coverPhoto;
  const photo3 = photos[2] || photo2;
  const photo4 = photos[3] || photo3;
  const lastPhoto = photos[photos.length - 1] || coverPhoto;

  const frame2 = frames.get(photo2?.assetId) || {};
  const frame3 = frames.get(photo3?.assetId) || {};
  const frame4 = frames.get(photo4?.assetId) || {};
  const section2 = sectionByAsset.get(String(photo2?.assetId)) || sections[0] || {};
  const section3 = sectionByAsset.get(String(photo3?.assetId)) || sections[1] || section2;
  const section4 = sectionByAsset.get(String(photo4?.assetId)) || sections[2] || section3;
  const demoOnly = !delivery;

  return <div className="fd-page fd-editorial" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={themeStyles}>
    <DemoHeader format="Editorial Page" client={client} sectionId="editorial-page" onGallery={() => setGallery(true)} light delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <motion.div className="fd-ed-scroll-progress" style={reduced ? undefined : { scaleX: scrollYProgress }} aria-hidden="true" />
    <main>
      <section className="fd-ed-cover">
        <div className="fd-ed-mast">
          <motion.span initial={reduced ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .6, delay: reduced ? 0 : .15 }}>{masthead}</motion.span>
          <strong>{titleLines.map((line, index) => <motion.i key={line + index} initial={reduced ? false : { opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .72, delay: reduced ? 0 : .22 + index * .09, ease: [0.22, 1, 0.36, 1] }}>{line}</motion.i>)}</strong>
          <motion.p initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .62 }}>{openingLine}</motion.p>
        </div>
        <motion.figure initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', opacity: .4 }} animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }} transition={{ duration: reduced ? 0 : 1.15, delay: reduced ? 0 : .18, ease: [0.22, 1, 0.36, 1] }}><motion.div className="fd-ed-photo-motion" animate={reduced ? undefined : { scale: [1.015, 1.065], y: ['0%', '-1.6%'] }} transition={{ duration: 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={coverPhoto.name} url={coverPhoto.url} alt={coverPhoto.alt} eager sizes="(max-width: 767px) 100vw, 62vw" /></motion.div></motion.figure>
        <motion.span className="fd-ed-folio" initial={reduced ? false : { opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .72 }}>01</motion.span>
        <motion.i className="fd-ed-cover-rule" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : 1, delay: reduced ? 0 : .45, ease: [0.22, 1, 0.36, 1] }} aria-hidden="true" />
      </section>

      <section className="fd-ed-intro">
        <motion.span {...reveal()}>{delivery?.shootType ? `${delivery.shootType.toUpperCase()} · ${delivery?.clientName?.toUpperCase() || 'COLLECTION'}` : 'FASHION PORTRAITS / LAGOS'}</motion.span>
        <h1><motion.i {...reveal(.05)}>{titleLines[0] || (demoOnly ? 'One look.' : title)}</motion.i><motion.em {...reveal(.12)}>{delivery ? (section2.title || delivery.clientName || 'Selected work') : 'Completely Ada.'}</motion.em></h1>
        <motion.p {...reveal(.18)}>{openingLine}</motion.p>
      </section>

      <section className="fd-ed-spread" data-section-layout={section2.layout || 'pair'}>
        <EditorialPhoto photo={photo2} frame={frame2} accent={frame2.colorAccent} sizes="(max-width: 767px) 92vw, 48vw" caption={frame2.caption || frame2.headline || (demoOnly ? "02 / The suit, held with quiet confidence." : section2.subtitle || '')} direction={-1} onNarrationNavigate={onNarrationNavigate} />
        <motion.div className="fd-ed-quote" {...reveal(.08)}>
          <span>{frame2.headline ? 'KEY FRAME' : (section2.label || (demoOnly ? 'THE GREEN SUIT' : 'FEATURE'))}</span>
          <blockquote>
            <motion.span {...reveal(.12)}>{`“${frame2.headline || section2.title || (demoOnly ? 'One outfit.' : frame2.caption || 'A closer look.')}”`}</motion.span>
            {!frame2.headline && (section2.subtitle || demoOnly) && <motion.span {...reveal(.2)}>{section2.subtitle || 'Five different ways to own it.'}</motion.span>}
          </blockquote>
          <motion.p {...reveal(.24)}>{frame2.caption || section2.subtitle || (demoOnly ? 'The ivory telephone gave Ada something to play with. She did the rest.' : '')}</motion.p>
        </motion.div>
        <EditorialPhoto photo={photo3} frame={frame3} accent={frame3.colorAccent} className="fd-ed-tall" sizes="(max-width: 767px) 84vw, 35vw" caption={frame3.caption || frame3.headline || (demoOnly ? "03 / A quieter moment with the phone." : section3.subtitle || '')} direction={1} horizontal onNarrationNavigate={onNarrationNavigate} />
      </section>

      <section className="fd-ed-number" data-section-layout={section4.layout || 'hero'}>
        <motion.span aria-hidden="true" initial={reduced ? false : { opacity: 0, x: 100 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: reduced ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}>04</motion.span>
        <EditorialPhoto photo={photo4} frame={frame4} accent={frame4.colorAccent} sizes="100vw" direction={-1} horizontal onNarrationNavigate={onNarrationNavigate} />
        <motion.div>
          <motion.small {...reveal()}>{frame4.headline ? 'HIGHLIGHT' : (section4.label || (demoOnly ? 'THE FULL LOOK' : 'SELECTED FRAME'))}</motion.small>
          <h2>
            <motion.span {...reveal(.08)}>{frame4.headline || section4.title || (demoOnly ? 'Green velvet, sculpted lines,' : '')}</motion.span>
            <motion.span {...reveal(.16)}>{frame4.caption || section4.subtitle || (demoOnly ? 'and Ada in complete control of the frame.' : '')}</motion.span>
          </h2>
        </motion.div>
      </section>

      {photos.length > 5 && (
        <section className="fd-ed-gallery-preview">
          <div className="fd-ed-preview-head">
            <motion.span {...reveal()}>CURATED SELECTION</motion.span>
            <motion.h3 {...reveal(0.08)}>Further highlights from this shoot</motion.h3>
          </div>
          <div className="fd-ed-preview-grid">
            {photos.slice(4, Math.max(4, photos.length - 1)).map((p, idx) => (
              <motion.figure
                key={p.assetId || p.name || idx}
                {...reveal(idx * 0.08)}
                className="fd-ed-preview-card"
                onClick={() => setGallery(true)}
              >
                <div className="fd-ed-preview-thumb">
                  <Photo name={p.name} url={p.url} alt={p.alt} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 30vw" />
                </div>
                <figcaption>
                  <span>{String(idx + 5).padStart(2, '0')}</span>
                  <p>{frames.get(p.assetId)?.headline || frames.get(p.assetId)?.caption || ''}</p>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </section>
      )}

      <section className="fd-ed-close">
        <EditorialPhoto photo={lastPhoto} frame={frames.get(lastPhoto?.assetId)} accent={frames.get(lastPhoto?.assetId)?.colorAccent} sizes="(max-width: 767px) 88vw, 46vw" direction={1} onNarrationNavigate={onNarrationNavigate} />
        <div>
          <motion.span {...reveal()}>THE COMPLETE SESSION</motion.span>
          <h2>
            <motion.span {...reveal(.08)}>{delivery?.clientName ? `Every side of ${delivery.clientName},` : 'Every side of the look,'}</motion.span>
            <motion.em {...reveal(.15)}>ready to explore.</motion.em>
          </h2>
          <motion.p {...reveal(.21)}>{closingLine}</motion.p>
          <motion.button type="button" onClick={() => setGallery(true)} {...reveal(.27)}>View full gallery<Images size={17} /></motion.button>
        </div>
      </section>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={client} onClose={() => setGallery(false)} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}

export const revealCaptions = [
  ['THE FIRST ONE', 'Sharon, you walked into this frame and made it yours.'],
  ['THAT LOOK', 'The turn, the clean lines, the confidence. This portrait had to stand alone.'],
  ['A SOFTER MOMENT', 'A quieter portrait, but still completely you.'],
  ['SAVED FOR LAST', 'We kept this portrait for the end. It is one of our favourites from your session.']
];

export const revealMotions = [
  { initial: { clipPath: 'inset(0 50% 0 50%)', scale: 1.08, filter: 'blur(8px)' }, animate: { clipPath: 'inset(0 0% 0 0%)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'inset(50% 0 50% 0)', scale: 1.07, filter: 'blur(6px)' }, animate: { clipPath: 'inset(0% 0 0% 0)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'circle(0% at 50% 44%)', scale: 1.1, filter: 'blur(9px)' }, animate: { clipPath: 'circle(78% at 50% 44%)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'inset(100% 0 0 0)', scale: 1.06, filter: 'blur(5px)' }, animate: { clipPath: 'inset(0% 0 0 0)', scale: 1, filter: 'blur(0px)' } }
];

function revealMotionForFrame(frame, index) {
  const fallback = revealMotions[index % revealMotions.length];
  if (!frame || !frame.transition) return fallback;
  if (frame.transition === 'cut') return { initial: { opacity: 0 }, animate: { opacity: 1 } };
  if (frame.transition === 'slide' || frame.transition === 'wipe') return { initial: { clipPath: 'inset(0 100% 0 0)', scale: 1.04 }, animate: { clipPath: 'inset(0 0% 0 0)', scale: 1 } };
  if (frame.transition === 'reveal') return { initial: { clipPath: 'circle(0% at 50% 50%)', scale: 1.08 }, animate: { clipPath: 'circle(78% at 50% 50%)', scale: 1 } };
  if (frame.motion === 'slow-pull') return { initial: { opacity: .2, scale: 1.12 }, animate: { opacity: 1, scale: 1 } };
  if (frame.motion === 'pan-left' || frame.motion === 'pan-right') return { initial: { opacity: .25, x: frame.motion === 'pan-left' ? '6%' : '-6%', scale: 1.04 }, animate: { opacity: 1, x: 0, scale: 1 } };
  return fallback;
}

export function RevealDemo({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [uncovered, setUncovered] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const reduced = useReducedMotion();
  const touchStart = useRef(null);
  const audio = useRef(null);

  const photos = normalizeDeliveryPhotos(delivery, revealPhotos);
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / Studio Portraits` : delivery.title) : 'Sharon / Studio Portraits';
  const clientName = delivery?.clientName || 'Sharon';
  const studioName = delivery?.branding?.name ? `${delivery.branding.name.toUpperCase()} / LAGOS` : 'STUDIO LUMIÈRE / LAGOS';
  const closingLine = delivery?.creativeDirection?.closingLine || 'Your complete finished session is ready to view and download.';
  const demoOnly = !delivery;
  // Pixabay catalogue track pixabay_570690: Afrobeat Background Music by Monume.
  const audioTrack = delivery?.soundtrack?.url || (demoOnly ? '/audio/photo-reveal-afrobeat.mp3' : '');

  const playSoundtrack = () => {
    if (!audio.current) return;
    setAudioLoading(true);
    setAudioFailed(false);
    audio.current.play().catch(() => {
      setAudioLoading(false);
      setAudioFailed(true);
    });
  };

  const next = () => {
    setUncovered(false);
    if (index === photos.length - 1) setFinished(true);
    else {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      onNarrationNavigate?.(photos[nextIndex]?.assetId);
    }
  };
  const previous = () => {
    setUncovered(false);
    if (finished) setFinished(false);
    else {
      const nextIndex = Math.max(0, index - 1);
      setIndex(nextIndex);
      onNarrationNavigate?.(photos[nextIndex]?.assetId);
    }
  };
  const beginReveal = () => {
    setStarted(true);
    if (audio.current && !muted) {
      audio.current.volume = .52;
      playSoundtrack();
    }
  };
  const toggleSound = () => {
    if (audioFailed) {
      setMuted(false);
      playSoundtrack();
      return;
    }
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!audio.current) return;
    audio.current.muted = nextMuted;
    if (nextMuted) setAudioLoading(false);
    if (!nextMuted && started && !gallery) playSoundtrack();
  };
  const restart = () => {
    setStarted(false);
    setFinished(false);
    setIndex(0);
    setUncovered(false);
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (!started || finished) {
      setUncovered(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setUncovered(true), reduced ? 0 : 460);
    return () => window.clearTimeout(timer);
  }, [started, index, finished, reduced]);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    if (gallery) player.pause();
    else if (started && !muted) playSoundtrack();
  }, [gallery, started, muted]);

  useEffect(() => () => audio.current?.pause(), []);

  useEffect(() => {
    const onKey = event => {
      if (!started || gallery || !uncovered) return;
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') previous();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const activePhoto = photos[index] || photos[0];
  const activeFrame = frames.get(activePhoto.assetId) || {};
  const captionData = revealCaptions[index % revealCaptions.length];
  const currentKicker = activeFrame.headline || (delivery?.creativeDirection?.sections || []).find(section => (section.assetIds || []).includes(activePhoto?.assetId))?.title || (demoOnly ? captionData[0] : `Photograph ${index + 1}`);
  const currentLine = activeFrame.caption || (delivery?.creativeDirection?.sections || []).find(section => (section.assetIds || []).includes(activePhoto?.assetId))?.subtitle || (demoOnly ? captionData[1] : '');
  const motionEffect = revealMotionForFrame(activeFrame, index);

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#050506',
    surface: '#0c0c0e',
    text: '#f2eee8',
    accent: '#ff9b8e'
  });

  return <div className="fd-page fd-reveal" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={themeStyles} onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null || !started || finished || !uncovered) return; const distance = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(distance) > 45) distance < 0 ? next() : previous(); }}>
    {audioTrack && <audio ref={audio} src={audioTrack} loop preload="auto" muted={muted} onWaiting={() => setAudioLoading(true)} onStalled={() => setAudioLoading(true)} onPlaying={() => { setAudioLoading(false); setAudioFailed(false); }} onPause={() => setAudioLoading(false)} onError={() => { setAudioLoading(false); setAudioFailed(true); }} />}
    <DemoHeader format="Photo Reveal" client={client} sectionId="photo-reveal" onGallery={() => setGallery(true)} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} hideSoundtrack />
    {!started ? <main className="fd-reveal-opening">
      <motion.div className="fd-reveal-opening-photo" initial={reduced ? false : { scale: 1.14 }} animate={{ scale: 1.08 }} transition={{ duration: reduced ? 0 : 7, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={photos[0].name} url={photos[0].url} alt="A concealed preview of Sharon's finished studio portraits" eager /></motion.div>
      <div className="fd-reveal-opening-shade" />
      <motion.div className="fd-reveal-opening-mark" initial={reduced ? false : { opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : .8 }} aria-hidden="true"><span>PRIVATE REVEAL</span><i /></motion.div>
      <motion.div className="fd-reveal-opening-copy" initial={reduced ? false : { opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .2 }}><span>{studioName}</span><h1>{clientName},<br />your photographs<br />are ready.</h1><p>There are {photos.length} finished {photos.length === 1 ? 'portrait' : 'portraits'} waiting. Reveal each one when you are ready.</p><button type="button" onClick={beginReveal}>Begin reveal<ChevronRight size={18} /></button></motion.div>
    </main> : <main className="fd-reveal-stage">
      {!finished ? <div className="fd-reveal-room">
        <div className="fd-reveal-frame-shell" data-frame-layout={activeFrame.layout || undefined} style={activeFrame.colorAccent ? { '--frame-accent': activeFrame.colorAccent } : undefined}>
          <motion.div className="fd-reveal-waiting" key={'waiting-' + index} initial={{ opacity: 0 }} animate={{ opacity: uncovered ? 0 : 1 }} transition={{ duration: reduced ? 0 : .25 }} aria-hidden={uncovered}><span>PORTRAIT</span><strong>{String(index + 1).padStart(2, '0')}</strong><i>OPENING</i></motion.div>
          <AnimatePresence mode="wait">{uncovered && <motion.figure className={'fd-reveal-portrait is-effect-' + ((index % 4) + 1)} data-frame-layout={activeFrame.layout || undefined} data-type-style={activeFrame.typographyStyle || undefined} data-text-background={activeFrame.textBackground || undefined} style={activeFrame.colorAccent ? { '--frame-accent': activeFrame.colorAccent } : undefined} key={activePhoto.url || activePhoto.name} initial={reduced ? false : { opacity: .35, ...motionEffect.initial }} animate={{ opacity: 1, ...motionEffect.animate }} exit={{ opacity: 0, scale: .985 }} transition={{ duration: reduced ? 0 : 1.15, ease: [0.22, 1, 0.36, 1] }}><motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], x: index % 2 ? ['0%', '-.7%'] : ['-.7%', '.7%'] }} transition={{ duration: 11, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={activePhoto.name} url={activePhoto.url} alt={activePhoto.alt} style={activeFrame.focalPoint ? { objectPosition: activeFrame.focalPoint } : undefined} eager sizes="(max-width: 767px) 100vw, 72vw" /></motion.div><motion.i className="fd-reveal-light" initial={reduced ? false : { x: '-130%', opacity: 0 }} animate={{ x: '180%', opacity: [0, .8, 0] }} transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : .2, ease: 'easeInOut' }} /></motion.figure>}</AnimatePresence>
          <div className="fd-reveal-frame-lines" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
        <aside className="fd-reveal-details">
          <div className="fd-reveal-position"><span>PORTRAIT {String(index + 1).padStart(2, '0')}</span><i /><span>{String(photos.length).padStart(2, '0')}</span></div>
          <AnimatePresence mode="wait">{uncovered && <motion.div className="fd-reveal-caption" data-caption-position={activeFrame.captionPosition || undefined} data-text-animation={activeFrame.textAnimation || undefined} data-type-style={activeFrame.typographyStyle || undefined} data-text-background={activeFrame.textBackground || undefined} style={activeFrame.colorAccent ? { '--frame-accent': activeFrame.colorAccent } : undefined} key={'caption-' + index} initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .65, delay: reduced ? 0 : .82 }}><motion.span initial={reduced ? false : { letterSpacing: '.35em', opacity: 0 }} animate={{ letterSpacing: '.18em', opacity: 1 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .9 }}>{currentKicker}</motion.span><p>{currentLine}</p></motion.div>}</AnimatePresence>
          <div className="fd-reveal-controls"><button type="button" onClick={previous} disabled={index === 0 || !uncovered} aria-label="Previous portrait"><ChevronLeft size={18} /></button><button className="fd-reveal-next" type="button" onClick={next} disabled={!uncovered}>{index === photos.length - 1 ? 'Complete reveal' : 'Reveal next portrait'}<ChevronRight size={18} /></button></div>
        </aside>
      </div> : <motion.section className="fd-reveal-finale" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="fd-reveal-finale-grid">{photos.slice(0, Math.min(photos.length, 6)).map((photo, photoIndex) => <motion.figure key={photo.url || photo.name} initial={reduced ? false : { opacity: 0, y: 34, rotate: (photoIndex - 1.5) * 3 }} animate={{ opacity: 1, y: 0, rotate: (photoIndex - 1.5) * 1.5 }} transition={{ delay: reduced ? 0 : photoIndex * .08 }}><Photo name={photo.name} url={photo.url} alt="" /></motion.figure>)}</div>
        <div className="fd-reveal-finale-copy"><span>{clientName.toUpperCase()} / ALL {photos.length} REVEALED</span><h1>{delivery?.creativeDirection?.title || (demoOnly ? <>These portraits<br />are yours.</> : `${clientName}, these are yours.`)}</h1><p>{closingLine}</p><div><button type="button" onClick={() => setGallery(true)}>View full gallery<Images size={17} /></button><button type="button" onClick={restart}><RotateCcw size={16} />Start again</button></div></div>
      </motion.section>}
    </main>}
    {started && audioTrack && <button className={`fd-reveal-sound ${audioLoading ? 'is-loading' : ''} ${audioFailed ? 'is-error' : ''}`} type="button" onClick={toggleSound} aria-label={audioLoading ? 'Stop loading soundtrack' : audioFailed ? 'Try soundtrack again' : muted ? 'Turn soundtrack on' : 'Mute soundtrack'} aria-busy={audioLoading}>{audioLoading ? <LoaderCircle className="v-spin" size={17} /> : muted || audioFailed ? <VolumeX size={17} /> : <Volume2 size={17} />}<span aria-live="polite">{audioLoading ? 'Loading music…' : audioFailed ? 'Try music again' : muted ? 'Sound off' : 'Sound on'}</span></button>}
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={client} onClose={() => setGallery(false)} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}

export const canvasEntrances = [
  { x: -80, y: -35, rotate: -5 }, { x: 24, y: -70, rotate: 4 }, { x: 75, y: -30, rotate: 5 },
  { x: -65, y: 55, rotate: -6 }, { x: 15, y: 80, rotate: 4 }, { x: 80, y: 60, rotate: 5 }
];
export const canvasClusters = [
  { name: 'Portraits', note: 'The confidence Courage brought into the studio.', photos: [0, 1] },
  { name: 'The degree', note: 'The photographs that hold what this day means.', photos: [2, 3] },
  { name: 'Celebration', note: 'The joy that came after all the work.', photos: [4, 5] }
];
export const canvasCaptions = [
  'Courage, this is where the session begins: composed, proud, and ready.',
  'The cap, the smile, and the relief after all the work.',
  'A closer look at the degree you worked for.',
  'One quiet frame before the celebration took over.',
  'The joy in this portrait needed room around it.',
  'One last portrait for the road ahead.'
];

export function CanvasFocus({ photos, index, onSelect, onClose, reduced, clientName, frames }) {
  const panel = useRef(null);
  useDialogFocus(true, panel, onClose);
  useEffect(() => {
    const onKey = event => {
      if (event.key === 'ArrowLeft' && index > 0) onSelect(index - 1);
      if (event.key === 'ArrowRight' && index < photos.length - 1) onSelect(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onSelect, photos.length]);

  const activePhoto = photos[index];
  const frame = frames?.get(activePhoto?.assetId) || {};
  const caption = frame.caption || frame.headline || (frames?.size ? `Photograph ${index + 1} from this collection.` : canvasCaptions[index % canvasCaptions.length]);

  return <motion.div className="fd-canvas-focus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={panel} role="dialog" aria-modal="true" aria-label={`Photograph ${index + 1} of ${clientName || "Courage's graduation portraits"}`} tabIndex={-1} initial={reduced ? false : { opacity: 0, scale: .975 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .985 }} transition={{ type: 'spring', damping: 28, stiffness: 240 }}>
      <button className="fd-canvas-focus-close" type="button" onClick={onClose} aria-label="Return to canvas"><X size={19} /></button>
      <div className="fd-canvas-focus-neighbours" aria-hidden="true">
        {index > 0 && <motion.div initial={reduced ? false : { opacity: 0, x: -30 }} animate={{ opacity: .2, x: 0 }}><Photo name={photos[index - 1].name} url={photos[index - 1].url} alt="" /></motion.div>}
        {index < photos.length - 1 && <motion.div initial={reduced ? false : { opacity: 0, x: 30 }} animate={{ opacity: .2, x: 0 }}><Photo name={photos[index + 1].name} url={photos[index + 1].url} alt="" /></motion.div>}
      </div>
      <motion.figure layoutId={`canvas-photo-${index}`} data-frame-layout={frame.layout || undefined} data-type-style={frame.typographyStyle || undefined} data-text-background={frame.textBackground || undefined} style={frame.colorAccent ? { '--frame-accent': frame.colorAccent } : undefined} transition={{ type: 'spring', damping: 29, stiffness: 210 }}><Photo name={activePhoto.name} url={activePhoto.url} alt={activePhoto.alt} style={frame.focalPoint ? { objectPosition: frame.focalPoint } : undefined} eager sizes="(max-width: 767px) 96vw, 66vw" /></motion.figure>
      <motion.div className="fd-canvas-focus-copy" data-caption-position={frame.captionPosition || undefined} data-type-style={frame.typographyStyle || undefined} data-text-background={frame.textBackground || undefined} style={frame.colorAccent ? { '--frame-accent': frame.colorAccent } : undefined} key={index} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .25 }}><span>{(clientName || 'COURAGE').toUpperCase()} / PORTRAIT {String(index + 1).padStart(2, '0')}</span><p>{caption}</p><div><button type="button" onClick={() => onSelect(index - 1)} disabled={index === 0}><ChevronLeft size={17} />Previous</button><button type="button" onClick={() => onSelect(index + 1)} disabled={index === photos.length - 1}>Next<ChevronRight size={17} /></button></div></motion.div>
    </motion.section>
  </motion.div>;
}

export function CanvasDemo({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const [gallery, setGallery] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeCluster, setActiveCluster] = useState(null);
  const wall = useRef(null);
  const touchStart = useRef(null);
  const reduced = useReducedMotion();

  const photos = normalizeDeliveryPhotos(delivery, couragePhotos);
  // The canvas is the format's complete visual field. Keep every approved
  // photograph in the wall; the shared gallery remains available for the
  // original-size view and downloads.
  const wallPhotos = photos;
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / Canvas` : delivery.title) : 'Courage / Graduation';
  const clientName = delivery?.clientName || 'Courage';

  const clusters = useMemo(() => {
    if (delivery?.creativeDirection?.sections?.length) {
      return delivery.creativeDirection.sections.map((sec, idx) => ({
        name: sec.title,
        note: sec.subtitle || 'A distinct visual movement within the collection.',
        photos: sec.assetIds.map(id => wallPhotos.findIndex(p => p.assetId === id)).filter(i => i >= 0)
      })).filter(c => c.photos.length > 0);
    }
    const chunk = Math.ceil(wallPhotos.length / 3) || 1;
    return [
      { name: 'Portraits', note: delivery?.creativeDirection?.openingLine || 'The presence and character brought into the session.', photos: Array.from({ length: Math.min(chunk, wallPhotos.length) }, (_, i) => i) },
      { name: 'Key Moments', note: 'The photographs that hold what this shoot means.', photos: Array.from({ length: Math.min(chunk, Math.max(0, wallPhotos.length - chunk)) }, (_, i) => i + chunk) },
      { name: 'Celebration', note: delivery?.creativeDirection?.closingLine || 'The natural frames that came after all the work.', photos: Array.from({ length: Math.max(0, wallPhotos.length - chunk * 2) }, (_, i) => i + chunk * 2) }
    ].filter(item => item.photos.length > 0);
  }, [delivery, wallPhotos]);

  const cluster = activeCluster === null ? null : clusters[activeCluster];

  const moveDepth = event => {
    if (reduced || event.pointerType !== 'mouse' || !wall.current) return;
    const bounds = wall.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - .5) * 13;
    const y = ((event.clientY - bounds.top) / bounds.height - .5) * 10;
    wall.current.querySelectorAll('.fd-wall-depth').forEach((node, index) => {
      const depth = .35 + index % 3 * .22;
      node.style.transform = `translate3d(${x * depth}px, ${y * depth}px, 0)`;
    });
  };
  const resetDepth = () => wall.current?.querySelectorAll('.fd-wall-depth').forEach(node => { node.style.transform = 'translate3d(0,0,0)'; });
  const selectPhoto = index => {
    setSelected(index);
    onNarrationNavigate?.(wallPhotos[index]?.assetId);
  };
  const moveCluster = direction => {
    if (activeCluster === null) setActiveCluster(direction > 0 ? 0 : clusters.length - 1);
    else setActiveCluster(value => Math.max(0, Math.min(clusters.length - 1, value + direction)));
  };

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#d8cbb8',
    surface: '#eee5d8',
    text: '#19130f',
    accent: '#764831'
  });

  return <div className="fd-page fd-canvas" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={themeStyles}>
    <DemoHeader format="Canvas" client={client} sectionId="canvas" onGallery={() => setGallery(true)} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    <main className="fd-wall-shell">
      <header className="fd-wall-intro"><div><span>{clientName.toUpperCase()} · CANVAS</span><strong>{cluster ? cluster.name : 'The complete canvas'}</strong></div><AnimatePresence mode="wait"><motion.p key={cluster?.name || 'overview'} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .35 }}>{cluster ? cluster.note : 'Every finished portrait is here. Choose a group, or open any photograph.'}</motion.p></AnimatePresence>{activeCluster !== null && <button type="button" onClick={() => setActiveCluster(null)}><Grid2X2 size={15} />See the whole canvas</button>}</header>
      <section className="fd-wall-stage" onPointerMove={moveDepth} onPointerLeave={resetDepth} onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(distance) > 48) moveCluster(distance < 0 ? 1 : -1); }}>
        <div ref={wall} className={'fd-wall' + (activeCluster === null ? ' is-overview' : ' is-focus') + (wallPhotos.length > 6 ? ' has-many' : '')}>
          <div className="fd-wall-grid" aria-hidden="true" />
          <div className="fd-wall-glow" aria-hidden="true"><i /><i /></div>
          <svg className="fd-wall-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M 17 30 C 28 8, 45 12, 54 34 S 75 60, 91 28" /><path d="M 12 72 C 31 58, 38 88, 56 75 S 77 72, 91 84" /></svg>
          <motion.div className="fd-wall-title" initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: activeCluster === null ? 1 : .18, y: 0 }}><span>A SPATIAL PORTRAIT STUDY</span><strong>{clientName},<br />all in view.</strong></motion.div>
          {wallPhotos.map((photo, index) => {
            const clusterIndex = clusters.findIndex(item => item.photos.includes(index));
            const place = clusterIndex >= 0 ? clusters[clusterIndex].photos.indexOf(index) : 0;
            const inCluster = activeCluster === clusterIndex;
            const dimmed = activeCluster !== null && !inCluster;
            const cardClass = wallPhotos.length > 6 ? 'is-card-extra' : `is-card-${index + 1}`;
            const frame = frames.get(photo.assetId) || {};
            return <motion.button layout layoutId={`canvas-photo-${index}`} type="button" key={photo.url || photo.name} data-frame-layout={frame.layout || undefined} data-type-style={frame.typographyStyle || undefined} data-text-background={frame.textBackground || undefined} data-caption-position={frame.captionPosition || undefined} className={`fd-wall-card ${cardClass}${inCluster ? ` is-in-cluster is-place-${place + 1}` : ''}${dimmed ? ' is-dimmed' : ''}`} style={frame.colorAccent ? { '--frame-accent': frame.colorAccent } : undefined} onClick={() => selectPhoto(index)} initial={reduced ? false : { opacity: 0, scale: .86, ...canvasEntrances[index % canvasEntrances.length] }} animate={{ opacity: dimmed ? .16 : 1, scale: dimmed ? .88 : 1, x: 0, y: 0, rotate: 0 }} whileHover={reduced ? undefined : { scale: 1.025, y: -6 }} transition={{ layout: { type: 'spring', damping: 28, stiffness: 190 }, opacity: { duration: reduced ? 0 : .35 }, delay: reduced ? 0 : index * .055 }} aria-label={`Open photograph ${index + 1}`}><div className="fd-wall-depth"><motion.span animate={reduced ? undefined : { scale: [1.01, 1.05], x: index % 2 ? ['0%', '-1.2%'] : ['-1%', '1%'] }} transition={{ duration: 9 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={photo.name} url={photo.url} alt={photo.alt || photo.caption} style={frame.focalPoint ? { objectPosition: frame.focalPoint } : undefined} eager={index < 3} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 34vw, 25vw" /></motion.span><i>{String(index + 1).padStart(2, '0')}</i><small className="fd-wall-caption">{photo.caption}</small></div></motion.button>;
          })}
          <AnimatePresence>{cluster && <motion.div className="fd-wall-focus-label" key={cluster.name} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: reduced ? 0 : .28 }}><span>0{activeCluster + 1} / 0{clusters.length}</span><strong>{cluster.name}</strong><p>{cluster.note}</p></motion.div>}</AnimatePresence>
        </div>
      </section>
      <footer className="fd-wall-controls"><span>Choose a group</span><nav aria-label="Canvas groups">{clusters.map((item, index) => <button type="button" key={item.name} className={activeCluster === index ? 'is-active' : ''} onClick={() => setActiveCluster(index)}><i>0{index + 1}</i><strong>{item.name}</strong></button>)}</nav><div className="fd-wall-arrows"><button type="button" onClick={() => moveCluster(-1)} disabled={activeCluster === 0} aria-label="Previous group"><ChevronLeft size={18} /></button><button type="button" onClick={() => moveCluster(1)} disabled={activeCluster === clusters.length - 1} aria-label="Next group"><ChevronRight size={18} /></button></div></footer>
    </main>
    <AnimatePresence>{selected !== null && <CanvasFocus photos={wallPhotos} index={selected} onSelect={selectPhoto} onClose={() => setSelected(null)} reduced={reduced} clientName={clientName} frames={frames} />}</AnimatePresence>
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={client} onClose={() => setGallery(false)} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}

export const chapters = [
  {
    name: 'Side by Side',
    kicker: 'THE OPENING PORTRAITS',
    line: 'The two of you, side by side, from the very first frame.',
    note: 'Folake and Tunde, you arrived in matching bronze and looked completely at home beside each other from the first frame.',
    accent: '#d7a86e',
    photos: [weddingPhotos[0], weddingPhotos[3]],
    captions: ['The first portrait of you together.', 'A full look at the outfits you chose for the day.']
  },
  {
    name: 'The Way They Looked',
    kicker: 'BETWEEN THE POSES',
    line: 'The smiles you kept finding between frames.',
    note: 'Some of our favourite portraits came when you stopped looking at the camera and looked at each other.',
    accent: '#c89057',
    photos: [weddingPhotos[1], weddingPhotos[2]],
    captions: ['Tunde, this was the moment you made Folake laugh.', 'You only needed one look at each other.']
  },
  {
    name: 'Just Us',
    kicker: 'SAVED FOR THE END',
    line: 'One quiet photograph of the two of you to close the collection.',
    note: 'After the formal portraits, you held each other close. We saved this frame for the end.',
    accent: '#e0b989',
    photos: [weddingPhotos[4]],
    captions: ['Folake and Tunde, this quiet moment was the right way to finish.']
  }
];

export function ChaptersDemo({ delivery, galleryProps, audioState, toggleAudio, narrationRef, onNarrationNavigate }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [visited, setVisited] = useState([]);
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [narrationChapter, setNarrationChapter] = useState(null);
  const reduced = useReducedMotion();

  const photos = normalizeDeliveryPhotos(delivery, weddingPhotos);
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / Chapters` : delivery.title) : 'Folake & Tunde';
  const clientName = delivery?.clientName || 'Folake & Tunde';
  const studioName = delivery?.branding?.name ? `${delivery.branding.name.toUpperCase()} / ` : 'MAYFLOWER VISUALS / ';

  const chaptersData = useMemo(() => {
    if (delivery?.creativeDirection?.sections?.length) {
      const accents = ['#d7a86e', '#c89057', '#e0b989', '#cca578', '#dfb88e'];
      return delivery.creativeDirection.sections.map((section, idx) => ({
        name: section.title,
        kicker: `CHAPTER 0${idx + 1}`,
        line: section.subtitle || 'A deliberate movement in this shoot.',
        note: section.subtitle || delivery?.creativeDirection?.openingLine || 'Explore every frame.',
        accent: section.accent || delivery?.creativeDirection?.palette?.accent || accents[idx % accents.length],
        layout: section.layout || 'chapter-cover',
        photos: section.assetIds.map(id => photos.find(p => p.assetId === id)).filter(Boolean),
        captions: section.assetIds.map(id => frames.get(id)?.caption || frames.get(id)?.headline || ''),
        frame: frames.get(section.assetIds[0]) || {}
      })).filter(ch => ch.photos.length > 0);
    }
    return chapters.map(chapter => ({ ...chapter, layout: chapter.layout || 'chapter-cover' }));
  }, [delivery, photos, frames]);

  const openChapterData = openIndex === null ? null : chaptersData[openIndex];

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#090708',
    surface: '#171111',
    text: '#f3ece4',
    accent: '#d7a86e'
  });

  const openChapter = index => {
    setVisited(value => value.includes(index) ? value : [...value, index]);
    setOpenIndex(index);
    onNarrationNavigate?.(chaptersData[index]?.photos?.map(photo => photo.assetId) || []);
  };
  useEffect(() => {
    const narration = narrationRef?.current;
    const segments = delivery?.narration?.segments || [];
    if (!narration || !segments.length || !chaptersData.length) return undefined;
    const syncChapter = () => {
      const time = narration.currentTime;
      const segmentIndex = segments.findIndex(segment => time >= Number(segment.startSec || 0) && time < Number(segment.endSec || 0));
      if (segmentIndex < 0) return;
      const segment = segments[segmentIndex];
      const matchedIndex = segment.sectionId ? (delivery.creativeDirection?.sections || []).findIndex(section => section.id === segment.sectionId) : -1;
      const nextIndex = matchedIndex >= 0 ? Math.min(matchedIndex, chaptersData.length - 1) : Math.min(chaptersData.length - 1, Math.floor((segmentIndex / Math.max(1, segments.length)) * chaptersData.length));
      setNarrationChapter(nextIndex);
      setVisited(value => value.includes(nextIndex) ? value : [...value, nextIndex]);
      setOpenIndex(current => current === nextIndex ? current : nextIndex);
    };
    const finish = () => setNarrationChapter(null);
    narration.addEventListener('timeupdate', syncChapter);
    narration.addEventListener('ended', finish);
    narration.addEventListener('pause', finish);
    return () => { narration.removeEventListener('timeupdate', syncChapter); narration.removeEventListener('ended', finish); narration.removeEventListener('pause', finish); };
  }, [narrationRef, delivery?.narration?.segments, delivery?.creativeDirection?.sections, chaptersData]);
  const openPhoto = photo => {
    const photoIdx = photos.findIndex(item => (photo.assetId ? item.assetId === photo.assetId : item.name === photo.name));
    setGalleryIndex(photoIdx >= 0 ? photoIdx : 0);
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  return <div className="fd-page fd-chapters" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={{ ...themeStyles, '--chapter-accent': openChapterData?.accent || themeStyles['--fd-accent'] }}>
    <DemoHeader format="Chapters" client={client} sectionId="chapters" onGallery={() => { setGalleryIndex(null); setGallery(true); }} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />

    <AnimatePresence mode="wait">
      {openChapterData === null ? <motion.main key="chapter-directory" className="fd-chapter-directory" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <header>
          <div><span>{studioName}FOR {clientName.toUpperCase()}</span><h1>{clientName},<br />where would you like to begin?</h1></div>
          <p>{delivery?.creativeDirection?.openingLine || `We arranged your ${photos.length} finished portraits into ${chaptersData.length} chapters. Open whichever one you want first.`}</p>
          <div><strong>0{chaptersData.length}</strong><span>CHAPTERS</span><strong>{String(photos.length).padStart(2, '0')}</strong><span>PORTRAITS</span></div>
        </header>
        <section className={`fd-chapter-directory-board ${chaptersData.length > 3 ? 'is-grid-layout' : ''}`} aria-label={`${clientName}'s chapters`}>{chaptersData.map((item, index) => <motion.button type="button" key={item.name} data-layout={item.layout || 'chapter-cover'} data-frame-layout={item.frame?.layout || undefined} data-type-style={item.frame?.typographyStyle || undefined} data-text-background={item.frame?.textBackground || undefined} style={item.frame?.colorAccent ? { '--frame-accent': item.frame.colorAccent } : undefined} className={`is-card-${(index % 3) + 1}${visited.includes(index) ? ' is-visited' : ''}${narrationChapter === index ? ' is-narrating' : ''}`} onClick={() => openChapter(index)} initial={reduced ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .65, delay: reduced ? 0 : .12 + index * .1, ease: [0.22, 1, 0.36, 1] }} whileHover={reduced ? undefined : { y: -5 }} whileTap={reduced ? undefined : { scale: .985 }}>
          <motion.span className="fd-chapter-directory-photo" animate={reduced ? undefined : { scale: [1.01, 1.055], x: index % 2 ? ['0%', '-1%'] : ['-1%', '1%'] }} transition={{ duration: 9 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={item.photos[0].name} url={item.photos[0].url} alt={`${item.name} chapter cover`} style={item.frame?.focalPoint ? { objectPosition: item.frame.focalPoint } : undefined} eager={index === 0} sizes="(max-width: 767px) 64vw, 34vw" /></motion.span>
          <span className="fd-chapter-directory-shade" />
          <span className="fd-chapter-directory-number">0{index + 1}</span>
          <span className="fd-chapter-directory-copy"><i>{item.photos.length} {item.photos.length === 1 ? 'portrait' : 'portraits'}</i><strong>{item.name}</strong><p>{item.line}</p><b>Open chapter<ChevronRight size={15} /></b></span>
          {visited.includes(index) && <span className="fd-chapter-directory-viewed"><Check size={12} />Viewed</span>}
        </motion.button>)}</section>
        <footer><span>Take your time. You can return here or open your complete gallery whenever you want.</span><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>View all {photos.length} portraits<Images size={16} /></button></footer>
      </motion.main> : <motion.main key={'chapter-room-' + openIndex} className={`fd-chapter-room${narrationChapter === openIndex ? ' is-narrating' : ''}`} style={{ '--chapter-accent': openChapterData.accent }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <aside className="fd-chapter-room-copy">
          <button type="button" onClick={() => setOpenIndex(null)}><ArrowLeft size={16} />All chapters</button>
          <span>{openChapterData.kicker}</span>
          {narrationChapter === openIndex && <div className="fd-chapter-narration"><Volume2 size={14} />Narrating this chapter</div>}
          <div className="fd-chapter-room-count">0{openIndex + 1} / 0{chaptersData.length}</div>
          <h1>{openChapterData.name}</h1>
          <p>{openChapterData.note}</p>
          <nav aria-label="Other chapters">{chaptersData.map((item, index) => <button type="button" key={item.name} className={openIndex === index ? 'is-active' : ''} onClick={() => openChapter(index)}><i>0{index + 1}</i>{item.name}{visited.includes(index) && <Check size={12} />}</button>)}</nav>
        </aside>
        <section className={'fd-chapter-room-art ' + (openChapterData.photos.length === 1 ? 'is-single' : 'is-pair')}>
          <span className="fd-chapter-room-number" aria-hidden="true">0{openIndex + 1}</span>
          <div className="fd-chapter-room-photos">{openChapterData.photos.map((photo, index) => {
            const caption = openChapterData.captions?.[index] || frames.get(photo.assetId)?.caption || frames.get(photo.assetId)?.headline || '';
            const frame = frames.get(photo.assetId) || {};
            return <motion.button type="button" key={photo.url || photo.name} data-frame-layout={frame.layout || undefined} data-type-style={frame.typographyStyle || undefined} data-text-background={frame.textBackground || undefined} data-caption-position={frame.captionPosition || undefined} style={frame.colorAccent ? { '--frame-accent': frame.colorAccent } : undefined} onClick={() => openPhoto(photo)} initial={reduced ? false : { opacity: 0, y: 38, clipPath: 'inset(0 0 14% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: reduced ? 0 : .78, delay: reduced ? 0 : .14 + index * .12, ease: [0.22, 1, 0.36, 1] }} aria-label={`Open ${caption}`}><motion.div animate={reduced ? undefined : { scale: [1.015, 1.06], x: index % 2 ? ['0%', '-1%'] : ['-1%', '1%'] }} transition={{ duration: 10 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={photo.name} url={photo.url} alt={photo.alt} style={frame.focalPoint ? { objectPosition: frame.focalPoint } : undefined} eager sizes="(max-width: 767px) 92vw, 48vw" /></motion.div><span>0{index + 1}</span><p>{caption}</p></motion.button>;
          })}</div>
          <footer><button type="button" onClick={() => setOpenIndex(null)}>All chapters<Grid2X2 size={17} /></button><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>View full gallery<Images size={17} /></button></footer>
        </section>
      </motion.main>}
    </AnimatePresence>

    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={client} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}

export const albumSpreads = [
  {
    id: 'opening',
    label: 'THE OPENING PORTRAIT',
    title: 'The people who make home feel like home.',
    copy: 'Everyone arrived in white, with coral beads carrying the colour through every frame. This portrait belonged at the beginning.'
  },
  {
    id: 'together',
    label: 'WHEN EVERYONE RELAXED',
    title: 'Then the formal pose gave way to this.',
    copy: 'The photograph where every smile felt easy.'
  },
  {
    id: 'finale',
    label: 'ONE TO LEAVE OPEN',
    title: 'Adeyemis, these are the photographs you will keep coming back to.',
    copy: 'Your complete family gallery is ready whenever you want to see every finished portrait.'
  }
];

export function AlbumSpread({ spread, index, reduced, onGallery }) {
  const frameAttrs = { 'data-frame-layout': spread.frame?.layout || undefined, 'data-type-style': spread.frame?.typographyStyle || undefined, 'data-text-background': spread.frame?.textBackground || undefined };
  const frameStyle = spread.frame?.colorAccent ? { '--frame-accent': spread.frame.colorAccent } : undefined;
  if (spread.id === 'opening') return <section className="fd-album-spread is-opening" data-layout={spread.layout || 'spread'} {...frameAttrs} style={frameStyle}>
    <figure><motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], x: ['0%', '-.8%'] }} transition={{ duration: 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={spread.photo1.name} url={spread.photo1.url} alt={spread.photo1.alt} eager sizes="(max-width: 767px) 100vw, 50vw" /></motion.div></figure>
    <article><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p><small>{spread.footer}</small></article>
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;

  if (spread.id === 'together') return <section className="fd-album-spread is-wide" data-layout={spread.layout || 'spread'} {...frameAttrs} style={frameStyle}>
    <motion.figure animate={reduced ? undefined : { scale: [1.005, 1.035] }} transition={{ duration: 11, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={spread.photo1.name} url={spread.photo1.url} alt={spread.photo1.alt} eager sizes="100vw" /></motion.figure>
    <div><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p></div>
  </section>;

  return <section className="fd-album-spread is-finale" data-layout={spread.layout || 'spread'} {...frameAttrs} style={frameStyle}>
    <figure className="is-family"><motion.div animate={reduced ? undefined : { scale: [1.01, 1.05], x: ['-.6%', '.6%'] }} transition={{ duration: 10.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={spread.photo1.name} url={spread.photo1.url} alt={spread.photo1.alt} eager sizes="(max-width: 767px) 100vw, 50vw" /></motion.div></figure>
    <article>{spread.photo2 && <figure className="is-mother"><motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], y: ['0%', '-.7%'] }} transition={{ duration: 9.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={spread.photo2.name} url={spread.photo2.url} alt={spread.photo2.alt || 'Photograph from this album'} eager sizes="(max-width: 767px) 100vw, 34vw" /></motion.div></figure>}<div><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p><button type="button" onClick={onGallery}>View full gallery<Images size={17} /></button></div></article>
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;
}

export function AlbumDemo({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [gallery, setGallery] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const touchStart = useRef(null);
  const audio = useRef(null);
  const reduced = useReducedMotion();

  const photos = normalizeDeliveryPhotos(delivery, albumPhotos);
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / Album` : delivery.title) : 'The Adeyemi Family';
  const clientName = delivery?.clientName || 'The Adeyemi Family';
  const studioName = delivery?.branding?.name ? `${delivery.branding.name.toUpperCase()} PRESENTS` : 'VEYLO MEDIA PRESENTS';
  const albumTitle = delivery?.creativeDirection?.title || 'Family Album';
  const demoOnly = !delivery;
  const audioTrack = delivery?.soundtrack?.url || (demoOnly ? '/audio/soundtrack-1.mp3' : '');

  const playSoundtrack = () => {
    if (!audio.current) return;
    setAudioLoading(true);
    setAudioFailed(false);
    audio.current.play().catch(() => {
      setAudioLoading(false);
      setAudioFailed(true);
    });
  };

  const spreadsData = useMemo(() => {
    if (delivery && photos.length) {
      const approvedSections = (delivery.creativeDirection?.sections || []).filter(section => (section.assetIds || []).some(assetId => photos.some(photo => photo.assetId === assetId)));
      if (approvedSections.length) {
        return approvedSections.map((section, index) => {
          const sectionPhotos = (section.assetIds || []).map(assetId => photos.find(photo => photo.assetId === assetId)).filter(Boolean);
          const first = sectionPhotos[0] || photos[index] || photos[0];
          const second = sectionPhotos[1];
          const frame = frames.get(first?.assetId) || {};
          const last = index === approvedSections.length - 1;
          return {
            id: index === 0 ? 'opening' : last ? 'finale' : 'together',
            label: section.label || `SPREAD ${String(index + 1).padStart(2, '0')}`,
            title: frame.headline || section.title || delivery.creativeDirection?.title || 'Selected photographs',
            copy: frame.caption || section.subtitle || delivery.creativeDirection?.openingLine || '',
            footer: index === 0 ? `${clientName.toUpperCase()} Â· ${new Date().getFullYear()}` : undefined,
            photo1: first,
            photo2: last ? (second || sectionPhotos[sectionPhotos.length - 1]) : undefined,
            layout: section.layout || 'spread',
            frame
          };
        });
      }
      const list = [];
      const photo1 = photos[1] || photos[0];
      const f1 = frames.get(photo1.assetId) || {};
      list.push({
        id: 'opening',
        label: 'THE OPENING PORTRAIT',
        title: f1.headline || delivery.creativeDirection?.title || 'Selected photographs',
        copy: f1.caption || delivery.creativeDirection?.openingLine || 'The opening photographs from this delivery.',
        footer: `${clientName.toUpperCase()} · ${new Date().getFullYear()}`,
        photo1,
        frame: f1
      });

      for (let i = 2; i < photos.length - 2; i++) {
        const p = photos[i];
        const f = frames.get(p.assetId) || {};
        list.push({
          id: 'together',
          label: `SPREAD ${String(i).padStart(2, '0')}`,
          title: f.headline || '',
          copy: f.caption || '',
          photo1: p,
          frame: f
        });
      }

      const finaleP1 = photos[photos.length - 2] || photos[0];
      const finaleP2 = photos[photos.length - 1];
      const fFinal = frames.get(finaleP1.assetId) || {};
      list.push({
        id: 'finale',
        label: 'SAVED FOR THE END',
        title: fFinal.headline || `${clientName}, these photographs are ready to keep.`,
        copy: delivery.creativeDirection?.closingLine || '',
        photo1: finaleP1,
        photo2: finaleP2,
        frame: fFinal
      });

      return list;
    }
    return [
      { id: 'opening', label: 'THE OPENING PORTRAIT', title: 'The people who make home feel like home.', copy: 'Everyone arrived in white, with coral beads carrying the colour through every frame. This portrait belonged at the beginning.', footer: 'THE ADEYEMI FAMILY · 2026', photo1: albumPhotos[1] },
      { id: 'together', label: 'WHEN EVERYONE RELAXED', title: 'Then the formal pose gave way to this.', copy: 'The photograph where every smile felt easy.', photo1: albumPhotos[2] },
      { id: 'finale', label: 'ONE TO LEAVE OPEN', title: 'Adeyemis, these are the photographs you will keep coming back to.', copy: 'Your complete family gallery is ready whenever you want to see every finished portrait.', photo1: albumPhotos[3], photo2: albumPhotos[4] }
    ];
  }, [delivery, photos, frames, clientName]);

  const openAlbum = () => {
    setStarted(true);
    setPage(0);
    onNarrationNavigate?.([spreadsData[0]?.photo1?.assetId, spreadsData[0]?.photo2?.assetId].filter(Boolean));
    if (audio.current && !muted) {
      audio.current.volume = .32;
      playSoundtrack();
    }
  };
  const next = () => {
    if (page >= spreadsData.length - 1) return;
    setDirection(1);
    const nextPage = page + 1;
    setPage(nextPage);
    onNarrationNavigate?.([spreadsData[nextPage]?.photo1?.assetId, spreadsData[nextPage]?.photo2?.assetId].filter(Boolean));
  };
  const previous = () => {
    if (page === 0) {
      setStarted(false);
      audio.current?.pause();
      return;
    }
    setDirection(-1);
    const previousPage = page - 1;
    setPage(previousPage);
    onNarrationNavigate?.([spreadsData[previousPage]?.photo1?.assetId, spreadsData[previousPage]?.photo2?.assetId].filter(Boolean));
  };
  const toggleSound = () => {
    if (audioFailed) {
      setMuted(false);
      playSoundtrack();
      return;
    }
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!audio.current) return;
    audio.current.muted = nextMuted;
    if (nextMuted) setAudioLoading(false);
    if (!nextMuted && started && !gallery) playSoundtrack();
  };

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    if (gallery) player.pause();
    else if (started && !muted) playSoundtrack();
  }, [gallery, started, muted]);

  useEffect(() => {
    const onKey = event => {
      if (!started || gallery) return;
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => () => audio.current?.pause(), []);

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#061426',
    surface: '#eadcc7',
    text: '#f5f7fb',
    accent: '#ef8969'
  });

  return <div className="fd-page fd-album" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={themeStyles}>
    {audioTrack && <audio ref={audio} src={audioTrack} loop preload="auto" muted={muted} onWaiting={() => setAudioLoading(true)} onStalled={() => setAudioLoading(true)} onPlaying={() => { setAudioLoading(false); setAudioFailed(false); }} onPause={() => setAudioLoading(false)} onError={() => { setAudioLoading(false); setAudioFailed(true); }} />}
    <DemoHeader format="Album" client={client} sectionId="album" onGallery={() => setGallery(true)} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} hideSoundtrack />
    {!started ? <main className="fd-album-cover">
      <motion.figure initial={reduced ? false : { scale: 1.01 }} animate={{ scale: reduced ? 1 : 1.035 }} transition={{ duration: reduced ? 0 : 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={photos[0].name} url={photos[0].url} alt={`${clientName} cover photograph`} eager sizes="100vw" /></motion.figure>
      <div className="fd-album-cover-shade" />
      <motion.section initial={reduced ? false : { y: 24 }} animate={{ y: 0 }} transition={{ duration: reduced ? 0 : .8, delay: reduced ? 0 : .18 }}><span>{studioName}</span><h1>{clientName}<br /><em>{albumTitle}</em></h1><p>{photos.length} finished portraits, arranged one page at a time.</p><button type="button" onClick={openAlbum}>Open album<BookOpen size={18} /></button></motion.section>
      <div className="fd-album-cover-folio"><span>{delivery?.shootType?.toUpperCase() || 'FAMILY PORTRAITS'}</span><b>{new Date().getFullYear()}</b></div>
    </main> : <main className="fd-album-reader" aria-live="polite" onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(distance) > 45) distance < 0 ? next() : previous(); }}>
      <div className="fd-album-reader-head"><span>{clientName.toUpperCase()}</span><div><i>{String(page + 1).padStart(2, '0')}</i><b>/</b><i>{String(spreadsData.length).padStart(2, '0')}</i></div><span>{albumTitle.toUpperCase()} · {new Date().getFullYear()}</span></div>
      <div className="fd-album-stage"><AnimatePresence mode="wait" custom={direction}><motion.div key={spreadsData[page].id + page} custom={direction} initial={reduced ? false : { opacity: .58, x: direction > 0 ? 38 : -38, clipPath: direction > 0 ? 'inset(0 0 0 7%)' : 'inset(0 7% 0 0)' }} animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)' }} exit={reduced ? undefined : { opacity: 0, x: direction > 0 ? -26 : 26, clipPath: direction > 0 ? 'inset(0 7% 0 0)' : 'inset(0 0 0 7%)' }} transition={{ duration: reduced ? 0 : .68, ease: [0.22, 1, 0.36, 1] }}><AlbumSpread spread={spreadsData[page]} index={page} reduced={reduced} onGallery={() => setGallery(true)} /></motion.div></AnimatePresence></div>
      <footer className="fd-album-controls">
        <button type="button" onClick={previous}>
          <ChevronLeft size={18} />
          <span>{page === 0 ? 'Back to cover' : 'Previous page'}</span>
        </button>
        <div className="fd-album-dots-wrap">
          {spreadsData.length <= 10 ? (
            spreadsData.map((spread, index) => (
              <button
                type="button"
                key={spread.id + index}
                className={page === index ? 'is-active' : ''}
                onClick={() => {
                  setDirection(index > page ? 1 : -1);
                  setPage(index);
                }}
                aria-label={`Open album page ${index + 1}`}
              >
                <i />
              </button>
            ))
          ) : (
            <span className="fd-album-counter">Spread {page + 1} of {spreadsData.length}</span>
          )}
        </div>
        <button type="button" onClick={next} disabled={page === spreadsData.length - 1}>
          <span>Next page</span>
          <ChevronRight size={18} />
        </button>
      </footer>
    </main>}
    {started && audioTrack && <button className={`fd-album-sound ${audioLoading ? 'is-loading' : ''} ${audioFailed ? 'is-error' : ''}`} type="button" onClick={toggleSound} aria-label={audioLoading ? 'Stop loading album soundtrack' : audioFailed ? 'Try album soundtrack again' : muted ? 'Turn album soundtrack on' : 'Mute album soundtrack'} aria-busy={audioLoading}>{audioLoading ? <LoaderCircle className="v-spin" size={17} /> : muted || audioFailed ? <VolumeX size={17} /> : <Volume2 size={17} />}<span aria-live="polite">{audioLoading ? 'Loading music…' : audioFailed ? 'Try music again' : muted ? 'Sound off' : 'Sound on'}</span></button>}
    <AnimatePresence>{gallery && <DemoGallery photos={photos} title={client} onClose={() => setGallery(false)} delivery={delivery} {...galleryProps} />}</AnimatePresence>
  </div>;
}

const AsyncEventCoverageViewer = React.lazy(() => import('../components/delivery/EventCampaignViewers.jsx').then(module => ({ default: module.EventCoverageViewer })));
const AsyncCampaignDeliveryViewer = React.lazy(() => import('../components/delivery/EventCampaignViewers.jsx').then(module => ({ default: module.CampaignDeliveryViewer })));

function NewFormatDemo({ children }) {
  return <React.Suspense fallback={<div className="vd-state">Opening the delivery…</div>}>{children}</React.Suspense>;
}

export default function FormatDemo() {
  const { formatId } = useParams();
  useEffect(() => { const names = { editorial: 'Editorial Page', reveal: 'Photo Reveal', canvas: 'Canvas', chapters: 'Chapters', album: 'Album', 'event-coverage': 'Event Coverage', campaign: 'Campaign Delivery' }; if (names[formatId]) document.title = `Veylo — ${names[formatId]} demo`; }, [formatId]);
  if (formatId === 'photo-story' || formatId === 'story') return <Navigate to="/demo" replace />;
  if (formatId === 'editorial') return <EditorialDemo />;
  if (formatId === 'reveal') return <RevealDemo />;
  if (formatId === 'canvas') return <CanvasDemo />;
  if (formatId === 'chapters') return <ChaptersDemo />;
  if (formatId === 'album') return <AlbumDemo />;
  if (formatId === 'event-coverage') return <NewFormatDemo><AsyncEventCoverageViewer /></NewFormatDemo>;
  if (formatId === 'campaign') return <NewFormatDemo><AsyncCampaignDeliveryViewer /></NewFormatDemo>;
  return <Navigate to="/#formats" replace />;
}
