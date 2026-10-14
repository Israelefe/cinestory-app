import assert from 'node:assert/strict';
import test from 'node:test';
import Delivery from '../src/models/Delivery.js';
import { editorialDraftIssues, writeEditorialDirection } from '../src/services/editorialDirection.service.js';
import { directV3, regenerateV3Caption } from '../src/services/deliveryV3AI.service.js';
import { deliveryWritingContext, deliveryWritingCue, requiresDirectAddress, shootWritingIssues } from '../src/constants/deliveryWriting.js';
import { DELIVERY_WRITING_VERSION } from '../src/constants/deliveryWritingLimits.js';
import { unsupportedWritingAddress } from '../src/utils/deliveryWritingIdentity.js';

const ids = Array.from({ length: 5 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`);
const personal = { format: 'editorial', shootType: 'Birthday', clientName: 'Ada', brief: "Ada's 30th birthday portraits." };
const rows = ids.map(assetId => ({ assetId, summary: 'A seated portrait with an emerald suit and an ivory telephone.', score: 8 }));
const frames = ids.map((assetId, index) => ({ assetId, headline: ['Your birthday portraits', 'A birthday to keep', 'Your own birthday pace', 'Time for your priorities', 'A record for Ada'][index], caption: ['Ada, this birthday is yours to mark in your own way.', 'Your birthday portraits are here to keep.', 'Take this birthday at your own pace, Ada.', 'Ada, may this year leave you time for what matters.', 'Keep a record of this birthday for yourself.'][index] }));
const feature = () => ({ title: "Ada's birthday portraits", openingLine: 'A birthday portrait feature for Ada.', closingLine: 'Your complete birthday collection follows.', introduction: '', frames: structuredClone(frames), sections: [{ title: 'Birthday portraits for Ada', body: '', assetIds: ids }] });

function model(t, reply) {
  const settings = { GROQ_API_KEY: 'offline-test-key', ALIBABA_MODEL_STUDIO_API_KEY: '' };
  const before = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const call = JSON.parse(options.body);
    calls.push(call);
    return Response.json({ usage: { total_tokens: 1 }, choices: [{ message: { content: JSON.stringify(reply(call)) } }] });
  });
  return calls;
}

test('Editorial creation keeps purpose and client context when given a real database document', async () => {
  const delivery = new Delivery(personal);
  let calls = 0;
  const result = await writeEditorialDirection(async () => { calls++; return feature(); }, delivery, rows, ids, text => unsupportedWritingAddress(text, delivery));
  assert.equal(calls, 1);
  assert.deepEqual(result.frames.map(frame => frame.caption), frames.map(frame => frame.caption));
  assert.deepEqual(editorialDraftIssues({ ...result, introduction: result.editorial.introduction }, ids, text => unsupportedWritingAddress(text, delivery), delivery, rows), []);
});

test('Editorial recovery uses a database document purpose instead of accepting outfit descriptions', async () => {
  const delivery = new Delivery(personal);
  const rejected = feature();
  rejected.frames[0] = { assetId: ids[0], headline: 'The emerald suit', caption: 'Ada sits holding an ivory telephone.' };
  let photoRepairs = 0;
  const result = await writeEditorialDirection(async (system, prompt) => {
    if (system.startsWith('Return JSON {"headline"')) {
      photoRepairs++;
      assert.match(prompt, /Ada's 30th birthday portraits/);
      return { headline: 'The emerald suit', caption: 'Ada sits holding an ivory telephone.' };
    }
    return structuredClone(rejected);
  }, delivery, rows, ids, text => unsupportedWritingAddress(text, delivery), { resume: structuredClone(rejected) });
  assert.equal(photoRepairs, 2);
  assert.doesNotMatch(result.frames[0].caption, /suit|telephone|sits|holding/i);
  assert.deepEqual(result.frames.slice(1).map(frame => frame.caption), frames.slice(1).map(frame => frame.caption));
});

test('a fashion treatment cannot override a personal birthday purpose, while real lookbooks keep product context', () => {
  const birthday = { ...personal, shootType: 'Fashion' };
  assert.equal(deliveryWritingContext(birthday).style, 'personal');
  assert.equal(deliveryWritingContext(birthday).shoot, 'birthday');
  assert.equal(requiresDirectAddress(birthday), true);
  assert.equal(deliveryWritingCue(rows[0], birthday), '');
  const lookbook = { ...birthday, brief: 'Finished photographs for an emerald suit lookbook.' };
  assert.equal(deliveryWritingContext(lookbook).style, 'commercial');
  assert.match(deliveryWritingCue(rows[0], lookbook), /emerald suit/);
});

test('personal Editorial captions cannot pass by attaching birthday language to an outfit report', () => {
  for (const caption of ['Your birthday is yours to mark. Ada wears an emerald suit.', 'Your birthday portraits show you holding a telephone.', 'Ada wears a suit for your birthday.']) {
    assert.ok(shootWritingIssues(caption, personal, { caption: true, observation: rows[0].summary }).some(issue => /purpose/.test(issue)));
  }
  assert.deepEqual(shootWritingIssues('Your birthday is a reason to pause. Keep room for the things that make you smile.', personal, { caption: true }), []);
  assert.deepEqual(shootWritingIssues('May you keep holding onto what matters to you this birthday.', personal, { caption: true }), []);
});

test('Editorial rejects facial-expression reports, decorative praise and thoughts detached from the purpose', () => {
  for (const caption of ['Your smile opens the door to a fresh decade.', 'Your smile captures the quiet confidence that deepens with each birthday.', 'Your grin expresses the love and gratitude you feel on this birthday.', 'You carry timeless joy into your birthday.', 'Your curiosity shines, encouraging you to keep exploring new possibilities.', 'Your thirty years are a collection of small victories.', 'This portrait records the feeling of your thirtieth year.', 'Let this picture capture the calm of your birthday celebration.', 'Consider this image a placeholder for stories after thirty.']) {
    assert.ok(shootWritingIssues(caption, personal, { caption: true }).length);
  }
  const ungrounded = feature();
  ungrounded.frames[0] = { assetId: ids[0], headline: 'Future Glimpse', caption: 'You carry happiness into the days ahead.' };
  assert.ok(editorialDraftIssues(ungrounded, ids, text => unsupportedWritingAddress(text, personal), personal, rows).some(issue => /purpose/.test(issue)));
});

test('personal Editorial writing receives the same light cue as Photo Story instead of full outfit notes', async () => {
  const delivery = new Delivery(personal);
  let calls = 0;
  await writeEditorialDirection(async (system, prompt) => {
    calls++;
    const supplied = JSON.parse(prompt);
    assert.equal(supplied.purpose, personal.brief);
    assert.ok(supplied.photographs.every(photo => photo.cue === '' && photo.observation === undefined));
    assert.doesNotMatch(prompt, /emerald|suit|telephone|seated/i);
    assert.match(system, /same purpose-first writing as Photo Story/);
    assert.doesNotMatch(system, /identify this photograph.s particular view or action/);
    return feature();
  }, delivery, rows, ids, text => unsupportedWritingAddress(text, delivery));
  assert.equal(calls, 1);
  const smiling = { summary: rows[0].summary + ' A visible smile.' };
  assert.equal(deliveryWritingCue(smiling, personal), deliveryWritingCue(smiling, { ...personal, format: 'photo-story' }));
});

test('Editorial caption regeneration excludes rejected clothing text and leaves saved wording unchanged', async t => {
  const delivery = new Delivery({ ...personal, creativeDirection: { frames: structuredClone(frames) } });
  const before = structuredClone(delivery.creativeDirection);
  const calls = model(t, call => {
    const prompt = call.messages[1].content[0].text;
    assert.match(prompt, /Ada's 30th birthday portraits/);
    assert.doesNotMatch(prompt, /emerald|suit|telephone|seated/i);
    return { headline: 'Your day to pause', caption: 'Take this birthday as a reason to make time for yourself.' };
  });
  const result = await regenerateV3Caption(delivery, rows[0], '', { headline: 'The emerald suit', caption: 'Ada holds an ivory telephone.' });
  assert.equal(calls.length, 1);
  assert.match(result.caption, /birthday/);
  assert.deepEqual(delivery.creativeDirection, before);
});

test('an old Editorial checkpoint is rewritten with purpose and identity intact on a real database document', async t => {
  const delivery = new Delivery(personal);
  const old = feature();
  old.frames[0] = { assetId: ids[0], headline: 'The emerald suit', caption: 'Ada sits holding an ivory telephone.' };
  const checkpoints = [];
  model(t, call => call.messages[0].content.startsWith('Return JSON {"palette"') ? { palette: {} } : feature());
  const resume = { selected: ids, writingVersion: 'purpose-grounded-v2', editorial: { ...old, editorial: { introduction: '' } }, editorialDraft: old };
  const before = structuredClone(resume);
  const result = await directV3(delivery, rows, { resume, checkpoint: async value => checkpoints.push(value) });
  assert.equal(result.direction.writingVersion, DELIVERY_WRITING_VERSION);
  assert.deepEqual(result.direction.frames.map(frame => frame.caption), frames.map(frame => frame.caption));
  assert.ok(checkpoints.some(value => value.writingVersion === DELIVERY_WRITING_VERSION));
  assert.deepEqual(resume, before);
});

test('malformed model repair responses cannot strand Editorial creation, while real provider failures still surface', async () => {
  const delivery = new Delivery(personal);
  const rejected = feature();
  rejected.frames[0] = { assetId: ids[0], headline: 'The emerald suit', caption: 'Ada sits holding an ivory telephone.' };
  const result = await writeEditorialDirection(async system => {
    if (system.startsWith('Return JSON {"headline"')) throw Object.assign(new Error('Malformed response.'), { code: 'V3_INVALID_AI_RESPONSE' });
    return structuredClone(rejected);
  }, delivery, rows, ids, text => unsupportedWritingAddress(text, delivery));
  assert.deepEqual(result.frames.slice(1).map(frame => frame.caption), frames.slice(1).map(frame => frame.caption));
  assert.doesNotMatch(result.frames[0].caption, /emerald|telephone|seated|wearing/);
  const outage = Object.assign(new Error('Provider unavailable.'), { code: 'V3_AI_REQUEST_FAILED' });
  await assert.rejects(writeEditorialDirection(async () => { throw outage; }, delivery, rows, ids, () => false), error => error === outage);
});
