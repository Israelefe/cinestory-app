import React from 'react';
import PinboardViewer from '../components/delivery/PinboardViewer.jsx';

const descriptions = [
  'Lora smiling with her birthday cake', 'Lora in her green birthday dress', 'Lora holding her cake',
  'Lora smiling for a birthday portrait', 'A close portrait of Lora', 'Lora holding a wrapped gift'
];
const assets = descriptions.map((alt, index) => ({ assetId: `gridboard-demo-${index + 1}`, sortOrder: index, alt, thumbnailUrl: `/veylo/web/demo-lora-${index + 1}-480.webp`, url: `/veylo/web/demo-lora-${index + 1}-1440.webp`, width: 480, height: 640 }));
const ids = assets.map(asset => asset.assetId);
const demoDelivery = {
  kind: 'pinboard', title: "Lora's 25th birthday", clientName: 'Lora Ade', branding: { name: 'Veylo Studio', logoUrl: '/veylo/veylo-logo.png' }, assets,
  access: { allowIndividualDownloads: true, allowDownloadAll: true, downloadsLocked: false },
  pinboard: {
    title: "Lora's 25th birthday", description: 'Every finished photograph from her birthday shoot.', selectedLayoutId: 'balanced',
    layouts: [
      { id: 'balanced', title: 'Portraits and little details', description: 'The complete birthday shoot.', assetOrder: [ids[3], ids[0], ids[4], ids[5], ids[1], ids[2]] },
      { id: 'moments', title: 'From portrait to cake', description: 'The complete birthday shoot.', assetOrder: ids },
      { id: 'colour-flow', title: 'A closer look', description: 'The complete birthday shoot.', assetOrder: [ids[4], ids[3], ids[1], ids[0], ids[2], ids[5]] }
    ],
    moments: [
      { id: 'portraits', title: 'Portraits', assetIds: [ids[1], ids[3], ids[4]] },
      { id: 'birthday-cake', title: 'With the cake', assetIds: [ids[0], ids[2]] },
      { id: 'little-surprise', title: 'A little surprise', assetIds: [ids[5]] }
    ],
    palette: { background: '#13110f', surface: '#211b18', text: '#fff6ec', accent: '#efa57c' },
    typography: { display: 'Cormorant Garamond', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'staggered'
  }
};

export default function PinboardDemo() {
  return <PinboardViewer delivery={demoDelivery} demo />;
}
