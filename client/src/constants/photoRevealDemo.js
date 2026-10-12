const sources = ['demo-sharon-1', 'demo-sharon-2', 'demo-sharon-3', 'sharon-side', 'demo-sharon-4'];
const words = [
  ['Your first look', 'Sharon, we are glad we could make these portraits with you. Take your time with them.'],
  ['At your own pace', 'There is no rush through this collection. Stay with the photographs you love.'],
  ['A quieter portrait', 'This is one of the quieter photographs from your session. We wanted you to have this side of it too.'],
  ['One to come back to', 'Keep this one close, Sharon. We hope you enjoy coming back to these portraits.'],
  ['One for your wall', 'Sharon, this is one of our favourites from your session. It would be lovely to see it printed.']
];
const assets = sources.map((source, index) => ({
  assetId: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  url: `/veylo/web/${source}-960.webp`, thumbnailUrl: `/veylo/web/${source}-480.webp`,
  srcSet: [480, 960, 1440].map(width => `/veylo/web/${source}-${width}.webp ${width}w`).join(', '),
  width: 960, height: 1280, alt: `Sharon's studio portrait ${index + 1}`, originalFilename: `sharon-${index + 1}.jpg`
}));
export const PHOTO_REVEAL_DEMO = {
  schemaVersion: 3, format: 'photo-reveal', clientName: 'Sharon', shootType: 'Studio portraits', title: 'Sharon’s studio portraits',
  branding: { type: 'studio', name: 'Studio Lumière' }, assets, curatedAssetIds: assets.map(asset => asset.assetId),
  creativeDirection: {
    title: 'Sharon, your portraits are ready.', openingLine: 'Five photographs from your studio session. Reveal each one when you are ready.', closingLine: 'Thank you for spending this session with us, Sharon. Your complete gallery is ready to enjoy and download.',
    palette: { background: '#080b10', surface: '#121820', text: '#f5efe7', accent: '#d8b895' }, typography: { display: 'Playfair Display', body: 'Outfit' },
    reveal: { style: 'curtain', movement: true, ending: 'triptych' },
    frames: assets.map((asset, index) => ({ assetId: asset.assetId, headline: words[index][0], caption: words[index][1] }))
  },
  v3: { openingAssetId: assets[0].assetId, closingAssetId: assets[4].assetId, narrationChoice: 'skip' },
  soundtrack: { url: '/audio/photo-reveal-feelgood-groove.mp3', title: 'Feelgood Groove' },
  access: { allowLikes: true, allowIndividualDownloads: true, allowDownloadAll: true }
};
