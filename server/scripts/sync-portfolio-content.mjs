import { readFileSync, writeFileSync } from 'node:fs';
const source = new URL('../src/shared/portfolioContent.mjs', import.meta.url);
const target = new URL('../../client/src/services/portfolioContent.mjs', import.meta.url);
const content = readFileSync(source, 'utf8');
if (process.argv.includes('--write')) { writeFileSync(target, content); console.log('Updated the client portfolio content contract.'); }
else if (readFileSync(target, 'utf8') !== content) { console.error('Portfolio content contracts differ. Run node server/scripts/sync-portfolio-content.mjs --write from the repository root.'); process.exitCode = 1; }
else console.log('Server and client portfolio content contracts match.');
