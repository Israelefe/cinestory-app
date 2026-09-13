import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { BookOpen, Film, Grid2X2, Layers3, LayoutTemplate, MousePointer2 } from 'lucide-react';
import { Photo } from './PublicDesign.jsx';
import '../styles/hero-exclusive.css';

const formats = [
  { id: 'story', number: '01', roman: 'I', name: 'Photo Story', verb: 'Watch', line: 'A directed portrait story with rhythm, words, and a finale.', shoot: 'BLUE ROOM / PORTRAIT STORY', icon: Film, accent: '#6f91ff' },
  { id: 'editorial', number: '02', roman: 'II', name: 'Editorial Page', verb: 'Scroll', line: 'A magazine page built around the photograph and its details.', shoot: 'THE SUIT / EDITORIAL PORTRAIT', icon: LayoutTemplate, accent: '#e5a66d' },
  { id: 'reveal', number: '03', roman: 'III', name: 'Photo Reveal', verb: 'Tap', line: 'A first viewing that waits until the client is ready.', shoot: 'GREEN PORTRAIT / FIRST REVEAL', icon: MousePointer2, accent: '#d7b69c' },
  { id: 'canvas', number: '04', roman: 'IV', name: 'Canvas', verb: 'Explore', line: 'A visual field where the photograph has room to move.', shoot: 'IN MOTION / STUDIO CANVAS', icon: Grid2X2, accent: '#c88662' },
  { id: 'chapters', number: '05', roman: 'V', name: 'Chapters', verb: 'Choose', line: 'The parts of the shoot, ready to enter in any order.', shoot: 'GREEN ROOM / PORTRAIT SESSION', icon: Layers3, accent: '#71a68a' },
  { id: 'album', number: '06', roman: 'VI', name: 'Album', verb: 'Turn', line: 'A family shoot composed as pages they can return to.', shoot: 'THE ADEYEMI FAMILY / ALBUM', icon: BookOpen, accent: '#c98762' }
];

const heroPhotos = {
  story: 'hero-story',
  editorial: 'hero-editorial',
  reveal: 'hero-reveal',
  canvas: 'hero-canvas',
  chapters: 'hero-chapters',
  album: 'hero-album-fa-source'
};

const ease = [0.22, 1, 0.36, 1];

function MovingPhoto({ name, alt, className = '', reduced, motion: movement, eager = false }) {
  return <motion.figure className={className} animate={reduced ? undefined : movement} transition={reduced ? undefined : { duration: 8, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}><Photo name={name} alt={alt} eager={eager} sizes="(max-width: 1023px) 92vw, 48vw" /></motion.figure>;
}

function StoryScene({ reduced }) {
  return <div className="v-hf-story">
    <MovingPhoto name={heroPhotos.story} alt="A woman in a cobalt dress posing against a midnight-blue studio background" className="v-hf-story-photo" reduced={reduced} eager motion={{ scale: [1.015, 1.075], x: ['0%', '-1.2%'] }} />
    <div className="v-hf-story-shade" />
    <div className="v-hf-progress" aria-hidden="true"><i /><i /><i /><i /><i /></div>
    <span className="v-hf-story-count">01 / 05</span>
    <strong className="v-hf-story-age" aria-hidden="true">01</strong>
    <div className="v-hf-story-copy"><span>THE BLUE ROOM</span><strong>You held the frame from the first look.</strong><p>That direct gaze and the quiet confidence in your stance had to open the story.</p></div>
  </div>;
}

function EditorialScene({ reduced }) {
  return <div className="v-hf-editorial">
    <header><span>VEYLO / THE STYLE ISSUE</span><b>ISSUE 01</b></header>
    <MovingPhoto name={heroPhotos.editorial} alt="A man standing in a navy suit beside a terracotta studio plinth" className="v-hf-editorial-main" reduced={reduced} motion={{ y: ['0%', '-1.8%'], scale: [1.005, 1.04] }} />
    <div className="v-hf-editorial-type"><span>TAILORING / PORTRAIT</span><strong>The suit set the tone.<br /><em>The details did the rest.</em></strong><p>The watch, the glasses, and that composed pose gave the page its direction.</p></div>
    <span className="v-hf-editorial-folio">01</span>
  </div>;
}

function RevealScene({ reduced }) {
  return <div className="v-hf-reveal">
    <span className="v-hf-reveal-mark">YOUR PORTRAITS ARE READY</span>
    <motion.div className="v-hf-reveal-halo" animate={reduced ? undefined : { opacity: [.25, .6, .25], scale: [.92, 1.08, .92] }} transition={reduced ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
    <MovingPhoto name={heroPhotos.reveal} alt="A close studio portrait of a woman in green ready to be revealed" className="v-hf-reveal-photo" reduced={reduced} motion={{ scale: [1.01, 1.055] }} />
    <motion.div className="v-hf-reveal-curtain" animate={reduced ? { scaleX: .08 } : { scaleX: [.62, .06, .06, .62] }} transition={reduced ? { duration: 0 } : { duration: 8, times: [0, .16, .86, 1], repeat: Infinity, ease }} />
    <p className="v-hf-reveal-note">This was the portrait we wanted you to see first.</p>
    <div className="v-hf-reveal-action"><MousePointer2 size={15} /><span>Tap when you’re ready</span><b>01 / 04</b></div>
  </div>;
}

function CanvasScene({ reduced }) {
  return <div className="v-hf-canvas">
    <div className="v-hf-canvas-grid" aria-hidden="true" />
    <span className="v-hf-canvas-label">MOVEMENT / STUDIO PORTRAIT</span>
    <MovingPhoto name={heroPhotos.canvas} alt="A full-length studio portrait of a man standing against a clay-red architectural set" className="v-hf-canvas-focus" reduced={reduced} motion={{ x: ['-1.5%', '2%'], y: ['1%', '-2%'], rotate: [-.45, .35] }} />
    <span className="v-hf-canvas-orbit" aria-hidden="true" />
    <div className="v-hf-canvas-note"><span>THE FULL-LENGTH FRAME</span><strong>One grounded stance gave the canvas its centre.</strong></div>
    <span className="v-hf-canvas-coordinate">X 04.12 / Y 08.26</span>
  </div>;
}

function ChaptersScene({ reduced }) {
  const chapterNames = ['The first look', 'In green', 'That smile'];
  return <div className="v-hf-chapters">
    <MovingPhoto name={heroPhotos.chapters} alt="A woman smiling in a green outfit during her portrait session" className="v-hf-chapters-photo" reduced={reduced} motion={{ scale: [1.005, 1.045], y: ['0%', '-1.2%'] }} />
    <span className="v-hf-chapters-shade" />
    <header><span>YOUR PORTRAIT SESSION</span><strong>Where would you like to begin?</strong></header>
    <div className="v-hf-chapter-menu">{chapterNames.map((chapter, index) => <motion.div key={chapter} initial={reduced ? false : { opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .55, delay: reduced ? 0 : .12 + index * .09, ease }}><span>0{index + 1}</span><strong>{chapter}</strong></motion.div>)}</div>
    <p>Choose any chapter. The full collection is always waiting.</p>
  </div>;
}

function AlbumScene({ reduced }) {
  return <div className="v-hf-album">
    <span className="v-hf-album-kicker">A FAMILY ALBUM · 2026</span>
    <div className="v-hf-album-book">
      <section className="v-hf-album-page is-copy"><span>THE ADEYEMI FAMILY</span><strong>The people who make home feel like home.</strong><p>Five finished portraits, arranged to be opened one page at a time.</p><i>01</i></section>
      <section className="v-hf-album-page is-photo"><MovingPhoto name={heroPhotos.album} alt="The Adeyemi family standing together for their album portrait" reduced={reduced} motion={{ scale: [1.01, 1.05], x: ['0%', '-1%'] }} /></section>
      <span className="v-hf-album-spine" aria-hidden="true" />
      <motion.span className="v-hf-album-turn" aria-hidden="true" initial={reduced ? false : { scaleX: 1, rotateY: 0, opacity: 1 }} animate={reduced ? { scaleX: 0, opacity: 0 } : { scaleX: [1, .07, 0], rotateY: [0, -72, -86], opacity: [1, .42, 0] }} transition={reduced ? { duration: 0 } : { duration: .72, times: [0, .78, 1], ease }} />
    </div>
    <div className="v-hf-album-note"><BookOpen size={14} /><span>Turn through the album</span><b>01 / 05</b></div>
  </div>;
}

function Scene({ id, reduced }) {
  if (id === 'story') return <StoryScene reduced={reduced} />;
  if (id === 'editorial') return <EditorialScene reduced={reduced} />;
  if (id === 'reveal') return <RevealScene reduced={reduced} />;
  if (id === 'canvas') return <CanvasScene reduced={reduced} />;
  if (id === 'chapters') return <ChaptersScene reduced={reduced} />;
  return <AlbumScene reduced={reduced} />;
}

export default function HeroFormatStage({ reduced = false, paused = false }) {
  const stageRef = useRef(null);
  const visible = useInView(stageRef, { amount: .06, margin: '100px 0px' });
  const pauseMotion = reduced || paused || !visible;
  const [active, setActive] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('format');
    const index = formats.findIndex(item => item.id === requested);
    return index >= 0 ? index : 0;
  });
  const [holding, setHolding] = useState(false);
  const interactionTimer = useRef();
  const touchStart = useRef(null);
  const format = formats[active];

  useEffect(() => {
    if (!visible) return undefined;
    Object.values(heroPhotos).forEach(name => {
      const image = new window.Image();
      image.src = `/veylo/web/${name}-960.webp`;
    });
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (pauseMotion || holding) return undefined;
    const timer = window.setTimeout(() => setActive(index => (index + 1) % formats.length), 2800);
    return () => window.clearTimeout(timer);
  }, [active, holding, pauseMotion]);

  useEffect(() => () => window.clearTimeout(interactionTimer.current), []);

  const selectFormat = index => {
    setActive(index);
    setHolding(true);
    window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => setHolding(false), 7000);
  };

  const moveFormat = direction => selectFormat((active + direction + formats.length) % formats.length);

  return <div ref={stageRef} className={'v-format-hero ' + (holding || pauseMotion ? 'is-paused' : 'is-motion-active')} style={{ '--hero-format-accent': format.accent }} onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => {
    if (touchStart.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) > 45) moveFormat(distance < 0 ? 1 : -1);
  }}>
    <div className="v-format-hero-top"><span>{format.shoot}</span><span>SIX DELIVERY FORMATS</span></div>
    <div id="veylo-format-preview" className="v-format-hero-screen" role="tabpanel" aria-labelledby={`veylo-format-tab-${format.id}`}>
      <AnimatePresence initial={!pauseMotion} mode="sync">
        <motion.div key={format.id} className={'v-format-hero-scene is-' + format.id} initial={pauseMotion ? false : { clipPath: 'inset(0 0 100% 0)', scale: 1.025 }} animate={{ clipPath: 'inset(0 0 0% 0)', scale: 1 }} exit={pauseMotion ? { opacity: 0 } : { opacity: 0, scale: .985 }} transition={{ duration: pauseMotion ? 0 : .82, ease }}>
          <Scene id={format.id} reduced={pauseMotion} />
          <div className="v-format-hero-identity"><span>{format.roman || format.number} · {format.verb}</span><strong>{format.name}</strong><p>{format.line}</p></div>
          {!pauseMotion && <motion.span className="v-format-hero-wipe" initial={{ y: '-100%' }} animate={{ y: '120%' }} transition={{ duration: .9, ease }} />}
        </motion.div>
      </AnimatePresence>
    </div>
    <div className="v-format-hero-tabs" role="tablist" aria-label="Choose a Veylo delivery format">{formats.map((item, index) => {
      const Icon = item.icon;
      return <button id={`veylo-format-tab-${item.id}`} key={item.id} type="button" role="tab" aria-selected={active === index} aria-controls="veylo-format-preview" tabIndex={active === index ? 0 : -1} onFocus={() => active !== index && selectFormat(index)} onClick={() => selectFormat(index)} onKeyDown={event => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + formats.length) % formats.length;
        selectFormat(next);
        document.getElementById(`veylo-format-tab-${formats[next].id}`)?.focus();
      }}><span className="v-format-tab-icon"><Icon size={16} /></span><span className="v-format-tab-copy"><b>{item.roman || item.number}</b><strong>{item.name}</strong></span>{active === index && !pauseMotion && <i aria-hidden="true" />}</button>;
    })}</div>
    <div className="v-format-hero-foot"><span>Same finished photographs. A completely different first look.</span><span>Tap or swipe to explore</span></div>
  </div>;
}

