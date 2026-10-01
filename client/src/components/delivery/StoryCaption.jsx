import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus.js';

export function StoryCaptionContent({ text, children, onRead }) {
  const copy = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = copy.current;
    const measure = () => {
      const heading = element?.querySelector('h2');
      setOverflowing(Boolean(heading && heading.scrollHeight > heading.clientHeight + 2));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (element) observer?.observe(element);
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [text]);
  return <><div ref={copy} className="v-story-caption-copy">{children}</div>{overflowing && <button type="button" className="v-story-read-caption" onClick={onRead}>Read full caption<ArrowUpRight size={14} /></button>}</>;
}

export function StoryCaptionDialog({ title, text, onClose }) {
  const panel = useRef(null);
  const reduced = useReducedMotion();
  useDialogFocus(true, panel, onClose);
  return createPortal(<motion.div className="v-story-reading-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section ref={panel} className="v-story-reading" role="dialog" aria-modal="true" aria-labelledby="story-reading-title" tabIndex={-1} initial={reduced ? false : { y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: reduced ? 0 : .25 }}>
      <header><div><span>Playback paused</span><h2 id="story-reading-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close caption"><X size={20} /></button></header>
      <p>{text}</p><button type="button" className="v-story-reading-return" onClick={onClose}>Back to the story</button>
    </motion.section>
  </motion.div>, document.body);
}
