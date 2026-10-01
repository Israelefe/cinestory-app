import assert from 'node:assert/strict';
import test from 'node:test';
import Delivery from '../src/models/Delivery.js';
import { v3Theme } from '../src/controllers/deliveryV3.controller.js';
import { revealSchema } from '../src/constants/photoReveal.js';
import { PHOTO_REVEAL_DEMO } from '../../client/src/constants/photoRevealDemo.js';
import { revealEndingPhotos, revealSettings, revealTheme } from '../../client/src/utils/photoReveal.js';
import { contrastRatio, validShowcase } from '../src/constants/deliveryV3.js';

const palette = { background: '#080b10', surface: '#121820', text: '#f5efe7', accent: '#d8b895' };
const typography = { display: 'Playfair Display', body: 'Outfit' };
const reveal = { style: 'lift', movement: false, ending: 'single' };
test('demo follows creation bounds and closes with three distinct delivery photographs', () => {
  const ids = PHOTO_REVEAL_DEMO.curatedAssetIds;
  assert.ok(validShowcase('photo-reveal', ids, new Set(PHOTO_REVEAL_DEMO.assets.map(photo => photo.assetId))));
  const closing = PHOTO_REVEAL_DEMO.assets.at(-1);
  const ending = revealEndingPhotos(PHOTO_REVEAL_DEMO.assets, closing);
  assert.equal(ending.length, 3); assert.equal(ending[1], closing);
  assert.equal(new Set(ending.map(photo => photo.assetId)).size, 3);
  assert.deepEqual(revealEndingPhotos(PHOTO_REVEAL_DEMO.assets, closing, 'single'), [closing]);
});
test('legacy settings fall back safely and light palettes keep text and accents readable', () => {
  assert.deepEqual(revealSettings({}), { style: 'curtain', movement: true, ending: 'triptych' });
  for (const background of ['#ffffff', '#070709']) {
    const theme = revealTheme({ creativeDirection: { palette: { background, surface: background, text: background, accent: background } } });
    assert.ok(contrastRatio(background, theme['--rv-ink']) >= 4.5);
    assert.ok(contrastRatio(background, theme['--rv-accent']) >= 4.5);
  }
});
test('reveal settings reject unknown values, fields and invalid boolean types', () => {
  assert.ok(revealSchema.safeParse(reveal).success);
  for (const value of [{ ...reveal, style: 'spin' }, { ...reveal, movement: 'false' }, { ...reveal, ending: 'random' }, { ...reveal, html: '<script>' }]) assert.equal(revealSchema.safeParse(value).success, false);
});
async function themeRequest(document, input) {
  const original = Delivery.findOne;
  let query;
  Delivery.findOne = conditions => { query = conditions; return Promise.resolve(document); };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try { await v3Theme({ params: { id: '507f1f77bcf86cd799439099' }, user: { id: 'owner' }, body: input }, res); }
  finally { Delivery.findOne = original; }
  return { res, query };
}
function draft(format = 'photo-reveal') { return { format, status: 'review', creativeDirection: { title: 'Your portraits', reveal: { style: 'curtain', movement: true, ending: 'triptych' } }, v3: { revision: 1 }, markModified() {}, async save() { this.saved = true; } }; }
test('owned draft saves Reveal settings and invalidates design approval', async () => {
  const document = draft(), { res, query } = await themeRequest(document, { palette, typography, reveal });
  assert.equal(res.statusCode, 200); assert.equal(query.userId, 'owner'); assert.equal(query.schemaVersion, 3);
  assert.deepEqual(document.creativeDirection.reveal, reveal); assert.equal(document.v3.revision, 2); assert.equal(document.saved, true);
});
test('legacy theme requests preserve saved Reveal settings', async () => {
  const document = draft(), before = document.creativeDirection.reveal;
  const { res } = await themeRequest(document, { palette, typography });
  assert.equal(res.statusCode, 200); assert.deepEqual(document.creativeDirection.reveal, before);
});
test('Reveal settings cannot modify another format, published delivery or unowned delivery', async () => {
  for (const document of [draft('editorial'), { ...draft(), status: 'published' }, null]) {
    const { res } = await themeRequest(document, { palette, typography, reveal });
    assert.ok(res.statusCode >= 400); assert.ok(!document?.saved);
  }
});
