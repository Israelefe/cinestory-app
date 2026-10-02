import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Grid,
  Music2,
  RotateCcw,
  Volume2,
  VolumeX
} from 'lucide-react';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import ClientGallery from './ClientGallery.jsx';
import { API_BASE_URL } from '../../config/env.js';
import { useSmoothSoundtrackLoop } from '../../utils/smoothSoundtrackLoop.js';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import './PhotoSwapViewer.css';
import './DeliveryTypography.css';

function mediaUrl(value) {
  return typeof value === 'string' && value.startsWith('/api/')
    ? `${API_BASE_URL.replace(/\/$/, '')}${value.slice(4)}`
    : value;
}

function photoUrl(asset, full = false) {
  return full ? asset?.url || asset?.thumbnailUrl || '' : asset?.thumbnailUrl || asset?.url || '';
}

function getDominantColor(asset) {
  const raw = asset?.dominantColor
    || (asset?.photoColors?.length ? asset.photoColors[0] : null)
    || (asset?.analysis?.colors?.length ? asset.analysis.colors[0] : null);
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw : null;
}

const SWIPE_VELOCITY = 280;
const SWIPE_DISTANCE = 0.22;

export default function PhotoSwapViewer({ delivery, galleryProps = {}, demo = false, preview = false }) {
  const assets = useMemo(() => {
    return [...(delivery?.assets || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [delivery?.assets]);

  // When preview is true in creation wizard, start directly in the stack view so photographer sees card interaction.
  // When viewed by client or in demo, start on the cinematic cover screen.
  const [started, setStarted] = useState(() => Boolean(preview));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const reduced = useReducedMotion();
  const audioRef = useRef(null);

  const isEnd = currentIndex >= assets.length;
  const currentAsset = !isEnd ? assets[currentIndex] : null;
  const nextAsset = currentIndex < assets.length - 1 ? assets[currentIndex + 1] : null;
  const thirdAsset = currentIndex < assets.length - 2 ? assets[currentIndex + 2] : null;

  // Soundtrack
  const soundtrackUrl = delivery?.soundtrack?.url ? mediaUrl(delivery.soundtrack.url) : null;
  useSmoothSoundtrackLoop(audioRef, soundtrackUrl);

  // Preload next 3 photos
  useEffect(() => {
    if (isEnd) return;
    [1, 2, 3].forEach(offset => {
      const nextIndex = currentIndex + offset;
      if (nextIndex < assets.length) {
        const img = new window.Image();
        img.src = mediaUrl(photoUrl(assets[nextIndex], true));
      }
    });
  }, [currentIndex, isEnd, assets]);

  // Adaptive background
  const bgMode = delivery?.photoswap?.backgroundMode || 'auto';
  const bgColor = useMemo(() => {
    if (bgMode === 'dark' || isEnd || !currentAsset) return null;
    return getDominantColor(currentAsset);
  }, [bgMode, currentAsset, isEnd]);

  const bgStyle = useMemo(() => {
    if (!bgColor) return { backgroundColor: '#070709' };
    return {
      backgroundColor: '#070709',
      backgroundImage: `radial-gradient(ellipse at 50% 38%, ${bgColor}40 0%, ${bgColor}18 45%, #070709 82%)`
    };
  }, [bgColor]);

  const fontStyles = useMemo(() => deliveryFontStyles(delivery?.photoswap?.typography), [delivery?.photoswap?.typography]);
  const allowIndividualDownloads = Boolean(demo || delivery?.access?.allowIndividualDownloads !== false);
  const allowDownloadAll = Boolean(!demo && delivery?.access?.allowDownloadAll !== false);

  // Navigation
  const paginate = useCallback((dir) => {
    if (showGallery) return;
    setHasInteracted(true);
    const next = currentIndex + dir;
    if (next < 0) return;
    if (next > assets.length) return;
    setDirection(dir);
    setCurrentIndex(next);
  }, [currentIndex, showGallery, assets.length]);

  // Motion drag values for the active top card
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-7, 0, 7]);
  const behindScale1 = useTransform(x, [-250, 0, 250], [1, 0.94, 1]);
  const behindRotate1 = useTransform(x, [-250, 0, 250], [0, 3, 0]);
  const behindOpacity1 = useTransform(x, [-250, 0, 250], [1, 0.72, 1]);

  const behindScale2 = useTransform(x, [-250, 0, 250], [0.94, 0.88, 0.94]);
  const behindRotate2 = useTransform(x, [-250, 0, 250], [3, -3.5, 3]);
  const behindOpacity2 = useTransform(x, [-250, 0, 250], [0.72, 0.42, 0.72]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e) => {
      if (showGallery) return;
      if (!started) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleStart();
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        paginate(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        paginate(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paginate, showGallery, started]);

  // Start delivery and unlock soundtrack
  const handleStart = () => {
    setStarted(true);
    if (soundtrackUrl && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  };

  const toggleSound = () => {
    if (!audioRef.current) return;
    if (muted) {
      audioRef.current.muted = false;
      audioRef.current.play().catch(() => {});
      setMuted(false);
    } else {
      audioRef.current.muted = true;
      setMuted(true);
    }
  };

  // Full gallery overlay
  if (showGallery) {
    const photos = assets.map((asset, i) => ({
      name: asset.assetId,
      url: mediaUrl(photoUrl(asset, true)),
      thumbnailUrl: mediaUrl(photoUrl(asset)),
      alt: asset.alt || `Photo ${i + 1}`,
      assetId: asset.assetId
    }));
    return (
      <ClientGallery
        photos={photos}
        title={delivery?.title || delivery?.clientName || 'Photo Swap'}
        onClose={() => setShowGallery(false)}
        delivery={delivery}
        fontStyles={fontStyles}
        {...galleryProps}
      />
    );
  }

  const studioName = delivery?.branding?.name || delivery?.clientName || 'Veylo Studio';
  const shootTitle = delivery?.title || `${delivery?.clientName || 'Client'}'s Photographs`;
  const coverPhoto = assets[0];

  return (
    <div
      className="ps-viewer"
      style={{ touchAction: 'pan-y', ...fontStyles }}
    >
      <div className="ps-bg" style={bgStyle} />

      {/* Soundtrack audio */}
      {soundtrackUrl && (
        <audio
          ref={audioRef}
          src={soundtrackUrl}
          loop
          preload="auto"
          muted={muted}
        />
      )}

      {/* ─── State 1: Cinematic Cover Screen ─────────────────── */}
      {!started && coverPhoto && (
        <section className="ps-cover" aria-label="Delivery Introduction">
          <div className="ps-cover-backdrop">
            <img
              src={mediaUrl(photoUrl(coverPhoto, true))}
              alt=""
              loading="eager"
              decoding="async"
            />
            <div className="ps-cover-shade" />
          </div>

          <header className="ps-cover-header">
            <div className="ps-cover-studio">
              <div className="ps-cover-mark">
                <DeliveryBrandMark branding={delivery?.branding} />
              </div>
              <div className="ps-cover-meta">
                <strong>{studioName}</strong>
                <span>Photo Delivery</span>
              </div>
            </div>
            {soundtrackUrl && (
              <button
                type="button"
                className="ps-icon-pill"
                onClick={toggleSound}
                aria-label={muted ? 'Unmute soundtrack' : 'Mute soundtrack'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                <span>{muted ? 'Muted' : 'Music on'}</span>
              </button>
            )}
          </header>

          <main className="ps-cover-body">
            <span className="ps-cover-kicker">
              PHOTO SWAP DELIVERY · {assets.length} PHOTOGRAPHS
            </span>
            <h1 className="ps-cover-title">{shootTitle}</h1>
            <p className="ps-cover-summary">
              Your finished photographs are ready. Swipe through the collection one photo at a time, or browse the complete gallery.
            </p>

            <div className="ps-cover-actions">
              <button
                type="button"
                className="ps-btn ps-btn-primary ps-cover-start"
                onClick={handleStart}
                autoFocus
              >
                <span>Swipe photographs</span>
                <ArrowRight size={18} />
              </button>

              <button
                type="button"
                className="ps-btn ps-btn-secondary"
                onClick={() => setShowGallery(true)}
              >
                <Grid size={17} />
                <span>View full gallery</span>
              </button>
            </div>

            {soundtrackUrl && (
              <p className="ps-cover-hint">
                <Music2 size={14} />
                <span>Soundtrack included · Best with sound</span>
              </p>
            )}
          </main>
        </section>
      )}

      {/* ─── State 2: Interactive Card Stack ─────────────────── */}
      {started && (
        <div className="ps-stage">
          {/* Top Bar: Segmented Progress & Actions */}
          <header className="ps-top-nav">
            <div className="ps-progress-bar" aria-hidden="true">
              {assets.map((_, i) => (
                <span
                  key={i}
                  className={
                    i < currentIndex
                      ? 'is-done'
                      : i === currentIndex && !isEnd
                      ? 'is-current'
                      : ''
                  }
                />
              ))}
            </div>

            <div className="ps-top-row">
              <div className="ps-top-left">
                <div className="ps-brand-mark-sm">
                  <DeliveryBrandMark branding={delivery?.branding} />
                </div>
                <div className="ps-top-title">
                  <strong>{shootTitle}</strong>
                  {!isEnd && (
                    <small>
                      Photograph {currentIndex + 1} of {assets.length}
                    </small>
                  )}
                </div>
              </div>

              <div className="ps-top-right">
                {soundtrackUrl && (
                  <button
                    type="button"
                    className="ps-icon-btn"
                    onClick={toggleSound}
                    aria-label={muted ? 'Unmute soundtrack' : 'Mute soundtrack'}
                  >
                    {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  </button>
                )}

                <button
                  type="button"
                  className="ps-icon-btn"
                  onClick={() => setShowGallery(true)}
                  aria-label="View complete gallery"
                >
                  <Grid size={17} />
                </button>
              </div>
            </div>
          </header>

          {/* Tap Zones for Quick Single-Hand Navigation */}
          {!isEnd && (
            <>
              <button
                type="button"
                className="ps-tap-zone ps-tap-prev"
                onClick={() => paginate(-1)}
                disabled={currentIndex === 0}
                aria-label="Previous photograph"
              />
              <button
                type="button"
                className="ps-tap-zone ps-tap-next"
                onClick={() => paginate(1)}
                aria-label="Next photograph"
              />
            </>
          )}

          {/* Physical Print Stack */}
          <main className="ps-stack-area">
            {/* Gesture Hint on First Card */}
            {!hasInteracted && currentIndex === 0 && !isEnd && (
              <motion.div
                className="ps-swipe-hint"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                <span>Swipe or tap sides to turn</span>
              </motion.div>
            )}

            <div className="ps-card-stack">
              {/* Third Card (Deepest Peek) */}
              {!isEnd && thirdAsset && !reduced && (
                <motion.div
                  className="ps-print-card ps-print-third"
                  style={{
                    scale: behindScale2,
                    rotate: behindRotate2,
                    opacity: behindOpacity2
                  }}
                  aria-hidden="true"
                >
                  <img
                    src={mediaUrl(photoUrl(thirdAsset, false))}
                    alt=""
                    draggable="false"
                    loading="lazy"
                  />
                  <div className="ps-print-glare" />
                </motion.div>
              )}

              {/* Second Card (Direct Peek Behind) */}
              {!isEnd && nextAsset && !reduced && (
                <motion.div
                  className="ps-print-card ps-print-second"
                  style={{
                    scale: behindScale1,
                    rotate: behindRotate1,
                    opacity: behindOpacity1
                  }}
                  aria-hidden="true"
                >
                  <img
                    src={mediaUrl(photoUrl(nextAsset, true))}
                    alt=""
                    draggable="false"
                    loading="eager"
                  />
                  <div className="ps-print-glare" />
                </motion.div>
              )}

              {/* Top Active Card with Spring Drag */}
              <AnimatePresence initial={false} custom={direction}>
                {!isEnd && currentAsset ? (
                  <motion.div
                    key={currentAsset.assetId}
                    className="ps-print-card ps-print-top"
                    style={{ x, rotate: reduced ? 0 : rotate }}
                    drag={reduced ? false : 'x'}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.85}
                    onDragStart={() => setHasInteracted(true)}
                    onDragEnd={(_, info) => {
                      const offset = info.offset.x;
                      const velocity = info.velocity.x;
                      if (offset < -window.innerWidth * SWIPE_DISTANCE || velocity < -SWIPE_VELOCITY) {
                        paginate(1);
                      } else if (offset > window.innerWidth * SWIPE_DISTANCE || velocity > SWIPE_VELOCITY) {
                        paginate(-1);
                      }
                    }}
                    initial={
                      reduced
                        ? { opacity: 0 }
                        : {
                            scale: 0.94,
                            opacity: 0.8,
                            x: direction > 0 ? 180 : -180,
                            rotate: direction > 0 ? 4 : -4
                          }
                    }
                    animate={{
                      scale: 1,
                      opacity: 1,
                      x: 0,
                      rotate: 0,
                      transition: {
                        type: 'spring',
                        damping: 26,
                        stiffness: 280
                      }
                    }}
                    exit={
                      reduced
                        ? { opacity: 0 }
                        : {
                            x: direction >= 0 ? -window.innerWidth * 1.05 : window.innerWidth * 1.05,
                            rotate: direction >= 0 ? -12 : 12,
                            opacity: 0,
                            transition: { duration: 0.32, ease: [0.32, 0, 0.67, 0] }
                          }
                    }
                  >
                    <img
                      src={mediaUrl(photoUrl(currentAsset, true))}
                      alt={currentAsset.alt || `Photograph ${currentIndex + 1}`}
                      draggable="false"
                      loading="eager"
                    />
                    <div className="ps-print-glare" />
                  </motion.div>
                ) : isEnd ? (
                  /* ─── State 3: Editorial Finale Screen ──────────────── */
                  <motion.div
                    key="finale"
                    className="ps-finale-card"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Visual collage fan of 3 photos */}
                    <div className="ps-finale-fan" aria-hidden="true">
                      {assets.slice(0, 3).map((item, idx) => (
                        <div key={item.assetId} className={`ps-fan-item is-${idx + 1}`}>
                          <img src={mediaUrl(photoUrl(item))} alt="" loading="lazy" />
                        </div>
                      ))}
                    </div>

                    <span className="ps-finale-kicker">
                      COLLECTION COMPLETED · {assets.length} PHOTOGRAPHS
                    </span>
                    <h2 className="ps-finale-title">You've seen the full collection.</h2>
                    <p className="ps-finale-copy">
                      Browse all finished photographs together or save the complete set to your device.
                    </p>

                    <div className="ps-finale-actions">
                      <button
                        type="button"
                        className="ps-btn ps-btn-primary"
                        onClick={() => setShowGallery(true)}
                      >
                        <Grid size={17} />
                        <span>View complete gallery</span>
                      </button>

                      {allowDownloadAll && (
                        <button
                          type="button"
                          className="ps-btn ps-btn-secondary"
                          onClick={() => galleryProps?.onDownloadAll?.()}
                          disabled={Boolean(galleryProps?.downloadProgress)}
                        >
                          <Download size={17} />
                          <span>Download all photographs</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="ps-btn ps-btn-outline"
                        onClick={() => {
                          setCurrentIndex(0);
                          setDirection(-1);
                        }}
                      >
                        <RotateCcw size={16} />
                        <span>Start again</span>
                      </button>
                    </div>

                    {galleryProps?.downloadNotice && (
                      <p className="ps-finale-notice">{galleryProps.downloadNotice}</p>
                    )}
                    {demo && (
                      <p className="ps-demo-badge">Live interactive demo · Downloads disabled</p>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </main>

          {/* Floating Glass Control Dock */}
          {!isEnd && (
            <footer className="ps-bottom-bar">
              <div className="ps-dock" role="toolbar" aria-label="Photo navigation">
                <button
                  type="button"
                  className="ps-dock-btn"
                  onClick={() => paginate(-1)}
                  disabled={currentIndex === 0}
                  aria-label="Previous photograph"
                >
                  <ChevronLeft size={19} />
                </button>

                <div className="ps-dock-counter">
                  <b>{String(currentIndex + 1).padStart(2, '0')}</b>
                  <span>/</span>
                  <small>{String(assets.length).padStart(2, '0')}</small>
                </div>

                <button
                  type="button"
                  className="ps-dock-btn"
                  onClick={() => paginate(1)}
                  aria-label="Next photograph"
                >
                  <ChevronRight size={19} />
                </button>

                <div className="ps-dock-sep" aria-hidden="true" />

                {allowIndividualDownloads && currentAsset && (
                  <button
                    type="button"
                    className="ps-dock-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (demo) return;
                      galleryProps?.onDownload?.(currentAsset.assetId, currentIndex);
                    }}
                    disabled={demo || galleryProps?.busy === currentAsset.assetId}
                    aria-label={demo ? 'Demo — downloads disabled' : 'Download this photograph'}
                  >
                    <ArrowDownToLine size={17} />
                  </button>
                )}

                <button
                  type="button"
                  className="ps-dock-btn"
                  onClick={() => setShowGallery(true)}
                  aria-label="Open gallery view"
                >
                  <Grid size={17} />
                </button>
              </div>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}
