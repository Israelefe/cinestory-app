import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Download, Grid2X2, Images, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { Photo } from '../components/PublicDesign.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
import '../styles/format-demos.css';

const editorialPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-ada-${index + 1}`, alt: `Ada's fashion portrait ${index + 1}` }));
const revealPhotos = Array.from({ length: 4 }, (_, index) => ({ name: `demo-sharon-${index + 1}`, alt: `Sharon's studio portrait ${index + 1}` }));
const couragePhotos = Array.from({ length: 6 }, (_, index) => ({ name: `demo-courage-${index + 1}`, alt: `Courage's graduation portrait ${index + 1}` }));
const weddingPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-wedding-${index + 1}`, alt: `Folake and Tunde's wedding portrait ${index + 1}` }));
const albumPhotos = ['demo-album-fa-source', 'demo-album-fa-2', 'demo-album-fa-3', 'demo-album-fa-4', 'demo-album-fa-5'].map((name, index) => ({ name, alt: `The Adeyemi family album portrait ${index + 1}` }));
const imageSrc = (photo, width = 1440) => `/veylo/web/${photo.name}-${width}.webp`;

function DemoHeader({ format, client, sectionId, onGallery, light = false }) {
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

  return <header className={'fd-header ' + (light ? 'is-light' : '')}>
    <Link className="fd-back" to={backDestination} onClick={handleBack} aria-label={backAria}>
      <ArrowLeft size={17} />
      <span>{backLabel}</span>
    </Link>
    <div className="fd-header-title"><span>{format}</span><strong>{client}</strong></div>
    {onGallery ? <button className="fd-gallery-button" type="button" onClick={onGallery} aria-label="Open full gallery"><Images size={17} /><span>Full gallery</span></button> : <span aria-hidden="true" />}
  </header>;
}

function DemoGallery({ photos, title, onClose, initialIndex = null }) {
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

  return <motion.div className="fd-gallery-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={panel} className="fd-gallery" role="dialog" aria-modal="true" aria-labelledby="fd-gallery-title" tabIndex={-1} initial={{ opacity: 0, y: 24, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 15 }} transition={{ type: 'spring', damping: 27, stiffness: 240 }}>
      <header><div><span>THE COMPLETE COLLECTION</span><h2 id="fd-gallery-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close gallery"><X size={20} /></button></header>
      {selected === null ? <div className="fd-gallery-grid">{photos.map((photo, index) => <figure key={photo.name}>
        <button type="button" onClick={() => setSelected(index)} aria-label={`Open photograph ${index + 1}`}><Photo name={photo.name} alt={photo.alt} sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 22vw" /></button>
        <figcaption><span>{String(index + 1).padStart(2, '0')}</span><a href={imageSrc(photo)} download={`${photo.name}.webp`}>Download<Download size={13} /></a></figcaption>
      </figure>)}</div> : <div className="fd-lightbox">
        <AnimatePresence mode="wait"><motion.img key={photos[selected].name} src={imageSrc(photos[selected])} alt={photos[selected].alt} initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} /></AnimatePresence>
        <div className="fd-lightbox-controls"><button type="button" onClick={() => setSelected(value => Math.max(0, value - 1))} disabled={selected === 0} aria-label="Previous photograph"><ChevronLeft size={20} /></button><button type="button" onClick={() => setSelected(null)}>Back to gallery</button><a href={imageSrc(photos[selected])} download={`${photos[selected].name}.webp`}>Download<Download size={15} /></a><button type="button" onClick={() => setSelected(value => Math.min(photos.length - 1, value + 1))} disabled={selected === photos.length - 1} aria-label="Next photograph"><ChevronRight size={20} /></button></div>
      </div>}
    </motion.section>
  </motion.div>;
}

function EditorialPhoto({ photo, className = '', caption, sizes, direction = 1, horizontal = false }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], direction > 0 ? [-24, 24] : [24, -24]);
  const x = useTransform(scrollYProgress, [0, 1], direction > 0 ? [-18, 18] : [18, -18]);
  const scale = useTransform(scrollYProgress, [0, .5, 1], [1.07, 1.025, 1.07]);
  return <motion.figure ref={ref} className={className} initial={reduced ? false : { opacity: .72, clipPath: horizontal ? 'inset(0 18% 0 0)' : 'inset(0 0 18% 0)' }} whileInView={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }} viewport={{ once: true, amount: .08 }} transition={{ duration: reduced ? 0 : .95, ease: [0.22, 1, 0.36, 1] }}>
    <motion.div className="fd-ed-photo-motion" style={reduced ? undefined : { y: horizontal ? 0 : y, x: horizontal ? x : 0, scale }}><Photo name={photo.name} alt={photo.alt} sizes={sizes} /></motion.div>
    {caption && <figcaption>{caption}</figcaption>}
  </motion.figure>;
}

function EditorialDemo() {
  const [gallery, setGallery] = useState(false);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const reveal = (delay = 0) => reduced ? {} : { initial: { opacity: 0, y: 34 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .3 }, transition: { duration: .72, delay, ease: [0.22, 1, 0.36, 1] } };
  return <div className="fd-page fd-editorial">
    <DemoHeader format="Editorial Page" client="Ada / The Style Issue" sectionId="editorial-page" onGallery={() => setGallery(true)} light />
    <motion.div className="fd-ed-scroll-progress" style={reduced ? undefined : { scaleX: scrollYProgress }} aria-hidden="true" />
    <main>
      <section className="fd-ed-cover">
        <div className="fd-ed-mast">
          <motion.span initial={reduced ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .6, delay: reduced ? 0 : .15 }}>VEYLO EDITORIAL / 001</motion.span>
          <strong>{['THE', 'STYLE', 'ISSUE'].map((line, index) => <motion.i key={line} initial={reduced ? false : { opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .72, delay: reduced ? 0 : .22 + index * .09, ease: [0.22, 1, 0.36, 1] }}>{line}</motion.i>)}</strong>
          <motion.p initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .62 }}>One green suit. Five portraits. Ada gave every frame a different attitude.</motion.p>
        </div>
        <motion.figure initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', opacity: .4 }} animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }} transition={{ duration: reduced ? 0 : 1.15, delay: reduced ? 0 : .18, ease: [0.22, 1, 0.36, 1] }}><motion.div className="fd-ed-photo-motion" animate={reduced ? undefined : { scale: [1.015, 1.065], y: ['0%', '-1.6%'] }} transition={{ duration: 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={editorialPhotos[0].name} alt={editorialPhotos[0].alt} eager sizes="(max-width: 767px) 100vw, 62vw" /></motion.div></motion.figure>
        <motion.span className="fd-ed-folio" initial={reduced ? false : { opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .72 }}>01</motion.span>
        <motion.i className="fd-ed-cover-rule" initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : 1, delay: reduced ? 0 : .45, ease: [0.22, 1, 0.36, 1] }} aria-hidden="true" />
      </section>

      <section className="fd-ed-intro"><motion.span {...reveal()}>FASHION PORTRAITS / LAGOS</motion.span><h1><motion.i {...reveal(.05)}>One look.</motion.i><motion.em {...reveal(.12)}>Completely Ada.</motion.em></h1><motion.p {...reveal(.18)}>Ada came in with an emerald suit and a vintage ivory telephone. The page follows the confidence and playfulness already in the photographs.</motion.p></section>

      <section className="fd-ed-spread">
        <EditorialPhoto photo={editorialPhotos[1]} sizes="(max-width: 767px) 92vw, 48vw" caption="02 / The suit, held with quiet confidence." direction={-1} />
        <motion.div className="fd-ed-quote" {...reveal(.08)}><span>THE GREEN SUIT</span><blockquote><motion.span {...reveal(.12)}>“One outfit.</motion.span><motion.span {...reveal(.2)}>Five different ways to own it.”</motion.span></blockquote><motion.p {...reveal(.24)}>The ivory telephone gave Ada something to play with. She did the rest.</motion.p></motion.div>
        <EditorialPhoto photo={editorialPhotos[2]} className="fd-ed-tall" sizes="(max-width: 767px) 84vw, 35vw" caption="03 / A quieter moment with the phone." direction={1} horizontal />
      </section>

      <section className="fd-ed-number"><motion.span aria-hidden="true" initial={reduced ? false : { opacity: 0, x: 100 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: reduced ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}>04</motion.span><EditorialPhoto photo={editorialPhotos[3]} sizes="100vw" direction={-1} horizontal /><motion.div><motion.small {...reveal()}>THE FULL LOOK</motion.small><h2><motion.span {...reveal(.08)}>Green velvet, sculpted lines,</motion.span><motion.span {...reveal(.16)}>and Ada in complete control of the frame.</motion.span></h2></motion.div></section>

      <section className="fd-ed-close"><EditorialPhoto photo={editorialPhotos[4]} sizes="(max-width: 767px) 88vw, 46vw" direction={1} /><div><motion.span {...reveal()}>THE COMPLETE SESSION</motion.span><h2><motion.span {...reveal(.08)}>Every side of the look,</motion.span><motion.em {...reveal(.15)}>ready to explore.</motion.em></h2><motion.p {...reveal(.21)}>The feature ends here. Ada’s complete finished collection is ready when you are.</motion.p><motion.button type="button" onClick={() => setGallery(true)} {...reveal(.27)}>View full gallery<Images size={17} /></motion.button></div></section>
    </main>
    <AnimatePresence>{gallery && <DemoGallery photos={editorialPhotos} title="Ada / The Style Issue" onClose={() => setGallery(false)} />}</AnimatePresence>
  </div>;
}

const revealCaptions = [
  ['THE FIRST ONE', 'Sharon, you walked into this frame and made it yours.'],
  ['THAT LOOK', 'The turn, the clean lines, the confidence. This portrait had to stand alone.'],
  ['A SOFTER MOMENT', 'A quieter portrait, but still completely you.'],
  ['SAVED FOR LAST', 'We kept this portrait for the end. It is one of our favourites from your session.']
];

const revealMotions = [
  { initial: { clipPath: 'inset(0 50% 0 50%)', scale: 1.08, filter: 'blur(8px)' }, animate: { clipPath: 'inset(0 0% 0 0%)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'inset(50% 0 50% 0)', scale: 1.07, filter: 'blur(6px)' }, animate: { clipPath: 'inset(0% 0 0% 0)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'circle(0% at 50% 44%)', scale: 1.1, filter: 'blur(9px)' }, animate: { clipPath: 'circle(78% at 50% 44%)', scale: 1, filter: 'blur(0px)' } },
  { initial: { clipPath: 'inset(100% 0 0 0)', scale: 1.06, filter: 'blur(5px)' }, animate: { clipPath: 'inset(0% 0 0 0)', scale: 1, filter: 'blur(0px)' } }
];

function RevealDemo() {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [uncovered, setUncovered] = useState(false);
  const [muted, setMuted] = useState(false);
  const reduced = useReducedMotion();
  const touchStart = useRef(null);
  const audio = useRef(null);

  const next = () => {
    setUncovered(false);
    if (index === revealPhotos.length - 1) setFinished(true);
    else setIndex(value => value + 1);
  };
  const previous = () => {
    setUncovered(false);
    if (finished) setFinished(false);
    else setIndex(value => Math.max(0, value - 1));
  };
  const beginReveal = () => {
    setStarted(true);
    if (audio.current && !muted) {
      audio.current.volume = .52;
      audio.current.play().catch(() => {});
    }
  };
  const toggleSound = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!audio.current) return;
    audio.current.muted = nextMuted;
    if (!nextMuted && started && !gallery) audio.current.play().catch(() => {});
  };
  const restart = () => {
    setStarted(false);
    setFinished(false);
    setIndex(0);
    setUncovered(false);
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
    }
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
    const player = audio.current;
    if (!player) return;
    if (gallery) player.pause();
    else if (started && !muted) player.play().catch(() => {});
  }, [gallery, started, muted]);

  useEffect(() => () => audio.current?.pause(), []);

  useEffect(() => {
    const onKey = event => {
      if (!started || gallery || !uncovered) return;
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') previous();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <div className="fd-page fd-reveal" onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null || !started || finished || !uncovered) return; const distance = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(distance) > 45) distance < 0 ? next() : previous(); }}>
    <audio ref={audio} src="/audio/soundtrack-3.mp3" loop preload="metadata" muted={muted} />
    <DemoHeader format="Photo Reveal" client="Sharon / Studio Portraits" sectionId="photo-reveal" onGallery={() => setGallery(true)} />
    {!started ? <main className="fd-reveal-opening">
      <motion.div className="fd-reveal-opening-photo" initial={reduced ? false : { scale: 1.14 }} animate={{ scale: 1.08 }} transition={{ duration: reduced ? 0 : 7, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={revealPhotos[0].name} alt="A concealed preview of Sharon's finished studio portraits" eager /></motion.div>
      <div className="fd-reveal-opening-shade" />
      <motion.div className="fd-reveal-opening-mark" initial={reduced ? false : { opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : .8 }} aria-hidden="true"><span>PRIVATE REVEAL</span><i /></motion.div>
      <motion.div className="fd-reveal-opening-copy" initial={reduced ? false : { opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .2 }}><span>STUDIO LUMIÈRE / LAGOS</span><h1>Sharon,<br />your photographs<br />are ready.</h1><p>There are four finished portraits waiting. Reveal each one when you are ready.</p><button type="button" onClick={beginReveal}>Begin reveal<ChevronRight size={18} /></button></motion.div>
    </main> : <main className="fd-reveal-stage">
      {!finished ? <div className="fd-reveal-room">
        <div className="fd-reveal-frame-shell">
          <motion.div className="fd-reveal-waiting" key={'waiting-' + index} initial={{ opacity: 0 }} animate={{ opacity: uncovered ? 0 : 1 }} transition={{ duration: reduced ? 0 : .25 }} aria-hidden={uncovered}><span>PORTRAIT</span><strong>{String(index + 1).padStart(2, '0')}</strong><i>OPENING</i></motion.div>
          <AnimatePresence mode="wait">{uncovered && <motion.figure className={'fd-reveal-portrait is-effect-' + (index + 1)} key={revealPhotos[index].name} initial={reduced ? false : { opacity: .35, ...revealMotions[index].initial }} animate={{ opacity: 1, ...revealMotions[index].animate }} exit={{ opacity: 0, scale: .985 }} transition={{ duration: reduced ? 0 : 1.15, ease: [0.22, 1, 0.36, 1] }}><motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], x: index % 2 ? ['0%', '-.7%'] : ['-.7%', '.7%'] }} transition={{ duration: 11, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={revealPhotos[index].name} alt={revealPhotos[index].alt} eager sizes="(max-width: 767px) 100vw, 72vw" /></motion.div><motion.i className="fd-reveal-light" initial={reduced ? false : { x: '-130%', opacity: 0 }} animate={{ x: '180%', opacity: [0, .8, 0] }} transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : .2, ease: 'easeInOut' }} /></motion.figure>}</AnimatePresence>
          <div className="fd-reveal-frame-lines" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
        <aside className="fd-reveal-details">
          <div className="fd-reveal-position"><span>PORTRAIT {String(index + 1).padStart(2, '0')}</span><i /><span>{String(revealPhotos.length).padStart(2, '0')}</span></div>
          <AnimatePresence mode="wait">{uncovered && <motion.div className="fd-reveal-caption" key={'caption-' + index} initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .65, delay: reduced ? 0 : .82 }}><motion.span initial={reduced ? false : { letterSpacing: '.35em', opacity: 0 }} animate={{ letterSpacing: '.18em', opacity: 1 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .9 }}>{revealCaptions[index][0]}</motion.span><p>{revealCaptions[index][1]}</p></motion.div>}</AnimatePresence>
          <div className="fd-reveal-controls"><button type="button" onClick={previous} disabled={index === 0 || !uncovered} aria-label="Previous portrait"><ChevronLeft size={18} /></button><button className="fd-reveal-next" type="button" onClick={next} disabled={!uncovered}>{index === revealPhotos.length - 1 ? 'Complete reveal' : 'Reveal next portrait'}<ChevronRight size={18} /></button></div>
        </aside>
      </div> : <motion.section className="fd-reveal-finale" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="fd-reveal-finale-grid">{revealPhotos.map((photo, photoIndex) => <motion.figure key={photo.name} initial={reduced ? false : { opacity: 0, y: 34, rotate: (photoIndex - 1.5) * 3 }} animate={{ opacity: 1, y: 0, rotate: (photoIndex - 1.5) * 1.5 }} transition={{ delay: reduced ? 0 : photoIndex * .08 }}><Photo name={photo.name} alt="" /></motion.figure>)}</div>
        <div className="fd-reveal-finale-copy"><span>SHARON / ALL FOUR REVEALED</span><h1>These portraits<br />are yours.</h1><p>Your complete finished session is ready to view and download.</p><div><button type="button" onClick={() => setGallery(true)}>View full gallery<Images size={17} /></button><button type="button" onClick={restart}><RotateCcw size={16} />Start again</button></div></div>
      </motion.section>}
    </main>}
    {started && <button className="fd-reveal-sound" type="button" onClick={toggleSound} aria-label={muted ? 'Turn soundtrack on' : 'Mute soundtrack'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{muted ? 'Sound off' : 'Sound on'}</span></button>}
    <AnimatePresence>{gallery && <DemoGallery photos={revealPhotos} title="Sharon's Studio Session" onClose={() => setGallery(false)} />}</AnimatePresence>
  </div>;
}
const canvasEntrances = [
  { x: -80, y: -35, rotate: -5 }, { x: 24, y: -70, rotate: 4 }, { x: 75, y: -30, rotate: 5 },
  { x: -65, y: 55, rotate: -6 }, { x: 15, y: 80, rotate: 4 }, { x: 80, y: 60, rotate: 5 }
];
const canvasClusters = [
  { name: 'Portraits', note: 'The confidence Courage brought into the studio.', photos: [0, 1] },
  { name: 'The degree', note: 'The photographs that hold what this day means.', photos: [2, 3] },
  { name: 'Celebration', note: 'The joy that came after all the work.', photos: [4, 5] }
];
const canvasCaptions = [
  'Courage, this is where the session begins: composed, proud, and ready.',
  'The cap, the smile, and the relief after all the work.',
  'A closer look at the degree you worked for.',
  'One quiet frame before the celebration took over.',
  'The joy in this portrait needed room around it.',
  'One last portrait for the road ahead.'
];

function CanvasFocus({ photos, index, onSelect, onClose, reduced }) {
  const panel = useRef(null);
  useDialogFocus(true, panel, onClose);
  useEffect(() => {
    const onKey = event => {
      if (event.key === 'ArrowLeft' && index > 0) onSelect(index - 1);
      if (event.key === 'ArrowRight' && index < photos.length - 1) onSelect(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onSelect, photos.length]);
  return <motion.div className="fd-canvas-focus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={panel} role="dialog" aria-modal="true" aria-label={`Photograph ${index + 1} of Courage's graduation portraits`} tabIndex={-1} initial={reduced ? false : { opacity: 0, scale: .975 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .985 }} transition={{ type: 'spring', damping: 28, stiffness: 240 }}>
      <button className="fd-canvas-focus-close" type="button" onClick={onClose} aria-label="Return to canvas"><X size={19} /></button>
      <div className="fd-canvas-focus-neighbours" aria-hidden="true">
        {index > 0 && <motion.div initial={reduced ? false : { opacity: 0, x: -30 }} animate={{ opacity: .2, x: 0 }}><Photo name={photos[index - 1].name} alt="" /></motion.div>}
        {index < photos.length - 1 && <motion.div initial={reduced ? false : { opacity: 0, x: 30 }} animate={{ opacity: .2, x: 0 }}><Photo name={photos[index + 1].name} alt="" /></motion.div>}
      </div>
      <motion.figure layoutId={`canvas-photo-${index}`} transition={{ type: 'spring', damping: 29, stiffness: 210 }}><Photo name={photos[index].name} alt={photos[index].alt} eager sizes="(max-width: 767px) 96vw, 66vw" /></motion.figure>
      <motion.div className="fd-canvas-focus-copy" key={index} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .25 }}><span>COURAGE / PORTRAIT {String(index + 1).padStart(2, '0')}</span><p>{canvasCaptions[index]}</p><div><button type="button" onClick={() => onSelect(index - 1)} disabled={index === 0}><ChevronLeft size={17} />Previous</button><button type="button" onClick={() => onSelect(index + 1)} disabled={index === photos.length - 1}>Next<ChevronRight size={17} /></button></div></motion.div>
    </motion.section>
  </motion.div>;
}

function CanvasDemo() {
  const [gallery, setGallery] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeCluster, setActiveCluster] = useState(null);
  const wall = useRef(null);
  const touchStart = useRef(null);
  const reduced = useReducedMotion();
  const cluster = activeCluster === null ? null : canvasClusters[activeCluster];

  const moveDepth = event => {
    if (reduced || event.pointerType !== 'mouse' || !wall.current) return;
    const bounds = wall.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - .5) * 13;
    const y = ((event.clientY - bounds.top) / bounds.height - .5) * 10;
    wall.current.querySelectorAll('.fd-wall-depth').forEach((node, index) => {
      const depth = .35 + index % 3 * .22;
      node.style.transform = `translate3d(${x * depth}px, ${y * depth}px, 0)`;
    });
  };
  const resetDepth = () => wall.current?.querySelectorAll('.fd-wall-depth').forEach(node => { node.style.transform = 'translate3d(0,0,0)'; });
  const moveCluster = direction => {
    if (activeCluster === null) setActiveCluster(direction > 0 ? 0 : canvasClusters.length - 1);
    else setActiveCluster(value => Math.max(0, Math.min(canvasClusters.length - 1, value + direction)));
  };

  return <div className="fd-page fd-canvas">
    <DemoHeader format="Canvas" client="Courage / Graduation" sectionId="canvas" onGallery={() => setGallery(true)} />
    <main className="fd-wall-shell">
      <header className="fd-wall-intro"><div><span>COURAGE / CLASS OF 2026</span><strong>{cluster ? cluster.name : 'The complete canvas'}</strong></div><AnimatePresence mode="wait"><motion.p key={cluster?.name || 'overview'} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .35 }}>{cluster ? cluster.note : 'Every finished portrait is here. Choose a group, or open any photograph.'}</motion.p></AnimatePresence>{activeCluster !== null && <button type="button" onClick={() => setActiveCluster(null)}><Grid2X2 size={15} />See the whole canvas</button>}</header>
      <section className="fd-wall-stage" onPointerMove={moveDepth} onPointerLeave={resetDepth} onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(distance) > 48) moveCluster(distance < 0 ? 1 : -1); }}>
        <div ref={wall} className={'fd-wall' + (activeCluster === null ? ' is-overview' : ' is-focus')}>
          <div className="fd-wall-grid" aria-hidden="true" />
          <div className="fd-wall-glow" aria-hidden="true"><i /><i /></div>
          <svg className="fd-wall-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M 17 30 C 28 8, 45 12, 54 34 S 75 60, 91 28" /><path d="M 12 72 C 31 58, 38 88, 56 75 S 77 72, 91 84" /></svg>
          <motion.div className="fd-wall-title" initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: activeCluster === null ? 1 : .18, y: 0 }}><span>A GRADUATION PORTRAIT STUDY</span><strong>Courage,<br />you made it.</strong></motion.div>
          {couragePhotos.map((photo, index) => {
            const clusterIndex = canvasClusters.findIndex(item => item.photos.includes(index));
            const place = canvasClusters[clusterIndex].photos.indexOf(index);
            const inCluster = activeCluster === clusterIndex;
            const dimmed = activeCluster !== null && !inCluster;
            return <motion.button layout layoutId={`canvas-photo-${index}`} type="button" key={photo.name} className={`fd-wall-card is-card-${index + 1}${inCluster ? ` is-in-cluster is-place-${place + 1}` : ''}${dimmed ? ' is-dimmed' : ''}`} onClick={() => setSelected(index)} initial={reduced ? false : { opacity: 0, scale: .86, ...canvasEntrances[index] }} animate={{ opacity: dimmed ? .16 : 1, scale: dimmed ? .88 : 1, x: 0, y: 0, rotate: 0 }} whileHover={reduced ? undefined : { scale: 1.025, y: -6 }} transition={{ layout: { type: 'spring', damping: 28, stiffness: 190 }, opacity: { duration: reduced ? 0 : .35 }, delay: reduced ? 0 : index * .055 }} aria-label={`Open photograph ${index + 1}`}><div className="fd-wall-depth"><motion.span animate={reduced ? undefined : { scale: [1.01, 1.05], x: index % 2 ? ['0%', '-1.2%'] : ['-1%', '1%'] }} transition={{ duration: 9 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={photo.name} alt={photo.alt} eager={index < 3} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 34vw, 25vw" /></motion.span><i>{String(index + 1).padStart(2, '0')}</i></div></motion.button>;
          })}
          <AnimatePresence>{cluster && <motion.div className="fd-wall-focus-label" key={cluster.name} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: reduced ? 0 : .28 }}><span>0{activeCluster + 1} / 03</span><strong>{cluster.name}</strong><p>{cluster.note}</p></motion.div>}</AnimatePresence>
        </div>
      </section>
      <footer className="fd-wall-controls"><span>Choose a group</span><nav aria-label="Canvas groups">{canvasClusters.map((item, index) => <button type="button" key={item.name} className={activeCluster === index ? 'is-active' : ''} onClick={() => setActiveCluster(index)}><i>0{index + 1}</i><strong>{item.name}</strong></button>)}</nav><div className="fd-wall-arrows"><button type="button" onClick={() => moveCluster(-1)} disabled={activeCluster === 0} aria-label="Previous group"><ChevronLeft size={18} /></button><button type="button" onClick={() => moveCluster(1)} disabled={activeCluster === canvasClusters.length - 1} aria-label="Next group"><ChevronRight size={18} /></button></div></footer>
    </main>
    <AnimatePresence>{selected !== null && <CanvasFocus photos={couragePhotos} index={selected} onSelect={setSelected} onClose={() => setSelected(null)} reduced={reduced} />}</AnimatePresence>
    <AnimatePresence>{gallery && <DemoGallery photos={couragePhotos} title="Courage's Graduation Portraits" onClose={() => setGallery(false)} />}</AnimatePresence>
  </div>;
}
const chapters = [
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

function ChaptersDemo() {
  const [openIndex, setOpenIndex] = useState(null);
  const [visited, setVisited] = useState([]);
  const [gallery, setGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const reduced = useReducedMotion();
  const openChapterData = openIndex === null ? null : chapters[openIndex];

  const openChapter = index => {
    setVisited(value => value.includes(index) ? value : [...value, index]);
    setOpenIndex(index);
  };
  const openPhoto = photo => {
    setGalleryIndex(weddingPhotos.findIndex(item => item.name === photo.name));
    setGallery(true);
  };

  return <div className="fd-page fd-chapters">
    <DemoHeader format="Chapters" client="Folake & Tunde" sectionId="chapters" onGallery={() => { setGalleryIndex(null); setGallery(true); }} />

    <AnimatePresence mode="wait">
      {openChapterData === null ? <motion.main key="chapter-directory" className="fd-chapter-directory" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <header>
          <div><span>MAYFLOWER VISUALS / FOR FOLAKE &amp; TUNDE</span><h1>Folake &amp; Tunde,<br />where would you like to begin?</h1></div>
          <p>We arranged your five finished portraits into three chapters. Open whichever one you want first.</p>
          <div><strong>03</strong><span>CHAPTERS</span><strong>05</strong><span>PORTRAITS</span></div>
        </header>
        <section className="fd-chapter-directory-board" aria-label="Folake and Tunde's chapters">{chapters.map((item, index) => <motion.button type="button" key={item.name} className={`is-card-${index + 1}${visited.includes(index) ? ' is-visited' : ''}`} onClick={() => openChapter(index)} initial={reduced ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .65, delay: reduced ? 0 : .12 + index * .1, ease: [0.22, 1, 0.36, 1] }} whileHover={reduced ? undefined : { y: -5 }} whileTap={reduced ? undefined : { scale: .985 }}>
          <motion.span className="fd-chapter-directory-photo" animate={reduced ? undefined : { scale: [1.01, 1.055], x: index % 2 ? ['0%', '-1%'] : ['-1%', '1%'] }} transition={{ duration: 9 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={item.photos[0].name} alt={`${item.name} chapter cover`} eager={index === 0} sizes="(max-width: 767px) 64vw, 34vw" /></motion.span>
          <span className="fd-chapter-directory-shade" />
          <span className="fd-chapter-directory-number">0{index + 1}</span>
          <span className="fd-chapter-directory-copy"><i>{item.photos.length} {item.photos.length === 1 ? 'portrait' : 'portraits'}</i><strong>{item.name}</strong><p>{item.line}</p><b>Open chapter<ChevronRight size={15} /></b></span>
          {visited.includes(index) && <span className="fd-chapter-directory-viewed"><Check size={12} />Viewed</span>}
        </motion.button>)}</section>
        <footer><span>Take your time. You can return here or open your complete gallery whenever you want.</span><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>View all five portraits<Images size={16} /></button></footer>
      </motion.main> : <motion.main key={'chapter-room-' + openIndex} className="fd-chapter-room" style={{ '--chapter-accent': openChapterData.accent }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <aside className="fd-chapter-room-copy">
          <button type="button" onClick={() => setOpenIndex(null)}><ArrowLeft size={16} />All chapters</button>
          <span>{openChapterData.kicker}</span>
          <div className="fd-chapter-room-count">0{openIndex + 1} / 03</div>
          <h1>{openChapterData.name}</h1>
          <p>{openChapterData.note}</p>
          <nav aria-label="Other chapters">{chapters.map((item, index) => <button type="button" key={item.name} className={openIndex === index ? 'is-active' : ''} onClick={() => openChapter(index)}><i>0{index + 1}</i>{item.name}{visited.includes(index) && <Check size={12} />}</button>)}</nav>
        </aside>
        <section className={'fd-chapter-room-art ' + (openChapterData.photos.length === 1 ? 'is-single' : 'is-pair')}>
          <span className="fd-chapter-room-number" aria-hidden="true">0{openIndex + 1}</span>
          <div className="fd-chapter-room-photos">{openChapterData.photos.map((photo, index) => <motion.button type="button" key={photo.name} onClick={() => openPhoto(photo)} initial={reduced ? false : { opacity: 0, y: 38, clipPath: 'inset(0 0 14% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: reduced ? 0 : .78, delay: reduced ? 0 : .14 + index * .12, ease: [0.22, 1, 0.36, 1] }} aria-label={`Open ${openChapterData.captions[index]}`}><motion.div animate={reduced ? undefined : { scale: [1.015, 1.06], x: index % 2 ? ['0%', '-1%'] : ['-1%', '1%'] }} transition={{ duration: 10 + index, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={photo.name} alt={photo.alt} eager sizes="(max-width: 767px) 92vw, 48vw" /></motion.div><span>0{index + 1}</span><p>{openChapterData.captions[index]}</p></motion.button>)}</div>
          <footer><button type="button" onClick={() => setOpenIndex(null)}>All chapters<Grid2X2 size={17} /></button><button type="button" onClick={() => { setGalleryIndex(null); setGallery(true); }}>View full gallery<Images size={17} /></button></footer>
        </section>
      </motion.main>}
    </AnimatePresence>

    <AnimatePresence>{gallery && <DemoGallery photos={weddingPhotos} title="Folake & Tunde's Wedding Portraits" initialIndex={galleryIndex} onClose={() => { setGallery(false); setGalleryIndex(null); }} />}</AnimatePresence>
  </div>;
}

const albumSpreads = [
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

function AlbumSpread({ index, reduced, onGallery }) {
  const spread = albumSpreads[index];
  if (spread.id === 'opening') return <section className="fd-album-spread is-opening">
    <figure><motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], x: ['0%', '-.8%'] }} transition={{ duration: 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={albumPhotos[1].name} alt={albumPhotos[1].alt} eager sizes="(max-width: 767px) 100vw, 50vw" /></motion.div></figure>
    <article><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p><small>THE ADEYEMI FAMILY · 2026</small></article>
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;

  if (spread.id === 'together') return <section className="fd-album-spread is-wide">
    <motion.figure animate={reduced ? undefined : { scale: [1.005, 1.035] }} transition={{ duration: 11, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={albumPhotos[2].name} alt={albumPhotos[2].alt} eager sizes="100vw" /></motion.figure>
    <div><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p></div>
  </section>;

  return <section className="fd-album-spread is-finale">
    <figure className="is-family"><motion.div animate={reduced ? undefined : { scale: [1.01, 1.05], x: ['-.6%', '.6%'] }} transition={{ duration: 10.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={albumPhotos[3].name} alt={albumPhotos[3].alt} eager sizes="(max-width: 767px) 100vw, 50vw" /></motion.div></figure>
    <article><figure className="is-mother"><motion.div animate={reduced ? undefined : { scale: [1.01, 1.045], y: ['0%', '-.7%'] }} transition={{ duration: 9.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={albumPhotos[4].name} alt="A mother seated closely with her two daughters" eager sizes="(max-width: 767px) 100vw, 34vw" /></motion.div></figure><div><span>{spread.label}</span><h1>{spread.title}</h1><p>{spread.copy}</p><button type="button" onClick={onGallery}>View full gallery<Images size={17} /></button></div></article>
    <i className="fd-album-spine" aria-hidden="true" />
  </section>;
}

function AlbumDemo() {
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [gallery, setGallery] = useState(false);
  const [muted, setMuted] = useState(false);
  const touchStart = useRef(null);
  const audio = useRef(null);
  const reduced = useReducedMotion();

  const openAlbum = () => {
    setStarted(true);
    setPage(0);
    if (audio.current && !muted) {
      audio.current.volume = .32;
      audio.current.play().catch(() => {});
    }
  };
  const next = () => {
    if (page >= albumSpreads.length - 1) return;
    setDirection(1);
    setPage(value => value + 1);
  };
  const previous = () => {
    if (page === 0) {
      setStarted(false);
      audio.current?.pause();
      return;
    }
    setDirection(-1);
    setPage(value => value - 1);
  };
  const toggleSound = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!audio.current) return;
    audio.current.muted = nextMuted;
    if (!nextMuted && started && !gallery) audio.current.play().catch(() => {});
  };

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    if (gallery) player.pause();
    else if (started && !muted) player.play().catch(() => {});
  }, [gallery, started, muted]);

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

  return <div className="fd-page fd-album">
    <audio ref={audio} src="/audio/soundtrack-2.mp3" loop preload="metadata" muted={muted} />
    <DemoHeader format="Album" client="The Adeyemi Family" sectionId="album" />
    {!started ? <main className="fd-album-cover">
      <motion.figure initial={reduced ? false : { scale: 1.01 }} animate={{ scale: reduced ? 1 : 1.035 }} transition={{ duration: reduced ? 0 : 10, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={albumPhotos[0].name} alt="The Adeyemi family standing together for the cover of their album" eager sizes="100vw" /></motion.figure>
      <div className="fd-album-cover-shade" />
      <motion.section initial={reduced ? false : { y: 24 }} animate={{ y: 0 }} transition={{ duration: reduced ? 0 : .8, delay: reduced ? 0 : .18 }}><span>VEYLO MEDIA PRESENTS</span><h1>The Adeyemi<br /><em>Family Album</em></h1><p>Five finished portraits, arranged one page at a time.</p><button type="button" onClick={openAlbum}>Open album<BookOpen size={18} /></button></motion.section>
      <div className="fd-album-cover-folio"><span>FAMILY PORTRAITS</span><b>2026</b></div>
    </main> : <main className="fd-album-reader" aria-live="polite" onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(distance) > 45) distance < 0 ? next() : previous(); }}>
      <div className="fd-album-reader-head"><span>THE ADEYEMI FAMILY</span><div><i>{String(page + 1).padStart(2, '0')}</i><b>/</b><i>{String(albumSpreads.length).padStart(2, '0')}</i></div><span>FAMILY ALBUM · 2026</span></div>
      <div className="fd-album-stage"><AnimatePresence mode="wait" custom={direction}><motion.div key={albumSpreads[page].id} custom={direction} initial={reduced ? false : { opacity: .58, x: direction > 0 ? 38 : -38, clipPath: direction > 0 ? 'inset(0 0 0 7%)' : 'inset(0 7% 0 0)' }} animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)' }} exit={reduced ? undefined : { opacity: 0, x: direction > 0 ? -26 : 26, clipPath: direction > 0 ? 'inset(0 7% 0 0)' : 'inset(0 0 0 7%)' }} transition={{ duration: reduced ? 0 : .68, ease: [0.22, 1, 0.36, 1] }}><AlbumSpread index={page} reduced={reduced} onGallery={() => setGallery(true)} /></motion.div></AnimatePresence></div>
      <footer className="fd-album-controls"><button type="button" onClick={previous}><ChevronLeft size={18} /><span>{page === 0 ? 'Back to cover' : 'Previous page'}</span></button><div>{albumSpreads.map((spread, index) => <button type="button" key={spread.id} className={page === index ? 'is-active' : ''} onClick={() => { setDirection(index > page ? 1 : -1); setPage(index); }} aria-label={`Open album page ${index + 1}`}><i /></button>)}</div><button type="button" onClick={next} disabled={page === albumSpreads.length - 1}><span>Next page</span><ChevronRight size={18} /></button></footer>
    </main>}
    {started && <button className="fd-album-sound" type="button" onClick={toggleSound} aria-label={muted ? 'Turn album soundtrack on' : 'Mute album soundtrack'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{muted ? 'Sound off' : 'Sound on'}</span></button>}
    <AnimatePresence>{gallery && <DemoGallery photos={albumPhotos} title="The Adeyemi Family Portraits" onClose={() => setGallery(false)} />}</AnimatePresence>
  </div>;
}

export default function FormatDemo() {
  const { formatId } = useParams();
  useEffect(() => { const names = { editorial: 'Editorial Page', reveal: 'Photo Reveal', canvas: 'Canvas', chapters: 'Chapters', album: 'Album' }; if (names[formatId]) document.title = `Veylo — ${names[formatId]} demo`; }, [formatId]);
  if (formatId === 'editorial') return <EditorialDemo />;
  if (formatId === 'reveal') return <RevealDemo />;
  if (formatId === 'canvas') return <CanvasDemo />;
  if (formatId === 'chapters') return <ChaptersDemo />;
  if (formatId === 'album') return <AlbumDemo />;
  return <Navigate to="/#formats" replace />;
}

