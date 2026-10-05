import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  Grid2X2,
  RotateCcw,
  Volume2,
  VolumeX
} from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import ClientGallery from './ClientGallery.jsx';
import { API_BASE_URL } from '../../config/env.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import { useSmoothSoundtrackLoop } from '../../utils/smoothSoundtrackLoop.js';
import './PhotoSwapViewer.css';
import './DeliveryTypography.css';

const SWIPE_VELOCITY = 280;
const SWIPE_DISTANCE = 0.22;

function mediaUrl(value) {
  return typeof value === 'string' && value.startsWith('/api/')
    ? API_BASE_URL.replace(/\/$/, '') + value.slice(4)
    : value;
}

function photoUrl(asset, full = false) {
  return full ? asset?.url || asset?.thumbnailUrl || '' : asset?.thumbnailUrl || asset?.url || '';
}

function dominantColor(asset) {
  const value = asset?.dominantColor
    || asset?.photoColors?.[0]
    || asset?.analysis?.colors?.[0];
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function PhotoSwapPrint({ stackOffset, onDragEnd, ...props }) {
  const x = useMotionValue(0);
  const rotation = useMotionValue(0);
  const isPresent = useIsPresent();

  useMotionValueEvent(x, 'change', value => {
    if (isPresent) stackOffset.set(value);
  });
  useEffect(() => {
    if (isPresent) stackOffset.set(0);
  }, [isPresent, stackOffset]);

  return (
    <motion.article
      {...props}
      style={{ x, rotate: rotation }}
      onDrag={(_, info) => rotation.set(Math.max(-8, Math.min(8, info.offset.x * 0.024)))}
      onDragEnd={(event, info) => {
        animate(rotation, 0, { type: 'spring', damping: 26, stiffness: 280 });
        onDragEnd?.(event, info);
      }}
    />
  );
}

function photoDescription(asset, index) {
  return asset?.alt || 'Photograph ' + (index + 1);
}

export default function PhotoSwapViewer({ delivery, galleryProps = {}, demo = false, preview = false }) {
  const assets = useMemo(
    () => [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    [delivery?.assets]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showGallery, setShowGallery] = useState(false);
  const [muted, setMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const audioRef = useRef(null);
  const reduced = useVeyloReducedMotion();
  const stackOffset = useMotionValue(0);
  const behindScale = useTransform(stackOffset, [-260, 0, 260], [1, 0.935, 1]);
  const behindRotation = useTransform(stackOffset, [-260, 0, 260], [0, 3.1, 0]);
  const behindOpacity = useTransform(stackOffset, [-260, 0, 260], [1, 0.7, 1]);
  const deepScale = useTransform(stackOffset, [-260, 0, 260], [0.94, 0.88, 0.94]);
  const deepRotation = useTransform(stackOffset, [-260, 0, 260], [3, -3.6, 3]);
  const deepOpacity = useTransform(stackOffset, [-260, 0, 260], [0.68, 0.36, 0.68]);

  const isEnd = currentIndex >= assets.length;
  const currentAsset = isEnd ? null : assets[currentIndex];
  const nextAsset = assets[currentIndex + 1];
  const thirdAsset = assets[currentIndex + 2];
  const soundtrackUrl = delivery?.soundtrack?.url ? mediaUrl(delivery.soundtrack.url) : '';
  const title = delivery?.title || (delivery?.clientName ? delivery.clientName + "'s photos" : 'Your photos');
  const studioName = delivery?.branding?.name || 'Your photographer';
  const shootType = delivery?.shootType || 'Photo set';
  const fontStyles = useMemo(
    () => deliveryFontStyles(delivery?.photoswap?.typography),
    [delivery?.photoswap?.typography]
  );
  const color = delivery?.photoswap?.backgroundMode === 'dark' || isEnd
    ? null
    : dominantColor(currentAsset);
  const stageStyle = {
    ...fontStyles,
    '--ps-photo-glow': color || '#171319',
    backgroundColor: '#09090c'
  };

  const canDownloadPhoto = !demo && !preview
    && delivery?.access?.allowIndividualDownloads !== false
    && Boolean(galleryProps?.onDownload);
  const canDownloadAll = !demo && !preview
    && delivery?.access?.allowDownloadAll !== false
    && Boolean(galleryProps?.onDownloadAll);
  useSmoothSoundtrackLoop(audioRef, soundtrackUrl);

  useEffect(() => {
    if (!assets.length) return undefined;
    [1, 2].forEach(offset => {
      const asset = assets[currentIndex + offset];
      const source = photoUrl(asset, true);
      if (!source) return;
      const image = new window.Image();
      image.decoding = 'async';
      if (asset.srcSet) {
        image.sizes = '(max-width: 640px) 82vw, (max-width: 1024px) 500px, 42vw';
        image.srcset = asset.srcSet;
      }
      image.src = mediaUrl(source);
    });
    return undefined;
  }, [assets, currentIndex]);

  const paginate = useCallback((step) => {
    if (showGallery) return;
    const nextIndex = Math.max(0, Math.min(assets.length, currentIndex + step));
    if (nextIndex === currentIndex) return;
    setHasInteracted(true);
    setDirection(step);
    setCurrentIndex(nextIndex);
  }, [assets.length, currentIndex, showGallery]);

  const toggleSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !muted;
    audio.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) audio.play().catch(() => {});
  }, [muted]);

  useEffect(() => {
    const handleKey = event => {
      if (showGallery || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        paginate(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        paginate(-1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [paginate, showGallery]);

  if (showGallery) {
    const photos = assets.map((asset, index) => ({
      name: asset.assetId,
      url: mediaUrl(photoUrl(asset, true)),
      thumbnailUrl: mediaUrl(photoUrl(asset)),
      srcSet: asset.srcSet,
      alt: photoDescription(asset, index),
      assetId: asset.assetId
    }));
    return (
      <ClientGallery
        photos={photos}
        title={title}
        delivery={delivery}
        fontStyles={fontStyles}
        {...galleryProps}
        onClose={() => setShowGallery(false)}
      />
    );
  }

  if (!assets.length) {
    return (
      <main className="ps-viewer ps-empty" style={stageStyle}>
        <div className="ps-empty-card">
          <div className="ps-empty-mark"><DeliveryBrandMark branding={delivery?.branding} /></div>
          <p>PHOTO SWAP</p>
          <h1>Your photos will show up here.</h1>
          <span>This set is still being prepared.</span>
        </div>
      </main>
    );
  }

  const photoNumber = String(Math.min(currentIndex + 1, assets.length)).padStart(2, '0');
  const totalNumber = String(assets.length).padStart(2, '0');

  return (
    <div className={'ps-viewer' + (preview ? ' is-preview' : '')} style={stageStyle}>
      <div className="ps-atmosphere" aria-hidden="true" />
      {soundtrackUrl && <audio ref={audioRef} src={soundtrackUrl} loop preload="none" muted={muted} />}

      <main className="ps-stage" aria-label="Photo Swap">
        <header className="ps-header">
          <div className="ps-header-shell">
            <div className="ps-header-studio">
              <span className="ps-brand-mark"><DeliveryBrandMark branding={delivery?.branding} /></span>
              <span className="ps-header-copy">
                <small><i aria-hidden="true" /> PHOTO SWAP</small>
                <strong>{studioName}</strong>
              </span>
            </div>
            <div className="ps-header-actions">
              <span className="ps-photo-position" aria-label={isEnd ? 'All photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}>
                {isEnd ? 'DONE' : photoNumber + ' / ' + totalNumber}
              </span>
              {soundtrackUrl && (
                <button type="button" className="ps-icon-button" onClick={toggleSound} aria-label={muted ? 'Turn soundtrack on' : 'Mute soundtrack'} title={muted ? 'Turn soundtrack on' : 'Mute soundtrack'}>
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              )}
              <button type="button" className="ps-icon-button ps-gallery-button" onClick={() => setShowGallery(true)} aria-label="Open all photos" title="Open all photos">
                <Grid2X2 size={18} />
                <span>Gallery</span>
              </button>
            </div>
          </div>
        </header>

        <section className="ps-deck-region" aria-label="Photo deck">
          {!isEnd && !hasInteracted && (
            <motion.p className="ps-swipe-hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.3 }}>
              Swipe to see the next photo
            </motion.p>
          )}
          <div className="ps-deck">
            {!isEnd && thirdAsset && (
              <motion.div className="ps-photo-card ps-card-back" style={{ scale: deepScale, rotate: deepRotation, opacity: deepOpacity }} aria-hidden="true">
                <img src={mediaUrl(photoUrl(thirdAsset))} alt="" loading="lazy" decoding="async" />
              </motion.div>
            )}
            {!isEnd && nextAsset && (
              <motion.div className="ps-photo-card ps-card-middle" style={{ scale: behindScale, rotate: behindRotation, opacity: behindOpacity }} aria-hidden="true">
                <img src={mediaUrl(photoUrl(nextAsset, true))} alt="" loading="eager" decoding="async" />
              </motion.div>
            )}
            <AnimatePresence initial={false} custom={direction} mode="sync">
              {!isEnd && currentAsset ? (
                <PhotoSwapPrint
                  key={currentAsset.assetId}
                  className="ps-photo-card ps-card-front"
                  stackOffset={stackOffset}
                  drag={reduced ? false : 'x'}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.82}
                  dragMomentum={false}
                  onDragStart={() => setHasInteracted(true)}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -window.innerWidth * SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) paginate(1);
                    else if (info.offset.x > window.innerWidth * SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) paginate(-1);
                  }}
                  initial={{ opacity: 0.72, scale: 0.95, x: direction > 0 ? 82 : -82, rotate: direction > 0 ? 3 : -3 }}
                  animate={{ opacity: 1, scale: 1, x: 0, rotate: 0, transition: { type: 'spring', damping: 25, stiffness: 280 } }}
                  exit={{ opacity: 0, x: direction > 0 ? -window.innerWidth * 0.92 : window.innerWidth * 0.92, rotate: direction > 0 ? -9 : 9, transition: { duration: 0.26, ease: [0.32, 0, 0.67, 0] } }}
                  role="group"
                  aria-roledescription="photograph"
                  aria-label={'Photo ' + (currentIndex + 1) + ' of ' + assets.length}
                >
                  <img src={mediaUrl(photoUrl(currentAsset, true))} srcSet={currentAsset.srcSet || undefined} sizes="(max-width: 640px) 82vw, (max-width: 1024px) 500px, 42vw" alt={photoDescription(currentAsset, currentIndex)} fetchPriority="high" decoding="async" draggable="false" />
                  <div className="ps-card-shade" aria-hidden="true" />
                  <div className="ps-card-caption">
                    <span>{shootType} <i aria-hidden="true">/</i> {photoNumber} of {totalNumber}</span>
                    <strong>{title}</strong>
                  </div>
                </PhotoSwapPrint>
              ) : (
                <motion.section
                  key="complete"
                  className="ps-complete-card"
                  initial={{ opacity: 0, y: 18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 260 }}
                  aria-labelledby="ps-complete-title"
                >
                  <span className="ps-complete-icon"><Check size={24} strokeWidth={2.5} /></span>
                  <p className="ps-complete-label">SET COMPLETE</p>
                  <h1 id="ps-complete-title">You’ve seen every photo.</h1>
                  <p className="ps-complete-copy">{assets.length} photos from {title}.</p>
                  <div className="ps-complete-actions">
                    <button type="button" className="ps-primary-button" onClick={() => setShowGallery(true)}><Grid2X2 size={17} /> Open gallery</button>
                    {canDownloadAll && (
                      <button type="button" className="ps-secondary-button" onClick={() => galleryProps?.onDownloadAll?.()} disabled={Boolean(galleryProps?.downloadProgress)}>
                        <ArrowDownToLine size={17} />
                        {galleryProps?.downloadProgress ? 'Preparing photos…' : 'Download all'}
                      </button>
                    )}
                    <button type="button" className="ps-restart-button" onClick={() => { setDirection(-1); setCurrentIndex(0); setHasInteracted(true); }}>
                      <RotateCcw size={16} /> Start over
                    </button>
                  </div>
                  {galleryProps?.downloadNotice && <p className="ps-download-note" role="status">{galleryProps.downloadNotice}</p>}
                  {demo && <p className="ps-demo-note">You’re viewing a live demo.</p>}
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </section>

        {!isEnd ? (
          <footer className="ps-control-area">
            <div className="ps-actions" role="toolbar" aria-label="Photo controls">
              <button type="button" className="ps-action-circle" onClick={() => paginate(-1)} disabled={currentIndex === 0} aria-label="Previous photo" title="Previous photo">
                <ChevronLeft size={22} />
              </button>
              <button type="button" className="ps-action-primary" onClick={() => paginate(1)} aria-label="Next photo">
                <span>Next photo</span><ArrowRight size={18} />
              </button>
              {canDownloadPhoto && (
                <button
                  type="button"
                  className="ps-action-circle ps-download-button"
                  onClick={() => galleryProps?.onDownload?.(currentAsset.assetId, currentIndex)}
                  disabled={galleryProps?.busy === currentAsset?.assetId}
                  aria-label="Download this photo"
                  title="Download this photo"
                >
                  <ArrowDownToLine size={19} />
                </button>
              )}
            </div>
            <p className="ps-control-hint">Drag the card or tap Next photo</p>
          </footer>
        ) : null}
      </main>
      <span className="ps-sr-only" aria-live="polite">{isEnd ? 'All ' + assets.length + ' photos viewed' : 'Photo ' + (currentIndex + 1) + ' of ' + assets.length}</span>
    </div>
  );
}
