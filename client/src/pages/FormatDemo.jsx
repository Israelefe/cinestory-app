import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationControls, useInView, useScroll, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, Download, Film, Grid2X2, Heart, Images, LoaderCircle, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { Photo } from '../components/PublicDesign.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import ClientGallery from '../components/delivery/ClientGallery.jsx';
import DeliveryBrandMark from '../components/delivery/DeliveryBrandMark.jsx';
import { EVENT_COVERAGE_DEMO_PHOTOS } from '../constants/eventCoverageDemo.js';
import { getDeliveryCapabilities } from '../constants/deliveryCapabilities.js';
import { useSmoothSoundtrackLoop } from '../utils/smoothSoundtrackLoop.js';
import { deliveryFontStyles } from '../utils/deliveryTypography.js';
import CanvasBoard from '../components/delivery/CanvasBoard.jsx';
import EditorialViewer from '../components/delivery/EditorialViewer.jsx';
import RevealViewer from '../components/delivery/RevealViewer.jsx';
import { PHOTO_REVEAL_DEMO } from '../constants/photoRevealDemo.js';
import { EDITORIAL_DEMO_DELIVERY } from '../constants/editorialDemo.js';
import { useClosingGallery } from '../utils/useClosingGallery.js';
import AlbumSpread, { AlbumCaption, AlbumPageTurn } from '../components/delivery/AlbumSpread.jsx';
import { albumSpreads as normalizeAlbumSpreads } from '../utils/deliveryPresentation.js';
import { albumBookRatio, albumCoverRatio, albumCoverShape, albumPhotoKey, albumReaderPages, albumSpreadPhotos } from '../utils/albumPresentation.js';
import '../styles/format-demos.css';
import '../components/delivery/DeliveryTypography.css';
import '../styles/chapters.css';
import '../components/delivery/AlbumViewer.css';

const soundtrackRamps = new WeakMap();
function fadeSoundtrack(element, target, duration = 900, onComplete) {
  if (!element) return;
  const activeRamp = soundtrackRamps.get(element);
  if (activeRamp) cancelAnimationFrame(activeRamp);
  const startVolume = Number.isFinite(element.volume) ? element.volume : 1;
  const startedAt = performance.now();
  const tick = now => {
    const progress = duration <= 0 ? 1 : Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.volume = Math.max(0, Math.min(1, startVolume + (target - startVolume) * eased));
    if (progress < 1) soundtrackRamps.set(element, requestAnimationFrame(tick));
    else {
      soundtrackRamps.delete(element);
      onComplete?.();
    }
  };
  soundtrackRamps.set(element, requestAnimationFrame(tick));
}

export const editorialPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-ada-${index + 1}`, alt: `Ada's fashion portrait ${index + 1}` }));
export const revealPhotos = Array.from({ length: 4 }, (_, index) => ({ name: `demo-sharon-${index + 1}`, alt: `Sharon's studio portrait ${index + 1}` }));
export const couragePhotos = Array.from({ length: 6 }, (_, index) => ({ name: `demo-courage-${index + 1}`, alt: `Courage's graduation portrait ${index + 1}` }));
export const weddingPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-wedding-${index + 1}`, alt: `Folake and Tunde's wedding portrait ${index + 1}` }));
export const albumPhotos = ['demo-album-fa-source', 'demo-album-fa-2', 'demo-album-fa-3', 'demo-album-fa-4', 'demo-album-fa-5'].map((name, index) => ({ name, width: 960, height: index === 2 ? 640 : index === 0 ? 1286 : 1285, alt: `The Adeyemi family album portrait ${index + 1}` }));
const ALBUM_DEMO_BRANDING = { type: 'studio', name: 'Veylo Studio' };
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

export function getFormatThemeStyles(delivery, fallback = {}) {
  const cd = delivery?.creativeDirection;
  const palette = cd?.palette || {};
  const typography = cd?.typography || {};

  const accent = palette.accent || palette.accentColor || fallback.accent || '#ff5a47';
  const bg = palette.background || palette.backgroundColor || fallback.bg || '#070709';
  const surface = palette.surface || palette.surfaceColor || fallback.surface || '#0e0e13';
  const text = palette.text || palette.textColor || fallback.text || '#f2eee8';
  const fonts = deliveryFontStyles(typography, { display: fallback.fontDisplay, body: fallback.fontBody });
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
    ...fonts,
    '--fd-font-display': fonts['--delivery-font-heading'],
    '--fd-font-body': fonts['--delivery-font-caption'],
    '--fd-image-filter': imageFilter,
    '--fd-density-gap': densityGap,
    '--fd-caption-weight': variation.captionTreatment === 'bold' ? '650' : variation.captionTreatment === 'quiet' ? '400' : '500',
    '--fd-accent-placement': variation.accentPlacement || 'rules',
    '--fd-composition': variation.composition || 'quiet',
    '--fd-pace': cd?.pace || 'warm'
  };
}

export function formatFrameAttributes(frame = {}) {
  return {
    'data-frame-layout': frame.layout || undefined,
    'data-caption-position': frame.captionPosition || undefined,
    'data-text-background': frame.textBackground || undefined,
    'data-type-style': frame.typographyStyle || undefined,
    'data-text-animation': frame.textAnimation || undefined,
    'data-frame-motion': frame.motion || undefined,
    'data-frame-transition': frame.transition || undefined
  };
}

export function formatFrameStyle(frame = {}) {
  return frame.colorAccent ? { '--frame-accent': frame.colorAccent } : undefined;
}

export function frameMotionValues(frame = {}, reduced = false) {
  const motionName = frame.motion || 'slow-push';
  if (reduced || motionName === 'still') return { scale: 1, x: 0, y: 0 };
  if (motionName === 'slow-pull') return { scale: [1.14, 1.02] };
  if (motionName === 'pan-left') return { scale: 1.12, x: ['4%', '-4%'] };
  if (motionName === 'pan-right') return { scale: 1.12, x: ['-4%', '4%'] };
  if (motionName === 'float') return { scale: [1.035, 1.07], y: ['1%', '-1%'] };
  return { scale: [1.02, 1.12] };
}

export function frameMotionTransition(frame = {}, index = 0, reduced = false) {
  return reduced || frame.motion === 'still'
    ? { duration: 0 }
    : { duration: 9 + Math.max(0, index), repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' };
}

export function normalizeDeliveryPhotos(delivery, fallbackPhotos, includeAll = false) {
  if (delivery?.assets?.length) {
    const frames = new Map((delivery.creativeDirection?.frames || []).map(frame => [String(frame.assetId), frame]));
    const allPhotos = delivery.assets.map((a, i) => ({
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
    if (includeAll) return allPhotos;
    const selectedIds = delivery.curatedAssetIds?.length
      ? delivery.curatedAssetIds
      : (delivery.creativeDirection?.frames || []).map(frame => frame.assetId);
    if (!selectedIds.length) return allPhotos;
    const byId = new Map(allPhotos.map(photo => [String(photo.assetId), photo]));
    const selected = selectedIds.map(id => byId.get(String(id))).filter(Boolean);
    return selected.length ? selected : allPhotos;
  }
  return fallbackPhotos.map(photo => ({ ...photo, caption: photo.caption || '' }));
}

export function DemoHeader({ format, client, sectionId, onGallery, light = false, delivery, demoBranding, audioState, toggleAudio, hideSoundtrack = false }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const embeddedPhone = searchParams.get('phoneView') === '1';

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
    if (!embeddedPhone && window.history.length > 1 && (isFromFormats || isFromNiche)) {
      e.preventDefault();
      navigate(-1);
    }
  };

  const branding = delivery?.branding || demoBranding;
  const brandName = branding?.name || 'Veylo';
  const capabilities = getDeliveryCapabilities(delivery?.format);
  const soundtrackLoading = audioState?.loading === 'soundtrack';
  const narrationLoading = audioState?.loading === 'narration';

  return <header className={'fd-header ' + (light ? 'is-light' : '')}>
    {delivery || demoBranding ? (
      <div className="fd-header-brand">
        <DeliveryBrandMark branding={branding} className="fd-header-logo" />
        <span className="fd-header-brand-copy">{branding?.type === 'studio' && <small>Photographed by</small>}<strong>{brandName}</strong></span>
      </div>
    ) : embeddedPhone ? (
      <span className="fd-header-brand">Veylo</span>
    ) : (
      <Link className="fd-back" to={backDestination} onClick={handleBack} aria-label={backAria}>
        <ArrowLeft size={17} />
        <span>{backLabel}</span>
      </Link>
    )}

    <div className="fd-header-title"><span>{format}</span><strong>{client}</strong></div>

    <div className="fd-header-actions">
      {!delivery && demoBranding && !embeddedPhone && <Link className="fd-back" to={backDestination} aria-label={backAria}><ArrowLeft size={17} /><span>Leave the demo</span></Link>}
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

function V3Bookend({ delivery, kind, onGallery }) {
  if (delivery?.schemaVersion !== 3) return null;
  const photos = normalizeDeliveryPhotos(delivery, [], true);
  const assetId = kind === 'opening' ? delivery.v3?.openingAssetId : delivery.v3?.closingAssetId;
  const photo = photos.find(item => item.assetId === assetId) || photos[0];
  const line = kind === 'opening' ? delivery.creativeDirection?.openingLine : delivery.creativeDirection?.closingLine;
  return <section className={'fd-v3-bookend is-' + kind}>
    {photo && <img src={photo.url} alt="" />}
    <div><span>{kind === 'opening' ? 'A VEYLO DELIVERY' : 'THE COMPLETE COLLECTION'}</span><h2>{kind === 'opening' ? delivery.creativeDirection?.title || delivery.clientName : 'The full gallery is ready.'}</h2><p>{line}</p>{kind === 'closing' && onGallery && <button type="button" onClick={onGallery}>View full gallery<Images size={17} /></button>}</div>
  </section>;
}

export function EditorialDemo(props) {
  return <EditorialViewer {...props} delivery={props.delivery || EDITORIAL_DEMO_DELIVERY} demo={!props.delivery} />;
}

export function RevealDemo(props) {
  return <RevealViewer {...props} delivery={props.delivery || PHOTO_REVEAL_DEMO} demo={!props.delivery} />;
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

export function CanvasDemo(props) {
  return <CanvasBoard {...props} />;
}

export const chapters = [
  {
    name: 'Side by Side',
    kicker: 'THE OPENING PORTRAITS',
    line: 'The two of you, side by side, from the very first frame.',
    note: 'Folake and Tunde, you arrived in matching bronze and looked completely at home beside each other from the first frame.',
    accent: '#d7a86e',
    photos: [weddingPhotos[0], weddingPhotos[3]],
    captions: [
      'Folake, your hand on Tunde\'s shoulder and the smile between you make this portrait feel easy. The bronze embroidery, your gele and his agbada belong in the frame, but it is the way you look at each other that holds it together.',
      'Standing together gives the outfits their full moment: the embroidery across your dress, the train at your feet and the folds of Tunde\'s agbada. We kept enough of the setting around you to show the whole portrait, right down to the shoes.'
    ]
  },
  {
    name: 'The Way They Looked',
    kicker: 'BETWEEN THE POSES',
    line: 'The smiles you kept finding between frames.',
    note: 'Some of our favourite portraits came when you stopped looking at the camera and looked at each other.',
    accent: '#c89057',
    photos: [weddingPhotos[1], weddingPhotos[2]],
    captions: [
      'With Tunde standing behind you, the portrait becomes a little closer. Your hands meet at your waist, and you turn towards each other with the same warm smile. The light from the glass doors picks up the detail in the bronze fabric.',
      'Tunde looks up from the chair while Folake rests a hand on his shoulder. There is room here for the smiles, the jewellery and the detail of both outfits. It is a relaxed portrait of the two of you, with the greenery framing the background.'
    ]
  },
  {
    name: 'Just Us',
    kicker: 'SAVED FOR THE END',
    line: 'One quiet photograph of the two of you to close the collection.',
    note: 'After the formal portraits, you held each other close. We saved this frame for the end.',
    accent: '#e0b989',
    photos: [weddingPhotos[4]],
    captions: ['Folake and Tunde, we saved this close portrait for the end. With your arms around each other and your faces almost touching, there is very little distance between you. The bronze fabric catches the light, and the room falls gently into the background.']
  }
];

const emptyChapterFrame = Object.freeze({});

function ChapterPhotoMotion({ frame, index, paused, children }) {
  const ref = useRef(null);
  const visible = useInView(ref, { amount: .04, margin: '140px 0px' });
  const controls = useAnimationControls();
  const reduced = useVeyloReducedMotion();

  useEffect(() => {
    if (reduced || frame?.motion === 'still') {
      controls.set({ scale: 1, x: 0, y: 0 });
    } else if (visible && !paused) {
      controls.start({ ...frameMotionValues(frame), transition: frameMotionTransition(frame, index) });
    } else {
      controls.stop();
    }
    return () => controls.stop();
  }, [controls, frame, index, paused, reduced, visible]);

  return <motion.span ref={ref} className="fd-chapter-photo-motion" initial={false} animate={controls}>{children}</motion.span>;
}

export function ChaptersDemo({ delivery, galleryProps, audioState, toggleAudio, narrationRef, onNarrationNavigate }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [demoLiked, setDemoLiked] = useState(() => new Set());
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const headingRef = useRef(null);
  const chapterCardsRef = useRef([]);
  const directoryScrollRef = useRef(0);
  const returnFocusIndexRef = useRef(0);
  const previousChapterIndexRef = useRef(null);
  const activeNarrationSectionRef = useRef(null);
  const reduced = useVeyloReducedMotion();
  const photoMotionPaused = reduced || motionPaused || !pageVisible || gallery;
  const entrance = { duration: .42, ease: [0.22, 1, 0.36, 1] };

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const allPhotos = useMemo(() => normalizeDeliveryPhotos(delivery, delivery ? [] : weddingPhotos, true).map(photo => {
    if (delivery) return photo;
    const chapter = chapters.find(item => item.photos.some(itemPhoto => itemPhoto.name === photo.name));
    return { ...photo, caption: chapter?.captions[chapter.photos.findIndex(item => item.name === photo.name)] || photo.caption };
  }), [delivery]);
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(frame => [String(frame.assetId), frame])), [delivery]);
  const client = delivery ? (delivery.clientName || delivery.title || 'Your photographs') : 'Folake & Tunde';
  const brandedDelivery = useMemo(() => delivery || {
    format: 'chapters',
    branding: { type: 'studio', name: 'Mayflower Visuals' },
    access: { allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: true }
  }, [delivery]);
  const studioName = brandedDelivery.branding?.name || 'Veylo';

  const chaptersData = useMemo(() => {
    if (delivery) {
      const sections = delivery.creativeDirection?.sections || [];
      if (!sections.length) {
        return allPhotos.length ? [{
          id: 'full-collection',
          name: 'Full collection',
          line: '',
          layout: 'single',
          photos: allPhotos,
          cover: allPhotos[0],
          frame: frames.get(String(allPhotos[0]?.assetId)) || emptyChapterFrame,
          captions: []
        }] : [];
      }
      const accents = ['#d7a86e', '#c89057', '#e0b989', '#cca578', '#dfb88e'];
      return sections.map((section, index) => {
        const chapterPhotos = (section.assetIds || []).map(id => allPhotos.find(photo => String(photo.assetId) === String(id))).filter(Boolean);
        const cover = allPhotos.find(photo => String(photo.assetId) === String(section.coverAssetId)) || chapterPhotos[0];
        return {
          id: section.id || 'chapter-' + index,
          name: section.title || 'Chapter ' + (index + 1),
          line: section.subtitle || '',
          note: section.body || '',
          layout: section.layout || 'pair',
          accent: section.accent || delivery.creativeDirection?.palette?.accent || accents[index % accents.length],
          photos: chapterPhotos,
          cover,
          frame: frames.get(String(cover?.assetId)) || emptyChapterFrame,
          captions: []
        };
      }).filter(chapter => chapter.photos.length > 0);
    }
    return chapters.map(chapter => {
      const cover = chapter.cover || chapter.photos[0];
      return { ...chapter, layout: chapter.layout || 'pair', cover, frame: chapter.frame || frames.get(String(cover?.assetId)) || emptyChapterFrame };
    });
  }, [delivery, allPhotos, frames]);

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#070709',
    surface: '#0c0c10',
    text: '#f3ece4',
    accent: '#d7a86e'
  });

  const chapterIdentity = `${delivery?.publicId || delivery?._id || client}:${allPhotos.map(photo => photo.assetId || photo.name).join('|')}:${(delivery?.creativeDirection?.sections || []).map(section => section.id).join('|')}`;
  useEffect(() => {
    setOpenIndex(null);
    setGallery(false);
    setGalleryIndex(null);
    chapterCardsRef.current = [];
    directoryScrollRef.current = 0;
  }, [chapterIdentity]);

  useEffect(() => {
    const previousIndex = previousChapterIndexRef.current;
    previousChapterIndexRef.current = openIndex;
    if (previousIndex === null && openIndex === null) return undefined;
    const frameId = requestAnimationFrame(() => {
      if (openIndex === null) {
        window.scrollTo({ top: directoryScrollRef.current, behavior: 'instant' });
        chapterCardsRef.current[returnFocusIndexRef.current]?.focus({ preventScroll: true });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
        headingRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [openIndex]);

  const openChapter = index => {
    if (!chaptersData[index]) return;
    if (openIndex === null) {
      directoryScrollRef.current = window.scrollY;
      returnFocusIndexRef.current = index;
    }
    setOpenIndex(index);
    activeNarrationSectionRef.current = index;
    onNarrationNavigate?.(chaptersData[index].photos.map(photo => photo.assetId));
  };
  const returnToChapters = () => {
    setOpenIndex(null);
    activeNarrationSectionRef.current = null;
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
      const matchedIndex = segment.sectionId ? chaptersData.findIndex(chapter => String(chapter.id) === String(segment.sectionId)) : -1;
      const nextIndex = matchedIndex >= 0
        ? matchedIndex
        : Math.min(chaptersData.length - 1, Math.floor((segmentIndex / Math.max(1, segments.length)) * chaptersData.length));
      if (activeNarrationSectionRef.current === nextIndex) return;
      activeNarrationSectionRef.current = nextIndex;
      setOpenIndex(nextIndex);
      onNarrationNavigate?.(chaptersData[nextIndex]?.photos?.map(photo => photo.assetId) || []);
    };
    const finish = () => { activeNarrationSectionRef.current = null; };
    narration.addEventListener('timeupdate', syncChapter);
    narration.addEventListener('ended', finish);
    narration.addEventListener('pause', finish);
    return () => {
      narration.removeEventListener('timeupdate', syncChapter);
      narration.removeEventListener('ended', finish);
      narration.removeEventListener('pause', finish);
    };
  }, [narrationRef, delivery?.narration?.segments, chaptersData, onNarrationNavigate]);

  const openPhoto = photo => {
    const photoIndex = allPhotos.findIndex(item => (photo.assetId ? String(item.assetId) === String(photo.assetId) : item.name === photo.name));
    setGalleryIndex(photoIndex >= 0 ? photoIndex : 0);
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };
  const openGallery = () => {
    setGalleryIndex(null);
    setGallery(true);
  };
  const downloadSamplePhoto = (photo, index) => {
    if (!photo) return;
    const link = document.createElement('a');
    link.href = imageSrc(photo);
    link.download = `${String(photo.name || `photograph-${index + 1}`).split('/').pop().replace(/[^a-z0-9_-]+/gi, '-')}.webp`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const demoGalleryProps = delivery ? {} : {
    liked: demoLiked,
    onLike: key => setDemoLiked(current => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    }),
    onDownload: (key, index) => {
      const photo = allPhotos.find((item, itemIndex) => String(item.assetId || item.id || item.name || itemIndex) === String(key)) || allPhotos[index];
      downloadSamplePhoto(photo, index);
    },
    onDownloadAll: () => allPhotos.forEach(downloadSamplePhoto)
  };
  const motionControl = <button className="fd-chapter-motion-control" type="button" onClick={() => setMotionPaused(current => !current)} aria-pressed={motionPaused} aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'}>
    {motionPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
    <span>{motionPaused ? 'Resume motion' : 'Pause motion'}</span>
  </button>;
  const chapterControlBar = <div className="fd-chapter-view-controls">
    <button className="fd-chapter-return" type="button" onClick={returnToChapters}><ArrowLeft size={16} aria-hidden="true" /><span>All chapters</span></button>
    <span className="fd-chapter-position" aria-label={`Chapter ${openIndex + 1} of ${chaptersData.length}`}><strong>{String(openIndex + 1).padStart(2, '0')}</strong><span aria-hidden="true">/</span>{String(chaptersData.length).padStart(2, '0')}</span>
    {motionControl}
  </div>;
  const studioCredit = <div className="fd-chapter-studio-credit">
    <DeliveryBrandMark branding={brandedDelivery.branding} className="fd-chapter-studio-mark" />
    <span><small>{brandedDelivery.branding?.type === 'studio' ? 'Photographed by' : 'Delivered with'}</small><strong>{studioName}</strong></span>
  </div>;

  const currentChapter = openIndex === null ? null : chaptersData[openIndex];
  const previousChapter = openIndex > 0 ? openIndex - 1 : -1;
  const nextChapter = openIndex !== null && openIndex < chaptersData.length - 1 ? openIndex + 1 : -1;
  const chapterLink = (index, direction) => {
    const chapter = chaptersData[index];
    if (!chapter) return null;
    const cover = chapter.cover || chapter.photos[0];
    return <button className={'is-' + direction} type="button" onClick={() => openChapter(index)} aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} chapter: ${chapter.name}`}>
      <span className="fd-chapter-nav-cover" aria-hidden="true"><Photo name={cover.name} url={cover.url} alt="" width={cover.width} height={cover.height} sizes="72px" /></span>
      <span className="fd-chapter-nav-copy"><small>{direction === 'previous' ? 'Previous chapter' : 'Next chapter'}<span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></small><strong data-delivery-font="heading">{chapter.name}</strong></span>
      {direction === 'previous' ? <ChevronLeft size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
    </button>;
  };

  return <div className="fd-page fd-chapters fd-chapters-refined" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={{ ...themeStyles, '--chapter-accent': currentChapter?.accent || themeStyles['--fd-accent'] }}>
    <DemoHeader format="Chapters" client={client} sectionId="chapters" delivery={brandedDelivery} audioState={audioState} toggleAudio={toggleAudio} />

    <>
      {currentChapter ? <motion.main key={'chapter-' + (currentChapter.id || openIndex)} className="fd-chapter-reading-page" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={entrance}>
        {chapterControlBar}
        <article className="fd-chapter-reading-content" style={{ '--chapter-section-accent': currentChapter.accent || themeStyles['--fd-accent'] }}>
          <header className="fd-chapter-reading-heading">
            <span className="fd-chapter-reading-studio">{client}</span>
            <h1 ref={headingRef} tabIndex={-1}>{currentChapter.name}</h1>
            {(currentChapter.note || currentChapter.line) && <p>{currentChapter.note || currentChapter.line}</p>}
          </header>
          <div className={'fd-chapter-reading-photos is-layout-' + currentChapter.layout + (currentChapter.photos.length === 1 ? ' is-single' : '')}>
            {currentChapter.photos.map((photo, photoIndex) => {
              const frame = frames.get(String(photo.assetId)) || emptyChapterFrame;
              const caption = currentChapter.captions?.[photoIndex] || frame.caption || frame.headline || '';
              return <motion.button
                type="button"
                key={photo.assetId || photo.url || photo.name}
                {...formatFrameAttributes(frame)}
                style={{ '--chapter-photo-ratio': photo.width && photo.height ? photo.width + ' / ' + photo.height : '3 / 4', '--chapter-photo-aspect': photo.width && photo.height ? photo.width / photo.height : .75, ...formatFrameStyle(frame) }}
                className="fd-chapter-reading-photo"
                onClick={() => openPhoto(photo)}
                aria-label={caption ? 'View photo: ' + caption : 'View photo from ' + currentChapter.name}
                initial={reduced ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: .12 }}
                transition={{ ...entrance, delay: Math.min(photoIndex * .06, .24) }}
                whileHover={reduced ? undefined : { y: -3 }}
                whileTap={reduced ? undefined : { scale: .99 }}
              >
                <span className="fd-chapter-reading-photo-frame">
                  <ChapterPhotoMotion frame={frame} index={photoIndex} paused={photoMotionPaused}>
                    <Photo name={photo.name} url={photo.url} alt={photo.alt || currentChapter.name} width={photo.width} height={photo.height} style={frame.focalPoint ? { objectPosition: frame.focalPoint } : undefined} eager={photoIndex === 0} sizes="(max-width: 767px) 92vw, (max-width: 1023px) 44vw, 38vw" />
                  </ChapterPhotoMotion>
                </span>
                {caption && <span className="fd-chapter-reading-caption" data-delivery-font="caption" data-caption-position={frame.captionPosition || undefined} data-text-background={frame.textBackground || undefined} data-type-style={frame.typographyStyle || undefined} data-text-animation={frame.textAnimation || undefined}>
                  <span className="fd-chapter-caption-number" aria-hidden="true">{String(photoIndex + 1).padStart(2, '0')}</span>
                  <span className="fd-chapter-caption-text">{caption}</span>
                </span>}
              </motion.button>;
            })}
          </div>
          {(previousChapter >= 0 || nextChapter >= 0) && <nav className="fd-chapter-sequence-nav" aria-label="Chapter navigation">
            {previousChapter >= 0 && chapterLink(previousChapter, 'previous')}
            {nextChapter >= 0 && chapterLink(nextChapter, 'next')}
          </nav>}
          <footer className="fd-chapter-reading-footer">{studioCredit}</footer>
        </article>
      </motion.main> : <motion.main key="chapter-contents" className="fd-chapter-library" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={entrance}>
        <header className="fd-chapter-library-heading">
          <span className="fd-chapter-reading-studio"><Film size={15} aria-hidden="true" />{delivery ? 'Photo collection' : 'Wedding portraits'}</span>
          <h1>{client}</h1>
          <p>{delivery?.creativeDirection?.openingLine || 'Choose a chapter to see its photographs.'}</p>
          <div className="fd-chapter-collection-details">
            <span className="fd-chapter-collection-count"><span><strong>{chaptersData.length}</strong> {chaptersData.length === 1 ? 'chapter' : 'chapters'}</span><span><strong>{allPhotos.length}</strong> {allPhotos.length === 1 ? 'photo' : 'photos'}</span></span>
            {motionControl}
          </div>
        </header>
        {chaptersData.length ? <section className="fd-chapter-library-grid" aria-label="Chapters">
          {chaptersData.map((chapter, index) => {
            const cover = chapter.cover || chapter.photos[0];
            const frame = chapter.frame || frames.get(String(cover?.assetId)) || emptyChapterFrame;
            return <motion.button
              ref={element => { chapterCardsRef.current[index] = element; }}
              type="button"
              key={chapter.id || index}
              className="fd-chapter-library-card"
              {...formatFrameAttributes(frame)}
              style={{ '--chapter-photo-ratio': cover?.width && cover?.height ? cover.width + ' / ' + cover.height : '3 / 4', '--chapter-card-accent': chapter.accent || themeStyles['--fd-accent'], ...formatFrameStyle(frame) }}
              onClick={() => openChapter(index)}
              aria-label={`Open chapter ${index + 1}: ${chapter.name}`}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: .12 }}
              transition={{ ...entrance, delay: Math.min(index * .06, .24) }}
              whileHover={reduced ? undefined : { y: -3 }}
              whileTap={reduced ? undefined : { scale: .99 }}
            >
              <span className="fd-chapter-library-cover">
                <ChapterPhotoMotion frame={frame} index={index} paused={photoMotionPaused}><Photo name={cover.name} url={cover.url} alt="" width={cover.width} height={cover.height} style={frame.focalPoint ? { objectPosition: frame.focalPoint } : undefined} eager={index === 0} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 44vw, 32vw" /></ChapterPhotoMotion>
                <span className="fd-chapter-cover-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              </span>
              <span className="fd-chapter-library-copy"><span className="fd-chapter-card-meta"><span>Chapter {String(index + 1).padStart(2, '0')}</span><span>{chapter.photos.length} {chapter.photos.length === 1 ? 'photograph' : 'photographs'}</span></span><strong data-delivery-font="heading">{chapter.name}</strong>{(chapter.line || chapter.note) && <span className="fd-chapter-card-description" data-delivery-font="caption">{chapter.line || chapter.note}</span>}<i>View chapter<ArrowUpRight size={17} aria-hidden="true" /></i></span>
            </motion.button>;
          })}
        </section> : <p className="fd-chapter-library-empty">The photographs for this collection are not available yet.</p>}
        <footer className="fd-chapter-library-footer">{studioCredit}{!!allPhotos.length && <button type="button" onClick={openGallery}>View full gallery<Images size={17} aria-hidden="true" /></button>}</footer>
      </motion.main>}
    </>

    <AnimatePresence>{gallery && <DemoGallery photos={allPhotos} title={client} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={brandedDelivery} fontStyles={themeStyles} {...demoGalleryProps} {...galleryProps} singlePhoto={galleryIndex !== null} />}</AnimatePresence>
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

export { AlbumSpread };

export function AlbumDemo({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const [readSpreads, setReadSpreads] = useState([]);
  const [compact, setCompact] = useState(() => window.innerWidth < 768);
  const previousCompact = useRef(compact);
  const [noteOpen, setNoteOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [turn, setTurn] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const turning = useRef(false);
  const [gallery, setGallery] = useState(false);
  const [demoLiked, setDemoLiked] = useState(() => new Set());
  const [muted, setMuted] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const touchStart = useRef(null);
  const audio = useRef(null);
  const reduced = useVeyloReducedMotion();

  const photos = useMemo(() => normalizeDeliveryPhotos(delivery, albumPhotos), [delivery]);
  const v3BookendPhotos = delivery?.schemaVersion === 3 ? normalizeDeliveryPhotos(delivery, photos, true) : [];
  const v3OpeningPhoto = v3BookendPhotos.find(photo => photo.assetId === delivery?.v3?.openingAssetId) || photos[0];
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / Album` : delivery.title) : 'The Adeyemi Family';
  const clientName = delivery?.clientName || delivery?.title || 'The Adeyemi Family';
  const studioName = delivery ? delivery.branding?.name || 'Veylo' : ALBUM_DEMO_BRANDING.name;
  const albumTitle = delivery?.creativeDirection?.title || (delivery ? 'Photo Album' : 'Family Album');
  const demoOnly = !delivery;
  const audioTrack = delivery?.soundtrack?.url || (demoOnly ? '/audio/soundtrack-1.mp3' : '');
  useSmoothSoundtrackLoop(audio, audioTrack);

  const playSoundtrack = () => {
    if (!audio.current) return;
    setAudioLoading(true);
    setAudioFailed(false);
    audio.current.play().catch(() => {
      setAudioLoading(false);
      setAudioFailed(true);
    });
  };

  const sourceSpreads = useMemo(() => {
    if (delivery && photos.length) {
      // Use the saved album arrangements and repair older records without hiding photos.
      const legacySections = delivery.schemaVersion === 3 ? [] : delivery.creativeDirection?.sections || [];
      const source = delivery.formatConfig?.album?.spreads?.length ? delivery : {
        ...delivery,
        formatConfig: { ...delivery.formatConfig, album: { spreads: legacySections.map(section => ({
          ...section, heading: section.title, note: section.subtitle,
          layout: section.assetIds?.length === 2 ? 'pair' : section.assetIds?.length === 3 ? 'triptych' : 'single'
        })) } }
      };
      const byId = new Map(photos.map(photo => [String(photo.assetId), photo]));
      return normalizeAlbumSpreads(source, photos.map(photo => String(photo.assetId))).map((spread, index) => {
        const arranged = spread.assetIds.map(id => byId.get(String(id))).filter(Boolean);
        const frame = frames.get(arranged[0]?.assetId) || {};
        return {
          ...spread, photos: arranged, photo1: arranged[0], photo2: arranged[1],
          label: index === 0 ? 'THE FIRST PHOTOGRAPHS' : '',
          title: spread.heading || (index === 0 ? delivery.creativeDirection?.title : '') || '',
          copy: spread.note || (index === 0 ? delivery.creativeDirection?.openingLine : '') || '',
          footer: clientName, frame
        };
      });
    }
    return [
      { id: 'opening', label: 'THE ADEYEMI FAMILY', title: 'Together, at home.', copy: 'White outfits, coral beads, and everyone in one frame. A family portrait to keep.', footer: 'Family portraits · 2026', photo1: albumPhotos[1], layout: 'single' },
      { id: 'together', label: 'A FAMILIAR SMILE', title: 'A little less posing.', copy: 'The smiles came easily once everyone settled in.', photo1: albumPhotos[2], layout: 'single' },
      { id: 'finale', label: 'THE LAST PAGES', title: 'One more look.', copy: 'The photographs from a lovely day together. Your complete family gallery follows.', photo1: albumPhotos[3], photo2: albumPhotos[4], layout: 'pair' }
    ];
  }, [delivery, photos, frames, clientName]);

  const spreadsData = useMemo(() => albumReaderPages(sourceSpreads, compact), [sourceSpreads, compact]);
  const activeSpread = spreadsData[page] || spreadsData[0];
  const markSpreadViewed = React.useCallback(index => {
    const seen = albumSpreadPhotos(spreadsData[index]).map(albumPhotoKey);
    setReadSpreads(current => seen.every(key => current.includes(key)) ? current : [...new Set([...current, ...seen])]);
  }, [spreadsData]);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const resize = () => setCompact(!query.matches);
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  React.useLayoutEffect(() => {
    if (previousCompact.current === compact) return;
    const previous = albumReaderPages(sourceSpreads, previousCompact.current)[page];
    const key = albumPhotoKey(albumSpreadPhotos(previous)[0]);
    const nextPage = spreadsData.findIndex(spread => albumSpreadPhotos(spread).some(photo => albumPhotoKey(photo) === key));
    previousCompact.current = compact;
    setPage(Math.max(0, nextPage)); setTurn(null); turning.current = false;
  }, [compact, sourceSpreads, spreadsData, page]);

  const galleryUnlocked = started && !turn && page === spreadsData.length - 1 && sourceSpreads.every(spread => albumSpreadPhotos(spread).every(photo => readSpreads.includes(albumPhotoKey(photo))));
  const openGallery = () => { if (galleryUnlocked) setGallery(true); };
  const albumIdentity = `${delivery?.publicId || delivery?._id || 'album-demo'}:${sourceSpreads.map(spread => [spread.id, spread.layout, ...albumSpreadPhotos(spread).map(albumPhotoKey)].join(':')).join('|')}`;
  useEffect(() => { setReadSpreads([]); setGallery(false); setSelectedPhoto(null); setNoteOpen(false); setStarted(false); setPage(0); setTurn(null); turning.current = false; }, [albumIdentity]);
  const openAlbum = () => {
    setReadSpreads([]);
    setStarted(true);
    setPage(0);
    setDirection(1);
    onNarrationNavigate?.((spreadsData[0]?.photos || [spreadsData[0]?.photo1, spreadsData[0]?.photo2]).filter(Boolean).map(photo => photo.assetId).filter(Boolean));
    if (audio.current && !muted) {
      audio.current.volume = .32;
      playSoundtrack();
    }
  };
  const goToPage = nextPage => {
    if (turning.current || nextPage === page || nextPage < 0 || nextPage >= spreadsData.length) return;
    const nextDirection = nextPage > page ? 1 : -1;
    turning.current = true;
    setDirection(nextDirection);
    setTurn({ from: { spread: spreadsData[page], index: page }, to: { spread: spreadsData[nextPage], index: nextPage }, direction: nextDirection });
    setPage(nextPage);
    const spread = spreadsData[nextPage];
    onNarrationNavigate?.((spread.photos || [spread.photo1, spread.photo2]).filter(Boolean).map(photo => photo.assetId).filter(Boolean));
  };
  const finishTurn = () => { turning.current = false; setTurn(null); };
  const next = () => goToPage(page + 1);
  const previous = () => {
    if (turning.current) return;
    if (page === 0) {
      setStarted(false);
      audio.current?.pause();
      return;
    }
    goToPage(page - 1);
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
    if (gallery || selectedPhoto !== null || noteOpen) player.pause();
    else if (started && !muted) playSoundtrack();
  }, [gallery, selectedPhoto, noteOpen, started, muted]);

  useEffect(() => {
    const player = audio.current;
    if (!player || !started || gallery || selectedPhoto !== null || noteOpen || muted) return undefined;
    if (page < spreadsData.length - 1) {
      if (player.paused) playSoundtrack();
      fadeSoundtrack(player, .32, 420);
      return undefined;
    }
    const timer = window.setTimeout(() => fadeSoundtrack(player, 0, 2100, () => {
      if (audio.current === player && page >= spreadsData.length - 1 && !gallery) player.pause();
    }), 250);
    return () => window.clearTimeout(timer);
  }, [gallery, selectedPhoto, noteOpen, muted, page, spreadsData.length, started]);

  useEffect(() => {
    const onKey = event => {
      if (!started || gallery || selectedPhoto !== null || noteOpen || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === ' ' && event.target.closest('button,a')) return;
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => () => audio.current?.pause(), []);

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#09090c',
    surface: '#f0e8da',
    text: '#f2eee8',
    accent: '#d4b38b'
  });
  const paperChoice = delivery?.formatConfig?.album?.paperTone || 'theme';
  const surfaceHex = /^#[0-9a-f]{6}$/i.test(themeStyles['--fd-surface']) ? themeStyles['--fd-surface'].slice(1) : 'f0e8da';
  const surfaceLuminance = .2126 * parseInt(surfaceHex.slice(0, 2), 16) + .7152 * parseInt(surfaceHex.slice(2, 4), 16) + .0722 * parseInt(surfaceHex.slice(4, 6), 16);
  const paperTone = paperChoice === 'theme' ? surfaceLuminance < 140 ? 'dark' : 'light' : paperChoice;
  const allPhotos = normalizeDeliveryPhotos(delivery, photos, true);
  const downloadSamplePhoto = (photo, index) => {
    if (!photo) return;
    const link = document.createElement('a');
    link.href = imageSrc(photo);
    link.download = `${String(photo.name || `photograph-${index + 1}`).split('/').pop().replace(/[^a-z0-9_-]+/gi, '-')}.webp`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const demoGalleryProps = delivery ? {} : {
    liked: demoLiked,
    onLike: key => setDemoLiked(current => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    }),
    onDownload: (key, index) => {
      const photo = allPhotos.find((item, itemIndex) => String(item.assetId || item.id || item.name || itemIndex) === String(key)) || allPhotos[index];
      downloadSamplePhoto(photo, index);
    },
    onDownloadAll: () => allPhotos.forEach(downloadSamplePhoto)
  };
  const openPhoto = photo => {
    if (turning.current) return;
    const index = allPhotos.findIndex(item => photo.assetId ? item.assetId === photo.assetId : item.name === photo.name);
    if (index >= 0) setSelectedPhoto(index);
  };

  return <div className={`fd-page fd-album ${audioTrack ? 'has-music' : ''}`} data-paper-tone={paperTone} style={{ ...themeStyles, '--album-paper': paperChoice === 'theme' ? themeStyles['--fd-surface'] : paperTone === 'dark' ? '#1c1c20' : '#f0e8da' }}>
    {audioTrack && <audio ref={audio} crossOrigin="anonymous" src={audioTrack} loop preload="none" muted={muted} onWaiting={() => setAudioLoading(true)} onStalled={() => setAudioLoading(true)} onPlaying={() => { setAudioLoading(false); setAudioFailed(false); }} onPause={() => setAudioLoading(false)} onError={() => { setAudioLoading(false); setAudioFailed(true); }} />}
    <DemoHeader format="Album" client={client} sectionId="album" onGallery={galleryUnlocked ? openGallery : undefined} delivery={delivery} demoBranding={!delivery ? ALBUM_DEMO_BRANDING : undefined} audioState={audioState} toggleAudio={toggleAudio} hideSoundtrack />
    {!started ? <main className="fd-album-cover">
      <motion.figure className={`album-cover-book${albumCoverShape(v3OpeningPhoto) === 'landscape' ? ' is-landscape' : ''}`} style={{ '--album-cover-ratio': albumCoverRatio(v3OpeningPhoto) }} initial={reduced ? false : { opacity: 0, y: 20, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -1 }} transition={{ duration: .9, ease: [.22, 1, .36, 1] }}>
        <div className="album-cover-binding" aria-hidden="true" />
        <div className="album-cover-stamp"><span>PHOTO ALBUM</span><b>{clientName}</b></div>
        <div className="album-cover-photo"><Photo name={v3OpeningPhoto?.name} url={v3OpeningPhoto?.url} thumbnailUrl={v3OpeningPhoto?.thumbnailUrl} srcSet={v3OpeningPhoto?.srcSet} width={v3OpeningPhoto?.width || undefined} height={v3OpeningPhoto?.height || undefined} alt={`${clientName} cover photograph`} eager sizes="(max-width: 767px) 88vw, 420px" style={{ backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }} /></div>
        <figcaption>{delivery?.shootType || (delivery ? 'Finished photographs' : 'Family portraits')}</figcaption>
      </motion.figure>
      <div className="fd-album-cover-shade" aria-hidden="true" />
      <motion.section initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .12 }}>
        <span className="album-eyebrow">{demoOnly || delivery?.branding?.name ? `PHOTOGRAPHED BY ${studioName}` : 'YOUR PHOTO ALBUM'}</span>
        <h1>{clientName}</h1><h2>{albumTitle}</h2>
        <p>{delivery?.creativeDirection?.openingLine || `${photos.length} finished photographs. Take your time with each page.`}</p>
        <button type="button" onClick={openAlbum}>Open album<BookOpen size={18} /></button>
        <small>{spreadsData.length} {spreadsData.length === 1 ? 'page' : 'pages'}<span aria-hidden="true"> / </span>{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'}</small>
      </motion.section>
    </main> : <motion.main className="fd-album-reader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .3 }}>
      <div className="fd-album-reader-head"><span>{clientName}</span><div aria-live="polite" aria-atomic="true"><span className="album-mobile-only">Page</span><span className="album-desktop-only">Spread</span> {page + 1} of {spreadsData.length}</div><span>{delivery?.shootType || (delivery ? 'Photo album' : 'Family portraits')}</span></div>
      <div className="fd-album-stage" onTouchStart={event => { const touch = event.touches[0]; touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchCancel={() => { touchStart.current = null; }} onTouchEnd={event => {
        const start = touchStart.current; touchStart.current = null;
        if (!start || event.touches.length) return;
        const touch = event.changedTouches[0], dx = touch.clientX - start.x, dy = touch.clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) dx < 0 ? next() : previous();
      }}>
        <div className="album-open-book" data-spread-index={page} data-page-count={spreadsData.length} key={activeSpread.id + page} style={{ '--album-book-ratio': albumBookRatio(activeSpread) }}>
          <AlbumSpread spread={activeSpread} index={page} onViewed={markSpreadViewed} onPhoto={openPhoto} isLast={page === spreadsData.length - 1} />
          {turn && <AlbumPageTurn {...turn} compact={compact} onComplete={finishTurn} />}
        </div>
      </div>
      <AlbumCaption spread={activeSpread} expanded={noteOpen} onExpand={() => setNoteOpen(true)} onClose={() => setNoteOpen(false)} fontStyles={themeStyles} isLast={page === spreadsData.length - 1} onGallery={galleryUnlocked ? openGallery : undefined} />
      <footer className="fd-album-controls">
        <button type="button" onClick={previous} disabled={Boolean(turn)}>
          <ChevronLeft size={18} />
          <span>{page === 0 ? 'Back to cover' : 'Previous page'}</span>
        </button>
        <div className="fd-album-dots-wrap">
          {spreadsData.length <= (compact ? 5 : 8) ? (
            spreadsData.map((spread, index) => (
              <button
                type="button"
                key={spread.id + index}
                className={page === index ? 'is-active' : ''}
                onClick={() => goToPage(index)}
                disabled={Boolean(turn)}
                aria-current={page === index ? 'page' : undefined}
                aria-label={`Open album page ${index + 1}`}
              >
                <i />
              </button>
            ))
          ) : (
            <span className="fd-album-counter">{compact ? 'Page' : 'Spread'} {page + 1} of {spreadsData.length}</span>
          )}
        </div>
        <button type="button" onClick={next} disabled={Boolean(turn) || page === spreadsData.length - 1}>
          <span>Next page</span>
          <ChevronRight size={18} />
        </button>
      </footer>
    </motion.main>}
    {started && !gallery && selectedPhoto === null && audioTrack && <button className={`fd-album-sound ${audioLoading ? 'is-loading' : ''} ${audioFailed ? 'is-error' : ''}`} type="button" onClick={toggleSound} aria-label={audioLoading ? 'Stop loading album soundtrack' : audioFailed ? 'Try album soundtrack again' : muted ? 'Turn album soundtrack on' : 'Mute album soundtrack'} aria-busy={audioLoading}>{audioLoading ? <LoaderCircle className="v-spin" size={17} /> : muted || audioFailed ? <VolumeX size={17} /> : <Volume2 size={17} />}<span aria-live="polite">{audioLoading ? 'Loading music…' : audioFailed ? 'Try music again' : muted ? 'Sound off' : 'Sound on'}</span></button>}
    <AnimatePresence>{selectedPhoto !== null && <ClientGallery photos={allPhotos} initialIndex={selectedPhoto} singlePhoto title={clientName} delivery={delivery} fontStyles={themeStyles} {...demoGalleryProps} {...galleryProps} onClose={() => setSelectedPhoto(null)} />}</AnimatePresence>
    <AnimatePresence>{galleryUnlocked && gallery && <DemoGallery photos={allPhotos} title={client} onClose={() => setGallery(false)} delivery={delivery} fontStyles={themeStyles} {...demoGalleryProps} {...galleryProps} />}</AnimatePresence>
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
