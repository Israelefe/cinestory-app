import assert from 'node:assert/strict';
import test from 'node:test';
import { V3_FORMATS, contrastRatio, validShowcase } from '../src/constants/deliveryV3.js';
import { analyzeAllV3, directV3, improvePurpose, regenerateV3Caption } from '../src/services/deliveryV3AI.service.js';

const ids = Array.from({ length: 25 }, (_, index) => 'asset-' + index);
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

test('Photo Story chooses a bounded selection and keeps bookends outside it when available', async () => {
  const calls = [];
  const selected = ids.slice(0, 10);
  const restore = mockModel([
    { assetIds: selected },
    {
      title: "Ada's 25th birthday",
      openingLine: "Ada, your birthday photographs are ready.",
      closingLine: "Here is the full collection from your celebration.",
      frames: selected.map(assetId => ({ assetId, caption: 'Ada, this is your 25th birthday.' }))
    },
    {
      frames: selected.map((assetId, index) => ({ assetId, caption: index === 0 ? 'Ada, this is your 25th birthday. That smile.' : 'A smiling woman poses in a red dress.' })),
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
    assert.equal(result.direction.frames[0].caption, 'Ada, this is your 25th birthday. That smile.');
    assert.equal(result.direction.frames.slice(1).every(frame => frame.caption === 'Ada, this is your 25th birthday.'), true);
    const narrativePrompt = calls[1].messages[1].content[0].text;
    assert.equal(narrativePrompt.includes('Visible birthday portrait'), false);
    assert.match(narrativePrompt, /Ada's 25th birthday/);
    assert.equal(selected.includes(result.openingAssetId), false);
    assert.equal(selected.includes(result.closingAssetId), false);
    assert.notEqual(result.openingAssetId, result.closingAssetId);
    assert.equal(calls.every(call => call.model === 'deepseek-v4.1-flash'), true);
  } finally { restore(); }
});

test('regenerated captions keep the purpose when a visual rewrite describes the photo', async () => {
  const calls = [];
  const restore = mockModel([{ caption: 'Ada, your 25th birthday is here.' }, { caption: 'A woman smiles at the camera.' }], calls);
  try {
    const caption = await regenerateV3Caption({ format: 'photo-story', brief: "Ada's 25th birthday", shootType: 'Birthday', v3: {} }, { summary: 'A woman smiles at the camera.' });
    assert.equal(caption, 'Ada, your 25th birthday is here.');
    assert.equal(calls[0].messages[1].content[0].text.includes('A woman smiles'), false);
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
