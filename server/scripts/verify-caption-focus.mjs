import assert from 'node:assert/strict';
import { captionDescribesVisiblePhoto, photoStoryBirthdayFallbackCaption } from '../src/services/alibabaCreativeDirector.service.js';

assert.equal(captionDescribesVisiblePhoto("Ada's 30th birthday portraits mark this milestone."), false);
assert.equal(captionDescribesVisiblePhoto('Ada smiles in a gold dress against the studio backdrop.'), true);
assert.equal(captionDescribesVisiblePhoto("The photographer captured Ada's birthday portrait in soft light."), true);
assert.equal(photoStoryBirthdayFallbackCaption({ clientName: 'Ada', shootType: 'Birthday', brief: 'Ada 30th Birthday Shoot' }, 0), "Ada's 30th birthday is the reason for this shoot.");
assert.equal(photoStoryBirthdayFallbackCaption({ clientName: 'Ada', shootType: 'Birthday', brief: 'Ada is turning 30.' }, 1), "This shoot marks Ada's 30th birthday.");

console.log('Photo Story validation accepts occasion-focused portrait captions, rejects visible-photo descriptions, and can repair a birthday line from the brief.');
