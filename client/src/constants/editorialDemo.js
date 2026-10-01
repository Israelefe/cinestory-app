import { DEMO_PRESETS } from './demoStories.js';

const ada = DEMO_PRESETS.find(preset => preset.id === 'ada');
const assets = ada.photos.map((photo, index) => ({ assetId: `demo-ada-${index + 1}`, url: `/veylo/web/demo-ada-${index + 1}-960.webp`, thumbnailUrl: `/veylo/web/demo-ada-${index + 1}-480.webp`, srcSet: [480, 960, 1440].map(width => `/veylo/web/demo-ada-${index + 1}-${width}.webp ${width}w`).join(', '), width: 960, height: 1285, originalFilename: `ada-${index + 1}.jpg` }));
const words = [
  ['Thirty, in green', 'Ada chose an emerald suit for her thirtieth birthday portraits. The ivory telephone adds a playful detail to the first look.'],
  ['A closer look', 'A hand at the cuff, gold earrings and the same emerald suit. This closer portrait gives the details their own space.'],
  ['The full look', 'The full-length portrait brings the suit and telephone together, with room to see the shape of the look against the wine-coloured set.'],
  ['Over the shoulder', 'Ada looks back over her shoulder in a closer portrait. The green suit carries the same thread through a different angle.'],
  ['One last portrait', 'The telephone returns beside the burgundy plinth, bringing the final portrait back to the details that opened Ada’s birthday feature.']
];
const sections = [
  { id: 'the-green-suit', title: 'The green suit', body: 'Ada’s brief for her thirtieth birthday was a playful fashion set that still felt grown and confident. She chose an emerald suit and a vintage ivory telephone. Those two details hold the feature together, while each portrait gives the look a different angle.', pullLine: 'Those two details hold the feature together', layout: 'feature', assetIds: assets.slice(0, 2).map(asset => asset.assetId) },
  { id: 'a-different-angle', title: 'A different angle', body: 'The wider portrait makes room for the full look. The closer photograph draws attention back to Ada, keeping the green suit in view. Together they give the collection variety without losing the simple idea behind the session.', pullLine: '', layout: 'pair', assetIds: assets.slice(2, 4).map(asset => asset.assetId) },
  { id: 'the-last-portrait', title: 'The last portrait', body: '', pullLine: '', layout: 'hero', assetIds: [assets[4].assetId] }
];
export const EDITORIAL_DEMO_DELIVERY = {
  schemaVersion: 3, format: 'editorial', title: 'Ada at Thirty', clientName: ada.clientName, shootType: '30th birthday portraits', brief: ada.photographerBrief,
  branding: { type: 'studio', name: ada.studioName }, assets, curatedAssetIds: assets.map(asset => asset.assetId),
  creativeDirection: { title: 'Thirty, in green', openingLine: 'An emerald suit, an ivory telephone, and Ada at thirty. A birthday portrait feature by Apex Imagery Lekki.', closingLine: 'Ada, your finished birthday portraits are ready. The full collection is here for you to enjoy and keep.', palette: { background: '#eee7dc', surface: '#e4dbce', text: '#211c17', accent: '#883e32' }, typography: { display: 'Playfair Display', body: 'Outfit' }, frames: assets.map((asset, index) => ({ assetId: asset.assetId, headline: words[index][0], caption: words[index][1], imageFit: 'contain', focalPoint: '50% 50%' })), sections, editorial: { version: 1, introduction: '', issue: '', note: '', treatment: 'classic', credits: [], sections } },
  v3: { openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId, narrationChoice: 'skip' }, access: { allowLikes: true, allowIndividualDownloads: true, allowDownloadAll: true }
};
