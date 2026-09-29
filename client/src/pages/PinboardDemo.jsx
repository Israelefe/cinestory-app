import React from 'react';
import PinboardViewer from '../components/delivery/PinboardViewer.jsx';

const photos = [
  { alt: 'A couple in wedding attire beside tall windows', path: '/photos/romantic_wedding.jpg', colors: ['#d7c8b4', '#263e58', '#4c654b'], tags: ['couple portrait', 'wedding'], similarityTags: ['formal couple portrait', 'window-lit setting', 'white bridal outfit'], colorGroups: [{ area: 'outfit', color: 'cream' }] },
  { alt: 'A portrait in a green editorial outfit', path: '/photos/luxury_editorial.jpg', colors: ['#1d5544', '#2e2c2a', '#a18a53'], tags: ['studio portrait', 'green outfit', 'editorial'], similarityTags: ['seated half-length portrait', 'dark studio backdrop', 'green tailored outfit'], colorGroups: [{ area: 'outfit', color: 'green' }, { area: 'backdrop', color: 'charcoal' }] },
  { alt: 'A close portrait in a cream knit top', path: '/photos/intimate_portrait.jpg', colors: ['#e8d9c0', '#a8a097', '#594235'], tags: ['studio portrait', 'cream outfit'], similarityTags: ['seated half-length portrait', 'neutral studio backdrop', 'cream knit outfit'], colorGroups: [{ area: 'outfit', color: 'cream' }] },
  { alt: 'A milestone portrait in a gold-toned dress', path: '/photos/hero_milestone.jpg', colors: ['#d8c7a0', '#221d1b', '#a8875c'], tags: ['studio portrait', 'milestone', 'cream outfit'], similarityTags: ['half-length portrait', 'dark studio backdrop', 'cream satin outfit'], colorGroups: [{ area: 'outfit', color: 'cream' }, { area: 'backdrop', color: 'charcoal' }] },
  { alt: 'A graduate in a black gown against a blue backdrop', path: '/photos/graduation_milestone.jpg', colors: ['#151515', '#a8b6c8', '#ddc8a5'], tags: ['graduation', 'black gown'], similarityTags: ['seated full-length portrait', 'blue studio backdrop', 'black graduation gown'], colorGroups: [{ area: 'outfit', color: 'black' }, { area: 'backdrop', color: 'blue' }] },
  { alt: 'A fashion portrait in a white top and blue denim', path: '/photos/fashion_studio.jpg', colors: ['#c4e3f0', '#4f90bf', '#f4f1e9'], tags: ['studio portrait', 'fashion', 'white outfit'], similarityTags: ['full-length fashion pose', 'blue studio backdrop', 'cream top'], colorGroups: [{ area: 'outfit', color: 'cream' }, { area: 'backdrop', color: 'blue' }] },
  { alt: 'A black-and-white editorial portrait with a camera', path: '/photos/editorial_bnw.jpg', colors: ['#111111', '#ececec', '#757575'], tags: ['editorial portrait', 'black outfit', 'monochrome'], similarityTags: ['close-up portrait', 'black-and-white styling', 'holding a camera'], colorGroups: [{ area: 'outfit', color: 'black' }] },
  { alt: 'An outdoor celebration portrait in an orange jacket', path: '/photos/celebration_energy.jpg', colors: ['#e58a37', '#a7d6e9', '#9a7a51'], tags: ['outdoor portrait', 'celebration', 'orange outfit'], similarityTags: ['outdoor full-length pose', 'blue sky backdrop', 'orange jacket'], colorGroups: [{ area: 'outfit', color: 'orange' }, { area: 'backdrop', color: 'blue' }] }
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
  thumbnailUrl: photo.path,
  url: photo.path,
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
      { id: 'balanced', title: 'Even spread', description: 'Moves between portraits, celebrations, and close details.', assetOrder: [ids[0], ids[2], ids[4], ids[1], ids[5], ids[7], ids[3], ids[6]] },
      { id: 'colour-flow', title: 'Colour-led order', description: 'Keeps similar outfit and background colours near each other.', assetOrder: [ids[1], ids[3], ids[2], ids[0], ids[4], ids[5], ids[7], ids[6]] }
    ],
    moments: [
      { id: 'portraits', title: 'Studio portraits', assetIds: [ids[1], ids[2], ids[3], ids[5], ids[6]] },
      { id: 'celebrations', title: 'Life events', assetIds: [ids[0], ids[4], ids[7]] }
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
