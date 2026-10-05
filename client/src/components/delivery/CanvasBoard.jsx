import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ChevronLeft, ChevronRight, Images, Pause, Play, RefreshCw, X } from 'lucide-react';
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
const photoMotions = ['slow-push', 'pan-left', 'slow-pull', 'pan-right', 'float'];
const arrival = (reduced, stationary = false) => ({ initial: reduced ? false : { opacity: 0, y: stationary ? 0 : 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : stationary ? .35 : .55, ease: [.22, 1, .36, 1] } });

// Cache geometry when the composition changes. Scrolling only writes transforms
// for nearby prints; it never measures every photograph or updates React state.
function useCanvasScrollMotion(board, composition, enabled, frameDrift) {
  useEffect(() => {
    if (!board.current || !composition || !enabled) return;
    const visible = new Set(), prints = new Map();
    const geometry = new Map(composition.frames.map(frame => [frame.id, frame]));
    let scheduled = 0, top = 0, viewport = innerHeight, disposed = false;
    board.current.querySelectorAll('.cv-frame').forEach(node => {
      prints.set(node, { frame: geometry.get(node.dataset.photo), surface: node.querySelector('.cv-frame-drift'), image: node.querySelector('.cv-photo-image-scroll'), aperture: node.querySelector('.cv-photo-open') });
    });
    const paint = () => {
      scheduled = 0;
      if (disposed || document.hidden) return;
      const scroll = window.scrollY;
      visible.forEach(node => {
        const { frame, surface, image } = prints.get(node);
        if (!frame || !surface) return;
        const progress = Math.max(-1, Math.min(1, (top + frame.y + frame.height / 2 - scroll - viewport / 2) / ((viewport + frame.height) / 2)));
        if (frameDrift) surface.style.transform = `translate3d(0, ${(progress * frame.pose.drift).toFixed(2)}px, 0)`;
        if (image && node.dataset.imageMotion !== 'still') image.style.transform = `translate3d(0, ${progress.toFixed(2)}%, 0) scale(1.03)`;
      });
    };
    const schedule = () => { if (!scheduled && !disposed && !document.hidden) scheduled = requestAnimationFrame(paint); };
    const measure = () => {
      if (disposed) return;
      top = board.current.getBoundingClientRect().top + window.scrollY;
      viewport = innerHeight;
      schedule();
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const node = entry.target.closest('.cv-frame');
        node.dataset.photoVisible = entry.isIntersecting ? 'true' : 'false';
        if (entry.isIntersecting) visible.add(node);
        else visible.delete(node);
      });
      schedule();
    }, { threshold: .01 });
    prints.forEach(({ aperture }) => observer.observe(aperture));
    const resize = new ResizeObserver(measure);
    resize.observe(board.current.parentElement);
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    const visibility = () => { board.current?.setAttribute('data-page-hidden', document.hidden ? 'true' : 'false'); schedule(); };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      cancelAnimationFrame(scheduled);
      observer.disconnect(); resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', visibility);
      prints.forEach((_, node) => { node.dataset.photoVisible = 'false'; });
    };
  }, [board, composition, enabled, frameDrift]);
}

function useCanvasConnections(board, composition) {
  const revealed = useRef(new Set());
  useEffect(() => {
    if (!board.current || !composition) return;
    const paths = composition.paths;
    const connections = new Map([...board.current.querySelectorAll('.cv-paths')].map(node => [node.dataset.connection, node]));
    revealed.current = new Set([...revealed.current].filter(id => connections.has(id)));
    const reveal = id => {
      revealed.current.add(id);
      connections.get(id)?.setAttribute('data-revealed', 'true');
    };
    revealed.current.forEach(reveal);
    const prints = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) paths.filter(path => path.assetId === entry.target.dataset.photo).forEach(path => reveal(path.id));
    }), { threshold: .12 });
    const points = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.setAttribute('data-visited', 'true');
      paths.filter(path => !path.assetId && (path.pointId === entry.target.dataset.point || path.next === entry.target.dataset.point)).forEach(path => reveal(path.id));
    }), { rootMargin: '-18% 0px -45% 0px', threshold: 0 });
    board.current.querySelectorAll('.cv-frame').forEach(node => prints.observe(node));
    board.current.querySelectorAll('.cv-checkpoint').forEach(node => points.observe(node));
    return () => { prints.disconnect(); points.disconnect(); };
  }, [board, composition]);
}

function CanvasConnection({ path }) {
  const { x, y, width, height } = path.bounds;
  return <svg className="cv-paths" data-connection={path.id} aria-hidden="true" viewBox={`${x} ${y} ${width} ${height}`} style={{ left: x, top: y, width, height }}>
    <path d={path.d} />
  </svg>;
}

function CanvasPrint({ photo, id, index, place, frame, pose, reduced, ordered, touch, open, measureRef, stillPhotos, legacyAutoStill }) {
  // Measurements arrive after mounting; give the first arrival its direction too.
  pose = pose || canvasPrintPose(index, window.innerWidth < 668, ordered, photo.width > photo.height);
  const stationary = touch || pose.phone;
  const interactive = !reduced && !stationary;
  const delay = reduced ? 0 : stationary ? Math.min(place, 2) * .06 : Math.min(place, 3) * .12;
  const imageMotion = reduced || stillPhotos || photo.motion === 'still' && !legacyAutoStill ? 'still' : photoMotions.includes(photo.motion) ? photo.motion : photoMotions[index % photoMotions.length];
  const surface = <>{index % 3 === 0 && <span className="cv-frame-alignment" aria-hidden="true" />}
    <motion.div className="cv-frame-surface" tabIndex={-1}
      initial={reduced ? false : { rotate: pose.tilt + (stationary || ordered ? 0 : pose.turn) }} whileInView={{ rotate: reduced ? 0 : pose.tilt }} viewport={{ once: true, amount: .12 }}
      whileHover={interactive ? { rotate: pose.tilt * .45, y: -7, transition: { duration: .25, ease: [.22, 1, .36, 1] } } : undefined}
      whileTap={interactive ? { scale: .985, y: -2, transition: { duration: .15 } } : undefined}
      transition={{ duration: reduced || stationary ? 0 : .82, delay: stationary ? 0 : delay, ease: [.22, 1, .36, 1] }}>
      <button type="button" className="fd-wall-card cv-photo-open" onClick={event => open(photo, event)} aria-label={`Open photograph ${index + 1}`}>
        <span className="cv-photo-image-scroll"><span className="cv-photo-image-motion" style={{ transformOrigin: imageMotion.startsWith('pan-') || imageMotion === 'float' ? '50% 50%' : photo.focalPoint || '50% 35%', animationDuration: `${7 + index % 3}s` }}><Photo url={photo.url} thumbnailUrl={photo.thumbnailUrl} srcSet={photo.srcSet} alt={photo.alt} eager={index < 2} draggable={false} style={{ objectPosition: photo.focalPoint || '50% 50%' }} sizes="(max-width: 640px) 72vw, (max-width: 1024px) 35vw, 460px" onError={event => { event.currentTarget.closest('.cv-frame').classList.add('has-error'); }} /></span></span>
        <span className="cv-photo-number" aria-hidden="true">{number(index + 1)}</span>
      </button><button type="button" className="cv-frame-retry" onClick={event => { const frame = event.currentTarget.closest('.cv-frame'), image = frame.querySelector('img'); frame.classList.remove('has-error'); image.src = photo.url; image.srcset = photo.srcSet || ''; }}><RefreshCw size={16} />Retry photo</button>
    </motion.div>
  </>;
  return <motion.figure className={`cv-frame ${photo.width > photo.height ? 'is-landscape' : ''}`}
    data-photo={id} data-image-motion={imageMotion} initial={reduced ? false : { opacity: 0, x: stationary ? 0 : pose.x, y: stationary ? 14 : pose.y }}
    whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, amount: .12 }}
    transition={{ duration: reduced ? 0 : stationary ? .6 : .72, delay, ease: [.22, 1, .36, 1] }}
    style={{ left: frame?.x, top: frame?.y, width: frame?.width, '--cv-ratio': photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4', '--cv-tilt': `${pose?.tilt || 0}deg` }}>
    <div className="cv-frame-drift">{surface}</div>
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
    <motion.div className="cv-bookend-copy" {...arrival(reduced, touch)}><span>{opening ? delivery.shootType || 'YOUR PHOTOGRAPHS' : 'ALL YOUR PHOTOGRAPHS'}</span>{opening ? <h1>{delivery.creativeDirection?.title || delivery.title || delivery.clientName || 'Your photographs'}</h1> : <h2>Yours to keep.</h2>}<p>{delivery.creativeDirection?.[opening ? 'openingLine' : 'closingLine'] || (opening ? 'Take your time. Open any photograph for a closer look.' : 'Your finished photographs are ready to view and keep.')}</p>{!opening && <button type="button" onClick={onGallery}><Images size={18} />View full gallery</button>}</motion.div>
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
        {shown && <figure><Photo key={shown.assetId} url={state.photos.length ? shown.url : shown.thumbnailUrl || shown.url} srcSet={state.photos.length ? shown.srcSet : undefined} alt={shown.alt} eager draggable={false} sizes="(max-width: 640px) 94vw, (max-width: 1024px) 80vw, 1100px" /></figure>}
        <ImageWaiting state={state} onSkip={index < photos.length - 1 ? () => next(1) : undefined} skipLabel="Next photo" />
      </div><div className="fd-canvas-focus-copy cv-focus-copy"><motion.div key={shown?.assetId} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .38, delay: .16, ease: [.22, 1, .36, 1] }}>{shown && <><span>PHOTOGRAPH {number(shownIndex + 1)}</span>{shown.headline && <h2>{shown.headline}</h2>}<p>{shown.caption}</p></>}</motion.div><nav aria-label="Photograph navigation"><button type="button" disabled={index === 0} onClick={() => next(-1)}><ChevronLeft size={18} />Previous</button><button type="button" disabled={index === photos.length - 1} onClick={() => next(1)}>Next<ChevronRight size={18} /></button></nav></div></div>
    </motion.section>
  </motion.div>;
}

export default function CanvasBoard({ delivery: supplied, galleryProps, audioState, toggleAudio, onNarrationNavigate }) {
  const delivery = supplied || CANVAS_DEMO_DELIVERY, reduced = useVeyloReducedMotion();
  const [finePointer, setFinePointer] = useState(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFinePointer(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const context = usePresentation(delivery, galleryProps, !supplied);
  const { photos, all } = context;
  const points = useMemo(() => canvasCheckpoints(delivery, photos.map(photo => photo.assetId)), [delivery, photos]);
  const byId = useMemo(() => new Map(photos.map(photo => [photo.assetId, photo])), [photos]);
  const board = useRef(null), nodes = useRef(new Map()), metrics = useRef(new Map()), trigger = useRef(null);
  const [composition, setComposition] = useState(null);
  const [selection, setSelection] = useState(null), [gallery, setGallery] = useState(false), [jumped, setJumped] = useState(null);
  const [motionPaused, setMotionPaused] = useState(false);
  const settings = delivery.formatConfig?.canvas || {};
  const stillPhotos = settings.photoMotion === 'still';
  // Earlier v3 Canvas saves forced every frame to "still" without a creator
  // choice. Upgrade that default, or apply the creator's collection motion choice.
  const legacyAutoStill = settings.photoMotion === 'gentle' || delivery.schemaVersion === 3 && Boolean(delivery.v3) && settings.photoMotion === undefined;
  useCanvasScrollMotion(board, composition, !reduced && !stillPhotos && !motionPaused && !selection && !gallery, settings.arrangement !== 'ordered');
  useCanvasConnections(board, composition);
  const requestedTheme = getFormatThemeStyles(delivery, { bg: '#0c1b16', surface: '#eee5d8', text: '#efe6d6', accent: '#c8ac8c' });
  const ink = photoStoryChrome(requestedTheme['--fd-bg'], requestedTheme['--fd-text'], requestedTheme['--fd-accent']);
  const theme = { ...requestedTheme, '--fd-text': ink['--story-text'], '--cv-line': ink['--story-chrome-accent'] };
  const order = points.flatMap(point => point.assetIds), orderedPhotos = order.map(id => byId.get(id)).filter(Boolean);
  const signature = points.map(point => `${point.id}:${point.assetIds.join(',')}`).join('|');
  const copySignature = JSON.stringify([points.map(point => [point.title, point.note]), photos.map(photo => [photo.headline, photo.width, photo.height]), delivery.creativeDirection?.typography, delivery.creativeDirection?.title, delivery.creativeDirection?.openingLine, delivery.creativeDirection?.closingLine, delivery.v3?.openingAssetId, delivery.v3?.closingAssetId]);
  const metric = key => node => { if (node) metrics.current.set(key, node); else metrics.current.delete(key); };
  useEffect(() => { setSelection(null); }, [signature]);
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
  useEffect(() => { if (!jumped) return; const timer = setTimeout(() => setJumped(null), 1600); return () => clearTimeout(timer); }, [jumped]);
  const jump = id => { setJumped(id); nodes.current.get(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); };
  const open = (photo, event) => { window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: 'instant' }); trigger.current = event.currentTarget; setSelection({ id: photo.assetId, scope: null, title: '' }); onNarrationNavigate?.(photo.assetId); };
  const groupOpen = (point, event) => { window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: 'instant' }); trigger.current = event.currentTarget; setSelection({ id: point.assetIds[0], scope: point.assetIds, title: point.title }); onNarrationNavigate?.(point.assetIds[0]); };
  const paths = composition?.paths || [];
  const touch = !finePointer || composition?.phone;
  const bookendPosition = kind => composition ? { left: composition[kind].x, top: composition[kind].y, width: composition[kind].width } : undefined;
  return <div className="fd-page fd-canvas cv-board" style={theme} data-touch={touch ? 'true' : 'false'} data-arrangement={settings.arrangement || 'spatial'} data-photo-motion={stillPhotos ? 'still' : motionPaused || selection || gallery ? 'paused' : 'playing'}>
    <DemoHeader format="Canvas" client={delivery.clientName || delivery.title} sectionId="canvas" delivery={supplied} audioState={audioState} toggleAudio={toggleAudio} hideFormatLabel titleDetail={`${photos.length} photographs`} headerClassName="cv-header" headerActions={!stillPhotos && <button type="button" className="cv-motion-toggle" aria-label={motionPaused ? 'Resume photo motion' : 'Pause photo motion'} aria-pressed={motionPaused} onClick={() => setMotionPaused(value => !value)}>{motionPaused ? <Play size={16} /> : <Pause size={16} />}<span>{motionPaused ? 'Resume motion' : 'Pause motion'}</span></button>} />
    <main className="cv-main">
      <div className="cv-path-board" ref={board} style={{ height: composition?.height || 1800 }}>
        <Bookend delivery={delivery} kind="opening" photos={all} reduced={reduced} touch={touch} edgeId={order[0]} position={bookendPosition('intro')} measureRef={metric('opening')} />
        {paths.map(path => <CanvasConnection key={path.id} path={path} />)}
        {points.map((point, at) => {
          const placement = composition?.points[at];
          return <section key={point.id} id={`cv-${point.id}`} data-point={point.id} data-type={point.type} ref={node => { if (node) nodes.current.set(point.id, node); else nodes.current.delete(point.id); }} style={placement ? { left: placement.x, top: placement.y, width: placement.width, height: placement.height } : { visibility: 'hidden' }} className={`cv-checkpoint ${point.type === 'group' ? 'is-group' : 'is-single'} ${jumped === point.id ? 'is-jumped' : ''}`}>
            <button type="button" className="cv-point-marker" style={placement ? { left: placement.marker.x - placement.x, top: placement.marker.y - placement.y } : undefined} aria-label={`Checkpoint ${at + 1}`} onClick={() => jump(point.id)}><span>{number(at + 1)}</span></button>
            <div className="cv-checkpoint-content">{point.type === 'group' && <motion.header ref={metric(`heading:${point.id}`)} className="cv-group-heading" style={placement ? { left: placement.headingX, top: placement.headingY, width: placement.headingWidth } : undefined} {...arrival(reduced, touch)}><button type="button" onClick={event => groupOpen(point, event)} aria-label={`Open ${point.title || 'photo group'}`}><span>GROUP / {point.assetIds.length} PHOTOS</span><h3>{point.title}<ChevronRight size={18} /></h3>{settings.showGroupNotes !== false && point.note && <p>{point.note}</p>}</button></motion.header>}
              <div className="cv-photo-composition">{point.assetIds.map((id, place) => {
                const photo = byId.get(id), index = order.indexOf(id), frame = placement?.frames[place]; if (!photo) return null;
                const global = composition?.frames.find(item => item.id === id);
                return <React.Fragment key={id}>{point.type === 'group' && global && <span className="cv-photo-anchor" aria-hidden="true" style={{ left: global.anchor.x - placement.x, top: global.anchor.y - placement.y }} />}<CanvasPrint photo={photo} id={id} index={index} place={place} frame={frame} pose={global?.pose} reduced={reduced} touch={touch} ordered={settings.arrangement === 'ordered'} open={open} measureRef={metric(`label:${id}`)} stillPhotos={stillPhotos} legacyAutoStill={legacyAutoStill} /></React.Fragment>;
              })}</div>
            </div>
          </section>;
        })}
        <Bookend delivery={delivery} kind="closing" photos={all} reduced={reduced} touch={touch} edgeId={order.at(-1)} position={bookendPosition('closing')} measureRef={metric('closing')} onGallery={() => setGallery(true)} />
      </div><AnimatePresence>{selection && byId.has(selection.id) && (!selection.scope || selection.scope.some(id => byId.has(id))) && <CanvasFocus all={orderedPhotos} selection={selection} setSelection={setSelection} onClose={() => setSelection(null)} triggerRef={trigger} reduced={reduced} onNavigate={onNarrationNavigate} />}</AnimatePresence>
      <footer className="cv-board-footer"><span>Photographed by {delivery.branding?.name || 'Veylo Studio'}</span><span>{photos.length} photographs</span></footer>
    </main>
    <AnimatePresence>{gallery && <ClientGallery photos={all} delivery={delivery} title={delivery.title || delivery.clientName} fontStyles={theme} onClose={() => setGallery(false)} {...context.galleryProps} />}</AnimatePresence>
  </div>;
}
