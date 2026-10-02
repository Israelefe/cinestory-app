import { ProPrice, PricingNotice } from '../components/RegionalPricing.jsx';
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Camera,
  Clapperboard,
  Image,
  LayoutGrid,
  MessageSquare,
  Palette,
  ShieldCheck,
  Smartphone,
  Type
} from 'lucide-react';
import PortfolioShowcase from '../components/PortfolioShowcase.jsx';
import { Action, Eyebrow, Page, Photo, Reveal } from '../components/PublicDesign.jsx';

const directionChoices = [
  { icon: Image, label: 'Opening image', value: 'Lead with the work you want to book again' },
  { icon: LayoutGrid, label: 'Categories', value: 'Keep weddings, portraits, and campaigns easy to find' },
  { icon: Type, label: 'Studio details', value: 'Make your name, location, and point of view clear' },
  { icon: Palette, label: 'Presentation', value: 'Let colour and spacing support the photographs' }
];

export default function PortfolioPage({ user }) {
  const reduced = useReducedMotion();

  return (
    <Page className="v-portfolio-page">
      <header className="v-wrap v-portfolio-hero">
        <div className="v-portfolio-hero-title">
          <Eyebrow>Veylo Portfolio · Included with Pro</Eyebrow>
          <h1 className="v-title">
            Your strongest work deserves its own address.<br />
            <em>Give it a home that feels like your studio.</em>
          </h1>
        </div>

        <motion.div
          className="v-portfolio-hero-art"
          initial={reduced ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.9, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="v-portfolio-hero-address">
            <span>KOLAWOLE MEDIA</span>
            <span>LEKKI · LAGOS</span>
          </div>
          <figure className="v-portfolio-hero-main">
            <Photo name="demo-wedding-1" alt="Folake and Tunde featured on a photographer portfolio" eager sizes="(max-width: 767px) 88vw, 48vw" />
          </figure>
          <figure className="v-portfolio-hero-side is-top">
            <Photo name="demo-ada-1" alt="Ada’s green fashion editorial" eager sizes="(max-width: 767px) 38vw, 18vw" />
          </figure>
          <figure className="v-portfolio-hero-side is-bottom">
            <Photo name="demo-lora-4" alt="Lora’s birthday portrait" eager sizes="(max-width: 767px) 36vw, 16vw" />
          </figure>
          <div className="v-portfolio-hero-folio" aria-hidden="true">01</div>
          <div className="v-portfolio-hero-caption">
            <span>Featured celebration</span>
            <strong>Folake &amp; Tunde</strong>
          </div>
        </motion.div>

        <div className="v-portfolio-hero-after">
          <p className="v-lead">
            Put your strongest weddings, portraits, celebrations, and campaigns in one public place. When a potential client asks to see your work, you have one address ready to send.
          </p>
          <div className="v-portfolio-hero-actions"><Action to={user ? '/portfolio/manage' : '/signup'}>{user ? 'Create or edit your portfolio' : 'Create your account'}</Action><a href="#portfolio-showcase">Explore the sample</a></div>
          <div className="v-portfolio-handle">
            <Camera size={17} aria-hidden="true" />
            <strong>veylo.com.ng/@yourstudio</strong>
            <span>Example address</span>
          </div>
        </div>
      </header>

      <section id="portfolio-showcase" className="v-wrap"><PortfolioShowcase /></section>

      <section className="v-section v-portfolio-direction">
        <div className="v-wrap v-portfolio-direction-grid">
          <Reveal className="v-portfolio-direction-copy">
            <Eyebrow number="01">What a potential client sees first</Eyebrow>
            <h2 className="v-heading">
              Show the work<br />
              <em>you want to be hired for.</em>
            </h2></Reveal>

          <Reveal className="v-portfolio-direction-art" delay={0.08}>
            <div className="v-pdirection-board">
              <header>
                <span>Ada’s editorial · selected for the opening</span>
                <strong>THE GREEN ISSUE</strong>
              </header>
              <figure className="v-pdirection-main">
                <Photo name="demo-ada-2" alt="Ada’s main fashion editorial portrait" sizes="(max-width: 767px) 70vw, 32vw" />
              </figure>
              <figure className="v-pdirection-detail is-first">
                <Photo name="demo-ada-3" alt="A close portrait from Ada’s fashion editorial" sizes="(max-width: 767px) 32vw, 14vw" />
              </figure>
              <figure className="v-pdirection-detail is-second">
                <Photo name="demo-ada-4" alt="A seated portrait from Ada’s fashion editorial" sizes="(max-width: 767px) 34vw, 15vw" />
              </figure>
              <div className="v-pdirection-palette" aria-label="Proposed palette: emerald, ivory, warm black">
                <i /><i /><i />
              </div>
              <p>ADA<br /><em>Moves in green.</em></p>
              <div className="v-pdirection-status"><Clapperboard size={14} />Public preview ready</div>
            </div>
          </Reveal>
<Reveal className="v-polish-after v-portfolio-direction-copy-after">
            <p className="v-copy">
              A visitor may give your portfolio less than a minute. Choose the opening photograph, make your main categories obvious, and keep your location and contact route close to the work. You can change any of it before the page goes public.
            </p>
            <div className="v-portfolio-direction-list">
              {directionChoices.map(({ icon: Icon, label, value }) => (
                <div key={label}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="v-section v-portfolio-workflow">
        <div className="v-wrap">
          <Reveal className="v-section-head">
            <div>
              <Eyebrow number="02">From delivery to portfolio</Eyebrow>
              <h2 className="v-heading">Your finished work is already here.<br /><em>Choose what the public sees.</em></h2>
            </div>
            <p className="v-copy">No second upload and no empty page builder. Start with work you have already delivered, then review every choice before publishing.</p>
          </Reveal>

          <div className="v-portfolio-steps">
            {[
              ['I', 'Choose the work', 'Add a completed Veylo project or select individual photographs you want in your public portfolio.'],
              ['II', 'Choose a design', 'Try Editorial, Cinema, Gallery, or Folio. Group your photographs by category, then check the page on a phone before publishing.'],
              ['III', 'Publish one address', 'Add your Veylo address to Instagram, WhatsApp Business, or a client proposal. Update it whenever you have stronger work to show.']
            ].map(([number, title, copy], index) => (
              <motion.article
                key={number}
                initial={reduced ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={reduced ? { duration: 0 } : { duration: 0.65, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
              >
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="v-section v-portfolio-controls">
        <div className="v-wrap">
          <Reveal className="v-portfolio-controls-head">
            <Eyebrow number="03">Made for the way clients find you</Eyebrow>
            <h2 className="v-heading">Easy to open.<br /><em>Easy to trust.</em></h2>
          </Reveal>
          <div className="v-portfolio-control-grid">
            {[
              {
                icon: Smartphone,
                title: 'Comfortable on a phone',
                copy: 'The layout adapts to the screen, and each photograph is served at an appropriate size for the device viewing it.'
              },
              {
                icon: MessageSquare,
                title: 'One tap to ask about a shoot',
                copy: 'A visitor can move from admiring your work to starting a WhatsApp conversation without filling a long contact form.'
              },
              {
                icon: ShieldCheck,
                title: 'You decide what becomes public',
                copy: 'Private client deliveries stay private. A photograph only appears in your portfolio when you choose to add it.'
              }
            ].map(({ icon: Icon, title, copy }, index) => (
              <motion.article
                key={title}
                initial={reduced ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={reduced ? { duration: 0 } : { duration: 0.62, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="v-wrap v-portfolio-closing">
        <motion.div
          className="v-portfolio-closing-card"
          initial={reduced ? false : { opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={reduced ? { duration: 0 } : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
          <Photo name="portrait-soft" alt="A softly lit portrait behind the Veylo Portfolio invitation" sizes="100vw" />
          <div className="v-portfolio-closing-shade" />
          <div className="v-portfolio-closing-copy">
            <Eyebrow>Veylo Portfolio · Included with Pro</Eyebrow>
            <h2>When someone asks to see your work,<br /><em>send one link you are proud of.</em></h2>
            <p>Veylo Portfolio is included with Pro at <ProPrice /> per month. See the pricing page for the complete plan comparison.</p>
            <div className="v-actions">
              <Action to="/signup">Create your account</Action>
              <Action to="/pricing" secondary>View what Pro includes</Action>
            </div>
          </div>
        </motion.div>
      </section>
    </Page>
  );
}
