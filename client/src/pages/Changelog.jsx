import React from 'react';
import { Check } from 'lucide-react';
import { Eyebrow, Intro, Page, Reveal, TextLink } from '../components/PublicDesign.jsx';

const notes = [
  { label: 'SEPTEMBER 2026 / ALBUM', title: 'Album joined Veylo as the sixth delivery format.', copy: 'Family sessions, weddings, and milestone shoots can now be presented as a page-by-page digital keepsake.', items: ['A designed cover opens the experience.', 'Full-page photographs, pairings, and quieter spreads give the set a considered rhythm.', 'The Adeyemi family sample is available as a working Album demo.'] },
  { label: 'SEPTEMBER 2026 / NAVIGATION', title: 'Back returns you to the section you opened.', copy: 'Moving between a public page and a live demo no longer means finding your place again.', items: ['Demo links remember the section they came from.', 'The browser, Android, and iOS back actions use the same return path.', 'Home links begin at the top when Home is chosen directly.'] },
  { label: 'SEPTEMBER 2026 / LIVE DEMOS', title: 'Reveal, Canvas, and Chapters now behave differently.', copy: 'The demos were rebuilt around the action each format asks the client to take.', items: ['Photo Reveal waits for the client to move to the next photograph.', 'Canvas lets the client move around a spatial arrangement of related images.', 'Chapters lets the client choose a part of the collection before entering it.'] },
  { label: 'SEPTEMBER 2026 / PORTFOLIO', title: 'The sample portfolio is ready to explore.', copy: 'The public example now shows how a studio can organise selected work and give enquiries one clear place to begin.', items: ['Visitors can filter the work by category.', 'Selected projects open their matching Veylo delivery.', 'Studio location, availability, and WhatsApp contact sit beside the photographs.'] }
];

export default function Changelog() {
  return <Page><Intro eyebrow="Product updates / September 2026" title="What changed" accent="in Veylo." description="A record of additions, fixes, and improvements you can see in the current product." /><div className="v-wrap pb-20 md:pb-28">{notes.map(note => <section className="v-release" key={note.label}><Reveal className="v-release-date"><Eyebrow>{note.label}</Eyebrow></Reveal><Reveal><h2>{note.title}</h2><p className="v-copy">{note.copy}</p><ul>{note.items.map(x => <li key={x}><Check size={16} /><span>{x}</span></li>)}</ul></Reveal></section>)}<Reveal className="v-policy-note mt-8">Have an idea from your studio? <TextLink to="/contact">Tell us what would help</TextLink></Reveal></div></Page>;
}
