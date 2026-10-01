import assert from 'node:assert/strict';
import test from 'node:test';
import Delivery from '../src/models/Delivery.js';
import { v3Showcase, v3Caption } from '../src/controllers/deliveryV3.controller.js';
import { directV3, regenerateV3Caption, regenerateV3EditorialBlock } from '../src/services/deliveryV3AI.service.js';
import { EDITORIAL_LIMITS, editorialSchema, validEditorialOrder, editorialExcerptMatches, scopedEditorial } from '../src/constants/editorial.js';
import { EDITORIAL_LIMITS as clientLimits, reconcileEditorial } from '../../client/src/utils/editorial.js';
import { editorialDraftIssues } from '../src/services/editorialDirection.service.js';

const ids = Array.from({ length: 5 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`);
const body = 'Ada chose an emerald suit and an ivory telephone for her thirtieth birthday portraits. The feature follows that look from a full-length portrait to the closer photographs, with the same two details connecting the collection.';
const frames = ids.map((assetId, index) => ({ assetId, headline: ['Thirty, in green', 'The ivory telephone', 'The full look', 'A closer portrait', 'The final portrait'][index], caption: `The emerald suit appears in the ${['opening', 'closer', 'full-length', 'side-facing', 'final'][index]} portrait. Ada chose this look for her thirtieth birthday photographs, alongside an ivory telephone that gives the session its playful detail.`, imageFit: 'contain', focalPoint: '50% 50%' }));
const editorial = { version: 1, introduction: '', note: '', issue: '', treatment: 'classic', credits: [], sections: [{ id: 'green-suit', title: 'Thirty, in green', body, pullLine: 'Ada chose an emerald suit', layout: 'feature', assetIds: ids }] };
const draft = () => ({ _id: '507f1f77bcf86cd799439099', userId: 'studio-user', schemaVersion: 3, kind: 'showcase', format: 'editorial', status: 'review', clientName: 'Ada', brief: 'Ada’s 30th birthday portraits in an emerald suit with an ivory telephone.', shootType: 'Birthday portraits', assets: ids.map(assetId => ({ assetId })), curatedAssetIds: ids, collectionAnalysis: { images: ids.map(assetId => ({ assetId, score: 8, summary: 'Portrait in a green suit holding an ivory telephone.' })) }, creativeDirection: { title: 'Thirty, in green', openingLine: 'Ada at thirty, in an emerald suit.', closingLine: 'The full birthday collection is ready.', frames, editorial }, v3: { revision: 2, approvedRevision: 2 }, markModified() {}, async save() { this.saved = true; } });
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const payload = () => ({ assetIds: ids, title: 'Thirty, in green', openingLine: 'Ada’s emerald suit and ivory telephone set the tone for her thirtieth birthday feature. '.repeat(2), closingLine: 'Ada, your birthday photographs are ready. The full collection is here to enjoy.', openingAssetId: ids[0], closingAssetId: ids[4], frames: structuredClone(frames), editorial: structuredClone(editorial) });

function model(t, replies, calls = []) {
  const key = process.env.ALIBABA_MODEL_STUDIO_API_KEY, base = process.env.ALIBABA_BASE_URL;
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key'; process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  t.after(() => { if (key === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY; else process.env.ALIBABA_MODEL_STUDIO_API_KEY = key; if (base === undefined) delete process.env.ALIBABA_BASE_URL; else process.env.ALIBABA_BASE_URL = base; });
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls.push(JSON.parse(options.body)); const value = replies.shift(); assert.ok(value, 'Unexpected model call'); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }; });
}

test('client and server use identical Editorial limits', () => assert.deepEqual(clientLimits, EDITORIAL_LIMITS));
test('malformed model drafts request repair instead of crashing the writing service', () => {
  for (const value of [null, [], 'draft', { frames: [null] }, { sections: [null] }, { frames: [], sections: [] }]) assert.ok(editorialDraftIssues(value, ids).length);
});
test('section validation rejects missing, duplicate and foreign photographs and invented pull lines', () => {
  assert.equal(editorialSchema.safeParse(editorial).success, true);
  assert.equal(validEditorialOrder(editorial, ids), true);
  for (const assetIds of [ids.slice(1), [...ids, ids[0]], [ids[1], ids[0], ...ids.slice(2)]]) assert.equal(validEditorialOrder({ sections: [{ assetIds }] }, ids), false);
  assert.equal(editorialExcerptMatches(editorial.sections[0], frames), true);
  assert.equal(editorialExcerptMatches({ ...editorial.sections[0], pullLine: 'Ada said she always dreamed of this.' }, frames), false);
  assert.equal(editorialSchema.safeParse({ ...editorial, arbitraryHtml: '<script />' }).success, false);
});
test('reordering and replacement keep section text while accounting for every photo', () => {
  const source = { ...editorial, sections: [{ ...editorial.sections[0], assetIds: ids.slice(0, 2) }, { ...editorial.sections[0], id: 'next', title: 'Another angle', assetIds: ids.slice(2) }] };
  const changed = [ids[1], ids[2], ids[0], ids[4], 'replacement'];
  const result = reconcileEditorial(source, changed, frames);
  assert.deepEqual(result.sections.flatMap(section => section.assetIds), changed);
  assert.equal(result.sections[0].body, body);
  assert.equal(result.sections[1].title, 'Another angle');
  assert.equal(new Set(result.sections.flatMap(section => section.assetIds)).size, changed.length);
});
test('Editorial saves longer text, layouts, credits and framing and invalidates prior approval', async t => {
  const delivery = draft(); const requestBody = payload(); requestBody.frames[0].caption = 'An emerald suit and ivory telephone give Ada’s thirtieth birthday portraits a clear visual thread. The full-length photograph makes room for the look, while the closer portrait keeps those same details in view.';
  requestBody.frames[0].imageFit = 'cover'; requestBody.frames[0].focalPoint = '50% 20%'; requestBody.editorial.credits = [{ role: 'Photography', name: 'Apex Imagery' }];
  let filter; t.mock.method(Delivery, 'findOne', value => { filter = value; return Promise.resolve(delivery); });
  const res = response(); await v3Showcase({ body: requestBody, params: { id: delivery._id }, user: { id: delivery.userId } }, res);
  assert.equal(res.statusCode, 200); assert.equal(delivery.saved, true); assert.equal(delivery.creativeDirection.editorial.sections[0].body, body); assert.equal(delivery.creativeDirection.editorial.credits[0].name, 'Apex Imagery'); assert.equal(delivery.creativeDirection.frames[0].imageFit, 'cover'); assert.equal(delivery.creativeDirection.frames[0].focalPoint, '50% 20%'); assert.equal(delivery.v3.approvedRevision, null); assert.deepEqual(filter, { _id: delivery._id, userId: delivery.userId, schemaVersion: 3 });
});
test('non Editorial limits and fields remain protected', async t => {
  const delivery = { ...draft(), format: 'photo-reveal' }; t.mock.method(Delivery, 'findOne', () => Promise.resolve(delivery));
  const res = response(); await v3Showcase({ body: payload(), params: { id: delivery._id }, user: { id: delivery.userId } }, res); assert.equal(res.statusCode, 400); assert.equal(delivery.saved, undefined);
});
test('older clients preserve studio writing and framing when saving a reordered showcase', async t => {
  const delivery = draft(); delivery.creativeDirection = structuredClone(delivery.creativeDirection);
  delivery.creativeDirection.editorial.note = 'Thank you for spending your birthday session with our studio.';
  delivery.creativeDirection.editorial.credits = [{ role: 'Photography', name: 'Apex Imagery' }];
  delivery.creativeDirection.frames[0].imageFit = 'cover';
  delivery.creativeDirection.frames[0].focalPoint = '50% 20%';
  const input = payload(); delete input.editorial;
  input.frames = input.frames.map(({ imageFit, focalPoint, ...frame }) => frame);
  input.assetIds = [...ids].reverse();
  t.mock.method(Delivery, 'findOne', () => Promise.resolve(delivery));
  const res = response(); await v3Showcase({ body: input, params: { id: delivery._id }, user: { id: delivery.userId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(delivery.creativeDirection.editorial.note, 'Thank you for spending your birthday session with our studio.');
  assert.equal(delivery.creativeDirection.editorial.credits[0].name, 'Apex Imagery');
  assert.equal(delivery.creativeDirection.editorial.sections[0].body, body);
  assert.deepEqual(delivery.creativeDirection.editorial.sections.flatMap(section => section.assetIds), input.assetIds);
  assert.equal(delivery.creativeDirection.frames.at(-1).imageFit, 'cover');
  assert.equal(delivery.creativeDirection.frames.at(-1).focalPoint, '50% 20%');
});
test('restricted share links remove hidden photo IDs from magazine sections without mutating the saved article', () => {
  const original = structuredClone(editorial);
  const source = { ...original, sections: [...original.sections, { ...original.sections[0], id: 'hidden', assetIds: [ids[4]] }] };
  const result = scopedEditorial(source, new Set(ids.slice(0, 2)));
  assert.equal(result.sections.length, 1);
  assert.deepEqual(result.sections[0].assetIds, ids.slice(0, 2));
  assert.deepEqual(original, editorial);
  assert.equal(source.sections[0].assetIds.length, 5);
});
test('invalid section membership, excerpts and framing never save', async t => {
  const delivery = draft(); t.mock.method(Delivery, 'findOne', () => Promise.resolve(delivery));
  for (const change of [input => { input.editorial.sections[0].assetIds.reverse(); }, input => { input.editorial.sections[0].pullLine = 'An invented statement.'; }, input => { input.frames[0].focalPoint = '120% 50%'; }, input => { input.editorial.sections[0].body = 'x'.repeat(701); }]) {
    const input = payload(); change(input); const res = response(); await v3Showcase({ body: input, params: { id: delivery._id }, user: { id: delivery.userId } }, res); assert.equal(res.statusCode, 400); assert.equal(delivery.saved, undefined);
  }
});
test('unowned drafts cannot be changed', async t => {
  t.mock.method(Delivery, 'findOne', () => Promise.resolve(null)); const res = response(); await v3Showcase({ body: payload(), params: { id: draft()._id }, user: { id: 'other-user' } }, res); assert.equal(res.statusCode, 409);
});
test('Fashion Editorial retains relevant visual detail and third-person writing', async t => {
  const delivery = draft(); delivery.shootType = 'Fashion';
  const narrative = { title: 'Thirty, in green', openingLine: 'An emerald suit and ivory telephone for Ada’s thirtieth birthday portraits.', closingLine: 'Ada, the full birthday collection is ready.', introduction: '', frames: frames.map((frame, index) => ({ ...frame, caption: `Ada wears her emerald suit in this ${['opening', 'closer', 'full-length', 'side-facing', 'final'][index]} portrait, with the ivory telephone appearing alongside it in the birthday feature.` })), sections: editorial.sections };
  const calls = []; model(t, [narrative, { palette: { background: '#ffffff', surface: '#f5f3ef', text: '#17130f', accent: '#883e32' } }, { headline: 'The emerald suit', caption: 'Ada wears her emerald suit beside the ivory telephone in this closer birthday portrait.' }], calls);
  const result = await directV3(delivery, delivery.collectionAnalysis.images); assert.equal(result.direction.frames[0].caption, narrative.frames[0].caption); assert.equal(result.direction.editorial.sections[0].body, body);
  const rewritten = await regenerateV3Caption(delivery, delivery.collectionAnalysis.images[0]); assert.match(rewritten.caption, /Ada wears/); assert.match(calls[0].messages[0].content, /Third-person editorial writing is allowed/); assert.match(calls[0].messages[1].content[0].text, /holding an ivory telephone/);
});
test('invalid provider wording is repaired without clipping text or filling the publication with fallback wishes', async t => {
  const delivery = draft(); delivery.shootType = 'Fashion'; const valid = { title: 'Thirty, in green', openingLine: 'Ada at thirty in an emerald suit.', closingLine: 'Your birthday collection is ready.', frames, sections: editorial.sections };
  model(t, [{ ...valid, openingLine: 'x'.repeat(301) }, valid, { palette: {} }]); const result = await directV3(delivery, delivery.collectionAnalysis.images); assert.equal(result.direction.openingLine, valid.openingLine);
});
test('section regeneration uses only owned photographs and leaves saved text unchanged', async t => {
  const delivery = draft(); t.mock.method(Delivery, 'findOne', () => Promise.resolve(delivery)); model(t, [{ text: body }]);
  const res = response(); await v3Caption({ params: { id: delivery._id, assetId: ids[0] }, user: { id: delivery.userId }, body: { editorialBlock: 'section', sectionAssetIds: ids, previousText: 'My existing paragraph.' } }, res); assert.equal(res.statusCode, 200); assert.equal(res.body.data.text, body); assert.equal(delivery.saved, undefined);
  const bad = response(); await v3Caption({ params: { id: delivery._id, assetId: ids[0] }, user: { id: delivery.userId }, body: { editorialBlock: 'section', sectionAssetIds: ['99999999-9999-4999-8999-999999999999'] } }, bad); assert.equal(bad.statusCode, 400);
});
test('unrepairable Editorial suggestions fail safely and preserve the current draft', async t => {
  model(t, [{ text: 'x'.repeat(701) }, { text: 'x'.repeat(701) }]); const delivery = draft(); await assert.rejects(regenerateV3EditorialBlock(delivery, delivery.collectionAnalysis.images, 'section', body), error => error.code === 'V3_EDITORIAL_WRITING_INCOMPLETE'); assert.equal(delivery.creativeDirection.editorial.sections[0].body, body);
});
