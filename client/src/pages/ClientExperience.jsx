import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Check, Download, FolderOpen, Image as ImageIcon,
  LockKeyhole, MessageCircle, MousePointer2, Send, Smartphone
} from 'lucide-react';
import { EndNote, Eyebrow, Page, Photo, Reveal } from '../components/PublicDesign.jsx';
import { DELIVERY_FORMATS } from '../constants/deliveryFormats.js';

const moments = [
  {
    label: 'The message',
    title: 'The message they have been waiting for finally lands.',
    copy: 'Send it on WhatsApp, Instagram, or email. It comes from you, inside the conversation you already have with them.',
    note: 'Hi Zainab, your portraits are ready. Take your time with them — there are so many good ones in here.',
    icon: MessageCircle
  },
  {
    label: 'The first tap',
    title: 'One tap, and it already feels like her shoot.',
    copy: 'There is no sign-up form and no app to install. Zainab sees your studio name, her name, and the opening you approved.',
    note: 'Zainab, your portraits are ready.',
    icon: Smartphone
  },
  {
    label: 'The first viewing',
    title: 'The first few photographs get her full attention.',
    copy: 'She gets to enjoy the photographs before seeing them as thumbnails. The pace and movement follow the format you chose.',
    note: 'Zainab, this was the moment you stopped posing and started having fun with the camera.',
    icon: MousePointer2
  },
  {
    label: 'The complete gallery',
    title: 'Then she can take her time with every finished photograph.',
    copy: 'The complete gallery is right there when the first viewing ends. She can browse again and download the files you delivered.',
    note: 'All 24 portraits are here whenever you want to come back to them.',
    icon: Download
  }
];

const assurances = [
  [Send, 'One link', 'Drop it into your WhatsApp chat and you are done.'],
  [Smartphone, 'Made for their phone', 'It opens cleanly on the screen most clients will use.'],
  [LockKeyhole, 'Nothing to set up', 'Your client does not need a Veylo account or another app.'],
  [FolderOpen, 'Everything is there', 'The full gallery and download files follow the first viewing.']
];

const clientActions = ['Watch', 'Scroll', 'Tap', 'Move', 'Choose', 'Turn'];

function PhoneStatus() {
  return <div className="v-ce-phone-status"><span>9:41</span><span><i /><i /><i /></span></div>;
}

function MessageScreen({ onNext }) {
  return <div className="v-ce-screen v-ce-message-screen">
    <PhoneStatus />
    <header><span><MessageCircle size={15} /></span><div><strong>Veylo Media</strong><small>Photography studio</small></div></header>
    <div className="v-ce-chat-date">TODAY</div>
    <div className="v-ce-chat-bubble"><p>Hi Zainab, your portraits are ready. Take your time with them — there are so many good ones in here.</p><small>9:41</small></div>
    <button type="button" onClick={onNext}><span>veylo.com.ng/zainab</span><strong>Open your portraits</strong><ArrowRight size={15} /></button>
    <div className="v-ce-chat-input">Message</div>
  </div>;
}

function ArrivalScreen({ onNext }) {
  return <div className="v-ce-screen v-ce-arrival-screen">
    <Photo name="look-1" alt="Zainab holding a mirrorless camera at her waist" eager />
    <div className="v-ce-screen-shade" />
    <PhoneStatus />
    <header><span>VEYLO MEDIA</span><small>PRIVATE DELIVERY</small></header>
    <div className="v-ce-arrival-copy"><small>STUDIO PORTRAIT SESSION</small><strong>Zainab,<br />your portraits<br />are ready.</strong><button type="button" onClick={onNext}>Begin your first look <ArrowRight size={15} /></button></div>
  </div>;
}

function ViewingScreen({ onNext }) {
  return <div className="v-ce-screen v-ce-viewing-screen">
    <Photo name="look-2" alt="Zainab smiling with a mirrorless camera during her portrait session" eager />
    <div className="v-ce-screen-shade" />
    <PhoneStatus />
    <div className="v-ce-view-progress"><i /><i /><i /><i /></div>
    <span className="v-ce-frame-count">02 / 04</span>
    <div className="v-ce-view-copy"><small>WHEN THE CAMERA CAME UP</small><strong>Zainab, this was the moment you stopped posing and started having fun.</strong><button type="button" onClick={onNext}>See all your portraits <ArrowRight size={15} /></button></div>
  </div>;
}

function GalleryScreen() {
  return <div className="v-ce-screen v-ce-gallery-screen">
    <PhoneStatus />
    <header><div><small>VEYLO MEDIA</small><strong>Zainab</strong></div><span>24 photographs</span></header>
    <div className="v-ce-gallery-grid">
      {['look-1', 'look-2', 'look-3', 'look-4'].map((name, index) => <Photo key={name} name={name} alt={`Finished portrait ${index + 1} from Zainab’s session`} eager />)}
    </div>
    <div className="v-ce-gallery-bar"><div><ImageIcon size={14} /><span>Full gallery</span></div><span><Download size={14} /> Download photographs</span></div>
  </div>;
}

function ClientPhone({ active, setActive, reduced }) {
  const screens = [
    <MessageScreen onNext={() => setActive(1)} />,
    <ArrivalScreen onNext={() => setActive(2)} />,
    <ViewingScreen onNext={() => setActive(3)} />,
    <GalleryScreen />
  ];

  return <div className="v-ce-phone-shell" aria-live="polite">
    <div className="v-ce-phone-speaker" />
    <div className="v-ce-phone-viewport" id="client-phone-screen">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          className="v-ce-phone-panel"
          initial={reduced ? false : { opacity: 0, x: 22, scale: .985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={reduced ? undefined : { opacity: 0, x: -18, scale: .99 }}
          transition={{ duration: reduced ? 0 : .42, ease: [.22, 1, .36, 1] }}
        >{screens[active]}</motion.div>
      </AnimatePresence>
    </div>
  </div>;
}

export default function ClientExperience() {
  const [activeMoment, setActiveMoment] = useState(0);
  const reduced = useReducedMotion();

  return <Page className="v-client-page-v2">
    <header className="v-wrap v-ce-hero">
      <Reveal className="v-ce-hero-title">
        <Eyebrow>What your client receives</Eyebrow>
        <h1 className="v-title">The message they have been waiting for.<br /><em>“Your photographs are ready.”</em></h1>
      </Reveal>

      <Reveal className="v-ce-hero-art" delay={.1}>
        <motion.div className="v-ce-hero-photo" initial={reduced ? false : { scale: 1.045 }} whileInView={{ scale: 1 }} viewport={{ once: false, amount: .25 }} transition={{ duration: reduced ? 0 : 1.15, ease: [.22, 1, .36, 1] }}><Photo name="look-3" alt="Zainab smiling as she checks the rear screen of her camera" eager /></motion.div>
        <motion.div className="v-ce-message-card" animate={reduced ? undefined : { y: [0, -7, 0] }} transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}>
          <span><MessageCircle size={17} /></span><div><small>VEYLO MEDIA · NOW</small><p>Hi Zainab, your portraits are ready.</p></div>
        </motion.div>
        <motion.div className="v-ce-link-card" animate={reduced ? undefined : { y: [0, 6, 0] }} transition={{ duration: 7.2, repeat: Infinity, ease: 'easeInOut', delay: .35 }}><small>PRIVATE DELIVERY</small><strong>Open your portraits</strong><span>veylo.com.ng/zainab <ArrowRight size={14} /></span></motion.div>
      </Reveal>

      <Reveal className="v-ce-hero-after" delay={.16}>
        <p className="v-lead">You have finished the shoot and approved the delivery. Send one private link. Your client opens it on their phone, enjoys the first viewing, then browses and downloads the full gallery.</p>
      </Reveal>
    </header>

    <section className="v-ce-assurances" aria-label="What every client receives"><div className="v-wrap">
      {assurances.map(([Icon, title, copy], index) => <Reveal key={title} delay={index * .04}><Icon size={19} /><div><strong>{title}</strong><p>{copy}</p></div></Reveal>)}
    </div></section>

    <section className="v-section v-ce-journey" id="client-journey"><div className="v-wrap">
      <Reveal className="v-ce-journey-head"><Eyebrow number="01">From message to download</Eyebrow><h2 className="v-heading">One link.<br /><em>The whole shoot, properly delivered.</em></h2><p className="v-copy">Tap any step below to see exactly what opens on your client’s phone.</p></Reveal>

      <div className="v-ce-journey-grid">
        <div className="v-ce-phone-column">
          <div className="v-ce-moment-tabs" role="tablist" aria-label="Client journey moments">
            {moments.map((moment, index) => <button key={moment.label} type="button" role="tab" aria-selected={activeMoment === index} aria-controls="client-phone-screen" className={activeMoment === index ? 'is-active' : ''} onClick={() => setActiveMoment(index)}><span>{String(index + 1).padStart(2, '0')}</span><small>{moment.label}</small></button>)}
          </div>
          <ClientPhone active={activeMoment} setActive={setActiveMoment} reduced={reduced} />
        </div>

        <div className="v-ce-moment-list">
          {moments.map((moment, index) => <Reveal key={moment.label} className={`v-ce-moment ${activeMoment === index ? 'is-active' : ''}`} viewport={{ once: false, amount: .55 }} onViewportEnter={() => setActiveMoment(index)}>
            <button type="button" onClick={() => setActiveMoment(index)} aria-label={`Show ${moment.label} on the phone`}><span>{String(index + 1).padStart(2, '0')}</span><moment.icon size={20} /></button>
            <div><small>{moment.label}</small><h3>{moment.title}</h3><p>{moment.copy}</p><blockquote>“{moment.note}”</blockquote></div>
          </Reveal>)}
        </div>
      </div>
    </div></section>

    <section className="v-section v-ce-actions-section"><div className="v-wrap">
      <Reveal className="v-ce-actions-head"><Eyebrow number="02">Six ways to open a shoot</Eyebrow><h2 className="v-heading">Watch. Scroll. Tap.<br /><em>Move. Choose. Turn.</em></h2><p className="v-copy">Choose what suits the photographs. Whichever format you send, your client still reaches the full gallery at the end.</p></Reveal>
      <Reveal className="v-ce-format-line">
        {DELIVERY_FORMATS.map((format, index) => <Link key={format.id} to={`/formats#${format.id}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{clientActions[index]}</strong><small>{format.name}</small><ArrowRight size={15} /></Link>)}
      </Reveal>
    </div></section>

    <section className="v-section v-ce-control"><div className="v-wrap v-ce-control-grid">
      <Reveal className="v-ce-control-copy"><Eyebrow number="03">Before you send</Eyebrow><h2 className="v-heading">Nothing reaches your client<br /><em>until you say it is ready.</em></h2><p className="v-copy">Read the captions. Check the order. Swap anything that feels wrong. When it looks like your work and sounds like you, publish the link.</p></Reveal>
      <Reveal className="v-ce-control-card" delay={.08}>
        <header><span>FINAL CHECK</span><strong>ZAINAB · STUDIO PORTRAITS</strong></header>
        {[['Finished photographs', 'Kept as edited'], ['Words and order', 'Checked'], ['Full gallery', 'Ready'], ['Private link', 'Not sent yet']].map(([label, status]) => <div key={label}><Check size={15} /><span>{label}</span><strong>{status}</strong></div>)}
        <footer><span><LockKeyhole size={14} /> Only you can publish</span><strong>Ready to send <ArrowRight size={14} /></strong></footer>
      </Reveal>
    </div></section>

    <EndNote title="They are already asking," accent="“Are my pictures ready?”" description="When the answer is yes, send one link with the first viewing and full gallery inside." formatsTo="/formats" />
  </Page>;
}

