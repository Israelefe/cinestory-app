import assert from 'node:assert/strict';
import { assistPhotographerBrief } from '../src/services/alibabaCreativeDirector.service.js';

process.env.ALIBABA_MODEL_STUDIO_API_KEY = 'brief-assist-test-key';
process.env.ALIBABA_BASE_URL = 'https://brief-assist.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';

let modelReply;
let lastSystemPrompt = '';
globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(init.body);
  lastSystemPrompt = request.messages.find(message => message.role === 'system').content;
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(modelReply) } }] })
  };
};

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

modelReply = {
  ready: true,
  reason: '',
  choices: [
    'The color palette for the session includes neutral tones with gold accents.',
    'Props such as a birthday cake, balloons, or confetti may be included.',
    'This is a milestone birthday for Ada.'
  ],
  suggestedBrief: "A portrait session celebrating Ada's 30th birthday and marking this milestone."
};
const rewrite = await assistPhotographerBrief({ clientName: 'Ada', shootType: 'Birthday', brief: 'Ada 30th Birthday Shoot', mode: 'enhance' });
assert.equal(rewrite.ready, true);
assert.deepEqual(rewrite.choices, []);
assert.match(rewrite.suggestedBrief, /Ada's 30th birthday/i);
assert.match(rewrite.suggestedBrief, /milestone/i);
assert.doesNotMatch(rewrite.suggestedBrief, /create captions|distinct angle|describe the photograph/i);
assert.match(lastSystemPrompt, /keep the original subject, occasion, purpose, emphasis, and meaning/i);
assert.match(lastSystemPrompt, /go beyond proofreading/i);
assert.doesNotMatch(lastSystemPrompt, /set a clear caption angle|each caption should add a different piece/i);
assert.match(lastSystemPrompt, /always return ready true, reason empty, and choices as an empty array/i);

modelReply = { ready: true, reason: '', choices: [], suggestedBrief: 'Lora is celebrating her 25th birthday at the beach.' };
const invented = await assistPhotographerBrief({ clientName: 'Lora', shootType: 'Birthday', brief: 'Lora birthday', mode: 'enhance' });
assert.equal(invented.suggestedBrief, '');

console.log('Brief assessment, selectable details, and creative brief enhancement verified.');
