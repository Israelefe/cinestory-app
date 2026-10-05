import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
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
import AlbumSpread, { AlbumPageTurn } from '../components/delivery/AlbumSpread.jsx';
import { albumSpreads as normalizeAlbumSpreads } from '../utils/deliveryPresentation.js';
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
        <DeliveryBrandMark branding={delivery.branding} className="fd-header-logo" />
        <span className="fd-header-brand-copy">{delivery.branding?.type === 'studio' && <small>Photographed by</small>}<strong>{brandName}</strong></span>
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
  const [motionPaused, setMotionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const headingRef = useRef(null);
  const directoryCardsRef = useRef([]);
  const directoryReturnIndexRef = useRef(0);
  const directoryScrollRef = useRef(0);
  const pendingNavigationRef = useRef(null);
  const reduced = useVeyloReducedMotion();
  const photoMotionPaused = reduced || motionPaused || !pageVisible || gallery;
  const chapterNumber = number => String(number).padStart(2, '0');
  const entrance = { duration: .55, ease: [0.22, 1, 0.36, 1] };

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const photos = normalizeDeliveryPhotos(delivery, weddingPhotos);
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / Chapters` : delivery.title) : 'Folake & Tunde';
  const clientName = delivery ? (delivery.clientName || delivery.title || 'Your photographs') : 'Folake & Tunde';
  const studioName = delivery ? delivery.branding?.name : 'Mayflower Visuals';

  const chaptersData = useMemo(() => {
    if (delivery?.creativeDirection?.sections?.length) {
      const accents = ['#d7a86e', '#c89057', '#e0b989', '#cca578', '#dfb88e'];
      return delivery.creativeDirection.sections.map((section, idx) => ({
        id: section.id || `chapter-${idx}`,
        name: section.title || `Chapter ${idx + 1}`,
        kicker: `CHAPTER ${chapterNumber(idx + 1)}`,
        line: section.subtitle || '',
        note: section.body || section.subtitle || '',
        accent: section.accent || delivery?.creativeDirection?.palette?.accent || accents[idx % accents.length],
        layout: section.layout || 'chapter-cover',
        photos: (section.assetIds || []).map(id => photos.find(p => p.assetId === id)).filter(Boolean),
        cover: photos.find(p => p.assetId === section.coverAssetId) || photos.find(p => p.assetId === section.assetIds?.[0]),
        frame: frames.get(section.coverAssetId || section.assetIds?.[0]) || {}
      })).filter(ch => ch.photos.length > 0);
    }
    return chapters.map(chapter => ({ ...chapter, layout: chapter.layout || 'chapter-cover' }));
  }, [delivery, photos, frames]);

  const galleryUnlocked = chaptersData.length > 0 && chaptersData.every((_, index) => visited.includes(index));
  const openGallery = () => { if (!galleryUnlocked) return; setGalleryIndex(null); setGallery(true); };
  const openChapterData = openIndex === null ? null : chaptersData[openIndex];
  const chapterIdentity = `${delivery?.publicId || delivery?._id || 'chapters-demo'}:${photos.map(photo => photo.assetId || photo.name).join('|')}`;
  const { galleryUnlocked: chapterExplored, closingRef: chapterEndRef } = useClosingGallery(`${chapterIdentity}:${openIndex}`);
  useEffect(() => {
    if (chapterExplored && openIndex !== null) setVisited(current => current.includes(openIndex) ? current : [...current, openIndex]);
  }, [chapterExplored, openIndex]);
  useEffect(() => { setVisited([]); setOpenIndex(null); setGallery(false); }, [chapterIdentity]);

  const themeStyles = getFormatThemeStyles(delivery, {
    bg: '#070709',
    surface: '#0c0c10',
    text: '#f3ece4',
    accent: '#d7a86e'
  });

  const openChapter = index => {
    if (!chaptersData[index] || index === openIndex) return;
    if (openIndex === null) {
      directoryScrollRef.current = window.scrollY;
      directoryReturnIndexRef.current = index;
    }
    pendingNavigationRef.current = { index };
    setOpenIndex(index);
    onNarrationNavigate?.(chaptersData[index]?.photos?.map(photo => photo.assetId) || []);
  };
  const returnToDirectory = () => {
    pendingNavigationRef.current = { index: null };
    setOpenIndex(null);
  };
  const finishNavigation = definition => {
    if (definition?.opacity !== 1 || !pendingNavigationRef.current || pendingNavigationRef.current.index !== openIndex) return;
    pendingNavigationRef.current = null;
    const focusTarget = openIndex === null ? directoryCardsRef.current[directoryReturnIndexRef.current] : headingRef.current;
    focusTarget?.focus({ preventScroll: true });
    window.scrollTo({ top: openIndex === null ? directoryScrollRef.current : 0, behavior: 'instant' });
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
      setOpenIndex(current => current === nextIndex ? current : nextIndex);
    };
    const finish = () => setNarrationChapter(null);
    narration.addEventListener('timeupdate', syncChapter);
    narration.addEventListener('ended', finish);
    narration.addEventListener('pause', finish);
    return () => { narration.removeEventListener('timeupdate', syncChapter); narration.removeEventListener('ended', finish); narration.removeEventListener('pause', finish); };
  }, [narrationRef, delivery?.narration?.segments, delivery?.creativeDirection?.sections, chaptersData]);
  const openPhoto = photo => {
    const galleryPhotos = normalizeDeliveryPhotos(delivery, photos, true);
    const photoIdx = galleryPhotos.findIndex(item => (photo.assetId ? item.assetId === photo.assetId : item.name === photo.name));
    setGalleryIndex(photoIdx >= 0 ? photoIdx : 0);
    setGallery(true);
    onNarrationNavigate?.(photo.assetId);
  };

  const nextChapterIndex = openIndex !== null && openIndex < chaptersData.length - 1
    ? openIndex + 1
    : chaptersData.findIndex((_, index) => index !== openIndex && !visited.includes(index));
  const motionControl = <button className="fd-chapter-motion-control" type="button" onClick={() => setMotionPaused(current => !current)} aria-pressed={motionPaused} aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'}>{motionPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}<span>{motionPaused ? 'Resume motion' : 'Pause motion'}</span></button>;

  return <div className="fd-page fd-chapters fd-chapters-refined" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={{ ...themeStyles, '--chapter-accent': openChapterData?.accent || themeStyles['--fd-accent'] }}>
    <DemoHeader format="Chapters" client={client} sectionId="chapters" onGallery={galleryUnlocked ? openGallery : undefined} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    {openChapterData === null && <V3Bookend delivery={delivery} kind="opening" onGallery={() => setGallery(true)} />}

    <AnimatePresence mode="wait">
      {openChapterData === null ? <motion.main key="chapter-directory" className="fd-chapter-directory" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={entrance} onAnimationComplete={finishNavigation}>
        <header>
          <div className="fd-chapter-intro"><span className="fd-chapter-eyebrow"><Film size={15} aria-hidden="true" />{studioName || 'Your photo collection'}</span><h1 ref={headingRef} tabIndex={-1}>{clientName}</h1><p className="fd-chapter-invitation">Choose where to begin.</p></div>
          <div className="fd-chapter-intro-detail"><p>{delivery?.creativeDirection?.openingLine || 'The portraits, the smiles, and the moments in between. Open any chapter and take your time.'}</p><div className="fd-chapter-collection-count"><span><strong>{chapterNumber(chaptersData.length)}</strong> chapters</span><span><strong>{chapterNumber(photos.length)}</strong> photographs</span></div></div>
        </header>
        <div className="fd-chapter-directory-toolbar"><span role="status">{visited.length} of {chaptersData.length} chapters viewed</span>{motionControl}</div>
        <section className={`fd-chapter-directory-board ${chaptersData.length > 3 ? 'is-grid-layout' : ''}`} aria-label={`${clientName}'s chapters`}>{chaptersData.map((item, index) => <motion.button ref={element => { directoryCardsRef.current[index] = element; }} type="button" key={item.id || index} data-layout={item.layout || 'chapter-cover'} {...formatFrameAttributes(item.frame)} style={formatFrameStyle(item.frame)} className={`is-card-${(index % 3) + 1}${visited.includes(index) ? ' is-visited' : ''}${narrationChapter === index ? ' is-narrating' : ''}`} onClick={() => openChapter(index)} aria-label={`Open chapter ${index + 1}: ${item.name}${visited.includes(index) ? ', viewed' : ''}`} initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ ...entrance, delay: (index % 3) * .07 }} whileHover={reduced ? undefined : { y: -4 }} whileTap={reduced ? undefined : { scale: .985 }}>
          <span className="fd-chapter-cover"><motion.span className="fd-chapter-directory-photo" animate={frameMotionValues(item.frame || {}, photoMotionPaused)} transition={frameMotionTransition(item.frame || {}, index, photoMotionPaused)}><Photo name={(item.cover || item.photos[0]).name} url={(item.cover || item.photos[0]).url} alt={`${item.name} chapter cover`} style={item.frame?.focalPoint ? { objectPosition: item.frame.focalPoint } : undefined} eager={index === 0} sizes="(max-width: 767px) 92vw, (max-width: 1023px) 45vw, 32vw" /></motion.span><span className="fd-chapter-directory-number">{chapterNumber(index + 1)}</span>{visited.includes(index) && <span className="fd-chapter-directory-viewed"><Check size={13} aria-hidden="true" />Viewed</span>}</span>
          <span className="fd-chapter-directory-copy"><i>{item.photos.length} {item.photos.length === 1 ? 'photograph' : 'photographs'}</i><strong>{item.name}</strong>{item.line && <span className="fd-chapter-cover-description" data-delivery-font="caption">{item.line}</span>}<b>Open chapter<ArrowUpRight size={17} aria-hidden="true" /></b></span>
        </motion.button>)}</section>
        <footer><div><Images size={20} aria-hidden="true" /><span>{galleryUnlocked ? 'Every chapter viewed. Your full gallery is ready.' : 'View each chapter to open the full gallery.'}</span></div>{galleryUnlocked && <button type="button" onClick={openGallery}>View all {photos.length} photographs<ArrowUpRight size={17} aria-hidden="true" /></button>}</footer>
      </motion.main> : <motion.main data-chapter-explored={visited.includes(openIndex)} key={'chapter-room-' + openIndex} className={`fd-chapter-room${narrationChapter === openIndex ? ' is-narrating' : ''}`} style={{ '--chapter-accent': openChapterData.accent }} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={entrance} onAnimationComplete={finishNavigation}>
        <aside className="fd-chapter-room-copy">
          <button type="button" onClick={returnToDirectory}><ArrowLeft size={16} aria-hidden="true" />All chapters</button>
          <span>{openChapterData.kicker}</span>
          {narrationChapter === openIndex && <div className="fd-chapter-narration"><Volume2 size={14} />Narrating this chapter</div>}
          <div className="fd-chapter-room-count">{chapterNumber(openIndex + 1)} / {chapterNumber(chaptersData.length)}</div>
          <h1 ref={headingRef} tabIndex={-1}>{openChapterData.name}</h1>
          {openChapterData.note && <p>{openChapterData.note}</p>}
          <nav aria-label="Other chapters">{chaptersData.map((item, index) => <button type="button" key={item.id || index} aria-current={openIndex === index ? 'page' : undefined} className={openIndex === index ? 'is-active' : ''} onClick={() => openChapter(index)}><i>{chapterNumber(index + 1)}</i><span>{item.name}</span>{visited.includes(index) && <Check size={14} aria-label="Viewed" />}</button>)}</nav>
          {motionControl}
        </aside>
        <section className={'fd-chapter-room-art ' + (openChapterData.photos.length === 1 ? 'is-single' : 'is-pair')}>
          <div className="fd-chapter-photo-heading"><span>{openChapterData.photos.length} {openChapterData.photos.length === 1 ? 'photograph' : 'photographs'}</span><span>Open a photo to view it full size<ArrowUpRight size={14} aria-hidden="true" /></span></div>
          <div className="fd-chapter-room-photos">{openChapterData.photos.map((photo, index) => {
            const caption = openChapterData.captions?.[index] || frames.get(photo.assetId)?.caption || frames.get(photo.assetId)?.headline || '';
            const frame = frames.get(photo.assetId) || {};
            return <motion.button type="button" key={photo.assetId || photo.url || photo.name} {...formatFrameAttributes(frame)} style={formatFrameStyle(frame)} onClick={() => openPhoto(photo)} initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ ...entrance, delay: (index % 2) * .08 }} whileHover={{ y: -3 }} whileTap={{ scale: .985 }} aria-label={caption ? `Open ${caption}` : `Open photograph ${index + 1}: ${openChapterData.name}`}><div className="fd-chapter-photo-surface"><motion.div className="fd-chapter-photo-motion" animate={frameMotionValues(frame, photoMotionPaused)} transition={frameMotionTransition(frame, index, photoMotionPaused)}><Photo name={photo.name} url={photo.url} alt={photo.alt} style={frame.focalPoint ? { objectPosition: frame.focalPoint } : undefined} eager={index === 0} sizes="(max-width: 767px) 92vw, (max-width: 1023px) 44vw, 33vw" /></motion.div></div><span className="fd-chapter-photo-index">{chapterNumber(index + 1)}<ArrowUpRight size={16} aria-hidden="true" /></span><p>{caption || `Photograph ${chapterNumber(index + 1)}`}</p></motion.button>;
          })}</div>
          <footer ref={chapterEndRef}><div className="fd-chapter-end-note"><Check size={17} aria-hidden="true" /><span>You’ve reached the end of this chapter.</span></div><div className="fd-chapter-end-actions"><button type="button" onClick={returnToDirectory}>All chapters<Grid2X2 size={17} aria-hidden="true" /></button>{nextChapterIndex >= 0 && <button className="fd-chapter-next" type="button" onClick={() => openChapter(nextChapterIndex)}>Next chapter<ChevronRight size={17} aria-hidden="true" /></button>}{galleryUnlocked && <button className="fd-chapter-next" type="button" onClick={openGallery}>View full gallery<Images size={17} aria-hidden="true" /></button>}</div></footer>
        </section>
      </motion.main>}
    </AnimatePresence>

    {openChapterData === null && galleryUnlocked && <V3Bookend delivery={delivery} kind="closing" onGallery={galleryUnlocked ? openGallery : undefined} />}
    <AnimatePresence>{gallery && (galleryUnlocked || galleryIndex !== null) && <DemoGallery photos={normalizeDeliveryPhotos(delivery, photos, true)} title={client} initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} delivery={delivery} fontStyles={themeStyles} {...galleryProps} singlePhoto={!galleryUnlocked} />}</AnimatePresence>
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
  const markSpreadViewed = React.useCallback(index => setReadSpreads(current => current.includes(index) ? current : [...current, index]), []);
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [turn, setTurn] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const turning = useRef(false);
  const [gallery, setGallery] = useState(false);
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
  const studioName = delivery?.branding?.name || 'Veylo';
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

  const spreadsData = useMemo(() => {
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

  const galleryUnlocked = started && !turn && page === spreadsData.length - 1 && spreadsData.every((_, index) => readSpreads.includes(index));
  const openGallery = () => { if (galleryUnlocked) setGallery(true); };
  const albumIdentity = `${delivery?.publicId || delivery?._id || 'album-demo'}:${spreadsData.map(spread => [spread.id, spread.layout, ...(spread.photos || [spread.photo1, spread.photo2]).filter(Boolean).map(photo => photo.assetId || photo.name)].join(':')).join('|')}`;
  useEffect(() => { setReadSpreads([]); setGallery(false); setSelectedPhoto(null); setStarted(false); setPage(0); setTurn(null); turning.current = false; }, [albumIdentity]);
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
    if (gallery || selectedPhoto !== null) player.pause();
    else if (started && !muted) playSoundtrack();
  }, [gallery, selectedPhoto, started, muted]);

  useEffect(() => {
    const player = audio.current;
    if (!player || !started || gallery || selectedPhoto !== null || muted) return undefined;
    if (page < spreadsData.length - 1) {
      if (player.paused) playSoundtrack();
      fadeSoundtrack(player, .32, 420);
      return undefined;
    }
    const timer = window.setTimeout(() => fadeSoundtrack(player, 0, 2100, () => {
      if (audio.current === player && page >= spreadsData.length - 1 && !gallery) player.pause();
    }), 250);
    return () => window.clearTimeout(timer);
  }, [gallery, selectedPhoto, muted, page, spreadsData.length, started]);

  useEffect(() => {
    const onKey = event => {
      if (!started || gallery || selectedPhoto !== null || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
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
  const openPhoto = photo => {
    if (turning.current) return;
    const index = allPhotos.findIndex(item => photo.assetId ? item.assetId === photo.assetId : item.name === photo.name);
    if (index >= 0) setSelectedPhoto(index);
  };

  return <div className={`fd-page fd-album ${audioTrack ? 'has-music' : ''}`} data-paper-tone={paperTone} style={{ ...themeStyles, '--album-paper': paperChoice === 'theme' ? themeStyles['--fd-surface'] : paperTone === 'dark' ? '#1c1c20' : '#f0e8da' }}>
    {audioTrack && <audio ref={audio} crossOrigin="anonymous" src={audioTrack} loop preload="none" muted={muted} onWaiting={() => setAudioLoading(true)} onStalled={() => setAudioLoading(true)} onPlaying={() => { setAudioLoading(false); setAudioFailed(false); }} onPause={() => setAudioLoading(false)} onError={() => { setAudioLoading(false); setAudioFailed(true); }} />}
    <DemoHeader format="Album" client={client} sectionId="album" onGallery={galleryUnlocked ? openGallery : undefined} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} hideSoundtrack />
    {!started ? <main className="fd-album-cover">
      <motion.figure className="album-cover-book" initial={reduced ? false : { opacity: 0, y: 20, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -1 }} transition={{ duration: .9, ease: [.22, 1, .36, 1] }}>
        <div className="album-cover-binding" aria-hidden="true" />
        <div className="album-cover-stamp"><span>PHOTO ALBUM</span><b>{clientName}</b></div>
        <div className="album-cover-photo"><Photo name={v3OpeningPhoto?.name} url={v3OpeningPhoto?.url} thumbnailUrl={v3OpeningPhoto?.thumbnailUrl} srcSet={v3OpeningPhoto?.srcSet} alt={`${clientName} cover photograph`} eager sizes="(max-width: 767px) 68vw, 360px" /></div>
        <figcaption>{delivery?.shootType || (delivery ? 'Finished photographs' : 'Family portraits')}</figcaption>
      </motion.figure>
      <div className="fd-album-cover-shade" aria-hidden="true" />
      <motion.section initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .12 }}>
        <span className="album-eyebrow">{delivery?.branding?.name ? `PHOTOGRAPHED BY ${studioName}` : 'YOUR PHOTO ALBUM'}</span>
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
        <motion.div className="album-open-book" data-spread-index={page} key={spreadsData[page].id + page} initial={reduced ? false : { opacity: .65, rotateY: direction * 7, y: 6 }} animate={{ opacity: 1, rotateY: 0, y: 0 }} transition={{ duration: .55, ease: [.22, 1, .36, 1] }}>
          <AlbumSpread spread={spreadsData[page]} index={page} onViewed={markSpreadViewed} onPhoto={openPhoto} isLast={page === spreadsData.length - 1} onGallery={galleryUnlocked ? openGallery : undefined} />
          {turn && <AlbumPageTurn {...turn} onComplete={finishTurn} />}
        </motion.div>
      </div>
      <footer className="fd-album-controls">
        <button type="button" onClick={previous} disabled={Boolean(turn)}>
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
                onClick={() => goToPage(index)}
                disabled={Boolean(turn)}
                aria-current={page === index ? 'page' : undefined}
                aria-label={`Open album page ${index + 1}`}
              >
                <i />
              </button>
            ))
          ) : (
            <span className="fd-album-counter">Spread {page + 1} of {spreadsData.length}</span>
          )}
        </div>
        <button type="button" onClick={next} disabled={Boolean(turn) || page === spreadsData.length - 1}>
          <span>Next page</span>
          <ChevronRight size={18} />
        </button>
      </footer>
    </motion.main>}
    {started && !gallery && selectedPhoto === null && audioTrack && <button className={`fd-album-sound ${audioLoading ? 'is-loading' : ''} ${audioFailed ? 'is-error' : ''}`} type="button" onClick={toggleSound} aria-label={audioLoading ? 'Stop loading album soundtrack' : audioFailed ? 'Try album soundtrack again' : muted ? 'Turn album soundtrack on' : 'Mute album soundtrack'} aria-busy={audioLoading}>{audioLoading ? <LoaderCircle className="v-spin" size={17} /> : muted || audioFailed ? <VolumeX size={17} /> : <Volume2 size={17} />}<span aria-live="polite">{audioLoading ? 'Loading music…' : audioFailed ? 'Try music again' : muted ? 'Sound off' : 'Sound on'}</span></button>}
    <AnimatePresence>{selectedPhoto !== null && <ClientGallery photos={allPhotos} initialIndex={selectedPhoto} singlePhoto title={clientName} delivery={delivery} fontStyles={themeStyles} {...galleryProps} onClose={() => setSelectedPhoto(null)} />}</AnimatePresence>
    <AnimatePresence>{galleryUnlocked && gallery && <DemoGallery photos={normalizeDeliveryPhotos(delivery, photos, true)} title={client} onClose={() => setGallery(false)} delivery={delivery} fontStyles={themeStyles} {...galleryProps} />}</AnimatePresence>
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
