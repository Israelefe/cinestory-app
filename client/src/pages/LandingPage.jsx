import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Camera, Check, Download, Film, FolderClosed, Image as ImageIcon, Send } from 'lucide-react';
import { Page, Photo, Action, Eyebrow, Questions, TextLink } from '../components/PublicDesign.jsx';
import HomeDeliveryShowcase from '../components/HomeDeliveryShowcase.jsx';
import '../styles/homepage.css';

function Arrival({ children, className = '', delay = 0, ...props }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: reduced ? 0 : .55, delay: reduced ? 0 : delay, ease: [.22, 1, .36, 1] }} {...props}>{children}</motion.div>;
}

function HeroPreview() {
  return <div className="v-home-hero-preview">
    <div className="v-home-preview-bar"><span><Film size={15} />PHOTO STORY</span><span>LORA / BIRTHDAY PORTRAITS</span></div>
    <Link to="/demo?preset=lora" className="v-home-hero-photo" aria-label="Open Lora’s birthday Photo Story demo">
      <Photo name="demo-lora-1" alt="Lora smiling beside her birthday cake in an emerald dress" eager sizes="(max-width: 767px) 92vw, (max-width: 1023px) 80vw, 50vw" />
      <div className="v-home-photo-shade" />
      <div className="v-home-photo-caption"><span>LORA’S BIRTHDAY PORTRAITS</span><strong>This birthday<br /><em>looks good on you.</em></strong><span className="v-home-preview-open">Open her Photo Story<ArrowUpRight size={19} /></span></div>
    </Link>
    <div className="v-home-preview-bottom"><span><ImageIcon size={15} />Your photographs. Original quality.</span><span>01 — 06</span></div>
  </div>;
}

const steps = [
  ['01', ImageIcon, 'Upload the finished shoot.', 'Add the final edited photographs and a little context about the client and the shoot.'],
  ['02', Film, 'Make it yours.', 'Choose a delivery type. Review the presentation, adjust the order, and check the words.'],
  ['03', Send, 'Send one private link.', 'Share it on WhatsApp, Instagram, or email. Your client opens it in their browser.']
];

const shoots = [
  ['Portraits', 'audience-portrait', 'A woman wearing a yellow jacket in a studio portrait', '/for/portrait-photographers'],
  ['Traditional weddings', 'wedding', 'A couple smiling together in their traditional wedding outfits', '/for/wedding-studios'],
  ['Birthdays', 'audience-birthday', 'A smiling woman in blue during a birthday portrait session', '/for/birthday-shoots'],
  ['Campaigns & lookbooks', 'audience-commercial', 'A commercial studio portrait of a woman dressed in green', '/for/media-companies']
];

export default function LandingPage() {
  return <Page className="landing-page v-homepage">
    <section className="v-hero"><div className="v-wrap v-hero-grid">
      <Arrival className="v-hero-title-block"><Eyebrow>For photographers &amp; studios</Eyebrow><h1 className="v-hero-title">Don’t just<br />deliver photos.<br /><em>Showcase them.</em></h1></Arrival>
      <Arrival className="v-hero-art" delay={.08}><HeroPreview /></Arrival>
      <Arrival className="v-hero-after" delay={.12}>
        <p className="v-copy">Give your finished shoot a proper first viewing. Send one private link, with the full gallery and downloads ready for your client.</p>
        <div className="v-actions"><Action to="/signup">Start free</Action><Action to="/demo?preset=lora" secondary>Open a demo</Action></div>
        <div className="v-home-hero-note"><span><Check size={14} />3 free deliveries each month</span><span>No client account needed</span></div>
      </Arrival>
    </div></section>

    <section id="what-is-veylo" className="v-home-section v-home-handover"><div className="v-wrap v-home-section-grid">
      <Arrival className="v-home-section-title"><Eyebrow number="01">The first impression</Eyebrow><h2>A finished shoot.<br /><em>A better handover.</em></h2></Arrival>
      <Arrival className="v-home-section-art v-home-comparison">
        <div className="v-home-folder"><span className="v-home-small-label">THE FOLDER LINK</span><div><FolderClosed size={24} /><span><strong>ZAINAB_FINALS</strong><small>30 photographs · Google Drive</small></span><ArrowUpRight size={18} /></div></div>
        <div className="v-home-comparison-divider"><span /><ArrowRight size={17} /><span /></div>
        <div className="v-home-handover-preview"><Photo name="charm" alt="Zainab’s portrait in green against a warm terracotta backdrop" sizes="(max-width: 767px) 92vw, 50vw" /><div className="v-home-photo-shade" /><span className="v-home-handover-studio"><Camera size={15} />YOUR STUDIO</span><div><span>ZAINAB / PORTRAIT SESSION</span><strong>Your portraits<br />are ready.</strong><span>Open your photographs<ArrowRight size={17} /></span></div></div>
      </Arrival>
      <Arrival className="v-home-section-after"><p className="v-copy">You’ve put the work into every photograph. Give your client an opening that feels just as considered, followed by everything they came to see.</p><TextLink to="/client-experience">See what your client receives</TextLink></Arrival>
    </div></section>

    <section id="formats" className="v-home-section v-home-delivery-section"><div className="v-wrap">
      <Arrival className="v-home-section-heading"><Eyebrow number="02">Choose the opening</Eyebrow><h2>Two ways to<br /><em>send the shoot.</em></h2></Arrival>
      <Arrival><HomeDeliveryShowcase /></Arrival>
    </div></section>

    <section id="how-it-works" className="v-home-section v-home-workflow"><div className="v-wrap v-home-section-grid">
      <Arrival className="v-home-section-title"><Eyebrow number="03">Upload. Review. Share.</Eyebrow><h2>From your studio<br /><em>to their phone.</em></h2></Arrival>
      <Arrival className="v-home-section-art v-home-review-preview">
        <div className="v-home-review-bar"><span><Camera size={15} />YOUR STUDIO</span><span>DELIVERY PREVIEW</span></div>
        <div className="v-home-review-photos"><Photo name="demo-lora-1" alt="Opening birthday portrait selected for Lora’s delivery" sizes="(max-width: 767px) 57vw, 30vw" /><div><Photo name="demo-lora-4" alt="Lora smiling in a second birthday portrait" sizes="(max-width: 767px) 30vw, 17vw" /><Photo name="demo-lora-6" alt="Lora holding a gift in the closing birthday portrait" sizes="(max-width: 767px) 30vw, 17vw" /></div></div>
        <div className="v-home-review-check"><Check size={18} /><span><strong>Your review comes first.</strong><small>Check the photographs, the order, and the words.</small></span></div>
      </Arrival>
      <Arrival className="v-home-section-after"><div className="v-home-steps">{steps.map(([number, Icon, title, copy]) => <div key={number}><span>{number}</span><div><h3><Icon size={17} />{title}</h3><p>{copy}</p></div></div>)}</div><TextLink to="/signup">Create your first delivery</TextLink></Arrival>
    </div></section>

    <section className="v-home-section v-home-assurance"><div className="v-wrap v-home-section-grid">
      <Arrival className="v-home-section-title"><Eyebrow number="04">Every delivery includes</Eyebrow><h2>The full shoot.<br /><em>Still your work.</em></h2></Arrival>
      <Arrival className="v-home-section-art v-home-gallery-preview">
        <div className="v-home-gallery-top"><span>LORA’S COMPLETE GALLERY</span><Download size={18} /></div>
        <div className="v-home-gallery-grid">{[1, 2, 3, 4, 5, 6].map(number => <Photo key={number} name={'demo-lora-' + number} alt={'Original birthday portrait of Lora, photograph ' + number} sizes="(max-width: 767px) 28vw, 17vw" />)}</div>
        <div className="v-home-gallery-bottom"><span><ImageIcon size={15} />Original quality</span><span><Download size={15} />Downloads included</span></div>
      </Arrival>
      <Arrival className="v-home-section-after"><p className="v-copy">The presentation brings the shoot together. The gallery gives your client every finished photograph you’ve supplied.</p><div className="v-home-assurance-list">
        <div><ImageIcon size={20} /><span><strong>Your edits stay yours.</strong>Your retouching, crops, and colour grades stay as supplied.</span></div>
        <div><Download size={20} /><span><strong>Ready to keep.</strong>Clients can browse the complete gallery and download their files.</span></div>
        <div><Send size={20} /><span><strong>One link. No new account.</strong>Send it where you already speak to your client.</span></div>
      </div></Arrival>
    </div></section>

    <section className="v-home-section v-home-portfolio"><div className="v-wrap v-home-section-grid">
      <Arrival className="v-home-section-title"><Eyebrow number="05">Veylo Portfolio / Pro</Eyebrow><h2>Your best work.<br /><em>One address.</em></h2></Arrival>
      <Arrival className="v-home-section-art v-home-portfolio-preview">
        <div className="v-home-portfolio-bar"><span>YOUR STUDIO</span><span>WORK / ABOUT / CONTACT</span></div>
        <div className="v-home-portfolio-cover"><Photo name="portrait-bnw" alt="Fashion portrait featured on a photographer’s portfolio" sizes="(max-width: 767px) 92vw, 50vw" /><span>Portraits.<br /><em>By your studio.</em></span></div>
        <div className="v-home-portfolio-pair"><Photo name="portrait-male" alt="Men’s studio portrait on a photographer’s portfolio" sizes="(max-width: 767px) 43vw, 24vw" /><Photo name="portrait-soft" alt="Soft-light portrait on a photographer’s portfolio" sizes="(max-width: 767px) 43vw, 24vw" /></div>
      </Arrival>
      <Arrival className="v-home-section-after"><p className="v-copy">Add completed projects to your public portfolio without uploading them again. Choose the work people see, and keep one address ready for the next enquiry.</p><TextLink to="/portfolio">Explore Veylo Portfolio</TextLink></Arrival>
    </div></section>

    <section className="v-home-section v-home-shoots"><div className="v-wrap">
      <Arrival className="v-home-section-heading"><Eyebrow>Made for your kind of work</Eyebrow><h2>For the photographs<br /><em>they’ve been waiting for.</em></h2></Arrival>
      <div className="v-home-shoot-grid">{shoots.map(([title, photo, alt, to], index) => <Arrival key={to} delay={index * .04}><Link to={to} className="v-home-shoot-card"><div><Photo name={photo} alt={alt} sizes="(max-width: 767px) 43vw, 24vw" /></div><span>{title}<ArrowUpRight size={18} /></span></Link></Arrival>)}</div>
    </div></section>

    <section id="pricing" className="v-home-section v-home-pricing"><div className="v-wrap">
      <Arrival className="v-home-section-heading"><Eyebrow number="06">Start with a real shoot</Eyebrow><h2>Your first three deliveries.<br /><em>On us, every month.</em></h2><p className="v-copy">Both plans include GridBoard and all eight Showcase formats.</p></Arrival>
      <div className="v-home-pricing-grid">
        <Arrival className="v-home-price-card"><span className="v-home-small-label">VEYLO FREE</span><div className="v-home-price"><strong>₦0</strong><span>/ month</span></div><p>Try Veylo with finished client work.</p><ul><li><Check size={16} />3 deliveries each month</li><li><Check size={16} />Up to 100 photographs per delivery</li><li><Check size={16} />Full gallery and downloads</li><li><Check size={16} />Veylo branding</li></ul><Action to="/signup" secondary>Start free</Action></Arrival>
        <Arrival className="v-home-price-card v-home-price-pro" delay={.06}><span className="v-home-small-label">VEYLO PRO</span><div className="v-home-price"><strong>?25,000</strong><span>/ month</span></div><p>For regular delivery under your studio’s name.</p><ul><li><Check size={16} />Unlimited deliveries under fair use</li><li><Check size={16} />Up to 500 photographs per delivery</li><li><Check size={16} />Your studio branding and Portfolio</li><li><Check size={16} />50 GB personal image storage</li></ul><Action to="/pricing">Explore Pro</Action></Arrival>
      </div>
      <Arrival className="v-home-price-note"><p>Pro is billed monthly in naira. Unlimited deliveries are covered by the fair use policy.</p><TextLink to="/pricing">Compare plans and billing details</TextLink></Arrival>
    </div></section>

    <section id="faq" className="v-home-section v-home-faq"><div className="v-wrap"><Arrival className="v-home-section-heading"><Eyebrow>A few things to know</Eyebrow><h2>Before you<br /><em>send the link.</em></h2></Arrival><Arrival><Questions /></Arrival></div></section>
    <section className="v-home-section v-home-endnote"><div className="v-wrap"><Arrival><Eyebrow>Your next finished shoot</Eyebrow><h2>Give it a<br /><em>proper arrival.</em></h2><p className="v-copy">Start with three free deliveries each month. No payment card needed.</p><div className="v-actions"><Action to="/signup">Start free</Action><Action to="/demo?preset=lora" secondary>Open a demo</Action></div></Arrival></div></section>
  </Page>;
}
