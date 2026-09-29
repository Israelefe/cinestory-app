import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { renderGridboardStatusCard } from '../src/services/gridboardStatusCard.service.js';

const names = ['demo-lora-1', 'demo-wedding-1', 'audience-portrait'];
const imageBuffers = await Promise.all(names.map(name => readFile(new URL(`../../client/public/veylo/web/${name}-1440.webp`, import.meta.url))));
const card = await renderGridboardStatusCard({
  imageBuffers,
  title: "Lora's 25th birthday portraits",
  studioName: 'Ada & Co. Photography',
  gallerySize: 87,
  privateUrl: 'https://veylo.com.ng/d/sample-private-gallery',
  palette: { background: '#24221b', surface: '#302e24', accent: '#d6bd81' }
});
const metadata = await sharp(card).metadata();
assert.equal(metadata.format, 'png');
assert.equal(metadata.width, 1080);
assert.equal(metadata.height, 1920);
assert.ok(card.length > 100_000, 'Photographs should be present in the card');
if (process.argv[2]) await writeFile(process.argv[2], card);
console.log(`GridBoard Status card: ${metadata.width}×${metadata.height}, ${Math.round(card.length / 1024)} KB`);
