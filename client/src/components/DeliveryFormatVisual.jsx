import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpen, Film, Grid2X2, Layers3, MousePointer2 } from 'lucide-react';
import { Photo } from './PublicDesign.jsx';

const move = (reduced, values, duration = 8) => reduced
  ? { animate: {}, transition: { duration: 0 } }
  : { animate: values, transition: { duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' } };

export default function DeliveryFormatVisual({ format, compact = false, paused = false }) {
  const reduced = useReducedMotion();
  const visualRef = useRef(null);
  const visible = useInView(visualRef, { amount: .06, margin: '140px 0px' });
  const pauseMotion = reduced || paused || !visible;
  const photos = format.photos;
  const [chapterIndex, setChapterIndex] = useState(0);
  const [albumSpread, setAlbumSpread] = useState(0);
  const visualClass = id => `v-format-visual ${id} ${compact ? 'is-compact ' : ''}${pauseMotion ? '' : 'is-motion-active'}`;

  if (format.id === 'photo-story') return <div ref={visualRef} className={visualClass('is-story')}>
    <div className="v-visual-progress"><i /><i /><i /><i /></div>
    <motion.div className="v-visual-story-photo" {...move(pauseMotion, { scale: [1.02, 1.09], x: ['0%', '-1.5%'] }, 7.5)}><Photo name={photos[0]} alt={format.photoAlt || "Lora smiling in her Photo Story"} /></motion.div>
    <div className="v-visual-story-copy"><span>{format.storyEyebrow || 'A SWEET BEGINNING'}</span><strong>{format.storyCaption || 'Lora, that smile was the perfect way to begin your birthday story.'}</strong></div>
    <span className="v-visual-format-icon"><Film size={17} /></span>
  </div>;

  if (format.id === 'editorial-page') return <div ref={visualRef} className={visualClass('is-editorial')}>
    <div className="v-editorial-mast"><span>{format.editorialMast || 'THE PORTRAIT ISSUE'}</span><b>{format.editorialIssue || '01'}</b></div>
    <motion.div className="v-editorial-main" {...move(pauseMotion, { y: ['0%', '-2.5%'] }, 8.5)}><Photo name={photos[0]} alt={format.photoAlt || "Fashion photograph in an editorial page layout"} /></motion.div>
    <motion.div className="v-editorial-detail" {...move(pauseMotion, { y: ['2%', '-2%'], rotate: [-2, 0] }, 7)}><Photo name={photos[1]} alt={format.detailAlt || "Editorial fashion detail"} /></motion.div>
    <div className="v-editorial-title"><span>{format.editorialTag || 'STUDIO SERIES'}</span><strong>{format.editorialTitle || <>Form.<br />Colour.<br /><em>Presence.</em></>}</strong></div>
  </div>;

  if (format.id === 'photo-reveal') return <div ref={visualRef} className={visualClass('is-reveal')}>
    <span className="v-reveal-count">{format.revealCount || '01 / 04'}</span>
    <motion.div className="v-reveal-photo" initial={reduced ? false : { opacity: .78, clipPath: 'inset(0 0 14% 0)' }} whileInView={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }} viewport={{ once: true, amount: .08 }} transition={{ duration: reduced ? 0 : .9, ease: [0.22, 1, 0.36, 1] }}><motion.div className="v-reveal-photo-motion" {...move(pauseMotion, { scale: [1.015, 1.065], y: ['0%', '-1.5%'] }, 8.5)}><Photo name={photos[0]} alt={format.photoAlt || "Sharon’s portrait appearing during a client-controlled Photo Reveal"} /></motion.div></motion.div>
    <div className="v-reveal-instruction"><MousePointer2 size={15} /><span>Tap when you’re ready</span><ArrowRight size={15} /></div>
  </div>;

  if (format.id === 'canvas') return <div ref={visualRef} className={visualClass('is-canvas')}>
    <span className="v-canvas-coordinate">{format.canvasCoordinate || 'COURAGE / GRADUATION'}</span>
    <motion.figure className="v-canvas-photo is-one" {...move(pauseMotion, { x: ['0%', '2%'], y: ['0%', '-2%'] }, 8)}><Photo name={photos[0]} alt="Courage's graduation portrait arranged on an interactive canvas" /></motion.figure>
    <motion.figure className="v-canvas-photo is-two" {...move(pauseMotion, { x: ['0%', '-3%'], y: ['0%', '2%'] }, 9)}><Photo name={photos[1]} alt="A second graduation portrait in Courage's visual cluster" /></motion.figure>
    <motion.figure className="v-canvas-photo is-three" {...move(pauseMotion, { y: ['0%', '-4%'] }, 7)}><Photo name={photos[2]} alt="A graduation detail from Courage's shoot" /></motion.figure>
    <span className="v-visual-format-icon"><Grid2X2 size={17} /></span>
  </div>;

  if (format.id === 'album') {
    const leftPhoto = photos[albumSpread];
    const rightPhoto = photos[albumSpread + 1];
    return <div ref={visualRef} className={visualClass('is-album')}>
      <div className="v-album-preview-head"><span>{format.albumLabel || 'THE ADEYEMI FAMILY'}</span><strong>FAMILY ALBUM · 2026</strong></div>
      <div className="v-album-preview-book">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div className="v-album-preview-spread" key={albumSpread} initial={pauseMotion ? false : { opacity: 0, rotateY: -7, x: 14 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} exit={pauseMotion ? undefined : { opacity: 0, rotateY: 6, x: -12 }} transition={{ duration: pauseMotion ? 0 : .55, ease: [0.22, 1, 0.36, 1] }}>
            <figure className="v-album-preview-page is-left"><motion.span {...move(pauseMotion, { scale: [1.01, 1.045], x: ['0%', '-1%'] }, 9)}><Photo name={leftPhoto} alt="The Adeyemi family together in their digital album" /></motion.span><small>THE PEOPLE WHO MAKE HOME FEEL LIKE HOME</small></figure>
            <span className="v-album-preview-spine" aria-hidden="true" />
            <figure className="v-album-preview-page is-right"><motion.span {...move(pauseMotion, { scale: [1.01, 1.05], y: ['0%', '-1%'] }, 10)}><Photo name={rightPhoto} alt="A second portrait from the Adeyemi family album" /></motion.span><figcaption><i>0{albumSpread + 1}</i><p>{albumSpread === 0 ? 'A family portrait deserves more than a place in a folder.' : 'The frame they will come back to years from now.'}</p></figcaption></figure>
          </motion.div>
        </AnimatePresence>
      </div>
      <button type="button" className="v-album-preview-turn" onClick={() => setAlbumSpread(value => value === 0 ? 1 : 0)}><span>{albumSpread === 0 ? 'Turn the page' : 'Back to the opening'}</span><ArrowRight size={15} /></button>
      <span className="v-visual-format-icon"><BookOpen size={17} /></span>
    </div>;
  }

  const chapterNames = format.chapterNames || ['Side by Side', 'The Way They Looked', 'Just Us'];
  const chapterLines = format.chapterLines || ['The two of you, side by side, from the very first frame.', 'The smiles you kept finding between frames.', 'One quiet photograph of the two of you to close the collection.'];
  return <div ref={visualRef} className={visualClass('is-chapters')}>
    <div className="v-chapters-heading"><span>FOR FOLAKE &amp; TUNDE</span><strong>Where would you like to begin?</strong></div>
    <div className="v-chapters-map">{photos.map((photo, index) => <motion.button type="button" key={photo} className={`v-chapters-map-card is-card-${index + 1}${chapterIndex === index ? ' is-active' : ''}`} onClick={() => setChapterIndex(index)} whileHover={reduced ? undefined : { y: -4 }} whileTap={reduced ? undefined : { scale: .98 }} aria-label={`Select ${chapterNames[index] || `Chapter ${index + 1}`}`}>
      <motion.span className="v-chapters-map-photo" {...move(pauseMotion, { scale: [1.01, 1.05], x: index % 2 ? ['0%', '-1%'] : ['-1%', '1%'] }, 9 + index)}><Photo name={photo} alt={`${chapterNames[index] || `Chapter ${index + 1}`} chapter from Folake and Tunde's portraits`} /></motion.span>
      <span className="v-chapters-map-label"><i>0{index + 1}</i><strong>{chapterNames[index]}</strong></span>
    </motion.button>)}</div>
    <div className="v-chapters-map-summary"><span>CHAPTER 0{chapterIndex + 1}</span><strong>{chapterNames[chapterIndex]}</strong><p>{chapterLines[chapterIndex]}</p></div>
    <span className="v-visual-format-icon"><Layers3 size={17} /></span>
  </div>;
}

