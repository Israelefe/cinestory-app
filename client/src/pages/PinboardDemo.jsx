import React from 'react';
import { ArrowLeft, Grid2X2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PinboardViewer from '../components/delivery/PinboardViewer.jsx';

const files = [
  'event-01-arrivals.webp', 'event-02-keynote.webp', 'event-03-networking.webp', 'event-04-stage.webp',
  'event-05-details.webp', 'event-06-arrivals-greeting.webp', 'event-07-keynote-wide.webp', 'event-08-keynote-speaker.webp',
  'event-09-audience-applause.webp', 'event-10-networking-conversation.webp', 'event-11-audience-notes.webp', 'event-12-panel-discussion.webp',
  'event-13-partner-table.webp', 'event-14-venue-arrival.webp', 'event-15-networking-group.webp', 'event-16-stage-performance.webp'
];
const assets = files.map((filename, index) => ({ assetId: `pinboard-demo-${index + 1}`, sortOrder: index, alt: filename.replace(/^event-\d+-/, '').replace('.webp', '').replaceAll('-', ' '), url: `/veylo/demo/event/${filename}` }));
const ids = assets.map(asset => asset.assetId);
const demoDelivery = {
  kind: 'pinboard', title: 'The day, from every angle', clientName: 'Veylo Event Studio', branding: { name: 'Veylo Studio', logoUrl: '' }, assets,
  pinboard: {
    title: 'The day, from every angle', selectedLayoutId: 'balanced',
    layouts: [
      { id: 'balanced', title: 'A little of everything', description: 'People, details, and the room in a steady rhythm.', assetOrder: ids },
      { id: 'moments', title: 'Move through the day', description: 'Arrivals, the programme, then the conversations between.', assetOrder: [...ids.slice(0, 6), ...ids.slice(6)] },
      { id: 'colour-flow', title: 'Keep exploring', description: 'A free-flowing arrangement of the complete event.', assetOrder: [...ids.slice(8), ...ids.slice(0, 8)] }
    ],
    moments: [
      { id: 'arrivals', title: 'Arrivals and greetings', assetIds: [ids[0], ids[5], ids[13]] },
      { id: 'main-programme', title: 'The main programme', assetIds: [ids[1], ids[3], ids[6], ids[7], ids[11], ids[15]] },
      { id: 'between-sessions', title: 'Between sessions', assetIds: [ids[2], ids[9], ids[14]] },
      { id: 'details-and-tables', title: 'Details and tables', assetIds: [ids[4], ids[12]] }
    ],
    palette: { background: '#0d1113', surface: '#171d1f', text: '#f8f5ef', accent: '#d8a07e' },
    typography: { display: 'Playfair Display', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'soft-fade'
  }
};

export default function PinboardDemo() {
  return <>
    <header className="v-pinboard-demo-intro"><Link to="/formats"><ArrowLeft size={16} /> Delivery types</Link><span><Grid2X2 size={15} /> PINBOARD DELIVERY</span><h1>The full gallery,<br /><em>ready to explore.</em></h1><p>Every finished photo stays in the board. Clients browse freely, jump to a moment, and share a private link when they find a photo they want to keep.</p></header>
    <PinboardViewer delivery={demoDelivery} preview />
    <style>{`.v-pinboard-demo-intro{padding:58px max(18px,calc((100vw - 1220px)/2)) 22px;background:#09090c;color:#f7f3ee}.v-pinboard-demo-intro>a{display:inline-flex;align-items:center;gap:8px;color:#c9c1bb;font-size:12px;text-decoration:none}.v-pinboard-demo-intro>span{display:flex;align-items:center;gap:7px;margin-top:30px;color:#ff9b8e;font-size:9px;font-weight:700;letter-spacing:.18em}.v-pinboard-demo-intro h1{margin:13px 0 12px;font:500 clamp(39px,6vw,66px)/1.03 'Playfair Display',Georgia,serif}.v-pinboard-demo-intro h1 em{color:#e4b7a6;font-weight:400}.v-pinboard-demo-intro p{max-width:670px;margin:0;color:#aaa5a0;font-size:14px;line-height:1.75}@media(max-width:640px){.v-pinboard-demo-intro{padding:35px 17px 16px}.v-pinboard-demo-intro>span{margin-top:24px}.v-pinboard-demo-intro h1{font-size:43px}}`}</style>
  </>;
}
