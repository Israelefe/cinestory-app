import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Images, LoaderCircle } from 'lucide-react';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import DeliveryOpeningPreview from './DeliveryOpeningPreview.jsx';
import './DeliveryFormatPicker.css';

const descriptions = {
  'photo-story': 'A timed sequence with captions and music.',
  editorial: 'A photo feature they scroll through like a magazine.',
  'photo-reveal': 'They tap to reveal each photograph.',
  canvas: 'Framed photos on a connected, scrolling board.',
  chapters: 'They choose a chapter, then explore its photos.',
  album: 'They turn through photographs, page by page.',
  'event-coverage': 'Highlights first, then the day grouped by scene.',
  campaign: 'A presentation followed by organised file sets.'
};
function demoPath(value) { return value === 'photo-story' ? '/demo' : '/demo/' + (value === 'photo-reveal' ? 'reveal' : value); }

export default function DeliveryFormatPicker({ formats, format, recommendation, onSelect, onContinue, onBack, busy, bounds }) {
  const reduced = useVeyloReducedMotion();
  const selected = formats.find(item => item.value === format);
  const preview = selected || formats.find(item => item.value === recommendation?.format) || formats[0];
  const range = bounds[preview.value];
  return <section className="v-format-picker">
    <header className="v-format-picker-head"><span>02 / THE FORMAT</span><h1>Choose how they first<br /> see the work.</h1><p>Pick a first viewing that suits this shoot. The full gallery follows.</p></header>
    <div className="v-format-picker-workspace">
      <section className="v-format-picker-preview" aria-label="Selected format preview">
        <div className="v-format-picker-preview-bar"><span><i /> CLIENT VIEW</span><small>Example photographs</small></div>
        <div className="v-format-picker-stage"><AnimatePresence mode="wait"><motion.div className="v-format-picker-preview-content" key={preview.value} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}><DeliveryOpeningPreview format={preview} /></motion.div></AnimatePresence></div>
        <div className="v-format-picker-preview-caption"><div><strong>{preview.name}</strong><span>{descriptions[preview.value]}</span></div><Link to={demoPath(preview.value)} target="_blank" rel="noopener noreferrer">Try the demo <ExternalLink size={14} /></Link></div>
      </section>
      <div className="v-format-picker-options">
        <fieldset disabled={!!busy}>
          <legend>Eight ways to begin</legend>
          {recommendation?.reason && <p className="v-format-picker-recommendation"><span>OUR SUGGESTION</span>{recommendation.reason}</p>}
          <div className="v-format-picker-grid">
            {formats.map(item => <label className="v-format-picker-option" key={item.value}>
              <input type="radio" name="format" value={item.value} checked={format === item.value} onChange={() => onSelect(item.value)} aria-label={item.name} aria-describedby={'format-description-' + item.value} />
              <span className="v-format-picker-option-body">
                <span className="v-format-picker-option-top"><span className="v-format-picker-number">{item.number}</span>{recommendation?.format === item.value && <span className="v-format-picker-suggested">Suggested</span>}<span className="v-format-picker-check" aria-hidden="true">{format === item.value && <Check size={12} strokeWidth={2.5} />}</span></span>
                <strong>{item.name}</strong><span className="v-format-picker-description" id={'format-description-' + item.value}>{descriptions[item.value]}</span><small>{bounds[item.value][0]}–{bounds[item.value][1]} showcase photos</small>
              </span>
            </label>)}
          </div>
        </fieldset>
        <p className="v-format-picker-gallery-note"><Images size={17} strokeWidth={1.5} /><span>These limits are for the showcase.<br />Every uploaded photo stays in the full gallery.</span></p>
      </div>
    </div>
    <footer className="v-format-picker-actions">
      <div className="v-format-picker-summary" aria-live="polite"><span>YOUR FORMAT</span><strong>{selected?.name || 'Choose a format'}</strong><small>{selected ? range[0] + '–' + range[1] + ' showcase photos' : 'Select one to continue'}</small></div>
      <div className="v-format-picker-buttons"><button className="v-format-picker-back" type="button" onClick={onBack} disabled={!!busy}><ArrowLeft size={16} /> Back</button><button className="v-format-picker-continue" type="button" onClick={onContinue} disabled={!!busy || !selected}>{busy ? <LoaderCircle size={17} className="v3-spin" /> : null}Continue to photos<ArrowRight size={17} /></button></div>
    </footer>
  </section>;
}
