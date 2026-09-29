import React from 'react';
import { ArrowRight, Check, Grid2X2, Image, LayoutTemplate, MessageCircle, Music2, Palette, Search } from 'lucide-react';
import { Action, Eyebrow, Page, Reveal } from '../components/PublicDesign.jsx';
import './GridboardDelivery.css';

const photos = [1, 6, 5, 3, 4, 2].map(number => `/veylo/web/demo-lora-${number}-480.webp`);
const features = [
  { icon: LayoutTemplate, label: 'AI-proposed arrangements', title: 'Choose the reading order.', copy: 'Veylo studies image shape, colour, and visual groupings to suggest three masonry layouts. You choose the starting arrangement for the client.' },
  { icon: Search, label: 'Find a moment', title: 'Go straight to a group.', copy: 'Clients can open useful groups such as portraits, details, or people together, then jump to those photographs in the board.' },
  { icon: Palette, label: 'Follow a colour', title: 'Browse by the colours in the shoot.', copy: 'Colour swatches come from the photographs. A tap brings forward photos with similar colours; another tap returns to the complete board.' },
  { icon: Image, label: 'More like this', title: 'Follow a visual thread.', copy: 'From an open photo, clients can find other photographs with similar colours or visible details in the scene. Veylo does not use face recognition.' },
  { icon: Grid2X2, label: 'Client layout choice', title: 'Offer another way to browse.', copy: 'You decide whether clients can switch between the three arrangements you reviewed. Leave the option off to keep everyone on your chosen layout.' },
  { icon: Music2, label: 'Optional slideshow', title: 'Let the photos play when they are ready.', copy: 'Clients start a paced slideshow of the full gallery or the group they are viewing. If you add music, it starts with the slideshow; browsing the board stays quiet.' },
  { icon: Palette, label: 'Colour, type, and motion', title: 'Make the board feel like the shoot.', copy: 'Veylo starts with a palette drawn from the dominant photo colours. Re-pick or adjust it, choose display and body fonts, set grid spacing and columns, and pick the entrance motion.' },
  { icon: MessageCircle, label: 'WhatsApp sharing', title: 'Send one photo at a time.', copy: 'Clients can share a private link to a photo in WhatsApp. They can also make a branded Status card from selected delivered photos.' }
];

export default function GridboardDelivery() {
  return <Page className="v-gridboard-page">
    <header className="v-wrap v-gb-hero">
      <Reveal className="v-gb-hero-copy"><Eyebrow>GRIDBOARD DELIVERY</Eyebrow><h1>The whole gallery,<br /><em>open to explore.</em></h1><p>Every finished photo sits on one visual board. Clients can follow a moment, browse by colour, open related photos, or start a slideshow when they are ready.</p><div className="v-actions"><Action to="/demo/gridboard">Browse the live GridBoard</Action><Action to="/create?type=pinboard" secondary>Create a GridBoard</Action></div><span className="v-gb-hero-note"><Check size={15} />Every delivered photo stays in the gallery. Originals remain untouched.</span></Reveal>
      <Reveal className="v-gb-hero-art" delay={.08}><div className="v-gb-mosaic" aria-label="A preview of Lora's birthday photographs">{photos.map((photo, index) => <figure key={photo}><img src={photo} alt={index === 0 ? 'Lora smiling at her birthday shoot' : ''} loading={index < 2 ? 'eager' : 'lazy'} /></figure>)}<span className="v-gb-mosaic-caption"><Grid2X2 size={15} />Lora's 25th birthday <i>·</i> 6 photographs</span></div><div className="v-gb-colour-note"><span aria-hidden="true"><i /><i /><i /><i /></span><small>COLOURS FROM THE SHOOT</small></div></Reveal>
    </header>

    <section className="v-gb-overview"><div className="v-wrap"><Reveal className="v-gb-section-heading"><Eyebrow number="01">A different first view</Eyebrow><h2>They do not have to watch<br /><em>before they can browse.</em></h2><p>GridBoard puts the full gallery first. It is for clients who would rather move through all their finished photos at their own pace.</p></Reveal><div className="v-gb-feature-grid">{features.map(({ icon: Icon, label, title, copy }, index) => <Reveal className="v-gb-feature" key={label} delay={Math.min(index * .035, .16)}><span className="v-gb-feature-icon"><Icon size={18} /></span><small>{label}</small><h3>{title}</h3><p>{copy}</p></Reveal>)}</div></div></section>

    <section className="v-gb-how"><div className="v-wrap v-gb-how-grid"><Reveal><Eyebrow number="02">The photographer stays in control</Eyebrow><h2>Veylo suggests.<br /><em>You decide what ships.</em></h2><p>Upload the finished photos, review the suggested layouts and groups, set the colours and type, and choose whether your client can switch layouts. Then check the client preview and publish a private link.</p><ol><li><span>01</span>Upload the complete set</li><li><span>02</span>Review and tune the board</li><li><span>03</span>Preview and send the link</li></ol><Action to="/formats" secondary>Compare the two delivery types</Action></Reveal><Reveal className="v-gb-check-card" delay={.08}><div><span>YOUR GRIDBOARD</span><strong>Ready for Lora</strong></div><p><Check size={16} />All 6 finished photos included</p><p><Check size={16} />Three layouts reviewed</p><p><Check size={16} />Photo-led colours and your type pair</p><p><Check size={16} />Slideshow music optional</p><footer><span>Photographer preview</span><ArrowRight size={16} /></footer></Reveal></div></section>

    <section className="v-gb-demo-cta"><div className="v-wrap"><Reveal><Eyebrow>See how it feels to browse</Eyebrow><h2>Open the live GridBoard demo.</h2><p>Try the colour swatches, moment groups, layout picker, related photos, slideshow, and WhatsApp sharing.</p><div className="v-actions"><Action to="/demo/gridboard">Open the GridBoard demo</Action><Action to="/create?type=pinboard" secondary>Start a GridBoard delivery</Action></div></Reveal></div></section>
  </Page>;
}
