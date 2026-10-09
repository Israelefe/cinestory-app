import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import Delivery from '../src/models/Delivery.js';
import { v3Showcase, v3Caption } from '../src/controllers/deliveryV3.controller.js';
import { updateDeliveryReview } from '../src/controllers/delivery.controller.js';
import { V3_FORMATS } from '../src/constants/deliveryV3.js';
import { DETAILED_WRITING_FORMATS, photoCaptionLimit, DELIVERY_WRITING_VERSION } from '../src/constants/deliveryWritingLimits.js';
import { writingBlockLimit } from '../src/constants/deliveryWritingBlocks.js';
import { FORMAT_WRITING_PROFILES, shootWritingIssues, requiresDirectAddress } from '../src/constants/deliveryWriting.js';
import { detailedFrameIssues } from '../src/utils/deliveryWritingQuality.js';
import { directV3, regenerateV3Caption, reviewV3WritingBlocks, v3FrameWritingIssues } from '../src/services/deliveryV3AI.service.js';
import { createGlobalDirection, createFrameBatch, FORMAT_DIRECTION_PROFILES } from '../src/services/alibabaCreativeDirector.service.js';
import { planPhotoWritingChange, applyWritingReview, writingText } from '../../client/src/utils/deliveryWritingChanges.js';

const ids = Array.from({ length: 10 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
Object.assign(process.env, { R2_ACCOUNT_ID: 'offline-account', R2_ACCESS_KEY_ID: 'offline-key', R2_SECRET_ACCESS_KEY: 'offline-secret', R2_BUCKET_NAME: 'offline-bucket', R2_IMAGE_WORKER_URL: 'https://offline-worker.example', R2_IMAGE_WORKER_SECRET: 'offline-secret-that-is-at-least-32-characters' });
const views = ['Front view', 'Back view', 'Pocket detail', 'Collar detail', 'Sleeve detail', 'Side view', 'Fastening detail', 'Hem detail', 'Label detail', 'Worn jacket'];
const captions = [
  'The front view shows the linen jacket with its patch pockets and open collar. It gives the clothing team a complete view of the front, while the separate detail photographs provide a closer look at the same garment.',
  'The back view keeps the rear panel of the linen jacket visible from collar to hem. It complements the front photograph by showing the other side of the garment in the same collection, without the pockets obscuring the panel.',
  'The closer photograph makes the patch pocket on the linen jacket easier to inspect. Its opening and stitching are visible together, adding a view of the pocket that is harder to see in the complete front photograph.',
  'The open collar appears close enough to see its edge and stitching against the linen jacket. This photograph gives the clothing team a separate collar reference alongside the wider views of the garment in the collection.',
  'The sleeve detail shows the cuff and sleeve seam of the linen jacket together. This closer view records those parts of the garment for the clothing team, while the full views show how the sleeve sits on the jacket.',
  'The side view places the sleeve and side seam of the linen jacket in the same photograph. It adds a useful angle between the complete front and back views, keeping the outline of the garment available for comparison.',
  'The fastening detail shows the button and buttonhole on the linen jacket. They can be seen together in this closer photograph, giving the clothing team a direct reference for this part of the garment alongside its complete views.',
  'The lower edge of the linen jacket is shown with the hem stitching visible across the photograph. This detail records the finish at the bottom of the garment, separate from the wider photographs that show the full jacket.',
  'The label is visible inside the linen jacket in this closer photograph. This view records the label and its position for the clothing team without relying on a wide garment photograph to show the small detail clearly.',
  'The linen jacket is shown worn, with the collar, sleeve and front pockets visible together. This photograph provides a view of the garment on a person alongside the separate front, back and detail photographs in the set.'
];
const brief = 'Finished linen jacket photographs for a clothing collection. Include front, back, side, worn and detail views for the clothing team. No approved marketing channels or usage rights have been supplied.';
const body = 'The complete views show the jacket from the front, back and side, alongside a worn view. Together they give the clothing team a reference for the garment as a whole before the closer detail photographs.';
const detailBody = 'These closer views record the collar, pockets, sleeve, fastening, hem and label. They give the clothing team a separate reference for parts of the jacket that are smaller in the complete garment photographs.';
const rows = ids.map((assetId, i) => ({ assetId, score: 8, summary: `${views[i]} of the linen jacket. Visible patch pockets, collar, sleeve seam, cuff, button, buttonhole, hem stitching and label.` }));
const frames = ids.map((assetId, i) => ({ assetId, headline: views[i], caption: captions[i] }));
const res = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } });
const draft = format => ({ _id: '507f1f77bcf86cd799439099', userId: 'studio-user', kind: 'showcase', schemaVersion: 3, format, status: 'review', clientName: 'Clothing Studio', shootType: 'Fashion', brief, assets: ids.map(assetId => ({ assetId })), curatedAssetIds: ids, collectionAnalysis: { images: rows }, creativeDirection: { title: 'Linen jacket collection', openingLine: 'Complete and detail views of the linen jacket.', closingLine: 'The finished collection follows.', frames: structuredClone(frames), sections: [{ id: 'complete', title: 'Complete jacket views', subtitle: 'The garment as a whole', body, layout: 'grid', assetIds: ids }] }, v3: { revision: 2, approvedRevision: 2 }, markModified() {}, async save() { this.saved = true; } });
function model(t, reply) {
  const env = { ALIBABA_MODEL_STUDIO_API_KEY: 'test-key', ALIBABA_BASE_URL: 'https://test.aliyuncs.com/compatible-mode/v1' };
  const before = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => { const call = JSON.parse(options.body); calls.push(call); return Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: JSON.stringify(reply(call, calls.length)) } }] }); });
  return calls;
}

test('client and server writing limits stay identical across separate deployments, with changes scoped to four formats', () => {
  assert.equal(readFileSync(new URL('../src/constants/deliveryWritingLimits.js', import.meta.url), 'utf8'), readFileSync(new URL('../../client/src/utils/deliveryWritingLimits.js', import.meta.url), 'utf8'));
  for (const format of DETAILED_WRITING_FORMATS) { assert.equal(photoCaptionLimit(format), 320); assert.equal(FORMAT_WRITING_PROFILES[format].caption, 320); }
  for (const [format, limit] of [['photo-story', 150], ['photo-reveal', 180], ['canvas', 180], ['album', 180], ['photoswap', 180]]) assert.equal(photoCaptionLimit(format), limit);
  for (const [format, limit] of [['chapters', 320], ['editorial', 700], ['event-coverage', 360], ['campaign', 320], ['canvas', 120]]) assert.equal(writingBlockLimit({ kind: 'section-body' }, format), limit);
  assert.equal(requiresDirectAddress({ format: 'chapters', clientName: 'Ada', shootType: 'Wedding', brief: 'Wedding portraits and family welcome.' }), false);
  assert.equal(requiresDirectAddress({ format: 'photo-story', clientName: 'Ada', shootType: 'Birthday', brief: 'Birthday portraits.' }), true);
});

for (const format of DETAILED_WRITING_FORMATS) {
  test(`${format}: initial generation keeps developed captions and separate section context`, async t => {
    const selected = ids.slice(0, V3_FORMATS[format][0]);
    const written = frames.filter(frame => selected.includes(frame.assetId));
    const sections = [{ title: 'Complete jacket views', subtitle: 'The garment as a whole', body, assetIds: selected.slice(0, 3) }, { title: 'Jacket details', subtitle: 'Closer garment references', body: detailBody, assetIds: selected.slice(3) }];
    const calls = model(t, call => {
      const system = call.messages[0].content;
      if (system.includes('Group every supplied asset ID')) return { sections };
      if (system.startsWith('Return JSON {"palette"')) return { palette: {} };
      return { title: 'Linen jacket collection', openingLine: 'Complete and detail views of the linen jacket.', closingLine: 'The finished collection follows.', frames: written, sections };
    });
    const result = await directV3(draft(format), rows.filter(row => selected.includes(row.assetId)));
    assert.deepEqual(result.direction.frames.map(frame => frame.caption), written.map(frame => frame.caption));
    assert.ok(result.direction.frames.every(frame => frame.caption.length > 180 && frame.caption.length <= 320));
    assert.equal(result.direction.sections[0].body, body); assert.equal(result.direction.writingVersion, DELIVERY_WRITING_VERSION);
    assert.match(calls[0].messages[0].content, /Caption maximum 320/);
  });
  test(`${format}: photo rewrites preserve complete captions and leave saved text alone`, async t => {
    const delivery = draft(format); delivery.creativeDirection.frames = [];
    const calls = model(t, call => call.messages[0].content.startsWith('Review the delivery wording.') ? { frames: [{ assetId: 'selected-photo', ...frames[0] }] } : frames[0]);
    const result = await regenerateV3Caption(delivery, rows[0]);
    assert.equal(result.caption, captions[0]); assert.equal(result.headline, views[0]); assert.equal(delivery.saved, undefined);
    assert.ok(calls.every(call => /320/.test(call.messages[0].content)));
  });
  test(`${format}: save and validation accept complete captions and reject overflow`, async t => {
    const delivery = draft(format), selected = ids.slice(0, V3_FORMATS[format][0]);
    t.mock.method(Delivery, 'findOne', async () => delivery);
    const input = { assetIds: selected, title: delivery.creativeDirection.title, openingLine: delivery.creativeDirection.openingLine, closingLine: delivery.creativeDirection.closingLine, openingAssetId: ids[0], closingAssetId: ids[1], frames: frames.filter(frame => selected.includes(frame.assetId)), ...(format !== 'editorial' ? { sectionWriting: [{ ...delivery.creativeDirection.sections[0], assetIds: selected }] } : {}) };
    if (input.sectionWriting) delete input.sectionWriting[0].layout;
    const good = res(); await v3Showcase({ params: { id: delivery._id }, user: { id: delivery.userId }, body: input }, good);
    assert.equal(good.statusCode, 200, JSON.stringify(good.body)); assert.equal(delivery.creativeDirection.frames[0].caption, captions[0]);
    if (format !== 'editorial') assert.equal(delivery.creativeDirection.sections[0].body, body);
    delivery.saved = false; const bad = res(); input.frames[0] = { ...input.frames[0], caption: 'x'.repeat(321) };
    await v3Showcase({ params: { id: delivery._id }, user: { id: delivery.userId }, body: input }, bad);
    assert.equal(bad.statusCode, 400); assert.equal(delivery.saved, false);
  });
  test(`${format}: legacy direction and caption batches retain paragraphs and captions`, async t => {
    const profile = FORMAT_DIRECTION_PROFILES[format];
    const direction = { format, title: 'Linen jacket collection', openingLine: 'Finished linen jacket photographs.', closingLine: 'The complete set is ready.', designReason: 'Space for garment details.', palette: { background: '#070709', surface: '#0c0c10', text: '#ffffff', accent: '#ff5a47' }, typography: { display: profile.typography[0], body: 'clean-sans' }, pace: 'measured', variation: { composition: profile.compositions[0], density: profile.density[0], imageTreatment: 'natural', captionTreatment: 'editorial', accentPlacement: profile.accents[0] }, sections: [{ id: 'complete', title: 'Complete jacket views', subtitle: 'The garment as a whole', body, layout: profile.sectionLayouts[0] }] };
    const calls = model(t, call => call.messages[0].content.startsWith('You are writing headlines') ? { frames: [{ ...frames[0], sectionId: 'complete' }] } : direction);
    const result = await createGlobalDirection({ format, brief, shootType: 'Fashion', clientName: 'Studio', imageInsights: rows.slice(0, 1) });
    assert.equal(result.sections[0].body, body);
    const batch = await createFrameBatch({ format, brief, shootType: 'Fashion', clientName: 'Studio', direction: result, imageInsights: rows.slice(0, 1) });
    assert.equal(batch.frames[0].caption, captions[0]); assert.match(JSON.stringify(calls[1].messages), /garment as a whole/);
  });
}

test('section review retains longer paragraph limits, repairs copied captions and preserves saved writing', async t => {
  let attempts = 0;
  model(t, () => ({ blocks: [{ key: 'section:complete:body', text: ++attempts === 1 ? captions[0] : body }] }));
  const delivery = draft('chapters');
  const result = await reviewV3WritingBlocks(delivery, [{ key: 'section:complete:body', kind: 'section-body', text: body, assetIds: ids }]);
  assert.equal(attempts, 2); assert.equal(result.blocks[0].text, body); assert.equal(delivery.saved, undefined);
});
test('photo replacement reviews the actual paragraph and keeps a later manual edit as a suggestion', () => {
  const delivery = draft('chapters');
  const before = { format: 'chapters', selected: ids.slice(0, 8), sections: delivery.creativeDirection.sections.map(section => ({ ...section, assetIds: ids.slice(0, 8) })), editorial: { sections: [] }, headlines: {}, captions: {}, openingAssetId: ids[0], closingAssetId: ids[7] };
  const change = planPhotoWritingChange(before, { mode: 'replace', index: 0, assetId: ids[8] });
  assert.equal(change.blocks.find(block => block.kind === 'section-body').text, body);
  const current = { ...before, sections: before.sections.map(section => ({ ...section, body: 'My studio paragraph.' })) };
  const reviewed = change.blocks.map(block => ({ key: block.key, text: block.kind === 'section-body' ? detailBody : block.text }));
  const result = applyWritingReview(current, change.blocks, reviewed, new Set(['section:complete:body']));
  assert.equal(writingText(result.next, 'section:complete:body'), 'My studio paragraph.'); assert.equal(result.suggestions[0].text, detailBody);
});
test('specific headlines, distinct text and supported garment facts are checked only for the four formats', () => {
  for (const format of DETAILED_WRITING_FORMATS) {
    assert.ok(detailedFrameIssues({ headline: 'Scene 1', caption: 'Scene 1' }, format).length);
    assert.ok(detailedFrameIssues(frames[0], format, [captions[0]]).length);
    assert.ok(shootWritingIssues('The waterproof leather jacket.', { format, brief, shootType: 'Fashion' }).length);
    assert.deepEqual(shootWritingIssues(captions[0], { format, brief, shootType: 'Fashion' }, { observation: rows[0].summary }), []);
  }
  assert.deepEqual(detailedFrameIssues({ headline: 'Scene 1', caption: 'Scene 1' }, 'album'), []);
  assert.ok(shootWritingIssues('Attendees exchange business cards over coffee.', { format: 'event-coverage', shootType: 'Conference', brief: 'Conference break.' }, { observation: 'Attendees talking.' }).length);
  assert.ok(shootWritingIssues('Your hands are linked at the start of the day, with hands linked.', { format: 'chapters', shootType: 'Wedding', brief: 'Wedding portraits.' }, { observation: 'A standing couple portrait.' }).length);
});
test('rewrite API rejects another photograph before contacting the model', async t => {
  t.mock.method(Delivery, 'findOne', async () => draft('chapters'));
  const response = res(); await v3Caption({ params: { id: draft('chapters')._id, assetId: '99999999-9999-4999-8999-999999999999' }, user: { id: 'studio-user' }, body: {} }, response);
  assert.ok([400, 404].includes(response.statusCode));
});
for (const format of DETAILED_WRITING_FORMATS) test(`${format}: older review saves full writing and preserves paragraphs omitted by older clients`, async t => {
  const delivery = draft(format); delivery.schemaVersion = 2; delivery.toObject = () => ({ title: delivery.title, assets: [] });
  t.mock.method(Delivery, 'findOne', async filter => { assert.equal(filter.userId, delivery.userId); return delivery; });
  const input = { title: delivery.creativeDirection.title, openingLine: delivery.creativeDirection.openingLine, closingLine: delivery.creativeDirection.closingLine, palette: { background: '#070709', surface: '#0c0c10', text: '#ffffff', accent: '#ff5a47' }, typography: { display: 'editorial-serif', body: 'clean-sans' }, pace: 'measured', sections: [{ id: 'complete', title: 'Complete jacket views', subtitle: 'The garment as a whole', layout: 'grid' }], frames: structuredClone(frames), assetOrder: ids };
  const response = res(); await updateDeliveryReview({ params: { id: delivery._id }, user: { id: delivery.userId }, body: input }, response);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body)); assert.equal(delivery.creativeDirection.frames[0].caption, captions[0]); assert.equal(delivery.creativeDirection.sections[0].body, body);
});
test('older review keeps the 180-character boundary for formats outside the four', async t => {
  const delivery = draft('album'); delivery.schemaVersion = 2;
  t.mock.method(Delivery, 'findOne', async () => delivery);
  const response = res(); await updateDeliveryReview({ params: { id: delivery._id }, user: { id: delivery.userId }, body: { title: 'Linen jacket', openingLine: 'Finished jacket photographs.', closingLine: 'The complete set is ready.', palette: { background: '#070709', surface: '#0c0c10', text: '#ffffff', accent: '#ff5a47' }, typography: { display: 'editorial-serif', body: 'clean-sans' }, pace: 'measured', sections: [{ id: 'complete', title: 'Complete jacket views', subtitle: '', layout: 'grid' }], frames: structuredClone(frames), assetOrder: ids } }, response);
  assert.equal(response.statusCode, 400); assert.equal(delivery.saved, undefined);
});
test('old in-flight writing is regenerated for Chapters instead of restoring its short cached captions', async t => {
  const delivery = draft('chapters'), selected = ids.slice(0, 8);
  const checkpoints = [];
  const calls = model(t, call => {
    if (call.messages[0].content.startsWith('Return JSON {"palette"')) return { palette: {} };
    if (call.messages[0].content.includes('Group every supplied asset ID')) return { sections: [{ title: 'Complete jacket views', subtitle: 'The garment as a whole', body, assetIds: selected.slice(0, 3) }, { title: 'Jacket details', subtitle: 'Closer references', body: detailBody, assetIds: selected.slice(3) }] };
    return { title: 'Linen jacket collection', openingLine: 'Complete and detail views of the linen jacket.', closingLine: 'The finished collection follows.', frames: frames.slice(0, 8) };
  });
  const result = await directV3(delivery, rows.slice(0, 8), { resume: { selected, writing: { narrative: {}, captions: [{ assetId: ids[0], headline: 'Old heading', caption: 'Old short caption.' }] }, sections: [{ id: 'old', title: 'Old section', assetIds: selected }] }, checkpoint: async value => { checkpoints.push(value); } });
  assert.ok(calls[0].messages[0].content.includes('"title"')); assert.equal(result.direction.frames[0].caption, captions[0]); assert.equal(checkpoints[0].writingVersion, DELIVERY_WRITING_VERSION);
});
test('Chapters accepts natural direct and third-person captions but rejects a changed subject name', () => {
  const delivery = { format: 'chapters', clientName: 'Ada and Emeka', shootType: 'Traditional Wedding', brief: 'Ada and Emeka’s wedding portraits and family welcome.' };
  const insight = [{ assetId: ids[0], summary: 'Ada and Emeka standing together for a portrait.' }];
  for (const caption of ['You stand together for a portrait from your wedding collection.', 'Ada and Emeka stand together for a wedding portrait.']) assert.deepEqual(v3FrameWritingIssues({ assetId: ids[0], headline: 'Wedding portraits', caption }, 'chapters', delivery, insight), []);
  assert.ok(v3FrameWritingIssues({ assetId: ids[0], headline: 'Wedding portraits', caption: 'Ada and Ememba are standing together for a wedding portrait.' }, 'chapters', delivery, insight).some(issue => issue.includes('names exactly')));
});
test('section review discards unrequested model edits while returning only the validated paragraph', async t => {
  model(t, () => ({ blocks: [{ key: 'section:complete:body', text: body }, { key: 'foreign-photo:caption', text: 'An unrequested caption.' }] }));
  const result = await reviewV3WritingBlocks(draft('campaign'), [{ key: 'section:complete:body', kind: 'section-body', text: 'The complete jacket views belong together.', assetIds: ids }]);
  assert.deepEqual(result.blocks, [{ key: 'section:complete:body', text: body }]);
});
test('legacy selected-photo rewrites repair a caption copied from an unselected photograph', async t => {
  const calls = model(t, (_call, count) => ({ frames: [{ ...frames[0], sectionId: 'complete', caption: count === 1 ? captions[1] : captions[0] }] }));
  const result = await createFrameBatch({ format: 'campaign', brief, shootType: 'Fashion', clientName: 'Studio', direction: { sections: [{ id: 'complete', title: 'Complete jacket views', body }] }, imageInsights: rows.slice(0, 1), avoidFrames: [frames[1]] });
  assert.equal(calls.length, 2); assert.equal(result.frames[0].caption, captions[0]);
});
