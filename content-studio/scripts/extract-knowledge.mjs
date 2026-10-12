import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from '../src/server/config.mjs';
import { extractKnowledge, sourceFingerprint } from '../src/server/knowledge.mjs';
if (process.argv.includes('--check')) {
  const stored = JSON.parse(await fs.readFile(path.join(root, 'knowledge/sources.json'), 'utf8'));
  const current = await sourceFingerprint();
  if (stored.digest !== current.digest) { console.error('Product sources changed. Run npm run knowledge:extract and review changed catalog entries.'); process.exitCode = 1; }
  else console.log('Knowledge source fingerprints match.');
} else {
  const result = await extractKnowledge(); console.log(`Extracted ${result.featureCount} product entries from ${result.sources.length} sources. Owner review is required before promotion.`);
}
