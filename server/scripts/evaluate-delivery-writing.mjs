import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assistBrief, writePresentation } from '../src/services/deliveryAI.service.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to evaluate the configured AI provider.');
const cases = [
  { clientName: 'Ada', shootType: 'Birthday', brief: 'Ada 30th Birthday Shoot' },
  { clientName: 'Tunde', shootType: 'Graduation', brief: 'Tunde’s graduation shoot. Keep the story about finishing this chapter and celebrating the work it took.' },
  { clientName: 'Ijeoma', shootType: 'Traditional Wedding', brief: 'Ijeoma’s traditional wedding. Focus on the celebration and the traditions shared on the day.' },
  { clientName: 'Amara', shootType: 'Fashion', brief: 'Amara’s new collection lookbook. A clean editorial presentation, keeping the focus on the collection rather than personal storytelling.' },
  { clientName: 'Bola', shootType: 'Fashion', brief: 'Fashion shoot for Bola.' },
  { clientName: 'Lora', shootType: 'Birthday', brief: 'Lora birthday shoot' }
];
const results = [];
async function withRecovery(task) {
  let failed;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return { ...await task(), attempts: attempt }; }
    catch (error) { failed = error; }
  }
  throw failed;
}
for (const input of process.argv.includes('--birthday-only') ? cases.slice(0, 1) : cases) {
  const started = Date.now();
  const outputs = await Promise.allSettled([withRecovery(() => assistBrief({ ...input, mode: 'enhance' })), withRecovery(() => assistBrief({ ...input, mode: 'assess' })), withRecovery(() => writePresentation({ ...input, format: input.shootType === 'Fashion' ? 'editorial' : 'photo-story', photoCount: 12 }))]);
  results.push({ input, durationMs: Date.now() - started, outputs: Object.fromEntries(outputs.map((result, i) => [['enhance', 'assess', 'writing'][i], result.status === 'fulfilled' ? result.value : { error: result.reason.message }])) });
  console.log(`${input.shootType}: ${outputs.filter(result => result.status === 'fulfilled').length}/3 responses, ${Date.now() - started}ms`);
}
const folder = resolve('../.runtime/delivery-v3'); await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, 'writing-evaluation.json'), JSON.stringify(results, null, 2));
if (results.some(result => Object.values(result.outputs).some(output => output.error))) process.exitCode = 1;
