import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSlotUploads } from '../src/ui/slot-uploads.mjs';
const request = (id, kind = 'video') => ({ id, kind, use: 'context' });
const flowFile = { name: 'Studio_owner_planning_video_clip_20261013021253.mp4', type: 'video/mp4' };

test('a Google Flow filename matches the sole empty video slot without renaming', () => {
  const matches = matchSlotUploads([flowFile], [request('studio-context'), request('backdrop', 'image')]);
  assert.equal(matches[0].request.id, 'studio-context'); assert.equal(matches[0].file.name, flowFile.name);
});
test('direct scene upload accepts any filename and can replace that scene only', () => {
  const requests = [request('first'), request('second')], slots = { second: { assetId: 'existing' } };
  assert.equal(matchSlotUploads([flowFile], requests, slots, 'second')[0].request.id, 'second');
  assert.throws(() => matchSlotUploads([flowFile], [request('first', 'image')], {}, 'first'), /needs an image/);
  assert.throws(() => matchSlotUploads([flowFile], requests, {}, 'removed'), /no longer available/);
});
test('bulk uploads reserve named slots first and avoid ambiguous assignments or accidental replacements', () => {
  const requests = [request('first'), request('second')];
  const matches = matchSlotUploads([flowFile, { name: 'first.mp4' }], requests);
  assert.deepEqual(matches.map(match => match.request.id), ['second', 'first']);
  assert.throws(() => matchSlotUploads([flowFile], requests), /on the scene/);
  assert.throws(() => matchSlotUploads([flowFile], [request('first')], { first: { assetId: 'existing' } }), /on the scene/);
  assert.throws(() => matchSlotUploads([flowFile, { name: 'other.mp4' }], [request('first')]), /on the scene/);
});
