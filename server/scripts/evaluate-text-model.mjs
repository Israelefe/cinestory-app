import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { modelProviderState } from '../src/services/modelProvider.service.js';
import { regenerateV3Caption, directV3PhotoSwapCaptions } from '../src/services/deliveryV3AI.service.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to run a small check against the configured Groq account.');
if (!process.env.GROQ_API_KEY) { console.log('Live caption check skipped: no local Groq key is configured.'); process.exit(2); }
// This CLI uses fictional briefs and a temporary in-memory budget, never the
// production database or customer photographs. Normal services keep MongoDB admission.
process.env.NODE_ENV = 'development';
process.env.GROQ_TEXT_MODEL = 'openai/gpt-oss-120b';
// A fallback would not establish the quality of the proposed Groq model.
process.env.ALIBABA_MODEL_STUDIO_API_KEY = '';
const cases = [
  { clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 30th birthday portraits.", summary: 'A studio portrait with a plain warm background.' },
  { clientName: 'Tunde', shootType: 'Graduation', brief: "Tunde's graduation portraits after finishing university.", summary: 'A graduation portrait with a gown and cap.' },
  { clientName: 'Amara Studio', shootType: 'Fashion', brief: 'The new linen collection lookbook. Describe the clothes clearly.', summary: 'A model wearing a cream linen jacket with large pockets.' }
];
const results = [];
for (const { summary, ...delivery } of cases) {
  const startedAt = Date.now();
  const output = await regenerateV3Caption({ ...delivery, format: 'photo-story' }, { summary, colors: ['#c6a686'], momentTags: ['portrait'] });
  assert.ok(output.headline.length > 0 && output.headline.length <= 70);
  assert.ok(output.caption.length >= 10 && output.caption.length <= 150);
  assert.doesNotMatch(output.caption, /<think>|```|magic|tapestry|crescendo|revolutionize|synergy/i);
  assert.doesNotMatch(output.headline + ' ' + output.caption, /\b(?:glow|thriving|radiates? joy|captures? the spirit)\b/i);
  if (delivery.shootType === 'Graduation') assert.doesNotMatch(output.headline + ' ' + output.caption, /\b(?:stage|ceremony|convocation)\b/i, 'Graduation portraits do not establish attendance at a ceremony.');
  if (delivery.shootType === 'Fashion') {
    assert.match(output.caption, /linen|jacket|pockets/i);
    assert.doesNotMatch(output.headline + ' ' + output.caption, /\b(?:tee|t-shirt|trousers|pants|summer|shoes|earrings|silk|front|relaxed|tailored|silhouette|lightweight|heavyweight)\b/i, 'Fashion writing must not invent garments, construction, fit, or a season absent from its notes.');
  }
  results.push({ delivery, output, durationMs: Date.now() - startedAt });
  console.log(delivery.shootType + ': ' + output.headline + ' | ' + output.caption);
}
const assets = Array.from({ length: 18 }, (_, index) => ({ assetId: 'fictional-birthday-' + index, sortOrder: index }));
const batch = await directV3PhotoSwapCaptions({ kind: 'photoswap', clientName: 'Ada', shootType: 'Birthday', brief: "Ada's 30th birthday portraits.", assets }, []);
assert.equal(batch.length, 18);
assert.equal(new Set(batch.map(frame => frame.caption.toLowerCase())).size, 18);
assert.equal(new Set(batch.map(frame => frame.headline.toLowerCase())).size, 18);
assert.ok(batch.every((frame, index) => frame.assetId === assets[index].assetId && frame.caption.length >= 5 && frame.caption.length <= 180));
assert.ok(batch.every(frame => !/\b(?:stage|ceremony|radiates? joy|captures? the spirit)\b/i.test(frame.caption)));
console.log('Photo Swap: all 18 photos have distinct captions in the original order.');
console.log('Batch example: ' + batch[0].headline + ' | ' + batch[0].caption);
await mkdir('../.runtime/delivery-v3', { recursive: true });
await writeFile('../.runtime/delivery-v3/text-model-evaluation.json', JSON.stringify({ model: modelProviderState().textModel, results, batch }, null, 2));
console.log('Three fictional shoots and an 18-photo batch passed the app writing checks.');
