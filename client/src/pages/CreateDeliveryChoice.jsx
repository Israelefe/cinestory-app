import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Clapperboard, Grid2X2, Image, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import './CreateDeliveryChoice.css';
import './GridboardChoice.css';

const gridboardPreviewPhotos = ['event-06-arrivals-greeting.webp', 'event-02-keynote.webp', 'event-05-details.webp', 'event-10-networking-conversation.webp', 'event-13-partner-table.webp', 'event-16-stage-performance.webp'];

const types = [
  { id: 'showcase', title: 'Showcase Delivery', line: 'Lead with a designed experience, then open the full gallery.', detail: 'Choose from Photo Story, Editorial Page, Photo Reveal, Canvas, Chapters, Album, Event Coverage, and Campaign Delivery.', icon: Clapperboard, action: 'Create a Showcase' },
  { id: 'pinboard', title: 'GridBoard Delivery', line: 'Put the finished gallery first in a board clients can browse freely.', detail: 'Veylo studies the photos, suggests three arrangements and useful moment groups, and keeps every uploaded photo in the board.', icon: Grid2X2, action: 'Create a GridBoard' }
];

export default function CreateDeliveryChoice() {
  const reduced = useReducedMotion();
  return <main className="v-create-choice">
    <div className="v-create-choice-top"><Link to="/dashboard" aria-label="Back to dashboard"><Image size={18} /> Dashboard</Link><span>NEW DELIVERY</span></div>
    <section className="v-create-choice-intro">
      <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}>
        <p>START WITH THE CLIENT EXPERIENCE</p><h1>How should this gallery open?</h1><span>Both options deliver every finished photo. Choose the presentation that suits this shoot.</span>
      </motion.div>
    </section>
    <section className="v-create-choice-grid" aria-label="Choose a delivery type">
      {types.map((type, index) => {
        const Icon = type.icon;
        return <motion.article key={type.id} className={'v-create-choice-card is-' + type.id} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .38, delay: index * .08 }}>
          <div className="v-create-choice-visual" aria-hidden="true">
            <span className="v-create-choice-visual-tag">{type.id === 'showcase' ? 'A PRESENTATION FIRST' : 'THE FULL BOARD FIRST'}</span>
            {type.id === 'showcase' ? <div className="v-choice-story"><div className="v-choice-story-photo" /><div><small>PHOTO STORY</small><b>Made to be remembered.</b><i /></div></div> : <div className="v-choice-masonry">{gridboardPreviewPhotos.map(photo => <span key={photo}><img src={`/veylo/demo/event/${photo}`} alt="" loading="lazy" decoding="async" /></span>)}</div>}
          </div>
          <div className="v-create-choice-copy"><Icon size={20} aria-hidden="true" /><h2>{type.title}</h2><p className="v-create-choice-line">{type.line}</p><p>{type.detail}</p>
            <Link className="v-create-choice-cta" to={'/create?type=' + type.id}>{type.action}<ArrowRight size={17} /></Link>
            {type.id === 'pinboard' && <Link className="v-create-choice-demo" to="/demo/gridboard">See a GridBoard example</Link>}
          </div>
        </motion.article>;
      })}
    </section>
    <p className="v-create-choice-foot"><Layers3 size={16} /> Showcase and GridBoard deliveries share the same photo limits, access controls, and publishing rules.</p>
  </main>;
}
