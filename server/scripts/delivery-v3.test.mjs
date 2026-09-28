import assert from 'node:assert/strict';
import test from 'node:test';
import { V3_FORMATS, contrastRatio, validShowcase } from '../src/constants/deliveryV3.js';
import { analyzeAllV3, directV3, improvePurpose, recommendV3Format, regenerateV3Caption, repickV3Palette } from '../src/services/deliveryV3AI.service.js';
import { narrationLine, NARRATION_RENDER_VERSION } from '../src/services/narration.service.js';

const ids = Array.from({ length: 25 }, (_, index) => 'asset-' + index);
const narrativeHeadlines = ['Twenty-five begins', "Ada's Birthday Year", 'Ada at Twenty-Five', "Ada's Next Birthday", "Ada's Birthday, Her Terms", 'Twenty-Five, Ada’s Way', 'Ada Turns Twenty-Five', 'A Birthday for Ada', "Ada's Celebration Ahead", 'Birthday Year for Ada'];
const narrativeCaptions = [
  'Ada, turning twenty-five is a chance to celebrate how far you have come and choose what matters most in the year ahead.',
  'May the year ahead give Ada room for new choices, fresh plans, and more time for the things she wants to enjoy.',
  'Turning twenty-five gives Ada another reason to pause, mark the day, and look forward to what she wants from this next year.',
  "This celebration puts Ada's twenty-fifth birthday at the centre, with a new year ahead to shape in her own way.",
  'Ada can take this birthday as a moment to look ahead, keep what matters close, and choose what comes next.',
  'Twenty-five brings a fresh point to celebrate Ada and make space for the choices she wants to carry into the next year.',
  "Ada's next year starts here, with a chance to hold onto the things she values and make room for new possibilities.",
  'The birthday marks twenty-five years for Ada and leaves the next chapter open for her to shape at her own pace.',
  'Ada, this celebration honours your twenty-fifth birthday while leaving room for the plans and possibilities still ahead together.',
  "Ada's twenty-fifth birthday belongs to her, and the year ahead can be shaped around what she wants to do next."
];
test('each format enforces its own inclusive showcase bounds and known unique assets', () => {
  for (const [format, [minimum, maximum]] of Object.entries(V3_FORMATS)) {
    const known = new Set(ids);
    assert.equal(validShowcase(format, ids.slice(0, minimum), known), true, format);
    assert.equal(validShowcase(format, ids.slice(0, maximum), known), true, format);
    assert.equal(validShowcase(format, ids.slice(0, minimum - 1), known), false, format);
    assert.equal(validShowcase(format, ids.slice(0, maximum + 1), known), false, format);
    assert.equal(validShowcase(format, [...ids.slice(0, minimum - 1), ids[0]], known), false, format);
    assert.equal(validShowcase(format, [...ids.slice(0, minimum - 1), 'foreign'], known), false, format);
  }
});

test('theme contrast check distinguishes readable and unreadable colour pairs', () => {
  assert.ok(contrastRatio('#0c0c10', '#fffaf6') > 4.5);
  assert.ok(contrastRatio('#ffffff', '#eeeeee') < 4.5);
});

test('palette repicking retries the current palette and keeps both text contrasts readable', async () => {
  const calls = [];
  const restore = mockModel([
    { palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' } },
    { palette: { background: '#101820', surface: '#26333a', text: '#fffaf6', accent: '#e7a96c' } }
  ], calls);
  try {
    const palette = await repickV3Palette({
      format: 'photo-story',
      brief: "Lora's 25th birthday celebration",
      shootType: 'Birthday',
      imageColors: [{ assetId: 'asset-1', colors: ['#e88761', '#184a3f'] }],
      currentPalette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }
    });
    assert.deepEqual(palette, { background: '#101820', surface: '#26333a', text: '#fffaf6', accent: '#e7a96c' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].model, 'deepseek-v4.1-flash');
    assert.ok(contrastRatio(palette.background, palette.text) >= 4.5);
    assert.ok(contrastRatio(palette.surface, palette.text) >= 4.5);
  } finally { restore(); }
});

test('narration turns dashes into natural sentence pauses and keeps ordinary hyphenated words', () => {
  assert.equal(narrationLine('Nothing staged about this laugh — it is the sound of a birthday feeling exactly right.'), 'Nothing staged about this laugh. It is the sound of a birthday feeling exactly right.');
  assert.equal(narrationLine('Twenty-five years, one good day.'), 'Twenty-five years, one good day.');
  assert.equal(NARRATION_RENDER_VERSION, 'flux-hannah-captions-v6');
});

function mockModel(responses, calls) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const previousBase = process.env.ALIBABA_BASE_URL;
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key';
  process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(responses.shift()) } }] }) };
  };
  return () => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY;
    else process.env.ALIBABA_MODEL_STUDIO_API_KEY = previousKey;
    if (previousBase === undefined) delete process.env.ALIBABA_BASE_URL;
    else process.env.ALIBABA_BASE_URL = previousBase;
  };
}

test('V3 retries a throttled model request', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const previousBase = process.env.ALIBABA_BASE_URL;
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key';
  process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 429, headers: { get: () => '0' } };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ improved: "Ada's 25th birthday celebration" }) } }] }) };
  };
  try {
    assert.equal(await improvePurpose({ purpose: 'Ada 25th birthday celebration', shootType: 'Birthday' }), "Ada's 25th birthday celebration");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY;
    else process.env.ALIBABA_MODEL_STUDIO_API_KEY = previousKey;
    if (previousBase === undefined) delete process.env.ALIBABA_BASE_URL;
    else process.env.ALIBABA_BASE_URL = previousBase;
  }
});

test('purpose improvement returns only the edited purpose when the model echoes field labels', async () => {
  const calls = [];
  const restore = mockModel([{ improved: "Shoot type: Birthday\nPhotographer's purpose: Celebrating Lora's 25th birthday." }], calls);
  try {
    assert.equal(await improvePurpose({ purpose: 'Lora 25th Birthday Celebration', shootType: 'Birthday' }), "Celebrating Lora's 25th birthday.");
    const userText = calls[0].messages[1].content[0].text;
    assert.deepEqual(JSON.parse(userText), { shootType: 'Birthday', purpose: 'Lora 25th Birthday Celebration' });
  } finally { restore(); }
});

test('purpose improvement rejects unrelated model text', async () => {
  const restore = mockModel([{ improved: 'Shoot type: Birthday\nA lovely day full of joy.' }], []);
  try {
    await assert.rejects(improvePurpose({ purpose: 'Lora 25th Birthday Celebration', shootType: 'Birthday' }), { code: 'V3_INVALID_AI_RESPONSE' });
  } finally { restore(); }
});

test('purpose improvement asks again when the first suggestion exactly echoes the source', async () => {
  const calls = [];
  const restore = mockModel([
    { improved: 'Lora 25th Birthday Celebration' },
    { improved: "Celebrating Lora's 25th birthday." }
  ], calls);
  try {
    assert.equal(await improvePurpose({ purpose: 'Lora 25th Birthday Celebration', shootType: 'Birthday' }), "Celebrating Lora's 25th birthday.");
    assert.equal(calls.length, 2);
  } finally { restore(); }
});

test('personal birthdays recommend Photo Story while whole events recommend Event Coverage', async () => {
  const birthday = await recommendV3Format('Birthday', "Ada's 25th birthday celebration");
  const event = await recommendV3Format('Event', 'Annual studio gathering');
  const commercial = await recommendV3Format('Fashion', 'Lookbook and product campaign assets');
  assert.equal(birthday.format, 'photo-story');
  assert.match(birthday.reason, /person being celebrated/i);
  assert.equal(event.format, 'event-coverage');
  assert.match(event.reason, /multiple people, scenes/i);
  assert.equal(commercial.format, 'campaign');
});

test('Photo Story chooses a bounded selection and writes distinct purpose-led headlines and substantial captions', async () => {
  const calls = [];
  const selected = ids.slice(0, 10);
  const restore = mockModel([
    { assetIds: selected },
    {
      title: "Ada's 25th birthday",
      openingLine: "Ada, your birthday photographs are ready.",
      closingLine: "Here is the full collection from your celebration.",
      frames: selected.map((assetId, index) => ({ assetId, headline: narrativeHeadlines[index], caption: narrativeCaptions[index] }))
    },
    {
      palette: { background: '#101010', surface: '#202020', text: '#ffffff', accent: '#ff5a47' },
      typography: { display: 'Playfair Display', body: 'Outfit' }
    }
  ], calls);
  try {
    const delivery = { format: 'photo-story', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday", v3: { clarificationAnswers: [] } };
    const insights = ids.slice(0, 12).map((assetId, index) => ({ assetId, score: 10 - index / 10, summary: 'Visible birthday portrait ' + index }));
    const result = await directV3(delivery, insights);
    assert.deepEqual(result.selected, selected);
    assert.equal(result.direction.frames.length, 10);
    assert.equal(result.direction.frames.every(frame => frame.textAnimation === 'typewriter'), true);
    assert.equal(result.direction.frames[0].headline, 'Twenty-five begins');
    assert.equal(new Set(result.direction.frames.map(frame => frame.headline)).size, 10);
    assert.ok(result.direction.frames[0].caption.length > 95);
    assert.ok(result.direction.frames.every(frame => frame.caption.length <= 150));
    assert.ok(result.direction.frames.every(frame => frame.caption.split(/\s+/).length >= 18));
    const narrativePrompt = calls[1].messages[1].content[0].text;
    const narrativeGuidance = calls[1].messages[0].content;
    assert.equal(narrativePrompt.includes('Visible birthday portrait'), true);
    assert.match(narrativePrompt, /Ada's 25th birthday/);
    assert.match(narrativeGuidance, /The Year Ahead.*too broad/);
    assert.match(narrativeGuidance, /thoughtful message from the photographer/);
    assert.equal(selected.includes(result.openingAssetId), false);
    assert.equal(selected.includes(result.closingAssetId), false);
    assert.notEqual(result.openingAssetId, result.closingAssetId);
    assert.equal(calls.every(call => call.model === 'deepseek-v4.1-flash'), true);
  } finally { restore(); }
});

test('short or generic first-pass captions are repaired before the showcase is saved', async () => {
  const calls = [];
  const selected = ids.slice(0, 10);
  const restore = mockModel([
    { assetIds: selected },
    {
      title: "Ada's 25th birthday",
      openingLine: 'These photographs are for your birthday.',
      closingLine: 'Here is the full collection.',
      frames: selected.map(assetId => ({ assetId, headline: 'The photograph', caption: 'A photograph.' }))
    },
    { frames: selected.map((assetId, index) => ({ assetId, headline: narrativeHeadlines[index], caption: narrativeCaptions[index] })) },
    { palette: { background: '#101010', surface: '#202020', text: '#ffffff', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } }
  ], calls);
  try {
    const result = await directV3({ format: 'photo-story', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", v3: {} }, ids.slice(0, 12).map((assetId, index) => ({ assetId, score: 10 - index / 10, summary: 'Birthday portrait ' + index })));
    assert.equal(calls.length, 4);
    assert.equal(result.direction.frames.every(frame => frame.headline !== 'The photograph'), true);
    assert.equal(result.direction.frames.every(frame => frame.caption.split(/\s+/).length >= 18), true);
    assert.equal(result.direction.frames[0].headline, 'Twenty-five begins');
    assert.match(calls[2].messages[1].content[0].text, /Let the photographer’s purpose supply nearly all the meaning/);
  } finally { restore(); }
});

test('persistently weak copy falls back to text tied to the photographer’s purpose', async () => {
  const selected = ids.slice(0, 10);
  const weakFrames = selected.map(assetId => ({ assetId, headline: 'The photograph', caption: 'A woman smiles at the camera in a beautiful portrait taken on a lovely day.' }));
  const restore = mockModel([
    { assetIds: selected },
    { frames: weakFrames },
    { frames: weakFrames },
    { palette: { background: '#101010', surface: '#202020', text: '#ffffff', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } }
  ], []);
  try {
    const result = await directV3({ format: 'photo-story', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 25th birthday celebration", v3: {} }, ids.slice(0, 12).map((assetId, index) => ({ assetId, score: 10 - index / 10, summary: 'A person smiling.' })));
    assert.equal(result.direction.frames[0].headline, "Ada's 25th birthday celebration");
    assert.match(result.direction.frames[0].caption, /Ada's 25th birthday celebration/);
    assert.ok(result.direction.frames[0].caption.split(/\s+/).length >= 18);
  } finally { restore(); }
});

test('regenerated headline and caption use the purpose with only a light image cue', async () => {
  const calls = [];
  const restore = mockModel([{ headline: 'Ada at Twenty-Five', caption: 'Ada, turning twenty-five is a chance to celebrate how far you have come and choose what matters most in the year ahead.' }], calls);
  try {
    const text = await regenerateV3Caption({ format: 'photo-story', brief: "Ada's 25th birthday", shootType: 'Birthday', v3: {} }, { summary: 'A woman smiles at the camera.' });
    assert.deepEqual(text, { headline: 'Ada at Twenty-Five', caption: 'Ada, turning twenty-five is a chance to celebrate how far you have come and choose what matters most in the year ahead.' });
    assert.match(calls[0].messages[1].content[0].text, /A woman smiles at the camera/);
    assert.match(calls[0].messages[0].content, /18-24 words/);
  } finally { restore(); }
});

test('invalid model selection fails instead of silently selecting other photos', async () => {
  const calls = [];
  const restore = mockModel([{ assetIds: Array(10).fill(ids[0]) }], calls);
  try {
    const delivery = { format: 'photo-story', clientName: 'Ada', shootType: 'Birthday', brief: 'Birthday portraits', v3: {} };
    const insights = ids.slice(0, 12).map(assetId => ({ assetId, score: 5, summary: 'Portrait' }));
    await assert.rejects(() => directV3(delivery, insights), { code: 'V3_INVALID_SELECTION' });
  } finally { restore(); }
});

test('vision batches grow, shrink at the provider limit, and analyse every photo', async () => {
  const previous = Object.fromEntries(['ALIBABA_MODEL_STUDIO_API_KEY', 'ALIBABA_BASE_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    ALIBABA_MODEL_STUDIO_API_KEY: 'test-key',
    ALIBABA_BASE_URL: 'https://test.aliyuncs.com/compatible-mode/v1',
    CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret'
  });
  const previousFetch = globalThis.fetch;
  const sizes = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'deepseek-v4.1-flash');
    assert.equal(body.enable_thinking, false);
    const imageCount = body.messages[1].content.filter(part => part.type === 'image_url').length;
    sizes.push(imageCount);
    if (imageCount > 30) return { ok: false, status: 413 };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ images: Array.from({ length: imageCount }, (_, index) => ({ index, summary: `Visible photo ${index}`, score: 7, colors: ['#ff5a47'] })) }) } }] }) };
  };
  try {
    const assets = Array.from({ length: 90 }, (_, index) => ({ assetId: `photo-${index}`, publicId: `test/photo-${index}`, sortOrder: index }));
    const progress = [];
    const result = await analyzeAllV3({ assets, shootType: 'Birthday', brief: 'Ada turned 25', collectionAnalysis: {} }, (done, total) => progress.push([done, total]));
    assert.equal(result.length, 90);
    assert.equal(new Set(result.map(item => item.assetId)).size, 90);
    assert.ok(sizes.some(size => size > 30));
    assert.ok(sizes.some(size => size < 30));
    assert.deepEqual(progress.at(-1), [90, 90]);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
