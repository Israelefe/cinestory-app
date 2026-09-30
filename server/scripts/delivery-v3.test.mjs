import assert from 'node:assert/strict';
import test from 'node:test';
import { V3_FORMATS, contrastRatio, validShowcase } from '../src/constants/deliveryV3.js';
import { analyzeAllV3, calmGridboardPalette, directV3, directV3Pinboard, improvePurpose, nextGridboardPalette, recommendV3Format, regenerateV3Caption, repickV3Palette } from '../src/services/deliveryV3AI.service.js';
import { captionSegments, generateNarration, narrationLine, NARRATION_RENDER_VERSION } from '../src/services/narration.service.js';

const ids = Array.from({ length: 25 }, (_, index) => 'asset-' + index);
const narrativeHeadlines = ['Twenty-five begins', "Ada's Birthday Year", 'Ada at Twenty-Five', "Ada's Next Birthday", "Ada's Birthday, Her Terms", 'Twenty-Five, Ada’s Way', 'Ada Turns Twenty-Five', 'A Birthday for Ada', "Ada's Celebration Ahead", 'Birthday Year for Ada'];
const narrativeCaptions = [
  'Ada, turning twenty-five is a chance to celebrate how far you have come and choose what matters most in the year ahead.',
  'Ada, may the year ahead give you room for new choices, fresh plans, and more time for the things you want to enjoy.',
  'Turning twenty-five gives you another reason to pause, mark the day, and look forward to what you want from this next year.',
  "This celebration puts your twenty-fifth birthday at the centre, with a new year ahead to shape in your own way.",
  'Ada, take this birthday as a moment to look ahead, keep what matters close, and choose what comes next for you.',
  'Twenty-five brings a fresh point to celebrate you and make space for the choices you want to carry into the next year.',
  'Ada, your next year starts here, with a chance to hold onto the things you value and make room for new possibilities.',
  'This birthday marks twenty-five years for you and leaves the next chapter open for you to shape at your own pace.',
  'Ada, this celebration honours your twenty-fifth birthday while leaving room for the plans and possibilities still ahead together.',
  'Ada, this twenty-fifth birthday belongs to you, and the year ahead can be shaped around what you want to do next.'
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
  assert.equal(NARRATION_RENDER_VERSION, 'flux-captions-v8');
});

test('speech that exceeds a photo slot supplies measured fitting data without asking the photographer to edit', async () => {
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
      error => error.code === 'NARRATION_CAPTION_TOO_LONG' && error.overlongSegments[0].assetId === assetId && error.overlongSegments[0].duration > 5.45 && !/Shorten that caption|needs to be shorter/.test(error.message)
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
  let previousNarrative;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    let response;
    if (body.messages[0].content.startsWith('Review the delivery wording.') && !Array.isArray(responses[0]?.frames)) {
      response = { frames: previousNarrative?.frames || [{ assetId: 'selected-photo', ...previousNarrative }] };
    } else response = responses.shift();
    if (response?.frames || response?.caption) previousNarrative = response;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(response) } }] }) };
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
    assert.equal(narrativePrompt.includes('Visible birthday portrait'), false);
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
    assert.match(calls[2].messages[0].content, /purpose provides almost all the meaning/);
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
    assert.match(result.direction.frames[0].caption, /your 25th birthday/);
    assert.equal(new Set(result.direction.frames.map(frame => frame.caption)).size, selected.length);
    assert.ok(result.direction.frames[0].caption.split(/\s+/).length >= 18);
  } finally { restore(); }
});

test('regenerated headline and caption use the purpose with only a light image cue', async () => {
  const calls = [];
  const restore = mockModel([{ headline: 'Ada at Twenty-Five', caption: 'Ada, turning twenty-five is a chance to celebrate how far you have come and choose what matters most in the year ahead.' }], calls);
  try {
    const text = await regenerateV3Caption({ format: 'photo-story', brief: "Ada's 25th birthday", shootType: 'Birthday', v3: {} }, { summary: 'A woman smiles at the camera.' });
    assert.deepEqual(text, { headline: 'Ada at Twenty-Five', caption: 'Ada, turning twenty-five is a chance to celebrate how far you have come and choose what matters most in the year ahead.' });
    assert.match(calls[0].messages[1].content[0].text, /visible smile/);
    assert.doesNotMatch(calls[0].messages[1].content[0].text, /woman|camera/);
    assert.match(calls[0].messages[0].content, /18-24 words/);
  } finally { restore(); }
});

test('headline and caption regeneration retries malformed and empty AI responses automatically', async t => {
  const previous = { key: process.env.ALIBABA_MODEL_STUDIO_API_KEY, base: process.env.ALIBABA_BASE_URL };
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key';
  process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  t.after(() => {
    if (previous.key === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY; else process.env.ALIBABA_MODEL_STUDIO_API_KEY = previous.key;
    if (previous.base === undefined) delete process.env.ALIBABA_BASE_URL; else process.env.ALIBABA_BASE_URL = previous.base;
  });
  const valid = { headline: "Convennant's Birthday Year", caption: 'Convennant, this birthday is a chance to mark what matters to you and make room for what you want next.' };
  const outputs = ['{"headline": broken}', 'null', JSON.stringify(valid), JSON.stringify({ frames: [{ assetId: 'selected-photo', ...valid }] })];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: outputs[calls++] } }] }) }));
  const result = await regenerateV3Caption({ clientName: 'Convennant', brief: 'birthday', shootType: 'Birthday', format: 'photo-story' }, { summary: 'A person smiles.' });
  assert.equal(calls, 4);
  assert.equal(result.headline, "Convennant's Birthday Year");
  assert.ok(result.caption.length <= 150);
});

const reportedBirthdayDescriptions = [
  'Ada chose green velvet and pearls for her birthday portrait, and the dark backdrop lets that quiet confidence take center stage.',
  "This close-up keeps Ada's freckles and pearl earrings in soft focus, a gentle reminder that her birthday glow needs no embellishment.",
  'With a red telephone in hand and sunglasses on, Ada turned her birthday shoot into a playful scene full of personality.',
  'Reading the newspaper in her green suit, Ada made her birthday feel like front-page news with a wink and a smile.',
  "Ada's yellow blazer and green statement earrings pop against the burgundy backdrop, capturing the bold spirit she brought to this birthday.",
  'Holding a miniature figure of herself, Ada added a clever touch to her birthday portrait that made us all smile.',
  'Lying back on the green backdrop in her blue sleeveless top, Ada let her birthday shoot feel relaxed and completely her own.',
  'In her beige linen jumpsuit with bag and sunglasses, Ada brought an easy, elegant energy to this full-length birthday portrait.',
  'Holding a Polaroid camera in black and white, Ada turned the lens around for a birthday moment that feels both personal and timeless.'
];

test('initial generation rewrites the reported photo descriptions despite their valid birthday and name anchors', async () => {
  const calls = [];
  const selected = ids.slice(0, 10);
  const repaired = selected.map((assetId, index) => ({ assetId, headline: narrativeHeadlines[index], caption: narrativeCaptions[index] }));
  const restore = mockModel([
    { assetIds: selected },
    { frames: selected.map((assetId, index) => ({ assetId, headline: narrativeHeadlines[index], caption: reportedBirthdayDescriptions[index % 9] })) },
    { frames: repaired },
    { palette: {} }
  ], calls);
  try {
    const result = await directV3({ clientName: 'Ada', brief: "Ada's 25th birthday", shootType: 'Birthday', format: 'photo-story' }, ids.slice(0, 12).map(assetId => ({ assetId, score: 8, summary: 'Ada wears green velvet with pearl earrings and sunglasses. She smiles at the camera.' })));
    assert.equal(calls.length, 4);
    assert.deepEqual(result.direction.frames.map(frame => frame.caption), narrativeCaptions);
    // Selection still gets full observations. Neither writing pass gets them or
    // the rejected copy, so the descriptions cannot steer the replacement.
    assert.match(calls[0].messages[1].content[0].text, /green velvet/);
    for (const call of calls.slice(1, 3)) {
      assert.match(call.messages[1].content[0].text, /visible smile/);
      assert.doesNotMatch(call.messages[1].content[0].text, /velvet|earrings|sunglasses|telephone|freckles/);
    }
  } finally { restore(); }
});

test('regeneration repairs each reported description using the same purpose-led policy', async t => {
  for (const [index, caption] of reportedBirthdayDescriptions.entries()) {
    await t.test('reported caption ' + (index + 1), async () => {
      const calls = [];
      const corrected = { headline: "Ada's Birthday, Her Terms", caption: 'Ada, may this birthday give you more time for what you love and more reasons to look forward to the year ahead.' };
      const restore = mockModel([
        { headline: "Ada's Birthday Year", caption },
        { frames: [{ assetId: 'selected-photo', ...corrected }] }
      ], calls);
      try {
        // Editorial's wider limits isolate the meaning check from Photo Story's
        // length check: all nine bad sentences have valid names and word counts.
        const result = await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's birthday celebration", shootType: 'Birthday', format: 'editorial' }, { summary: caption });
        assert.deepEqual(result, corrected);
        assert.equal(calls.length, 2);
        assert.doesNotMatch(calls[1].messages[1].content[0].text, /velvet|pearls|telephone|polaroid|newspaper/i);
      } finally { restore(); }
    });
  }
});

test('failed description repair cannot return the same outfit report to the client', async () => {
  const description = { headline: "Ada's Green Birthday Outfit", caption: reportedBirthdayDescriptions[0] };
  const restore = mockModel([description, { frames: [{ assetId: 'selected-photo', ...description }] }], []);
  try {
    const result = await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's birthday celebration", shootType: 'Birthday', format: 'editorial' }, { summary: description.caption });
    assert.match(result.caption, /your birthday/);
    assert.doesNotMatch(JSON.stringify(result), /outfit|velvet|pearls|backdrop/i);
  } finally { restore(); }
});

test('an optional smile supports a direct birthday message without becoming a description', async () => {
  const calls = [];
  const message = { headline: "Ada's Birthday, Her Terms", caption: 'Ada, may this birthday give you more reasons to smile, more time for what you love, and a year to enjoy.' };
  const restore = mockModel([message], calls);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's birthday", shootType: 'Birthday', format: 'photo-story' }, { summary: 'A smiling person in green velvet, photographed against a burgundy backdrop.' }), message);
    assert.equal(calls.length, 2);
    assert.match(calls[0].messages[1].content[0].text, /visible smile/);
    assert.doesNotMatch(calls[0].messages[1].content[0].text, /green|velvet|burgundy|backdrop/);
  } finally { restore(); }
});

test('commercial captions may discuss a product explicitly supplied in the purpose', async () => {
  const calls = [];
  const message = { headline: 'Pearls for Everyday Wear', caption: 'Our new pearl earrings are made for everyday wear, bringing a simple finishing touch to the pieces you already love.' };
  const restore = mockModel([message], calls);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Studio', brief: 'Launch our new pearl earrings for everyday wear.', shootType: 'Commercial', format: 'campaign' }, { summary: 'Pearl earrings displayed against a dark studio backdrop.' }), message);
    assert.equal(calls.length, 2);
  } finally { restore(); }
});

test('a meaningful headline and direct message do not each need to repeat the client name or birthday', async () => {
  const text = { headline: 'More Time for What You Love', caption: 'Ada, may this birthday give you more reasons to smile, more time for what you love, and a year to enjoy.' };
  const restore = mockModel([text], []);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's birthday", format: 'photo-story' }, { summary: 'Portrait' }), text);
  } finally { restore(); }
});

test('personal messages cannot describe the recipient in third person or invent people at a portrait shoot', async t => {
  const badMessages = [
    { headline: "Ada's Birthday Year", caption: 'Ada has reached another birthday, and this celebration marks the life she is building and the person she has become.' },
    { headline: 'Surrounded By Your People', caption: 'Ada, twenty-five years have brought you to this day, and everyone here is glad to celebrate the person you have become.' },
    { headline: 'A Birthday with Friends', caption: 'Ada, this birthday brings all your friends together to celebrate you and the warmth you bring into their lives each day.' }
  ];
  for (const bad of badMessages) await t.test(bad.headline, async () => {
    const good = { headline: "Ada's Birthday, Her Terms", caption: 'Ada, may this birthday give you more time for what you love and more reasons to look forward to the year ahead.' };
    const calls = [];
    const restore = mockModel([bad, { frames: [{ assetId: 'selected-photo', ...good }] }], calls);
    try {
      assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's 25th birthday portraits", shootType: 'Birthday', format: 'photo-story' }, {}), good);
      const drafts = calls[1].messages[1].content[0].text;
      assert.match(drafts, /"rewrite":true/);
      assert.doesNotMatch(drafts, /everyone here|all your friends|life she is building/);
    } finally { restore(); }
  });
});

test('caption and headline generation preserve supplied ages and reject guessed ones in digits or words', async t => {
  for (const age of ['30th', 'thirtieth', 'twenty-first']) await t.test('wrong age ' + age, async () => {
    const bad = { headline: 'Your ' + age + ' Birthday', caption: 'Ada, your ' + age + ' birthday is a chance to choose what matters to you and enjoy the year at your own pace.' };
    const good = { headline: "Ada's 25th Birthday", caption: 'Ada, may this birthday give you more time for what you love and more reasons to look forward to the year ahead.' };
    const calls = [];
    const restore = mockModel([bad, { frames: [{ assetId: 'selected-photo', ...good }] }], calls);
    try {
      assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's 25th birthday", format: 'photo-story' }, {}), good);
      assert.match(calls[1].messages[1].content[0].text, /"rewrite":true/);
    } finally { restore(); }
  });
  const good = { headline: 'Your Thirtieth Birthday', caption: 'Ada, turning thirty is a chance to make time for what you love and choose what matters to you this year.' };
  const restore = mockModel([good], []);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's 30th birthday", format: 'photo-story' }, {}), good);
  } finally { restore(); }
});

test('regeneration can avoid existing valid wording without inheriting a wrong name from an old draft', async () => {
  const first = { assetId: 'first', headline: narrativeHeadlines[0], caption: narrativeCaptions[0] };
  const next = { headline: narrativeHeadlines[1], caption: narrativeCaptions[1] };
  const calls = [];
  const restore = mockModel([next], calls);
  try {
    const delivery = { clientName: 'Ada', brief: "Ada's 25th birthday", format: 'photo-story', creativeDirection: { frames: [first, { assetId: 'second', headline: "Lora's Birthday", caption: 'Lora, this birthday is a chance to mark what matters to you and make room for what you want next.' }] } };
    assert.deepEqual(await regenerateV3Caption(delivery, { summary: 'A person smiles.' }), next);
    assert.match(calls[0].messages[1].content[0].text, /Twenty-five begins/);
    assert.doesNotMatch(calls[0].messages[1].content[0].text, /Lora/);
  } finally { restore(); }
});

test('regeneration rewrites a repeated unsaved caption rather than returning it unchanged', async () => {
  const previous = { headline: narrativeHeadlines[0], caption: narrativeCaptions[0] };
  const fresh = { headline: narrativeHeadlines[1], caption: narrativeCaptions[1] };
  const calls = [];
  const restore = mockModel([previous, { frames: [{ assetId: 'selected-photo', ...fresh }] }], calls);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's 25th birthday", format: 'photo-story' }, {}, '', previous), fresh);
    assert.match(calls[0].messages[1].content[0].text, /Twenty-five begins/);
    assert.match(calls[1].messages[1].content[0].text, /"rewrite":true/);
  } finally { restore(); }
});

test('review retries repeated headings and captions while preserving the photo sequence', async () => {
  const selected = ids.slice(0, 10);
  const duplicated = selected.map(assetId => ({ assetId, headline: narrativeHeadlines[0], caption: narrativeCaptions[0] }));
  const distinct = selected.map((assetId, index) => ({ assetId, headline: narrativeHeadlines[index], caption: narrativeCaptions[index] }));
  const calls = [];
  const restore = mockModel([{ frames: duplicated }, { frames: duplicated }, { frames: distinct }, { palette: {} }], calls);
  try {
    const result = await directV3({ clientName: 'Ada', brief: "Ada's 25th birthday", format: 'photo-story' }, selected.map(assetId => ({ assetId, score: 8 })));
    assert.deepEqual(result.direction.frames.map(frame => frame.assetId), selected);
    assert.deepEqual(result.direction.frames.map(frame => frame.caption), narrativeCaptions);
    assert.equal(calls.length, 4);
  } finally { restore(); }
});

test('a persistently repeated birthday draft still supplies distinct complete copy for the largest showcase', async () => {
  const selected = ids.slice(0, 24);
  const repeated = selected.map(assetId => ({ assetId, headline: narrativeHeadlines[0], caption: narrativeCaptions[0] }));
  const restore = mockModel([{ frames: repeated }, { frames: repeated }, { frames: repeated }, { palette: {} }, { sections: [{ title: 'First set', assetIds: selected.slice(0, 12) }, { title: 'Second set', assetIds: selected.slice(12) }] }], []);
  try {
    const result = await directV3({ clientName: 'Ada', brief: "Ada's 25th birthday", format: 'event-coverage' }, selected.map(assetId => ({ assetId, score: 8 })));
    assert.equal(new Set(result.direction.frames.map(frame => frame.headline)).size, 24);
    assert.equal(new Set(result.direction.frames.map(frame => frame.caption)).size, 24);
    for (const frame of result.direction.frames) {
      assert.ok(frame.headline.split(/\s+/).length <= 7);
      assert.ok(frame.caption.split(/\s+/).length >= 18 && frame.caption.split(/\s+/).length <= 30);
      assert.ok(frame.caption.length <= 180);
      assert.match(frame.caption, /[.!?]$/);
    }
  } finally { restore(); }
});

test('ordinary future wishes and figurative holding do not get mistaken for props or invented attendees', async () => {
  const text = { headline: "Ada's Birthday, Her Terms", caption: 'Ada, may this birthday bring you friends who are kind, a pace that suits you, and room for holding onto what matters.' };
  const restore = mockModel([text], []);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's birthday", format: 'photo-story' }, {}), text);
  } finally { restore(); }
});

test('regeneration can still supply a different fitting message after a full Photo Story used the emergency drafts', async () => {
  const selected = ids.slice(0, 10);
  const bad = selected.map(assetId => ({ assetId, headline: '', caption: '' }));
  const delivery = { clientName: 'Ada', brief: "Ada's 25th birthday", format: 'photo-story' };
  const restoreInitial = mockModel([{ frames: bad }, { frames: bad }, { frames: bad }, { palette: {} }], []);
  let frames;
  try { frames = (await directV3(delivery, selected.map(assetId => ({ assetId, score: 8 })))).direction.frames; }
  finally { restoreInitial(); }
  const restoreRegeneration = mockModel([frames[0]], []);
  try {
    const result = await regenerateV3Caption({ ...delivery, creativeDirection: { frames } }, {}, '', frames[0]);
    assert.equal(frames.some(frame => frame.caption === result.caption || frame.headline === result.headline), false);
    assert.ok(result.caption.length <= 150);
    assert.ok(result.caption.split(/\s+/).length <= 24);
    assert.match(result.caption, /your 25th birthday/);
  } finally { restoreRegeneration(); }
});

test('regeneration has a total deadline below the browser timeout, including provider retries', async t => {
  const previous = { key: process.env.ALIBABA_MODEL_STUDIO_API_KEY, base: process.env.ALIBABA_BASE_URL };
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key';
  process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  t.after(() => {
    if (previous.key === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY; else process.env.ALIBABA_MODEL_STUDIO_API_KEY = previous.key;
    if (previous.base === undefined) delete process.env.ALIBABA_BASE_URL; else process.env.ALIBABA_BASE_URL = previous.base;
  });
  const started = Date.now();
  let now = started;
  let calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls += 1;
    assert.equal(options.signal.aborted, false);
    now += 46000;
    return { ok: false, status: 429, body: { cancel: async () => {} }, headers: { get: () => '60' } };
  });
  await assert.rejects(regenerateV3Caption({ clientName: 'Ada', brief: "Ada's birthday", format: 'photo-story' }, {}), error => error.code === 'V3_CAPTION_TIMEOUT' && error.status === 504 && /current words are unchanged/.test(error.message));
  assert.equal(calls, 1);
});

test('a slow review keeps an already checked caption without waiting past the total deadline', async t => {
  const previous = { key: process.env.ALIBABA_MODEL_STUDIO_API_KEY, base: process.env.ALIBABA_BASE_URL };
  process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'test-key';
  process.env.ALIBABA_BASE_URL = 'https://test.aliyuncs.com/compatible-mode/v1';
  t.after(() => {
    if (previous.key === undefined) delete process.env.ALIBABA_MODEL_STUDIO_API_KEY; else process.env.ALIBABA_MODEL_STUDIO_API_KEY = previous.key;
    if (previous.base === undefined) delete process.env.ALIBABA_BASE_URL; else process.env.ALIBABA_BASE_URL = previous.base;
  });
  let now = Date.now();
  let calls = 0;
  const valid = { headline: narrativeHeadlines[0], caption: narrativeCaptions[0] };
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    if (calls === 1) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(valid) } }] }) };
    now += 46000;
    const error = new Error('Timed out'); error.name = 'TimeoutError'; throw error;
  });
  assert.deepEqual(await regenerateV3Caption({ clientName: 'Ada', brief: "Ada's 25th birthday", format: 'photo-story' }, {}), valid);
  assert.equal(calls, 2);
});

test('opening and closing messages remain complete instead of clipping an oversized or invented thought', async () => {
  const selected = ids.slice(0, 10);
  const frames = selected.map((assetId, index) => ({ assetId, headline: narrativeHeadlines[index], caption: narrativeCaptions[index] }));
  const restore = mockModel([{ title: "Lora's 30th birthday", openingLine: 'Ada, your birthday photographs are ready, ' + 'with every part of your special occasion '.repeat(10), closingLine: 'Everyone here today was so happy to celebrate with you.', frames }, { palette: {} }], []);
  try {
    const result = await directV3({ clientName: 'Ada', brief: "Ada's 25th birthday portraits", format: 'photo-story' }, selected.map(assetId => ({ assetId, score: 8 })));
    assert.match(result.direction.title, /Ada/);
    assert.doesNotMatch(result.direction.title, /Lora|30th/);
    assert.ok(result.direction.openingLine.length <= 140);
    assert.ok(result.direction.closingLine.length <= 160);
    assert.match(result.direction.openingLine, /time\.$/);
    assert.doesNotMatch(result.direction.closingLine, /Everyone here/);
  } finally { restore(); }
});

test('all eight Showcase formats use the purpose-led writing and review policy for initial and regenerated copy', async t => {
  for (const [format, [minimum]] of Object.entries(V3_FORMATS)) await t.test(format, async () => {
    const selected = ids.slice(0, minimum);
    const frames = selected.map((assetId, index) => ({ assetId, headline: narrativeHeadlines[index], caption: narrativeCaptions[index] }));
    const calls = [];
    const midpoint = Math.floor(selected.length / 2);
    const restore = mockModel([{ frames }, { palette: {} }, { sections: [{ title: 'The birthday', assetIds: selected.slice(0, midpoint) }, { title: 'The celebration', assetIds: selected.slice(midpoint) }] }], calls);
    try {
      const delivery = { clientName: 'Ada', brief: "Ada's 25th birthday", shootType: 'Birthday', format };
      const insights = selected.map(assetId => ({ assetId, score: 8, summary: 'A portrait in green velvet and pearl earrings.' }));
      const result = await directV3(delivery, insights);
      assert.deepEqual(result.direction.frames.map(frame => frame.caption), frames.map(frame => frame.caption));
      // Isolate regeneration from the format-specific section fixtures.
      restore();
      const restoreRegeneration = mockModel([frames[0]], calls);
      try { assert.equal((await regenerateV3Caption(delivery, insights[0])).caption, frames[0].caption); }
      finally { restoreRegeneration(); }
      const writing = calls.filter(call => /thoughtful message from the photographer/.test(call.messages[0].content));
      assert.equal(writing.length, 4);
      for (const call of writing) {
        assert.doesNotMatch(call.messages[1].content[0].text, /green velvet|pearl earrings/);
        assert.match(call.messages[0].content, /address the recipient directly/);
      }
    } finally { restore(); }
  });
});

test('normal generation supplies usable text when both writing passes return empty or oversized words', async () => {
  const selected = ids.slice(0, 10);
  const badFrames = selected.map(assetId => ({ assetId, headline: '', caption: 'birthday '.repeat(60) }));
  const restore = mockModel([{ assetIds: selected }, { frames: badFrames }, { frames: badFrames }, { palette: {} }], []);
  try {
    const result = await directV3({ clientName: 'Convennant', brief: 'birthday', shootType: 'Birthday', format: 'photo-story' }, ids.slice(0, 12).map(assetId => ({ assetId, score: 8, summary: 'Portrait' })));
    assert.equal(result.direction.frames.length, 10);
    for (const frame of result.direction.frames) {
      assert.ok(frame.headline.length >= 2 && frame.headline.length <= 70);
      assert.ok(frame.caption.length >= 5 && frame.caption.length <= 150);
      assert.match(frame.caption, /birthday/);
      assert.ok(frame.headline.split(/\s+/).length <= 7);
      assert.ok(frame.caption.split(/\s+/).length >= 18 && frame.caption.split(/\s+/).length <= 24);
    }
    assert.match(result.direction.frames[0].headline, /Convennant/);
    assert.equal(new Set(result.direction.frames.map(frame => frame.caption)).size, selected.length);
    assert.equal(new Set(result.direction.frames.map(frame => frame.headline)).size, selected.length);
  } finally { restore(); }
});

test('replacing a birthday photograph keeps Convennant as the client through generation and repair', async () => {
  const calls = [];
  const wrong = { headline: "Lora's Birthday Year", caption: 'Lora, this birthday gives you space to mark how far you have come and choose what matters most next.' };
  const correct = { headline: "Convennant's Birthday Year", caption: 'Convennant, this birthday is a chance to mark what matters to you and make room for what you want next.' };
  const restore = mockModel([wrong, { frames: [{ ...correct, assetId: 'selected-photo' }] }], calls);
  try {
    const result = await regenerateV3Caption({ clientName: 'Convennant', brief: 'birthday', shootType: 'Birthday', format: 'photo-story' }, { summary: 'A smiling person. The filename is Lora.jpg.' }, 'Keep this about the birthday.');
    assert.deepEqual(result, correct);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.messages[1].content[0].text, /"clientName":"Convennant","purpose":"birthday"/);
      assert.match(call.messages[0].content, /Copy supplied names exactly/);
      assert.doesNotMatch(call.messages[0].content, /Lora|25th|Twenty-Five/);
    }
    assert.match(calls[0].messages[1].content[0].text, /Keep this about the birthday/);
  } finally { restore(); }
});

test('failed identity repair cannot return an unrelated personal name', async () => {
  const wrong = { headline: "Lora's Birthday Year", caption: 'Lora, this birthday gives you space to mark how far you have come and choose what matters most next.' };
  const restore = mockModel([wrong, { frames: [{ ...wrong, assetId: 'selected-photo' }] }], []);
  try {
    const result = await regenerateV3Caption({ clientName: 'Convennant', brief: 'birthday', shootType: 'Birthday', format: 'photo-story' }, { summary: 'A person smiles.' });
    assert.doesNotMatch(JSON.stringify(result), /Lora/);
    assert.match(result.headline, /Convennant/);
    assert.match(result.caption, /birthday/);
  } finally { restore(); }
});

test('natural contractions and ordinary sentence openings are not mistaken for personal names', async () => {
  const text = { headline: 'A Birthday to Keep', caption: "It's your birthday, and these photos give you time to mark the day and choose what you want next." };
  const calls = [];
  const restore = mockModel([text], calls);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Convennant', brief: 'birthday', shootType: 'Birthday', format: 'photo-story' }, { summary: 'A person smiles.' }), text);
    assert.equal(calls.length, 2);
  } finally { restore(); }
});

test('a subject explicitly named in the purpose remains valid even when the paying client differs', async () => {
  const text = { headline: "Lora's Birthday Year", caption: 'Lora, this birthday gives you space to mark how far you have come and choose what matters most next.' };
  const calls = [];
  const restore = mockModel([text], calls);
  try {
    assert.deepEqual(await regenerateV3Caption({ clientName: 'Convennant', brief: "Lora's birthday", shootType: 'Birthday', format: 'photo-story' }, { summary: 'A person smiles.' }), text);
    assert.equal(calls.length, 2);
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
