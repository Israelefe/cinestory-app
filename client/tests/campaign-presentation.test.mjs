import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignPhotoKey, campaignPresentation, campaignSetAnchor } from '../src/utils/campaignPresentation.js';
import { CAMPAIGN_DEMO_PHOTOS } from '../src/constants/campaignDemo.js';

const photos = Array.from({ length: 8 }, (_, index) => ({ assetId: `photo-${index}`, caption: `Saved caption ${index}` }));
const keys = result => [result.openingPhoto, ...result.sets.flatMap(set => set.photos), result.closingPhoto].filter(Boolean).map(campaignPhotoKey);

test('the demo shows each photograph once across four distinct spreads and bookends', () => {
  const result = campaignPresentation(null, CAMPAIGN_DEMO_PHOTOS);
  assert.equal(keys(result).length, 12);
  assert.equal(new Set(keys(result)).size, 12);
  assert.deepEqual(result.sets.map(set => set.design), ['detail', 'lifestyle', 'collection', 'portrait']);
  assert.equal(result.galleryPhotos.length, 12);
});

test('overlapping sets, duplicate IDs and bookend assignments cannot repeat or lose files', () => {
  const delivery = { schemaVersion: 3, v3: { openingAssetId: 'photo-0', closingAssetId: 'photo-7' }, creativeDirection: { sections: [
    { id: 'same', title: 'First', assetIds: ['photo-0','photo-1','photo-1','photo-2','missing'] },
    { id: 'same', title: 'Next', assetIds: ['photo-2','photo-3','photo-7'] }
  ] } };
  const result = campaignPresentation(delivery, photos);
  assert.equal(keys(result).length, 8);
  assert.equal(new Set(keys(result)).size, 8);
  assert.deepEqual(result.sets.slice(0,2).map(set => set.photos.map(campaignPhotoKey)), [['photo-1','photo-2'],['photo-3']]);
  assert.notEqual(campaignSetAnchor(result.sets[0]), campaignSetAnchor(result.sets[1]));
});

test('gallery-only assets stay out of the story, while explicit bookends stay visible', () => {
  const result = campaignPresentation({ schemaVersion: 3, v3: { openingAssetId: 'photo-0', closingAssetId: 'photo-7' } }, photos.slice(1,4), photos);
  assert.deepEqual(keys(result), ['photo-0','photo-1','photo-2','photo-3','photo-7']);
  assert.equal(result.galleryPhotos.length, 8);
});

test('saved highlight choices get the lead position without a repeated highlight gallery', () => {
  const result = campaignPresentation({ formatConfig: { campaign: { highlightAssetIds: ['photo-3','photo-5'], fileSets: [{ id: 'saved', title: 'The set', assetIds: ['photo-1','photo-5','photo-2'] }] } } }, photos);
  assert.equal(result.openingPhoto.assetId, 'photo-3');
  assert.equal(result.sets[0].photos[0].assetId, 'photo-5');
  assert.equal(new Set(keys(result)).size, 8);
});

test('an explicit set cover takes precedence over a highlight and retains saved copy', () => {
  const result = campaignPresentation({ creativeDirection: { sections: [{ id: 'set', title: 'Saved title', body: 'Saved note.', coverAssetId: 'photo-2', assetIds: ['photo-1','photo-2','photo-3'], layout: 'triptych', accent: '#b67d48' }] }, formatConfig: { campaign: { highlightAssetIds: ['photo-3'] } } }, photos);
  assert.equal(result.sets[0].photos[0].assetId, 'photo-2');
  assert.equal(result.sets[0].copy, 'Saved note.');
  assert.equal(result.sets[0].layout, 'triptych');
  assert.equal(result.sets[0].accent, '#b67d48');
});

test('legacy fallback grouping keeps the photograph sequence', () => {
  assert.deepEqual(keys(campaignPresentation({}, photos)), photos.map(campaignPhotoKey));
});

test('saved presentation and gallery orders remain independent and retain unlisted files', () => {
  const result = campaignPresentation({ presentationOrder: ['photo-2','photo-1','photo-1','missing'], galleryOrder: ['photo-7','photo-0'] }, photos);
  assert.deepEqual(keys(result), ['photo-2','photo-1','photo-0','photo-3','photo-4','photo-5','photo-6','photo-7']);
  assert.deepEqual(result.galleryPhotos.map(campaignPhotoKey), ['photo-7','photo-0','photo-1','photo-2','photo-3','photo-4','photo-5','photo-6']);
});

test('a one-photo delivery uses its photograph once when both bookends refer to it', () => {
  const result = campaignPresentation({ schemaVersion: 3, v3: { openingAssetId: 'photo-0', closingAssetId: 'photo-0' } }, photos.slice(0,1));
  assert.deepEqual(keys(result), ['photo-0']);
  assert.equal(result.closingPhoto, null);
  assert.equal(result.sets.length, 0);
});

test('empty client deliveries contain no demo photographs', () => {
  const result = campaignPresentation({ assets: [] });
  assert.deepEqual(keys(result), []);
  assert.deepEqual(result.galleryPhotos, []);
});
