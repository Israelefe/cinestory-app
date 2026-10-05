import React from 'react';
import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { ArrowRight, Clapperboard, Grid2X2, Image, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import './CreateDeliveryChoice.css';
import './GridboardChoice.css';

const gridboardPreviewPhotos = [4, 1, 5, 6, 2, 3].map(number => `/veylo/web/demo-lora-${number}-480.webp`);
const showcaseFormats = [
  ['Photo Story', '/veylo/web/demo-lora-4-480.webp'],
  ['Editorial Page', '/veylo/web/demo-ada-1-480.webp'],
  ['Photo Reveal', '/veylo/web/demo-sharon-1-480.webp'],
  ['Canvas', '/veylo/web/audience-portrait-480.webp'],
  ['Chapters', '/veylo/web/demo-wedding-1-480.webp'],
  ['Album', '/veylo/web/demo-lora-1-480.webp'],
  ['Event Coverage', '/veylo/web/demo-wedding-3-480.webp'],
  ['Campaign Delivery', '/veylo/web/commercial-480.webp']
];

const types = [
  { id: 'showcase', title: 'Showcase Delivery', line: 'Lead with a designed experience, then open the full gallery.', detail: 'Choose from Photo Story, Editorial Page, Photo Reveal, Canvas, Chapters, Album, Event Coverage, and Campaign Delivery.', icon: Clapperboard, action: 'Create a Showcase' },
  { id: 'pinboard', title: 'GridBoard Delivery', line: 'Put the finished gallery first in a board clients can browse freely.', detail: 'Veylo studies the photos, suggests three arrangements and useful moment groups, and keeps every uploaded photo in the board.', icon: Grid2X2, action: 'Create a GridBoard' },
  { id: 'photoswap', title: 'Photo Swap Delivery', line: 'A full-screen stack your client can swipe through one photo at a time.', detail: 'Upload finished photos, set their order, choose the background, and publish a private link.', icon: Layers3, action: 'Create a Photo Swap' }
];

export default function CreateDeliveryChoice() {
  const reduced = useVeyloReducedMotion();
  return <main className="v-create-choice">
    <div className="v-create-choice-top"><Link to="/dashboard" aria-label="Back to dashboard"><Image size={18} /> Dashboard</Link><span>NEW DELIVERY</span></div>
    <section className="v-create-choice-intro">
      <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}>
        <p>START WITH THE CLIENT EXPERIENCE</p><h1>How should this gallery open?</h1><span>All three options deliver every finished photo. Choose the presentation that suits this shoot.</span>
      </motion.div>
    </section>
    <section className="v-create-choice-grid" aria-label="Choose a delivery type">
      {types.map((type, index) => {
        const Icon = type.icon;
        return <motion.article key={type.id} className={'v-create-choice-card is-' + type.id} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .38, delay: index * .08 }}>
          <div className="v-create-choice-heading"><Icon size={20} aria-hidden="true" /><h2>{type.title}</h2></div>
          <div className="v-create-choice-visual" aria-hidden="true">
            <span className="v-create-choice-visual-tag">
              {type.id === 'showcase' ? 'EIGHT WAYS TO OPEN' : type.id === 'pinboard' ? 'THE FULL BOARD FIRST' : 'ONE PHOTO AT A TIME'}
            </span>
            {type.id === 'showcase' ? (
              <div className="v-choice-showcase">{showcaseFormats.map(([name, photo]) => <span className="v-choice-format" key={name}><img src={photo} alt="" loading="lazy" decoding="async" /><b>{name}</b></span>)}</div>
            ) : type.id === 'pinboard' ? (
              <div className="v-choice-masonry">{gridboardPreviewPhotos.map(photo => <span key={photo}><img src={photo} alt="" loading="lazy" decoding="async" /></span>)}</div>
            ) : (
              <div className="v-choice-photoswap">
                <span className="v-choice-swap-card is-back"><img src="/veylo/web/demo-sharon-1-480.webp" alt="" loading="lazy" decoding="async" /></span>
                <span className="v-choice-swap-card is-mid"><img src="/veylo/web/demo-ada-1-480.webp" alt="" loading="lazy" decoding="async" /></span>
                <span className="v-choice-swap-card is-front"><img src="/veylo/web/demo-lora-1-480.webp" alt="" loading="lazy" decoding="async" /></span>
              </div>
            )}
          </div>
          <div className="v-create-choice-copy"><p className="v-create-choice-line">{type.line}</p><p>{type.detail}</p>
            <Link className="v-create-choice-cta" to={'/create?type=' + type.id}>{type.action}<ArrowRight size={17} /></Link>
            {type.id === 'pinboard' && <Link className="v-create-choice-demo" to="/demo/gridboard">See a GridBoard example</Link>}
            {type.id === 'photoswap' && <><Link className="v-create-choice-demo" to="/photoswap">See how Photo Swap works</Link><Link className="v-create-choice-demo" to="/demo/photoswap">Try the live demo</Link></>}
          </div>
        </motion.article>;
      })}
    </section>
    <p className="v-create-choice-foot"><Layers3 size={16} /> Showcase, GridBoard, and Photo Swap deliveries share the same photo limits, access controls, and publishing rules.</p>
  </main>;
}
