import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowDown, ChevronLeft, ChevronRight, Images, List, RefreshCw, X } from 'lucide-react';
import { Photo } from '../PublicDesign.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import ClientGallery from './ClientGallery.jsx';
import { DemoHeader, getFormatThemeStyles } from './formatShared.jsx';
import { usePresentation, useReadyPhotos, ImageWaiting } from './PresentationShell.jsx';
import { canvasCheckpoints } from '../../utils/canvas.js';
import { canvasBoardLayout, canvasBoardPaths, canvasPrintPose } from '../../utils/canvasBoardLayout.js';
import { photoStoryChrome } from '../../utils/photoStoryChrome.js';
import { CANVAS_DEMO_DELIVERY } from '../../constants/canvasDemo.js';
import './CanvasBoard.css';

const number = value => String(value).padStart(2, '0');
const arrival = (reduced, stationary = false) => ({ initial: reduced ? false : { opacity: 0, y: stationary ? 0 : 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : stationary ? .35 : .55, ease: [.22, 1, .36, 1] } });

function PrintDepth({ target, amplitude, children }) {
  const { scrollYProgress } = useScroll({ target, offset: ['start end', 'end start'] });
  const offset = useTransform(scrollYProgress, progress => (.5 - progress) * 2 * amplitude);
  const drift = useSpring(offset, { stiffness: 180, damping: 35, restDelta: .05 });
  return <motion.div className="cv-frame-drift" style={{ y: drift }}>{children}</motion.div>;
}

function CanvasPrint({ photo, id, index, place, frame, pose, reduced, ordered, touch, open, measureRef, onArrival }) {
  // Measurements arrive after mounting; give the first arrival its direction too.
  pose = pose || canvasPrintPose(index, window.innerWidth < 668, ordered, photo.width > photo.height);
  const target = useRef(null);
  const stationary = touch || pose.phone;
  const interactive = !reduced && !stationary;
  const delay = reduced ? 0 : stationary ? Math.min(place, 2) * .06 : Math.min(place, 3) * .12;
  const surface = <>{index % 3 === 0 && <span className="cv-frame-alignment" aria-hidden="true" />}
    <motion.div layoutId={`canvas-photo-${id}`} className="cv-frame-surface" tabIndex={-1}
      initial={reduced ? false : { rotate: pose.tilt + (stationary || ordered ? 0 : pose.turn) }} whileInView={{ rotate: reduced ? 0 : pose.tilt }} viewport={{ once: true, amount: .12 }}
      whileHover={interactive ? { rotate: pose.tilt * .45, y: -7, transition: { duration: .25, ease: [.22, 1, .36, 1] } } : undefined}
      whileTap={interactive ? { scale: .985, y: -2, transition: { duration: .15 } } : undefined}
      transition={{ duration: reduced || stationary ? 0 : .82, delay: stationary ? 0 : delay, ease: [.22, 1, .36, 1], layout: { duration: reduced ? 0 : .48, ease: [.22, 1, .36, 1] } }}>
      <button type="button" className="fd-wall-card cv-photo-open" onClick={event => open(photo, event)} aria-label={`Open photograph ${index + 1}`}>
        <Photo url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet} alt={photo.alt} eager={index < 2} draggable={false} style={{ objectPosition: photo.focalPoint || '50% 50%' }} sizes="(max-width: 640px) 72vw, (max-width: 1024px) 35vw, 460px" onError={event => { event.currentTarget.closest('.cv-frame').classList.add('has-error'); }} />
        <span className="cv-photo-number" aria-hidden="true">{number(index + 1)}</span>
      </button><button type="button" className="cv-frame-retry" onClick={event => { const frame = event.currentTarget.closest('.cv-frame'), image = frame.querySelector('img'); frame.classList.remove('has-error'); image.src = photo.url; image.srcset = photo.srcSet || ''; }}><RefreshCw size={16} />Retry photo</button>
    </motion.div>
  </>;
  return <motion.figure ref={target} className={`cv-frame ${photo.width > photo.height ? 'is-landscape' : ''}`}
    initial={reduced ? false : { opacity: 0, x: stationary ? 0 : pose.x, y: stationary ? 0 : pose.y }}
    whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, amount: .12 }} onViewportEnter={() => onArrival(id)}
    transition={{ duration: reduced ? 0 : stationary ? .35 : .72, delay, ease: [.22, 1, .36, 1] }}
    style={{ left: frame?.x, top: frame?.y, width: frame?.width, '--cv-ratio': photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4', '--cv-tilt': `${pose?.tilt || 0}deg` }}>
    {interactive && !ordered && pose.drift > 0 ? <PrintDepth target={target} amplitude={pose.drift}>{surface}</PrintDepth> : <div className="cv-frame-drift">{surface}</div>}
    <figcaption ref={measureRef} className="cv-frame-label"><span className="cv-frame-index">{number(index + 1)}</span>{photo.headline && <strong>{photo.headline}</strong>}</figcaption>
  </motion.figure>;
}

function BoardPhoto({ photo, eager, ...props }) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  return <><Photo key={attempt} url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet} alt={photo.alt} eager={eager} onError={() => setFailed(true)} {...props} />{failed && <span className="cv-photo-error"><span>Photo could not load.</span><button type="button" onClick={event => { event.stopPropagation(); setFailed(false); setAttempt(value => value + 1); }}><RefreshCw size={16} />Retry photo</button></span>}</>;
}

function Bookend({ delivery, kind, photos, reduced, touch, onGallery, edgeId, position, measureRef }) {
  const opening = kind === 'opening', photo = photos.find(photo => photo.assetId === delivery.v3?.[opening ? 'openingAssetId' : 'closingAssetId']) || (opening ? photos[0] : photos.at(-1));
  const showPhoto = photo && photo.assetId !== edgeId;
  return <section ref={measureRef} className={`cv-bookend is-${kind} ${showPhoto ? 'has-photo' : ''}`} style={position}>
    {showPhoto && <div className="cv-bookend-image"><BoardPhoto photo={photo} eager={opening} sizes="160px" style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4', objectPosition: photo.focalPoint || '50% 50%' }} /></div>}
    <motion.div className="cv-bookend-copy" {...arrival(reduced, touch)}><span>{opening ? `${delivery.clientName || 'YOUR PHOTOGRAPHS'} / CANVAS` : 'ALL YOUR PHOTOGRAPHS'}</span>{opening ? <h1>{delivery.creativeDirection?.title || delivery.title || delivery.clientName || 'Your canvas'}</h1> : <h2>Yours to keep.</h2>}<p>{delivery.creativeDirection?.[opening ? 'openingLine' : 'closingLine'] || (opening ? 'Take your time. Open any photograph for a closer look.' : 'Your finished photographs are ready to view and keep.')}</p>{!opening && <button type="button" onClick={onGallery}><Images size={18} />View full gallery</button>}</motion.div>
  </section>;
}

function CanvasFocus({ all, selection, setSelection, onClose, triggerRef, reduced, onNavigate }) {
  const panel = useRef(null), gesture = useRef(null);
  useDialogFocus(true, panel, onClose, triggerRef);
  const photos = selection.scope ? all.filter(photo => selection.scope.includes(photo.assetId)) : all;
  const index = Math.max(0, photos.findIndex(photo => photo.assetId === selection.id));
  const next = offset => { const photo = photos[index + offset]; if (photo) { setSelection(current => ({ ...current, id: photo.assetId })); onNavigate?.(photo.assetId); } };
  const limitedConnection = navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '');
  const state = useReadyPhotos([photos[index]], limitedConnection ? [] : [photos[index + 1], photos[index - 1], photos[index + 2]]);
  const readyPhoto = state.photos[0] || photos[index];
  const shown = { ...(photos.find(photo => photo.assetId === readyPhoto.assetId) || readyPhoto), url: readyPhoto.url, srcSet: readyPhoto.srcSet };
  const shownIndex = photos.findIndex(photo => photo.assetId === shown.assetId);
  useEffect(() => {
    const key = event => { if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return; if (event.key === 'ArrowRight') { event.preventDefault(); next(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); next(-1); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [index, selection.scope, all]);
  const pointerStart = event => {
    if (event.target.closest('button,a,input,select,textarea')) return;
    if (!event.isPrimary || event.button !== 0) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerEnd = event => {
    const start = gesture.current; gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (Math.abs(x) > 48 && Math.abs(x) > Math.abs(y) * 1.25) next(x < 0 ? 1 : -1);
  };
  return <motion.div className="fd-canvas-focus cv-focus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={panel} role="dialog" aria-modal="true" aria-label="Canvas photograph" tabIndex={-1} initial={reduced ? false : { y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={reduced ? undefined : { y: 10, scale: .98 }}>
      <header className="cv-focus-header"><div><span>{selection.scope ? selection.title || 'Photo group' : 'The whole canvas'}</span><small aria-live="polite">{number(index + 1)} / {number(photos.length)}{!state.ready && ' · Loading'}</small></div>{selection.scope && <button type="button" onClick={() => setSelection(current => ({ ...current, scope: null }))}>Browse all {all.length} photos</button>}<button className="fd-canvas-focus-close" type="button" onClick={onClose} aria-label="Return to canvas"><X size={20} /></button></header>
      <div className="cv-focus-layout"><div className="cv-focus-image" onPointerDown={pointerStart} onPointerUp={pointerEnd} onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}>
        {shown && <motion.figure layoutId={`canvas-photo-${shown.assetId}`} transition={{ duration: reduced ? 0 : .48, ease: [.22, 1, .36, 1] }}><Photo key={shown.assetId} url={state.photos.length ? shown.url : shown.thumbnailUrl || shown.url} srcSet={state.photos.length ? shown.srcSet : undefined} alt={shown.alt} eager draggable={false} sizes="(max-width: 640px) 94vw, (max-width: 1024px) 80vw, 1100px" /></motion.figure>}
        <ImageWaiting state={state} onSkip={index < photos.length - 1 ? () => next(1) : undefined} skipLabel="Next photo" />
      </div><div className="fd-canvas-focus-copy cv-focus-copy"><motion.div key={shown?.assetId} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .38, delay: .16, ease: [.22, 1, .36, 1] }}>{shown && <><span>PHOTOGRAPH {number(shownIndex + 1)}</span>{shown.headline && <h2>{shown.headline}</h2>}<p>{shown.caption}</p></>}</motion.div><nav aria-label="Photograph navigation"><button type="button" disabled={index === 0} onClick={() => next(-1)}><ChevronLeft size={18} />Previous</button><button type="button" disabled={index === photos.length - 1} onClick={() => next(1)}>Next<ChevronRight size={18} /></button></nav></div></div>
    </motion.section>
  </motion.div>;
}

export default function CanvasBoard({ delivery: supplied, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const delivery = supplied || CANVAS_DEMO_DELIVERY, initialReduced = useReducedMotion();
  const [reduced, setReduced] = useState(initialReduced);
  const [finePointer, setFinePointer] = useState(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update(); preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const preference = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFinePointer(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const pathPrefix = useId(), context = usePresentation(delivery, galleryProps, !supplied);
  const { photos, all } = context;
  const points = useMemo(() => canvasCheckpoints(delivery, photos.map(photo => photo.assetId)), [delivery, photos]);
  const byId = useMemo(() => new Map(photos.map(photo => [photo.assetId, photo])), [photos]);
  const board = useRef(null), nodes = useRef(new Map()), metrics = useRef(new Map()), trigger = useRef(null);
  const [composition, setComposition] = useState(null), [active, setActive] = useState(points[0]?.id), [visited, setVisited] = useState(new Set());
  const [selection, setSelection] = useState(null), [gallery, setGallery] = useState(false), [directory, setDirectory] = useState(false), [jumped, setJumped] = useState(null);
  const [boardVisible, setBoardVisible] = useState(false);
  const [arrivedPhotos, setArrivedPhotos] = useState(new Set());
  const settings = delivery.formatConfig?.canvas || {};
  const requestedTheme = getFormatThemeStyles(delivery, { bg: '#0c1b16', surface: '#eee5d8', text: '#efe6d6', accent: '#c8ac8c' });
  const ink = photoStoryChrome(requestedTheme['--fd-bg'], requestedTheme['--fd-text'], requestedTheme['--fd-accent']);
  const theme = { ...requestedTheme, '--fd-text': ink['--story-text'], '--cv-line': ink['--story-chrome-accent'] };
  const order = points.flatMap(point => point.assetIds), orderedPhotos = order.map(id => byId.get(id)).filter(Boolean);
  const signature = points.map(point => `${point.id}:${point.assetIds.join(',')}`).join('|');
  const copySignature = JSON.stringify([points.map(point => [point.title, point.note]), photos.map(photo => [photo.headline, photo.width, photo.height]), delivery.creativeDirection?.typography, delivery.creativeDirection?.title, delivery.creativeDirection?.openingLine, delivery.creativeDirection?.closingLine, delivery.v3?.openingAssetId, delivery.v3?.closingAssetId]);
  const metric = key => node => { if (node) metrics.current.set(key, node); else metrics.current.delete(key); };
  useEffect(() => { setSelection(null); setVisited(new Set()); setArrivedPhotos(current => new Set([...current].filter(id => byId.has(id)))); setActive(current => points.some(point => point.id === current) ? current : points[0]?.id); }, [signature]);
  useLayoutEffect(() => {
    if (!board.current) return;
    let frame, disposed = false;
    const measure = () => {
      if (disposed || !board.current) return;
      const width = board.current.clientWidth;
      if (!width) return;
      const layout = canvasBoardLayout({ width, points, photos: byId, introHeight: metrics.current.get('opening')?.offsetHeight || 220, closingHeight: metrics.current.get('closing')?.offsetHeight || 180, measure: key => metrics.current.get(key)?.offsetHeight || 0, ordered: settings.arrangement === 'ordered' });
      const next = { ...layout, paths: canvasBoardPaths(layout, points, width) };
      setComposition(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const schedule = () => { if (disposed) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(board.current); metrics.current.forEach(node => observer.observe(node));
    measure(); document.fonts?.ready.then(schedule);
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [signature, copySignature, settings.arrangement]);
  useEffect(() => {
    const visible = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { visible.set(entry.target.id, entry.isIntersecting); if (entry.isIntersecting) setVisited(current => current.has(entry.target.dataset.point) ? current : new Set([...current, entry.target.dataset.point])); });
      const current = points.find(point => visible.get(`cv-${point.id}`));
      if (current) setActive(current.id);
      else if (board.current?.getBoundingClientRect().top > innerHeight * .55) setActive(points[0]?.id);
    }, { rootMargin: '-18% 0px -45% 0px', threshold: 0 });
    const presence = new IntersectionObserver(entries => setBoardVisible(entries[0].isIntersecting));
    if (board.current) presence.observe(board.current);
    nodes.current.forEach(node => observer.observe(node)); return () => { observer.disconnect(); presence.disconnect(); };
  }, [signature]);
  useEffect(() => { if (!jumped) return; const timer = setTimeout(() => setJumped(null), 1600); return () => clearTimeout(timer); }, [jumped]);
  const jump = id => { setDirectory(false); setJumped(id); setActive(id); nodes.current.get(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); };
  const open = (photo, event) => { window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: 'instant' }); trigger.current = event.currentTarget; setSelection({ id: photo.assetId, scope: null, title: '' }); onNarrationNavigate?.(photo.assetId); };
  const groupOpen = (point, event) => { window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: 'instant' }); trigger.current = event.currentTarget; setSelection({ id: point.assetIds[0], scope: point.assetIds, title: point.title }); onNarrationNavigate?.(point.assetIds[0]); };
  const paths = composition?.paths || [];
  const touch = !finePointer || composition?.phone;
  const markArrived = id => setArrivedPhotos(current => current.has(id) ? current : new Set([...current, id]));
  const bookendPosition = kind => composition ? { left: composition[kind].x, top: composition[kind].y, width: composition[kind].width } : undefined;
  return <div className="fd-page fd-canvas cv-board" style={theme} data-touch={touch ? 'true' : 'false'} data-arrangement={settings.arrangement || 'spatial'}>
    <DemoHeader format="Canvas" client={delivery.clientName || delivery.title} sectionId="canvas" delivery={supplied} onGallery={() => setGallery(true)} audioState={audioState} toggleAudio={toggleAudio} />
    <main className="cv-main">
      <div className="cv-intro-bar"><span>YOUR CANVAS</span><button type="button" onClick={() => jump(points[0]?.id)}>Explore the canvas<ArrowDown size={16} /></button></div>
      <LayoutGroup id={`canvas-${delivery.publicId || delivery._id || 'demo'}`}><div className="cv-path-board" ref={board} style={{ height: composition?.height || 1800 }}>
        <Bookend delivery={delivery} kind="opening" photos={all} reduced={reduced} touch={touch} edgeId={order[0]} position={bookendPosition('intro')} measureRef={metric('opening')} />
        <div className="cv-board-count"><span>{number(photos.length)} PHOTOGRAPHS</span><span>{number(points.length)} CHECKPOINTS</span></div>
        <svg className="fd-wall-paths cv-paths" aria-hidden="true"><defs>{paths.map((path, index) => <mask key={path.id} id={`${pathPrefix}-line-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><motion.path d={path.d} stroke="white" strokeWidth="5" fill="none" pathLength={1} style={{ strokeDasharray: 'var(--cv-line-length, 0) 1', strokeDashoffset: 0 }} initial={false} animate={{ '--cv-line-length': reduced || (path.assetId ? arrivedPhotos.has(path.assetId) : visited.has(path.next) || visited.has(path.pointId)) ? 1 : 0 }} transition={{ duration: reduced ? 0 : .7, delay: path.assetId ? .18 : 0, ease: 'easeOut' }} /></mask>)}</defs>{paths.map((path, index) => <path key={path.id} d={path.d} mask={`url(#${pathPrefix}-line-${index})`} />)}</svg>
        {points.map((point, at) => {
          const placement = composition?.points[at];
          return <section key={point.id} id={`cv-${point.id}`} data-point={point.id} data-type={point.type} ref={node => { if (node) nodes.current.set(point.id, node); else nodes.current.delete(point.id); }} style={placement ? { left: placement.x, top: placement.y, width: placement.width, height: placement.height } : { visibility: 'hidden' }} className={`cv-checkpoint ${point.type === 'group' ? 'is-group' : 'is-single'} ${active === point.id ? 'is-current' : ''} ${jumped === point.id ? 'is-jumped' : ''}`}>
            <button type="button" className="cv-point-marker" style={placement ? { left: placement.marker.x - placement.x, top: placement.marker.y - placement.y } : undefined} aria-label={`Checkpoint ${at + 1}`} onClick={() => jump(point.id)}><motion.span initial={false} animate={{ opacity: visited.has(point.id) ? 1 : .75, scale: visited.has(point.id) ? 1 : .94 }} transition={{ duration: reduced ? 0 : .35, ease: [.22, 1, .36, 1] }}>{number(at + 1)}</motion.span></button>
            <div className="cv-checkpoint-content">{point.type === 'group' && <motion.header ref={metric(`heading:${point.id}`)} className="cv-group-heading" style={placement ? { left: placement.headingX, top: placement.headingY, width: placement.headingWidth } : undefined} {...arrival(reduced, touch)}><button type="button" onClick={event => groupOpen(point, event)} aria-label={`Open ${point.title || 'photo group'}`}><span>GROUP / {point.assetIds.length} PHOTOS</span><h3>{point.title}<ChevronRight size={18} /></h3>{settings.showGroupNotes !== false && point.note && <p>{point.note}</p>}</button></motion.header>}
              <div className="cv-photo-composition">{point.assetIds.map((id, place) => {
                const photo = byId.get(id), index = order.indexOf(id), frame = placement?.frames[place]; if (!photo) return null;
                const global = composition?.frames.find(item => item.id === id);
                return <React.Fragment key={id}>{point.type === 'group' && global && <span className="cv-photo-anchor" aria-hidden="true" style={{ left: global.anchor.x - placement.x, top: global.anchor.y - placement.y }} />}<CanvasPrint photo={photo} id={id} index={index} place={place} frame={frame} pose={global?.pose} reduced={reduced} touch={touch} ordered={settings.arrangement === 'ordered'} open={open} measureRef={metric(`label:${id}`)} onArrival={markArrived} /></React.Fragment>;
              })}</div>
            </div>
          </section>;
        })}
        <Bookend delivery={delivery} kind="closing" photos={all} reduced={reduced} touch={touch} edgeId={order.at(-1)} position={bookendPosition('closing')} measureRef={metric('closing')} onGallery={() => setGallery(true)} />
      </div><AnimatePresence>{selection && byId.has(selection.id) && (!selection.scope || selection.scope.some(id => byId.has(id))) && <CanvasFocus all={orderedPhotos} selection={selection} setSelection={setSelection} onClose={() => setSelection(null)} triggerRef={trigger} reduced={reduced} onNavigate={onNarrationNavigate} />}</AnimatePresence></LayoutGroup>
      <footer className="cv-board-footer"><span>Photographed by {delivery.branding?.name || 'Veylo Studio'}</span><span>{photos.length} photographs on your Canvas</span></footer>
    </main>
    {boardVisible && <aside className={`cv-directory ${directory ? 'is-open' : ''}`} aria-label="Canvas checkpoints"><button type="button" className="cv-directory-toggle" aria-expanded={directory} onClick={() => setDirectory(value => !value)}><List size={18} /><span>Checkpoints</span><small>{number(Math.max(0, points.findIndex(point => point.id === active)) + 1)} / {number(points.length)}</small></button>{directory && <motion.nav initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .2 }}>{points.map((point, index) => <button type="button" key={point.id} aria-current={point.id === active ? 'location' : undefined} onClick={() => jump(point.id)}><span>{number(index + 1)}</span><strong>{point.title || byId.get(point.assetIds[0])?.headline || `Photograph ${number(order.indexOf(point.assetIds[0]) + 1)}`}</strong><small>{point.assetIds.length} {point.type === 'group' ? 'photos' : 'photo'}</small></button>)}</motion.nav>}</aside>}
    <AnimatePresence>{gallery && <ClientGallery photos={all} delivery={delivery} title={delivery.title || delivery.clientName} fontStyles={theme} onClose={() => setGallery(false)} {...context.galleryProps} />}</AnimatePresence>
  </div>;
}
