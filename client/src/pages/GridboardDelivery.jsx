import React from 'react';
import { ArrowRight, Check, Download, Grid2X2, Image, LayoutTemplate, MessageCircle, Music2, Palette, Search } from 'lucide-react';
import { Action, Eyebrow, Page, Reveal } from '../components/PublicDesign.jsx';
import './GridboardDelivery.css';

const photos = ['/veylo/web/demo-lora-1-480.webp', '/veylo/web/demo-wedding-1-480.webp', '/veylo/web/demo-sharon-1-480.webp', '/veylo/web/demo-ada-1-480.webp', '/veylo/web/audience-portrait-480.webp'];
const features = [
  { icon: LayoutTemplate, label: 'AI-proposed arrangements', title: 'Choose the reading order.', copy: 'Veylo studies image shape, colour, and visual groupings to suggest three masonry layouts. You choose the starting arrangement for the client.' },
  { icon: Search, label: 'Find a moment', title: 'Go straight to a group.', copy: 'Clients can open useful groups such as portraits, details, or people together, then jump to those photographs in the board.' },
  { icon: Palette, label: 'Outfit and backdrop colours', title: 'Find a look by colour.', copy: 'When a shoot has enough variety, clients can open groups such as cream outfits or blue backgrounds. A group appears only when the colour is clear and it narrows the gallery.' },
  { icon: Image, label: 'Similar Shot', title: 'Find photographs with a similar look.', copy: 'During setup, Veylo compares framing, pose, outfit, backdrop, and visible details. When a client opens a photo, Similar Shot shows the closest matches. It does not use face recognition.' },
  { icon: Music2, label: 'Optional slideshow', title: 'Let the photos play when they are ready.', copy: 'Clients start a paced slideshow of the full gallery or the group they are viewing. If you add music, it starts with the slideshow; browsing the board stays quiet.' },
  { icon: Download, label: 'Download settings', title: 'Decide what clients can save.', copy: 'Allow individual photos or the full gallery to be downloaded. You can also lock downloads until you are ready.' },
  { icon: Palette, label: 'Colour, type, and motion', title: 'Make the board feel like the shoot.', copy: 'Veylo starts with a palette drawn from the dominant photo colours. Re-pick or adjust it, choose display and body fonts, set grid spacing and columns, and pick the entrance motion.' },
  { icon: MessageCircle, label: 'WhatsApp sharing', title: 'Send one photo at a time.', copy: 'Clients can share a private link to a photo in WhatsApp. They can also make a branded Status card from selected delivered photos.' }
];

export default function GridboardDelivery() {
  return <Page className="v-gridboard-page">
    <header className="v-wrap v-gb-hero">
      <Reveal className="v-gb-hero-copy"><Eyebrow>GRIDBOARD DELIVERY</Eyebrow><h1>The whole gallery,<br /><em>open to explore.</em></h1><p>Every finished photo sits on one visual board. Clients can find a moment, filter by outfit or backdrop, open Similar Shot for close visual matches, or start a slideshow when they are ready.</p><div className="v-actions"><Action to="/demo/gridboard">Browse the live GridBoard</Action><Action to="/create?type=pinboard" secondary>Create a GridBoard</Action></div><span className="v-gb-hero-note"><Check size={15} />Every delivered photo stays in the gallery. Originals remain untouched.</span></Reveal>
      <Reveal className="v-gb-hero-art" delay={.08}><div className="v-gb-mosaic" aria-label="A sample of finished Veylo photographs">{photos.map((photo, index) => <figure key={photo}><img src={photo} alt={index === 0 ? 'A selection of finished photographs from Veylo' : ''} loading={index < 2 ? 'eager' : 'lazy'} /></figure>)}<span className="v-gb-mosaic-caption"><Grid2X2 size={15} />Veylo sample <i>·</i> 8 photographs</span></div><div className="v-gb-colour-note"><span aria-hidden="true"><i /><i /><i /><i /></span><small>OUTFITS AND BACKDROPS</small></div></Reveal>
    </header>

    <section className="v-gb-overview"><div className="v-wrap"><Reveal className="v-gb-section-heading"><Eyebrow number="01">A different first view</Eyebrow><h2>They do not have to watch<br /><em>before they can browse.</em></h2><p>GridBoard puts the full gallery first. It is for clients who would rather move through all their finished photos at their own pace.</p></Reveal><div className="v-gb-feature-grid">{features.map(({ icon: Icon, label, title, copy }, index) => <Reveal className="v-gb-feature" key={label} delay={Math.min(index * .035, .16)}><span className="v-gb-feature-icon"><Icon size={18} /></span><small>{label}</small><h3>{title}</h3><p>{copy}</p></Reveal>)}</div></div></section>

    <section className="v-gb-how"><div className="v-wrap v-gb-how-grid"><Reveal><Eyebrow number="02">The photographer stays in control</Eyebrow><h2>Veylo suggests.<br /><em>You decide what ships.</em></h2><p>Upload the finished photos, review the suggested layouts and groups, set the colours and type, and choose the arrangement your client sees. Then check the client preview and publish a private link.</p><ol><li><span>01</span>Upload the complete set</li><li><span>02</span>Review and tune the board</li><li><span>03</span>Preview and send the link</li></ol><Action to="/formats" secondary>Compare the two delivery types</Action></Reveal><Reveal className="v-gb-check-card" delay={.08}><div><span>GRIDBOARD SAMPLE</span><strong>Ready to explore</strong></div><p><Check size={16} />All 8 sample photos included</p><p><Check size={16} />Three layouts reviewed</p><p><Check size={16} />Photo-led colours and your type pair</p><p><Check size={16} />Slideshow music optional</p><footer><span>Photographer preview</span><ArrowRight size={16} /></footer></Reveal></div></section>

    <section className="v-gb-demo-cta"><div className="v-wrap"><Reveal><Eyebrow>See how it feels to browse</Eyebrow><h2>Open the live GridBoard demo.</h2><p>Try the background groups, moment shortcuts, Similar Shot, slideshow, and WhatsApp sharing.</p><div className="v-actions"><Action to="/demo/gridboard">Open the GridBoard demo</Action><Action to="/create?type=pinboard" secondary>Start a GridBoard delivery</Action></div></Reveal></div></section>
  </Page>;
}
