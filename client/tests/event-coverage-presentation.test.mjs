import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventCoveragePresentation, eventPhotoKey, eventSceneAnchor } from '../src/utils/eventCoveragePresentation.js';
import { EVENT_COVERAGE_DEMO_PHOTOS } from '../src/constants/eventCoverageDemo.js';

const photos = Array.from({ length: 8 }, (_, index) => ({ assetId: `photo-${index}`, url: `/photo-${index}.jpg` }));
const shown = presentation => [presentation.openingPhoto, ...presentation.sections.flatMap(section => section.photos), presentation.closingPhoto].filter(Boolean).map(eventPhotoKey);

test('demo scenes contain every photograph once, including the cover', () => {
  const presentation = eventCoveragePresentation(null, EVENT_COVERAGE_DEMO_PHOTOS);
  assert.deepEqual([...shown(presentation)].sort(), EVENT_COVERAGE_DEMO_PHOTOS.map(eventPhotoKey).sort());
  assert.equal(presentation.sections.length, 4);
  assert.equal(presentation.sections[0].photos.length, 2);
  assert.deepEqual(presentation.sections[2].photos.map(photo => photo.eventType), ['networking', 'networking', 'networking']);
});

test('overlapping saved sections and bookends never repeat a photograph', () => {
  const delivery = { schemaVersion: 3, v3: { openingAssetId: 'photo-0', closingAssetId: 'photo-7' }, creativeDirection: { sections: [
    { id: 'scene', title: 'Arrivals', assetIds: ['photo-0', 'photo-1', 'photo-1', 'photo-2'] },
    { id: 'scene', title: 'The programme', assetIds: ['photo-2', 'photo-3', 'photo-7', 'missing'] }
  ] } };
  const presentation = eventCoveragePresentation(delivery, [...photos, photos[1]]);
  assert.deepEqual([...shown(presentation)].sort(), photos.map(eventPhotoKey).sort());
  assert.equal(presentation.galleryPhotos.length, 8);
  assert.equal(presentation.sections.at(-1).title, 'More from the event');
  assert.equal(new Set(presentation.sections.map(eventSceneAnchor)).size, presentation.sections.length);
});

test('gallery-only files stay out of the scenes while saved bookends remain visible', () => {
  const presentation = eventCoveragePresentation({ schemaVersion: 3, v3: { openingAssetId: 'photo-0', closingAssetId: 'photo-7' } }, photos.slice(1, 4), photos);
  assert.deepEqual([...shown(presentation)].sort(), ['photo-0', 'photo-1', 'photo-2', 'photo-3', 'photo-7']);
  assert.equal(presentation.galleryPhotos.length, 8);
});

test('the same opening and closing file appears only once in a one-photo delivery', () => {
  const presentation = eventCoveragePresentation({ schemaVersion: 3, v3: { openingAssetId: 'photo-0', closingAssetId: 'photo-0' } }, photos.slice(0, 1));
  assert.deepEqual(shown(presentation), ['photo-0']);
  assert.equal(presentation.closingPhoto, null);
  assert.equal(presentation.sections.length, 0);
});

test('fallback scenes preserve photograph order without inventing event details', () => {
  const presentation = eventCoveragePresentation({}, photos);
  assert.deepEqual(shown(presentation), photos.map(eventPhotoKey));
  assert.ok(presentation.sections.every(section => /^Scene \d+$/.test(section.title) && section.copy === ''));
});

test('empty deliveries have no demonstration photographs or empty scenes', () => {
  const presentation = eventCoveragePresentation({}, []);
  assert.deepEqual(shown(presentation), []);
  assert.equal(presentation.sections.length, 0);
  assert.equal(presentation.galleryPhotos.length, 0);
});
