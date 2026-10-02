import React from 'react';
import PhotoSwapViewer from '../components/delivery/PhotoSwapViewer.jsx';

const photos = [
  { alt: 'A birthday portrait with a green dress and cake', name: 'demo-lora-1', colors: ['#bf562a', '#114639', '#eee0c8'] },
  { alt: 'An editorial portrait in a green jacket', name: 'demo-ada-1', colors: ['#4a2030', '#0d4936', '#aa8068'] },
  { alt: 'A fashion portrait in white against a blue backdrop', name: 'demo-sharon-1', colors: ['#173b70', '#f0eae0', '#1f2131'] },
  { alt: 'A portrait in a yellow suit against a blue backdrop', name: 'audience-portrait', colors: ['#142d58', '#d49b2e', '#c18b75'] },
  { alt: 'A couple in gold traditional wedding attire indoors', name: 'demo-wedding-1', colors: ['#b78d5c', '#e8dfcf', '#756048'] },
  { alt: 'A birthday portrait in the same green dress', name: 'demo-lora-4', colors: ['#b64f2a', '#104537', '#a16c53'] },
  { alt: 'The couple in gold traditional wedding attire outdoors', name: 'demo-wedding-3', colors: ['#a7814e', '#719064', '#e7dbc4'] },
  { alt: 'A black-and-white portrait with an instant camera', name: 'commercial', colors: ['#161616', '#e6e6e6', '#888888'] }
];

const assets = photos.map((photo, index) => ({
  assetId: `photoswap-demo-${index + 1}`,
  sortOrder: index,
  alt: photo.alt,
  dominantColor: photo.colors[0],
  photoColors: photo.colors,
  thumbnailUrl: `/veylo/web/${photo.name}-480.webp`,
  url: `/veylo/web/${photo.name}-1440.webp`,
  width: 480,
  height: 640
}));

const demoDelivery = {
  kind: 'photoswap',
  title: 'Photo Swap demo',
  clientName: 'Veylo sample',
  branding: { name: 'Veylo Studio', logoUrl: '/veylo/veylo-logo.png' },
  assets,
  soundtrack: { title: 'Veylo soundtrack', url: '/audio/soundtrack-1.mp3' },
  access: { allowIndividualDownloads: true, allowDownloadAll: true },
  photoswap: {
    backgroundMode: 'auto'
  }
};

export default function PhotoSwapDemo() {
  return <PhotoSwapViewer delivery={demoDelivery} demo />;
}
