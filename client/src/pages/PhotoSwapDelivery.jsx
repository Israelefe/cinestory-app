import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, Heart, LockKeyhole, Music2, Type } from 'lucide-react';
import { Action, Eyebrow, Page, Reveal, TextLink } from '../components/PublicDesign.jsx';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import './PhotoSwapDelivery.css';

const portraits = [
  { name: 'demo-sharon-1', alt: "Sharon's finished studio portrait against a blue backdrop" },
  { name: 'demo-sharon-2', alt: "Sharon seated during her studio portrait session" },
  { name: 'demo-sharon-3', alt: "A closer portrait from Sharon's finished shoot" },
  { name: 'demo-sharon-4', alt: "The final photograph from Sharon's portrait session" }
];

function Print({ photo, design = 'paper', angle = -3, className = '', eager = false, decorative = false, delay = 0 }) {
  const reduced = useVeyloReducedMotion();
  return <motion.figure
    className={`v-ps-print v-ps-print-${design} ${className}`}
    initial={reduced ? false : { opacity: 0, y: 24, rotate: angle - 5 }}
    whileInView={{ opacity: 1, y: 0, rotate: angle }}
    viewport={{ once: true, amount: .2 }}
    transition={{ type: 'spring', stiffness: 110, damping: 22, delay }}
    aria-hidden={decorative || undefined}
  >
    <div className="v-ps-print-face">
      <img
        src={`/veylo/web/${photo.name}-480.webp`}
        srcSet={`/veylo/web/${photo.name}-480.webp 480w, /veylo/web/${photo.name}-960.webp 960w, /veylo/web/${photo.name}-1440.webp 1440w`}
        sizes="(max-width: 640px) 70vw, (max-width: 1024px) 35vw, 400px"
        alt={decorative ? '' : photo.alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding="async"
        width="480"
        height="640"
      />
    </div>
  </motion.figure>;
}

const details = [
  { icon: Type, title: 'A few words for each photo.', copy: 'Veylo drafts a short caption for each photograph. Review it or write your own before publishing.' },
  { icon: Music2, title: 'Set it to music.', copy: 'Choose a soundtrack for the set. It starts when your client opens the photographs, and they can mute it.' },
  { icon: Heart, title: 'Keep the favourites close.', copy: 'Let clients like a photograph and save the finished file. You choose which actions are available.' }
];

const steps = [
  { title: 'Add your finished photos', copy: 'Upload the edited set and add the client and shoot details.' },
  { title: 'Make it feel like your work', copy: 'Arrange the photographs, review the captions, and choose the style and music.' },
  { title: 'Preview, then send it', copy: 'Set downloads and access, check the client view, and publish your link.' }
];

export default function PhotoSwapDelivery() {
  return (
    <Page className="v-photoswap-page">
      <header className="v-wrap v-ps-hero">
        <Reveal className="v-ps-hero-copy">
          <Eyebrow>PhotoSwap · Finished photo delivery</Eyebrow>
          <h1>One photo.<br /><em>A closer look.</em></h1>
          <p className="v-ps-lead">Hand over the finished shoot as a stack of photographs. Your client swipes through your order, with room to look at each one.</p>
          <div className="v-actions">
            <Action to="/demo/photoswap">Try PhotoSwap</Action>
            <Action to="/create?type=photoswap" secondary>Create a PhotoSwap</Action>
          </div>
          <p className="v-ps-link-note"><LockKeyhole size={14} aria-hidden="true" />One link. Opens in their browser.</p>
        </Reveal>

        <Reveal className="v-ps-hero-preview" delay={.08}>
          <Link to="/demo/photoswap" className="v-ps-preview-link" aria-label="Open the PhotoSwap portrait demo">
            <div className="v-ps-preview-heading"><span>SHARON'S PORTRAITS</span><span>04 PHOTOGRAPHS</span></div>
            <div className="v-ps-hero-stack">
              <Print photo={portraits[1]} design="ink" angle={9} className="v-ps-hero-back" eager decorative delay={.12} />
              <Print photo={portraits[2]} design="folio" angle={-10} className="v-ps-hero-middle" eager decorative delay={.18} />
              <Print photo={portraits[0]} angle={-3} className="v-ps-hero-front" eager delay={.24} />
            </div>
            <div className="v-ps-preview-bottom"><span>A real set. Try it yourself.</span><span className="v-ps-demo-arrow"><ArrowUpRight size={20} aria-hidden="true" /></span></div>
          </Link>
        </Reveal>
      </header>

      <section className="v-ps-experience-section">
        <div className="v-wrap">
          <Reveal className="v-ps-section-heading">
            <Eyebrow number="01">The client's first look</Eyebrow>
            <h2>The photograph<br /><em>gets the whole card.</em></h2>
            <p>No cropped faces or crowded thumbnails. Each original photograph stays whole, in a frame with its own finish and a little movement.</p>
          </Reveal>
          <div className="v-ps-experience">
            <Reveal className="v-ps-closeup">
              <div className="v-ps-closeup-heading"><span>THE FINISHED PHOTOGRAPH</span><span>03 / 04</span></div>
              <Print photo={portraits[2]} design="folio" angle={3} className="v-ps-closeup-print" delay={.12} />
              <p>Different frames. The same photograph you finished.</p>
            </Reveal>
            <div className="v-ps-details">
              {details.map(({ icon: Icon, title, copy }, index) => (
                <Reveal className="v-ps-detail" key={title} delay={index * .05}>
                  <span className="v-ps-detail-icon"><Icon size={19} strokeWidth={1.5} aria-hidden="true" /></span>
                  <div><h3>{title}</h3><p>{copy}</p></div>
                </Reveal>
              ))}
              <Reveal className="v-ps-gallery-note" delay={.15}>
                <p>Reached the last photo? The full gallery is there at the end, so they can find a favourite again.</p>
                <TextLink to="/demo/photoswap">Open the client view</TextLink>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section className="v-ps-workflow-section">
        <div className="v-wrap v-ps-workflow">
          <div>
            <Reveal className="v-ps-section-heading">
              <Eyebrow number="02">Back at your studio</Eyebrow>
              <h2>The edits are done.<br /><em>Get the set ready to send.</em></h2>
            </Reveal>
            <ol className="v-ps-steps">
              {steps.map((step, index) => <motion.li key={step.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .5, delay: index * .06 }}>
                <span className="v-ps-step-number">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div>
              </motion.li>)}
            </ol>
          </div>
          <Reveal className="v-ps-handoff" delay={.08}>
            <div className="v-ps-handoff-top"><LockKeyhole size={18} aria-hidden="true" /><span>READY FOR YOUR CLIENT</span></div>
            <div className="v-ps-handoff-cover"><Print photo={portraits[3]} design="ink" angle={-4} delay={.12} /><div><span>PHOTO SWAP</span><h3>Sharon's<br />portraits</h3><p>The finished set.</p></div></div>
            <p className="v-ps-handoff-message">“Sharon, your portraits are ready. Here's the link to your photographs.”</p>
            <p className="v-ps-handoff-copy">Send it on WhatsApp or Instagram DM. Your client opens the link without creating an account.</p>
            <div className="v-ps-access-note"><Check size={15} aria-hidden="true" /><p>Add a PIN or expiry date when the set needs it.</p></div>
          </Reveal>
        </div>
      </section>

      <section className="v-ps-final-section">
        <div className="v-wrap">
          <Reveal className="v-ps-final">
            <div><Eyebrow>Your next finished shoot</Eyebrow><h2>Give it a<br /><em>proper first look.</em></h2><p>Try Sharon's portrait set, then make one for your client.</p></div>
            <div className="v-actions"><Action to="/demo/photoswap">Try the sample set</Action><Action to="/create?type=photoswap" secondary>Create a PhotoSwap</Action></div>
          </Reveal>
          <Reveal className="v-ps-format-note"><p>Prefer to open with the complete gallery?</p><Link to="/gridboard">See GridBoard <ArrowRight size={16} aria-hidden="true" /></Link><Link to="/formats">Compare delivery types <ArrowRight size={16} aria-hidden="true" /></Link></Reveal>
        </div>
      </section>
    </Page>
  );
}
