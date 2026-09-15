import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Download, Grid2X2, Heart, Image, Images, LoaderCircle, LockKeyhole, Move, Music2, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import { useDialogFocus } from '../components/useDialogFocus.js';
import '../styles/format-demos.css';
import './DeliveryViewer.css';

function accessHeaders(publicId) {
  const token = sessionStorage.getItem(`veylo_delivery_${publicId}`);
  return token ? { 'X-Delivery-Access': token } : {};
}

function DeliveryPhoto({ asset, alt = '', className = '', eager = false, sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 50vw', ...props }) {
  return (
    <img
      src={asset?.url || asset?.thumbnailUrl || ''}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
      className={`v-photo ${className}`.trim()}
      sizes={sizes}
      {...props}
    />
  );
}

function DeliveryHeader({ delivery, onGallery, light = false, audioState, toggleAudio }) {
  const brandName = delivery.branding?.name || 'Veylo';
  const formatLabels = {
    editorial: 'Editorial Page',
    'photo-reveal': 'Photo Reveal',
    canvas: 'Canvas',
    chapters: 'Chapters',
    album: 'Album',
    'photo-story': 'Photo Story'
  };
  const formatLabel = formatLabels[delivery.format] || 'Photo Delivery';

  return (
    <header className={`fd-header ${light ? 'is-light' : ''}`}>
      <div className="fd-header-brand">
        {delivery.branding?.logoUrl && (
          <img src={delivery.branding.logoUrl} alt="" className="fd-header-logo" />
        )}
        <span>{brandName}</span>
      </div>

      <div className="fd-header-title">
        <span>{formatLabel}</span>
        <strong>{delivery.clientName ? `${delivery.clientName} / ${delivery.title}` : delivery.title}</strong>
      </div>

      <div className="fd-header-actions">
        {delivery.soundtrack?.url && (
          <button
            type="button"
            className={`fd-header-audio-btn ${audioState.playing === 'soundtrack' ? 'is-active' : ''}`}
            onClick={() => toggleAudio('soundtrack')}
            aria-label={audioState.playing === 'soundtrack' ? 'Pause soundtrack' : 'Play soundtrack'}
          >
            {audioState.playing === 'soundtrack' ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span className="fd-audio-label">{audioState.playing === 'soundtrack' ? 'Sound on' : 'Sound off'}</span>
          </button>
        )}

        {delivery.narration?.url && (
          <button
            type="button"
            className={`fd-header-audio-btn ${audioState.playing === 'narration' ? 'is-active' : ''}`}
            onClick={() => toggleAudio('narration')}
            aria-label={audioState.playing === 'narration' ? 'Pause narration' : 'Play narration'}
          >
            <Volume2 size={16} />
            <span className="fd-audio-label">Narration</span>
          </button>
        )}

        {onGallery ? (
          <button className="fd-gallery-button" type="button" onClick={onGallery} aria-label="Open full gallery">
            <Images size={17} />
            <span>Full gallery</span>
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </header>
  );
}

function DeliveryGalleryModal({ delivery, onClose, initialIndex = null, liked, onLike, onDownload, onDownloadAll, busy }) {
  const [selected, setSelected] = useState(initialIndex);
  const panel = useRef(null);
  useDialogFocus(true, panel, onClose);

  useEffect(() => {
    const onKey = event => {
      if (selected === null) return;
      if (event.key === 'ArrowLeft') setSelected(value => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setSelected(value => Math.min(delivery.assets.length - 1, value + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [delivery.assets.length, selected]);

  const activeAsset = selected !== null ? delivery.assets[selected] : null;

  return (
    <motion.div className="fd-gallery-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section
        ref={panel}
        className="fd-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-gallery-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15 }}
        transition={{ type: 'spring', damping: 27, stiffness: 240 }}
      >
        <header>
          <div>
            <span>THE COMPLETE COLLECTION · {delivery.assets.length} PHOTOGRAPHS</span>
            <h2 id="fd-gallery-title">{delivery.title}</h2>
          </div>
          <div className="fd-gallery-head-actions">
            {delivery.access?.allowDownloadAll && (
              <button
                type="button"
                className="fd-download-all-btn"
                onClick={onDownloadAll}
                disabled={Boolean(busy)}
              >
                <Download size={15} />
                <span>{busy === 'all' ? 'Preparing…' : 'Download all'}</span>
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close gallery">
              <X size={20} />
            </button>
          </div>
        </header>

        {selected === null ? (
          <div className="fd-gallery-grid">
            {delivery.assets.map((asset, index) => (
              <figure key={asset.assetId}>
                <button type="button" onClick={() => setSelected(index)} aria-label={`Open photograph ${index + 1}`}>
                  <DeliveryPhoto asset={asset} alt={asset.originalFilename || `Photograph ${index + 1}`} sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 22vw" />
                </button>
                <figcaption>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div className="fd-gallery-actions">
                    {delivery.access?.allowLikes && (
                      <button
                        type="button"
                        onClick={() => onLike(asset.assetId)}
                        className={`fd-like-btn ${liked.has(asset.assetId) ? 'is-liked' : ''}`}
                        aria-label={liked.has(asset.assetId) ? 'Unlike' : 'Like'}
                      >
                        <Heart size={15} fill={liked.has(asset.assetId) ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    {delivery.access?.allowIndividualDownloads && (
                      <button
                        type="button"
                        onClick={() => onDownload(asset.assetId)}
                        disabled={busy === asset.assetId}
                        aria-label="Download photograph"
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="fd-lightbox">
            <AnimatePresence mode="wait">
              <motion.img
                key={activeAsset.assetId}
                src={activeAsset.url}
                alt={activeAsset.originalFilename || `Photograph ${selected + 1}`}
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              />
            </AnimatePresence>
            <div className="fd-lightbox-controls">
              <button
                type="button"
                onClick={() => setSelected(value => Math.max(0, value - 1))}
                disabled={selected === 0}
                aria-label="Previous photograph"
              >
                <ChevronLeft size={20} />
              </button>
              <button type="button" onClick={() => setSelected(null)}>
                Back to gallery
              </button>
              {delivery.access?.allowLikes && (
                <button
                  type="button"
                  onClick={() => onLike(activeAsset.assetId)}
                  className={`fd-like-btn ${liked.has(activeAsset.assetId) ? 'is-liked' : ''}`}
                >
                  <Heart size={16} fill={liked.has(activeAsset.assetId) ? 'currentColor' : 'none'} />
                </button>
              )}
              {delivery.access?.allowIndividualDownloads && (
                <button
                  type="button"
                  onClick={() => onDownload(activeAsset.assetId)}
                  disabled={busy === activeAsset.assetId}
                >
                  <Download size={15} />
                  <span>Download</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(value => Math.min(delivery.assets.length - 1, value + 1))}
                disabled={selected === delivery.assets.length - 1}
                aria-label="Next photograph"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}

function EditorialPhoto({ asset, frame, className = '', caption, sizes, direction = 1, horizontal = false }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], direction > 0 ? [-24, 24] : [24, -24]);
  const x = useTransform(scrollYProgress, [0, 1], direction > 0 ? [-18, 18] : [18, -18]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.07, 1.025, 1.07]);

  return (
    <motion.figure
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0.72, clipPath: horizontal ? 'inset(0 18% 0 0)' : 'inset(0 0 18% 0)' }}
      whileInView={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: reduced ? 0 : 0.95, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div className="fd-ed-photo-motion" style={reduced ? undefined : { y: horizontal ? 0 : y, x: horizontal ? x : 0, scale }}>
        <DeliveryPhoto asset={asset} alt={frame?.headline || ''} sizes={sizes} />
      </motion.div>
      {caption && <figcaption>{caption}</figcaption>}
    </motion.figure>
  );
}

function EditorialDelivery({ delivery, onGallery, audioState, toggleAudio }) {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const reveal = (delay = 0) => reduced ? {} : {
    initial: { opacity: 0, y: 34 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
    transition: { duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] }
  };

  const frames = useMemo(
    () => new Map((delivery.creativeDirection?.frames || []).map(frame => [frame.assetId, frame])),
    [delivery]
  );

  const assets = delivery.assets || [];
  const title = delivery.creativeDirection?.title || delivery.title || 'The Finished Collection';
  const openingLine = delivery.creativeDirection?.openingLine || 'Your finished photographs, curated and presented.';
  const closingLine = delivery.creativeDirection?.closingLine || 'Your complete finished collection is ready when you are.';

  const titleWords = title.split(' ');
  const titleLines = [];
  for (let i = 0; i < titleWords.length; i += 2) {
    titleLines.push(titleWords.slice(i, i + 2).join(' '));
  }
  if (!titleLines.length) titleLines.push(title);

  const coverAsset = assets[0];
  const secondAsset = assets[1] || coverAsset;
  const thirdAsset = assets[2] || secondAsset;
  const fourthAsset = assets[3] || thirdAsset;
  const lastAsset = assets[assets.length - 1] || coverAsset;

  const frame2 = frames.get(secondAsset?.assetId) || {};
  const frame3 = frames.get(thirdAsset?.assetId) || {};
  const frame4 = frames.get(fourthAsset?.assetId) || {};

  return (
    <div className="fd-page fd-editorial">
      <DeliveryHeader delivery={delivery} onGallery={onGallery} light audioState={audioState} toggleAudio={toggleAudio} />
      <motion.div className="fd-ed-scroll-progress" style={reduced ? undefined : { scaleX: scrollYProgress }} aria-hidden="true" />
      <main>
        <section className="fd-ed-cover">
          <div className="fd-ed-mast">
            <motion.span initial={reduced ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.15 }}>
              {delivery.branding?.name ? `${delivery.branding.name.toUpperCase()} EDITORIAL / 001` : 'VEYLO EDITORIAL / 001'}
            </motion.span>
            <strong>
              {titleLines.map((line, index) => (
                <motion.i key={line} initial={reduced ? false : { opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.72, delay: reduced ? 0 : 0.22 + index * 0.09, ease: [0.22, 1, 0.36, 1] }}>
                  {line}
                </motion.i>
              ))}
            </strong>
            <motion.p initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.62 }}>
              {openingLine}
            </motion.p>
          </div>

          <motion.figure initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', opacity: 0.4 }} animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }} transition={{ duration: reduced ? 0 : 1.15, delay: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}>
            <motion.div className="fd-ed-photo-motion" animate={reduced ? undefined : { scale: [1.015, 1.065], y: ['0%', '-1.6%'] }} transition={{ duration: 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
              <DeliveryPhoto asset={coverAsset} alt={frames.get(coverAsset?.assetId)?.headline || title} eager sizes="(max-width: 767px) 100vw, 62vw" />
            </motion.div>
          </motion.figure>

          <motion.span className="fd-ed-folio" initial={reduced ? false : { opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.72 }}>
            01
          </motion.span>
          <motion.i className="fd-ed-cover-rule" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : 1, delay: reduced ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }} aria-hidden="true" />
        </section>

        <section className="fd-ed-intro">
          <motion.span {...reveal()}>
            {delivery.shootType?.toUpperCase() || 'EDITORIAL PORTRAITS'} · {delivery.clientName?.toUpperCase() || 'COLLECTION'}
          </motion.span>
          <h1>
            <motion.i {...reveal(0.05)}>{titleLines[0] || title}.</motion.i>
            <motion.em {...reveal(0.12)}>{delivery.clientName ? `Completely ${delivery.clientName}.` : 'Curated for you.'}</motion.em>
          </h1>
          <motion.p {...reveal(0.18)}>{openingLine}</motion.p>
        </section>

        <section className="fd-ed-spread">
          <EditorialPhoto
            asset={secondAsset}
            frame={frame2}
            sizes="(max-width: 767px) 92vw, 48vw"
            caption={`02 / ${frame2.headline || 'A quiet, confident portrait.'}`}
            direction={-1}
          />
          <motion.div className="fd-ed-quote" {...reveal(0.08)}>
            <span>THE FEATURE</span>
            <blockquote>
              <motion.span {...reveal(0.12)}>“{frame2.headline || title}”</motion.span>
            </blockquote>
            <motion.p {...reveal(0.24)}>{frame2.caption || openingLine}</motion.p>
          </motion.div>
          <EditorialPhoto
            asset={thirdAsset}
            frame={frame3}
            className="fd-ed-tall"
            sizes="(max-width: 767px) 84vw, 35vw"
            caption={`03 / ${frame3.headline || 'Another side of the look.'}`}
            direction={1}
            horizontal
          />
        </section>

        <section className="fd-ed-number">
          <motion.span aria-hidden="true" initial={reduced ? false : { opacity: 0, x: 100 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: reduced ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}>
            04
          </motion.span>
          <EditorialPhoto asset={fourthAsset} frame={frame4} sizes="100vw" direction={-1} horizontal />
          <motion.div>
            <motion.small {...reveal()}>KEY MOMENT</motion.small>
            <h2>
              <motion.span {...reveal(0.08)}>{frame4.headline || 'Every look in full detail,'}</motion.span>
              <motion.span {...reveal(0.16)}>{frame4.caption || 'held with effortless poise.'}</motion.span>
            </h2>
          </motion.div>
        </section>

        <section className="fd-ed-close">
          <EditorialPhoto asset={lastAsset} frame={frames.get(lastAsset?.assetId)} sizes="(max-width: 767px) 88vw, 46vw" direction={1} />
          <div>
            <motion.span {...reveal()}>THE COMPLETE SESSION</motion.span>
            <h2>
              <motion.span {...reveal(0.08)}>Every finished portrait,</motion.span>
              <motion.em {...reveal(0.15)}>ready to explore.</motion.em>
            </h2>
            <motion.p {...reveal(0.21)}>{closingLine}</motion.p>
            <motion.button type="button" onClick={onGallery} {...reveal(0.27)}>
              View full gallery<Images size={17} />
            </motion.button>
          </div>
        </section>
      </main>
    </div>
  );
}

const revealMotions = [
  { initial: { clipPath: 'inset(0 50% 0 50%)', scale: 1.08, filter: 'blur(8px)' }, animate: { clipPath: 'inset(0 0% 0 0%)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'inset(50% 0 50% 0)', scale: 1.07, filter: 'blur(6px)' }, animate: { clipPath: 'inset(0% 0 0% 0)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'circle(0% at 50% 44%)', scale: 1.1, filter: 'blur(9px)' }, animate: { clipPath: 'circle(78% at 50% 44%)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'inset(100% 0 0 0)', scale: 1.06, filter: 'blur(5px)' }, animate: { clipPath: 'inset(0% 0 0 0)', scale: 1, filter: 'blur(0px)' } }
];

function RevealDelivery({ delivery, onGallery, audioState, toggleAudio }) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [uncovered, setUncovered] = useState(false);
  const reduced = useReducedMotion();
  const touchStart = useRef(null);

  const assets = delivery.assets || [];
  const frames = useMemo(
    () => new Map((delivery.creativeDirection?.frames || []).map(frame => [frame.assetId, frame])),
    [delivery]
  );

  const next = () => {
    setUncovered(false);
    if (index === assets.length - 1) setFinished(true);
    else setIndex(value => value + 1);
  };

  const previous = () => {
    setUncovered(false);
    if (finished) setFinished(false);
    else setIndex(value => Math.max(0, value - 1));
  };

  const beginReveal = () => {
    setStarted(true);
    if (delivery.soundtrack?.url && !audioState.playing) {
      toggleAudio('soundtrack');
    }
  };

  const restart = () => {
    setStarted(false);
    setFinished(false);
    setIndex(0);
    setUncovered(false);
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
    const onKey = event => {
      if (!started || !uncovered) return;
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        next();
      }
      if (event.key === 'ArrowLeft') previous();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const activeAsset = assets[index] || assets[0];
  const activeFrame = frames.get(activeAsset?.assetId) || {};
  const motionEffect = revealMotions[index % revealMotions.length];

  return (
    <div
      className="fd-page fd-reveal"
      onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }}
      onTouchEnd={event => {
        if (touchStart.current === null || !started || finished || !uncovered) return;
        const distance = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(distance) > 45) distance < 0 ? next() : previous();
      }}
    >
      <DeliveryHeader delivery={delivery} onGallery={onGallery} audioState={audioState} toggleAudio={toggleAudio} />

      {!started ? (
        <main className="fd-reveal-opening">
          <motion.div className="fd-reveal-opening-photo" initial={reduced ? false : { scale: 1.14 }} animate={{ scale: 1.08 }} transition={{ duration: reduced ? 0 : 7, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
            <DeliveryPhoto asset={assets[0]} alt="" eager />
          </motion.div>
          <div className="fd-reveal-opening-shade" />
          <motion.div className="fd-reveal-opening-mark" initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : 0.8 }} aria-hidden="true">
            <span>PRIVATE REVEAL</span>
            <i />
          </motion.div>
          <motion.div className="fd-reveal-opening-copy" initial={reduced ? false : { opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.2 }}>
            <span>{delivery.branding?.name ? `${delivery.branding.name.toUpperCase()} / STUDIO` : 'PRIVATE DELIVERY'}</span>
            <h1>
              {delivery.clientName ? `${delivery.clientName},` : 'Hello,'}
              <br />your photographs
              <br />are ready.
            </h1>
            <p>
              There are {assets.length} finished {assets.length === 1 ? 'portrait' : 'portraits'} waiting. Reveal each one when you are ready.
            </p>
            <button type="button" onClick={beginReveal}>
              Begin reveal<ChevronRight size={18} />
            </button>
          </motion.div>
        </main>
      ) : (
        <main className="fd-reveal-stage">
          {!finished ? (
            <div className="fd-reveal-room">
              <div className="fd-reveal-frame-shell">
                <motion.div className="fd-reveal-waiting" key={`waiting-${index}`} initial={{ opacity: 0 }} animate={{ opacity: uncovered ? 0 : 1 }} transition={{ duration: reduced ? 0 : 0.25 }} aria-hidden={uncovered}>
                  <span>PORTRAIT</span>
                  <strong>{String(index + 1).padStart(2, '0')}</strong>
                  <i>OPENING</i>
                </motion.div>
                <AnimatePresence mode="wait">
                  {uncovered && (
                    <motion.figure
                      className={`fd-reveal-portrait is-effect-${(index % 4) + 1}`}
                      key={activeAsset.assetId}
                      initial={reduced ? false : { opacity: 0.35, ...motionEffect.initial }}
                      animate={{ opacity: 1, ...motionEffect.animate }}
                      exit={{ opacity: 0, scale: 0.985 }}
                      transition={{ duration: reduced ? 0 : 1.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], x: index % 2 ? ['0%', '-.7%'] : ['-.7%', '.7%'] }} transition={{ duration: 11, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                        <DeliveryPhoto asset={activeAsset} alt={activeFrame.headline || ''} eager sizes="(max-width: 767px) 100vw, 72vw" />
                      </motion.div>
                      <motion.i className="fd-reveal-light" initial={reduced ? false : { x: '-130%', opacity: 0 }} animate={{ x: '180%', opacity: [0, 0.8, 0] }} transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : 0.2, ease: 'easeInOut' }} />
                    </motion.figure>
                  )}
                </AnimatePresence>
                <div className="fd-reveal-frame-lines" aria-hidden="true">
                  <i /><i /><i /><i />
                </div>
              </div>

              <aside className="fd-reveal-details">
                <div className="fd-reveal-position">
                  <span>PORTRAIT {String(index + 1).padStart(2, '0')}</span>
                  <i />
                  <span>{String(assets.length).padStart(2, '0')}</span>
                </div>
                <AnimatePresence mode="wait">
                  {uncovered && (
                    <motion.div className="fd-reveal-caption" key={`caption-${index}`} initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.65, delay: reduced ? 0 : 0.82 }}>
                      {activeFrame.headline && (
                        <motion.span initial={reduced ? false : { letterSpacing: '.35em', opacity: 0 }} animate={{ letterSpacing: '.18em', opacity: 1 }} transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.9 }}>
                          {activeFrame.headline}
                        </motion.span>
                      )}
                      <p>{activeFrame.caption || delivery.creativeDirection?.openingLine || 'Crafted and delivered.'}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="fd-reveal-controls">
                  <button type="button" onClick={previous} disabled={index === 0 || !uncovered} aria-label="Previous portrait">
                    <ChevronLeft size={18} />
                  </button>
                  <button className="fd-reveal-next" type="button" onClick={next} disabled={!uncovered}>
                    {index === assets.length - 1 ? 'Complete reveal' : 'Reveal next portrait'}
                    <ChevronRight size={18} />
                  </button>
                </div>
              </aside>
            </div>
          ) : (
            <motion.section className="fd-reveal-finale" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="fd-reveal-finale-grid">
                {assets.slice(0, 4).map((photo, photoIndex) => (
                  <motion.figure key={photo.assetId} initial={reduced ? false : { opacity: 0, y: 34, rotate: (photoIndex - 1.5) * 3 }} animate={{ opacity: 1, y: 0, rotate: (photoIndex - 1.5) * 1.5 }} transition={{ delay: reduced ? 0 : photoIndex * 0.08 }}>
                    <DeliveryPhoto asset={photo} alt="" />
                  </motion.figure>
                ))}
              </div>
              <div className="fd-reveal-finale-copy">
                <span>{delivery.clientName ? `${delivery.clientName.toUpperCase()} / ` : ''}ALL {assets.length} REVEALED</span>
                <h1>These portraits<br />are yours.</h1>
                <p>{delivery.creativeDirection?.closingLine || 'Your complete finished session is ready to view and download.'}</p>
                <div>
                  <button type="button" onClick={onGallery}>
                    View full gallery<Images size={17} />
                  </button>
                  <button type="button" onClick={restart}>
                    <RotateCcw size={16} />Start again
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </main>
      )}

      {started && delivery.soundtrack?.url && (
        <button
          className="fd-reveal-sound"
          type="button"
          onClick={() => toggleAudio('soundtrack')}
          aria-label={audioState.playing === 'soundtrack' ? 'Mute soundtrack' : 'Turn soundtrack on'}
        >
          {audioState.playing === 'soundtrack' ? <Volume2 size={17} /> : <VolumeX size={17} />}
          <span>{audioState.playing === 'soundtrack' ? 'Sound on' : 'Sound off'}</span>
        </button>
      )}
    </div>
  );
}

function CanvasFocus({ assets, frames, index, onSelect, onClose, reduced, clientName }) {
  const panel = useRef(null);
  useDialogFocus(true, panel, onClose);

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'ArrowLeft' && index > 0) onSelect(index - 1);
      if (event.key === 'ArrowRight' && index < assets.length - 1) onSelect(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onSelect, assets.length]);

  const activeAsset = assets[index];
  const activeFrame = frames.get(activeAsset?.assetId) || {};

  return (
    <motion.div className="fd-canvas-focus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Photograph ${index + 1} of ${clientName || 'the collection'}`}
        tabIndex={-1}
        initial={reduced ? false : { opacity: 0, scale: 0.975 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.985 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
      >
        <button className="fd-canvas-focus-close" type="button" onClick={onClose} aria-label="Return to canvas">
          <X size={19} />
        </button>
        <div className="fd-canvas-focus-neighbours" aria-hidden="true">
          {index > 0 && (
            <motion.div initial={reduced ? false : { opacity: 0, x: -30 }} animate={{ opacity: 0.2, x: 0 }}>
              <DeliveryPhoto asset={assets[index - 1]} alt="" />
            </motion.div>
          )}
          {index < assets.length - 1 && (
            <motion.div initial={reduced ? false : { opacity: 0, x: 30 }} animate={{ opacity: 0.2, x: 0 }}>
              <DeliveryPhoto asset={assets[index + 1]} alt="" />
            </motion.div>
          )}
        </div>
        <motion.figure layoutId={`canvas-photo-${index}`} transition={{ type: 'spring', damping: 29, stiffness: 210 }}>
          <DeliveryPhoto asset={activeAsset} alt={activeFrame.headline || ''} eager sizes="(max-width: 767px) 96vw, 66vw" />
        </motion.figure>
        <motion.div className="fd-canvas-focus-copy" key={index} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : 0.25 }}>
          <span>{clientName ? `${clientName.toUpperCase()} / ` : ''}PORTRAIT {String(index + 1).padStart(2, '0')}</span>
          <p>{activeFrame.caption || activeFrame.headline || 'A dedicated frame in the spatial canvas.'}</p>
          <div>
            <button type="button" onClick={() => onSelect(index - 1)} disabled={index === 0}>
              <ChevronLeft size={17} />Previous
            </button>
            <button type="button" onClick={() => onSelect(index + 1)} disabled={index === assets.length - 1}>
              Next<ChevronRight size={17} />
            </button>
          </div>
        </motion.div>
      </motion.section>
    </motion.div>
  );
}

const canvasCardPositions = [
  { className: 'is-card-1' },
  { className: 'is-card-2' },
  { className: 'is-card-3' },
  { className: 'is-card-4' },
  { className: 'is-card-5' },
  { className: 'is-card-6' }
];

function CanvasDelivery({ delivery, onGallery, audioState, toggleAudio }) {
  const [selected, setSelected] = useState(null);
  const [activeCluster, setActiveCluster] = useState(null);
  const wall = useRef(null);
  const touchStart = useRef(null);
  const reduced = useReducedMotion();

  const assets = delivery.assets || [];
  const frames = useMemo(
    () => new Map((delivery.creativeDirection?.frames || []).map(frame => [frame.assetId, frame])),
    [delivery]
  );

  const clusters = useMemo(() => {
    const sections = delivery.creativeDirection?.sections;
    if (sections && sections.length > 0) {
      return sections.map(section => ({
        name: section.title,
        note: section.subtitle || 'A distinct movement within the collection.',
        photos: section.assetIds.map(id => assets.findIndex(a => a.assetId === id)).filter(idx => idx >= 0)
      }));
    }
    const chunk = Math.ceil(assets.length / 3);
    return [
      { name: 'Portraits', note: 'The opening presence and character of the shoot.', photos: Array.from({ length: Math.min(chunk, assets.length) }, (_, i) => i) },
      { name: 'The Essence', note: 'The core portraits that hold what this day means.', photos: Array.from({ length: Math.min(chunk, Math.max(0, assets.length - chunk)) }, (_, i) => i + chunk) },
      { name: 'Celebration', note: 'The joy and unposed moments saved for the road ahead.', photos: Array.from({ length: Math.max(0, assets.length - chunk * 2) }, (_, i) => i + chunk * 2) }
    ].filter(item => item.photos.length > 0);
  }, [delivery, assets]);

  const cluster = activeCluster === null ? null : clusters[activeCluster];

  const moveDepth = event => {
    if (reduced || event.pointerType !== 'mouse' || !wall.current) return;
    const bounds = wall.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 13;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 10;
    wall.current.querySelectorAll('.fd-wall-depth').forEach((node, index) => {
      const depth = 0.35 + (index % 3) * 0.22;
      node.style.transform = `translate3d(${x * depth}px, ${y * depth}px, 0)`;
    });
  };

  const resetDepth = () => {
    wall.current?.querySelectorAll('.fd-wall-depth').forEach(node => {
      node.style.transform = 'translate3d(0,0,0)';
    });
  };

  const moveCluster = direction => {
    if (activeCluster === null) setActiveCluster(direction > 0 ? 0 : clusters.length - 1);
    else setActiveCluster(value => Math.max(0, Math.min(clusters.length - 1, value + direction)));
  };

  return (
    <div className="fd-page fd-canvas">
      <DeliveryHeader delivery={delivery} onGallery={onGallery} audioState={audioState} toggleAudio={toggleAudio} />
      <main className="fd-wall-shell">
        <header className="fd-wall-intro">
          <div>
            <span>{delivery.clientName?.toUpperCase() || 'COLLECTION'} · CANVAS</span>
            <strong>{cluster ? cluster.name : 'The complete canvas'}</strong>
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={cluster?.name || 'overview'} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.35 }}>
              {cluster ? cluster.note : 'Every finished portrait is here. Choose a group, or open any photograph.'}
            </motion.p>
          </AnimatePresence>
          {activeCluster !== null && (
            <button type="button" onClick={() => setActiveCluster(null)}>
              <Grid2X2 size={15} />See the whole canvas
            </button>
          )}
        </header>

        <section
          className="fd-wall-stage"
          onPointerMove={moveDepth}
          onPointerLeave={resetDepth}
          onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }}
          onTouchEnd={event => {
            if (touchStart.current === null) return;
            const distance = event.changedTouches[0].clientX - touchStart.current;
            touchStart.current = null;
            if (Math.abs(distance) > 48) moveCluster(distance < 0 ? 1 : -1);
          }}
        >
          <div ref={wall} className={`fd-wall ${activeCluster === null ? 'is-overview' : 'is-focus'}`}>
            <div className="fd-wall-grid" aria-hidden="true" />
            <div className="fd-wall-glow" aria-hidden="true">
              <i /><i />
            </div>
            <svg className="fd-wall-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M 17 30 C 28 8, 45 12, 54 34 S 75 60, 91 28" />
              <path d="M 12 72 C 31 58, 38 88, 56 75 S 77 72, 91 84" />
            </svg>
            <motion.div className="fd-wall-title" initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: activeCluster === null ? 1 : 0.18, y: 0 }}>
              <span>A SPATIAL PORTRAIT STUDY</span>
              <strong>{delivery.clientName || 'The Shoots'},<br />all in view.</strong>
            </motion.div>

            {assets.slice(0, 12).map((asset, index) => {
              const clusterIndex = clusters.findIndex(item => item.photos.includes(index));
              const place = clusterIndex >= 0 ? clusters[clusterIndex].photos.indexOf(index) : 0;
              const inCluster = activeCluster === clusterIndex;
              const dimmed = activeCluster !== null && !inCluster;
              const cardClass = canvasCardPositions[index % canvasCardPositions.length].className;

              return (
                <motion.button
                  layout
                  layoutId={`canvas-photo-${index}`}
                  type="button"
                  key={asset.assetId}
                  className={`fd-wall-card ${cardClass}${inCluster ? ` is-in-cluster is-place-${place + 1}` : ''}${dimmed ? ' is-dimmed' : ''}`}
                  onClick={() => setSelected(index)}
                  initial={reduced ? false : { opacity: 0, scale: 0.86 }}
                  animate={{ opacity: dimmed ? 0.16 : 1, scale: dimmed ? 0.88 : 1 }}
                  whileHover={reduced ? undefined : { scale: 1.025, y: -6 }}
                  transition={{ layout: { type: 'spring', damping: 28, stiffness: 190 }, opacity: { duration: reduced ? 0 : 0.35 }, delay: reduced ? 0 : index * 0.055 }}
                  aria-label={`Open photograph ${index + 1}`}
                >
                  <div className="fd-wall-depth">
                    <motion.span animate={reduced ? undefined : { scale: [1.01, 1.05], x: index % 2 ? ['0%', '-1.2%'] : ['-1%', '1%'] }} transition={{ duration: 9 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                      <DeliveryPhoto asset={asset} alt="" eager={index < 3} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 34vw, 25vw" />
                    </motion.span>
                    <i>{String(index + 1).padStart(2, '0')}</i>
                  </div>
                </motion.button>
              );
            })}

            <AnimatePresence>
              {cluster && (
                <motion.div className="fd-wall-focus-label" key={cluster.name} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: reduced ? 0 : 0.28 }}>
                  <span>0{activeCluster + 1} / 0{clusters.length}</span>
                  <strong>{cluster.name}</strong>
                  <p>{cluster.note}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <footer className="fd-wall-controls">
          <span>Choose a group</span>
          <nav aria-label="Canvas groups">
            {clusters.map((item, index) => (
              <button
                type="button"
                key={item.name}
                className={activeCluster === index ? 'is-active' : ''}
                onClick={() => setActiveCluster(index)}
              >
                <i>0{index + 1}</i>
                <strong>{item.name}</strong>
              </button>
            ))}
          </nav>
          <div className="fd-wall-arrows">
            <button type="button" onClick={() => moveCluster(-1)} disabled={activeCluster === 0} aria-label="Previous group">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => moveCluster(1)} disabled={activeCluster === clusters.length - 1} aria-label="Next group">
              <ChevronRight size={18} />
            </button>
          </div>
        </footer>
      </main>

      <AnimatePresence>
        {selected !== null && (
          <CanvasFocus
            assets={assets}
            frames={frames}
            index={selected}
            onSelect={setSelected}
            onClose={() => setSelected(null)}
            reduced={reduced}
            clientName={delivery.clientName}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ChaptersDelivery({ delivery, onGallery, audioState, toggleAudio }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [visited, setVisited] = useState([]);
  const reduced = useReducedMotion();

  const assets = delivery.assets || [];
  const frames = useMemo(
    () => new Map((delivery.creativeDirection?.frames || []).map(frame => [frame.assetId, frame])),
    [delivery]
  );

  const accents = ['#d7a86e', '#c89057', '#e0b989', '#cca578', '#dfb88e'];

  const chaptersData = useMemo(() => {
    const sections = delivery.creativeDirection?.sections;
    if (sections && sections.length > 0) {
      return sections.map((section, idx) => ({
        name: section.title,
        kicker: `CHAPTER 0${idx + 1}`,
        line: section.subtitle || 'A deliberate movement in this shoot.',
        note: section.subtitle || delivery.creativeDirection?.openingLine || 'Explore every frame.',
        accent: accents[idx % accents.length],
        photos: section.assetIds.map(id => assets.find(a => a.assetId === id)).filter(Boolean)
      })).filter(ch => ch.photos.length > 0);
    }
    const chunk = Math.ceil(assets.length / 3);
    return [
      {
        name: 'The Opening',
        kicker: 'THE OPENING PORTRAITS',
        line: 'The very first frames of the session.',
        note: delivery.creativeDirection?.openingLine || 'Where this shoot began.',
        accent: accents[0],
        photos: assets.slice(0, Math.min(chunk, assets.length))
      },
      {
        name: 'In the Flow',
        kicker: 'BETWEEN THE POSES',
        line: 'The smiles and authentic energy found between frames.',
        note: 'Some of the most honest portraits in the entire set.',
        accent: accents[1],
        photos: assets.slice(chunk, Math.min(chunk * 2, assets.length))
      },
      {
        name: 'Closing Moments',
        kicker: 'SAVED FOR THE END',
        line: 'The quiet frames saved for the final chapter.',
        note: delivery.creativeDirection?.closingLine || 'The right way to complete the collection.',
        accent: accents[2],
        photos: assets.slice(chunk * 2)
      }
    ].filter(ch => ch.photos.length > 0);
  }, [delivery, assets]);

  const openChapter = index => {
    setVisited(value => (value.includes(index) ? value : [...value, index]));
    setOpenIndex(index);
  };

  const openChapterData = openIndex !== null ? chaptersData[openIndex] : null;

  return (
    <div className="fd-page fd-chapters">
      <DeliveryHeader delivery={delivery} onGallery={onGallery} audioState={audioState} toggleAudio={toggleAudio} />

      <AnimatePresence mode="wait">
        {openChapterData === null ? (
          <motion.main key="chapter-directory" className="fd-chapter-directory" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <header>
              <div>
                <span>{delivery.branding?.name ? `${delivery.branding.name.toUpperCase()} / ` : ''}FOR {delivery.clientName?.toUpperCase() || 'CLIENT'}</span>
                <h1>
                  {delivery.clientName ? `${delivery.clientName},` : 'Welcome,'}
                  <br />where would you like to begin?
                </h1>
              </div>
              <p>{delivery.creativeDirection?.openingLine || `We arranged your ${assets.length} finished photographs into ${chaptersData.length} chapters. Open whichever one you want first.`}</p>
              <div>
                <strong>0{chaptersData.length}</strong>
                <span>CHAPTERS</span>
                <strong>{String(assets.length).padStart(2, '0')}</strong>
                <span>PORTRAITS</span>
              </div>
            </header>

            <section className="fd-chapter-directory-board" aria-label="Photo chapters">
              {chaptersData.map((item, index) => (
                <motion.button
                  type="button"
                  key={item.name}
                  className={`is-card-${(index % 3) + 1}${visited.includes(index) ? ' is-visited' : ''}`}
                  onClick={() => openChapter(index)}
                  initial={reduced ? false : { opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.65, delay: reduced ? 0 : 0.12 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={reduced ? undefined : { y: -5 }}
                  whileTap={reduced ? undefined : { scale: 0.985 }}
                >
                  <motion.span className="fd-chapter-directory-photo" animate={reduced ? undefined : { scale: [1.01, 1.055], x: index % 2 ? ['0%', '-1%'] : ['-1%', '1%'] }} transition={{ duration: 9 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                    <DeliveryPhoto asset={item.photos[0]} alt={`${item.name} chapter cover`} eager={index === 0} sizes="(max-width: 767px) 64vw, 34vw" />
                  </motion.span>
                  <span className="fd-chapter-directory-shade" />
                  <span className="fd-chapter-directory-number">0{index + 1}</span>
                  <span className="fd-chapter-directory-copy">
                    <i>{item.photos.length} {item.photos.length === 1 ? 'portrait' : 'portraits'}</i>
                    <strong>{item.name}</strong>
                    <p>{item.line}</p>
                    <b>Open chapter<ChevronRight size={15} /></b>
                  </span>
                  {visited.includes(index) && (
                    <span className="fd-chapter-directory-viewed"><Check size={12} />Viewed</span>
                  )}
                </motion.button>
              ))}
            </section>

            <footer>
              <span>Take your time. You can return here or open your complete gallery whenever you want.</span>
              <button type="button" onClick={onGallery}>
                View all {assets.length} portraits<Images size={16} />
              </button>
            </footer>
          </motion.main>
        ) : (
          <motion.main key={`chapter-room-${openIndex}`} className="fd-chapter-room" style={{ '--chapter-accent': openChapterData.accent }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <aside className="fd-chapter-room-copy">
              <button type="button" onClick={() => setOpenIndex(null)}>
                <ArrowLeft size={16} />All chapters
              </button>
              <span>{openChapterData.kicker}</span>
              <div className="fd-chapter-room-count">0{openIndex + 1} / 0{chaptersData.length}</div>
              <h1>{openChapterData.name}</h1>
              <p>{openChapterData.note}</p>
              <nav aria-label="Other chapters">
                {chaptersData.map((item, index) => (
                  <button
                    type="button"
                    key={item.name}
                    className={openIndex === index ? 'is-active' : ''}
                    onClick={() => openChapter(index)}
                  >
                    <i>0{index + 1}</i>
                    {item.name}
                    {visited.includes(index) && <Check size={12} />}
                  </button>
                ))}
              </nav>
            </aside>

            <section className={`fd-chapter-room-art ${openChapterData.photos.length === 1 ? 'is-single' : 'is-pair'}`}>
              <span className="fd-chapter-room-number" aria-hidden="true">0{openIndex + 1}</span>
              <div className="fd-chapter-room-photos">
                {openChapterData.photos.map((photo, index) => {
                  const frame = frames.get(photo.assetId) || {};
                  return (
                    <motion.button
                      type="button"
                      key={photo.assetId}
                      onClick={onGallery}
                      initial={reduced ? false : { opacity: 0, y: 38, clipPath: 'inset(0 0 14% 0)' }}
                      animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
                      transition={{ duration: reduced ? 0 : 0.78, delay: reduced ? 0 : 0.14 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                      aria-label={frame.headline || `Photograph ${index + 1}`}
                    >
                      <motion.div animate={reduced ? undefined : { scale: [1.015, 1.06], x: index % 2 ? ['0%', '-1%'] : ['-1%', '1%'] }} transition={{ duration: 10 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                        <DeliveryPhoto asset={photo} alt={frame.headline || ''} eager sizes="(max-width: 767px) 92vw, 48vw" />
                      </motion.div>
                      <span>0{index + 1}</span>
                      <p>{frame.caption || frame.headline || 'Finished delivery frame.'}</p>
                    </motion.button>
                  );
                })}
              </div>

              <footer>
                <button type="button" onClick={() => setOpenIndex(null)}>
                  All chapters<Grid2X2 size={17} />
                </button>
                <button type="button" onClick={onGallery}>
                  View full gallery<Images size={17} />
                </button>
              </footer>
            </section>
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}

function AlbumDelivery({ delivery, onGallery, audioState, toggleAudio }) {
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const touchStart = useRef(null);
  const reduced = useReducedMotion();

  const assets = delivery.assets || [];
  const frames = useMemo(
    () => new Map((delivery.creativeDirection?.frames || []).map(frame => [frame.assetId, frame])),
    [delivery]
  );

  const spreads = useMemo(() => {
    const list = [];
    for (let i = 0; i < assets.length; i += 2) {
      list.push(assets.slice(i, i + 2));
    }
    return list.length ? list : [[assets[0]]];
  }, [assets]);

  const openAlbum = () => {
    setStarted(true);
    setPage(0);
    if (delivery.soundtrack?.url && !audioState.playing) {
      toggleAudio('soundtrack');
    }
  };

  const next = () => {
    if (page >= spreads.length - 1) return;
    setDirection(1);
    setPage(value => value + 1);
  };

  const previous = () => {
    if (page === 0) {
      setStarted(false);
      return;
    }
    setDirection(-1);
    setPage(value => value - 1);
  };

  useEffect(() => {
    const onKey = event => {
      if (!started) return;
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const currentSpread = spreads[page] || [];

  return (
    <div className="fd-page fd-album">
      <DeliveryHeader delivery={delivery} onGallery={onGallery} audioState={audioState} toggleAudio={toggleAudio} />

      {!started ? (
        <main className="fd-album-cover">
          <motion.figure initial={reduced ? false : { scale: 1.01 }} animate={{ scale: reduced ? 1 : 1.035 }} transition={{ duration: reduced ? 0 : 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
            <DeliveryPhoto asset={assets[0]} alt="" eager sizes="100vw" />
          </motion.figure>
          <div className="fd-album-cover-shade" />
          <motion.section initial={reduced ? false : { y: 24 }} animate={{ y: 0 }} transition={{ duration: reduced ? 0 : 0.8, delay: reduced ? 0 : 0.18 }}>
            <span>{delivery.branding?.name ? `${delivery.branding.name.toUpperCase()} PRESENTS` : 'VEYLO MEDIA PRESENTS'}</span>
            <h1>
              {delivery.clientName || 'The Collection'}
              <br />
              <em>{delivery.creativeDirection?.title || 'Album'}</em>
            </h1>
            <p>{assets.length} finished photographs, arranged one page at a time.</p>
            <button type="button" onClick={openAlbum}>
              Open album<BookOpen size={18} />
            </button>
          </motion.section>
          <div className="fd-album-cover-folio">
            <span>{delivery.shootType?.toUpperCase() || 'PHOTO ALBUM'}</span>
            <b>{new Date().getFullYear()}</b>
          </div>
        </main>
      ) : (
        <main
          className="fd-album-reader"
          aria-live="polite"
          onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }}
          onTouchEnd={event => {
            if (touchStart.current === null) return;
            const distance = event.changedTouches[0].clientX - touchStart.current;
            touchStart.current = null;
            if (Math.abs(distance) > 45) distance < 0 ? next() : previous();
          }}
        >
          <div className="fd-album-reader-head">
            <span>{delivery.clientName?.toUpperCase() || 'ALBUM'}</span>
            <div>
              <i>{String(page + 1).padStart(2, '0')}</i>
              <b>/</b>
              <i>{String(spreads.length).padStart(2, '0')}</i>
            </div>
            <span>{delivery.title}</span>
          </div>

          <div className="fd-album-stage">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`spread-${page}`}
                custom={direction}
                initial={reduced ? false : { opacity: 0.58, x: direction > 0 ? 38 : -38, clipPath: direction > 0 ? 'inset(0 0 0 7%)' : 'inset(0 7% 0 0)' }}
                animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)' }}
                exit={reduced ? undefined : { opacity: 0, x: direction > 0 ? -26 : 26, clipPath: direction > 0 ? 'inset(0 7% 0 0)' : 'inset(0 0 0 7%)' }}
                transition={{ duration: reduced ? 0 : 0.68, ease: [0.22, 1, 0.36, 1] }}
              >
                {page === 0 ? (
                  <section className="fd-album-spread is-opening">
                    <figure>
                      <motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], x: ['0%', '-.8%'] }} transition={{ duration: 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                        <DeliveryPhoto asset={currentSpread[0]} alt="" eager sizes="(max-width: 767px) 100vw, 50vw" />
                      </motion.div>
                    </figure>
                    <article>
                      <span>THE OPENING SPREAD</span>
                      <h1>{delivery.creativeDirection?.title || delivery.title}</h1>
                      <p>{delivery.creativeDirection?.openingLine || 'The opening moments of the collection, set with quiet care.'}</p>
                      <small>{delivery.clientName?.toUpperCase() || 'CLIENT'} · {new Date().getFullYear()}</small>
                    </article>
                    <i className="fd-album-spine" aria-hidden="true" />
                  </section>
                ) : page === spreads.length - 1 ? (
                  <section className="fd-album-spread is-finale">
                    <figure className="is-family">
                      <motion.div animate={reduced ? undefined : { scale: [1.01, 1.05], x: ['-.6%', '.6%'] }} transition={{ duration: 10.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                        <DeliveryPhoto asset={currentSpread[0]} alt="" eager sizes="(max-width: 767px) 100vw, 50vw" />
                      </motion.div>
                    </figure>
                    <article>
                      {currentSpread[1] && (
                        <figure className="is-mother">
                          <motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], y: ['0%', '-.7%'] }} transition={{ duration: 9.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                            <DeliveryPhoto asset={currentSpread[1]} alt="" eager sizes="(max-width: 767px) 100vw, 34vw" />
                          </motion.div>
                        </figure>
                      )}
                      <div>
                        <span>FINAL SPREAD</span>
                        <h1>{frames.get(currentSpread[0]?.assetId)?.headline || 'Saved for the end.'}</h1>
                        <p>{delivery.creativeDirection?.closingLine || 'Your complete album collection is ready whenever you want to see every finished portrait.'}</p>
                        <button type="button" onClick={onGallery}>
                          View full gallery<Images size={17} />
                        </button>
                      </div>
                    </article>
                    <i className="fd-album-spine" aria-hidden="true" />
                  </section>
                ) : (
                  <section className="fd-album-spread is-wide">
                    <motion.figure animate={reduced ? undefined : { scale: [1.005, 1.035] }} transition={{ duration: 11, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}>
                      <DeliveryPhoto asset={currentSpread[0]} alt="" eager sizes="100vw" />
                    </motion.figure>
                    <div>
                      <span>SPREAD {String(page + 1).padStart(2, '0')}</span>
                      <h1>{frames.get(currentSpread[0]?.assetId)?.headline || 'Every portrait held with care.'}</h1>
                      <p>{frames.get(currentSpread[0]?.assetId)?.caption || 'Crafted for the page.'}</p>
                    </div>
                  </section>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="fd-album-controls">
            <button type="button" onClick={previous}>
              <ChevronLeft size={18} />
              <span>{page === 0 ? 'Back to cover' : 'Previous page'}</span>
            </button>
            <div>
              {spreads.map((_, index) => (
                <button
                  type="button"
                  key={`dot-${index}`}
                  className={page === index ? 'is-active' : ''}
                  onClick={() => {
                    setDirection(index > page ? 1 : -1);
                    setPage(index);
                  }}
                  aria-label={`Open album page ${index + 1}`}
                >
                  <i />
                </button>
              ))}
            </div>
            <button type="button" onClick={next} disabled={page === spreads.length - 1}>
              <span>Next page</span>
              <ChevronRight size={18} />
            </button>
          </footer>
        </main>
      )}

      {started && delivery.soundtrack?.url && (
        <button
          className="fd-album-sound"
          type="button"
          onClick={() => toggleAudio('soundtrack')}
          aria-label={audioState.playing === 'soundtrack' ? 'Mute album soundtrack' : 'Turn album soundtrack on'}
        >
          {audioState.playing === 'soundtrack' ? <Volume2 size={17} /> : <VolumeX size={17} />}
          <span>{audioState.playing === 'soundtrack' ? 'Sound on' : 'Sound off'}</span>
        </button>
      )}
    </div>
  );
}

function StoryDelivery({ delivery, onGallery, audioState, toggleAudio }) {
  const reduced = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const assets = delivery.assets || [];
  const frames = delivery.creativeDirection?.frames || [];
  const frameMap = useMemo(() => new Map(frames.map(item => [item.assetId, item])), [frames]);

  useEffect(() => {
    if (!started || paused || reduced) return undefined;
    const duration = (frames[index]?.duration || 5) * 1000;
    const timer = setTimeout(() => {
      if (index < assets.length - 1) {
        setIndex(value => value + 1);
      } else {
        onGallery();
      }
    }, duration);
    return () => clearTimeout(timer);
  }, [assets.length, frames, index, onGallery, paused, reduced, started]);

  const beginStory = () => {
    setStarted(true);
    if (delivery.soundtrack?.url && !audioState.playing) {
      toggleAudio('soundtrack');
    }
  };

  if (!started) {
    return (
      <div className="vd-viewer vd-photo-story">
        <DeliveryHeader delivery={delivery} onGallery={onGallery} audioState={audioState} toggleAudio={toggleAudio} />
        <button className="vd-story-intro" type="button" onClick={beginStory}>
          <DeliveryPhoto asset={assets[0]} eager />
          <i />
          <div>
            <span>{delivery.clientName}</span>
            <h1>{delivery.creativeDirection?.title || delivery.title}</h1>
            <p>{delivery.creativeDirection?.openingLine}</p>
            <b><Play size={18} />Begin Photo Story</b>
          </div>
        </button>
      </div>
    );
  }

  const asset = assets[index] || assets[0];
  const frame = frameMap.get(asset?.assetId) || frames[index] || {};

  return (
    <div className="vd-viewer vd-photo-story">
      <DeliveryHeader delivery={delivery} onGallery={onGallery} audioState={audioState} toggleAudio={toggleAudio} />
      <main className="vd-story-stage">
        <AnimatePresence mode="wait">
          <motion.div
            className="vd-story-frame"
            key={asset.assetId}
            initial={reduced ? false : { opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.82 }}
          >
            <DeliveryPhoto asset={asset} eager />
            <i />
            <div>
              {frame.headline && <small>{frame.headline}</small>}
              <p>{frame.caption || delivery.creativeDirection?.openingLine}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="vd-story-progress">
          {assets.map((_, itemIndex) => (
            <i key={itemIndex} className={itemIndex <= index ? 'is-active' : ''} />
          ))}
        </div>

        <footer>
          <button onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={index === 0} aria-label="Previous frame">
            <ChevronLeft />
          </button>
          <button onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume' : 'Pause'}>
            {paused ? <Play /> : <Pause />}
          </button>
          <button onClick={() => (index === assets.length - 1 ? onGallery() : setIndex(value => value + 1))} aria-label="Next frame">
            {index === assets.length - 1 ? <Images size={18} /> : <ChevronRight />}
          </button>
        </footer>
      </main>
    </div>
  );
}

export default function DeliveryViewer() {
  const { publicId } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [locked, setLocked] = useState(false);
  const [lockedBrand, setLockedBrand] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState(false);
  const [liked, setLiked] = useState(new Set());
  const [busy, setBusy] = useState('');

  const [audioState, setAudioState] = useState({ playing: '' });
  const soundtrackRef = useRef(null);
  const narrationRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/v1/deliveries/public/${publicId}`, {
        headers: accessHeaders(publicId)
      });
      if (response.data.data.locked) {
        setLocked(true);
        setLockedBrand(response.data.data.branding);
        setDelivery(null);
      } else {
        setDelivery(response.data.data);
        setLocked(false);
        document.title = `${response.data.data.title} · Veylo`;
      }
    } catch (requestError) {
      setError(apiMessage(requestError, 'This delivery is not available.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [publicId]);

  async function unlock(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/v1/deliveries/public/${publicId}/unlock`, { pin });
      sessionStorage.setItem(`veylo_delivery_${publicId}`, response.data.data.accessToken);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, 'That PIN is not correct.'));
      setLoading(false);
    }
  }

  const toggleAudio = async kind => {
    const selected = kind === 'narration' ? narrationRef.current : soundtrackRef.current;
    const other = kind === 'narration' ? soundtrackRef.current : narrationRef.current;
    if (!selected) return;
    if (audioState.playing === kind) {
      selected.pause();
      setAudioState({ playing: '' });
      return;
    }
    other?.pause();
    try {
      await selected.play();
      setAudioState({ playing: kind });
    } catch {
      toast.info('Tap again to play the audio.');
    }
  };

  async function handleLike(assetId) {
    try {
      const response = await api.post(
        `/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/like`,
        {},
        { headers: accessHeaders(delivery.publicId) }
      );
      setLiked(current => {
        const next = new Set(current);
        response.data.data.liked ? next.add(assetId) : next.delete(assetId);
        return next;
      });
    } catch (err) {
      toast.error(apiMessage(err, 'We could not update that photograph.'));
    }
  }

  async function handleDownload(assetId) {
    setBusy(assetId);
    try {
      const response = await api.get(
        `/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/download`,
        { headers: accessHeaders(delivery.publicId) }
      );
      window.location.assign(response.data.data.url);
    } catch (err) {
      toast.error(apiMessage(err, 'We could not prepare that download.'));
    } finally {
      setBusy('');
    }
  }

  async function handleDownloadAll() {
    setBusy('all');
    try {
      const response = await api.get(
        `/v1/deliveries/public/${delivery.publicId}/download-all`,
        { headers: accessHeaders(delivery.publicId) }
      );
      window.location.assign(response.data.data.url);
    } catch (err) {
      toast.error(apiMessage(err, 'We could not prepare the full gallery.'));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="vd-state">
        <LoaderCircle className="v-spin" size={28} />
        <span>Opening your photographs…</span>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="vd-gate">
        <img src={lockedBrand?.logoUrl || '/veylo/veylo-mark.svg'} alt="" />
        <p>{lockedBrand?.name ? `${lockedBrand.name.toUpperCase()} · PRIVATE DELIVERY` : 'PRIVATE CLIENT DELIVERY'}</p>
        <h1>Enter the six-digit PIN.</h1>
        <span>The photographer protected this delivery. Use the PIN sent with your link.</span>
        <form onSubmit={unlock}>
          <input
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
          />
          <button disabled={pin.length !== 6}>
            Open delivery<ArrowRight size={17} />
          </button>
        </form>
        {error && <small role="alert">{error}</small>}
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="vd-state">
        <Image size={28} />
        <strong>This delivery is not available.</strong>
        <span>{error}</span>
      </div>
    );
  }

  const format = delivery.format || 'photo-story';
  const sharedProps = {
    delivery,
    onGallery: () => setGallery(true),
    audioState,
    toggleAudio
  };

  const content =
    format === 'editorial' ? <EditorialDelivery {...sharedProps} /> :
    format === 'photo-reveal' ? <RevealDelivery {...sharedProps} /> :
    format === 'canvas' ? <CanvasDelivery {...sharedProps} /> :
    format === 'chapters' ? <ChaptersDelivery {...sharedProps} /> :
    format === 'album' ? <AlbumDelivery {...sharedProps} /> :
    <StoryDelivery {...sharedProps} />;

  return (
    <>
      {delivery.soundtrack?.url && (
        <audio
          ref={soundtrackRef}
          src={delivery.soundtrack.url}
          preload="metadata"
          loop
          onEnded={() => setAudioState({ playing: '' })}
        />
      )}
      {delivery.narration?.url && (
        <audio
          ref={narrationRef}
          src={delivery.narration.url}
          preload="metadata"
          onEnded={() => setAudioState({ playing: '' })}
        />
      )}

      {content}

      <AnimatePresence>
        {gallery && (
          <DeliveryGalleryModal
            delivery={delivery}
            onClose={() => setGallery(false)}
            liked={liked}
            onLike={handleLike}
            onDownload={handleDownload}
            onDownloadAll={handleDownloadAll}
            busy={busy}
          />
        )}
      </AnimatePresence>
    </>
  );
}
