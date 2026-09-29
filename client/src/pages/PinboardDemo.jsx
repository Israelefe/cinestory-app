import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import PinboardViewer from '../components/delivery/PinboardViewer.jsx';

const files = [
  'event-01-arrivals.webp', 'event-02-keynote.webp', 'event-03-networking.webp', 'event-04-stage.webp',
  'event-05-details.webp', 'event-06-arrivals-greeting.webp', 'event-07-keynote-wide.webp', 'event-08-keynote-speaker.webp',
  'event-09-audience-applause.webp', 'event-10-networking-conversation.webp', 'event-11-audience-notes.webp', 'event-12-panel-discussion.webp',
  'event-13-partner-table.webp', 'event-14-venue-arrival.webp', 'event-15-networking-group.webp', 'event-16-stage-performance.webp'
];
const assets = files.map((filename, index) => ({ assetId: `pinboard-demo-${index + 1}`, sortOrder: index, alt: filename.replace(/^event-\d+-/, '').replace('.webp', '').replaceAll('-', ' '), url: `/veylo/demo/event/${filename}`, width: 1536, height: 1024 }));
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
    palette: { background: '#f8f5f0', surface: '#fffdf9', text: '#201b18', accent: '#a14f3c' },
    typography: { display: 'Playfair Display', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'soft-fade'
  }
};

export default function PinboardDemo() {
  return <>
    <div className="v-pinboard-demo-bar"><Link to="/formats"><ArrowLeft size={16} /> Delivery types</Link><span>GRIDBOARD DELIVERY EXAMPLE</span></div>
    <PinboardViewer delivery={demoDelivery} preview />
  </>;
}
