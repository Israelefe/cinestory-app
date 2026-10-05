import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Download, Grid2X2, Heart, Images, LoaderCircle, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
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
import '../styles/format-demos.css';
import '../components/delivery/DeliveryTypography.css';

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
  const reduced = useVeyloReducedMotion();

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
    bg: '#090708',
    surface: '#171111',
    text: '#f3ece4',
    accent: '#d7a86e'
  });

  const openChapter = index => {
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

  return <div className="fd-page fd-chapters" data-composition={themeStyles['--fd-composition']} data-accent-placement={themeStyles['--fd-accent-placement']} data-pace={themeStyles['--fd-pace']} style={{ ...themeStyles, '--chapter-accent': openChapterData?.accent || themeStyles['--fd-accent'] }}>
    <DemoHeader format="Chapters" client={client} sectionId="chapters" onGallery={galleryUnlocked ? openGallery : undefined} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} />
    {openChapterData === null && <V3Bookend delivery={delivery} kind="opening" onGallery={() => setGallery(true)} />}

    <AnimatePresence mode="wait">
      {openChapterData === null ? <motion.main key="chapter-directory" className="fd-chapter-directory" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <header>
          <div><span>{studioName}FOR {clientName.toUpperCase()}</span><h1>{clientName},<br />where would you like to begin?</h1></div>
          <p>{delivery?.creativeDirection?.openingLine || `We arranged your ${photos.length} finished portraits into ${chaptersData.length} chapters. Open whichever one you want first.`}</p>
          <div><strong>0{chaptersData.length}</strong><span>CHAPTERS</span><strong>{String(photos.length).padStart(2, '0')}</strong><span>PORTRAITS</span></div>
        </header>
        <section className={`fd-chapter-directory-board ${chaptersData.length > 3 ? 'is-grid-layout' : ''}`} aria-label={`${clientName}'s chapters`}>{chaptersData.map((item, index) => <motion.button type="button" key={item.name} data-layout={item.layout || 'chapter-cover'} {...formatFrameAttributes(item.frame)} style={formatFrameStyle(item.frame)} className={`is-card-${(index % 3) + 1}${visited.includes(index) ? ' is-visited' : ''}${narrationChapter === index ? ' is-narrating' : ''}`} onClick={() => openChapter(index)} initial={reduced ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .65, delay: reduced ? 0 : .12 + index * .1, ease: [0.22, 1, 0.36, 1] }} whileHover={reduced ? undefined : { y: -5 }} whileTap={reduced ? undefined : { scale: .985 }}>
          <motion.span className="fd-chapter-directory-photo" animate={frameMotionValues(item.frame || {}, reduced)} transition={frameMotionTransition(item.frame || {}, index, reduced)}><Photo name={item.photos[0].name} url={item.photos[0].url} alt={`${item.name} chapter cover`} style={item.frame?.focalPoint ? { objectPosition: item.frame.focalPoint } : undefined} eager={index === 0} sizes="(max-width: 767px) 64vw, 34vw" /></motion.span>
          <span className="fd-chapter-directory-shade" />
          <span className="fd-chapter-directory-number">0{index + 1}</span>
          <span className="fd-chapter-directory-copy"><i>{item.photos.length} {item.photos.length === 1 ? 'portrait' : 'portraits'}</i><strong>{item.name}</strong><p>{item.line}</p><b>Open chapter<ChevronRight size={15} /></b></span>
          {visited.includes(index) && <span className="fd-chapter-directory-viewed"><Check size={12} />Viewed</span>}
        </motion.button>)}</section>
        <footer><span>Explore each chapter. Your full gallery will be ready afterwards.</span>{galleryUnlocked && <button type="button" onClick={openGallery}>View all {photos.length} portraits<Images size={16} /></button>}</footer>
      </motion.main> : <motion.main data-chapter-explored={visited.includes(openIndex)} key={'chapter-room-' + openIndex} className={`fd-chapter-room${narrationChapter === openIndex ? ' is-narrating' : ''}`} style={{ '--chapter-accent': openChapterData.accent }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
            return <motion.button type="button" key={photo.url || photo.name} {...formatFrameAttributes(frame)} style={formatFrameStyle(frame)} onClick={() => openPhoto(photo)} initial={reduced ? false : { opacity: 0, y: 38, clipPath: 'inset(0 0 14% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: reduced ? 0 : .78, delay: reduced ? 0 : .14 + index * .12, ease: [0.22, 1, 0.36, 1] }} aria-label={`Open ${caption}`}><motion.div animate={frameMotionValues(frame, reduced)} transition={frameMotionTransition(frame, index, reduced)}><Photo name={photo.name} url={photo.url} alt={photo.alt} style={frame.focalPoint ? { objectPosition: frame.focalPoint } : undefined} eager sizes="(max-width: 767px) 92vw, 48vw" /></motion.div><span>0{index + 1}</span><p>{caption}</p></motion.button>;
          })}</div>
          <footer ref={chapterEndRef}><button type="button" onClick={() => setOpenIndex(null)}>All chapters<Grid2X2 size={17} /></button>{galleryUnlocked && <button type="button" onClick={openGallery}>View full gallery<Images size={17} /></button>}</footer>
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

export function AlbumSpread({ spread, index, reduced, onGallery, onViewed }) {
  useEffect(() => { const frame = requestAnimationFrame(() => onViewed?.(index)); return () => cancelAnimationFrame(frame); }, [index, onViewed]);
  const frameAttrs = formatFrameAttributes(spread.frame);
  const frameStyle = formatFrameStyle(spread.frame);
  if (spread.id === 'opening') return <section className="fd-album-spread is-opening" data-layout={spread.layout || 'spread'} {...frameAttrs} style={frameStyle}>
    <figure><motion.div animate={frameMotionValues(spread.frame || {}, reduced)} transition={frameMotionTransition(spread.frame || {}, index, reduced)}><Photo name={spread.photo1.name} url={spread.photo1.url} alt={spread.photo1.alt} eager sizes="(max-width: 767px) 100vw, 50vw" /></motion.div></figure>
    <article><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p><small>{spread.footer}</small></article>
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;

  if (spread.id === 'together') return <section className="fd-album-spread is-wide" data-layout={spread.layout || 'spread'} {...frameAttrs} style={frameStyle}>
    <motion.figure animate={frameMotionValues(spread.frame || {}, reduced)} transition={frameMotionTransition(spread.frame || {}, index, reduced)}><Photo name={spread.photo1.name} url={spread.photo1.url} alt={spread.photo1.alt} eager sizes="100vw" /></motion.figure>
    <div><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p></div>
  </section>;

  return <section className="fd-album-spread is-finale" data-layout={spread.layout || 'spread'} {...frameAttrs} style={frameStyle}>
    <figure className="is-family"><motion.div animate={frameMotionValues(spread.frame || {}, reduced)} transition={frameMotionTransition(spread.frame || {}, index, reduced)}><Photo name={spread.photo1.name} url={spread.photo1.url} alt={spread.photo1.alt} eager sizes="(max-width: 767px) 100vw, 50vw" /></motion.div></figure>
    <article>{spread.photo2 && <figure className="is-mother"><motion.div animate={frameMotionValues(spread.frame || {}, reduced)} transition={frameMotionTransition(spread.frame || {}, index, reduced)}><Photo name={spread.photo2.name} url={spread.photo2.url} alt={spread.photo2.alt || 'Photograph from this album'} eager sizes="(max-width: 767px) 100vw, 34vw" /></motion.div></figure>}<div><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p>{onGallery ? <button type="button" onClick={onGallery}>View full gallery<Images size={17} /></button> : <p>View the earlier pages to open your full gallery.</p>}</div></article>
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;
}

export function AlbumDemo({ delivery, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const [readSpreads, setReadSpreads] = useState([]);
  const markSpreadViewed = React.useCallback(index => setReadSpreads(current => current.includes(index) ? current : [...current, index]), []);
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [gallery, setGallery] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const touchStart = useRef(null);
  const audio = useRef(null);
  const reduced = useVeyloReducedMotion();

  const photos = normalizeDeliveryPhotos(delivery, albumPhotos);
  const v3BookendPhotos = delivery?.schemaVersion === 3 ? normalizeDeliveryPhotos(delivery, photos, true) : [];
  const v3OpeningPhoto = v3BookendPhotos.find(photo => photo.assetId === delivery?.v3?.openingAssetId) || photos[0];
  const v3ClosingPhoto = v3BookendPhotos.find(photo => photo.assetId === delivery?.v3?.closingAssetId);
  const frames = useMemo(() => new Map((delivery?.creativeDirection?.frames || []).map(f => [f.assetId, f])), [delivery]);

  const client = delivery ? (delivery.clientName ? `${delivery.clientName} / Album` : delivery.title) : 'The Adeyemi Family';
  const clientName = delivery?.clientName || 'The Adeyemi Family';
  const studioName = delivery?.branding?.name ? `${delivery.branding.name.toUpperCase()} PRESENTS` : 'VEYLO MEDIA PRESENTS';
  const albumTitle = delivery?.creativeDirection?.title || 'Family Album';
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
      const approvedSections = delivery.schemaVersion === 3 ? [] : (delivery.creativeDirection?.sections || []).filter(section => (section.assetIds || []).some(assetId => photos.some(photo => photo.assetId === assetId)));
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
      const photo1 = delivery.schemaVersion === 3 ? photos[0] : photos[1] || photos[0];
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

      for (let i = delivery.schemaVersion === 3 ? 1 : 2; i < photos.length - (delivery.schemaVersion === 3 ? 1 : 2); i++) {
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

      const finaleP1 = photos[delivery.schemaVersion === 3 ? photos.length - 1 : photos.length - 2] || photos[0];
      const finaleP2 = delivery.schemaVersion === 3 ? v3ClosingPhoto || photos[photos.length - 1] : photos[photos.length - 1];
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
  }, [delivery, photos, frames, clientName, v3ClosingPhoto]);

  const galleryUnlocked = started && page === spreadsData.length - 1 && spreadsData.every((_, index) => readSpreads.includes(index));
  const openGallery = () => { if (galleryUnlocked) setGallery(true); };
  const albumIdentity = `${delivery?.publicId || delivery?._id || 'album-demo'}:${spreadsData.map(spread => `${spread.id}:${spread.photo1?.assetId || spread.photo1?.name}:${spread.photo2?.assetId || spread.photo2?.name}`).join('|')}`;
  useEffect(() => { setReadSpreads([]); setGallery(false); setStarted(false); setPage(0); }, [albumIdentity]);
  const openAlbum = () => {
    setReadSpreads([]);
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
    const player = audio.current;
    if (!player || !started || gallery || muted) return undefined;
    if (page < spreadsData.length - 1) {
      if (player.paused) playSoundtrack();
      fadeSoundtrack(player, .32, 420);
      return undefined;
    }
    const timer = window.setTimeout(() => fadeSoundtrack(player, 0, 2100, () => {
      if (audio.current === player && page >= spreadsData.length - 1 && !gallery) player.pause();
    }), 250);
    return () => window.clearTimeout(timer);
  }, [gallery, muted, page, spreadsData.length, started]);

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
    {audioTrack && <audio ref={audio} crossOrigin="anonymous" src={audioTrack} loop preload="auto" muted={muted} onWaiting={() => setAudioLoading(true)} onStalled={() => setAudioLoading(true)} onPlaying={() => { setAudioLoading(false); setAudioFailed(false); }} onPause={() => setAudioLoading(false)} onError={() => { setAudioLoading(false); setAudioFailed(true); }} />}
    <DemoHeader format="Album" client={client} sectionId="album" onGallery={galleryUnlocked ? openGallery : undefined} delivery={delivery} audioState={audioState} toggleAudio={toggleAudio} hideSoundtrack />
    {!started ? <main className="fd-album-cover">
      <motion.figure initial={reduced ? false : { scale: 1.01 }} animate={{ scale: reduced ? 1 : 1.035 }} transition={{ duration: reduced ? 0 : 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={v3OpeningPhoto.name} url={v3OpeningPhoto.url} alt={`${clientName} cover photograph`} eager sizes="100vw" /></motion.figure>
      <div className="fd-album-cover-shade" />
      <motion.section initial={reduced ? false : { y: 24 }} animate={{ y: 0 }} transition={{ duration: reduced ? 0 : .8, delay: reduced ? 0 : .18 }}><span>{studioName}</span><h1>{clientName}<br /><em>{albumTitle}</em></h1><p>{delivery?.schemaVersion === 3 ? delivery.creativeDirection?.openingLine : photos.length + ' finished portraits, arranged one page at a time.'}</p><button type="button" onClick={openAlbum}>Open album<BookOpen size={18} /></button></motion.section>
      <div className="fd-album-cover-folio"><span>{delivery?.shootType?.toUpperCase() || 'FAMILY PORTRAITS'}</span><b>{new Date().getFullYear()}</b></div>
    </main> : <main className="fd-album-reader" aria-live="polite" onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(distance) > 45) distance < 0 ? next() : previous(); }}>
      <div className="fd-album-reader-head"><span>{clientName.toUpperCase()}</span><div><i>{String(page + 1).padStart(2, '0')}</i><b>/</b><i>{String(spreadsData.length).padStart(2, '0')}</i></div><span>{albumTitle.toUpperCase()} · {new Date().getFullYear()}</span></div>
      <div className="fd-album-stage"><AnimatePresence mode="wait" custom={direction}><motion.div data-spread-index={page} key={spreadsData[page].id + page} custom={direction} initial={reduced ? false : { opacity: .58, x: direction > 0 ? 38 : -38, clipPath: direction > 0 ? 'inset(0 0 0 7%)' : 'inset(0 7% 0 0)' }} animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)' }} exit={reduced ? undefined : { opacity: 0, x: direction > 0 ? -26 : 26, clipPath: direction > 0 ? 'inset(0 7% 0 0)' : 'inset(0 0 0 7%)' }} transition={{ duration: reduced ? 0 : .68, ease: [0.22, 1, 0.36, 1] }}><AlbumSpread spread={spreadsData[page]} index={page} reduced={reduced} onViewed={markSpreadViewed} onGallery={galleryUnlocked ? openGallery : undefined} /></motion.div></AnimatePresence></div>
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
