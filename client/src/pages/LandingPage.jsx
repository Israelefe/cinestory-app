import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, Camera, Check, Clapperboard, Download, Eye,
  FolderClosed, Image as ImageIcon, Images, LayoutTemplate, Music2, Send,
  ShieldCheck, Type
} from 'lucide-react';
import { Page, Reveal, Photo, Action, Eyebrow, EndNote, Questions, TextLink } from '../components/PublicDesign.jsx';
import DeliveryFormatVisual from '../components/DeliveryFormatVisual.jsx';
import HeroFormatStage from '../components/HeroFormatStage.jsx';
import TypedHeading from '../components/TypedHeading.jsx';
import StudioReviewStage from '../components/StudioReviewStage.jsx';
import { DELIVERY_FORMATS, DELIVERY_PROCESS } from '../constants/deliveryFormats.js';

const direction = [
  [Images, 'Order and hierarchy', 'Chooses the opening, the strongest frames, image groupings, and the order that suits the selected format.'],
  [LayoutTemplate, 'Design direction', 'Builds the layout, spacing, typography, backgrounds, and colour treatment around the actual shoot.'],
  [Type, 'Words', 'Writes titles and captions from the photographer’s context and what is visible in the photographs.'],
  [Clapperboard, 'Movement and pace', 'Directs animation, transitions, timing, and emphasis without changing the finished photographs.'],
  [Music2, 'Sound', 'Plans music and optional narration when sound improves the client’s experience.'],
  [Eye, 'The final check', 'Hands every decision back to the photographer to edit, approve, or remove before publishing.']
];

const demoLinks = {
  'photo-story': ['/demo?preset=lora', 'Watch the live Photo Story'],
  'editorial-page': ['/demo/editorial', 'Explore the live Editorial Page'],
  'photo-reveal': ['/demo/reveal', 'Begin the live Photo Reveal'],
  canvas: ['/demo/canvas', 'Explore the live Canvas'],
  chapters: ['/demo/chapters', 'Open the live Chapters experience'],
  album: ['/demo/album', 'Turn through the live Album']
};

const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];

const audiences = [
  {
    number: '01',
    title: 'Portrait photographers',
    copy: 'Give every studio portrait a first look that feels as considered as the final retouch.',
    slug: 'portrait-photographers',
    photo: 'audience-portrait',
    alt: 'A close beauty portrait against a deep burgundy studio background',
    className: 'is-portrait'
  },
  {
    number: '02',
    title: 'Wedding studios',
    copy: 'Bring couple portraits, ceremony, family, and reception together without losing the shape of the day.',
    slug: 'wedding-studios',
    photo: 'portrait-luxury',
    alt: 'An elegant studio portrait in a flowing green gown',
    className: 'is-wedding'
  },
  {
    number: '03',
    title: 'Birthday shoots',
    copy: 'Let the outfits, personality, and celebration lead the way the birthday gallery opens.',
    slug: 'birthday-shoots',
    photo: 'audience-birthday',
    alt: 'A celebratory portrait of a smiling woman in blue',
    className: 'is-birthday'
  },
  {
    number: '04',
    title: 'Commercial & media teams',
    copy: 'Present campaigns, lookbooks, and brand work in a format built around the brief.',
    slug: 'media-companies',
    photo: 'audience-commercial',
    alt: 'A commercial portrait beside an illuminated campaign display table',
    className: 'is-commercial'
  }
];

function keepFormatAsBackDestination(event, formatId) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  window.history.replaceState(window.history.state, '', `/#${formatId}`);
}

function ScrollSection({ children, className = '', ...props }) {
  return <section className={'v-scroll-section ' + className} {...props}>{children}</section>;
}

function SectionOnePortrait() {
  const reduced = useReducedMotion();
  const frameRef = React.useRef(null);
  const visible = useInView(frameRef, { amount: .06, margin: '80px 0px' });
  const pauseMotion = reduced || !visible;
  return <motion.figure
    ref={frameRef}
    className={'v-charm-frame' + (pauseMotion ? '' : ' is-motion-active')}
    animate={pauseMotion ? {} : { y: ['0%', '-2.4%'], scale: [1.01, 1.035] }}
    transition={pauseMotion ? { duration: 0 } : { duration: 8, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
  >
    <Photo name="charm" className="v-charm-photo" alt="A close portrait of a woman against a warm terracotta backdrop" sizes="(max-width: 767px) 300px, 44vw" />
  </motion.figure>;
}

function AssurancePortrait() {
  const reduced = useReducedMotion();
  const frameRef = React.useRef(null);
  const visible = useInView(frameRef, { amount: .06, margin: '140px 0px' });
  const pauseMotion = reduced || !visible;
  return <motion.figure
    ref={frameRef}
    className={'v-assurance-cover' + (pauseMotion ? '' : ' is-motion-active')}
    animate={pauseMotion ? {} : { scale: [1.005, 1.035], x: ['0%', '-.6%'] }}
    transition={pauseMotion ? { duration: 0 } : { duration: 9, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
  >
    <Photo name="sam" alt="Sam standing in his finished studio portrait" />
  </motion.figure>;
}

export default function LandingPage() {
  const reduced = useReducedMotion();

  return <Page className="landing-page">
    <section className="v-hero"><div className="v-wrap v-hero-grid">
      <Reveal className="v-hero-text v-hero-title-block">
        <Eyebrow><span className="v-index">The AI Powered Photo Delivery Platform for Photographers</span></Eyebrow>
        <TypedHeading className="v-hero-title" lines={[{ text: 'Don’t just' }, { text: 'deliver photos.' }, { text: 'Showcase them.', accent: true }]} />
      </Reveal>

      <Reveal className="v-hero-art" delay={.12}>
        <HeroFormatStage reduced={reduced} />
      </Reveal>

      <Reveal className="v-hero-text v-hero-after" delay={.18}>
        <p className="v-copy">Every photoshoot deserves a delivery worth remembering. Veylo turns the finished shoot into a designed first viewing your client can enjoy before opening the full gallery. You choose how the experience begins, and Veylo shapes its direction around the photographs.</p>
        <div className="v-actions"><Action to="/signup">Get started</Action></div>
        <div className="v-hero-points"><span><Check size={13} />3 free deliveries each month</span><span><Check size={13} />Full gallery and downloads</span><span><Check size={13} />No app for your client</span></div>
      </Reveal>
    </div></section>

    <ScrollSection id="what-is-veylo" className="v-definition"><div className="v-wrap">
      <Reveal className="v-definition-head">
        <Eyebrow number="01">What Veylo is</Eyebrow>
        <div>
          <h2>Veylo turns the handover of finished photographs into a <em>designed first viewing.</em></h2>
          <p>Your edit is done. Veylo takes care of how it arrives, so the first thing your client opens feels as considered as the photographs inside it.</p>
        </div>
      </Reveal>

      <div className="v-handover-compare">
        <motion.article className="v-handover-card v-handover-before" initial={reduced ? false : { opacity: 0, x: -18, y: 30, rotate: -1.4 }} whileInView={{ opacity: .78, x: 0, y: 0, rotate: 0 }} viewport={{ once: false, amount: .18, margin: "-30px 0px" }} transition={reduced ? { duration: 0 } : { duration: .7, ease: [.22, 1, .36, 1] }}>
          <header><span>Usual handover</span><small>One more folder link</small></header>
          <div className="v-handover-chat">
            <div className="v-handover-sender"><span><Camera size={15} /></span><div><strong>Veylo Media</strong><small>4:18 PM</small></div></div>
            <p className="v-handover-message">Hi Zainab, your pictures are ready. Here is the link.</p>
            <div className="v-folder-link">
              <span className="v-folder-icon"><FolderClosed size={22} /></span>
              <div><strong>ZAINAB_FINALS</strong><small>30 photographs · Google Drive</small></div>
              <ArrowUpRight size={17} />
            </div>
          </div>
        </motion.article>

        <motion.div className="v-handover-shift" aria-hidden="true" initial={reduced ? false : { opacity: 0, scale: .86 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: false, amount: .25, margin: "-30px 0px" }} transition={reduced ? { duration: 0 } : { duration: .55, delay: .14, ease: [.22, 1, .36, 1] }}><span /><div><small>With Veylo</small><ArrowRight size={19} /></div><span /></motion.div>

        <motion.article className="v-handover-card v-handover-after" initial={reduced ? false : { opacity: 0, y: 56, scale: .96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: false, amount: .12, margin: "-30px 0px" }} transition={reduced ? { duration: 0 } : { type: 'spring', damping: 24, stiffness: 110, delay: .18 }}>
          <header><span>A Veylo handover</span><small>Made for this shoot</small></header>
          <div className="v-handover-chat">
            <div className="v-handover-sender"><span><Camera size={15} /></span><div><strong>Veylo Media</strong><small>4:18 PM</small></div></div>
            <p className="v-handover-message">Hi Zainab, your portraits are ready.</p>
            <div className="v-veylo-link">
              <SectionOnePortrait />
              <div className="v-veylo-link-shade" />
              <motion.div className="v-veylo-link-reveal" initial={reduced ? false : { scaleY: 1 }} whileInView={{ scaleY: 0 }} viewport={{ once: false, amount: .18, margin: "-30px 0px" }} transition={reduced ? { duration: 0 } : { duration: 1.05, delay: .38, ease: [.76, 0, .24, 1] }} />
              <div className="v-veylo-link-top"><span>Private delivery</span><strong>VEYLO MEDIA</strong></div>
              <motion.div className="v-veylo-link-copy" initial={reduced ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, amount: .18, margin: "-30px 0px" }} transition={reduced ? { duration: 0 } : { duration: .65, delay: .68, ease: [.22, 1, .36, 1] }}><span>Zainab · Portrait session</span><strong>Your portraits<br />are ready.</strong><p>Open your photographs <ArrowRight size={14} /></p></motion.div>
            </div>
          </div>
        </motion.article>
      </div>
    </div></ScrollSection>

    <ScrollSection id="formats" className="v-section v-formats-section"><div className="v-wrap">
      <Reveal className="v-section-head"><div><Eyebrow number="02">Six delivery formats</Eyebrow><h2 className="v-heading">The same photographs.<br /><em>Different ways to deliver them.</em></h2></div><p className="v-copy">Each format changes how the client first meets the shoot. The original photographs and complete downloadable gallery remain the same.</p></Reveal>
      <div className="v-format-ledger">{DELIVERY_FORMATS.map((format, i) => <article className={'v-format-row format-' + format.id} id={format.id} key={format.id}>
        <Reveal className="v-format-copy"><div className="v-format-tag"><span className="v-index">{format.roman || format.number}</span><span className="v-format-sep" aria-hidden="true">·</span><span className="v-format-verb">{format.verb}</span></div><h3>{format.name}</h3><p>{format.line}</p><TextLink to={demoLinks[format.id][0]} onClick={event => keepFormatAsBackDestination(event, format.id)}>{demoLinks[format.id][1]}</TextLink></Reveal>
        <Reveal className="v-format-art" delay={Math.min(i * .03, .12)}><DeliveryFormatVisual format={format} /></Reveal>
      </article>)}</div>
      <Reveal className="v-formats-explore">
        <div><span>All six formats</span><p>See what each one does and which shoots it suits.</p></div>
        <Action to="/formats" onClick={event => keepFormatAsBackDestination(event, 'album')}>Explore all formats</Action>
      </Reveal>
    </div></ScrollSection>

    <ScrollSection className="v-section v-assurance-band"><div className="v-wrap v-assurance-grid">
      <Reveal className="v-assurance-visual">
        <div className="v-assurance-browser">
          <div className="v-assurance-browser-bar"><span><ShieldCheck size={13} />Private delivery</span><strong>VEYLO MEDIA</strong></div>
          <AssurancePortrait />
          <div className="v-assurance-cover-copy"><span>The one with the chair</span><strong>Sam, this one had to go first.</strong></div>
        </div>
        <motion.div className="v-assurance-gallery" initial={reduced ? false : { opacity: 0, y: 38, rotate: 1.5 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }} viewport={{ once: false, amount: .25, margin: "-30px 0px" }} transition={reduced ? { duration: 0 } : { type: 'spring', damping: 24, stiffness: 120, delay: .16 }}>
          <div className="v-assurance-gallery-head"><div><span>Sam’s complete gallery</span><strong>18 photographs</strong></div><span className="v-assurance-download"><Download size={16} /></span></div>
          <div className="v-assurance-gallery-summary"><span className="v-assurance-file-stack" aria-hidden="true"><i /><i /><i /></span><div><strong>All 18 files are ready</strong><span>Original quality · JPG</span></div><span className="v-assurance-gallery-open">View all <ArrowUpRight size={14} /></span></div>
        </motion.div>
        <span className="v-assurance-status"><i />Ready to send</span>
      </Reveal>
      <Reveal className="v-assurance-copy"><Eyebrow number="03">Every delivery includes</Eyebrow><h2 className="v-heading">The format changes.<br /><em>Your photographs don’t.</em></h2><p className="v-copy">Veylo directs the way your client first sees the shoot, then leads them to the complete gallery. The final photographs you upload remain untouched.</p><div className="v-assurance-list">
        <div><ImageIcon size={20} /><span><strong>Your finished photographs</strong>Every edit, crop, and colour grade stays exactly as supplied.</span></div>
        <div><Send size={20} /><span><strong>One private link</strong>Send it through WhatsApp, Instagram DM, or email. Your client opens it without creating an account.</span></div>
        <div><Download size={20} /><span><strong>The complete gallery</strong>Your client can browse and download every file you provide.</span></div>
        <div><ShieldCheck size={20} /><span><strong>Your studio identity</strong>Pro deliveries can carry your photographer or studio branding.</span></div>
      </div><TextLink to="/client-experience">See what your client receives</TextLink></Reveal>
    </div></ScrollSection>

    <ScrollSection id="how-it-works" className="v-section v-workflow"><div className="v-wrap v-workflow-grid">
      <Reveal className="v-workflow-photo"><Photo name="smile" className="v-workflow-smile" alt="A smiling photographer in a blue suit ready to send a finished client delivery" /><div className="v-workflow-note"><ImageIcon size={25} /><p>One finished upload.<span>Six possible experiences.</span></p></div></Reveal>
      <Reveal><Eyebrow number="04">From your studio to their phone</Eyebrow><h2 className="v-heading">You provide the truth.<br /><em>Veylo directs the presentation.</em></h2><div className="v-steps">{DELIVERY_PROCESS.map(([title, copy], i) => <div className="v-step" key={title}><span className="v-index">{romanNumerals[i]}</span><div><h3>{title}</h3><p>{copy}</p></div></div>)}</div></Reveal>
    </div></ScrollSection>

    <ScrollSection className="v-section v-director"><div className="v-wrap">
      <Reveal className="v-director-head"><div><Eyebrow number="05"><Clapperboard size={15} />The AI Creative Director</Eyebrow><h2 className="v-heading">The shoot gives<br /><em>the design its direction.</em></h2></div><p className="v-copy">Veylo reads the photographer’s context, studies every photograph, and understands the collection as a whole. It then plans the selected experience. The photographer remains the final editor.</p></Reveal>
      <div className="v-director-grid v-director-grid-six">{direction.map(([Icon, title, copy], i) => <Reveal key={title} delay={(i % 3) * .05} className="v-director-card"><span className="v-index">{romanNumerals[i]}</span><Icon size={23} /><h3>{title}</h3><p>{copy}</p></Reveal>)}</div>
      <Reveal className="v-director-showcase">
        <div className="v-director-showcase-copy">
          <p className="v-director-showcase-eyebrow">Before your client sees it</p>
          <h3 className="v-director-showcase-title">Check the order.<br />Read every line.<br /><em>Approve the delivery.</em></h3>
          <p className="v-director-showcase-sub">Veylo proposes. The photographer publishes.</p>
          <div className="v-director-showcase-points">
            <div><Check size={15} /><span>Original files and color grades stay untouched</span></div>
            <div><Check size={15} /><span>Edit, swap, or rewrite any caption before sharing</span></div>
          </div>
        </div>
        <div className="v-director-showcase-art">
          <StudioReviewStage />
        </div>
      </Reveal>
    </div></ScrollSection>

    <ScrollSection className="v-section v-portfolio-section"><div className="v-wrap v-portfolio-grid">
      <Reveal className="v-portfolio-copy v-portfolio-intro"><Eyebrow number="06">Veylo Portfolio / Pro</Eyebrow><h2 className="v-heading">Your deliveries already<br /><em>hold your best work.</em></h2><p className="v-copy">Add a completed project to your public portfolio without uploading it again. Choose what people see and keep one address ready for the next person who asks to see your work.</p></Reveal>
      <Reveal className="v-portfolio-art"><div className="v-portfolio-browser"><div className="v-portfolio-browser-top"><span>VEYLO MEDIA</span><span>WORK · ABOUT · CONTACT</span></div><motion.figure initial={reduced ? false : { scale: 1.04 }} whileInView={{ scale: 1 }} viewport={{ once: false, margin: "-30px 0px" }} transition={{ duration: reduced ? 0 : 1.1 }}><Photo name="portrait-bnw" alt="Editorial portrait featured on a photographer portfolio" /></motion.figure><div className="v-portfolio-pair"><Photo name="portrait-male" alt="Men’s studio portrait in a portfolio grid" /><Photo name="portrait-soft" alt="Soft-light portrait in a portfolio grid" /></div></div></Reveal>
      <Reveal className="v-portfolio-copy v-portfolio-cta" delay={.06}><div className="v-actions"><Action to="/portfolio">Explore Veylo Portfolio</Action></div><div className="v-portfolio-address"><span>veylo.com.ng/@veylomedia</span><small>Studio name · Lagos, Nigeria</small></div></Reveal>
    </div></ScrollSection>

    <ScrollSection className="v-section v-audience-section"><div className="v-wrap">
      <Reveal className="v-section-head v-audience-head"><div><Eyebrow>Built around real delivery work</Eyebrow><h2 className="v-heading">For the shoots your clients<br /><em>have been waiting to see.</em></h2></div><p className="v-copy">Choose the kind of work you deliver and see how Veylo can present it.</p></Reveal>
      <div className="v-audience-showcase">{audiences.map((audience, index) => <motion.article
        className={`v-audience-card ${audience.className}`}
        key={audience.slug}
        initial={reduced ? false : { opacity: 0, y: 34 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, amount: .13, margin: '-30px 0px' }}
        transition={reduced ? { duration: 0 } : { duration: .68, delay: Math.min(index * .06, .18), ease: [.22, 1, .36, 1] }}
      >
        <Link to={'/for/' + audience.slug} aria-label={`Explore Veylo for ${audience.title}`}>
          <div className="v-audience-card-photo"><Photo name={audience.photo} alt={audience.alt} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 58vw" /></div>
          <div className="v-audience-card-shade" />
          <div className="v-audience-card-top"><span>{audience.number}</span><small>FOR / {audience.title.toUpperCase()}</small></div>
          <div className="v-audience-card-copy"><h3>{audience.title}</h3><p>{audience.copy}</p><span className="v-audience-card-link">See what Veylo can do <ArrowUpRight size={17} /></span></div>
        </Link>
      </motion.article>)}</div>
    </div></ScrollSection>

    <ScrollSection id="pricing" className="v-section v-workflow"><div className="v-wrap">
      <Reveal className="v-section-head"><div><Eyebrow number="07">Plans in naira</Eyebrow><h2 className="v-heading">Start with three deliveries.<br /><em>Move to Pro when you need more.</em></h2></div><p className="v-copy">Both plans include all six delivery formats. The difference is delivery volume, storage, portfolio access, and whose branding your client sees.</p></Reveal>
      <div className="v-home-plan-preview">
        <Reveal className="v-home-plan-card">
          <div className="v-home-plan-card-top"><span>FREE</span><small>For trying Veylo with client work</small></div>
          <div className="v-home-plan-price"><strong>₦0</strong><span>/ month</span></div>
          <p>Three final photo deliveries each month, with Veylo branding on the experience.</p>
        </Reveal>
        <Reveal className="v-home-plan-card is-pro" delay={.08}>
          <div className="v-home-plan-card-top"><span>PRO</span><small>For regular studio delivery</small></div>
          <div className="v-home-plan-price"><strong>₦25,000</strong><span>/ month</span></div>
          <p>Unlimited deliveries under fair use, your studio branding, Veylo Portfolio, and 50 GB personal image storage.</p>
        </Reveal>
      </div>
      <Reveal className="v-home-plan-action"><TextLink to="/pricing">Compare Free and Pro</TextLink></Reveal>
    </div></ScrollSection>

    <ScrollSection id="faq" className="v-section"><div className="v-wrap v-spread items-start"><Reveal><Eyebrow>A few things to know</Eyebrow><h2 className="v-heading">Clear answers<br /><em>before you upload.</em></h2><TextLink to="/contact">Ask us a question</TextLink></Reveal><Reveal><Questions /></Reveal></div></ScrollSection>
    <EndNote />
  </Page>;
}

