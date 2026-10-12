import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clapperboard, ExternalLink, Grid2X2, Images, Layers3 } from 'lucide-react';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import DeliveryOpeningPreview from '../components/delivery/DeliveryOpeningPreview.jsx';
import ShowcaseFormatOverview from '../components/delivery/ShowcaseFormatOverview.jsx';
import './CreateDeliveryChoice.css';

const types = [
  { id: 'showcase', title: 'Showcase Delivery', shortName: 'Showcase', line: 'Eight formats. A presentation before the gallery.', detail: 'Photo Story, Editorial Page, Photo Reveal, Canvas, Chapters, Album, Event Coverage or Campaign Delivery. Choose the format after adding your shoot details.', icon: Clapperboard, demo: '/formats', note: 'All eight Showcase formats · open any preview above' },
  { id: 'pinboard', title: 'GridBoard Delivery', shortName: 'GridBoard', line: 'The complete gallery, ready to browse.', detail: 'Open with a photo board. Clients can find a moment, open a photograph or play a slideshow, with every finished photo in one place.', icon: Grid2X2, demo: '/demo/gridboard', note: 'GridBoard example · the full gallery opens first' },
  { id: 'photoswap', title: 'Photo Swap Delivery', shortName: 'Photo Swap', line: 'One photograph at a time. Swipe for the next.', detail: 'A stack of finished photographs, in the order you choose. Clients swipe through the set, with likes and downloads on each photo.', icon: Layers3, demo: '/demo/photoswap', note: 'Photo Swap example · swipe through the shoot' }
];

export default function CreateDeliveryChoice() {
  const reduced = useVeyloReducedMotion();
  const [selected, setSelected] = useState('showcase');
  const current = types.find(type => type.id === selected);
  return <main className="v-create-choice">
    <div className="v-create-choice-shell">
      <nav className="v-choice-top" aria-label="Create delivery"><Link to="/dashboard"><ArrowLeft size={16} /> Dashboard</Link><span>VEYLO <i /> NEW DELIVERY</span></nav>
      <motion.header className="v-choice-intro" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}>
        <div><span className="v-choice-eyebrow">THE FIRST LOOK</span><h1>How should this<br className="v-choice-title-break" /> gallery open?</h1><p>Choose what your client sees when they open your link.</p></div>
        <aside><Images size={21} strokeWidth={1.5} /><p>Every finished photo.<br /><span>Whichever way you share it.</span></p></aside>
      </motion.header>
      <div className="v-choice-workspace">
        <section className="v-choice-preview" aria-label="Delivery preview">
          <div className="v-choice-preview-bar"><span><i /> CLIENT VIEW</span><small>Example photographs</small></div>
          <div className="v-choice-preview-stage"><AnimatePresence mode="wait"><motion.div className="v-choice-preview-content" key={selected} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>{selected === 'showcase' ? <ShowcaseFormatOverview /> : <DeliveryOpeningPreview kind={selected} />}</motion.div></AnimatePresence></div>
          <div className="v-choice-preview-caption"><p>{current.note}</p><Link to={current.demo} target="_blank" rel="noopener noreferrer">{selected === 'showcase' ? 'Compare the formats' : 'Try the client demo'} <ExternalLink size={14} /></Link></div>
        </section>
        <section className="v-choice-options">
          <fieldset className="v-choice-fieldset"><legend>Choose a delivery type</legend><div className="v-choice-option-list">
            {types.map((type, index) => {
              const Icon = type.icon;
              return <motion.label key={type.id} className="v-choice-option" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, delay: index * .05 }}>
                <input type="radio" name="delivery-type" value={type.id} checked={selected === type.id} onChange={() => setSelected(type.id)} aria-label={type.title} aria-describedby={'choice-' + type.id} />
                <span className="v-choice-option-body"><span className="v-choice-option-icon"><Icon size={21} strokeWidth={1.5} /></span><span className="v-choice-option-copy"><h2 aria-label={type.title}><span className="v-choice-type-full">{type.title}</span><span className="v-choice-type-short">{type.shortName}</span></h2><span id={'choice-' + type.id}>{type.line}</span></span><span className="v-choice-option-check" aria-hidden="true">{selected === type.id && <Check size={13} strokeWidth={2.5} />}</span></span>
              </motion.label>;
            })}
          </div></fieldset>
          <div className="v-choice-selection-note" aria-live="polite"><span>WITH {current.shortName.toUpperCase()}</span><p>{current.detail}</p></div>
          <div className="v-choice-gallery-note"><Images size={17} strokeWidth={1.5} /><span>Your finished photos stay in the full gallery.</span></div>
        </section>
      </div>
      <div className="v-choice-actions"><div><span>YOUR CHOICE</span><strong>{current.title}</strong></div><Link className="v-choice-continue" to={'/create?type=' + selected}>Continue with {current.shortName}<ArrowRight size={17} /></Link></div>
    </div>
  </main>;
}
