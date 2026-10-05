const words = [
  ['You did it, Courage', 'Courage, these portraits mark your graduation. A moment to stop, take it in, and keep a record of what you worked towards.'],
  ['One for your album', 'Here is a portrait to return to when you want to remember your graduation, Courage.'],
  ['A day worth keeping', 'Your graduation photographs are yours to enjoy long after the day has passed. Take your time with them.'],
  ['Time to take it in', 'Courage, give yourself a moment to enjoy reaching this point. These photographs will still be here when you want another look.'],
  ['Congratulations, Courage', 'Congratulations on your graduation, Courage. We are glad we could make these portraits for you.'],
  ['For what comes next', 'Keep these photographs close, Courage. Here is to the next part, with this graduation safely in your album.']
];
const assets = words.map((_, index) => ({ assetId: `demo-courage-${index + 1}`, url: `/veylo/web/demo-courage-${index + 1}-960.webp`, thumbnailUrl: `/veylo/web/demo-courage-${index + 1}-480.webp`, srcSet: [480, 960, 1440].map(width => `/veylo/web/demo-courage-${index + 1}-${width}.webp ${width}w`).join(', '), originalFilename: `courage-${index + 1}.jpg`, width: 960, height: 1280 }));
export const CANVAS_DEMO_DELIVERY = {
  schemaVersion: 3, format: 'canvas', clientName: 'Courage', title: 'Courage’s graduation', shootType: 'Graduation portraits',
  branding: { type: 'studio', name: 'Veylo Studio' }, assets, curatedAssetIds: assets.map(asset => asset.assetId),
  creativeDirection: { title: 'Courage,\nyou did it.', openingLine: 'Your graduation portraits, together. Take your time and open your favourites.', closingLine: 'Courage, all six photographs are here for you to view and keep. Congratulations again on your graduation.', typography: { display: 'Playfair Display', body: 'Outfit' }, palette: { background: '#0c1b16', surface: '#eee5d8', text: '#efe6d6', accent: '#c8ac8c' }, writingOverrides: [], frames: words.map(([headline, caption], index) => ({ assetId: assets[index].assetId, headline, caption, motion: ['slow-push', 'pan-left', 'slow-pull', 'pan-right', 'float', 'slow-push'][index] })), sections: [
    { id: 'for-your-album', title: 'For your album', subtitle: 'Two portraits from the session, together in one place.', assetIds: assets.slice(1, 3).map(asset => asset.assetId), layout: 'pair' },
    { id: 'congratulations', title: 'Congratulations, Courage', subtitle: 'The final portraits from your graduation collection.', assetIds: assets.slice(4).map(asset => asset.assetId), layout: 'pair' }
  ] },
  formatConfig: { canvas: { version: 1, arrangement: 'spatial', photoMotion: 'gentle', showGroupNotes: true, checkpoints: [{ id: 'first-portrait', type: 'photo', assetId: assets[0].assetId }, { id: 'album-point', type: 'group', sectionId: 'for-your-album' }, { id: 'take-it-in', type: 'photo', assetId: assets[3].assetId }, { id: 'last-portraits', type: 'group', sectionId: 'congratulations' }] } },
  v3: { openingAssetId: assets[0].assetId, closingAssetId: assets[5].assetId }, access: { allowLikes: true, allowIndividualDownloads: true, allowDownloadAll: true }
};
