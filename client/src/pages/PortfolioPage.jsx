import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Camera,
  Check,
  Clapperboard,
  Copy,
  Image,
  LayoutGrid,
  MapPin,
  MessageSquare,
  Palette,
  ShieldCheck,
  Smartphone,
  Type
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Action, Eyebrow, Page, Photo, Reveal } from '../components/PublicDesign.jsx';

const studioProfile = {
  name: 'KOLAWOLE MEDIA',
  tagline: 'Weddings · Editorial Portraits · Commercial',
  location: 'Lekki, Lagos',
  handle: 'veylo.com.ng/@kolawolemedia',
  bio: 'Photographing modern celebrations and distinctive portraits across Lagos, Abuja, and beyond.',
  status: 'Taking bookings for 2026 and 2027',
  whatsappMessage: 'Hello Kolawole Media, I found your portfolio on Veylo and would like to ask about booking a shoot.'
};

const categories = [
  { id: 'all', label: 'Selected work' },
  { id: 'weddings', label: 'Weddings & Owambe' },
  { id: 'portraits', label: 'Portraits' },
  { id: 'editorial', label: 'Fashion & Editorial' },
  { id: 'milestones', label: 'Celebrations' }
];

const portfolioWorks = [
  {
    id: 'work-wedding',
    category: 'weddings',
    title: 'Folake & Tunde',
    subtitle: 'Traditional and white wedding · Lekki, Lagos',
    formatTag: 'Chapters',
    photoName: 'demo-wedding-1',
    alt: 'Folake and Tunde celebrating their traditional wedding in Lagos',
    link: '/demo/chapters',
    linkLabel: 'Open their Chapters delivery'
  },
  {
    id: 'work-editorial',
    category: 'editorial',
    title: 'Ada / The Green Issue',
    subtitle: 'Fashion editorial · Victoria Island',
    formatTag: 'Editorial Page',
    photoName: 'demo-ada-1',
    alt: 'Ada wearing an emerald green velvet suit for a fashion editorial',
    link: '/demo/editorial',
    linkLabel: 'Explore the Editorial Page'
  },
  {
    id: 'work-portrait',
    category: 'portraits',
    title: 'Sharon / In Natural Light',
    subtitle: 'Portrait session · Ikeja',
    formatTag: 'Photo Reveal',
    photoName: 'demo-sharon-1',
    alt: 'Sharon photographed in soft natural light',
    link: '/demo/reveal',
    linkLabel: 'Begin Sharon’s Photo Reveal'
  },
  {
    id: 'work-story',
    category: 'milestones',
    title: 'Lora / Thirty',
    subtitle: 'Birthday portraits · Ikoyi, Lagos',
    formatTag: 'Photo Story',
    photoName: 'demo-lora-4',
    alt: 'Lora smiling in an emerald dress during her birthday shoot',
    link: '/demo?preset=lora',
    linkLabel: 'Watch Lora’s Photo Story'
  },
  {
    id: 'work-courage',
    category: 'milestones',
    title: 'Courage / The Next Chapter',
    subtitle: 'Graduation portraits · Lagos',
    formatTag: 'Canvas',
    photoName: 'demo-courage-1',
    alt: 'Courage celebrating her graduation in Lagos',
    link: '/demo/canvas',
    linkLabel: 'Explore Courage’s Canvas'
  },
  {
    id: 'work-family-album',
    category: 'portraits',
    title: 'The Adeyemi Family',
    subtitle: 'Family portraits · Lagos',
    formatTag: 'Album',
    photoName: 'demo-album-fa-4',
    alt: 'The Adeyemi family together in coordinated traditional clothing',
    link: '/demo/album',
    linkLabel: 'Turn through their Album'
  },
  {
    id: 'work-mens-studio',
    category: 'portraits',
    title: 'The Executive Study',
    subtitle: 'Studio portraits · Abuja',
    formatTag: 'Selected work',
    photoName: 'portrait-male',
    alt: 'Colour portrait of a man in a brown jacket against a sandstone studio wall',
    link: null,
    linkLabel: null
  }
];

const directionChoices = [
  { icon: Image, label: 'Opening image', value: 'Lead with the work you want to book again' },
  { icon: LayoutGrid, label: 'Categories', value: 'Keep weddings, portraits, and campaigns easy to find' },
  { icon: Type, label: 'Studio details', value: 'Make your name, location, and point of view clear' },
  { icon: Palette, label: 'Presentation', value: 'Let colour and spacing support the photographs' }
];

function CopyButton({ copied, onCopy, compact = false }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className={compact ? 'v-pstudio-copy' : 'v-portfolio-handle-copy'}
      aria-label="Copy studio portfolio address"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? 'Copied' : compact ? 'Share' : 'Copy address'}</span>
    </button>
  );
}

function ProjectContent({ work }) {
  return (
    <>
      <Photo name={work.photoName} alt={work.alt} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 45vw" />
      <div className="v-pstudio-project-shade" />
      <div className="v-pstudio-project-copy">
        <span>{work.formatTag}</span>
        <h3>{work.title}</h3>
        <p>{work.subtitle}</p>
        {work.link && <small>{work.linkLabel}<ArrowUpRight size={14} /></small>}
      </div>
    </>
  );
}

export default function PortfolioPage() {
  const reduced = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState('all');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(`https://${studioProfile.handle}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  };

  const visibleWorks = activeCategory === 'all'
    ? portfolioWorks
    : portfolioWorks.filter((work) => work.category === activeCategory);

  const whatsappUrl = `https://wa.me/2348000000000?text=${encodeURIComponent(studioProfile.whatsappMessage)}`;
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
          <div className="v-portfolio-handle">
            <Camera size={17} aria-hidden="true" />
            <strong>veylo.com.ng/@yourstudio</strong>
            <CopyButton copied={copied} onCopy={handleCopy} />
          </div>
        </div>
      </header>

      <section className="v-pstudio-section" id="portfolio-showcase">
        <div className="v-wrap">
          <motion.div
            className="v-pstudio-shell"
            initial={reduced ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.05 }}
            transition={reduced ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="v-pstudio-topline">
              <span>A sample Veylo Portfolio</span>
              <span>{studioProfile.handle}</span>
            </div>

            <div className="v-pstudio-header">
              <div className="v-pstudio-identity">
                <div className="v-pstudio-mark" aria-hidden="true">KM</div>
                <div>
                  <h2>{studioProfile.name}</h2>
                  <p>{studioProfile.tagline}</p>
                </div>
              </div>
              <div className="v-pstudio-contact">
                <span><MapPin size={14} />{studioProfile.location}</span>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageSquare size={15} />
                  Ask about a shoot
                </a>
                <CopyButton copied={copied} onCopy={handleCopy} compact />
              </div>
            </div>

            <div className="v-pstudio-intro">
              <p>{studioProfile.bio}</p>
              <span>{studioProfile.status}</span>
            </div>

            <div className="v-pstudio-tabs" role="tablist" aria-label="Portfolio category filter">
              {categories.map((category) => {
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={isActive ? 'is-active' : ''}
                    onClick={() => setActiveCategory(category.id)}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>

            <motion.div layout className={`v-pstudio-grid${visibleWorks.length < 3 ? ' is-compact' : ''}`}>
              <AnimatePresence mode="popLayout">
                {visibleWorks.map((work, index) => (
                  <motion.article
                    layout
                    key={work.id}
                    className={`v-pstudio-project is-${(index % 6) + 1}`}
                    initial={reduced ? false : { opacity: 0, y: 18, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {work.link ? (
                      <Link to={work.link} aria-label={`${work.title}. ${work.linkLabel}`}>
                        <ProjectContent work={work} />
                      </Link>
                    ) : (
                      <div>
                        <ProjectContent work={work} />
                      </div>
                    )}
                  </motion.article>
                ))}
              </AnimatePresence>
            </motion.div>

            <div className="v-pstudio-foot">
              <span>Selected commissions · 2024–2026</span>
              <span>Portfolio designed around the work with Veylo</span>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="v-section v-portfolio-direction">
        <div className="v-wrap v-portfolio-direction-grid">
          <Reveal className="v-portfolio-direction-copy">
            <Eyebrow number="01">What a potential client sees first</Eyebrow>
            <h2 className="v-heading">
              Show the work<br />
              <em>you want to be hired for.</em>
            </h2>
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
              ['II', 'Review the direction', 'Check the proposed colour, typography, image order, categories, and page arrangement. Change anything that does not feel like your studio.'],
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
            <p>Veylo Portfolio is included with Pro at ₦25,000 per month. See the pricing page for the complete plan comparison.</p>
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

