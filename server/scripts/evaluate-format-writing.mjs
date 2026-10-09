import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { directV3, regenerateV3Caption, reviewV3WritingBlocks } from '../src/services/deliveryV3AI.service.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to evaluate the configured provider using synthetic text fixtures.');
const cases = [
  { format: 'chapters', clientName: 'Ada and Emeka', shootType: 'Traditional Wedding', brief: 'Finished photographs of Ada and Emeka’s traditional wedding. The set covers their portraits, the family welcome and the reception. Use the confirmed parts of the day as chapters. Do not invent ceremonial roles or traditions.', observations: ['Ada and Emeka standing together for a portrait.', 'A closer portrait of Ada and Emeka together.', 'Ada and Emeka seated for a portrait.', 'Ada and Emeka walking together for a portrait.', 'Family members standing together at the welcome.', 'Family members seated together at the welcome.', 'Guests seated at reception tables.', 'Guests dancing at the reception.'] },
  { format: 'editorial', clientName: 'Ada', shootType: 'Birthday', brief: 'Ada’s thirtieth birthday studio portraits. Ada chose an emerald suit and an ivory telephone for the session. The feature should explain the connection between the full portraits and closer details without inventing personal history.', observations: ['Full-length portrait of Ada in an emerald suit beside an ivory telephone.', 'Closer portrait of Ada with the ivory telephone.', 'Side-facing portrait of Ada in the emerald suit.', 'Portrait of Ada holding the ivory telephone at shoulder level.', 'Seated portrait of Ada in the emerald suit with the telephone beside her.'] },
  { format: 'event-coverage', clientName: 'Studio client', shootType: 'Conference', brief: 'Finished coverage of a business conference, including registration, the programme, audience participation and conversations during the break. Keep scenes factual. No speaker names, job titles, dates or venue names have been supplied.', observations: ['Attendees at the registration desk.', 'An attendee receiving a badge at registration.', 'A speaker at the lectern on stage.', 'A wide view of the stage during a presentation.', 'Audience members seated facing the stage.', 'An audience member raising a hand.', 'A participant speaking into a handheld microphone.', 'A small group talking during the break.', 'Two attendees talking beside a table during the break.', 'Attendees moving through the conference foyer.'] },
  { format: 'campaign', clientName: 'Clothing Studio', shootType: 'Fashion', brief: 'Finished linen jacket collection photographs for the clothing team. The set includes complete front and back views, a worn view, and garment details. No approved advertising channels, product performance claims, licence or usage rights have been supplied.', observations: ['Complete front view of a linen jacket with patch pockets and an open collar.', 'Complete back view of the same linen jacket.', 'Closer view of a patch pocket and its stitching on the linen jacket.', 'Closer view of the open collar and stitching on the linen jacket.', 'Closer view of the sleeve cuff and seam on the linen jacket.', 'A person wearing the linen jacket, with collar and pockets visible.'] }
];
const results = [];
const nativeFetch = globalThis.fetch;
let replies = [];
globalThis.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  const payload = await response.clone().json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  if (content) replies.push(content);
  return response;
};
const requestedFormat = process.argv.find(arg => arg.startsWith('--format='))?.slice(9);
for (const fixture of cases.filter(item => !requestedFormat || item.format === requestedFormat)) {
  const started = Date.now();
  const rows = fixture.observations.map((summary, i) => ({ assetId: `fixture-${i}`, summary, score: 8, colors: ['#594b39', '#ddc4a0'] }));
  const delivery = { ...fixture, kind: 'showcase', collectionAnalysis: { images: rows } };
  replies = [];
  const evaluation = { format: fixture.format, brief: fixture.brief };
  try {
    const generated = await directV3(delivery, rows);
    evaluation.generated = generated.direction;
    delivery.creativeDirection = generated.direction;
    const rewrite = await regenerateV3Caption(delivery, rows[0], 'Add useful context while keeping the facts accurate.', generated.direction.frames[0]);
    evaluation.rewrite = rewrite;
    const section = generated.direction.sections[0];
    const review = await reviewV3WritingBlocks(delivery, [{ key: `section:${section.id}:body`, kind: 'section-body', text: section.body, assetIds: section.assetIds }]);
    evaluation.review = review;
    console.log(`${fixture.format}: generation, rewrite and section review passed (${Date.now() - started}ms)`);
  } catch (error) {
    evaluation.error = { code: error.code, message: error.message };
    console.log(`${fixture.format}: ${error.code || 'evaluation failed'}`);
    process.exitCode = 1;
  }
  results.push({ ...evaluation, durationMs: Date.now() - started, modelReplies: replies });
}
const folder = resolve('../.runtime/delivery-v3'); await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, 'format-writing-evaluation.json'), JSON.stringify(results, null, 2));
