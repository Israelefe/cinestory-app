import assert from 'node:assert/strict';
import test from 'node:test';
import { orderWritingFrames, unsupportedWritingAddress } from '../src/utils/deliveryWritingIdentity.js';
import { showcaseBookends, variedShowcaseCandidates } from '../src/utils/showcaseSelection.js';
import { editorialDraftIssues, writeEditorialDirection, rewriteEditorialCaption } from '../src/services/editorialDirection.service.js';
import { groupV3Sections, directV3, v3FrameWritingIssues } from '../src/services/deliveryV3AI.service.js';
import { shootWritingIssues } from '../src/constants/deliveryWriting.js';
import { DELIVERY_WRITING_VERSION } from '../src/constants/deliveryWritingLimits.js';

const delivery = { format: 'chapters', shootType: 'Birthday', clientName: 'Ada', brief: "Ada's birthday portraits." };
const ids = Array.from({ length: 8 }, (_, index) => `photo-${index}`);
const captions = ['Ada, this birthday is yours to mark in your own way.', 'Your birthday portraits are here to keep.', 'Take this birthday at your own pace, Ada.', 'Ada, may this year leave you time for what matters.', 'Keep a record of this birthday for yourself.', 'Ada, enjoy your birthday on your own terms.', 'These portraits mark your birthday, Ada.', 'May your birthday give you a reason to pause, Ada.'];
const headlines = ['Your birthday portraits', 'A birthday to keep', 'Your own birthday pace', 'Time for your priorities', 'A record for Ada', 'On your birthday terms', 'Marking your birthday', 'A pause for Ada'];
const frames = ids.map((assetId, index) => ({ assetId, headline: headlines[index], caption: captions[index] }));
const rows = ids.map(assetId => ({ assetId, score: 8, summary: 'A studio portrait.', momentTags: ['portraits'] }));

function model(t, handler) {
  const previous = { key: process.env.ALIBABA_MODEL_STUDIO_API_KEY, base: process.env.ALIBABA_BASE_URL };
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'offline-test';
  process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  t.after(() => {
    if (previous.key === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY; else process.env.ALIBABA_MODEL_STUDIO_API_KEY = previous.key;
    if (previous.base === undefined) delete process.env.ALIBABA_BASE_URL; else process.env.ALIBABA_BASE_URL = previous.base;
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => Response.json({ choices: [{ message: { content: JSON.stringify(await handler(JSON.parse(options.body))) } }] }));
}

test('missing, duplicate and foreign photo IDs never borrow another photo’s words', () => {
  const result = orderWritingFrames([{ assetId: 'b', headline: 'B only', caption: 'Caption for B.' }, { assetId: 'foreign', caption: 'Wrong photograph.' }], ['a', 'b']);
  assert.deepEqual(result[0], { assetId: 'a' });
  assert.equal(result[1].caption, 'Caption for B.');
  assert.deepEqual(orderWritingFrames([{ assetId: 'a', caption: 'One.' }, { assetId: 'a', caption: 'Two.' }], ['a']), [{ assetId: 'a' }]);
});

test('ordinary editorial and group subjects are accepted while invented names are rejected', () => {
  assert.equal(unsupportedWritingAddress('Portraits are part of the birthday collection. This is for Ada. Registration is shown separately.', delivery), false);
  assert.equal(unsupportedWritingAddress('Lora wears a jacket.', delivery), true);
  assert.equal(unsupportedWritingAddress("Lora's birthday portraits.", delivery), true);
});

test('Chapters keeps personal purpose central and Canvas checks each photo’s own facts', () => {
  assert.ok(shootWritingIssues('Ada sits holding a telephone.', delivery, { caption: true, observation: 'A seated portrait with a telephone.' }).some(issue => /purpose/.test(issue)));
  const canvas = { ...delivery, format: 'canvas', shootType: 'Fashion', brief: 'A jacket lookbook.' };
  const frame = { assetId: 'a', headline: 'The jacket detail', caption: 'A jacket with pearl earrings.' };
  assert.ok(v3FrameWritingIssues(frame, 'canvas', canvas, [{ assetId: 'a', summary: 'A jacket on a hanger.' }, { assetId: 'b', summary: 'A model with pearl earrings.' }]).some(issue => /unsupported photo detail/.test(issue)));
  assert.deepEqual(v3FrameWritingIssues(frame, 'canvas', canvas, [{ assetId: 'a', summary: 'A jacket and pearl earrings.' }]), []);
});

test('Editorial recovers malformed group order while preserving every checked photo caption', async () => {
  const editorial = { ...delivery, format: 'editorial' };
  const draft = { title: "Ada's birthday portraits", openingLine: 'A birthday portrait feature for Ada.', closingLine: 'Your complete birthday collection follows.', introduction: '', frames, sections: [{ title: 'Invalid group', body: 'An unsupported scene.', assetIds: ['foreign'] }] };
  const checkpoints = [];
  let calls = 0;
  const result = await writeEditorialDirection(async () => { calls++; return structuredClone(draft); }, editorial, rows, ids, text => unsupportedWritingAddress(text, editorial), { checkpoint: async draft => checkpoints.push(structuredClone(draft)) });
  assert.equal(calls, 3);
  assert.deepEqual(result.frames.map(frame => frame.caption), captions);
  assert.deepEqual(result.sections.flatMap(section => section.assetIds), ids);
  assert.deepEqual(editorialDraftIssues({ ...result, introduction: result.editorial.introduction }, ids, text => unsupportedWritingAddress(text, editorial), editorial, rows), []);
  assert.ok(checkpoints.length > 3);
});

test('Editorial repairs a saved photo when its combined headline and caption fail the purpose check', async () => {
  const editorial = { ...delivery, format: 'editorial' };
  const observations = rows.map(row => ({ ...row, summary: 'An emerald suit and an ivory telephone in a studio portrait.' }));
  const rejected = { assetId: ids[0], headline: 'The emerald suit', caption: 'An ivory telephone appears in this birthday portrait.' };
  // Saved wording from the old rules must now be rejected and repaired.
  assert.ok(shootWritingIssues(rejected.caption, editorial, { caption: true, observation: observations[0].summary }).length);
  assert.ok(shootWritingIssues(rejected.headline + '. ' + rejected.caption, editorial, { caption: true, observation: observations[0].summary }).some(issue => /purpose/.test(issue)));
  const draft = { title: "Ada's birthday portraits", openingLine: 'A birthday portrait feature for Ada.', closingLine: 'Your complete birthday collection follows.', introduction: '', frames: [rejected, ...frames.slice(1)], sections: [{ title: 'Birthday portraits for Ada', body: '', assetIds: ids }] };
  let photoRepairs = 0;
  const checkpoints = [];
  const result = await writeEditorialDirection(async system => {
    if (system.startsWith('Return JSON {"headline"')) { photoRepairs++; return frames[0]; }
    return structuredClone(draft);
  }, editorial, observations, ids, text => unsupportedWritingAddress(text, editorial), { resume: structuredClone(draft), checkpoint: async value => checkpoints.push(structuredClone(value)) });
  assert.equal(photoRepairs, 1);
  assert.deepEqual(result.frames.map(frame => frame.caption), captions);
  assert.deepEqual(editorialDraftIssues({ ...result, introduction: result.editorial.introduction }, ids, text => unsupportedWritingAddress(text, editorial), editorial, observations), []);
  assert.ok(checkpoints.some(value => value.frames[0].headline === frames[0].headline));
});

test('Editorial falls back safely when a headline invents details and repeated model repairs cannot fix it', async () => {
  const editorial = { ...delivery, format: 'editorial' };
  const rejected = { ...frames[0], headline: 'A silk jacket' };
  const draft = { title: "Ada's birthday portraits", openingLine: 'A birthday portrait feature for Ada.', closingLine: 'Your complete birthday collection follows.', introduction: '', frames: [rejected, ...frames.slice(1)], sections: [{ title: 'Birthday portraits for Ada', body: '', assetIds: ids }] };
  let photoRepairs = 0;
  const result = await writeEditorialDirection(async system => {
    if (system.startsWith('Return JSON {"headline"')) { photoRepairs++; return rejected; }
    return structuredClone(draft);
  }, editorial, rows, ids, text => unsupportedWritingAddress(text, editorial));
  assert.equal(photoRepairs, 2);
  assert.doesNotMatch(result.frames[0].headline, /silk|jacket/i);
  assert.deepEqual(result.frames.slice(1).map(frame => frame.caption), captions.slice(1));
  assert.deepEqual(editorialDraftIssues({ ...result, introduction: result.editorial.introduction }, ids, text => unsupportedWritingAddress(text, editorial), editorial, rows), []);
});

test('Editorial caption rewrites reject an unsupported headline and preserve approved writing', async () => {
  const editorial = { ...delivery, format: 'editorial', creativeDirection: { frames: structuredClone(frames) } };
  const before = structuredClone(editorial.creativeDirection);
  await assert.rejects(rewriteEditorialCaption(async () => ({ ...frames[0], headline: 'A silk jacket' }), editorial, rows[0], '', frames[0], text => unsupportedWritingAddress(text, editorial)), { code: 'V3_EDITORIAL_WRITING_INCOMPLETE' });
  assert.deepEqual(editorial.creativeDirection, before);
});

test('Editorial preparation resumes a rejected feature and finishes even when the model repeats its invalid photo wording', async t => {
  const editorial = { ...delivery, format: 'editorial' };
  const observations = rows.map(row => ({ ...row, summary: 'An emerald suit and an ivory telephone in a studio portrait.' }));
  const rejected = { assetId: ids[0], headline: 'The emerald suit', caption: 'An ivory telephone appears in this birthday portrait.' };
  const draft = { title: "Ada's birthday portraits", openingLine: 'A birthday portrait feature for Ada.', closingLine: 'Your complete birthday collection follows.', introduction: '', frames: [rejected, ...frames.slice(1)], sections: [{ title: 'Birthday portraits for Ada', body: '', assetIds: ids }] };
  let repairs = 0;
  model(t, call => {
    const system = call.messages[0].content;
    if (system.startsWith('Return JSON {"palette"')) return { palette: {} };
    if (system.startsWith('Return JSON {"headline"')) { repairs++; return rejected; }
    return structuredClone(draft);
  });
  const resume = { selected: ids, writingVersion: DELIVERY_WRITING_VERSION, editorialDraft: draft };
  const before = structuredClone(resume);
  const result = await directV3(editorial, observations, { resume });
  assert.equal(repairs, 2);
  assert.deepEqual(result.selected, ids);
  assert.deepEqual(result.direction.sections.flatMap(section => section.assetIds), ids);
  assert.deepEqual(result.direction.frames.slice(1).map(frame => frame.caption), captions.slice(1));
  assert.deepEqual(editorialDraftIssues({ ...result.direction, introduction: result.direction.editorial.introduction }, ids, text => unsupportedWritingAddress(text, editorial), editorial, observations), []);
  assert.deepEqual(resume, before);
});

for (const format of ['event-coverage', 'campaign']) test(`${format} recovers rejected group wording without losing membership or accepting invented details`, async t => {
  model(t, call => call.messages[0].content.startsWith('Return JSON {"sections"') ? { sections: [{ title: 'Foreign group', body: 'Invented.', assetIds: ['foreign'] }] } : { title: 'Wrong', body: 'Waterproof organic silk balloons.' });
  const context = { ...delivery, format, shootType: format === 'campaign' ? 'Fashion' : 'Event', brief: format === 'campaign' ? 'A finished jacket lookbook.' : 'Conference coverage.' };
  const contextFrames = frames.map((frame, index) => ({ ...frame, headline: format === 'campaign' ? index < 4 ? 'Jacket lookbook' : 'Jacket collection' : index < 4 ? 'Conference coverage' : 'Conference photographs', caption: format === 'campaign' ? 'The finished jacket collection.' : 'The finished conference collection.' }));
  const result = await groupV3Sections(context, rows, ids, contextFrames);
  assert.deepEqual(result.flatMap(group => group.assetIds), ids);
  assert.equal(result.length, 2);
  assert.ok(result.every(group => !/waterproof|organic|silk|balloons/.test(group.body)));
});

test('a preparation retry resumes completed photo writing and repairs only the rejected frame', async t => {
  const draft = { frames: frames.map((frame, index) => index === 3 ? { assetId: frame.assetId } : frame) };
  let wholeDraftRequests = 0, singleRepairs = 0;
  model(t, call => {
    const system = call.messages[0].content;
    if (system.startsWith('Review the delivery wording')) return { frames: draft.frames };
    if (system.includes('Repair only this photograph')) { singleRepairs++; return frames[3]; }
    if (system.startsWith('Return JSON {"palette"')) return { palette: {} };
    if (system.startsWith('Return JSON {"sections"')) return { sections: [{ title: 'Birthday portraits', body: 'This chapter brings together the first part of your birthday portrait collection.', assetIds: ids.slice(0, 4) }, { title: 'Your birthday collection', body: 'These photographs continue the birthday portrait collection made for you.', assetIds: ids.slice(4) }] };
    wholeDraftRequests++; return {};
  });
  const checkpoints = [];
  const result = await directV3(delivery, rows, { resume: { selected: ids, writingVersion: DELIVERY_WRITING_VERSION, writingDraft: draft }, checkpoint: async value => checkpoints.push(value) });
  assert.equal(wholeDraftRequests, 0);
  assert.equal(singleRepairs, 1);
  assert.deepEqual(result.direction.frames.map(frame => frame.caption), captions);
  assert.ok(checkpoints.some(value => value.writingDraft?.frames?.[3]?.caption === captions[3]));
});

test('quality and scene variety prevent near-identical poses crowding out strong different photographs', () => {
  const repeated = Array.from({ length: 6 }, (_, index) => ({ assetId: `same-${index}`, score: 10, similarityTags: ['seated portrait', 'tight framing', 'dark backdrop'], momentTags: ['portraits'] }));
  const different = { assetId: 'different', score: 8.5, quality: { sharpness: 9, exposure: 9, composition: 9 }, similarityTags: ['standing full length', 'light backdrop'], momentTags: ['full length'] };
  const broken = { assetId: 'broken', score: 10, unusable: true };
  const candidates = [...repeated, different, broken];
  const result = variedShowcaseCandidates(candidates, 3);
  assert.ok(result.includes(different));
  assert.equal(result.includes(broken), false);
  const ends = showcaseBookends(candidates, result.map(row => row.assetId));
  assert.notEqual(ends.openingAssetId, 'broken');
  assert.notEqual(ends.closingAssetId, 'broken');
  assert.notEqual(ends.openingAssetId, ends.closingAssetId);
});

test('a clearly unusable photograph stays out of the showcase when enough finished photographs remain', async t => {
  const usableFrames = frames.slice(0, 6);
  model(t, call => call.messages[0].content.startsWith('Return JSON {"palette"') ? { palette: {} } : { frames: usableFrames });
  const result = await directV3({ ...delivery, format: 'photo-story' }, [...rows.slice(0, 6), { assetId: 'broken', score: 10, unusable: true }]);
  assert.equal(result.selected.length, 6);
  assert.equal(result.selected.includes('broken'), false);
  assert.notEqual(result.openingAssetId, 'broken');
  assert.notEqual(result.closingAssetId, 'broken');
});
