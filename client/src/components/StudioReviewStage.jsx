import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Check, Clock, Music2, PenLine, Type } from 'lucide-react';
import { Photo } from './PublicDesign.jsx';

const DURATION = 5200;
const frames = [
  { step: '01', label: 'Opening look', photo: 'review-look-1', alt: 'Colour portrait of a photographer holding a mirrorless camera at her waist', caption: 'That calm, direct look sets the tone, so it belongs at the opening.', pace: '4.2 seconds', audio: 'Quiet introduction', type: 'Large serif opening' },
  { step: '02', label: 'Action look', photo: 'review-look-2', alt: 'Photographer smiling as she raises a mirrorless camera to chest height', caption: 'Her smile lifts the pace without taking attention away from the photograph.', pace: '3.6 seconds', audio: 'Beat enters', type: 'Compact sans caption' },
  { step: '03', label: 'Review frame', photo: 'review-look-3', alt: 'Photographer smiling as she checks the rear screen of her camera', caption: 'The moment she checked the frame gives the sequence a natural pause.', pace: '4.8 seconds', audio: 'Music pulls back', type: 'Serif reveal line' },
  { step: '04', label: 'Finale frame', photo: 'review-look-4', alt: 'Full-length colour portrait of a photographer beside a studio table', caption: 'That full-length portrait gives the session a confident place to finish.', pace: '5.2 seconds', audio: 'Closing note', type: 'Wide finale title' }
];

export default function StudioReviewStage() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [approved, setApproved] = useState(false);
  const reduced = useReducedMotion();
  const current = frames[active];

  useEffect(() => {
    if (reduced || paused || approved) return undefined;
    const timer = window.setTimeout(() => setActive(index => (index + 1) % frames.length), DURATION);
    return () => window.clearTimeout(timer);
  }, [active, paused, approved, reduced]);

  const choose = index => {
    setActive(index);
    setApproved(false);
  };

  return (
    <div
      className={'v-review-stage' + (approved ? ' is-approved' : '')}
      role="region"
      aria-label="Studio pre-flight review preview"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
    >
      <div className="v-review-stage-top">
        <div className="v-review-stage-meta"><span className="v-review-stage-dot" aria-hidden="true" /><span>STUDIO PRE-FLIGHT REVIEW</span></div>
        <span className="v-review-stage-count">FRAME {current.step} OF 04 · READY</span>
      </div>
      <div className="v-review-progress" aria-hidden="true">
        {frames.map((frame, index) => <span key={frame.step} className={index < active ? 'is-complete' : index === active ? 'is-active' : ''}>{index === active && <i className={paused ? 'is-paused' : ''} />}</span>)}
      </div>
      <motion.figure
        key={current.step}
        className="v-review-feature"
        initial={reduced ? false : { opacity: .45, clipPath: 'inset(0 0 12% 0)', scale: .985 }}
        animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)', scale: 1 }}
        transition={{ duration: reduced ? 0 : .62, ease: [.22, 1, .36, 1] }}
      >
        <motion.div initial={reduced ? false : { scale: 1.015 }} animate={reduced ? undefined : { scale: 1.055, y: '-1.2%' }} transition={reduced ? undefined : { duration: DURATION / 1000, ease: 'linear' }}>
          <Photo name={current.photo} alt={current.alt} sizes="(max-width: 767px) 88vw, 42vw" />
        </motion.div>
        <span className="v-review-feature-shade" />
        <span className="v-review-feature-note">Veylo’s suggested sequence</span>
        <figcaption><span>{current.step}</span><strong>{current.label}</strong></figcaption>
      </motion.figure>
    </div>
  );
}

