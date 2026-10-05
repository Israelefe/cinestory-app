import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Music2,
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

const MAX_PROGRESS_SEGMENTS = 32;
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
  const [started, setStarted] = useState(Boolean(preview));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showGallery, setShowGallery] = useState(false);
  const [muted, setMuted] = useState(Boolean(preview));
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
  const title = delivery?.title || (delivery?.clientName || 'Your') + '\'s photographs';
  const studioName = delivery?.branding?.name || 'Your photographer';
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
    backgroundColor: '#08080b'
  };

  const canDownloadPhoto = !demo && !preview && delivery?.access?.allowIndividualDownloads !== false;
  const canDownloadAll = !demo && !preview && delivery?.access?.allowDownloadAll !== false;
  const canOpenGallery = assets.length > 0;
  useSmoothSoundtrackLoop(audioRef, soundtrackUrl);

  useEffect(() => {
    if (!started || !assets.length) return undefined;
    [1, 2].forEach(offset => {
      const asset = assets[currentIndex + offset];
      const source = photoUrl(asset, true);
      if (!source) return;
      const image = new window.Image();
      image.decoding = 'async';
      if (asset.srcSet) {
        image.sizes = '(max-width: 640px) 82vw, (max-width: 1024px) 460px, 42vw';
        image.srcset = asset.srcSet;
      }
      image.src = mediaUrl(source);
    });
    return undefined;
  }, [assets, currentIndex, started]);

  const paginate = useCallback((step) => {
    if (showGallery) return;
    const nextIndex = Math.max(0, Math.min(assets.length, currentIndex + step));
    if (nextIndex === currentIndex) return;
    setHasInteracted(true);
    setDirection(step);
    setCurrentIndex(nextIndex);
  }, [assets.length, currentIndex, showGallery]);

  const startDelivery = useCallback(() => {
    setStarted(true);
    if (soundtrackUrl && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [soundtrackUrl]);

  const toggleSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !muted;
    audio.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted && started) audio.play().catch(() => {});
  }, [muted, started]);

  useEffect(() => {
    const handleKey = event => {
      if (showGallery || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      if (!started && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        startDelivery();
      } else if (started && event.key === 'ArrowRight') {
        event.preventDefault();
        paginate(1);
      } else if (started && event.key === 'ArrowLeft') {
        event.preventDefault();
        paginate(-1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [paginate, showGallery, started, startDelivery]);

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
          <h1>Your photographs will appear here.</h1>
          <span>This delivery is still being prepared.</span>
        </div>
      </main>
    );
  }

  const progressSegments = Math.min(MAX_PROGRESS_SEGMENTS, assets.length);
  const progressPosition = isEnd
    ? progressSegments
    : Math.min(progressSegments - 0.001, currentIndex / assets.length * progressSegments);
  const progressIndex = Math.floor(progressPosition);

  return (
    <div className={'ps-viewer' + (preview ? ' is-preview' : '')} style={stageStyle}>
      <div className="ps-atmosphere" aria-hidden="true" />
      {soundtrackUrl && <audio ref={audioRef} src={soundtrackUrl} loop preload="none" muted={muted} />}

      {!started ? (
        <section className="ps-cover" aria-label="Photo Swap introduction">
          <div className="ps-cover-image" aria-hidden="true">
              <img src={mediaUrl(photoUrl(assets[0], true))} srcSet={assets[0].srcSet || undefined} sizes="100vw" alt="" fetchPriority="high" decoding="async" />
          </div>
          <header className="ps-cover-header">
            <div className="ps-studio">
              <span className="ps-brand-mark"><DeliveryBrandMark branding={delivery?.branding} /></span>
              <span><strong>{studioName}</strong><small>{delivery?.shootType || 'PHOTO DELIVERY'}</small></span>
            </div>
            <span className="ps-cover-count">{String(assets.length).padStart(2, '0')} {assets.length === 1 ? 'PHOTOGRAPH' : 'PHOTOGRAPHS'}</span>
          </header>
          <div className="ps-cover-content">
            <p className="ps-eyebrow"><span /> PHOTO SWAP{delivery?.shootType ? ' · ' + delivery.shootType : ''}</p>
            <h1>{title}</h1>
            {delivery?.brief && <p className="ps-cover-note">{delivery.brief}</p>}
            <p className="ps-cover-description">Your finished photos are ready. Swipe through the set at your own pace.</p>
            <div className="ps-cover-actions">
              <button type="button" className="ps-primary-button" onClick={startDelivery}>
                Start swiping <ArrowRight size={18} />
              </button>
              {canOpenGallery && (
                <button type="button" className="ps-cover-gallery" onClick={() => setShowGallery(true)}>
                  Browse all photos <Grid2X2 size={17} />
                </button>
              )}
            </div>
            {soundtrackUrl && <p className="ps-soundtrack-cue"><Music2 size={15} /> Soundtrack starts with the photos</p>}
          </div>
          <div className="ps-cover-foot"><span>VEYLO PHOTO SWAP</span><span>MADE FOR THE MOMENT</span></div>
        </section>
      ) : (
        <main className="ps-stage" aria-label="Photo Swap viewer">
          <header className="ps-header">
            <div className="ps-progress" aria-hidden="true">
              {Array.from({ length: progressSegments }, (_, index) => {
                const fill = isEnd ? 1 : index < progressIndex ? 1 : index === progressIndex ? Math.max(0.12, progressPosition - progressIndex) : 0;
                return <span className="ps-progress-segment" key={index}><i style={{ transform: 'scaleX(' + fill + ')' }} /></span>;
              })}
            </div>
            <div className="ps-header-row">
              <div className="ps-header-studio">
                <span className="ps-brand-mark ps-brand-mark-small"><DeliveryBrandMark branding={delivery?.branding} /></span>
                <span className="ps-header-copy">
                  <strong>{studioName}</strong>
                  <small>{title}</small>
                </span>
              </div>
              <div className="ps-header-actions">
                <span className="ps-photo-position" aria-hidden="true">
                  {isEnd ? 'COMPLETE' : String(currentIndex + 1).padStart(2, '0') + ' / ' + String(assets.length).padStart(2, '0')}
                </span>
                {soundtrackUrl && (
                  <button type="button" className="ps-glass-button" onClick={toggleSound} aria-label={muted ? 'Turn soundtrack on' : 'Mute soundtrack'} title={muted ? 'Turn soundtrack on' : 'Mute soundtrack'}>
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                )}
                <button type="button" className="ps-glass-button" onClick={() => setShowGallery(true)} aria-label="Browse the full gallery" title="Browse the full gallery">
                  <Grid2X2 size={18} />
                </button>
              </div>
            </div>
          </header>

          <section className="ps-deck-region" aria-label="Swipe through the photographs">
            {!isEnd && !hasInteracted && (
              <motion.p className="ps-gesture-hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.35 }}>
                Drag a photo to turn it
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
                    initial={{ opacity: 0.7, scale: 0.94, x: direction > 0 ? 90 : -90, rotate: direction > 0 ? 4 : -4 }}
                    animate={{ opacity: 1, scale: 1, x: 0, rotate: 0, transition: { type: 'spring', damping: 25, stiffness: 280 } }}
                    exit={{ opacity: 0, x: direction > 0 ? -window.innerWidth * 0.95 : window.innerWidth * 0.95, rotate: direction > 0 ? -11 : 11, transition: { duration: 0.28, ease: [0.32, 0, 0.67, 0] } }}
                    role="group"
                    aria-roledescription="photograph"
                    aria-label={String(currentIndex + 1) + ' of ' + assets.length}
                  >
                    <img src={mediaUrl(photoUrl(currentAsset, true))} srcSet={currentAsset.srcSet || undefined} sizes="(max-width: 640px) 82vw, (max-width: 1024px) 460px, 42vw" alt={photoDescription(currentAsset, currentIndex)} fetchPriority="high" decoding="async" draggable="false" />
                    <span className="ps-card-number">{String(currentIndex + 1).padStart(2, '0')}</span>
                  </PhotoSwapPrint>
                ) : (
                  <motion.section
                    key="finish"
                    className="ps-finish-card"
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 240 }}
                    aria-labelledby="ps-finish-title"
                  >
                    <div className="ps-finish-fan" aria-hidden="true">
                      {assets.slice(Math.max(0, assets.length - 3)).map((asset, index) => (
                        <span key={asset.assetId} className={'ps-fan-card ps-fan-card-' + index}>
                          <img src={mediaUrl(photoUrl(asset))} alt="" loading="lazy" decoding="async" />
                        </span>
                      ))}
                    </div>
                    <p className="ps-eyebrow"><span /> THE FULL SET</p>
                    <h2 id="ps-finish-title">You’ve reached the end.</h2>
                    <p className="ps-finish-copy">{assets.length} finished {assets.length === 1 ? 'photograph' : 'photographs'}, ready to revisit or download.</p>
                    <div className="ps-finish-actions">
                      <button type="button" className="ps-primary-button" onClick={() => setShowGallery(true)}><Grid2X2 size={17} /> View the gallery</button>
                      {canDownloadAll && (
                        <button type="button" className="ps-secondary-button" onClick={() => galleryProps?.onDownloadAll?.()} disabled={Boolean(galleryProps?.downloadProgress)}>
                          <ArrowDownToLine size={17} />
                          {galleryProps?.downloadProgress ? 'Preparing photos…' : 'Download all photos'}
                        </button>
                      )}
                      <button type="button" className="ps-restart-button" onClick={() => { setDirection(-1); setCurrentIndex(0); setHasInteracted(true); }}>
                        <RotateCcw size={16} /> Start again
                      </button>
                    </div>
                    {galleryProps?.downloadNotice && <p className="ps-download-note" role="status">{galleryProps.downloadNotice}</p>}
                    {demo && <p className="ps-demo-note">You’re viewing a live demo.</p>}
                  </motion.section>
                )}
              </AnimatePresence>
            </div>
          </section>

          {!isEnd && (
            <footer className="ps-control-area">
              <div className="ps-dock" role="toolbar" aria-label="Photograph controls">
                <button type="button" className="ps-dock-button" onClick={() => paginate(-1)} disabled={currentIndex === 0} aria-label="Previous photograph" title="Previous photograph">
                  <ChevronLeft size={21} />
                </button>
                <span className="ps-dock-count" aria-live="polite">
                  <strong>{String(currentIndex + 1).padStart(2, '0')}</strong><i>/</i><span>{String(assets.length).padStart(2, '0')}</span>
                </span>
                <button type="button" className="ps-dock-button" onClick={() => paginate(1)} aria-label="Next photograph" title="Next photograph">
                  <ChevronRight size={21} />
                </button>
                {canDownloadPhoto && (
                  <button
                    type="button"
                    className="ps-dock-button ps-dock-action"
                    onClick={() => galleryProps?.onDownload?.(currentAsset.assetId, currentIndex)}
                    disabled={galleryProps?.busy === currentAsset?.assetId}
                    aria-label="Download this photograph"
                    title="Download this photograph"
                  >
                    <ArrowDownToLine size={18} />
                  </button>
                )}
                <button type="button" className="ps-dock-button ps-dock-action" onClick={() => setShowGallery(true)} aria-label="Open the full gallery" title="Open the full gallery">
                  <Grid2X2 size={18} />
                </button>
              </div>
              <p className="ps-control-hint">Swipe or use the arrows to move through the set</p>
            </footer>
          )}
        </main>
      )}
      <span className="ps-sr-only" aria-live="polite">{started && !isEnd ? 'Photograph ' + (currentIndex + 1) + ' of ' + assets.length : ''}</span>
    </div>
  );
}
