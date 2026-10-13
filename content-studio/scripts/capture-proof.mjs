import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { configuration, root } from '../src/server/config.mjs';
import { initialiseStorage } from '../src/server/storage.mjs';
import { openDatabase } from '../src/server/database.mjs';
import { readKnowledge } from '../src/server/knowledge.mjs';
import { recordReview } from '../src/server/jobs.mjs';
import { storeImage } from '../src/server/assets.mjs';
import { captureAll } from '../src/server/capture.mjs';
import { run, tool, storeMedia } from '../src/server/media.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
// Isolated test graphics, not photographer work and never imported into the owner's library.
const config = configuration({ data: path.join(root, 'data/tests/capture-' + randomUUID()) }); await initialiseStorage(config); const db = openDatabase(config);
try {
  for (let i = 0; i < 6; i++) {
    const buffer = await sharp({ create: { width: 1080, height: 1440, channels: 3, background: ['#71584c', '#26323d', '#544344', '#8a6d52', '#334d40', '#5c5034'][i] } }).webp().toBuffer();
    const asset = await storeImage(config, db, buffer, { name: 'Original test graphic ' + i, source: 'isolated-render-test' });
    db.prepare("UPDATE assets SET rights='cleared',license_note=?,metadata=? WHERE id=?").run('Original abstract test graphic. No people. Test only; not campaign material.', JSON.stringify({ ...asset.metadata, generated: false, consent: true }), asset.id);
  }
  const features = (await readKnowledge(config, db)).features;
  const filmPath = path.join(config.data, 'temp/original-test-film.mp4');
  await sharp(path.join(config.data, db.prepare("SELECT path FROM assets WHERE kind='image' LIMIT 1").get().path)).png().toFile(path.join(config.data, 'temp/film-source.png'));
  await run(tool('ffmpeg'), ['-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', path.join(config.data, 'temp/film-source.png'), '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', filmPath]);
  const filmId = await storeMedia(config, db, await fs.readFile(filmPath), { name: 'Original abstract test film', kind: 'video' });
  const film = db.prepare('SELECT metadata FROM assets WHERE id=?').get(filmId);
  db.prepare("UPDATE assets SET rights='cleared',license_note=?,metadata=? WHERE id=?").run('Original abstract test film; no people. Test only.', JSON.stringify({ ...JSON.parse(film.metadata), consent: true }), filmId);
  const requested = process.argv.slice(2); const ids = requested.length ? requested : ['photoswap', 'showcase:album', 'sharing'];
  for (const feature of features.filter(feature => ids.includes(feature.id) || ids.includes('all'))) recordReview(db, 'feature:' + feature.id, feature.digest, { decision: 'approved', note: 'Isolated automated capture test; not a production product approval.' });
  console.log('Isolated capture proof: ' + config.data);
  await captureAll({ config, db, task: {}, progress: (p, message) => console.log(Math.round(p * 100) + '% ' + message) });
  const saved = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='captures'").get().value);
  assert.ok(saved.length > 0);
  for (const clip of saved) assert.equal(db.prepare('SELECT decision FROM approvals WHERE subject=? AND digest=?').get('capture:' + clip.id, clip.digest)?.decision, 'approved');
  console.log(`Verified automatic approval of ${saved.length} recordings.`);
} finally { db.close(); }
