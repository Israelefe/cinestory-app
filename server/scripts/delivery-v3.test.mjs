import assert from 'node:assert/strict';
import test from 'node:test';
import { V3_FORMATS, contrastRatio, validShowcase } from '../src/constants/deliveryV3.js';
import { analyzeAllV3, calmGridboardPalette, directV3, directV3Pinboard, improvePurpose, nextGridboardPalette, recommendV3Format, regenerateV3Caption, repickV3Palette } from '../src/services/deliveryV3AI.service.js';
import { captionSegments, generateNarration, narrationLine, NARRATION_RENDER_VERSION } from '../src/services/narration.service.js';

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

test('GridBoard palette follows dominant photograph colours and stays readable', () => {
  const orange = calmGridboardPalette([{ colors: ['#b95732', '#b95732'] }, { colors: ['#b95732', '#204c78'] }, { colors: ['#c45d35'] }]);
  const blue = calmGridboardPalette([{ colors: ['#285e93'] }, { colors: ['#285e93'] }, { colors: ['#bb6038'] }]);
  for (const palette of [orange, blue]) {
    assert.ok(contrastRatio(palette.background, palette.text) >= 4.5);
    assert.ok(contrastRatio(palette.surface, palette.text) >= 4.5);
  }
  const channel = (hex, index) => parseInt(hex.slice(index, index + 2), 16);
  assert.ok(channel(orange.accent, 1) > channel(orange.accent, 5));
  assert.ok(channel(blue.accent, 5) > channel(blue.accent, 1));
});

test('GridBoard offers many mixed and related photo palettes without losing contrast', () => {
  for (const colors of [[{ colors: ['#b95732', '#204c78', '#236b47'] }], [{ colors: ['#b95732'] }], [{ colors: ['#eeeeee', '#222222'] }]]) {
    let palette = calmGridboardPalette(colors);
    const seen = new Set();
    for (let index = 0; index < 36; index += 1) {
      const next = nextGridboardPalette(colors, palette);
      assert.notDeepEqual(next, palette);
      assert.ok(contrastRatio(next.background, next.text) >= 4.5);
      assert.ok(contrastRatio(next.surface, next.text) >= 4.5);
      assert.ok(contrastRatio(next.background, next.accent) >= 3);
      assert.ok(contrastRatio(next.surface, next.accent) >= 3);
      seen.add(JSON.stringify(next));
      palette = next;
    }
    assert.ok(seen.size >= (colors[0].colors.length === 3 ? 30 : 10), `Only ${seen.size} distinct palettes`);
  }
});

test('Pinboard suggestions keep every supplied photo and produce three complete arrangements', async () => {
  const assets = Array.from({ length: 6 }, (_, index) => ({ assetId: `pinboard-photo-${index}`, sortOrder: index, width: index % 2 ? 1600 : 1000, height: index % 2 ? 1000 : 1600, analysis: undefined }));
  const current = { selectedLayoutId: 'balanced', palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' }, typography: { display: 'Playfair Display', body: 'Outfit' } };
  const calls = [];
  const restore = mockModel([{ moments: [{ title: 'Portraits', assetIds: ['pinboard-photo-0', 'pinboard-photo-1', 'foreign-photo'] }, { title: 'Details', assetIds: ['pinboard-photo-4', 'pinboard-photo-5'] }], layouts: [{ id: 'balanced', title: 'A steady mix', description: 'Portrait and landscape photographs take turns.' }, { id: 'moments', title: 'Scenes together', description: 'Related photographs sit near each other.' }, { id: 'colour-flow', title: 'Colour flow', description: 'A colour-led order moves through the gallery.' }], palette: { background: '#15201e', surface: '#23322e', text: '#fffaf6', accent: '#d5a180' }, typography: { display: 'Cormorant Garamond', body: 'DM Sans' } }], calls);
  try {
    const result = await directV3Pinboard({ title: 'A complete gallery', clientName: 'Studio client', shootType: 'Event', brief: 'A complete event gallery', assets, pinboard: current }, assets.map((asset, index) => ({ assetId: asset.assetId, summary: `Visible event detail ${index}.`, score: 8, colors: ['#e88761', '#184a3f'], momentTags: index < 3 ? ['people together'] : ['details'] })));
    const expected = assets.map(asset => asset.assetId).sort();
    assert.equal(result.layouts.length, 3);
    for (const layout of result.layouts) {
      assert.equal(layout.assetOrder.length, assets.length);
      assert.deepEqual([...layout.assetOrder].sort(), expected);
    }
    assert.deepEqual(result.moments[0].assetIds, ['pinboard-photo-0', 'pinboard-photo-1']);
    assert.ok(result.moments.every(moment => moment.assetIds.every(assetId => expected.includes(assetId))));
    assert.equal(result.analysisStatus, 'ready');
    assert.deepEqual(result.typography, current.typography);
    assert.equal(assets.length, 6);
    assert.equal(calls[0].model, 'deepseek-v4.1-flash');
    assert.match(calls[0].messages[0].content, /Do not use face recognition/);
    assert.match(calls[0].messages[0].content, /Find a Moment groups/);
    assert.match(calls[0].messages[0].content, /Similar Shot uses the separate similarityTags/);
  } finally { restore(); }
});

test('GridBoard replaces the old default palette with colours from the photographs', async () => {
  const assets = ['one', 'two'].map((assetId, sortOrder) => ({ assetId, sortOrder, width: 480, height: 640 }));
  const restore = mockModel([{ moments: [], layouts: [], palette: { background: '#10182e', surface: '#1a2740', text: '#ffffff', accent: '#437dbd' }, typography: { display: 'Cormorant Garamond', body: 'Outfit' } }], []);
  try {
    const board = await directV3Pinboard({ title: 'Birthday portraits', clientName: 'Lora', assets, pinboard: { palette: { background: '#13110f', surface: '#211b18', text: '#fff6ec', accent: '#efa57c' }, analysisStatus: 'ready' } }, assets.map(asset => ({ assetId: asset.assetId, colors: ['#b95732', '#b95732'], momentTags: [] })));
    const red = parseInt(board.palette.accent.slice(1, 3), 16);
    const blue = parseInt(board.palette.accent.slice(5, 7), 16);
    assert.ok(red > blue);
    assert.notEqual(board.palette.background, '#13110f');
    assert.notEqual(board.palette.surface, '#211b18');
    assert.ok(contrastRatio(board.palette.background, board.palette.text) >= 4.5);
  } finally { restore(); }
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

test('GridBoard repick stays with dominant colours when model suggestions drift away', async () => {
  const unrelated = { palette: { background: '#101a32', surface: '#202c46', text: '#ffffff', accent: '#4387cc' } };
  const restore = mockModel([unrelated, unrelated], []);
  try {
    const palette = await repickV3Palette({ format: 'pinboard', brief: '', shootType: '', imageColors: [{ colors: ['#b95732', '#b95732'] }, { colors: ['#bb5b35'] }], currentPalette: calmGridboardPalette([{ colors: ['#b95732'] }]) });
    assert.ok(parseInt(palette.accent.slice(1, 3), 16) > parseInt(palette.accent.slice(5, 7), 16));
    assert.ok(contrastRatio(palette.background, palette.text) >= 4.5);
    assert.ok(contrastRatio(palette.surface, palette.text) >= 4.5);
  } finally { restore(); }
});

test('Showcase avoids recent palettes and still supplies readable colours when the model repeats them', async () => {
  const calls = [];
  const current = { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' };
  const recent = { background: '#101820', surface: '#26333a', text: '#fffaf6', accent: '#e7a96c' };
  const restore = mockModel([{ palette: recent }, { palette: current }], calls);
  try {
    const next = await repickV3Palette({ format: 'canvas', brief: "Lora's birthday", shootType: 'Birthday', imageColors: [{ colors: ['#bf562a', '#114639'] }], currentPalette: current, recentPalettes: [recent] });
    assert.notDeepEqual(next, current);
    assert.notDeepEqual(next, recent);
    assert.ok(contrastRatio(next.background, next.text) >= 4.5);
    assert.ok(contrastRatio(next.surface, next.text) >= 4.5);
    assert.equal(calls.length, 2);
    assert.match(calls[0].messages[0].content, /mixtures, related hues, tints and shades/);
    assert.match(JSON.stringify(calls[0].messages[1].content), /Recent palettes not to repeat/);
  } finally { restore(); }
});

test('narration turns dashes into natural sentence pauses and keeps ordinary hyphenated words', () => {
  assert.equal(narrationLine('Nothing staged about this laugh — it is the sound of a birthday feeling exactly right.'), 'Nothing staged about this laugh. It is the sound of a birthday feeling exactly right.');
  assert.equal(narrationLine('Twenty-five years, one good day.'), 'Twenty-five years, one good day.');
  assert.equal(NARRATION_RENDER_VERSION, 'flux-captions-v7');
});

test('spoken captions that exceed one photo slot fail with a caption-specific instruction', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DEEPGRAM_API_KEY;
  let spokenText = '';
  process.env.DEEPGRAM_API_KEY = 'test-key';
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/v2/speak')) {
      spokenText = JSON.parse(options.body).text;
      return { ok: true, arrayBuffer: async () => Buffer.from('mock-audio') };
    }
    const words = spokenText.split(/\s+/).filter(Boolean).map((word, index) => ({
      punctuated_word: word,
      start: index * 0.42,
      end: index * 0.42 + 0.3
    }));
    return {
      ok: true,
      json: async () => ({
        metadata: { duration: 8 },
        results: { channels: [{ alternatives: [{ words }] }] }
      })
    };
  };
  try {
    const assetId = 'spoken-photo';
    const delivery = {
      schemaVersion: 3,
      curatedAssetIds: [assetId],
      assets: [{ assetId }],
      creativeDirection: { frames: [{ assetId, caption: 'Lora, this birthday marks a year worth celebrating and leaves room for everything she wants to make of the next one.' }] }
    };
    await assert.rejects(
      generateNarration(delivery, { speed: 1.2, maxSegmentDuration: 5.45 }),
      error => error.code === 'NARRATION_CAPTION_TOO_LONG' && /Caption 1 needs to be shorter/.test(error.message) && /fixed six-second/.test(error.message)
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = previousKey;
  }
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

test('V3 spoken captions follow the approved showcase order, not upload order', () => {
  const ordered = captionSegments({
    schemaVersion: 3,
    curatedAssetIds: ['asset-2', 'asset-0', 'asset-1'],
    assets: ids.slice(0, 3).map((assetId, sortOrder) => ({ assetId, sortOrder })),
    creativeDirection: { frames: [
      { assetId: 'asset-0', caption: 'First uploaded photograph caption.' },
      { assetId: 'asset-1', caption: 'Last uploaded photograph caption.' },
      { assetId: 'asset-2', caption: 'The chosen opening photograph caption.' }
    ] }
  });
  assert.deepEqual(ordered.map(segment => segment.assetIds[0]), ['asset-2', 'asset-0', 'asset-1']);
  assert.match(ordered[0].text, /chosen opening/);
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
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ images: Array.from({ length: imageCount }, (_, index) => ({ index, summary: `Visible photo ${index}`, score: 7, colors: ['#ff5a47'], momentTags: ['portraits'], similarityTags: [index % 2 ? 'standing pose' : 'seated pose'], colorGroups: [{ area: 'outfit', color: 'green' }, { area: 'background', color: 'cream' }] })) }) } }] }) };
  };
  try {
    const assets = Array.from({ length: 90 }, (_, index) => ({ assetId: `photo-${index}`, publicId: `test/photo-${index}`, sortOrder: index }));
    const progress = [];
    const result = await analyzeAllV3({ kind: 'pinboard', assets, shootType: 'Birthday', brief: 'Ada turned 25', collectionAnalysis: { images: [{ assetId: 'photo-0', summary: 'Old analysis without colour groups', colors: ['#ff5a47'] }] } }, (done, total) => progress.push([done, total]));
    assert.equal(result.length, 90);
    assert.equal(new Set(result.map(item => item.assetId)).size, 90);
    assert.deepEqual(result[0].colorGroups, [{ area: 'outfit', color: 'green' }, { area: 'backdrop', color: 'cream' }]);
    assert.deepEqual(result[0].similarityTags, ['seated pose']);
    assert.equal(result[0].similarAssetIds[0], 'photo-2');
    assert.ok(!result[0].similarAssetIds.includes('photo-1'), 'a shared outfit colour alone is not a similar shot');
    assert.ok(sizes.some(size => size > 30));
    assert.ok(sizes.some(size => size < 30));
    assert.deepEqual(progress.at(-1), [90, 90]);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
