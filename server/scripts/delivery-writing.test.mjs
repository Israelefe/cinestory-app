import assert from 'node:assert/strict';
import test from 'node:test';
import Delivery from '../src/models/Delivery.js';
import { v3Caption, v3Showcase } from '../src/controllers/deliveryV3.controller.js';
import { directV3, regenerateV3Caption, reviewV3WritingBlocks } from '../src/services/deliveryV3AI.service.js';
import { writeEditorialDirection } from '../src/services/editorialDirection.service.js';
import { createFrameBatch } from '../src/services/alibabaCreativeDirector.service.js';
import { SHOOT_WRITING_PROFILES, FORMAT_WRITING_PROFILES, deliveryWritingContext, deliveryWritingPolicy, requiresDirectAddress, supportsVisualWriting, shootWritingIssues, writingFallback } from '../src/constants/deliveryWriting.js';
import { initialWritingOverrides, planPhotoWritingChange, applyWritingReview, undoWritingChange } from '../../client/src/utils/deliveryWritingChanges.js';

const ids = Array.from({ length: 5 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`);
const personal = { format: 'editorial', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 30th birthday portraits." };
const state = () => ({ format: 'editorial', selected: ids.slice(0, 4), openingAssetId: ids[0], closingAssetId: ids[3], openingLine: 'Ada at thirty.', closingLine: 'Your birthday collection is ready.', headlines: Object.fromEntries(ids.map(id => [id, 'Birthday portraits'])), captions: Object.fromEntries(ids.map(id => [id, 'Ada, keep these birthday portraits.'])), sections: [], editorial: { introduction: 'A birthday portrait feature for Ada at thirty.', note: 'Thank you, Ada.', credits: [], sections: [{ id: 'first', title: 'Marking thirty', body: 'Keep these birthday portraits.', pullLine: 'Keep these birthday portraits.', layout: 'pair', assetIds: ids.slice(0, 2) }, { id: 'next', title: 'Your birthday collection', body: '', layout: 'pair', assetIds: ids.slice(2, 4) }] } });
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
test('graduation captions cannot invent a ceremony from portrait notes', () => {
  const delivery = { shootType: 'Graduation', brief: 'Graduation portraits after finishing university.' };
  assert.ok(shootWritingIssues('Walking across the stage at your ceremony.', delivery).length > 0);
  assert.deepEqual(shootWritingIssues('Your graduation portraits mark finishing university.', delivery), []);
  assert.deepEqual(shootWritingIssues('The ceremony photographs.', { ...delivery, brief: 'Photographs of the graduation ceremony.' }), []);
  assert.deepEqual(shootWritingIssues('Walking across the stage.', delivery, { observation: 'The graduate crosses the stage.' }), []);
});
function model(t, reply) {
  const key = process.env.ALIBABA_MODEL_STUDIO_API_KEY, base = process.env.ALIBABA_BASE_URL;
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key'; process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  t.after(() => { if (key === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY; else process.env.ALIBABA_MODEL_STUDIO_API_KEY = key; if (base === undefined) delete process.env.ALIBABA_BASE_URL; else process.env.ALIBABA_BASE_URL = base; });
  t.mock.method(globalThis, 'fetch', async (_url, options) => Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: JSON.stringify(reply(JSON.parse(options.body))) } }] }));
}

test('all nineteen shoot types and nine formats retain shoot purpose independently of presentation', () => {
  assert.equal(Object.keys(SHOOT_WRITING_PROFILES).length, 19); assert.equal(Object.keys(FORMAT_WRITING_PROFILES).length, 9);
  for (const shootType of Object.keys(SHOOT_WRITING_PROFILES)) for (const format of Object.keys(FORMAT_WRITING_PROFILES)) {
    const delivery = { shootType, format, clientName: 'Client', brief: '' };
    assert.equal(deliveryWritingContext(delivery).shoot, shootType);
    assert.ok(deliveryWritingPolicy(delivery).includes(SHOOT_WRITING_PROFILES[shootType].focus));
    assert.ok(deliveryWritingPolicy(delivery).includes(FORMAT_WRITING_PROFILES[format].focus));
    assert.match(deliveryWritingPolicy(delivery), /no minimum word count/);
  }
});
test('custom shoot types, specific weddings and commercial briefs get the correct treatment', () => {
  for (const [shootType, brief, expected] of [['Traditional Wedding', '', 'traditional-wedding'], ['Pre-Wedding', '', 'pre-wedding'], ['Conference photographs', '', 'event'], ['Other', 'Graduation portraits', 'graduation']]) assert.equal(deliveryWritingContext({ shootType, brief }).shoot, expected);
  assert.equal(supportsVisualWriting({ ...personal, shootType: 'Other', brief: 'A product lookbook' }), true);
  assert.equal(supportsVisualWriting({ ...personal, brief: "Ada's birthday portraits with a fashion theme" }), false);
});
test('the receiving studio is not addressed as the person photographed', () => {
  assert.equal(requiresDirectAddress({ ...personal, format: 'photo-story' }), true);
  assert.equal(requiresDirectAddress({ ...personal, format: 'photo-story', clientName: 'Apex Imagery Studio' }), false);
  assert.equal(requiresDirectAddress({ ...personal, format: 'photo-story', clientName: 'Amara' }), false);
  assert.doesNotMatch(writingFallback({ ...personal, clientName: 'Apex Imagery Studio' }).caption, /your birthday|you turned/i);
});
test('visual description fits fashion but does not take over birthday writing', () => {
  const caption = 'Ada wears an emerald suit beside an ivory telephone in this portrait.';
  assert.ok(shootWritingIssues(caption, personal, { caption: true }).length);
  assert.deepEqual(shootWritingIssues(caption, { ...personal, shootType: 'Fashion' }, { caption: true }), []);
  assert.deepEqual(shootWritingIssues('Ada, keep holding onto what matters to you.', personal, { caption: true }), []);
  assert.ok(shootWritingIssues('A waterproof sustainable bag.', { shootType: 'Fashion' }).length);
  assert.deepEqual(shootWritingIssues('A handmade bag.', { shootType: 'Fashion', brief: 'Handmade bags.' }), []);
});
test('fallbacks preserve non-birthday purpose and are distinct within the maximum showcase', () => {
  for (const shootType of ['Memorial', 'Corporate', 'Fashion', 'Wedding']) {
    const captions = Array.from({ length: 24 }, (_, index) => writingFallback({ shootType }, index, 150).caption);
    assert.equal(new Set(captions).size, 24); assert.ok(captions.every(text => text.length <= 150 && !/happy birthday|year ahead|congratulations/i.test(text)));
  }
});
test('short meaningful captions survive generation and automatic review without filler', async t => {
  const words = { headline: 'Birthday portraits', caption: 'Ada, keep these from your birthday.' };
  model(t, call => call.messages[0].content.startsWith('Review the delivery wording') ? { frames: [{ assetId: 'selected-photo', ...words }] } : words);
  assert.deepEqual(await regenerateV3Caption({ ...personal, format: 'photo-story' }, { assetId: ids[0] }), words);
});
test('birthday Editorial automatically repairs outfit-dominated writing but keeps useful short text', async () => {
  const invalid = { title: 'Ada at thirty', openingLine: 'Birthday portraits for Ada.', closingLine: 'Your collection is ready.', frames: [{ assetId: ids[0], headline: 'Birthday portraits', caption: 'Ada wears an emerald suit beside an ivory telephone.' }], sections: [{ title: 'Marking thirty', body: '', assetIds: [ids[0]] }] };
  const fixed = { ...invalid, frames: [{ assetId: ids[0], headline: 'Hello, thirty', caption: 'Ada, keep these from the year you turned thirty.' }] };
  const prompts = [];
  const result = await writeEditorialDirection(async (system, prompt) => { prompts.push({ system, prompt }); return prompts.length === 1 ? invalid : fixed; }, personal, [{ assetId: ids[0] }], [ids[0]], () => false);
  assert.equal(prompts.length, 2); assert.match(prompts[1].prompt, /dominated by visual description/); assert.equal(result.frames[0].caption, fixed.frames[0].caption); assert.deepEqual(result.writingOverrides, []);
});
test('photo wording review repairs oversized or memorial-inappropriate text with bounded attempts', async t => {
  let calls = 0; model(t, () => ({ blocks: [{ key: 'closingLine', text: ++calls === 1 ? 'Happy birthday, your year ahead starts here.' : 'The full memorial collection is available below.' }] }));
  const result = await reviewV3WritingBlocks({ shootType: 'Memorial', format: 'editorial', collectionAnalysis: { images: [{ assetId: ids[0] }] } }, [{ key: 'closingLine', kind: 'closing', assetIds: [ids[0]], text: 'Your full gallery is here.' }]);
  assert.equal(calls, 2); assert.equal(result.blocks[0].text, 'The full memorial collection is available below.');
});
test('unrepairable photo review fails after three attempts and leaves the saved writing intact', async t => {
  let calls = 0; model(t, () => { calls++; return { blocks: [] }; });
  const delivery = { ...personal, creativeDirection: { openingLine: 'My original wording.' } };
  await assert.rejects(reviewV3WritingBlocks(delivery, [{ key: 'openingLine', kind: 'opening', assetIds: [ids[0]], text: 'My original wording.' }]), error => error.code === 'V3_WRITING_REVIEW_INCOMPLETE');
  assert.equal(calls, 3); assert.equal(delivery.creativeDirection.openingLine, 'My original wording.');
});
test('review API rejects foreign photographs, duplicate keys, oversized text and mixed operations before provider access', async t => {
  const delivery = { ...personal, schemaVersion: 3, kind: 'showcase', status: 'review', assets: [{ assetId: ids[0] }], collectionAnalysis: { images: ids.map(assetId => ({ assetId })) } };
  t.mock.method(Delivery, 'findOne', () => Promise.resolve(delivery));
  t.mock.method(globalThis, 'fetch', () => { assert.fail('Invalid input reached provider'); });
  const block = { key: 'openingLine', kind: 'opening', assetIds: [ids[0]], text: 'Ada at thirty.' };
  for (const body of [{ writingBlocks: [{ ...block, assetIds: [ids[1]] }] }, { writingBlocks: [block, block] }, { writingBlocks: [{ ...block, text: 'x'.repeat(301) }] }, { writingBlocks: [block], editorialBlock: 'summary' }]) {
    const res = response(); await v3Caption({ body, params: { id: '507f1f77bcf86cd799439099', assetId: ids[0] }, user: { id: 'studio' } }, res); assert.equal(res.statusCode, 400);
  }
  const res = response(); await v3Caption({ body: { writingBlocks: [block] }, params: { id: '507f1f77bcf86cd799439099', assetId: ids[1] }, user: { id: 'studio' } }, res); assert.equal(res.statusCode, 404);
});
test('replacement reviews changed paragraphs and introduction without changing per-photo words', () => {
  const before = state(), { next, blocks } = planPhotoWritingChange(before, { mode: 'replace', index: 0, assetId: ids[4] });
  assert.deepEqual(next.selected, [ids[4], ...ids.slice(1, 4)]); assert.equal(next.captions[ids[1]], before.captions[ids[1]]);
  assert.deepEqual(blocks.map(block => block.key), ['editorial.introduction', 'section:first:title', 'section:first:body']); assert.deepEqual(next.editorial.sections[0].assetIds, [ids[4], ids[1]]);
});
test('reordering reviews only changed section membership and preserves all per-photo writing', () => {
  const before = state(), sameGroup = planPhotoWritingChange(before, { mode: 'order', order: [ids[1], ids[0], ids[2], ids[3]] });
  assert.ok(sameGroup.blocks.every(block => block.key.startsWith('section:first:')));
  const acrossGroups = planPhotoWritingChange(before, { mode: 'order', order: [ids[0], ids[2], ids[1], ids[3]] });
  assert.ok(acrossGroups.blocks.some(block => block.key === 'section:next:title')); assert.deepEqual(acrossGroups.next.captions, before.captions);
});
test('manual text and edits made during review become suggestions; generated text updates automatically', () => {
  const before = state(), plan = planPhotoWritingChange(before, { mode: 'opening', assetId: ids[4] });
  const reviewed = [{ key: 'openingLine', text: 'Ada, your birthday portraits are here.' }];
  const automatic = applyWritingReview(plan.next, plan.blocks, reviewed, new Set()); assert.equal(automatic.next.openingLine, reviewed[0].text); assert.equal(automatic.suggestions.length, 0);
  for (const [current, overrides] of [[plan.next, new Set(['openingLine'])], [{ ...plan.next, openingLine: 'I edited this while waiting.' }, new Set()]]) {
    const manual = applyWritingReview(current, plan.blocks, reviewed, overrides); assert.equal(manual.next.openingLine, current.openingLine); assert.equal(manual.suggestions.length, 1);
  }
  assert.throws(() => applyWritingReview(plan.next, plan.blocks, [], new Set()), /incomplete/);
});
test('section moves keep in-flight manual text, notes and credits', () => {
  const before = state(), moved = structuredClone(before.editorial); moved.sections[0].assetIds = [ids[1]]; moved.sections[1].assetIds = [ids[2], ids[3], ids[0]];
  before.editorial.sections[0].body = 'Edited while waiting.'; before.editorial.note = 'A new personal thank you.';
  const { next } = planPhotoWritingChange(before, { mode: 'order', order: [ids[1], ids[2], ids[3], ids[0]], editorial: moved });
  assert.equal(next.editorial.sections[0].body, 'Edited while waiting.'); assert.equal(next.editorial.note, 'A new personal thank you.');
});
test('Undo restores emptied sections and preserves unrelated later manual edits', () => {
  const before = state(), after = planPhotoWritingChange(before, { mode: 'order', order: ids.slice(2, 4) }).next;
  const current = { ...after, closingLine: 'My new closing note.', captions: { ...after.captions, [ids[2]]: 'A manual caption written later.' } };
  const undone = undoWritingChange(current, before, after);
  assert.deepEqual(undone.selected, before.selected); assert.deepEqual(undone.editorial.sections.flatMap(section => section.assetIds), before.selected); assert.equal(undone.closingLine, current.closingLine); assert.equal(undone.captions[ids[2]], current.captions[ids[2]]);
});
test('legacy writing is protected and new generated writing carries explicit provenance', () => {
  assert.ok(initialWritingOverrides({ creativeDirection: { openingLine: 'Saved text', frames: [{ assetId: ids[0] }] } }).has(`frame:${ids[0]}:caption`));
  assert.equal(initialWritingOverrides({ creativeDirection: { writingOverrides: [] } }).size, 0);
});

test('saving a replaced photo retains its reviewed chapter instead of moving it to the first group', async t => {
  const assets = Array.from({ length: 12 }, (_, index) => ({ assetId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}` }));
  const selected = assets.slice(0, 10).map(asset => asset.assetId), replacement = assets[10].assetId;
  const first = selected.slice(0, 5), second = selected.slice(5); second[1] = replacement;
  const delivery = { _id: '507f1f77bcf86cd799439099', userId: 'studio', schemaVersion: 3, kind: 'showcase', format: 'chapters', status: 'review', assets, collectionAnalysis: {}, creativeDirection: { openingLine: 'Your collection is ready.', closingLine: 'The full gallery follows.', writingOverrides: [], sections: [{ id: 'first', title: 'First chapter', subtitle: '', assetIds: selected.slice(0, 5) }, { id: 'next', title: 'Next chapter', subtitle: '', assetIds: selected.slice(5) }] }, v3: { revision: 1 }, markModified() {}, async save() { this.saved = true; } };
  t.mock.method(Delivery, 'findOne', () => Promise.resolve(delivery));
  const assetIds = [...first, ...second], body = { assetIds, title: 'Birthday chapters', openingLine: 'Your collection is ready.', closingLine: 'The full gallery follows.', openingAssetId: assets[0].assetId, closingAssetId: assets[11].assetId, frames: assetIds.map(assetId => ({ assetId, headline: 'Birthday portraits', caption: 'Ada, keep these birthday portraits.' })), writingOverrides: ['section:next:title'], sectionWriting: [{ id: 'first', title: 'First chapter', subtitle: '', assetIds: first }, { id: 'next', title: 'A reviewed chapter', subtitle: 'Your birthday collection.', assetIds: second }] };
  const request = body => ({ body, params: { id: delivery._id }, user: { id: delivery.userId } });
  const res = response(); await v3Showcase(request(body), res); assert.equal(res.statusCode, 200); assert.deepEqual(delivery.creativeDirection.sections[1].assetIds, second); assert.equal(delivery.creativeDirection.sections[1].title, 'A reviewed chapter'); assert.deepEqual(delivery.creativeDirection.writingOverrides, ['section:next:title']);
  const bad = response(); await v3Showcase(request({ ...body, sectionWriting: body.sectionWriting.map(section => ({ ...section, assetIds: first })) }), bad); assert.equal(bad.statusCode, 400);
});

test('the older writer accepts a useful short caption and preserves richer Editorial text', async t => {
  let caption = 'Your birthday.';
  model(t, () => ({ frames: [{ assetId: ids[0], sectionId: 'showcase', headline: 'Birthday portraits', caption }] }));
  const input = { format: 'photo-story', brief: "Ada's birthday", shootType: 'Birthday', clientName: 'Ada', direction: { sections: [{ id: 'showcase', title: 'Birthday portraits' }] }, imageInsights: [{ assetId: ids[0] }], photoUrlsById: new Map([[ids[0], 'https://example.com/photo.jpg']]) };
  assert.equal((await createFrameBatch(input)).frames[0].caption, caption);
  caption = 'Ada chose this fashion look for the supplied portrait collection. The wider photograph gives the styling room, and the closer photographs carry the same direction through the finished collection.';
  assert.ok(caption.length > 180 && caption.length < 320);
  assert.equal((await createFrameBatch({ ...input, format: 'editorial', shootType: 'Fashion' })).frames[0].caption, caption);
});
test('the older writer repairs an oversized Photo Story caption rather than clipping it mid-sentence', async t => {
  let calls = 0;
  model(t, () => ({ frames: [{ assetId: ids[0], sectionId: 'showcase', headline: 'Birthday portraits', caption: ++calls === 1 ? 'Your birthday photographs are ready. '.repeat(5) : 'Ada, keep these birthday portraits.' }] }));
  const result = await createFrameBatch({ format: 'photo-story', brief: "Ada's birthday", shootType: 'Birthday', clientName: 'Ada', direction: { sections: [{ id: 'showcase', title: 'Birthday portraits' }] }, imageInsights: [{ assetId: ids[0] }], photoUrlsById: new Map([[ids[0], 'https://example.com/photo.jpg']]) });
  assert.equal(calls, 2); assert.equal(result.frames[0].caption, 'Ada, keep these birthday portraits.');
});

test('the older writer sends eight saved photo observations as text without photo URLs', async t => {
  const assets = Array.from({ length: 8 }, (_, index) => ({ assetId: 'saved-' + index, summary: 'Cream linen jacket ' + index }));
  const calls = [];
  model(t, body => {
    calls.push(body);
    assert.ok(body.messages.every(message => typeof message.content === 'string' || message.content.every(part => part.type === 'text')));
    return { frames: assets.map((asset, index) => ({ assetId: asset.assetId, sectionId: 'showcase', headline: 'Linen collection', caption: 'Linen jacket ' + index + ' from the supplied lookbook collection.' })) };
  });
  const result = await createFrameBatch({ format: 'editorial', brief: 'A linen collection lookbook.', shootType: 'Fashion', clientName: 'Studio', direction: { sections: [{ id: 'showcase', title: 'Linen collection' }] }, imageInsights: assets });
  assert.ok(Array.isArray(calls[0].messages.find(message => message.role === 'user').content)); assert.equal(result.frames.length, 8);
});

test('grouped formats repair invalid section wording instead of clipping it or accepting foreign photos', async t => {
  const assetIds = Array.from({ length: 8 }, (_, index) => `chapter-photo-${index}`);
  const headings = ['Hello, birthday', 'Keep this one', 'Your birthday collection', 'A birthday portrait', 'One for your album', 'Just for you', 'A day of your own', 'Happy birthday, Ada'];
  const captions = ['Ada, your birthday portraits are here.', 'Ada, keep this from your birthday.', 'Take your time with your birthday photographs.', 'Ada, this portrait marks your birthday.', 'You can revisit these birthday portraits.', 'Your birthday collection is ready to keep.', 'Ada, mark your birthday your own way.', 'Ada, wishing you a good birthday.'];
  const frames = assetIds.map((assetId, index) => ({ assetId, headline: headings[index], caption: captions[index] }));
  let groupingCalls = 0;
  model(t, call => {
    const system = call.messages[0].content;
    if (system.includes('Group every supplied asset ID')) {
      groupingCalls++;
      return { sections: [{ title: groupingCalls === 1 ? 'x'.repeat(61) : 'Birthday portraits', subtitle: 'Ada, keep these photographs.', assetIds: assetIds.slice(0, 4) }, { title: 'Your birthday collection', subtitle: '', assetIds: assetIds.slice(4) }] };
    }
    if (system.startsWith('Return JSON {"palette"')) return { palette: {} };
    return { title: 'Birthday portraits', openingLine: 'Ada, your birthday portraits are here.', closingLine: 'Your full birthday collection follows.', frames };
  });
  const result = await directV3({ ...personal, brief: "Ada's birthday", format: 'chapters' }, assetIds.map(assetId => ({ assetId, summary: 'Finished portrait.', score: 8 })));
  assert.equal(groupingCalls, 2); assert.equal(result.direction.sections[0].title, 'Birthday portraits'); assert.deepEqual(result.direction.sections.flatMap(section => section.assetIds), assetIds);
});
