import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryGatePalette } from '../src/utils/deliveryGatePalette.js';

const palette = { background: '#f7efe4', surface: '#ffffff', text: '#211b18', accent: '#852f46' };

test('locked showcase exposes only its four valid palette colours', () => {
  assert.deepEqual(deliveryGatePalette({
    creativeDirection: { palette: { ...palette, imageUrl: 'private-photo' }, frames: [{ caption: 'Private caption' }] },
    assets: [{ url: 'private-photo' }], access: { pinHash: 'private-hash' }
  }), palette);
});

test('GridBoard gate uses its own palette instead of showcase colours', () => {
  assert.deepEqual(deliveryGatePalette({ kind: 'pinboard', pinboard: { palette }, creativeDirection: { palette: { background: '#000000' } } }), palette);
});

test('legacy theme colour names work without returning arbitrary CSS or objects', () => {
  assert.deepEqual(deliveryGatePalette({ theme: { backgroundColor: '#ABCDEF', textColor: '#123456', surface: { url: 'private' }, accent: 'url(https://example.com)' } }), { background: '#ABCDEF', text: '#123456' });
  assert.deepEqual(deliveryGatePalette(null), {});
});
