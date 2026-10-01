import { DEMO_PRESETS } from './demoStories.js';

const ada = DEMO_PRESETS.find(preset => preset.id === 'ada');
const assets = ada.photos.map((photo, index) => ({ assetId: `demo-ada-${index + 1}`, url: `/veylo/web/demo-ada-${index + 1}-960.webp`, thumbnailUrl: `/veylo/web/demo-ada-${index + 1}-480.webp`, srcSet: [480, 960, 1440].map(width => `/veylo/web/demo-ada-${index + 1}-${width}.webp ${width}w`).join(', '), width: 960, height: 1285, originalFilename: `ada-${index + 1}.jpg` }));
const words = [
  ['Hello, thirty', 'Ada, here are your portraits from the year you turned thirty. A birthday worth making time for, and photographs to keep.'],
  ['A little playfulness', 'Ada, you chose to mark thirty with a playful portrait session. A birthday celebration with a direction of your own.'],
  ['Keep this one', 'Ada, keep this portrait from the year you turned thirty. Something to look back on when another birthday comes around.'],
  ['Just for you', 'You don’t need another occasion to revisit these photographs, Ada. They’re yours to enjoy whenever you want.'],
  ['Happy birthday, Ada', 'Here’s to good health, good company, and a year with plenty for you to look forward to, Ada.']
];
const sections = [
  { id: 'marking-thirty', title: 'Marking thirty', body: 'Thirty was the occasion. Ada chose a portrait session to mark it, with a playful fashion feel and a grown, confident direction. These photographs belong to that birthday: a collection to keep as the years move on.', pullLine: 'Thirty was the occasion', layout: 'feature', assetIds: assets.slice(0, 2).map(asset => asset.assetId) },
  { id: 'your-kind-of-celebration', title: 'Your kind of celebration', body: 'Ada’s birthday portraits move between wider photographs and closer ones, each part of the same session. There’s room to take them in slowly, and a full gallery to return to whenever she wants.', pullLine: '', layout: 'pair', assetIds: assets.slice(2, 4).map(asset => asset.assetId) },
  { id: 'one-for-the-album', title: 'One for the album', body: '', pullLine: '', layout: 'hero', assetIds: [assets[4].assetId] }
];
export const EDITORIAL_DEMO_DELIVERY = {
  schemaVersion: 3, format: 'editorial', title: 'Ada at Thirty', clientName: ada.clientName, shootType: '30th birthday portraits', brief: ada.photographerBrief,
  branding: { type: 'studio', name: ada.studioName }, assets, curatedAssetIds: assets.map(asset => asset.assetId),
  creativeDirection: { title: 'Ada at Thirty', openingLine: 'For her thirtieth birthday, Ada chose a playful portrait session with a fashion feel. A birthday feature by Apex Imagery Lekki.', closingLine: 'Ada, your thirtieth birthday portraits are all here. The full gallery is ready below for you to view and keep.', writingOverrides: [], palette: { background: '#eee7dc', surface: '#e4dbce', text: '#211c17', accent: '#883e32' }, typography: { display: 'Playfair Display', body: 'Outfit' }, frames: assets.map((asset, index) => ({ assetId: asset.assetId, headline: words[index][0], caption: words[index][1], imageFit: 'contain', focalPoint: '50% 50%' })), sections, editorial: { version: 1, introduction: '', issue: '', note: '', treatment: 'classic', credits: [], sections } },
  v3: { openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId, narrationChoice: 'skip' }, access: { allowLikes: true, allowIndividualDownloads: true, allowDownloadAll: true }
};
