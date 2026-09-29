import React from 'react';
import PinboardViewer from '../components/delivery/PinboardViewer.jsx';

const photos = [
  { alt: 'A birthday portrait with a green dress and cake', name: 'demo-lora-1', colors: ['#bf562a', '#114639', '#eee0c8'], tags: ['birthday portrait', 'cake'], similarityTags: ['orange studio backdrop', 'green off-shoulder dress', 'birthday studio portrait'], colorGroups: [{ area: 'outfit', color: 'green' }, { area: 'backdrop', color: 'orange' }] },
  { alt: 'A birthday portrait in the same green dress', name: 'demo-lora-4', colors: ['#b64f2a', '#104537', '#a16c53'], tags: ['birthday portrait', 'studio portrait'], similarityTags: ['orange studio backdrop', 'green off-shoulder dress', 'birthday studio portrait'], colorGroups: [{ area: 'outfit', color: 'green' }, { area: 'backdrop', color: 'orange' }] },
  { alt: 'An editorial portrait in a green jacket', name: 'demo-ada-1', colors: ['#4a2030', '#0d4936', '#aa8068'], tags: ['fashion portrait', 'studio portrait'], similarityTags: ['plum studio backdrop', 'green tailored jacket', 'three-quarter fashion portrait'], colorGroups: [{ area: 'outfit', color: 'green' }, { area: 'backdrop', color: 'plum' }] },
  { alt: 'A fashion portrait in white against a blue backdrop', name: 'demo-sharon-1', colors: ['#173b70', '#f0eae0', '#1f2131'], tags: ['fashion portrait', 'studio portrait'], similarityTags: ['blue studio backdrop', 'half-length fashion portrait', 'tailored suit'], colorGroups: [{ area: 'outfit', color: 'cream' }, { area: 'backdrop', color: 'blue' }] },
  { alt: 'A portrait in a yellow suit against a blue backdrop', name: 'audience-portrait', colors: ['#142d58', '#d49b2e', '#c18b75'], tags: ['fashion portrait', 'studio portrait'], similarityTags: ['blue studio backdrop', 'half-length fashion portrait', 'tailored suit'], colorGroups: [{ area: 'outfit', color: 'yellow' }, { area: 'backdrop', color: 'blue' }] },
  { alt: 'A couple in gold traditional wedding attire indoors', name: 'demo-wedding-1', colors: ['#b78d5c', '#e8dfcf', '#756048'], tags: ['traditional wedding', 'couple portrait'], similarityTags: ['traditional wedding couple', 'gold traditional outfits', 'seated couple portrait'], colorGroups: [{ area: 'outfit', color: 'gold' }, { area: 'backdrop', color: 'cream' }] },
  { alt: 'The couple in gold traditional wedding attire outdoors', name: 'demo-wedding-3', colors: ['#a7814e', '#719064', '#e7dbc4'], tags: ['traditional wedding', 'couple portrait'], similarityTags: ['traditional wedding couple', 'gold traditional outfits', 'seated couple portrait'], colorGroups: [{ area: 'outfit', color: 'gold' }, { area: 'backdrop', color: 'green' }] },
  { alt: 'A black-and-white portrait with an instant camera', name: 'commercial', colors: ['#161616', '#e6e6e6', '#888888'], tags: ['fashion portrait', 'commercial'], similarityTags: ['black-and-white close-up', 'holding a camera', 'tailored jacket'], colorGroups: [{ area: 'outfit', color: 'black' }, { area: 'backdrop', color: 'grey' }] }
];
const assets = photos.map((photo, index) => ({
  assetId: `gridboard-demo-${index + 1}`,
  sortOrder: index,
  alt: photo.alt,
  photoColors: photo.colors,
  dominantColor: photo.colors[0],
  visualTags: photo.tags,
  similarityTags: photo.similarityTags,
  colorGroups: photo.colorGroups,
  thumbnailUrl: `/veylo/web/${photo.name}-480.webp`,
  url: `/veylo/web/${photo.name}-1440.webp`,
  width: 480,
  height: 640
}));
const ids = assets.map(asset => asset.assetId);
const demoDelivery = {
  kind: 'pinboard',
  title: 'A Veylo sample board',
  clientName: 'Veylo sample',
  branding: { name: 'Veylo Studio', logoUrl: '/veylo/veylo-logo.png' },
  assets,
  soundtrack: { title: 'Veylo soundtrack', url: '/audio/soundtrack-1.mp3' },
  access: { allowIndividualDownloads: true, allowDownloadAll: true, downloadsLocked: false },
  pinboard: {
    title: 'A Veylo sample board',
    description: 'A selection of photographs already featured across Veylo.',
    selectedLayoutId: 'balanced',
    allowClientLayouts: true,
    layouts: [
      { id: 'balanced', title: 'Even spread', description: 'Mixes portraits and celebrations throughout the board.', assetOrder: [ids[0], ids[5], ids[3], ids[1], ids[6], ids[4], ids[2], ids[7]] },
      { id: 'moments', title: 'Scenes together', description: 'Keeps photographs from the same shoot together.', assetOrder: ids },
      { id: 'colour-flow', title: 'Colour-led order', description: 'Places similar photo colours near each other.', assetOrder: [ids[5], ids[6], ids[0], ids[1], ids[2], ids[3], ids[4], ids[7]] }
    ],
    moments: [
      { id: 'birthday', title: 'Birthday portraits', assetIds: [ids[0], ids[1]] },
      { id: 'studio', title: 'Studio portraits', assetIds: [ids[2], ids[3], ids[4], ids[7]] },
      { id: 'wedding', title: 'Traditional wedding', assetIds: [ids[5], ids[6]] }
    ],
    palette: { background: '#13110f', surface: '#211b18', text: '#fff6ec', accent: '#efa57c' },
    typography: { display: 'Cormorant Garamond', body: 'Outfit' },
    grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' },
    animation: 'staggered'
  }
};

export default function PinboardDemo() {
  return <PinboardViewer delivery={demoDelivery} demo />;
}
