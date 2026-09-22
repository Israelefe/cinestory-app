import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarRange,
  Check,
  Clapperboard,
  Download,
  Film,
  Grid2X2,
  Image,
  Layers3,
  MousePointer2,
  Palette,
  Type
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Action, Eyebrow, Page, Photo, Reveal } from '../components/PublicDesign.jsx';
import DeliveryFormatVisual from '../components/DeliveryFormatVisual.jsx';

const formats = [
  {
    id: 'photo-story',
    numeral: 'I',
    role: 'Watch',
    name: 'Photo Story',
    tagline: 'A finished shoot with a beginning, a rhythm, and a finale.',
    icon: Film,
    demo: '/demo?preset=lora',
    demoLabel: 'Experience Lora’s Photo Story',
    photos: ['demo-lora-4', 'demo-lora-6'],
    storyEyebrow: 'THIS SMILE',
    storyCaption: 'This is the smile we would send to anyone who asked how your birthday went.',
    photoAlt: 'Lora smiling in her emerald birthday dress',
    clientAction: 'Your client watches a paced sequence before opening the complete gallery. They can pause whenever they want.',
    direction: 'Veylo proposes the opening, image order, sections, captions, typography, transitions, movement, music, and finale from the photographs and the context you provide.',
    bestFor: 'Weddings, birthdays, maternity, graduation, anniversaries, proposals, and shoots with an emotional story.'
  },
  {
    id: 'editorial-page',
    numeral: 'II',
    role: 'Scroll',
    name: 'Editorial Page',
    tagline: 'A scrollable publication shaped by the visual language of the shoot.',
    icon: Clapperboard,
    demo: '/demo/editorial',
    demoLabel: 'Explore Ada’s Fashion Editorial',
    photos: ['demo-ada-2', 'demo-ada-4'],
    editorialMast: 'THE GREEN ISSUE',
    editorialIssue: '01',
    editorialTag: 'FASHION STUDY',
    editorialTitle: <>Green.<br />Tailored.<br /><em>Direct.</em></>,
    photoAlt: 'Ada posing in an emerald suit against a wine-coloured set',
    detailAlt: 'Ada standing in an emerald suit during a fashion editorial',
    clientAction: 'Your client scrolls through the shoot like a magazine feature, moving between large portraits, details, pairings, and quiet space.',
    direction: 'Veylo proposes the page structure, image hierarchy, type, colour, spacing, transitions, and movement from the character of the photographs.',
    bestFor: 'Fashion, beauty, portraits, personal branding, campaigns, lookbooks, and carefully styled studio sessions.'
  },
  {
    id: 'photo-reveal',
    numeral: 'III',
    role: 'Tap',
    name: 'Photo Reveal',
    tagline: 'A first viewing that moves only when your client is ready.',
    icon: MousePointer2,
    demo: '/demo/reveal',
    demoLabel: 'Begin Sharon’s Photo Reveal',
    photos: ['demo-sharon-2', 'demo-sharon-4'],
    revealCount: '02 / 04',
    photoAlt: 'Sharon’s confident profile portrait appearing during Photo Reveal',
    clientAction: 'Your client reveals one finished photograph at a time. They decide when the next image appears, so every frame gets a proper first look.',
    direction: 'Veylo proposes the reveal order, solo frames, image pairings, emphasis, transitions, soundtrack, and final photograph.',
    bestFor: 'Studio portraits, beauty sessions, executive portraits, maternity, graduation, and personal transformation shoots.'
  },
  {
    id: 'canvas',
    numeral: 'IV',
    role: 'Move',
    name: 'Canvas',
    tagline: 'A visual space where related photographs can live together.',
    icon: Grid2X2,
    demo: '/demo/canvas',
    demoLabel: 'Explore Courage’s Graduation Canvas',
    photos: ['demo-courage-2', 'demo-courage-4', 'demo-courage-6'],
    canvasCoordinate: 'COURAGE / GRADUATION',
    clientAction: 'Your client moves through the collection freely, following visual clusters instead of a fixed first-to-last order.',
    direction: 'Veylo proposes the focal images, clusters, scale, spacing, background treatment, visual relationships, captions, and movement.',
    bestFor: 'Graduation, fashion, weddings, family portraits, branding, documentary work, and shoots with several looks or settings.'
  },
  {
    id: 'chapters',
    numeral: 'V',
    role: 'Choose',
    name: 'Chapters',
    tagline: 'A large collection organised around the moments already inside it.',
    icon: Layers3,
    demo: '/demo/chapters',
    demoLabel: 'Open Folake & Tunde’s Chapters',
    photos: ['demo-wedding-4', 'demo-wedding-2', 'demo-wedding-5'],
    chapterNames: ['Arrivals & Greetings', 'Side by Side', 'The Celebration'],
    chapterLines: ['The joy as family and friends gathered.', 'The smiles you kept finding between frames.', 'Dancing into the evening with everyone who came to celebrate.'],
    clientAction: 'Your client chooses the part of the shoot they want to enter, then moves between moments without searching through one enormous gallery.',
    direction: 'Veylo identifies the natural chapters, proposes their names and covers, arranges the photographs inside them, and gives each part its own entrance.',
    bestFor: 'Traditional weddings, white weddings, events, multi-outfit sessions, branding shoots, conferences, and other large collections.'
  },
  {
    id: 'album',
    numeral: 'VI',
    role: 'Turn',
    name: 'Album',
    tagline: 'A page-by-page keepsake composed from the finished shoot.',
    icon: BookOpen,
    demo: '/demo/album',
    demoLabel: 'Turn through the Adeyemi Family Album',
    photos: ['demo-album-fa-2', 'demo-album-fa-3', 'demo-album-fa-5'],
    albumLabel: 'THE ADEYEMI FAMILY',
    clientAction: 'Your client opens a cover and turns through a set order of designed pages. Each photograph gets space to be seen before the complete gallery opens.',
    direction: 'Veylo proposes the cover, page order, image pairings, full-page portraits, spacing, typography, short captions, page transitions, and closing spread.',
    bestFor: 'Traditional weddings, white weddings, anniversaries, maternity, family sessions, and milestone celebrations.'
  },
  {
    id: 'event-coverage',
    numeral: 'VII',
    role: 'Browse',
    name: 'Event Coverage',
    tagline: 'A complete event organised by scenes, people, and shifts in the day.',
    icon: CalendarRange,
    demo: '/demo/event-coverage',
    demoLabel: 'Browse the Event Coverage demo',
    photos: [
      '/veylo/demo/event/event-01-arrivals.webp',
      '/veylo/demo/event/event-02-keynote.webp',
      '/veylo/demo/event/event-03-networking.webp',
      '/veylo/demo/event/event-04-stage.webp',
      '/veylo/demo/event/event-05-details.webp'
    ],
    photoAlt: 'A Nigerian conference moving from arrivals to the main programme',
    eventLabel: 'THE ROOM, IN FULL',
    eventDate: '05 SCENES',
    eventScenes: ['Arrivals', 'Main programme', 'Between sessions', 'On stage', 'Details'],
    clientAction: 'Guests and organisers begin with highlights, then browse the event by scene or open the complete gallery.',
    direction: 'Veylo identifies event scenes, selects the highlights, groups related photographs, and keeps navigation clear even when no single person is the subject.',
    bestFor: 'Conferences, church services, corporate events, concerts, owambe celebrations, and community gatherings.'
  },
  {
    id: 'campaign',
    numeral: 'VIII',
    role: 'Use',
    name: 'Campaign Delivery',
    tagline: 'A commercial presentation followed by an organised asset handoff.',
    icon: BriefcaseBusiness,
    demo: '/demo/campaign',
    demoLabel: 'Open the Campaign Delivery demo',
    photos: [
      '/veylo/demo/campaign/campaign-01-hero.webp',
      '/veylo/demo/campaign/campaign-02-detail.webp',
      '/veylo/demo/campaign/campaign-03-lifestyle.webp',
      '/veylo/demo/campaign/campaign-04-kit.webp',
      '/veylo/demo/campaign/campaign-05-context.webp'
    ],
    photoAlt: 'A complete leather goods campaign with hero, detail, lifestyle, and handoff images',
    campaignLabel: 'COMMERCIAL HANDOFF',
    campaignCode: 'A / 05',
    campaignSets: ['Hero', 'Detail', 'Lifestyle', 'Kit', 'Context'],
    clientAction: 'The client reviews the approved work, opens named asset sets, reads the photographer’s usage terms, and downloads the final files.',
    direction: 'Veylo proposes the campaign hierarchy, asset sets, typography, colour, lead images, and handoff structure while the photographer controls usage terms.',
    bestFor: 'Lookbooks, product campaigns, hospitality, food, property, personal branding, and corporate image libraries.'
  }
];

const directorChoices = [
  { icon: Image, label: 'Image order and hierarchy' },
  { icon: Palette, label: 'Colours and backgrounds' },
  { icon: Type, label: 'Typography and captions' },
  { icon: Clapperboard, label: 'Motion, transitions, and pacing' }
];

export default function DeliveryFormats() {
  const reduced = useReducedMotion();
  const location = useLocation();
  const [activeFormat, setActiveFormat] = useState('photo-story');

  useEffect(() => {
    const hashId = location.hash.slice(1);
    if (!hashId) return undefined;

    let frame;
    let attempts = 0;
    const findAndScroll = () => {
      const target = document.getElementById(hashId) || document.getElementById(hashId.replace(/^format-/, ''));
      if (target) {
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
        return;
      }
      attempts += 1;
      if (attempts < 90) frame = window.requestAnimationFrame(findAndScroll);
    };
    findAndScroll();
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const targets = formats.map((format) => document.getElementById(format.id)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (!visible.length) return;
      visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      setActiveFormat(visible[0].target.id);
    }, { rootMargin: '-18% 0px -52% 0px', threshold: [0.12, 0.35, 0.6] });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const jumpToFormat = (event, id) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    window.history.replaceState(window.history.state, '', `/formats#${id}`);
    setActiveFormat(id);
  };

  return (
    <Page className="v-formats-page-v2">
      <header className="v-wrap v-fguide-hero">
        <motion.div
          className="v-fguide-hero-copy"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
          <Eyebrow>A guide to choosing the right format</Eyebrow>
          <h1 className="v-title">
            The shoot is finished.<br />
            <em>How should your client meet it?</em>
          </h1>
          <p className="v-lead">
            Some collections need a beginning and an ending. Some are better explored. Some should be revealed one photograph at a time. The format changes the first viewing, while your finished photographs remain untouched.
          </p>
        </motion.div>

        <motion.div
          className="v-fguide-brief"
          initial={reduced ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.85, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="v-fguide-brief-top"><span>CLIENT DELIVERY BRIEF</span><strong>FOLAKE &amp; TUNDE · 148 PHOTOGRAPHS</strong></div>
          <figure className="v-fguide-brief-main"><Photo name="formats-hero-main" alt="Folake and Tunde smiling together in burgundy traditional wedding attire" eager sizes="(max-width: 767px) 78vw, 37vw" /></figure>
          <figure className="v-fguide-brief-detail is-one"><Photo name="formats-hero-detail-one" alt="Folake and Tunde seated together during their traditional wedding portrait session" eager sizes="(max-width: 767px) 34vw, 15vw" /></figure>
          <figure className="v-fguide-brief-detail is-two"><Photo name="formats-hero-detail-two" alt="Folake resting against Tunde during their traditional wedding portrait session" eager sizes="(max-width: 767px) 32vw, 14vw" /></figure>
          <div className="v-fguide-brief-question">
            <span>THE DECISION</span>
            <strong>Should they watch the day unfold or choose the moment they want to revisit?</strong>
            <small>The right answer depends on the shoot.</small>
          </div>
        </motion.div>
      </header>

      <section className="v-fguide-role-section">
        <div className="v-wrap">
          <Reveal className="v-fguide-role-head">
            <Eyebrow number="01">The clearest difference</Eyebrow>
            <h2>The format changes what your client does first.</h2>
          </Reveal>
          <nav className="v-fguide-role-track" aria-label="Jump to a delivery format">
            {formats.map((format) => {
              const Icon = format.icon;
              return (
                <a
                  key={format.id}
                  href={`#${format.id}`}
                  className={activeFormat === format.id ? 'is-active' : ''}
                  aria-current={activeFormat === format.id ? 'true' : undefined}
                  onClick={(event) => jumpToFormat(event, format.id)}
                >
                  <span>{format.numeral}</span>
                  <Icon size={18} aria-hidden="true" />
                  <strong>{format.role}</strong>
                  <small>{format.name}</small>
                  <ArrowDown size={14} aria-hidden="true" />
                </a>
              );
            })}
          </nav>
        </div>
      </section>

      <section className="v-section v-fguide-director">
        <div className="v-wrap v-fguide-director-grid">
          <Reveal className="v-fguide-director-copy">
            <Eyebrow number="02">The AI Creative Director</Eyebrow>
            <h2 className="v-heading">The format sets the experience.<br /><em>The shoot sets the direction.</em></h2>
            <p className="v-copy">
              Choosing Photo Story does not make every Photo Story look alike. You explain what the shoot is about and upload the finished photographs. Veylo studies the complete collection and proposes the creative direction inside the chosen format.
            </p>
            <p className="v-fguide-director-note">You check the result, change anything you want, and decide when it is ready to share.</p>
          </Reveal>

          <Reveal className="v-fguide-director-stage" delay={0.08}>
            <div className="v-fguide-director-image">
              <Photo name="formats-director-corporate" alt="A corporate portrait being prepared for an Editorial Page" sizes="(max-width: 767px) 82vw, 35vw" />
              <div><span>SELECTED FORMAT</span><strong>Editorial Page</strong></div>
            </div>
            <div className="v-fguide-director-panel">
              <header><Clapperboard size={17} /><span>DIRECTION PROPOSED FOR THIS SHOOT</span></header>
              {directorChoices.map(({ icon: Icon, label }, index) => (
                <div key={label}><span>0{index + 1}</span><Icon size={16} /><strong>{label}</strong><Check size={15} /></div>
              ))}
              <footer>Ready for the photographer’s review</footer>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="v-fguide-standard">
        <div className="v-wrap">
          <div><Image size={19} /><strong>Your finished edits stay untouched</strong></div>
          <div><Download size={19} /><strong>The complete gallery and downloads follow</strong></div>
          <div><Check size={19} /><strong>You review everything before sharing</strong></div>
        </div>
      </section>

      <div className="v-fguide-formats" id="formats-showcase">
        {formats.map((format, index) => {
          const Icon = format.icon;
          return (
            <article className={`v-fguide-format v-fguide-format-${format.id}`} id={format.id} key={format.id}>
              <div className="v-wrap v-fguide-format-grid">
                <motion.header
                  className="v-fguide-format-head"
                  initial={reduced ? false : { opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.16 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.68, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div><span>{format.numeral}</span><Icon size={18} /><small>Your client will {format.role.toLowerCase()}</small></div>
                  <h2>{format.name}</h2>
                  <p>{format.tagline}</p>
                </motion.header>

                <motion.div
                  className="v-fguide-format-art"
                  initial={reduced ? false : { opacity: 0, scale: 0.975, y: 24 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.12 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.78, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <DeliveryFormatVisual format={format} />
                </motion.div>

                <motion.div
                  className="v-fguide-format-copy"
                  initial={reduced ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.14 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.68, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div><span>What your client does</span><p>{format.clientAction}</p></div>
                  <div><span>What Veylo directs</span><p>{format.direction}</p></div>
                  <div><span>Best for</span><p>{format.bestFor}</p></div>
                  <Link
                    to={`${format.demo}${format.demo.includes('?') ? '&' : '?'}from=formats`}
                    state={{ from: 'formats', sectionId: format.id, returnTo: `/formats#${format.id}` }}
                    onClick={() => window.history.replaceState(window.history.state, '', `/formats#${format.id}`)}
                    className="v-fguide-demo-link"
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{format.demoLabel}</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </motion.div>
              </div>
              <span className="v-fguide-format-count" aria-hidden="true">0{index + 1}</span>
            </article>
          );
        })}
      </div>

      <section className="v-wrap v-fguide-closing">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={reduced ? { duration: 0 } : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
          <Eyebrow>Eight formats · One complete gallery</Eyebrow>
          <h2>Choose how the photographs arrive.<br /><em>Let the shoot shape everything else.</em></h2>
          <p>Start with the finished photographs and the story behind them. Review Veylo’s proposed direction before your client sees a thing.</p>
          <div className="v-actions">
            <Action to="/signup">Create your account</Action>
            <Action to="/pricing" secondary>View plans and pricing</Action>
          </div>
        </motion.div>
      </section>
    </Page>
  );
}

