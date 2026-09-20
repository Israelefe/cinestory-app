import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captionSegments, timedSegments } from '../src/services/narration.service.js';
import { deliverySoundtrack, recommendSoundtracks } from '../src/constants/deliverySoundtracks.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = file => readFile(resolve(root, file), 'utf8');
const narration = await read('src/services/narration.service.js');
const director = await read('src/services/alibabaCreativeDirector.service.js');
const legacyPhotoStory = await read('src/services/photoStoryAi.service.js');
const legacyStoryController = await read('src/controllers/story.controller.js');
const volumeRoutes = await read('src/routes/volume.routes.js');
const volumeController = await read('src/controllers/volume.controller.js');
const storageModel = await read('src/models/StorageAsset.js');
const deliveryController = await read('src/controllers/delivery.controller.js');
const entitlement = await read('src/services/entitlement.service.js');

const delivery = {
  clientName: 'Amaka',
  shootType: '30th birthday portraits',
  creativeDirection: {
    sections: [{ id: 'opening', title: 'A new decade' }],
    frames: [
      { assetId: 'asset-1', sectionId: 'opening', caption: 'Amaka, the confidence you brought into this new decade is here to keep.' },
      { assetId: 'asset-2', sectionId: 'opening', caption: 'This birthday holds the quiet joy of becoming even more yourself.' }
    ]
  }
};
const segments = captionSegments(delivery);
assert.equal(segments.length, 2, 'Every approved frame must become a narration segment');
assert.deepEqual(segments.map(segment => segment.assetIds[0]), ['asset-1', 'asset-2'], 'Narration segments must keep photograph order');
assert.ok(segments.every(segment => segment.text.length >= 8), 'Narration must use the approved caption text');
assert.throws(() => captionSegments({ ...delivery, creativeDirection: { ...delivery.creativeDirection, frames: [{ ...delivery.creativeDirection.frames[0], caption: '' }] } }), /approved caption/, 'Narration must reject missing captions');
const measured = timedSegments(segments, [
  { word: 'Amaka,', start: 0.11, end: 0.42 }, { word: 'the', start: 0.45, end: 0.58 }, { word: 'confidence', start: 0.6, end: 1.12 },
  { word: 'you', start: 1.2, end: 1.34 }, { word: 'brought', start: 1.36, end: 1.7 }, { word: 'into', start: 1.72, end: 1.9 }, { word: 'this', start: 1.92, end: 2.05 },
  { word: 'new', start: 2.07, end: 2.21 }, { word: 'decade', start: 2.23, end: 2.6 }, { word: 'is', start: 2.8, end: 2.9 }, { word: 'here', start: 2.92, end: 3.1 }, { word: 'to', start: 3.12, end: 3.22 },
  { word: 'keep', start: 3.24, end: 3.45 }, { word: 'This', start: 3.8, end: 3.95 }, { word: 'birthday', start: 3.97, end: 4.3 }, { word: 'holds', start: 4.32, end: 4.58 },
  { word: 'the', start: 4.6, end: 4.72 }, { word: 'quiet', start: 4.74, end: 4.98 }, { word: 'joy', start: 5, end: 5.2 }, { word: 'of', start: 5.22, end: 5.3 }, { word: 'becoming', start: 5.32, end: 5.7 },
  { word: 'even', start: 5.72, end: 5.9 }, { word: 'more', start: 5.92, end: 6.11 }, { word: 'yourself', start: 6.13, end: 6.5 }
]);
assert.equal(measured[0].startSec, 0.11, 'Narration must use measured segment start');
assert.equal(measured[0].endSec, 3.45, 'Narration must use measured segment end');
assert.throws(() => timedSegments(segments, [{ word: 'unrelated', start: 0, end: 1 }]), /aligned/, 'Narration must fail when captions cannot be aligned');
assert.match(narration, /flux-hannah-en/, 'Deepgram Flux Hannah must be the configured narrator');
assert.match(narration, /captionsRead: true/, 'Narration metadata must state that approved captions were read');
assert.match(narration, /transcribeWordTimings/, 'Narration must measure generated audio word timings');
assert.match(narration, /timedSegments/, 'Narration must align approved captions to measured timings');
assert.match(narration, /splitNarration/, 'Narration must split long deliveries into bounded synthesis requests');
assert.match(narration, /audioBuffers/, 'Narration must combine bounded audio chunks into one delivery track');
assert.doesNotMatch(narration, /function segmentTimings/, 'Narration must not estimate timings from word counts');
assert.doesNotMatch(narration, /createNarrationScript/, 'Narration must not generate a second script');
assert.match(director, /Every photograph must have a meaningful caption/, 'Creative direction must require captions');
assert.match(director, /captionFormatRules/, 'Creative direction must have format-specific caption rules');
assert.match(director, /approvedSoundtrackCatalogue:[\s\S]*sourcePageUrl/, 'Creative direction must expose the verified soundtrack source record to the AI');
assert.doesNotMatch(director, /fallbackCaption/, 'Creative direction must never silently fabricate captions');
assert.match(legacyPhotoStory, /PHOTO_STORY_CAPTIONS_UNAVAILABLE/, 'Legacy Photo Story caption generation must fail clearly when AI output is unusable');
assert.doesNotMatch(legacyPhotoStory, /Fallback Engine|fallbackPhotos|occasionMoments/, 'Legacy Photo Story must not silently replace failed AI captions with templates');
assert.match(legacyPhotoStory, /slides\.length === photoCount/, 'Legacy Photo Story must receive one AI slide per photograph');
assert.match(legacyStoryController, /caption: z\.string\(\)\.trim\(\)\.min\(18\)/, 'Legacy Photo Story publishing must require a meaningful caption for every photograph');
assert.match(deliveryController, /caption: z\.string\(\)\.trim\(\)\.min\(18\)/, 'Review API must reject short or empty captions');
assert.match(deliveryController, /narration: z\.boolean\(\)\.default\(true\)/, 'Publishing must keep narration enabled by default');
assert.match(deliveryController, /old audio unsafe to reuse/, 'Review edits must invalidate stale narration');
assert.match(entitlement, /\['pro',\s*'studio'\]\.includes\(user\?\.plan\)/, 'Paid Pro users must receive studio branding entitlements');
assert.match(deliveryController, /object\.branding = studioBrand/, 'Public deliveries must send their resolved studio brand');
for (const route of ['/auto-assign', '/export.csv', '/archive', 'subjects/:subjectId']) assert.match(volumeRoutes, new RegExp(route.replace('.', '\\.'), 'i'), `Missing volume route: ${route}`);
assert.match(volumeController, /ClientGallery|caption: asset\.caption/, 'Recipient gallery payload must carry approved captions');
assert.match(volumeController, /downloadUrl: signedImageUrl/, 'Recipient gallery payload must carry the protected download URL');
assert.match(volumeController, /select\('\+email'\)/, 'Studio recipient editing must receive the saved email address');
assert.match(volumeController, /shareUrl:/, 'Published volume jobs must return a dependable share link');
assert.match(storageModel, /caption: \{ type: String/, 'Stored photographs must have a caption field for recipient galleries');
for (const [brief, category] of [['traditional wedding vows couple', 'wedding'], ['church thanksgiving service', 'faith'], ['conference brand campaign', 'corporate'], ['30th birthday cake celebration', 'birthday'], ['quiet biography graduation', 'cinematic']]) {
  const choice = recommendSoundtracks(brief, 1)[0];
  assert.equal(choice.category, category, `Music matching must select the right category for ${brief}`);
  assert.ok(choice.storyFunction && choice.mood && choice.genre && choice.narrationFit && choice.selectionNote && choice.metadataConfidence, `Music metadata is incomplete for ${choice.id}`);
}
const replacement = deliverySoundtrack('pixabay_604061');
assert.equal(replacement.source, 'pixabay', 'Photographer replacement choice must resolve to a verified Pixabay track');
assert.ok(replacement.sourcePageUrl && replacement.licenseUrl && replacement.sha256, 'Replacement track must retain source, licence, and hash metadata');
console.log('Delivery V2 server contract verified: captions, Deepgram Flux Hannah, narration alignment inputs, and volume controls.');
