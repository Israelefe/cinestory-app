import { DELIVERY_DEMO_DIMENSIONS } from './deliveryDemoMetadata.js';
import { campaignPhotos, eventCoveragePhotos } from './deliveryDemoPhotos.js';
import { CAMPAIGN_DEMO_PHOTOS } from './campaignDemo.js';
const uuid = (series, index) => `d000000${series}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
const birthdayCaptions = [
  'Lora, your birthday portraits begin here. Take your time with them.',
  'A birthday worth marking, with a photograph you can keep close.',
  'This part of the collection is yours to return to whenever you like.',
  'Lora, we saved space for the quieter birthday portraits too.',
  'Another photograph from your birthday session, ready to keep and share.',
  'Lora, these portraits close the session. Your full birthday collection follows.'
];
const birthday = Array.from({ length: 6 }, (_, index) => ({ name: `demo-lora-${index + 1}`, alt: "A photograph from Lora's birthday portrait session", caption: birthdayCaptions[index] }));
function assetsFor(photos, series) {
  return photos.map((photo, index) => { const direct = photo.name.startsWith('/'); return { assetId: uuid(series, index), sortOrder: index, originalFilename: direct ? photo.name.split('/').at(-1) : `${photo.name}-1440.webp`, alt: photo.alt, url: direct ? photo.name : `/veylo/web/${photo.name}-1440.webp`, thumbnailUrl: direct ? photo.name : `/veylo/web/${photo.name}-480.webp`, ...DELIVERY_DEMO_DIMENSIONS[direct ? photo.name : `/veylo/web/${photo.name}-1440.webp`] }; });
}
function base(format, photos, series, title, clientName, shootType, brief) {
  const assets = assetsFor(photos, series), ids = assets.map(asset => asset.assetId);
  return { kind: 'showcase', schemaVersion: 3, format, title, clientName, shootType, brief, assets, curatedAssetIds: ids, galleryAssetIds: ids, galleryOrder: ids, presentationOrder: ids,
    branding: { type: 'studio', name: 'Veylo Studio', logoUrl: '/veylo/veylo-logo.png' }, access: { allowIndividualDownloads: true, allowDownloadAll: true, allowLikes: true },
    v3: { revision: 1, openingAssetId: ids[0], closingAssetId: ids.at(-1) }, formatConfig: {},
    creativeDirection: { title, openingLine: 'Your finished photographs are ready. Take your time with the collection.', closingLine: 'Thank you for trusting us with these photographs. Your complete collection follows.', palette: { background: '#10100f', surface: '#20201c', text: '#f8f3e8', accent: '#d0b483' }, typography: { display: 'Cormorant Garamond', body: 'Outfit' }, frames: photos.map((photo, index) => ({ assetId: ids[index], headline: `Photograph ${index + 1}`, caption: photo.caption || '', motion: 'still' })), sections: [] }
  };
}
function groups(delivery, definitions) { return definitions.map(([title, body, indexes], index) => ({ id: `section-${index + 1}`, title, subtitle: '', body, coverAssetId: delivery.assets[indexes[0]].assetId, assetIds: indexes.map(at => delivery.assets[at].assetId), layout: delivery.format === 'chapters' ? 'grid' : delivery.format === 'canvas' ? 'cluster' : 'hero' })); }

export const CANVAS_DEMO = base('canvas', campaignPhotos, 1, 'The carry collection', 'The campaign team', 'Fashion', 'A finished product collection with lead photographs, close details and the bag in use.');
CANVAS_DEMO.curatedAssetIds = CANVAS_DEMO.assets.slice(0, 8).map(asset => asset.assetId);
CANVAS_DEMO.presentationOrder = [...CANVAS_DEMO.curatedAssetIds];
CANVAS_DEMO.creativeDirection.frames = CANVAS_DEMO.creativeDirection.frames.filter(frame => CANVAS_DEMO.curatedAssetIds.includes(frame.assetId));
CANVAS_DEMO.creativeDirection.openingLine = 'The lead photographs, close details and everyday settings, arranged together.';
CANVAS_DEMO.creativeDirection.closingLine = 'The complete collection includes all twelve finished photographs.';
CANVAS_DEMO.creativeDirection.sections = groups(CANVAS_DEMO, [['Lead photographs', 'The opening photographs show the pieces together.', [0, 3]], ['Details', 'Closer views of the clasp and stitching.', [1, 5]], ['In use', 'Photographs from the lobby, courtyard and desk.', [2, 4, 6, 7]]]);
CANVAS_DEMO.formatConfig.canvas = { version: 1, arrangement: 'spatial', showGroupNotes: true };

export const CHAPTERS_DEMO = base('chapters', eventCoveragePhotos.slice(0, 10), 2, 'The conference, in chapters', 'The event team', 'Event', 'A sample conference record, grouped by arrivals, programme and conversations.');
CHAPTERS_DEMO.creativeDirection.openingLine = 'Choose where to begin: arrivals, the programme, or the conversations between sessions.';
CHAPTERS_DEMO.creativeDirection.sections = groups(CHAPTERS_DEMO, [['Arrivals', 'Guests check in and greet one another before the programme.', [0, 5]], ['The programme', 'The stage, the room and the audience during the sessions.', [1, 3, 6, 7, 8]], ['Between sessions', 'Conversations over refreshments and the details around the room.', [2, 4, 9]]]);
CHAPTERS_DEMO.formatConfig.chapters = { version: 1, directoryLayout: 'covers', showPhotoCaptions: true };

export const ALBUM_DEMO = base('album', birthday, 3, "Lora's birthday album", 'Lora', 'Birthday', "Lora's finished birthday portraits, arranged into a keepsake album.");
ALBUM_DEMO.creativeDirection.openingLine = 'Lora, your birthday portraits are ready to keep. Open the album when you are ready.';
ALBUM_DEMO.creativeDirection.closingLine = 'Lora, thank you for spending your birthday session with us. Your full collection is ready.';
ALBUM_DEMO.soundtrack = { title: 'Veylo soundtrack', url: '/audio/soundtrack-1.mp3' };
ALBUM_DEMO.formatConfig.album = { version: 1, paperTone: 'light', spreads: [
  { id: 'spread-1', layout: 'single', assetIds: [ALBUM_DEMO.assets[0].assetId], heading: 'A birthday to keep', note: birthdayCaptions[0] },
  { id: 'spread-2', layout: 'pair', assetIds: ALBUM_DEMO.assets.slice(1, 3).map(asset => asset.assetId), heading: 'More from your session', note: 'Two birthday portraits, given their own space.' },
  { id: 'spread-3', layout: 'pair', assetIds: ALBUM_DEMO.assets.slice(3, 5).map(asset => asset.assetId), heading: 'Take your time', note: 'Lora, these photographs are yours to revisit.' },
  { id: 'spread-4', layout: 'single', assetIds: [ALBUM_DEMO.assets[5].assetId], heading: 'One to close the album', note: birthdayCaptions[5] }
] };

export const EVENT_DEMO = base('event-coverage', eventCoveragePhotos, 4, 'A day at the conference', 'The event team', 'Event', 'A sample Nigerian conference record: guests arriving, the programme, conversations and details.');
EVENT_DEMO.creativeDirection.openingLine = 'The guests, the programme and the conversations between sessions, together in one collection.';
EVENT_DEMO.creativeDirection.sections = groups(EVENT_DEMO, [['Arrivals', 'The welcome and check-in before the programme.', [0, 5, 13]], ['The programme', 'Speakers and performers share the stage.', [1, 3, 6, 7, 11, 15]], ['Between sessions', 'Conversations continue away from the stage.', [2, 9, 12]], ['The room', 'Audience photographs and the details around the gathering.', [4, 8, 10, 14]]]);
EVENT_DEMO.formatConfig.eventCoverage = { version: 1, showSceneNotes: true, highlightAssetIds: [0, 6, 9, 14].map(index => EVENT_DEMO.assets[index].assetId), eventDate: '', venue: '' };

export const CAMPAIGN_DEMO = base('campaign', CAMPAIGN_DEMO_PHOTOS, 5, 'The carry collection', 'The campaign team', 'Fashion', 'Finished product photographs: lead frames, close details and the bag in everyday settings.');
CAMPAIGN_DEMO.creativeDirection.openingLine = 'A product collection with lead photographs, close details and everyday settings.';
CAMPAIGN_DEMO.creativeDirection.typography = { display: 'Outfit', body: 'Manrope' };
CAMPAIGN_DEMO.creativeDirection.palette = { background: '#090d13', surface: '#121a25', text: '#f5f2eb', accent: '#e9ab79' };
CAMPAIGN_DEMO.creativeDirection.sections = groups(CAMPAIGN_DEMO, [['Lead photographs', 'The pieces together, with room to see their shape.', [0, 3, 8, 9]], ['Close details', 'The clasp and stitching in closer view.', [1, 5]], ['In use', 'The bag photographed across several settings.', [2, 4, 6, 7, 10, 11]]]);
CAMPAIGN_DEMO.formatConfig.usageTerms = 'Sample terms: contact the studio to confirm the agreed uses before publishing these photographs.';
CAMPAIGN_DEMO.formatConfig.campaign = { version: 1, highlightAssetIds: [0, 5, 6].map(index => CAMPAIGN_DEMO.assets[index].assetId), assetLabels: CAMPAIGN_DEMO.assets.map((asset, index) => ({ assetId: asset.assetId, label: ['Lead photograph', 'Stitching detail', 'Lobby photograph', 'Pieces together', 'At the table', 'Clasp detail', 'Courtyard photograph', 'At the desk', 'On the shelf', 'Packaging', 'Travel photograph', 'At the cafe'][index], role: [1, 5].includes(index) ? 'detail' : index === 0 ? 'hero' : [3, 8, 9].includes(index) ? 'supporting' : 'in-use' })), fileSets: CAMPAIGN_DEMO.creativeDirection.sections.map(section => ({ id: section.id, title: section.title, assetIds: section.assetIds })) };

export const GRIDBOARD_DEMO = { ...base('canvas', birthday, 6, "Lora's birthday photographs", 'Lora', 'Birthday', "Lora's birthday portraits."), kind: 'pinboard', format: undefined, soundtrack: { title: 'Veylo soundtrack', url: '/audio/soundtrack-1.mp3' } };
const boardIds = GRIDBOARD_DEMO.assets.map(asset => asset.assetId);
GRIDBOARD_DEMO.pinboard = { title: GRIDBOARD_DEMO.title, description: 'Lora, your birthday portraits are ready. Browse the photographs or play the slideshow.', selectedLayoutId: 'balanced', layouts: ['balanced', 'moments', 'colour-flow'].map((id, index) => ({ id, title: ['Even spread', 'Scenes together', 'Colour-led order'][index], description: 'The same complete collection in a different order.', assetOrder: index === 2 ? [...boardIds].reverse() : boardIds })), moments: [], typography: { display: 'Cormorant Garamond', body: 'Outfit' }, grid: { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' }, animation: 'staggered' };
GRIDBOARD_DEMO.pinboard.palette = { background: '#23170f', surface: '#342319', text: '#f8ede3', accent: '#d0997c' };

const productCaptions = ['The handbag and wallet together in the opening frame.', 'A close view of the stitching and hardware.', 'The bag photographed in the lobby.', 'The pieces and packaging arranged together.', 'A seated photograph with the bag at the table.', 'The clasp and card holder in closer view.', 'A photograph from the courtyard setting.', 'The bag beside the desk.', 'The collection arranged on the shelf.', 'The bag and its packaging together.', 'A photograph from the travel setting.', 'The bag at the cafe.'];
for (const record of [CANVAS_DEMO, CAMPAIGN_DEMO]) record.creativeDirection.frames = record.creativeDirection.frames.map((frame, index) => ({ ...frame, caption: record === CAMPAIGN_DEMO ? CAMPAIGN_DEMO_PHOTOS[index].caption : productCaptions[index], headline: CAMPAIGN_DEMO.formatConfig.campaign.assetLabels[index].label }));
for (const index of [0, 3]) Object.assign(GRIDBOARD_DEMO.assets[index], { photoColors: ['#bf562a', '#114639', '#eee0c8'], dominantColor: '#bf562a', visualTags: ['birthday portrait'], similarityTags: ['orange studio backdrop', 'green off-shoulder dress', 'birthday studio portrait'], colorGroups: [{ area: 'outfit', color: 'green' }, { area: 'backdrop', color: 'orange' }] });
