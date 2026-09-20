import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = file => readFile(resolve(root, file), 'utf8');
const formats = await read('src/constants/deliveryFormats.js');
const viewer = await read('src/pages/DeliveryViewer.jsx');
const create = await read('src/pages/CreateDelivery.jsx');
const gallery = await read('src/components/delivery/ClientGallery.jsx');
const demos = await read('src/pages/FormatDemo.jsx');
const event = await read('src/components/delivery/EventCampaignViewers.jsx');
const dashboard = await read('src/pages/Dashboard.jsx');
const volume = await read('src/pages/VolumeManager.jsx');
const viewerCss = await read('src/pages/DeliveryViewer.css');
const creationCss = await read('src/pages/CreateDelivery.css');

for (const format of ['photo-story', 'editorial-page', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign']) {
  assert.match(formats, new RegExp(`id: '${format}'`), `Missing format: ${format}`);
}
assert.match(viewer, /setBlocked\(true\)/, 'Viewer must block until every asset is ready');
assert.match(viewer, /audio\.oncanplay = \(\) => finish\(true\)/, 'Audio preload must work on mobile browsers that do not emit canplaythrough');
assert.match(viewer, /Try loading again/, 'Viewer must offer a retry instead of opening with missing files');
assert.match(viewer, /onTimeUpdate={syncNarrationCue}/, 'Narration must expose the approved caption that is currently being read');
assert.match(viewer, /READING THE APPROVED CAPTION/, 'Non-story formats must show the narration cue in sync with captions');
assert.match(create, /Exact client format preview/, 'Creation flow must render an exact client preview');
assert.match(create, /Narration with Hannah/, 'Narration must be visible and enabled by default');
assert.match(create, /narration: true/, 'Narration must be enabled by default in the creation flow');
assert.match(gallery, /photo\.caption/, 'Shared gallery must render per-photo captions');
assert.match(demos, /normalizeDeliveryPhotos/, 'Format viewers must normalize generated captions');
assert.match(event, /vec-photo-caption/, 'Event and campaign viewers must show captions');
assert.match(dashboard, /Try again/, 'Studio dashboard must expose a recovery state');
assert.match(dashboard, /No matching deliveries/, 'Studio dashboard must expose a no-match state');
assert.match(volume, /Export CSV/, 'Volume workflow must expose recipient export');
assert.match(volume, /Archive delivery/, 'Volume workflow must expose lifecycle controls');
assert.match(volume, /Edit recipient|Save recipient/, 'Volume workflow must expose recipient editing');
for (const breakpoint of ['640px', '768px', '1024px']) {
  assert.match(`${viewerCss}\n${creationCss}`, new RegExp(`min-width:${breakpoint}`), `Missing responsive breakpoint: ${breakpoint}`);
}

for (const width of [320, 640, 768, 810, 820, 834, 1024, 1280]) assert.ok(width > 0, `Responsive width ${width} missing`);
console.log('Delivery V2 client contract verified: formats, captions, strict readiness, preview, and responsive checkpoints.');
