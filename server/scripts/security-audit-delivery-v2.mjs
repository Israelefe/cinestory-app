import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const projectRoot = resolve(serverRoot, '..');

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist'].includes(entry.name)) files.push(...await filesUnder(path));
    else if (entry.isFile() && ['.js', '.jsx', '.mjs'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

const deliveryRoutes = await readFile(join(serverRoot, 'src/routes/delivery.routes.js'), 'utf8');
const volumeRoutes = await readFile(join(serverRoot, 'src/routes/volume.routes.js'), 'utf8');
const deliveryController = await readFile(join(serverRoot, 'src/controllers/delivery.controller.js'), 'utf8');
const volumeController = await readFile(join(serverRoot, 'src/controllers/volume.controller.js'), 'utf8');
const storyController = await readFile(join(serverRoot, 'src/controllers/story.controller.js'), 'utf8');
const storyRoutes = await readFile(join(serverRoot, 'src/routes/story.routes.js'), 'utf8');
const authRoutes = await readFile(join(serverRoot, 'src/routes/auth.routes.js'), 'utf8');
const authController = await readFile(join(serverRoot, 'src/controllers/auth.controller.js'), 'utf8');
const portfolioController = await readFile(join(serverRoot, 'src/controllers/portfolio.controller.js'), 'utf8');
const portfolioModel = await readFile(join(serverRoot, 'src/models/Portfolio.js'), 'utf8');
const profilePolicy = await readFile(join(serverRoot, 'src/constants/profilePolicy.js'), 'utf8');
const serverEntry = await readFile(join(serverRoot, 'server.js'), 'utf8');
const renderConfig = await readFile(join(projectRoot, 'render.yaml'), 'utf8');
const clientFiles = await filesUnder(join(projectRoot, 'client/src'));
const clientSource = (await Promise.all(clientFiles.map(file => readFile(file, 'utf8')))).join('\n');

assert.match(deliveryRoutes, /router\.use\(authMiddleware\)/, 'Private delivery routes must require authentication');
assert.match(volumeRoutes, /router\.use\(authMiddleware\)/, 'Private volume routes must require authentication');
assert.match(deliveryRoutes, /aiGenerationLimit/, 'AI generation routes must be rate limited');
assert.match(volumeRoutes, /publicAccessLimit.*request-code|publicAccessLimit/, 'Public volume access must be rate limited');
assert.match(deliveryController, /ownedDelivery\(req\.params\.id, req\.user\.id\)/, 'Delivery mutations must scope records to the signed-in studio');
assert.match(deliveryController, /creativeDirection\.frames = object\.creativeDirection\.frames\.filter/, 'Restricted role links must filter creative frames to visible photographs');
assert.match(deliveryController, /if \(scoped\) delete object\.narration/, 'Restricted role links must not expose a full-delivery narration track');
assert.match(deliveryController, /if \(!grant\) return delivery\.assets/, 'Public payload asset access must distinguish an absent grant from an empty scoped grant');
assert.match(deliveryController, /if \(!selectedAssets\.length\)/, 'Restricted gallery downloads must reject empty scopes');
assert.match(volumeController, /ownedJob\(req\.params\.id, req\.user\.id\)/, 'Volume mutations must scope records to the signed-in studio');
assert.match(deliveryController, /z\.object\(/, 'Delivery inputs must be validated before mutation');
assert.match(volumeController, /z\.object\(/, 'Volume inputs must be validated before mutation');
assert.match(volumeController, /accessVersion/, 'Archiving a volume delivery must invalidate old access tokens');
assert.match(volumeController, /codeDigest\(/, 'Volume access codes must be stored as digests');
assert.match(volumeController, /\[=\+\\-@\]/, 'CSV exports must neutralise spreadsheet formula injection');
assert.match(serverEntry, /DEEPGRAM_API_KEY/, 'Production must require the configured narration provider key');
assert.doesNotMatch(serverEntry, /pages\.dev|workers\.dev/, 'Credentialed CORS must not allow every Cloudflare preview origin');
assert.match(serverEntry, /allowedOrigins\.has\(clean\)/, 'Credentialed CORS must use the configured origin allowlist');
assert.match(storyController, /legacyStorySchema\.safeParse/, 'Legacy Photo Story publishing must validate the complete payload');
assert.match(storyController, /status: 'published'/, 'Legacy Photo Story publishing must not accept a client-supplied draft status');
assert.match(storyController, /status: 'published' \},/, 'Legacy public stories must only expose published records');
assert.match(storyController, /const \{ userId, __v, \.\.\.publicStory \}/, 'Legacy public payloads must not expose ownership internals');
assert.match(storyRoutes, /publicMediaLimit, async/, 'Legacy audio proxy must be rate limited');
assert.match(storyRoutes, /allowedHosts = new Set/, 'Legacy audio proxy must use an explicit host allowlist');
assert.match(storyRoutes, /target\.protocol !== 'https:'/ , 'Legacy audio proxy must reject insecure or non-HTTP targets');
assert.match(authRoutes, /router\.patch\('\/profile', authMiddleware, profileUpdateLimit, updateProfile\)/, 'Profile changes must be authenticated and rate limited');
assert.match(authController, /STUDIO_NAME_COOLDOWN/, 'Account studio-name changes must enforce the cooldown');
assert.match(portfolioController, /PORTFOLIO_HANDLE_COOLDOWN/, 'Portfolio address changes must enforce the cooldown');
assert.match(portfolioController, /previousHandles/, 'Portfolio address changes must retain previous-address metadata');
assert.match(portfolioModel, /previousHandles/, 'Portfolio model must store previous-address redirect and reservation metadata');
assert.match(profilePolicy, /30 \* 24 \* 60 \* 60 \* 1000/, 'Studio-name cooldown must remain 30 days');
assert.match(profilePolicy, /90 \* 24 \* 60 \* 60 \* 1000/, 'Portfolio address cooldown and redirect must remain 90 days');
assert.match(profilePolicy, /365 \* 24 \* 60 \* 60 \* 1000/, 'Previous portfolio addresses must remain reserved for one year');
assert.match(renderConfig, /key: DELIVERY_PIPELINE_ENABLED\s+value: "true"/, 'The production worker must be enabled for the configured delivery pipeline');
assert.doesNotMatch(clientSource, /DEEPGRAM_API_KEY|JWT_SECRET|CLOUDINARY_API_SECRET|MONGODB_URI/, 'Private provider and database secrets must never reach the client bundle');
assert.doesNotMatch(`${clientSource}\n${deliveryController}\n${serverEntry}`, /ELEVENLABS_API_KEY|elevenlabs/i, 'The previous narration provider must not remain in the delivery path');

console.log('Delivery V2 security audit passed: ownership, validation, rate limits, token invalidation, secret boundaries, and provider cleanup are present.');
