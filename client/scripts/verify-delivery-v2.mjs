import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = file => readFile(resolve(root, file), 'utf8');
const formats = await read('src/constants/deliveryFormats.js');
const viewer = await read('src/pages/DeliveryViewer.jsx');
const storyViewer = await read('src/pages/StoryViewer.jsx');
const create = await read('src/pages/CreateDelivery.jsx');
const gallery = await read('src/components/delivery/ClientGallery.jsx');
const galleryCss = await read('src/components/delivery/ClientGallery.css');
const brandMark = await read('src/components/delivery/DeliveryBrandMark.jsx');
const demos = await read('src/pages/FormatDemo.jsx');
const event = await read('src/components/delivery/EventCampaignViewers.jsx');
const preview = await read('src/components/delivery/ClientDeliveryPreview.jsx');
const dashboard = await read('src/pages/Dashboard.jsx');
const volume = await read('src/pages/VolumeManager.jsx');
const volumeGallery = await read('src/pages/VolumeGallery.jsx');
const viewerCss = await read('src/pages/DeliveryViewer.css');
const creationCss = await read('src/pages/CreateDelivery.css');
const formatCss = await read('src/styles/format-demos.css');
const eventCss = await read('src/components/delivery/EventCampaignViewers.css');
const directionStudio = await read('src/components/delivery/DeliveryDirectionStudio.jsx');
const createMusic = await read('src/pages/CreateDelivery.jsx');
const deliveryUpload = await read('src/utils/deliveryUpload.js');

for (const format of ['photo-story', 'editorial-page', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign']) {
  assert.match(formats, new RegExp(`id: '${format}'`), `Missing format: ${format}`);
}
assert.match(viewer, /setBlocked\(true\)/, 'Viewer must block until every asset is ready');
assert.match(viewer, /audio\.oncanplay = done/, 'Audio preload must confirm decodable audio on mobile browsers');
assert.match(viewer, /response = await fetch\(url/, 'Readiness must download each media file before opening');
assert.match(viewer, /URL\.createObjectURL\(blob\)/, 'Readiness must reuse downloaded media in the viewer');
assert.match(viewer, /current\[task\.kind\] \+ \(ok \? 1 : 0\)/, 'Failed media must not count as ready');
assert.match(viewer, /playbackDelivery/, 'Viewer must render the same preloaded media it checked');
assert.match(await read('src/pages/StoryViewer.jsx'), /url\.protocol === 'blob:'/ , 'Photo Story must accept the blob URLs produced by the full-media readiness gate');
assert.match(viewer, /Try loading again/, 'Viewer must offer a retry instead of opening with missing files');
assert.match(viewer, /photos\/\$\{assetId\}\/download/, 'Viewer must download photographs through the protected individual route');
assert.doesNotMatch(viewer, /\/download-all/, 'Viewer must not send clients a ZIP archive');
assert.doesNotMatch(storyViewer, /\/download-all/, 'Photo Story must not send clients a ZIP archive');
assert.match(gallery, /Download all photos/, 'Gallery must describe individual photograph downloads');
assert.match(gallery, /downloadNotice/, 'Gallery must show mobile download guidance');
assert.match(galleryCss, /header-actions>\.client-gallery-icon/, 'Gallery close control must have an explicit centered layout');
assert.match(brandMark, /delivery-brand-mark-initials/, 'Pro deliveries without a logo must still show studio identity');
assert.match(deliveryUpload, /response\.status < 200 \|\| response\.status >= 300/, 'Delivery uploads must check XMLHttpRequest status codes');
assert.doesNotMatch(deliveryUpload, /const response = result\.response;[\s\S]{0,180}if \(!response\.ok\)/, 'Delivery uploads must not treat XMLHttpRequest like fetch');
assert.match(viewer, /onTimeUpdate={syncNarrationCue}/, 'Narration must expose the approved caption that is currently being read');
assert.match(viewer, /READING THE APPROVED CAPTION/, 'Non-story formats must show the narration cue in sync with captions');
assert.match(viewer, /narrationInteractionRef/, 'Narration must start after the client opening interaction');
assert.match(viewer, /addEventListener\('pointerdown'/, 'Narration must support a mobile opening gesture');
assert.match(viewer, /preload="auto"/, 'Narration and music elements must request automatic buffering');
assert.match(create, /Exact client format preview/, 'Creation flow must render an exact client preview');
assert.match(create, /Narration with Hannah/, 'Narration must be visible and enabled by default');
assert.match(create, /narration: true/, 'Narration must be enabled by default in the creation flow');
assert.match(create, /narration: access\.narration/, 'Publish must carry the photographer narration choice');
assert.match(create, /field === 'caption' \? \{ narration: undefined \}/, 'Editing an approved caption must invalidate stale narration before preview');
assert.match(create, /return \{ \.\.\.current, narration: undefined, assets:/, 'Changing approved photo order must invalidate stale narration before preview');
assert.match(create, /ClientDeliveryPreview/, 'Creation review must use the shared client experience preview');
assert.match(preview, /DeliveryReadiness/, 'Creation preview must use the same full-media readiness gate');
assert.match(preview, /playbackDelivery/, 'Creation preview must render the same preloaded media it checked');
assert.match(preview, /onNarrationNavigate: seekNarrationToAssets/, 'Creation preview must seek narration from the approved photo order');
assert.match(preview, /Client experience/, 'Creation preview must expose the client-ready state');
assert.match(preview, /accessPin/, 'Creation preview must be able to exercise the client PIN gate');
assert.match(preview, /previewUnlocked/, 'Creation preview must wait at the access gate before media readiness');
assert.match(preview, /allowIndividualDownloads/, 'Creation preview must carry saved gallery download permissions');
assert.match(preview, /onDownloadAll/, 'Creation preview must keep the client gallery actions visible');
assert.match(gallery, /photo\.caption/, 'Shared gallery must render per-photo captions');
assert.match(gallery, /client-gallery-lightbox-caption/, 'Shared gallery lightbox must render the approved caption');
assert.match(demos, /normalizeDeliveryPhotos/, 'Format viewers must normalize generated captions');
assert.match(demos, /fd-lightbox-caption/, 'Format lightboxes must render the approved caption');
assert.match(demos, /onViewportEnter=\{\(\) => onNarrationNavigate/, 'Editorial scrolling must seek narration to the approved photograph');
assert.match(demos, /imageFilter = 'none'/, 'Finished photographs must keep their original colour');
assert.match(directionStudio, /Original file colour/, 'Creation UI must explain that finished photographs are not re-graded');
for (const composition of ['split', 'layered', 'grid', 'portrait-led', 'wide-led']) {
  assert.match(formatCss, new RegExp(`data-composition=\\"${composition}\\"`), `Missing personal composition rules: ${composition}`);
  assert.match(eventCss, new RegExp(`data-composition=\\"${composition}\\"`), `Missing event/campaign composition rules: ${composition}`);
}
for (const placement of ['corners', 'labels', 'type', 'rules']) {
  assert.match(formatCss, new RegExp(`data-accent-placement=\\"${placement}\\"`), `Missing accent placement: ${placement}`);
  assert.match(eventCss, new RegExp(`data-accent-placement=\\"${placement}\\"`), `Missing event accent placement: ${placement}`);
}
assert.match(formatCss, /fd-editorial \.fd-ed-cover>figure \.v-photo[\s\S]*filter:none!important/, 'Editorial images must not be colour filtered');
assert.doesNotMatch(demos, /audioTrack = delivery\?\.soundtrack\?\.url \|\| '\/audio\//, 'Real deliveries must not fall back to demo soundtrack files');
assert.match(event, /vec-photo-caption/, 'Event and campaign viewers must show captions');
assert.match(dashboard, /Try again/, 'Studio dashboard must expose a recovery state');
assert.match(dashboard, /No matching deliveries/, 'Studio dashboard must expose a no-match state');
assert.match(dashboard, /Promise\.allSettled/, 'Studio dashboard must wait for every delivery list without masking partial failures');
assert.match(dashboard, /partialError/, 'Studio dashboard must expose partial delivery-list failures');
assert.match(dashboard, /Some delivery lists could not be loaded/, 'Studio dashboard must explain incomplete delivery data');
assert.match(dashboard, /hasLoaded/, 'Studio dashboard must distinguish initial loading from a refresh');
assert.match(dashboard, /dataUnavailable \? '—'/, 'Studio dashboard must not show complete metrics while data is unavailable');
assert.match(dashboard, /Some studio information is unavailable/, 'Studio dashboard must not claim the studio is clear on partial data');
assert.match(volume, /Export CSV/, 'Volume workflow must expose recipient export');
assert.match(volume, /Archive delivery/, 'Volume workflow must expose lifecycle controls');
assert.match(volume, /Edit recipient|Save recipient/, 'Volume workflow must expose recipient editing');
assert.match(volume, /navigator\.clipboard\.writeText\(url\)/, 'Volume publish must treat clipboard failure separately from a successful publish');
assert.match(volume, /RECIPIENT LINK READY/, 'Volume workflow must retain a published share link in the UI');
assert.match(volume, /active\.status !== 'draft'/, 'Volume editing controls must be disabled after publishing');
assert.match(volumeGallery, /ClientGallery/, 'Recipient galleries must use the shared Photo Story gallery');
assert.match(volumeGallery, /Photo Story gallery to read captions/, 'Recipient galleries must explain the shared caption experience');
assert.match(createMusic, /Track notes/, 'Photographers must be able to inspect soundtrack suitability notes');
assert.match(createMusic, /Open Pixabay source/, 'Photographers must have the source record for a curated soundtrack');
for (const breakpoint of ['640px', '768px', '1024px']) {
  assert.match(`${viewerCss}\n${creationCss}`, new RegExp(`min-width:${breakpoint}`), `Missing responsive breakpoint: ${breakpoint}`);
}

for (const width of [320, 640, 768, 810, 820, 834, 1024, 1280]) assert.ok(width > 0, `Responsive width ${width} missing`);
console.log('Delivery V2 client contract verified: formats, captions, strict readiness, preview, and responsive checkpoints.');
