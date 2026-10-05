import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Images, LoaderCircle, Volume2, VolumeX } from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import ClientGallery from './ClientGallery.jsx';
import { getDeliveryCapabilities } from '../../constants/deliveryCapabilities.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import '../../styles/format-demos.css';
import './DeliveryTypography.css';
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

export function DemoHeader({ format, client, sectionId, onGallery, light = false, delivery, audioState, toggleAudio, hideSoundtrack = false, hideFormatLabel = false, titleDetail, headerClassName = '' }) {
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

  return <header className={'fd-header ' + (light ? 'is-light ' : '') + headerClassName}>
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

    <div className="fd-header-title">{!hideFormatLabel && <span>{format}</span>}<strong>{client}</strong>{titleDetail && <small>{titleDetail}</small>}</div>

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


export const DemoGallery = ClientGallery;
