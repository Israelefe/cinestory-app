import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const catalogue = JSON.parse(await readFile(resolve(root, 'src/constants/pixabaySoundtracks.json'), 'utf8'));
assert.equal(catalogue.length, 100, 'The catalogue must contain exactly 100 tracks');
assert.equal(new Set(catalogue.map(track => track.pixabayId)).size, 100, 'Pixabay IDs must be unique');
for (const track of catalogue) {
  assert.ok(track.creator && /^https:\/\/pixabay\.com\/music\//.test(track.sourcePageUrl), `Missing source metadata for ${track.pixabayId}`);
  assert.equal(track.license, 'Pixabay Content License', `Unexpected licence for ${track.pixabayId}`);
  assert.ok(/^https:\/\/pixabay\.com\/service\/license-summary\/$/.test(track.licenseUrl), `Missing licence URL for ${track.pixabayId}`);
  assert.ok(track.durationSec > 0 && track.bytes > 0 && /^[a-f0-9]{64}$/i.test(track.sha256), `Missing media verification for ${track.pixabayId}`);
  assert.ok(existsSync(resolve(root, 'private/music/pixabay', track.filename)), `Missing local file for ${track.filename}`);
}
console.log('Pixabay catalogue verified: 100 unique source records, licences, hashes, and local files.');
