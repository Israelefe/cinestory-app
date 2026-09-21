import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const catalogue = JSON.parse(await readFile(resolve(root, 'src/constants/pixabaySoundtracks.json'), 'utf8'));
const expectedCategoryCounts = {
  wedding: 23,
  birthday: 21,
  afrobeat: 26,
  'calm-acoustic': 20,
  celebration: 22,
  cinematic: 20,
  corporate: 20,
  faith: 18,
  fashion: 22,
  maternity: 15,
};
assert.equal(catalogue.length, 207, 'The catalogue must contain exactly 207 tracks');
assert.equal(new Set(catalogue.map(track => track.pixabayId)).size, catalogue.length, 'Pixabay IDs must be unique');
for (const [category, expected] of Object.entries(expectedCategoryCounts)) {
  assert.equal(catalogue.filter(track => track.category === category).length, expected, `Unexpected ${category} track count`);
}
assert.deepEqual(
  new Set(catalogue.map(track => track.category)),
  new Set(Object.keys(expectedCategoryCounts)),
  'The catalogue contains an unknown category'
);
for (const track of catalogue) {
  assert.ok(track.creator && /^https:\/\/pixabay\.com\/music\//.test(track.sourcePageUrl), `Missing source metadata for ${track.pixabayId}`);
  assert.equal(track.license, 'Pixabay Content License', `Unexpected licence for ${track.pixabayId}`);
  assert.ok(/^https:\/\/pixabay\.com\/service\/license-summary\/$/.test(track.licenseUrl), `Missing licence URL for ${track.pixabayId}`);
  assert.ok(Number.isInteger(track.durationSec) && track.durationSec > 0 && track.bytes > 0 && /^[a-f0-9]{64}$/i.test(track.sha256), `Missing media verification for ${track.pixabayId}`);
  const localPath = resolve(root, 'private/music/pixabay', track.filename);
  assert.ok(existsSync(localPath), `Missing local file for ${track.filename}`);
  const file = await readFile(localPath);
  assert.equal(file.length, track.bytes, `Stored byte count does not match ${track.filename}`);
  assert.equal(createHash('sha256').update(file).digest('hex'), track.sha256.toLowerCase(), `Stored SHA-256 does not match ${track.filename}`);
  assert.ok(statSync(localPath).isFile(), `Track path is not a regular file: ${track.filename}`);
  assert.match(track.filename, /^pixabay-\d+\.mp3$/, `Unexpected local soundtrack filename for ${track.pixabayId}`);
}
const localFiles = (await readdir(resolve(root, 'private/music/pixabay'))).filter(file => /^pixabay-\d+\.mp3$/.test(file));
assert.equal(localFiles.length, catalogue.length, 'The private soundtrack folder contains stale or missing files');
assert.deepEqual(new Set(localFiles), new Set(catalogue.map(track => track.filename)), 'Local soundtrack files do not match the catalogue records');
console.log('Pixabay catalogue verified: 207 source records, category counts, licences, hashes, and local files.');
