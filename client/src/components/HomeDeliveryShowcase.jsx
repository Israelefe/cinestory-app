import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Film, Grid2X2 } from 'lucide-react';
import DeliveryFormatVisual from './DeliveryFormatVisual.jsx';
import { Action, Photo, TextLink } from './PublicDesign.jsx';
import { DELIVERY_FORMATS } from '../constants/deliveryFormats.js';

const demos = {
  'photo-story': '/demo?preset=lora', 'editorial-page': '/demo/editorial',
  'photo-reveal': '/demo/reveal', canvas: '/demo/canvas', chapters: '/demo/chapters',
  album: '/demo/album', 'event-coverage': '/demo/event-coverage', campaign: '/demo/campaign'
};
const descriptions = {
  'photo-story': 'Photographs, words, and music, arranged as a story your client can watch before opening the gallery.',
  'editorial-page': 'A magazine-style page with room for the portraits, the details, and the character of the shoot.',
  'photo-reveal': 'Each tap brings the next photograph into view. Your client sets the pace.',
  canvas: 'An open composition your client can explore, with related photographs grouped together.',
  chapters: 'Give each part of the shoot its own opening. Your client chooses where to begin.',
  album: 'Finished photographs arranged into pages, ready to turn through and return to.',
  'event-coverage': 'Highlights, people, and scenes from the day, followed by the complete event gallery.',
  campaign: 'Present the campaign, then hand over organised asset sets and the usage terms you provide.'
};
const indexFromHash = hash => DELIVERY_FORMATS.findIndex(format => '#' + format.id === hash);

export default function HomeDeliveryShowcase() {
  const { hash } = useLocation();
  const [type, setType] = useState('showcase');
  const [selected, setSelected] = useState(() => Math.max(0, indexFromHash(hash)));
  const tabs = useRef([]);
  const reduced = useReducedMotion();
  const format = DELIVERY_FORMATS[selected];

  useEffect(() => {
    const index = indexFromHash(hash);
    if (index >= 0) { setType('showcase'); setSelected(index); }
  }, [hash]);

  function moveTab(event, index) {
    const columns = window.matchMedia('(min-width: 768px)').matches ? 4 : 2;
    const shifts = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = DELIVERY_FORMATS.length - 1;
    else if (event.key in shifts) next = (index + shifts[event.key] + DELIVERY_FORMATS.length) % DELIVERY_FORMATS.length;
    else return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }

  function rememberDemo(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    window.history.replaceState(window.history.state, '', '/#' + format.id);
  }

  return <div className="v-home-delivery-showcase">
    <div className="v-home-type-choice" role="group" aria-label="Delivery type">
      <button type="button" aria-pressed={type === 'showcase'} onClick={() => setType('showcase')}><Film size={18} /><span>Showcase<small>Presentation, then gallery</small></span><ArrowRight size={17} /></button>
      <button type="button" aria-pressed={type === 'gridboard'} onClick={() => setType('gridboard')}><Grid2X2 size={18} /><span>GridBoard<small>The full gallery first</small></span><ArrowRight size={17} /></button>
    </div>
    {type === 'showcase' ? <>
      <div className="v-home-format-tabs" role="tablist" aria-label="Showcase formats">
        {DELIVERY_FORMATS.map((item, index) => <button key={item.id} id={item.id} ref={node => { tabs.current[index] = node; }} type="button" role="tab" aria-selected={selected === index} aria-controls="home-format-panel" tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onFocus={() => setSelected(index)} onKeyDown={event => moveTab(event, index)}><span>{item.number}</span>{item.name}</button>)}
      </div>
      <div id="home-format-panel" role="tabpanel" aria-labelledby={format.id} className="v-home-format-panel">
        <motion.div key={format.id} className="v-home-format-preview" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .3 }}><DeliveryFormatVisual key={format.id} format={format} /></motion.div>
        <div className="v-home-format-description">
          <span className="v-home-small-label">SHOWCASE / {format.number} OF 08</span><h3>{format.name}</h3><p>{descriptions[format.id]}</p>
          <span className="v-home-gallery-note"><Grid2X2 size={16} />Complete gallery and downloads included</span>
          <Action to={demos[format.id]} onClick={rememberDemo}>Open this demo</Action><TextLink to="/formats">Explore all eight formats</TextLink>
        </div>
      </div>
    </> : <div className="v-home-format-panel v-home-gridboard-panel">
      <motion.div className="v-home-gridboard-preview" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .3 }}>
        <div className="v-home-gridboard-top"><span>LORA’S BIRTHDAY</span><Grid2X2 size={16} /></div>
        <div className="v-home-gridboard-photos">{[1, 6, 5, 3, 4, 2].map(number => <Photo key={number} name={'demo-lora-' + number} alt={'Birthday portrait of Lora, photograph ' + number} sizes="(max-width: 767px) 43vw, 24vw" />)}</div>
        <div className="v-home-gridboard-bottom"><span>Six finished photographs</span><span>Full gallery <ArrowRight size={14} /></span></div>
      </motion.div>
      <div className="v-home-format-description"><span className="v-home-small-label">GRIDBOARD DELIVERY</span><h3>Everything.<br />Ready to browse.</h3><p>Open straight into the complete gallery. Clients can find a moment, browse by outfit or backdrop colour, and download their photographs.</p><span className="v-home-gallery-note"><Grid2X2 size={16} />Gallery layouts chosen by you</span><Action to="/demo/gridboard">Open the GridBoard demo</Action><TextLink to="/gridboard">See what GridBoard can do</TextLink></div>
    </div>}
    <p className="v-home-section-footnote">Both delivery types include the complete gallery. Your finished photographs stay as supplied.</p>
  </div>;
}
