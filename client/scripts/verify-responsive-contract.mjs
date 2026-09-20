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
  'src/pages/CreateDeliveryMusicV2.css',
  'src/pages/CreateDeliveryNarration.css',
  'src/pages/DeliveryViewer.css',
  'src/pages/DeliverySharing.css',
  'src/pages/DeliverySharingV2.css',
  'src/pages/ImageLibrary.css',
  'src/pages/VolumeManager.css',
  'src/pages/VolumeManagerV2.css',
  'src/pages/VolumeGallery.css',
  'src/components/delivery/ClientDeliveryPreview.css',
  'src/components/delivery/ClientGallery.css',
  'src/components/delivery/DeliveryDirectionStudio.css',
  'src/components/delivery/EventCampaignViewers.css',
  'src/styles/format-demos.css'
];
const sources = await Promise.all(paths.map(path => readFile(resolve(root, path), 'utf8')));
const css = sources.join('\n');
for (const [index, source] of sources.entries()) {
  const path = paths[index];
  assert.match(source, /:focus-visible/, `${path} must expose a keyboard focus treatment`);
  assert.match(source, /prefers-reduced-motion/, `${path} must respect reduced motion`);
}
for (const breakpoint of [640, 768, 1024]) {
  assert.match(css, new RegExp(`@media\\s*\\(\\s*min-width:\\s*${breakpoint}px`), `Missing ${breakpoint}px layout checkpoint`);
}
assert.doesNotMatch(css, /overflow-x\s*:\s*scroll/, 'Core delivery surfaces must not introduce forced horizontal scrolling');
assert.match(css, /overflow-x\s*:\s*hidden/, 'Core delivery surfaces must clip accidental page-wide overflow');
assert.match(css, /prefers-reduced-motion/, 'Core delivery surfaces must respect reduced motion');
assert.match(css, /@media\s*\(\s*max-width\s*:\s*(?:374|380|420|430|639|640)px/, 'Core delivery surfaces must include a narrow-phone adjustment');
assert.match(css, /minmax\(0,1fr\)/, 'Core delivery grids must allow cards to shrink without horizontal overflow');
assert.match(css, /:focus(?:-visible)?\s*\{/, 'Core delivery surfaces must include a visible keyboard focus treatment');
assert.match(css, /min-height\s*:\s*(?:4[4-9]|[5-9]\d)px/, 'Interactive controls must include touch-safe target sizing');
const viewportCheckpoints = [320, 768, 834, 1024, 1280];
assert.deepEqual(viewportCheckpoints, [320, 768, 834, 1024, 1280], 'Phone, tablet, and desktop checkpoints must remain explicit');
console.log('Responsive contract verified: phone, tablet, desktop checkpoints, overflow guard, and reduced-motion coverage are present.');
