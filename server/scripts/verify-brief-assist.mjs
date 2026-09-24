import assert from 'node:assert/strict';
import { assistPhotographerBrief } from '../src/services/alibabaCreativeDirector.service.js';

process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'brief-assist-test-key';
process.env.ALIBABA_BASE_URL = 'https://brief-assist.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';

let modelReply;
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(modelReply) } }] })
});

modelReply = {
  ready: false,
  reason: 'Who is Lora to the photographer?',
  choices: ['Is Lora turning 25?', 'Lora is the photographer’s daughter.', 'Lora is celebrating at the beach.'],
  suggestedBrief: ''
};
const advice = await assistPhotographerBrief({ clientName: 'Lora', shootType: 'Birthday', brief: 'Lora birthday shoot', mode: 'assess' });
assert.equal(advice.ready, false);
assert.equal(advice.choices.length, 4);
assert.ok(advice.choices.every(choice => !/\?|\b25\b|daughter/i.test(choice)));
assert.match(advice.choices[0], /birthday/i);
assert.doesNotMatch(advice.reason, /relationship|who is lora/i);

modelReply = { ready: true, reason: '', choices: [], suggestedBrief: '' };
const sparse = await assistPhotographerBrief({ clientName: 'Lora', shootType: 'Birthday', brief: 'Lora birthday shoot', mode: 'assess' });
assert.equal(sparse.ready, false);
assert.ok(sparse.choices.length >= 3);

modelReply = { ready: false, reason: 'Needs more detail.', choices: ['Lora wanted portraits to mark this birthday.'], suggestedBrief: '' };
const complete = await assistPhotographerBrief({ clientName: 'Lora', shootType: 'Birthday', brief: 'Lora is turning 25.', mode: 'assess' });
assert.equal(complete.ready, true);
assert.deepEqual(complete.choices, []);

modelReply = { ready: false, reason: 'Needs more detail.', choices: ['Lora is turning 25.'], suggestedBrief: 'This shoot celebrates Lora’s birthday.' };
const rewrite = await assistPhotographerBrief({ clientName: 'Lora', shootType: 'Birthday', brief: 'Lora birthday', mode: 'enhance' });
assert.equal(rewrite.ready, true);
assert.deepEqual(rewrite.choices, []);
assert.equal(rewrite.suggestedBrief, 'This shoot celebrates Lora’s birthday.');

modelReply = { ready: true, reason: '', choices: [], suggestedBrief: 'Lora is celebrating her 25th birthday at the beach.' };
const invented = await assistPhotographerBrief({ clientName: 'Lora', shootType: 'Birthday', brief: 'Lora birthday', mode: 'enhance' });
assert.equal(invented.suggestedBrief, '');

console.log('Brief suggestions and factual rewrites verified.');
