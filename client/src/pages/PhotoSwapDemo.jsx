import React from 'react';
import PhotoSwapViewer from '../components/delivery/PhotoSwapViewer.jsx';

const photos = [
  {
    alt: "Sharon's studio portrait against a cobalt backdrop",
    caption: "Sharon’s portrait session, set against a deep blue backdrop.",
    dominantColor: '#173b70',
    photoColors: ['#173b70', '#f0eae0', '#0f2240']
  },
  {
    alt: "A closer studio portrait of Sharon",
    caption: "A closer look from Sharon’s studio portrait session.",
    dominantColor: '#2b1a3d',
    photoColors: ['#2b1a3d', '#e8d5f2', '#150c1f']
  },
  {
    alt: "Sharon in an ivory look against blue",
    caption: "The ivory styling stands out against the cobalt backdrop.",
    dominantColor: '#163328',
    photoColors: ['#163328', '#d0f0e4', '#0d1f18']
  },
  {
    alt: "A final portrait from Sharon's session",
    caption: "A final portrait from Sharon’s session.",
    dominantColor: '#3d2014',
    photoColors: ['#3d2014', '#f5dfd0', '#21110a']
  }
];

const assets = photos.map((photo, index) => ({
  assetId: 'photoswap-demo-' + (index + 1),
  sortOrder: index,
  alt: photo.alt,
  caption: photo.caption,
  dominantColor: photo.dominantColor,
  photoColors: photo.photoColors,
  thumbnailUrl: '/veylo/web/demo-sharon-' + (index + 1) + '-480.webp',
  url: '/veylo/web/demo-sharon-' + (index + 1) + '-1440.webp',
  width: 480,
  height: 640
}));

const demoDelivery = {
  kind: 'photoswap',
  title: "Sharon’s Studio Portraits",
  clientName: 'Sharon',
  shootType: 'Studio Portrait',
  branding: { name: 'Kora Media Studio', logoUrl: '/veylo/veylo-logo.png' },
  assets,
  soundtrack: { title: 'Lagos Sunset · Ambient Chill', url: '/audio/soundtrack-1.mp3' },
  access: { allowIndividualDownloads: true, allowDownloadAll: false, allowLikes: true },
  photoswap: {
    backgroundMode: 'auto',
    typography: { display: 'Playfair Display', body: 'Outfit' }
  }
};

export default function PhotoSwapDemo() {
  function downloadSample(assetId, index) {
    const asset = assets.find(photo => photo.assetId === assetId) || assets[index];
    if (!asset) return;
    const link = document.createElement('a');
    link.href = asset.url;
    link.download = 'sharon-portrait-' + (index + 1) + '.webp';
    link.click();
  }

  return <PhotoSwapViewer delivery={demoDelivery} galleryProps={{ onDownload: downloadSample }} demo />;
}
