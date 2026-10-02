import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { ArrowDownToLine, Download, Grid, RotateCcw, Volume2, VolumeX } from 'lucide-react';
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

function accessHeaders(publicId) {
  const headers = {};
  const pin = sessionStorage.getItem(`veylo_delivery_${publicId}`);
  const grant = sessionStorage.getItem(`veylo_delivery_grant_${publicId}`);
  if (pin) headers['x-delivery-access'] = pin;
  if (grant) headers['x-delivery-grant'] = grant;
  return headers;
}

const SWIPE_VELOCITY = 300;
const SWIPE_DISTANCE = 0.25;

export default function PhotoSwapViewer({ delivery, galleryProps = {}, demo }) {
  const assets = useMemo(() => {
    return [...(delivery?.assets || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [delivery?.assets]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const reduced = useReducedMotion();
  const audioRef = useRef(null);

  const isEnd = currentIndex >= assets.length;
  const currentAsset = !isEnd ? assets[currentIndex] : null;

  // Soundtrack
  const soundtrackUrl = delivery?.soundtrack?.url ? mediaUrl(delivery.soundtrack.url) : null;
  useSmoothSoundtrackLoop(audioRef, soundtrackUrl);

  // Preload next 2 photos
  useEffect(() => {
    if (isEnd) return;
    [1, 2].forEach(offset => {
      const nextIndex = currentIndex + offset;
      if (nextIndex < assets.length) {
        const img = new window.Image();
        img.src = mediaUrl(photoUrl(assets[nextIndex], true));
      }
    });
  }, [currentIndex, isEnd, assets]);

  // Background
  const bgMode = delivery?.photoswap?.backgroundMode || 'auto';
  const bgColor = useMemo(() => {
    if (bgMode === 'dark' || isEnd || !currentAsset) return null;
    return getDominantColor(currentAsset);
  }, [bgMode, currentAsset, isEnd]);

  const bgStyle = useMemo(() => {
    if (!bgColor) return { backgroundColor: '#070709' };
    return {
      backgroundColor: '#070709',
      backgroundImage: `radial-gradient(ellipse at 50% 40%, ${bgColor}35 0%, ${bgColor}15 40%, #070709 75%)`
    };
  }, [bgColor]);

  const fontStyles = useMemo(() => deliveryFontStyles(delivery?.photoswap?.typography), [delivery?.photoswap?.typography]);
  const allowIndividualDownloads = Boolean(demo || delivery?.access?.allowIndividualDownloads !== false);
  const allowDownloadAll = Boolean(!demo && delivery?.access?.allowDownloadAll !== false);

  // Navigation
  const paginate = useCallback((dir) => {
    if (showGallery) return;
    const next = currentIndex + dir;
    if (next < 0 || next > assets.length) return;
    setDirection(dir);
    setCurrentIndex(next);
  }, [currentIndex, showGallery, assets.length]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (showGallery) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); paginate(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); paginate(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paginate, showGallery]);

  // Drag
  const x = useMotionValue(0);
  const cardRotate = useTransform(x, [-300, 0, 300], [-4, 0, 4]);
  const behindScale = useTransform(x, [-300, 0, 300], [1, 0.92, 1]);
  const behindOpacity = useTransform(x, [-300, 0, 300], [0.6, 0.3, 0.6]);

  const handleDragEnd = useCallback((_e, { offset, velocity }) => {
    const screenWidth = window.innerWidth;
    const distanceThreshold = screenWidth * SWIPE_DISTANCE;
    if (Math.abs(velocity.x) > SWIPE_VELOCITY || Math.abs(offset.x) > distanceThreshold) {
      paginate(offset.x < 0 ? 1 : -1);
    }
  }, [paginate]);

  // Soundtrack toggle
  const toggleSound = () => {
    if (!audioRef.current) return;
    const next = !muted;
    setMuted(next);
    audioRef.current.muted = next;
    if (!next && audioRef.current.paused) {
      audioRef.current.volume = 0.5;
      audioRef.current.play().catch(() => {});
    }
  };

  const startSoundtrack = () => {
    if (!audioRef.current || audioReady) return;
    setAudioReady(true);
    audioRef.current.volume = 0.5;
    audioRef.current.play().catch(() => {});
  };

  // Variants
  const variants = {
    enter: (dir) => ({
      x: reduced ? 0 : dir > 0 ? 400 : -400,
      opacity: reduced ? 0 : 0.4,
      scale: reduced ? 1 : 0.92,
    }),
    center: {
      zIndex: 2,
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir) => ({
      zIndex: 0,
      x: reduced ? 0 : dir < 0 ? 400 : -400,
      opacity: 0,
      scale: reduced ? 1 : 0.92,
    }),
  };

  // Gallery overlay
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

  // Next card peek (the card behind)
  const nextAsset = currentIndex < assets.length - 1 ? assets[currentIndex + 1] : null;

  return (
    <div
      className="ps-viewer"
      style={{ touchAction: 'pan-y', ...fontStyles }}
      onClick={soundtrackUrl && !audioReady ? startSoundtrack : undefined}
    >
      <div className="ps-bg" style={bgStyle} />

      {/* Soundtrack audio element */}
      {soundtrackUrl && (
        <audio
          ref={audioRef}
          src={soundtrackUrl}
          loop
          preload="auto"
          muted={muted}
        />
      )}

      {/* Top bar: brand + counter */}
      <div className="ps-overlay" aria-hidden="true">
        <div className="ps-top-bar">
          <div className="ps-brand">
            <DeliveryBrandMark branding={delivery?.branding} />
          </div>
          {!isEnd && assets.length > 0 && (
            <div className="ps-counter" aria-live="polite">
              {currentIndex + 1} <span className="ps-counter-sep">/</span> {assets.length}
            </div>
          )}
        </div>

        {/* Sound toggle - bottom left */}
        {soundtrackUrl && (
          <button
            className="ps-sound"
            onClick={(e) => { e.stopPropagation(); toggleSound(); }}
            aria-label={muted ? 'Unmute soundtrack' : 'Mute soundtrack'}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        )}

        {/* Download - bottom right */}
        {!isEnd && currentAsset && allowIndividualDownloads && (
          <button
            className="ps-download"
            onClick={(e) => {
              e.stopPropagation();
              if (demo) return;
              galleryProps?.onDownload?.(currentAsset.assetId, currentIndex);
            }}
            disabled={demo || galleryProps?.busy === currentAsset.assetId}
            aria-label={demo ? 'Demo — downloads disabled' : 'Download this photo'}
          >
            <ArrowDownToLine size={18} />
          </button>
        )}
      </div>

      {/* Card stack */}
      <div className="ps-stack">
        {/* Next card peek (behind the current) */}
        {!isEnd && nextAsset && !reduced && (
          <motion.div
            className="ps-card ps-card-behind"
            style={{ scale: behindScale, opacity: behindOpacity }}
            aria-hidden="true"
          >
            <img
              src={mediaUrl(photoUrl(nextAsset, true))}
              alt=""
              draggable="false"
              loading="eager"
            />
          </motion.div>
        )}

        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          {!isEnd && currentAsset ? (
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', damping: 25, stiffness: 280 },
                opacity: { duration: 0.25 },
                scale: { duration: 0.25 }
              }}
              drag={reduced ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={handleDragEnd}
              style={{ x, rotateY: reduced ? 0 : cardRotate, perspective: 1200 }}
              className="ps-card"
            >
              <img
                src={mediaUrl(photoUrl(currentAsset, true))}
                alt={currentAsset.alt || `Photo ${currentIndex + 1}`}
                draggable="false"
                loading="eager"
              />
            </motion.div>
          ) : isEnd ? (
            <motion.div
              key="end-screen"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="ps-end"
            >
              <p className="ps-end-label">ALL {assets.length} PHOTOS</p>
              <h2>You've seen everything.</h2>

              <div className="ps-end-actions">
                <button className="ps-btn ps-btn-primary" onClick={() => setShowGallery(true)}>
                  <Grid size={17} />
                  View as gallery
                </button>

                {allowDownloadAll && (
                  <button
                    className="ps-btn ps-btn-secondary"
                    onClick={() => galleryProps?.onDownloadAll?.()}
                    disabled={!!galleryProps?.downloadProgress}
                  >
                    <Download size={17} />
                    Download all
                  </button>
                )}

                <button
                  className="ps-btn ps-btn-outline"
                  onClick={() => { setCurrentIndex(0); setDirection(-1); }}
                >
                  <RotateCcw size={17} />
                  Start again
                </button>
              </div>

              {galleryProps?.downloadNotice && (
                <p className="ps-notice">{galleryProps.downloadNotice}</p>
              )}
              {demo && <p className="ps-demo-note">This is a demo. Downloads are disabled.</p>}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
