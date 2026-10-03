import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDownToLine, MoreHorizontal, Search, Check, ChevronLeft, ChevronRight, Download, ExternalLink, Image, MessageCircle, Pause, Play, RotateCcw, Shirt, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../config/env.js';
import api from '../../services/api.js';
import { resolvedGridboardPalette } from '../../utils/gridboardPalette.js';
import { useSmoothSoundtrackLoop } from '../../utils/smoothSoundtrackLoop.js';
import { useDialogFocus } from '../useDialogFocus.js';
import { ImageWaiting, useReadyPhotos } from './PresentationShell.jsx';
import DeliveryBrandMark from './DeliveryBrandMark.jsx';
import { deliveryFontStyles } from '../../utils/deliveryTypography.js';
import './PinboardViewer.css';
import './DeliveryTypography.css';

function accessHeaders(publicId) {
  const headers = {};
  const pin = sessionStorage.getItem(`veylo_delivery_${publicId}`);
  const grant = sessionStorage.getItem(`veylo_delivery_grant_${publicId}`);
  if (pin) headers['x-delivery-access'] = pin;
  if (grant) headers['x-delivery-grant'] = grant;
  return headers;
}

function photoUrl(asset, full = false) { return full ? asset?.url || asset?.thumbnailUrl || '' : asset?.thumbnailUrl || asset?.url || ''; }
async function loadSlideshowPhoto(asset) {
  for (const src of [...new Set([photoUrl(asset, true), photoUrl(asset)])].filter(Boolean)) {
    const loaded = await new Promise(resolve => {
      const image = new window.Image();
      const finish = success => { window.clearTimeout(timer); image.onload = null; image.onerror = null; resolve(success); };
      const timer = window.setTimeout(() => finish(false), 10000);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = src;
    });
    if (loaded) return src;
  }
  throw new Error('This photograph could not load. Check your connection and try again.');
}
function assetColors(asset) {
  const colors = asset?.photoColors?.length ? asset.photoColors : asset?.dominantColor ? [asset.dominantColor] : asset?.analysis?.colors || [];
  return [...new Set(colors.filter(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)))];
}
function assetSimilarityTags(asset) { return Array.isArray(asset?.similarityTags) ? asset.similarityTags : asset?.analysis?.similarityTags || []; }
function assetColorGroups(asset) {
  const groups = Array.isArray(asset?.colorGroups) ? asset.colorGroups : asset?.analysis?.colorGroups || [];
  return groups.filter(group => ['outfit', 'backdrop'].includes(group?.area) && typeof group?.color === 'string' && group.color.trim());
}
function colorGroupKey(group) { return `${group.area}:${group.color.toLowerCase().trim()}`; }
function colorGroupLabel(group) {
  const color = group.color.charAt(0).toUpperCase() + group.color.slice(1);
  return `${color} ${group.area === 'outfit' ? 'outfits' : 'backgrounds'}`;
}
function audioUrl(value) {
  return typeof value === 'string' && value.startsWith('/api/')
    ? `${API_BASE_URL.replace(/\/$/, '')}${value.slice(4)}`
    : value;
}

const TILE_RATIOS = {
  balanced: ['4 / 5', '1 / 1', '3 / 4', '5 / 4', '4 / 5', '1 / 1', '3 / 4', '4 / 3'],
  moments: ['3 / 4', '1 / 1', '4 / 5', '4 / 3', '1 / 1', '3 / 4', '5 / 4', '4 / 5'],
  'colour-flow': ['1 / 1', '4 / 5', '3 / 4', '1 / 1', '5 / 4', '4 / 5', '3 / 4', '1 / 1']
};
const BROAD_VISUAL_TAGS = new Set(['portrait', 'portraits', 'clothing', 'details', 'birthday details', 'couple', 'traditional wedding']);

function tileRatio(asset, index, layoutId) {
  const requested = (TILE_RATIOS[layoutId] || TILE_RATIOS.balanced)[index % 8];
  const natural = Number(asset?.width) / Number(asset?.height);
  if (natural > 0 && natural < 0.8 && (requested === '5 / 4' || requested === '4 / 3')) return '4 / 5';
  if (natural > 1.7 && requested === '3 / 4') return '1 / 1';
  return requested;
}

function accentInk(hex) {
  const parts = String(hex || '').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!parts) return '#fff';
  const rgb = parts.slice(1).map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.36 ? '#201b18' : '#fff';
}

function SlideshowChoice({ title, detail, cover, onClick }) {
  return <button type="button" className="pb-slideshow-choice" onClick={onClick}>
    {cover && <img src={photoUrl(cover)} alt="" loading="lazy" />}
    <span><strong>{title}</strong><small>{detail}</small></span>
    <Play size={16} aria-hidden="true" />
  </button>;
}

function SlideshowFrame({ slide, seconds, paused, direction, reducedMotion }) {
  const arrival = slide.index % 3;
  const duration = reducedMotion ? 0 : .9;
  const photoVariants = {
    entering: travel => reducedMotion ? { opacity: 1 } : {
      opacity: 0,
      x: arrival === 0 ? travel * 48 : 0,
      y: arrival === 1 ? 38 : 0,
      scale: arrival === 2 ? .93 : 1.025
    },
    showing: { opacity: 1, x: 0, y: 0, scale: 1 },
    leaving: travel => reducedMotion ? { opacity: 0 } : {
      opacity: 0,
      x: arrival === 0 ? travel * -36 : 0,
      y: arrival === 1 ? -24 : 0,
      scale: arrival === 2 ? 1.045 : .985
    }
  };
  return <motion.figure className="pb-slideshow-frame" custom={direction}
    variants={{ entering: { opacity: reducedMotion ? 1 : 0 }, showing: { opacity: 1 }, leaving: { opacity: 0 } }}
    initial="entering" animate="showing" exit="leaving"
    transition={{ duration, ease: [0.22, 1, 0.36, 1] }}>
    <img className={`pb-slideshow-ambient pb-slide-ambient-${slide.index % 2}`} src={slide.src} alt="" aria-hidden="true"
      style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' }} />
    <motion.div className="pb-slideshow-photo-window" custom={direction} variants={photoVariants}
      transition={{ duration, ease: [0.22, 1, 0.36, 1] }}>
      <img className={`pb-slideshow-main-photo pb-slide-movement-${slide.index % 6}`} src={slide.src} alt={slide.alt}
        style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' }} />
    </motion.div>
  </motion.figure>;
}

export default function PinboardViewer({ delivery, preview = false, demo = false, galleryProps = {} }) {
  const location = useLocation();
  const [findOpen, setFindOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const findRef = useRef(null), moreRef = useRef(null), lightboxRef = useRef(null);
  useDialogFocus(findOpen, findRef, () => setFindOpen(false));
  useDialogFocus(moreOpen, moreRef, () => setMoreOpen(false));
  const [activeMoment, setActiveMoment] = useState('');
  const [activeColour, setActiveColour] = useState('');
  const [activeLayoutId, setActiveLayoutId] = useState(delivery?.pinboard?.selectedLayoutId || 'balanced');
  const [activePhoto, setActivePhoto] = useState('');
  useDialogFocus(!!activePhoto, lightboxRef, () => closePhoto());
  const [showSlideshowSetup, setShowSlideshowSetup] = useState(false);
  const [slideshowOpening, setSlideshowOpening] = useState('');
  const [slideshow, setSlideshow] = useState(null);
  const [displayedSlide, setDisplayedSlide] = useState(null);
  const [slideLoading, setSlideLoading] = useState(false);
  const [slideSeconds, setSlideSeconds] = useState(5);
  const [musicMuted, setMusicMuted] = useState(false);
  const [slideshowMessage, setSlideshowMessage] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSelection, setStatusSelection] = useState([]);
  const [statusPage, setStatusPage] = useState(0);
  const [statusCard, setStatusCard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const photoReturn = useRef(null);
  const [photoDirection, setPhotoDirection] = useState(1);
  const photoGesture = useRef(null);
  const boardRef = useRef(null);
  const musicRef = useRef(null);
  const preloadedPhotos = useRef(new Map());
  const slideStartedAt = useRef(0);
  const slideshowStartToken = useRef(0);
  const reducedMotion = useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 390 : window.innerWidth);
  const board = delivery?.pinboard || {};
  const assets = useMemo(() => [...(delivery?.assets || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)), [delivery?.assets]);
  const assetById = useMemo(() => new Map(assets.map(asset => [String(asset.assetId), asset])), [assets]);
  const moments = useMemo(() => (board.moments || []).filter(moment => !moment.hidden && moment.assetIds?.some(id => assetById.has(String(id)))), [board.moments, assetById]);
  const colourGroups = useMemo(() => {
    const groups = new Map();
    assets.forEach(asset => {
      const seen = new Set();
      assetColorGroups(asset).forEach(group => {
        const key = colorGroupKey(group);
        if (seen.has(key)) return;
        seen.add(key);
        const existing = groups.get(key) || { ...group, key, assetIds: [] };
        existing.assetIds.push(asset.assetId);
        groups.set(key, existing);
      });
    });
    return [...groups.values()].filter(group => group.assetIds.length > 1 && group.assetIds.length < assets.length).sort((a, b) => b.assetIds.length - a.assetIds.length);
  }, [assets]);
  const selectedColourGroup = colourGroups.find(group => group.key === activeColour);
  const selectedLayout = (board.layouts || []).find(layout => layout.id === activeLayoutId) || (board.layouts || []).find(layout => layout.id === board.selectedLayoutId);
  const orderedIds = [...new Set([...(selectedLayout?.assetOrder || delivery?.galleryOrder || []), ...assets.map(asset => asset.assetId)].map(String))];
  const ordered = orderedIds.map(id => assetById.get(id)).filter(Boolean);
  const visible = ordered.filter(asset => {
    const inMoment = !activeMoment || moments.find(moment => moment.id === activeMoment)?.assetIds?.includes(asset.assetId);
    const inColour = !activeColour || selectedColourGroup?.assetIds.includes(asset.assetId);
    return inMoment && inColour;
  });
  const soundtrackUrl = delivery?.soundtrack?.url ? audioUrl(delivery.soundtrack.url) : '';
  useSmoothSoundtrackLoop(musicRef, soundtrackUrl);
  const slideshowAsset = slideshow ? assetById.get(String(slideshow.assetIds[slideshow.index])) : null;
  const palette = useMemo(() => resolvedGridboardPalette(board.palette, assets), [board.palette, assets]);
  const fonts = deliveryFontStyles(board.typography, { display: "'Cormorant Garamond', Georgia, serif" });
  const grid = board.grid || {};
  const columnCount = Math.max(1, Math.min(5, Number(viewportWidth <= 640 ? grid.mobileColumns || 2 : viewportWidth <= 1024 ? grid.tabletColumns || 3 : grid.desktopColumns || 4)));
  const masonryColumns = Array.from({ length: columnCount }, () => []);
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  visible.forEach((asset, index) => {
    const ratio = tileRatio(asset, index, activeLayoutId);
    const [width, height] = ratio.split('/').map(Number);
    const shortest = columnHeights.indexOf(Math.min(...columnHeights));
    masonryColumns[shortest].push({ asset, index, ratio });
    columnHeights[shortest] += height / width + 0.07;
  });
  const style = {
    '--pb-background': palette.background || '#13110f',
    '--pb-surface': palette.surface || '#211b18',
    '--pb-text': palette.text || '#fff6ec',
    '--pb-accent': palette.accent || '#efa57c',
    '--pb-on-accent': accentInk(palette.accent || '#efa57c'),
    ...fonts,
    '--pb-display': fonts['--delivery-font-heading'],
    '--pb-body': fonts['--delivery-font-caption'],
    '--pb-gap': grid.gap === 'compact' ? '8px' : grid.gap === 'spacious' ? '22px' : '14px',
    '--pb-active-columns': columnCount,
    '--pb-animation-duration': board.animation === 'staggered' ? '.76s' : '.58s'
  };

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const tiles = boardRef.current?.querySelectorAll('.pb-tile.is-revealing');
    if (!tiles?.length) return undefined;
    if (!('IntersectionObserver' in window)) {
      tiles.forEach(tile => tile.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -35px 0px', threshold: 0.12 });
    tiles.forEach(tile => observer.observe(tile));
    return () => observer.disconnect();
  }, [activeMoment, activeColour, activeLayoutId, columnCount, assets.length, board.animation]);

  useEffect(() => {
    setActiveLayoutId(board.selectedLayoutId || board.layouts?.[0]?.id || 'balanced');
  }, [board.selectedLayoutId]);

  useEffect(() => {
    if (!slideshow?.active || slideshow.completed || slideshow.paused || !displayedSlide || displayedSlide.visit !== slideshow.visit || displayedSlide.assetId !== String(slideshow.assetIds[slideshow.index])) return undefined;
    slideStartedAt.current = Date.now();
    const timer = window.setTimeout(() => {
      setSlideshow(current => {
        if (!current) return null;
        if (current.index >= current.assetIds.length - 1) return { ...current, completed: true };
        return { ...current, index: current.index + 1, direction: 1, visit: current.visit + 1, remainingMs: current.interval * 1000 };
      });
    }, slideshow.remainingMs);
    return () => window.clearTimeout(timer);
  }, [slideshow, displayedSlide]);

  useEffect(() => {
    if (!slideshowAsset) { setDisplayedSlide(null); setSlideLoading(false); return undefined; }
    const assetId = String(slideshowAsset.assetId);
    const fullUrl = photoUrl(slideshowAsset, true);
    const thumbnailUrl = photoUrl(slideshowAsset);
    let cancelled = false;
    const useLoaded = src => {
      if (cancelled) return;
      preloadedPhotos.current.set(assetId, src);
      setDisplayedSlide({ assetId, index: slideshow.index, visit: slideshow.visit, src, alt: slideshowAsset.alt || 'Finished photograph' });
      setSlideLoading(false);
    };
    const cached = preloadedPhotos.current.get(assetId);
    if (cached) { useLoaded(cached); return undefined; }
    setSlideLoading(true);
    const image = new window.Image();
    image.onload = () => useLoaded(fullUrl);
    image.onerror = () => {
      if (!thumbnailUrl || thumbnailUrl === fullUrl) {
        if (!cancelled) { setSlideLoading(false); setSlideshowMessage('This photograph could not load. Check your connection and try again.'); setSlideshow(current => current ? { ...current, paused: true } : null); }
        return;
      }
      const fallback = new window.Image();
      fallback.onload = () => useLoaded(thumbnailUrl);
      fallback.onerror = () => {
        if (!cancelled) { setSlideLoading(false); setSlideshowMessage('This photograph could not load. Check your connection and try again.'); setSlideshow(current => current ? { ...current, paused: true } : null); }
      };
      fallback.src = thumbnailUrl;
    };
    image.src = fullUrl;
    return () => { cancelled = true; };
  }, [slideshowAsset, slideshow?.index, slideshow?.visit]);

  useEffect(() => {
    if (!slideshow || slideshow.index >= slideshow.assetIds.length - 1) return undefined;
    const next = assetById.get(String(slideshow.assetIds[slideshow.index + 1]));
    if (!next || preloadedPhotos.current.has(String(next.assetId))) return undefined;
    const image = new window.Image();
    image.onload = () => preloadedPhotos.current.set(String(next.assetId), photoUrl(next, true));
    image.src = photoUrl(next, true);
    return () => { image.onload = null; };
  }, [slideshow?.index, slideshow?.assetIds, assetById]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return undefined;
    let frame;
    let timer;
    const fadeOut = duration => {
      const started = performance.now();
      const volume = audio.volume;
      const tick = now => {
        const progress = Math.min(1, (now - started) / duration);
        audio.volume = volume * (1 - progress);
        if (progress < 1) frame = window.requestAnimationFrame(tick);
        else { audio.pause(); if (!slideshow) audio.currentTime = 0; }
      };
      frame = window.requestAnimationFrame(tick);
    };
    if (!slideshow) {
      if (!slideshowOpening && !audio.paused) fadeOut(450);
      else if (!slideshowOpening) audio.currentTime = 0;
    } else if (slideshow.completed) fadeOut(450);
    else if (!slideshow.paused && !musicMuted) {
      const lastPhoto = slideshow.index === slideshow.assetIds.length - 1;
      const loaded = displayedSlide?.visit === slideshow.visit && displayedSlide?.assetId === String(slideshow.assetIds[slideshow.index]);
      const fadeMs = 1600;
      audio.volume = lastPhoto && loaded ? .72 * Math.min(1, slideshow.remainingMs / fadeMs) : .72;
      if (lastPhoto && loaded) timer = window.setTimeout(() => fadeOut(Math.min(fadeMs, slideshow.remainingMs)), Math.max(0, slideshow.remainingMs - fadeMs));
    }
    return () => { window.clearTimeout(timer); window.cancelAnimationFrame(frame); };
  }, [slideshow, displayedSlide, musicMuted, slideshowOpening]);

  useEffect(() => {
    if (!slideshow) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') setSlideshow(null);
      if (!slideshow.completed && ['ArrowRight', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        navigateSlideshow(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slideshow]);

  useEffect(() => () => { slideshowStartToken.current += 1; musicRef.current?.pause(); }, []);

  useEffect(() => () => { if (statusCard?.url) URL.revokeObjectURL(statusCard.url); }, [statusCard?.url]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const photo = params.get('photo');
    const moment = params.get('moment');
    if (moment && moments.some(item => item.id === moment)) {
      setActiveMoment(moment);
      window.setTimeout(() => document.getElementById(`pb-moment-${moment}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
    if (photo && assetById.has(photo)) {
      window.setTimeout(() => { document.getElementById(`pb-photo-${photo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setActivePhoto(photo); }, 180);
    }
  }, [location.search, assetById, moments]);

  useEffect(() => {
    if (!activePhoto || showSlideshowSetup || statusOpen || findOpen || moreOpen) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') setActivePhoto('');
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        navigatePhoto(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePhoto, visible, showSlideshowSetup, statusOpen, findOpen, moreOpen]);

  function openPhoto(assetId) {
    photoReturn.current = { moment: activeMoment, colour: activeColour, layout: activeLayoutId, assetId, scroll: window.scrollY };
    setActivePhoto(assetId);
  }
  function closePhoto() {
    const previous = photoReturn.current;
    setActivePhoto('');
    if (!previous) return;
    setActiveMoment(previous.moment); setActiveColour(previous.colour); setActiveLayoutId(previous.layout);
    requestAnimationFrame(() => { window.scrollTo({ top: previous.scroll, behavior: 'auto' }); document.getElementById('pb-photo-' + previous.assetId)?.querySelector('.pb-tile-open')?.focus({ preventScroll: true }); });
  }
  function navigatePhoto(direction) {
    const current = visible.findIndex(asset => asset.assetId === activePhoto);
    const next = visible[current + direction];
    if (next) { setPhotoDirection(direction); setActivePhoto(next.assetId); }
  }

  async function toggleMusic() {
    if (!slideshow) return;
    const audio = musicRef.current;
    if (!audio) return;
    if (!musicMuted) { setMusicMuted(true); audio.pause(); return; }
    setMusicMuted(false);
    if (slideshow.paused) return;
    try { await audio.play(); }
    catch {
      setMusicMuted(true);
      setSlideshowMessage('Music could not start. Check your connection and try again.');
    }
  }

  async function startSlideshow(selectedAssets, title) {
    if (slideshowOpening) return;
    const assetIds = [...new Set(selectedAssets.map(asset => String(asset.assetId)).filter(id => assetById.has(id)))];
    if (!assetIds.length) return;
    const token = ++slideshowStartToken.current;
    setSlideshowOpening(title);
    setSlideshowMessage('');
    setMusicMuted(false);
    // Request playback during the tap, but keep it silent until the first photo is ready.
    if (soundtrackUrl && musicRef.current) {
      musicRef.current.volume = 0;
      musicRef.current.play().catch(() => {
        if (token === slideshowStartToken.current) { setMusicMuted(true); setSlideshowMessage('The slideshow is playing without music. Tap Sound off to try again.'); }
      });
    }
    try {
      const first = assetById.get(assetIds[0]);
      const src = preloadedPhotos.current.get(assetIds[0]) || await loadSlideshowPhoto(first);
      if (token !== slideshowStartToken.current) return;
      preloadedPhotos.current.set(assetIds[0], src);
      setDisplayedSlide({ assetId: assetIds[0], index: 0, visit: 0, src, alt: first.alt || 'Finished photograph' });
      setSlideLoading(false);
      setSlideshowOpening('');
      setShowSlideshowSetup(false);
      setActivePhoto('');
      setSlideshow({ active: true, paused: false, completed: false, assetIds, title, index: 0, visit: 0, direction: 1, interval: slideSeconds, remainingMs: slideSeconds * 1000 });
      if (musicRef.current) { musicRef.current.currentTime = 0; musicRef.current.volume = .72; }
    } catch (failure) {
      if (token !== slideshowStartToken.current) return;
      musicRef.current?.pause();
      setSlideshowOpening('');
      setSlideshowMessage(failure.message);
    }
  }

  function closeSlideshowSetup() {
    slideshowStartToken.current += 1;
    setSlideshowOpening('');
    setShowSlideshowSetup(false);
    if (!slideshow) musicRef.current?.pause();
  }

  function toggleSlideshowPause() {
    if (slideshow?.completed) return;
    if (slideshow?.paused && !musicMuted && musicRef.current) musicRef.current.play().catch(() => { setMusicMuted(true); setSlideshowMessage('The slideshow is playing without music. Tap Sound off to try again.'); });
    else musicRef.current?.pause();
    setSlideshow(current => {
      if (!current) return null;
      if (current.paused) return { ...current, paused: false };
      const showingCurrent = displayedSlide?.visit === current.visit && displayedSlide?.assetId === String(current.assetIds[current.index]);
      const elapsed = showingCurrent ? Date.now() - slideStartedAt.current : 0;
      return { ...current, paused: true, remainingMs: Math.max(100, current.remainingMs - elapsed) };
    });
  }

  function navigateSlideshow(direction) {
    setSlideshow(current => {
      if (!current || current.completed || (direction < 0 && current.index === 0)) return current;
      if (direction > 0 && current.index === current.assetIds.length - 1) return { ...current, completed: true };
      return { ...current, index: current.index + direction, direction, visit: current.visit + 1, remainingMs: current.interval * 1000 };
    });
  }

  function replaySlideshow() {
    setSlideshow(current => current ? { ...current, completed: false, paused: false, index: 0, direction: 1, visit: current.visit + 1, remainingMs: current.interval * 1000 } : null);
    if (!musicMuted && musicRef.current) {
      musicRef.current.currentTime = 0;
      musicRef.current.volume = .72;
      musicRef.current.play().catch(() => { setMusicMuted(true); setSlideshowMessage('Tap Sound off to try the music again.'); });
    }
  }

  function similarShotsFor(target) {
    if (!target) return [];
    if (Array.isArray(target.similarAssetIds)) return target.similarAssetIds.map(id => assetById.get(String(id))).filter(Boolean).slice(0, 5);
    const targetTags = new Set(assetSimilarityTags(target).map(tag => String(tag).toLowerCase().trim()).filter(tag => tag && !BROAD_VISUAL_TAGS.has(tag)));
    const targetColorGroups = new Set(assetColorGroups(target).map(colorGroupKey).filter(key => colourGroups.some(group => group.key === key)));
    return assets.filter(asset => asset.assetId !== target.assetId).map(asset => {
      const sharedTags = assetSimilarityTags(asset).filter(tag => targetTags.has(String(tag).toLowerCase().trim())).length;
      const sharedColorGroups = assetColorGroups(asset).filter(group => targetColorGroups.has(colorGroupKey(group))).length;
      const score = sharedTags * 6 + sharedColorGroups * 2;
      return { asset, score, sharedTags };
    }).filter(item => item.sharedTags > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.asset);
  }

  function showRelatedPhoto(asset) {
    setActiveMoment(''); setActiveColour(''); setActivePhoto(asset.assetId); setPhotoDirection(1);
  }

  function onPhotoPointerStart(event) {
    if (!event.isPrimary || event.button !== 0) return;
    photoGesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    // Keep the gesture on this stable surface when a decoded photo replaces the img.
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === 'mouse') event.preventDefault();
  }

  function onPhotoPointerMove(event) {
    const start = photoGesture.current;
    if (!start || start.pointerId !== event.pointerId || board.animation === 'none' || reducedMotion) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 8) return;
    const image = event.currentTarget.querySelector('.pb-lightbox-photo-main');
    if (image) {
      image.getAnimations().forEach(animation => animation.cancel());
      image.style.transform = `translate3d(${Math.max(-120, Math.min(120, dx * .7))}px, 0, 0) scale(.98)`;
    }
  }

  function clearPhotoGesture(event) {
    if (photoGesture.current?.pointerId !== event.pointerId) return;
    const image = event.currentTarget.querySelector('.pb-lightbox-photo-main');
    if (image) image.style.transform = '';
    photoGesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onPhotoPointerEnd(event) {
    const start = photoGesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    clearPhotoGesture(event);
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) navigatePhoto(dx < 0 ? 1 : -1);
  }

  function privateLink(kind, id) {
    const url = new URL(`/d/${encodeURIComponent(delivery.publicId)}`, window.location.origin);
    if (kind) url.searchParams.set(kind, id);
    const grant = sessionStorage.getItem(`veylo_delivery_grant_${delivery.publicId}`) || '';
    if (/^[A-Za-z0-9_-]{30,100}$/.test(grant)) url.searchParams.set('share', grant);
    return url.toString();
  }
  function openWhatsApp(kind, id, label) {
    if (preview) { setMessage('Sharing is available after you publish this delivery.'); return; }
    if (!demo && !delivery?.publicId) return;
    const link = demo ? new URL(`/demo/gridboard?${kind}=${encodeURIComponent(id)}`, window.location.origin).toString() : privateLink(kind, id);
    const text = `${label}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }
  function toggleStatusPhoto(id) {
    setStatusSelection(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 4 ? [...current, id] : current);
  }
  function closeStatusCard() {
    setStatusOpen(false);
    setStatusCard(null);
    setMessage('');
  }
  function saveStatusCard() {
    if (!statusCard) return;
    const anchor = document.createElement('a');
    anchor.href = statusCard.url;
    anchor.download = 'veylo-gridboard-status.png';
    anchor.click();
    setMessage('Card saved. Add it to your WhatsApp Status or Instagram Story.');
  }
  async function copyStatusLink() {
    if (!statusCard) return;
    try {
      await navigator.clipboard.writeText(statusCard.link);
      setMessage('Gallery link copied. Add it to your Status or Story so people can open the photos.');
    } catch { setMessage('Your browser could not copy the link. Open the gallery and copy its address instead.'); }
  }
  async function shareStatusCard() {
    if (!statusCard || !navigator.share) return;
    try {
      const file = new File([statusCard.blob], 'veylo-gridboard-status.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: delivery?.title || 'The gallery is ready' });
      else setMessage('This device cannot share the card directly. Save it and add it from your photos.');
    } catch (error) { if (error?.name !== 'AbortError') setMessage('Sharing did not open. Save the card and add it from your photos.'); }
  }
  async function createStatusCard() {
    if (preview) { setMessage('Your client can save a Status card after this delivery is published.'); return; }
    if (statusSelection.length < 1 || statusSelection.length > 4) return;
    setBusy(true); setMessage('');
    if (demo) {
      try {
        const selected = statusSelection.map(id => assetById.get(String(id))).filter(Boolean);
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1920;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');
        context.fillStyle = '#111115'; context.fillRect(0, 0, 1080, 1920);
        context.fillStyle = palette.accent || '#d7a984'; context.fillRect(0, 0, 1080, 14);
        context.font = '700 24px Arial'; context.letterSpacing = '4px';
        context.fillText(`PHOTOGRAPHED BY ${String(delivery?.branding?.name || 'VEYLO').toUpperCase().slice(0, 30)}`, 72, 94, 930);
        context.fillStyle = '#fffaf5'; context.font = '57px Georgia'; context.letterSpacing = '0';
        context.fillText('The gallery is ready.', 72, 176);
        context.fillStyle = '#e7dfd8'; context.font = '31px Arial';
        context.fillText(String(delivery.title || 'Your photographs').slice(0, 44), 72, 245, 930);
        context.fillStyle = '#c7bfb8'; context.font = '21px Arial'; context.letterSpacing = '3px';
        context.fillText(`${assets.length} FINISHED PHOTOGRAPHS`, 72, 323);
        const photos = await Promise.all(selected.map(asset => new Promise((resolve, reject) => {
          const image = new window.Image(); image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image); image.onerror = reject; image.src = photoUrl(asset, true);
        })));
        const left = 72, top = 348, width = 936, height = 1170, gap = 18;
        const halfWidth = (width - gap) / 2;
        const cells = photos.length === 1 ? [{ x: left, y: top, w: width, h: height }]
          : photos.length === 2 ? [{ x: left, y: top, w: width, h: 690 }, { x: left, y: top + 690 + gap, w: width, h: height - 690 - gap }]
          : photos.length === 3 ? [{ x: left, y: top, w: width, h: 680 }, { x: left, y: top + 680 + gap, w: halfWidth, h: height - 680 - gap }, { x: left + halfWidth + gap, y: top + 680 + gap, w: halfWidth, h: height - 680 - gap }]
          : photos.map((_, index) => ({ x: left + (index % 2) * (halfWidth + gap), y: top + Math.floor(index / 2) * (640 + gap), w: halfWidth, h: index < 2 ? 640 : height - 640 - gap }));
        photos.forEach((image, index) => {
          const cell = cells[index]; const scale = Math.max(cell.w / image.width, cell.h / image.height);
          const sourceWidth = cell.w / scale, sourceHeight = cell.h / scale;
          context.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, cell.x, cell.y, cell.w, cell.h);
        });
        context.strokeStyle = palette.accent || '#d7a984'; context.lineWidth = 2;
        context.beginPath(); context.moveTo(72, 1572); context.lineTo(1008, 1572); context.stroke();
        context.fillStyle = '#fffaf5'; context.font = '46px Georgia'; context.letterSpacing = '0';
        context.fillText('See the full gallery.', 72, 1664);
        context.fillStyle = '#c7bfb8'; context.font = '26px Arial';
        context.fillText('Open the link added to this Story.', 72, 1720);
        context.fillStyle = palette.accent || '#d7a984'; context.font = '700 21px Arial'; context.letterSpacing = '3px';
        context.fillText('VEYLO GRIDBOARD DEMO', 72, 1830);
        context.fillStyle = '#a79f99'; context.font = '19px Arial'; context.letterSpacing = '0';
        context.fillText(`${window.location.host}/demo/gridboard`, 72, 1871, 936);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('The Status card could not be drawn.');
        setStatusCard({ blob, url: URL.createObjectURL(blob), link: new URL('/demo/gridboard', window.location.origin).toString() });
      } catch { setMessage('We could not prepare that Status card. Try again.'); }
      finally { setBusy(false); }
      return;
    }
    try {
      const response = await api.post(`/v1/deliveries/public/${delivery.publicId}/pinboard/status-card`, { assetIds: statusSelection }, { headers: accessHeaders(delivery.publicId), responseType: 'blob' });
      setStatusCard({ blob: response.data, url: URL.createObjectURL(response.data), link: privateLink('', '') });
    } catch (error) {
      const fallback = error?.response?.status === 403 ? 'The photographer has turned off downloads for this gallery.' : 'We could not prepare that Status card. Try again.';
      setMessage(fallback);
    } finally { setBusy(false); }
  }

  const modalAsset = assetById.get(activePhoto);
  const modalIndex = visible.findIndex(asset => asset.assetId === activePhoto);
  const suggestedTone = modalAsset?.dominantColor || modalAsset?.analysis?.colors?.[0];
  const modalTone = typeof suggestedTone === 'string' && /^#[0-9a-f]{6}$/i.test(suggestedTone) ? suggestedTone : palette.surface || '#211b18';
  const similarShots = similarShotsFor(modalAsset);
  const similarSlideAssets = modalAsset ? [modalAsset, ...similarShots.filter(asset => asset.assetId !== modalAsset.assetId)] : [];
  const momentSlides = moments.map(moment => {
    const ids = new Set(moment.assetIds.map(String));
    return { ...moment, photos: ordered.filter(asset => ids.has(String(asset.assetId))) };
  }).filter(moment => moment.photos.length);
  const colourSlides = colourGroups.map(group => {
    const ids = new Set(group.assetIds.map(String));
    return { ...group, photos: ordered.filter(asset => ids.has(String(asset.assetId))) };
  }).filter(group => group.photos.length);
  const menuPhoto = typeof moreOpen === 'string' ? assetById.get(moreOpen) : null;
  const canDownload = delivery?.access?.allowIndividualDownloads || delivery?.access?.allowDownloadAll;
  const canDownloadPhoto = !!delivery?.access?.allowIndividualDownloads;
  const lightboxReady = useReadyPhotos(modalAsset ? [{ ...modalAsset, url: photoUrl(modalAsset, true) }] : [], [visible[modalIndex + 1], visible[modalIndex - 1]].filter(Boolean).map(asset => ({ ...asset, url: photoUrl(asset, true) })));
  const shownPhoto = lightboxReady.photos[0];
  function downloadPhoto(asset, index) {
    if (preview) { setMessage('Photo downloads are available after you publish this delivery.'); return; }
    if (demo) {
      const anchor = document.createElement('a');
      anchor.href = photoUrl(asset, true);
      anchor.download = `veylo-gridboard-demo-${index + 1}.webp`;
      anchor.click();
      return;
    }
    galleryProps.onDownload?.(asset.assetId, index);
  }
  const statusPageSize = 18;
  const statusPageCount = Math.ceil(assets.length / statusPageSize);
  const statusPageAssets = assets.slice(statusPage * statusPageSize, (statusPage + 1) * statusPageSize);
  const currentSelectionName = activeMoment
    ? moments.find(moment => moment.id === activeMoment)?.title || 'Selected moment'
    : selectedColourGroup ? colorGroupLabel(selectedColourGroup) : '';

  return <main className={'pb-viewer' + (preview ? ' is-preview' : '') + (board.animation === 'none' ? '' : ' is-animated')} style={style}>
    <div className="pb-wrap">
      <header className={'pb-header' + ((delivery?.branding?.name || 'Veylo').length > 32 ? ' has-long-brand' : '')}>
        <div className="pb-brand"><span className="pb-brand-mark"><DeliveryBrandMark branding={delivery?.branding} /></span><span><small>{delivery?.branding?.type === 'studio' ? 'Photographed by' : 'GRIDBOARD'}</small><strong>{delivery?.branding?.name || 'Veylo'}</strong></span></div>
        <div className="pb-header-actions"><button type="button" aria-label="More gallery actions" aria-haspopup="dialog" onClick={() => setMoreOpen(true)}><MoreHorizontal size={20} /><span>More</span></button></div>
      </header>
      <section className="pb-intro">
        <span className="pb-kicker">GRIDBOARD DELIVERY</span>
        <h1>{board.title || delivery?.title || `${delivery?.clientName || 'Your'}'s photographs`}</h1>
        <p>{board.description || (preview ? 'Every finished photograph from this shoot.' : `Made for ${delivery?.clientName || 'you'}. Explore the whole set or find a moment below.`)}</p>
        <div className="pb-intro-meta"><span>{assets.length} photographs</span><i aria-hidden="true" />{<span>{delivery?.viewer?.label || 'Private gallery'}</span>}</div>
      </section>
      <AnimatePresence>{findOpen && <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .2 }} className="pb-find-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setFindOpen(false); }}><section className="pb-find-sheet" ref={findRef} role="dialog" aria-modal="true" aria-label="Find photos"><header><h2>Find photos</h2><button type="button" onClick={() => setFindOpen(false)} aria-label="Close find photos"><X size={20} /></button></header><label>Arrangement<select value={activeLayoutId} onChange={event => setActiveLayoutId(event.target.value)}>{(board.layouts || []).map(layout => <option value={layout.id} key={layout.id}>{layout.title}</option>)}</select></label><nav className="pb-find-tools" aria-label="Explore the photographs">
        {!!moments.length && <section className="pb-moments" aria-label="Find a moment">
          <div className="pb-moments-head"><span>FIND A MOMENT</span>{(activeMoment || activeColour) && <button type="button" onClick={() => { setActiveMoment(''); setActiveColour(''); }}>Show all photos</button>}</div>
          <div className="pb-moment-list">{moments.map((moment, momentIndex) => {
            const cover = moment.assetIds.map(id => assetById.get(String(id))).find(Boolean);
            return <div className={'pb-moment-chip-wrap' + (activeMoment === moment.id ? ' is-active' : '')} id={`pb-moment-${moment.id}`} key={moment.id} style={{ animationDelay: `${Math.min(momentIndex * 65, 390)}ms` }}>
              {cover && <img src={photoUrl(cover)} alt="" loading="lazy" />}
              <button type="button" aria-pressed={activeMoment === moment.id} onClick={() => { setActiveMoment(current => current === moment.id ? '' : moment.id); setActiveColour(''); }}><strong>{moment.title}</strong><span>{moment.assetIds.filter(id => assetById.has(String(id))).length} photos</span></button>
              {!preview && <button type="button" className="pb-chip-share" aria-label={`Share ${moment.title} on WhatsApp`} onClick={() => openWhatsApp('moment', moment.id, `${moment.title} · ${delivery?.title || 'Photo gallery'}`)}><MessageCircle size={15} /></button>}
            </div>;
          })}</div>
        </section>}
        {!!colourGroups.length && <section className="pb-colour-tools" aria-label="Find photos by outfit or background colour">
          <div className="pb-moments-head"><span>OUTFITS AND BACKGROUNDS</span>{(activeMoment || activeColour) && !moments.length && <button type="button" onClick={() => { setActiveMoment(''); setActiveColour(''); }}>Show all photos</button>}</div>
          <div className="pb-colour-list">{colourGroups.map(group => <button key={group.key} type="button" className={activeColour === group.key ? 'is-active' : ''} onClick={() => { setActiveColour(current => current === group.key ? '' : group.key); setActiveMoment(''); }} aria-pressed={activeColour === group.key} aria-label={`Show ${group.assetIds.length} photos with ${colorGroupLabel(group).toLowerCase()}`}><span className="pb-colour-kind">{group.area === 'outfit' ? <Shirt size={13} /> : <Image size={13} />}</span><strong>{colorGroupLabel(group)}</strong><span className="pb-colour-count">{group.assetIds.length}</span></button>)}</div>
        </section>}
      </nav><footer><button type="button" onClick={() => { setActiveMoment(''); setActiveColour(''); }}>Show all photographs</button><button type="button" onClick={() => setFindOpen(false)}>View photographs</button></footer></section></motion.div>}</AnimatePresence>
      <AnimatePresence>{moreOpen && <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .2 }} className="pb-find-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMoreOpen(false); }}><section className="pb-find-sheet pb-more-sheet" ref={moreRef} role="dialog" aria-modal="true" aria-label="More gallery actions"><header><h2>{menuPhoto ? 'Photograph options' : 'Your gallery'}</h2><button type="button" onClick={() => setMoreOpen(false)} aria-label="Close gallery actions"><X size={20} /></button></header>{menuPhoto && <><button type="button" onClick={() => { setMoreOpen(false); openPhoto(menuPhoto.assetId); }}><Image size={18} />View photograph</button>{canDownloadPhoto && <button type="button" onClick={() => downloadPhoto(menuPhoto, visible.indexOf(menuPhoto))}><Download size={18} />Download photo</button>}<button type="button" onClick={() => openWhatsApp('photo', menuPhoto.assetId, delivery.title || 'Your photograph')}><MessageCircle size={18} />Share photograph</button></>}{!menuPhoto && delivery.access?.allowDownloadAll && <button type="button" aria-label="Download all photos" onClick={() => { setMoreOpen(false); if (preview) setMessage('Download all is available after you publish this delivery.'); else if (demo) setMessage('These are sample files. Open a photograph to download a sample.'); else galleryProps.onDownloadAll?.(); }}><ArrowDownToLine size={18} />Download all</button>}{!menuPhoto && canDownload && <button type="button" aria-label="Make a WhatsApp Status card" onClick={() => { setMoreOpen(false); setStatusSelection([]); setStatusPage(0); setStatusCard(null); setMessage(''); setStatusOpen(true); }}><MessageCircle size={18} />Make a Status card</button>}{!menuPhoto && <button type="button" onClick={() => openWhatsApp('', '', delivery.title || 'Your photographs')}><MessageCircle size={18} />Share gallery link</button>}</section></motion.div>}</AnimatePresence>
      <div className="pb-board-top"><div><span>{activeMoment ? moments.find(moment => moment.id === activeMoment)?.title : selectedColourGroup ? colorGroupLabel(selectedColourGroup) : 'All photos'}</span><span>{visible.length} PHOTOS</span>{(activeMoment || activeColour) && <button type="button" className="pb-filter-clear" onClick={() => { setActiveMoment(''); setActiveColour(''); }}>Clear filter<X size={15} /></button>}</div><div className="pb-board-controls">
        <button type="button" onClick={() => setFindOpen(true)} aria-haspopup="dialog"><Search size={16} />Find photos</button><button type="button" onClick={() => setShowSlideshowSetup(true)} aria-haspopup="dialog"><Play size={15} /> Slideshow</button>
      </div></div>
      <section className="pb-board" ref={boardRef} key={`${activeMoment || 'all'}-${activeColour || 'all'}-${activeLayoutId}`} aria-label="Photographs" aria-live="polite">
        {masonryColumns.map((column, columnIndex) => <div className="pb-board-column" key={columnIndex}>{column.map(({ asset, index, ratio }) => <article className={'pb-tile' + (board.animation === 'none' ? '' : ' is-revealing')} id={`pb-photo-${asset.assetId}`} key={asset.assetId} style={{ '--pb-tile-ratio': ratio, '--pb-tile-color': assetColors(asset)[0] || palette.surface, '--pb-reveal-delay': board.animation === 'staggered' ? `${(index % 5) * 65}ms` : '0ms' }}>
          <button type="button" className="pb-tile-open" onClick={() => openPhoto(asset.assetId)} aria-label={`Open photograph ${index + 1}`}><img loading={index < 6 ? 'eager' : 'lazy'} src={photoUrl(asset)} alt={asset.alt || `Finished photograph ${index + 1}`} onLoad={event => event.currentTarget.classList.add('is-loaded')} /><span className="pb-tile-view">View photo</span></button><div className="pb-tile-footer"><span>{String(index + 1).padStart(2, '0')}</span><button type="button" aria-label={`Options for photograph ${index + 1}`} aria-haspopup="dialog" onClick={() => setMoreOpen(asset.assetId)}><MoreHorizontal size={18} /></button></div>

        </article>)}</div>)}
      </section>
      <footer className="pb-footer"><span>That’s the whole gallery.</span><span>{assets.length} photographs</span></footer>
    </div>

    {modalAsset && <div ref={lightboxRef} className="pb-lightbox" role="dialog" aria-modal="true" aria-label="Photograph" onMouseDown={event => { if (event.target === event.currentTarget) setActivePhoto(''); }}>
      <button type="button" className="pb-lightbox-close" onClick={() => setActivePhoto('')} aria-label="Close photograph"><X size={23} /></button>
      <button type="button" className="pb-lightbox-nav is-left" onClick={() => navigatePhoto(-1)} disabled={modalIndex <= 0} aria-label="Previous photograph"><ChevronLeft size={26} /></button>
      <figure>
        <div className="pb-lightbox-photo" style={{ backgroundColor: modalTone }} onPointerDown={onPhotoPointerStart} onPointerMove={onPhotoPointerMove} onPointerUp={onPhotoPointerEnd} onPointerCancel={clearPhotoGesture} onLostPointerCapture={clearPhotoGesture}>
          <img className="pb-lightbox-photo-ambient" src={shownPhoto?.url || photoUrl(modalAsset)} alt="" aria-hidden="true" draggable="false" />
          <img key={shownPhoto?.assetId || modalAsset.assetId} className={'pb-lightbox-photo-main ' + (photoDirection > 0 ? 'is-next' : 'is-previous')} src={shownPhoto?.url || photoUrl(modalAsset)} alt={shownPhoto?.alt || modalAsset.alt || 'Finished photograph'} draggable="false" />
        </div>
        <ImageWaiting state={lightboxReady} />
        <figcaption>Photograph {modalIndex + 1} of {visible.length}{visible.length > 1 && <span className="pb-swipe-hint"> · Swipe to browse</span>}</figcaption>
        {!!similarShots.length && <details className="pb-similar-shot"><summary>Similar photos</summary><div className="pb-similar-head"><strong>Similar photos</strong><button type="button" className="pb-similar-play" onClick={() => setShowSlideshowSetup(true)} aria-haspopup="dialog"><span className="pb-similar-play-icon" aria-hidden="true"><Play size={12} fill="currentColor" /></span><span>Play these photos</span></button></div><div className="pb-similar-list">{similarShots.map(asset => <button type="button" key={asset.assetId} onClick={() => showRelatedPhoto(asset)} aria-label={`Open a similar shot: ${asset.alt || 'photo'}`}><img src={photoUrl(asset)} alt="" loading="lazy" /></button>)}</div></details>}
      </figure>
      <button type="button" className="pb-lightbox-nav is-right" onClick={() => navigatePhoto(1)} disabled={modalIndex >= visible.length - 1} aria-label="Next photograph"><ChevronRight size={26} /></button>
      <div className="pb-lightbox-actions">{<button type="button" disabled={!lightboxReady.ready} onClick={() => openWhatsApp('photo', modalAsset.assetId, delivery?.title || 'Photo gallery')}><MessageCircle size={17} /> Share on WhatsApp</button>}{canDownloadPhoto && <button type="button" disabled={!lightboxReady.ready} onClick={() => downloadPhoto(modalAsset, modalIndex)}><Download size={17} /> Download photo</button>}</div>
    </div>}

    {soundtrackUrl && <audio ref={musicRef} crossOrigin="anonymous" src={soundtrackUrl} preload="none" loop onError={() => { setMusicMuted(true); if (slideshow) setSlideshowMessage('Music could not load. The slideshow will keep playing without it.'); }} />}

    <AnimatePresence>
      {showSlideshowSetup && <motion.div className="pb-status-backdrop pb-slideshow-backdrop" role="presentation" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .24 }} onMouseDown={event => { if (event.target === event.currentTarget) closeSlideshowSetup(); }}>
        <motion.section className="pb-slideshow-setup" role="dialog" aria-modal="true" aria-labelledby="pb-slideshow-setup-title" initial={reducedMotion ? false : { opacity: 0, y: 22, scale: .975 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .985 }} transition={{ duration: reducedMotion ? 0 : .38, ease: [0.22, 1, 0.36, 1] }}>
          <button type="button" className="pb-dialog-close" onClick={closeSlideshowSetup} aria-label="Close slideshow settings"><X size={20} /></button>
          <span className="pb-kicker">GRIDBOARD SLIDESHOW</span>
          <h2 id="pb-slideshow-setup-title">Choose the photos to play.</h2>
          <p>Play the whole board or follow one part of the shoot. Music starts with the slideshow if your photographer added it.</p>
          <fieldset className="pb-slideshow-options" disabled={!!slideshowOpening} aria-busy={!!slideshowOpening}>
            {similarSlideAssets.length > 1 && <section className="pb-slide-choice-section"><h3>FROM THIS PHOTO</h3><SlideshowChoice title="Similar photos" detail={`${similarSlideAssets.length} photographs with a similar look`} cover={modalAsset} onClick={() => void startSlideshow(similarSlideAssets, 'Similar photos')} /></section>}
            {currentSelectionName && <section className="pb-slide-choice-section"><h3>YOUR CURRENT VIEW</h3><SlideshowChoice title={currentSelectionName} detail={`${visible.length} photographs`} cover={visible[0]} onClick={() => void startSlideshow(visible, currentSelectionName)} /></section>}
            <section className="pb-slide-choice-section"><h3>THE COMPLETE BOARD</h3><SlideshowChoice title="Every photograph" detail={`${ordered.length} photographs`} cover={ordered[0]} onClick={() => void startSlideshow(ordered, 'Every photograph')} /></section>
            {!!momentSlides.length && <section className="pb-slide-choice-section"><h3>FIND A MOMENT</h3><div className="pb-slide-choice-grid">{momentSlides.map(moment => <SlideshowChoice key={moment.id} title={moment.title} detail={`${moment.photos.length} photographs`} cover={moment.photos[0]} onClick={() => void startSlideshow(moment.photos, moment.title)} />)}</div></section>}
            {!!colourSlides.filter(group => group.area === 'outfit').length && <section className="pb-slide-choice-section"><h3>OUTFITS</h3><div className="pb-slide-choice-grid">{colourSlides.filter(group => group.area === 'outfit').map(group => <SlideshowChoice key={group.key} title={colorGroupLabel(group)} detail={`${group.photos.length} photographs`} cover={group.photos[0]} onClick={() => void startSlideshow(group.photos, colorGroupLabel(group))} />)}</div></section>}
            {!!colourSlides.filter(group => group.area === 'backdrop').length && <section className="pb-slide-choice-section"><h3>BACKGROUNDS</h3><div className="pb-slide-choice-grid">{colourSlides.filter(group => group.area === 'backdrop').map(group => <SlideshowChoice key={group.key} title={colorGroupLabel(group)} detail={`${group.photos.length} photographs`} cover={group.photos[0]} onClick={() => void startSlideshow(group.photos, colorGroupLabel(group))} />)}</div></section>}
          </fieldset>
          {slideshowOpening && <p className="pb-slideshow-opening" role="status">Opening {slideshowOpening.toLowerCase()}…</p>}
          {!slideshowOpening && slideshowMessage && <p className="pb-slideshow-opening" role="alert">{slideshowMessage}</p>}
          <label className="pb-slideshow-speed">Time per photo<select value={slideSeconds} disabled={!!slideshowOpening} onChange={event => setSlideSeconds(Number(event.target.value))}><option value="4">4 seconds</option><option value="5">5 seconds</option><option value="7">7 seconds</option><option value="9">9 seconds</option></select></label>
        </motion.section>
      </motion.div>}
    </AnimatePresence>

    <AnimatePresence>
      {slideshowAsset && <motion.section className={'pb-slideshow' + (slideshow.completed ? ' is-complete' : '')} role="dialog" aria-modal="true" aria-label="GridBoard slideshow" initial={reducedMotion ? false : { opacity: 0, y: 30, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: .965 }} transition={{ duration: reducedMotion ? 0 : .55, ease: [0.22, 1, 0.36, 1] }}>
      <header><div><span>GRIDBOARD SLIDESHOW</span><small>{slideshow.title} · {(displayedSlide?.index ?? slideshow.index) + 1} / {slideshow.assetIds.length}</small></div><button type="button" onClick={() => setSlideshow(null)} aria-label="Close slideshow"><X size={20} />Close</button></header>
      <div className="pb-slideshow-image">
        <AnimatePresence mode="sync" custom={slideshow.direction}>
          {displayedSlide && <SlideshowFrame key={`${displayedSlide.assetId}:${displayedSlide.visit}`} slide={displayedSlide}
            seconds={slideshow.interval} paused={slideshow.paused || slideshow.completed || slideLoading}
            direction={slideshow.direction} reducedMotion={reducedMotion} />}
        </AnimatePresence>
        {!displayedSlide && <span className="pb-slide-loading" role="status">Opening photographs…</span>}
        {slideLoading && displayedSlide && <span className="pb-slide-loading-indicator" role="status">Loading next photograph</span>}
        {!slideshow.completed && <motion.div className="pb-slide-context" initial={reducedMotion ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3, duration: .5 }}>{slideshow.title}</motion.div>}
        {!slideshow.completed && <div className="pb-slide-index" aria-hidden="true"><AnimatePresence mode="popLayout"><motion.strong key={displayedSlide?.visit ?? 0} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: reducedMotion ? 0 : .4 }}>{String((displayedSlide?.index ?? slideshow.index) + 1).padStart(2, '0')}</motion.strong></AnimatePresence><i />{String(slideshow.assetIds.length).padStart(2, '0')}</div>}
        <AnimatePresence>
          {slideshow.completed && <motion.div className="pb-slideshow-ending" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .6 }}>
            <motion.div initial={reducedMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .7, delay: reducedMotion ? 0 : .15 }}>
              <span>{slideshow.title}</span><h2>There’s more to explore.</h2>
              <p>Watch {slideshow.assetIds.length === 1 ? 'this photo' : `these ${slideshow.assetIds.length} photos`} again, or return to your board.</p>
              <div><button type="button" onClick={replaySlideshow}><RotateCcw size={17} />Replay slideshow</button><button type="button" onClick={() => setSlideshow(null)}><Image size={17} />Back to board</button></div>
            </motion.div>
          </motion.div>}
        </AnimatePresence>
      </div>
      <div className="pb-slideshow-progress" aria-hidden="true"><span style={{ width: `${slideshow.completed ? 100 : ((displayedSlide?.index ?? slideshow.index) / slideshow.assetIds.length) * 100}%` }} />{displayedSlide && !slideshow.completed && <i key={`${displayedSlide.assetId}:${displayedSlide.visit}`} className={slideshow.paused || slideLoading ? 'is-paused' : ''} style={{ left: `${(displayedSlide.index / slideshow.assetIds.length) * 100}%`, width: `${100 / slideshow.assetIds.length}%`, animationDuration: `${slideshow.interval}s` }} />}</div>
      <footer><span aria-live="polite">{slideshow.completed ? 'Slideshow finished' : `Photograph ${(displayedSlide?.index ?? slideshow.index) + 1} of ${slideshow.assetIds.length}`}</span>
        {!slideshow.completed && <div><button type="button" onClick={() => navigateSlideshow(-1)} disabled={slideshow.index === 0} aria-label="Previous photo"><SkipBack size={18} /></button><button type="button" onClick={toggleSlideshowPause} aria-label={slideshow.paused ? 'Resume slideshow' : 'Pause slideshow'}>{slideshow.paused ? <Play size={19} /> : <Pause size={19} />}</button><button type="button" onClick={() => navigateSlideshow(1)} aria-label="Next photo"><SkipForward size={18} /></button></div>}
        {!slideshow.completed && (soundtrackUrl ? <button type="button" className="pb-slide-music" onClick={() => void toggleMusic()} aria-pressed={!musicMuted}>{musicMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}{musicMuted ? 'Sound off' : 'Sound on'}</button> : <span className="pb-slide-no-music">No soundtrack added</span>)}
      </footer>{slideshowMessage && <p className="pb-slideshow-message" role="status">{slideshowMessage}</p>}
      </motion.section>}
    </AnimatePresence>

    {statusOpen && <div className="pb-status-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeStatusCard(); }}>
      <section className="pb-status-dialog" role="dialog" aria-modal="true" aria-labelledby="pb-status-title">
        <button type="button" className="pb-dialog-close" onClick={closeStatusCard} aria-label="Close"><X size={20} /></button>
        <span className="pb-kicker">SHARE YOUR GALLERY</span>
        {statusCard ? <>
          <h2 id="pb-status-title">Your card is ready.</h2>
          <p>The card shows your photos and studio name. Add it to your WhatsApp Status or Instagram Story, then add the gallery link so people can open the full set.</p>
          <div className="pb-status-result">
            <img src={statusCard.url} alt="Finished vertical Status card with selected photographs and gallery details" />
            <div className="pb-status-result-actions">
              <span className="pb-kicker">1080 × 1920 · READY TO SHARE</span>
              <h3>Give people a way in.</h3>
              <p>Save the image, post it to your Status or Story, and paste the private gallery link alongside it. The card also includes a QR code on published galleries.</p>
              <button type="button" className="pb-status-primary" onClick={saveStatusCard}><Download size={17} /> Save card</button>
              <button type="button" onClick={() => void copyStatusLink()}><ExternalLink size={17} /> Copy gallery link</button>
              {typeof navigator !== 'undefined' && !!navigator.share && <button type="button" onClick={() => void shareStatusCard()}><MessageCircle size={17} /> Share from this device</button>}
              <button type="button" className="pb-status-back" onClick={() => { setStatusCard(null); setMessage(''); }}>Choose different photos</button>
            </div>
          </div>
        </> : <>
          <h2 id="pb-status-title">Make a Status card.</h2>
          <p>Choose up to four finished photos. We’ll make a vertical card for WhatsApp Status or Instagram Story that points people to this gallery.</p>
          <div className="pb-status-photos">{statusPageAssets.map((asset, index) => { const photoIndex = statusPage * statusPageSize + index; return <label key={asset.assetId} className={statusSelection.includes(asset.assetId) ? 'is-selected' : ''}><input type="checkbox" checked={statusSelection.includes(asset.assetId)} onChange={() => toggleStatusPhoto(asset.assetId)} disabled={!statusSelection.includes(asset.assetId) && statusSelection.length >= 4} /><img src={photoUrl(asset)} alt={`Select photo ${photoIndex + 1}`} loading="lazy" /><span>{statusSelection.includes(asset.assetId) && <Check size={15} />}{photoIndex + 1}</span></label>; })}</div>
          {statusPageCount > 1 && <div className="pb-status-pagination"><button type="button" onClick={() => setStatusPage(page => Math.max(0, page - 1))} disabled={statusPage === 0}>Previous photos</button><span>{statusPage + 1} / {statusPageCount}</span><button type="button" onClick={() => setStatusPage(page => Math.min(statusPageCount - 1, page + 1))} disabled={statusPage >= statusPageCount - 1}>More photos</button></div>}
          <div className="pb-status-bottom"><span>{statusSelection.length} of 4 selected</span><button type="button" disabled={!statusSelection.length || busy} onClick={createStatusCard}>{busy ? 'Preparing card…' : 'Preview Status card'}<ExternalLink size={16} /></button></div>
        </>}
        {message && <p className="pb-status-message" role="status">{message}</p>}
      </section>
    </div>}
    {!statusOpen && message && <div className="pb-toast" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss"><X size={15} /></button></div>}
  </main>;
}
