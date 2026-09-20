import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captionSegments } from '../src/services/narration.service.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = file => readFile(resolve(root, file), 'utf8');
const narration = await read('src/services/narration.service.js');
const director = await read('src/services/alibabaCreativeDirector.service.js');
const volumeRoutes = await read('src/routes/volume.routes.js');
const deliveryController = await read('src/controllers/delivery.controller.js');

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
assert.match(narration, /flux-hannah-en/, 'Deepgram Flux Hannah must be the configured narrator');
assert.match(narration, /captionsRead: true/, 'Narration metadata must state that approved captions were read');
assert.doesNotMatch(narration, /createNarrationScript/, 'Narration must not generate a second script');
assert.match(director, /Every photograph must have a meaningful caption/, 'Creative direction must require captions');
assert.match(deliveryController, /caption: z\.string\(\)\.trim\(\)\.min\(8\)/, 'Review API must reject empty captions');
for (const route of ['/auto-assign', '/export.csv', '/archive', 'subjects/:subjectId']) assert.match(volumeRoutes, new RegExp(route.replace('.', '\\.'), 'i'), `Missing volume route: ${route}`);
console.log('Delivery V2 server contract verified: captions, Deepgram Flux Hannah, narration alignment inputs, and volume controls.');
