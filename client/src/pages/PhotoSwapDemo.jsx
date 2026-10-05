import React from 'react';
import PhotoSwapViewer from '../components/delivery/PhotoSwapViewer.jsx';

const photos = [
  { alt: "Sharon's studio portrait against a cobalt backdrop", caption: "Sharon’s portrait session, set against a deep blue backdrop." },
  { alt: "A closer studio portrait of Sharon", caption: "A closer look from Sharon’s studio portrait session." },
  { alt: "Sharon in an ivory look against blue", caption: "The ivory styling stands out against the cobalt backdrop." },
  { alt: "A final portrait from Sharon's session", caption: "A final portrait from Sharon’s session." }
];

const assets = photos.map((photo, index) => ({
  assetId: 'photoswap-demo-' + (index + 1),
  sortOrder: index,
  alt: photo.alt,
  caption: photo.caption,
  dominantColor: '#173b70',
  photoColors: ['#173b70', '#f0eae0', '#1f2131'],
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
