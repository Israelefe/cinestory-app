import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { ArrowLeft, ArrowRight, Camera, Pause, Play } from 'lucide-react';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { Photo } from './PublicDesign.jsx';
import './HomeShowcaseCard.css';

const photoSizes = '(max-width: 767px) 90vw, (max-width: 1024px) 50vw, 660px';
const chapterNames = ['Side by Side', 'Between Frames', 'Just Us'];
const chapterLines = [
  'The two of you, together from the first frame.',
  'The smiles and small gestures between the posed portraits.',
  'A little time for just the two of you.'
];

function PreviewPhoto({ name, alt, className = '', sizes = photoSizes, ...props }) {
  return <span className={`v-sc-photo-window ${className}`} {...props}>
    <span className="v-sc-photo-motion"><Photo name={name} alt={alt} sizes={sizes} /></span>
  </span>;
}

function ChangingPhoto({ name, alt, className = '' }) {
  return <div className={`v-sc-changing-photo ${className}`}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .22, ease: [.22, 1, .36, 1] }}>
        <PreviewPhoto name={name} alt={alt} />
      </motion.div>
    </AnimatePresence>
  </div>;
}

export default function HomeShowcaseCard({ format }) {
  const cardRef = useRef(null);
  const visible = useInView(cardRef, { amount: .08 });
  const reduced = useVeyloReducedMotion();
  const [paused, setPaused] = useState(false);
  const [revealIndex, setRevealIndex] = useState(0);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [albumSpread, setAlbumSpread] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const photos = format.photos;
  let content;

  if (format.id === 'photo-story') content = <>
    <PreviewPhoto className="v-sc-story-image" name={photos[0]} alt="Lora smiling with her birthday cake" />
    <div className="v-sc-story-shade" />
    <div className="v-sc-story-copy"><span className="v-sc-kicker">LORA'S BIRTHDAY</span><strong>A smile to<br /><em>start with.</em></strong><p>The first frame says it all.</p></div>
    <footer className="v-sc-story-footer"><span>01 <i>/ 06</i></span><span>Photo Story</span></footer>
  </>;

  if (format.id === 'editorial-page') content = <>
    <div className="v-sc-editorial-issue"><span className="v-sc-kicker">THE PORTRAIT ISSUE</span><span>No. 01</span></div>
    <div className="v-sc-editorial-layout">
      <PreviewPhoto className="v-sc-editorial-main" name={photos[0]} alt="Ada in a tailored green velvet outfit" />
      <div className="v-sc-editorial-column"><div className="v-sc-editorial-type"><span className="v-sc-kicker">A STUDIO STUDY</span><strong>Green.<br />Tailored.<br /><em>Direct.</em></strong></div><PreviewPhoto className="v-sc-editorial-detail" name={photos[1]} alt="A full-length portrait from Ada's studio session" /></div>
    </div>
    <footer className="v-sc-footer"><span>Ada / Studio portraits</span><span>01 — 02</span></footer>
  </>;

  if (format.id === 'photo-reveal') content = <>
    <div className="v-sc-reveal-title"><span className="v-sc-kicker">A FIRST LOOK, AT YOUR PACE</span><strong>Sharon's portraits.</strong></div>
    <div className="v-sc-reveal-stage"><ChangingPhoto name={photos[revealIndex]} alt={`Portrait ${revealIndex + 1} from Sharon's studio session`} /><span className="v-sc-reveal-corner is-top" aria-hidden="true" /><span className="v-sc-reveal-corner is-bottom" aria-hidden="true" /></div>
    <footer className="v-sc-reveal-footer"><span className="v-sc-position" role="status" aria-label={`Photograph ${revealIndex + 1} of ${photos.length}`}>0{revealIndex + 1}<i> / 0{photos.length}</i></span><button className="v-sc-action" type="button" onClick={() => setRevealIndex(index => (index + 1) % photos.length)}>Reveal next photo <ArrowRight size={16} aria-hidden="true" /></button></footer>
  </>;

  if (format.id === 'canvas') content = <>
    <div className="v-sc-canvas-heading"><span className="v-sc-kicker">COURAGE / GRADUATION</span><strong>One day.<br /><em>A few ways to remember it.</em></strong></div>
    <div className="v-sc-canvas-board">
      <svg className="v-sc-canvas-path" viewBox="0 0 400 400" preserveAspectRatio="none" aria-hidden="true"><path d="M 30 38 H 142 V 114 H 328 V 265 H 180 V 370 H 380" /><circle cx="30" cy="38" r="4" /><circle cx="380" cy="370" r="4" /></svg>
      {photos.map((photo, index) => <figure className={`v-sc-print is-print-${index + 1}`} key={photo}><PreviewPhoto name={photo} alt={`Graduation portrait ${index + 1} from Courage's session`} /><figcaption><span>0{index + 1}</span>{['The portrait', 'The smile', 'Celebration'][index]}</figcaption></figure>)}
    </div>
    <footer className="v-sc-footer"><span>Follow the photographs.</span><span>03 frames</span></footer>
  </>;

  if (format.id === 'chapters') content = <>
    <div className="v-sc-chapters-heading"><span className="v-sc-kicker">FOLAKE &amp; TUNDE</span><strong>Where will you begin?</strong></div>
    <div className="v-sc-chapter-covers">{photos.map((photo, index) => <button type="button" className={`v-sc-chapter-cover is-cover-${index + 1}${chapterIndex === index ? ' is-selected' : ''}`} key={photo} aria-label={`Preview chapter ${index + 1}: ${chapterNames[index]}`} aria-pressed={chapterIndex === index} onClick={() => setChapterIndex(index)}>
      <PreviewPhoto name={photo} alt={`${chapterNames[index]} from Folake and Tunde's wedding portraits`} /><span className="v-sc-chapter-cover-shade" /><span className="v-sc-chapter-cover-label"><i>0{index + 1}</i><strong>{chapterNames[index]}</strong></span>
    </button>)}</div>
    <footer className="v-sc-chapter-summary" aria-live="polite"><span className="v-sc-chapter-number">0{chapterIndex + 1}</span><div><strong>{chapterNames[chapterIndex]}</strong><p>{chapterLines[chapterIndex]}</p></div></footer>
  </>;

  if (format.id === 'album') content = <>
    <div className="v-sc-album-heading"><span className="v-sc-kicker">THE FAMILY ALBUM</span><strong>The Adeyemi family.</strong></div>
    <div className="v-sc-album-book"><AnimatePresence mode="wait" initial={false}>
      <motion.div className="v-sc-album-spread" key={albumSpread} initial={{ opacity: 0, rotateY: -9, x: 10 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} exit={{ opacity: 0, rotateY: 7, x: -8 }} transition={{ duration: .35, ease: [.22, 1, .36, 1] }}>
        <figure className="v-sc-album-page is-left"><PreviewPhoto name={photos[albumSpread]} alt="The Adeyemi family together in their album" /><figcaption>All of you, together.</figcaption></figure>
        <figure className="v-sc-album-page is-right"><PreviewPhoto name={photos[albumSpread + 1]} alt="Another portrait from the Adeyemi family album" /><figcaption><span>0{albumSpread + 1}</span><p>{albumSpread === 0 ? 'A family portrait, with a place for everyone.' : 'The smiles you will keep coming back to.'}</p></figcaption></figure>
        <span className="v-sc-album-spine" aria-hidden="true" />
      </motion.div>
    </AnimatePresence></div>
    <footer className="v-sc-album-footer"><span className="v-sc-position" role="status" aria-label={`Spread ${albumSpread + 1} of 2`}>0{albumSpread + 1}<i> / 02</i></span><button className="v-sc-action" type="button" onClick={() => setAlbumSpread(spread => spread === 0 ? 1 : 0)}>{albumSpread === 0 ? 'Turn the page' : 'Previous spread'}{albumSpread === 0 ? <ArrowRight size={16} aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}</button></footer>
  </>;

  if (format.id === 'event-coverage') {
    const scenes = [
      { title: 'Arrivals', line: 'The first greetings, before the programme begins.', alt: 'Guests checking in at a Lagos conference' },
      { title: 'Programme', line: 'The room turns its attention to the stage.', alt: 'The opening address at a Lagos conference' },
      { title: 'In between', line: 'Coffee, conversation and a few familiar faces.', alt: 'Conference guests talking over refreshments' }
    ];
    content = <>
      <div className="v-sc-event-heading"><span className="v-sc-kicker">THE CONFERENCE</span><strong>The day, scene by scene.</strong></div>
      <div className="v-sc-event-hero"><ChangingPhoto name={photos[sceneIndex]} alt={scenes[sceneIndex].alt} /><div className="v-sc-event-photo-caption"><span>0{sceneIndex + 1}</span><strong>{scenes[sceneIndex].title}</strong></div></div>
      <div className="v-sc-event-scenes" aria-label="Preview event scenes">{scenes.map((scene, index) => <button type="button" key={scene.title} className={sceneIndex === index ? 'is-selected' : ''} aria-label={`Preview ${scene.title.toLowerCase()} scene`} aria-pressed={sceneIndex === index} onClick={() => setSceneIndex(index)}><PreviewPhoto name={photos[index]} alt="" sizes="(max-width: 767px) 30vw, 220px" /><span><i>0{index + 1}</i>{scene.title}</span></button>)}</div>
      <footer className="v-sc-event-note" aria-live="polite">{scenes[sceneIndex].line}</footer>
    </>;
  }

  if (format.id === 'campaign') content = <>
    <div className="v-sc-campaign-heading"><span className="v-sc-kicker">LEATHER GOODS / CAMPAIGN</span><strong>The whole collection.<br /><em>Down to the details.</em></strong></div>
    <div className="v-sc-campaign-layout"><figure className="v-sc-campaign-hero"><PreviewPhoto name={photos[0]} alt="Leather handbag and matching accessories in a campaign photograph" /><figcaption><span>01</span>Hero photograph</figcaption></figure><div className="v-sc-campaign-details"><figure><PreviewPhoto name={photos[1]} alt="A close look at the leather and stitching" /><figcaption>02 / Detail</figcaption></figure><figure><PreviewPhoto name={photos[2]} alt="The leather collection photographed in use" /><figcaption>03 / Lifestyle</figcaption></figure></div></div>
    <footer className="v-sc-footer"><span>One collection. Every angle.</span><span>03 views</span></footer>
  </>;

  return <div ref={cardRef} role="group" aria-label={`${format.name} preview`} className={`v-showcase-card is-${format.id}${visible && !paused && !reduced ? ' is-playing' : ''}`}>
    {format.id === 'photo-story' && <div className="v-sc-story-progress" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>}
    <header className="v-sc-masthead"><span className="v-sc-studio"><Camera size={14} strokeWidth={1.5} aria-hidden="true" />VEYLO STUDIO</span><button type="button" className="v-sc-pause" aria-label={`${paused ? 'Play' : 'Pause'} ${format.name} preview`} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}</button></header>
    {content}
  </div>;
}
