import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const paths = [
  'src/pages/Dashboard.css',
  'src/pages/DashboardV2.css',
  'src/pages/CreateDelivery.css',
  'src/pages/DeliveryViewer.css',
  'src/pages/VolumeManager.css',
  'src/pages/VolumeManagerV2.css',
  'src/components/delivery/ClientGallery.css',
  'src/components/delivery/EventCampaignViewers.css',
  'src/styles/format-demos.css'
];
const css = (await Promise.all(paths.map(path => readFile(resolve(root, path), 'utf8')))).join('\n');
for (const breakpoint of [640, 768, 1024]) {
  assert.match(css, new RegExp(`@media\\s*\\(\\s*min-width:\\s*${breakpoint}px`), `Missing ${breakpoint}px layout checkpoint`);
}
assert.doesNotMatch(css, /overflow-x\s*:\s*scroll/, 'Core delivery surfaces must not introduce forced horizontal scrolling');
assert.match(css, /overflow-x\s*:\s*hidden/, 'Core delivery surfaces must clip accidental page-wide overflow');
assert.match(css, /prefers-reduced-motion/, 'Core delivery surfaces must respect reduced motion');
console.log('Responsive contract verified: phone, tablet, desktop checkpoints, overflow guard, and reduced-motion coverage are present.');
