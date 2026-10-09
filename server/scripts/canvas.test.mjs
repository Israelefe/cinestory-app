import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Delivery from '../src/models/Delivery.js';
import { v3Showcase, v3Theme } from '../src/controllers/deliveryV3.controller.js';
import { canvasCheckpoints, canvasSettings, canvasIssues } from '../src/constants/canvas.js';
import { presentationSchema, sectionIssues, scopedPresentation } from '../src/constants/deliveryPresentation.js';
import { validShowcase } from '../src/constants/deliveryV3.js';
import { groupV3Sections } from '../src/services/deliveryV3AI.service.js';
import { validWritingBlock, writingBlockLimit } from '../src/constants/deliveryWritingBlocks.js';
import { planPhotoWritingChange, applyWritingReview, undoWritingChange } from '../../client/src/utils/deliveryWritingChanges.js';

const ids = Array.from({ length: 19 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const selected = ids.slice(0, 6);
const sections = [{ id: 'together', title: 'Together', subtitle: 'Two portraits together.', layout: 'pair', assetIds: selected.slice(1, 3) }];
const checkpoints = [{ id: 'first', type: 'photo', assetId: selected[0] }, { id: 'group-point', type: 'group', sectionId: 'together' }, ...selected.slice(3).map((assetId, index) => ({ id: `single-${index}`, type: 'photo', assetId }))];
const canvas = { version: 1, arrangement: 'spatial', photoMotion: 'gentle', showGroupNotes: true, checkpoints };
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } });
function draft() { return { _id: '507f1f77bcf86cd799439011', status: 'review', format: 'canvas', collectionAnalysis: {}, assets: ids.map(assetId => ({ assetId })), curatedAssetIds: selected, creativeDirection: { title: 'Courage’s graduation', openingLine: 'Your graduation portraits are ready.', closingLine: 'Your photographs are yours to keep.', sections: structuredClone(sections), frames: selected.map(assetId => ({ assetId, headline: 'Graduation portrait', caption: 'Courage, keep these from your graduation.', focalPoint: '35% 40%' })) }, formatConfig: { canvas: structuredClone(canvas) }, v3: { revision: 1, approvedRevision: 1 }, markModified() {}, async save() { this.saved = true; } }; }
function input(record, settings = canvas, groups = sections) { return { assetIds: selected, frames: record.creativeDirection.frames.map(({ assetId, headline, caption }) => ({ assetId, headline, caption })), title: record.creativeDirection.title, openingLine: record.creativeDirection.openingLine, closingLine: record.creativeDirection.closingLine, openingAssetId: selected[0], closingAssetId: selected.at(-1), sectionWriting: structuredClone(groups), presentation: { format: 'canvas', ...structuredClone(settings) } }; }
function state() { return { ...draft().creativeDirection, format: 'canvas', selected, canvas, headlines: {}, captions: {}, editorial: { introduction: '', sections: [] } }; }

test('Canvas supports six to eighteen, and shares identical browser/server checkpoint rules', () => {
  assert.equal(readFileSync(new URL('../src/constants/canvas.js', import.meta.url), 'utf8'), readFileSync(new URL('../../client/src/utils/canvas.js', import.meta.url), 'utf8'));
  for (const count of [6, 8, 12, 18]) assert.ok(validShowcase('canvas', ids.slice(0, count), new Set(ids)));
  for (const count of [5, 19]) assert.equal(validShowcase('canvas', ids.slice(0, count), new Set(ids)), false);
  assert.equal(presentationSchema.safeParse({ format: 'canvas', ...canvas }).success, true);
  assert.equal(canvasIssues(checkpoints, sections, selected), '');
  assert.equal(sectionIssues(sections, 'canvas', selected, checkpoints), '');
  assert.ok(sectionIssues(sections, 'chapters', selected, checkpoints));
});
test('malformed and legacy Canvas keep each visible photograph exactly once without inventing groups', () => {
  for (const count of [3, 6, 8, 12, 18]) {
    const known = ids.slice(0, count), legacy = { curatedAssetIds: known, creativeDirection: { sections: [{ id: 'showcase', assetIds: known }] } };
    assert.deepEqual(canvasCheckpoints(legacy).flatMap(point => point.assetIds), known);
    assert.ok(canvasCheckpoints(legacy).every(point => point.type === 'photo'));
  }
  const record = draft(); record.formatConfig.canvas.checkpoints.push(checkpoints[0], { id: 'foreign', type: 'photo', assetId: ids[18] });
  assert.deepEqual(canvasCheckpoints(record).flatMap(point => point.assetIds), selected);
  assert.equal(new Set(canvasCheckpoints(record).map(point => point.id)).size, checkpoints.length);
  record.formatConfig.canvas.checkpoints = [null, 'bad', { id: 'missing', type: 'group', sectionId: 'unknown' }];
  assert.deepEqual(canvasCheckpoints(record).flatMap(point => point.assetIds), selected);
});

test('Canvas upgrades automatic still defaults and saves the photographer motion choice', async () => {
  const record = draft();
  delete record.formatConfig.canvas.photoMotion;
  record.creativeDirection.frames.forEach(frame => { frame.motion = 'still'; });
  const findOne = Delivery.findOne;
  Delivery.findOne = async () => record;
  try {
    const res = response();
    await v3Showcase({ params: { id: record._id }, user: { id: 'owner' }, body: input(record) }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(record.creativeDirection.frames.map(frame => frame.motion), ['slow-push', 'pan-left', 'slow-pull', 'pan-right', 'float', 'slow-push']);
    assert.equal(canvasSettings(record).photoMotion, 'gentle');
    const still = response();
    await v3Showcase({ params: { id: record._id }, user: { id: 'owner' }, body: input(record, { ...canvas, photoMotion: 'still' }) }, still);
    assert.equal(still.statusCode, 200);
    assert.equal(canvasSettings(record).photoMotion, 'still');
    assert.equal(presentationSchema.safeParse({ format: 'canvas', ...canvas, photoMotion: 'fast' }).success, false);
  } finally { Delivery.findOne = findOne; }
});
test('checkpoint save/reload invalidates approval and keeps focal points; all-single save removes old groups', async t => {
  const record = draft(); t.mock.method(Delivery, 'findOne', query => { assert.equal(query.userId, 'owner'); return record; });
  const req = { params: { id: record._id }, user: { id: 'owner' }, body: input(record) }, res = response();
  await v3Showcase(req, res); assert.equal(res.statusCode, 200, JSON.stringify(res.body)); assert.ok(record.saved); assert.equal(record.v3.approvedRevision, null);
  assert.deepEqual(canvasSettings(record), canvas); assert.equal(record.creativeDirection.frames[0].focalPoint, '35% 40%');
  const singles = { ...canvas, checkpoints: selected.map((assetId, index) => ({ id: `photo-${index}`, type: 'photo', assetId })) };
  await v3Showcase({ ...req, body: input(record, singles, []) }, response()); assert.deepEqual(record.creativeDirection.sections, []); assert.deepEqual(canvasSettings(record), singles);
});
test('invalid coverage, missing group, foreign photographs and duplicate checkpoints fail before save', async t => {
  for (const points of [checkpoints.slice(1), [...checkpoints, checkpoints[0]], checkpoints.map(point => point.type === 'group' ? { ...point, sectionId: 'foreign' } : point), checkpoints.map((point, index) => index === 0 ? { ...point, assetId: ids[18] } : point)]) {
    const record = draft(); t.mock.method(Delivery, 'findOne', () => record); const res = response();
    await v3Showcase({ params: { id: record._id }, user: { id: 'owner' }, body: input(record, { ...canvas, checkpoints: points }) }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(res.body)); assert.equal(record.saved, undefined);
  }
});
test('theme changes validate checkpoint ownership and unowned delivery never saves', async t => {
  const record = draft(); t.mock.method(Delivery, 'findOne', () => record);
  const res = response(); await v3Theme({ params: { id: record._id }, user: { id: 'owner' }, body: { palette: { background: '#ffffff', surface: '#ffffff', text: '#111111', accent: '#9d341e' }, typography: { display: 'Playfair Display', body: 'Outfit' }, presentation: { format: 'canvas', ...canvas, checkpoints: [{ id: 'foreign', type: 'photo', assetId: ids[18] }] } } }, res); assert.equal(res.statusCode, 400); assert.equal(record.saved, undefined);
  t.mock.method(Delivery, 'findOne', () => null); const missing = response(); await v3Showcase({ params: { id: record._id }, user: { id: 'another' }, body: input(record) }, missing); assert.equal(missing.statusCode, 409); assert.equal(record.saved, undefined);
});
test('scoped links remove hidden individual and group checkpoint references', () => {
  const record = draft(), source = JSON.stringify(record), visible = new Set([selected[0], selected[3]]);
  const scoped = scopedPresentation(record.formatConfig, visible, record.creativeDirection.sections);
  assert.deepEqual(scoped.canvas.checkpoints.map(point => point.assetId), [selected[0], selected[3]]); assert.equal(JSON.stringify(record), source);
});
test('photo swaps review affected group copy; manual text is protected and Undo restores structure', () => {
  const before = state(), swapped = planPhotoWritingChange(before, { mode: 'replace', index: 1, assetId: ids[6] });
  assert.deepEqual(swapped.next.sections[0].assetIds, [ids[6], selected[2]]); assert.equal(swapped.next.canvas.checkpoints[1].id, 'group-point');
  assert.equal(swapped.blocks.length, 2);
  const reviewed = applyWritingReview(swapped.next, swapped.blocks, swapped.blocks.map(block => ({ key: block.key, text: 'New group wording.' })), new Set(['section:together:title']));
  assert.equal(reviewed.next.sections[0].title, 'Together'); assert.equal(reviewed.suggestions.length, 1);
  const restored = undoWritingChange(reviewed.next, before, reviewed.next); assert.deepEqual(restored.selected, selected); assert.equal(JSON.stringify(restored.sections), JSON.stringify(sections)); assert.deepEqual(restored.canvas, canvas);
  const added = planPhotoWritingChange(before, { mode: 'add', assetId: ids[6] }); assert.equal(added.next.canvas.checkpoints.at(-1).type, 'photo'); assert.deepEqual(added.next.sections, sections);
  const grouped = planPhotoWritingChange(before, { mode: 'add', assetId: ids[6], groupId: 'together' }); assert.ok(grouped.next.sections[0].assetIds.includes(ids[6])); assert.equal(canvasIssues(grouped.next.canvas.checkpoints, grouped.next.sections, grouped.next.selected), '');
});
test('legacy body notes survive a save and manual note clearing does not revive them', async t => {
  assert.ok(validWritingBlock({ kind: 'section-body', key: 'section:together:body', text: 'A'.repeat(150) }, 'canvas'));
  assert.equal(writingBlockLimit({ kind: 'section-body' }, 'canvas'), 120);
  const record = draft(); record.creativeDirection.sections[0] = { ...record.creativeDirection.sections[0], subtitle: '', body: 'Courage, keep these two portraits from your graduation together.' };
  t.mock.method(Delivery, 'findOne', () => record);
  const res = response(); await v3Showcase({ params: { id: record._id }, user: { id: 'owner' }, body: input(record, canvas, record.creativeDirection.sections) }, res);
  assert.equal(res.statusCode, 200); assert.equal(canvasCheckpoints(record)[1].note, 'Courage, keep these two portraits from your graduation together.');
  const before = { ...state(), sections: record.creativeDirection.sections };
  const swapped = planPhotoWritingChange(before, { mode: 'replace', index: 1, assetId: ids[6] });
  assert.ok(swapped.blocks.some(block => block.key === 'section:together:body'));
  const review = applyWritingReview(swapped.next, swapped.blocks, swapped.blocks.map(block => ({ key: block.key, text: block.key.endsWith(':body') ? '' : block.text })), new Set());
  assert.equal(canvasCheckpoints({ curatedAssetIds: review.next.selected, creativeDirection: { sections: review.next.sections }, formatConfig: { canvas: review.next.canvas } })[1].note, '');
});
test('Canvas group suggestions use shoot context, repair duplicate membership and allow individual checkpoints', async t => {
  const key = process.env.ALIBABA_MODEL_STUDIO_API_KEY, base = process.env.ALIBABA_BASE_URL; process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test'; process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  t.after(() => { if (key === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY; else process.env.ALIBABA_MODEL_STUDIO_API_KEY = key; if (base === undefined) delete process.env.ALIBABA_BASE_URL; else process.env.ALIBABA_BASE_URL = base; });
  const calls = []; let attempt = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { const call = JSON.parse(options.body); calls.push(call); const result = ++attempt === 1 ? { sections: [{ title: 'Together', assetIds: [selected[0], selected[0]] }] } : { sections: [{ title: 'Graduation portraits', subtitle: '', assetIds: selected.slice(1, 3) }] }; return Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: JSON.stringify(result) } }] }); });
  const groups = await groupV3Sections({ format: 'canvas', shootType: 'Graduation', clientName: 'Courage', brief: 'Courage’s graduation portraits.' }, selected.map(assetId => ({ assetId, summary: 'A studio graduation portrait.' })), selected);
  assert.equal(calls.length, 2); assert.deepEqual(groups[0].assetIds, selected.slice(1, 3)); assert.match(calls[0].messages[0].content, /individual checkpoints/); assert.match(JSON.stringify(calls[0].messages[1].content), /graduation/i);
  const points = canvasCheckpoints({ curatedAssetIds: selected, creativeDirection: { sections: groups } }); assert.equal(points.filter(point => point.type === 'photo').length, 4); assert.equal(new Set(points.flatMap(point => point.assetIds)).size, 6);
});
