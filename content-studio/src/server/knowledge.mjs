import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';
import { repo, root } from './config.mjs';
import { atomicWrite, hash } from './storage.mjs';
import { setting } from './database.mjs';

const featureDefinitions = [
  ['dashboard', 'Photographer dashboard', 'feature', 'client/src/pages/Dashboard.jsx', '/dashboard', 'Keep completed deliveries together in the photographer dashboard.', 'Finding and sharing a completed client delivery.'],
  ['gridboard', 'GridBoard', 'photo', 'client/src/pages/GridboardDelivery.jsx', '/demo/gridboard', 'Help clients explore the complete collection.', 'Finding a particular moment in a large shoot.'],
  ['photoswap', 'Photo Swap', 'photo', 'client/src/pages/PhotoSwapDelivery.jsx', '/demo/photoswap', 'Present finished photographs one swipe at a time.', 'Giving a portrait collection a focused first viewing.'],
  ['video', 'Video delivery', 'video', 'client/src/pages/VideoDeliveryPage.jsx', '/demo/video', 'Deliver finished films through a dedicated client player.', 'Handing over finished films with a considered viewing experience.'],
  ['portfolio', 'Portfolio', 'feature', 'client/src/pages/PortfolioPage.jsx', '/portfolio', 'Choose completed work to present in a public portfolio.', 'Having a considered collection ready when someone asks to see your work.'],
  ['library', 'Photo Library', 'feature', 'client/src/pages/ImageLibrary.jsx', '/library', 'Organise photographs by shoot.', 'Keeping shoots and their files organised.'],
  ['preselection', 'Photo Pre-selection', 'feature', 'client/src/pages/PhotoPreselection.jsx', '/pre-selection', 'Prepare a client selection and review their submitted photographs.', 'Collecting client choices before preparing finished edits.'],
  ['editor-links', 'Editor Links', 'feature', 'client/src/pages/EditorLinks.jsx', '/editor-links', 'Send originals to an editor and review returned edits.', 'Keeping the editor handoff and returned files together.'],
  ['sharing', 'Sharing', 'feature', 'client/src/pages/CreateDeliveryV3.jsx', '/create?type=showcase', 'Share the finished delivery through a client link.', 'Sending finished work through the channels clients already use.'],
  ['downloads', 'Gallery and downloads', 'feature', 'client/src/components/PublicDesign.jsx', '/demo', 'Let clients browse and download the finished photographs provided.', 'Keeping the complete gallery available after the presentation.'],
  ['privacy', 'Client access controls', 'feature', 'client/src/pages/CreateDeliveryV3.jsx', '/create?type=showcase', 'Choose client access and download settings before publishing.', 'Controlling access to a client delivery.'],
  ['branding', 'Studio branding', 'feature', 'client/src/components/PublicDesign.jsx', '/settings', 'Present eligible deliveries with the studio brand.', 'Keeping the photographer’s identity visible during handover.'],
];
export const sourcePaths = [...new Set(['AGENTS.md', 'productdescription.md', 'client/src/constants/deliveryFormats.js', 'client/src/constants/eventCoverageDemo.js', 'client/src/constants/deliveryDemoFixtures.js', 'client/src/constants/videoDemoMedia.js', 'client/src/pages/LandingPage.jsx', 'client/src/App.jsx', 'client/src/pages/FormatDemo.jsx', 'client/src/index.css', 'client/src/styles/public.css', 'client/src/components/PublicDesign.jsx', 'client/src/utils/motionPolicy.js', 'server/src/constants/pixabaySoundtracks.json', ...featureDefinitions.map(item => item[3])])];
export async function sourceFingerprint() {
  const sources = [], paths = new Set(sourcePaths);
  async function collect(relative) { for (const entry of await fs.readdir(path.join(repo, relative), { withFileTypes: true })) { const filename = relative + '/' + entry.name; if (entry.isDirectory()) await collect(filename); else if (entry.isFile() && /\.(?:jsx?|css|json)$/.test(entry.name)) paths.add(filename); } }
  await collect('client/src');
  for (const relative of [...paths].sort()) {
    try { sources.push({ path: relative, sha256: hash(await fs.readFile(path.join(repo, relative))) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; sources.push({ path: relative, missing: true }); }
  }
  return { sources, digest: hash(sources) };
}
function tokensFrom(files) {
  const values = { colors: new Set(), fonts: new Set(), spacing: new Set(), radii: new Set(), shadows: new Set(), easing: new Set(), variables: {}, evidence: [] };
  for (const [filename, css] of files) postcss.parse(css, { from: filename }).walkDecls(decl => {
    const val = decl.value;
    if (decl.prop.startsWith('--')) values.variables[decl.prop] = val;
    for (const color of val.match(/#[a-f\d]{3,8}\b/gi) || []) values.colors.add(color.toLowerCase());
    if (decl.prop === 'font-family') values.fonts.add(val);
    if (/^(padding|margin|gap)(-|$)/.test(decl.prop)) values.spacing.add(val);
    if (decl.prop.includes('radius')) values.radii.add(val);
    if (decl.prop.includes('shadow')) values.shadows.add(val);
    for (const easing of val.match(/cubic-bezier\([^)]+\)/g) || []) values.easing.add(easing);
  });
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value instanceof Set ? [...value].sort() : value]));
}
export async function extractKnowledge({ output = path.join(root, 'knowledge') } = {}) {
  const fingerprint = await sourceFingerprint();
  const text = await fs.readFile(path.join(repo, 'productdescription.md'), 'utf8');
  const agentRules = await fs.readFile(path.join(repo, 'AGENTS.md'), 'utf8');
  const { DELIVERY_FORMATS } = await import(pathToFileURL(path.join(repo, 'client/src/constants/deliveryFormats.js')).href + '?digest=' + fingerprint.digest);
  const catalog = DELIVERY_FORMATS.map(format => ({
    id: 'showcase:' + format.value, name: format.name, family: 'showcase', description: format.description, bestFor: format.bestFor, problem: format.line,
    route: format.value === 'photo-story' ? '/demo' : '/demo/' + (format.value === 'photo-reveal' ? 'reveal' : format.value),
    evidence: ['client/src/constants/deliveryFormats.js', 'client/src/pages/FormatDemo.jsx'], availability: 'source_present', approvalRequired: true,
  }));
  for (const [id, name, family, source, route, description, problem] of featureDefinitions) catalog.push({ id, name, family, description, problem, route, evidence: [source], availability: fingerprint.sources.find(item => item.path === source)?.missing ? 'unverified' : 'source_present', approvalRequired: true });
  for (const feature of catalog) feature.digest = hash({ ...feature, sourceHashes: feature.evidence.map(source => fingerprint.sources.find(item => item.path === source)?.sha256 || 'not-fingerprinted') });
  const cssFiles = await Promise.all(['client/src/index.css', 'client/src/styles/public.css'].map(async filename => [filename, await fs.readFile(path.join(repo, filename), 'utf8')]));
  const design = tokensFrom(cssFiles);
  const parsedPublic = postcss.parse(cssFiles.find(([filename]) => filename.endsWith('public.css'))[1]);
  const declaration = (selector, property) => { let value; parsedPublic.walkRules(rule => { if (rule.selector.split(',').map(item => item.trim()).includes(selector)) rule.walkDecls(property, decl => { value ??= decl.value; }); }); if (!value) throw new Error('A required design source changed: ' + selector + ' / ' + property); return value; };
  design.studio = { background: declaration('.v-public', 'background'), surface: declaration('.v-auth-panel', 'background'), accent: declaration('.v-public', '--v-accent'), strong: declaration('.v-button', 'background'), fontFamily: declaration('.v-auth-content h2', 'font-family') };
  design.sources = cssFiles.map(([source]) => source);
  const publicDesign = await fs.readFile(path.join(repo, 'client/src/components/PublicDesign.jsx'), 'utf8');
  const motion = publicDesign.match(/ease:\s*\[([\d.,\s]+)\]/);
  design.reveal = { easing: motion ? motion[1].split(',').map(Number) : null, duration: Number(publicDesign.match(/duration: reduced \? 0 : ([\d.]+)/)?.[1] || 0) };
  const brandLine = text.match(/Don[’']t just deliver photos\. Showcase them\./)?.[0];
  if (!brandLine) throw new Error('The master product description has no recognised brand line.');
  const copyStart = text.indexOf('# 51.');
  const copyRules = copyStart >= 0 ? text.slice(copyStart).replace(/[\t ]+$/gm, '').trimEnd() : '';
  const bannedSections = (agentRules.split('## 2.')[1]?.split('## 3.')[0] || '') + '\n' + (copyRules.split('2. **Zero Generic AI Fluff:**')[1]?.split('3. **')[0] || '');
  const banned = [...new Set([...bannedSections.matchAll(/\*"([^"]+)"\*/g)].flatMap(match => match[1].toLowerCase().split(' / ')))];
  const facts = catalog.map(feature => ({ id: 'feature:' + feature.id, statement: feature.description, allowedWording: feature.description, source: feature.evidence, sourceDigest: feature.digest, allowedSurfaces: ['voiceover', 'caption', 'on-screen'], approvalRequired: true }));
  const files = {
    'sources.json': fingerprint,
    'product-catalog.json': { version: 1, features: catalog },
    'facts.json': { version: 1, facts },
    'offer.json': { version: 1, pricingAllowed: false, allowancesAllowed: false, ctas: [{ id: 'start-free', text: 'Get started for free. Link in bio.', appliesTo: 'free-account', notAClaimThatAllFeaturesAreFree: true }, { id: 'explore', text: 'Explore Veylo. Link in bio.', appliesTo: 'all' }] },
    'design-language.json': design,
    'design-language.md': '# Extracted design language\n\nGenerated from the client styles. See design-language.json for exact values and sources.\n\nFonts: ' + design.fonts.join('; ') + '\n',
    'brand.md': '# Veylo\n\n' + brandLine + '\n\nAudience: photographers and media studios, Nigeria first.\n\n## Master copy rules\n\n' + copyRules + '\n',
    'banned-phrases.json': banned,
    'never-claim.md': '# Claims the studio must block\n\nNo invented statistics, prices, monthly allowances, income promises, guarantees, competitor bashing, unshipped features, fabricated testimonials or claims that Veylo retouches photographs or generates finished client films. A free-account CTA does not make paid features free.\n\nThe approved full-product catalog supersedes the earlier Photo Story-only brief. The original master remains unchanged.\n',
    'image-style.md': '# Media direction\n\nUse authentic Nigerian settings when relevant. Every generated person, including background people, must be a Black adult. No celebrity likenesses, generated children, generated text or visible watermarks. Generated scenes are context; finished photographer work uses cleared real photographs. Preserve the original edits. Human review is required for every uploaded generated asset.\n',
    'conflicts.json': { items: [ { id: 'product-scope', detail: 'The original master and AGENTS describe a narrower final-photo-delivery product. Current source and the owner’s approved studio plan include additional delivery and collaboration capabilities.', resolution: 'Use source-backed catalog entries only after owner review; do not rewrite the original product documents.' }, { id: 'pricing', detail: 'Historical product documents disagree on pricing and allowances.', resolution: 'Prices and allowances are excluded from promotional generation.' } ] },
  };
  for (const [name, value] of Object.entries(files)) await atomicWrite(path.join(output, name), value);
  const { fontFamily, ...tokenCss } = design.studio;
  for (const color of Object.values(tokenCss)) if (!design.colors.includes(color)) throw new Error('A studio colour is no longer present in the client styles: ' + color);
  await atomicWrite(path.join(output, 'design-tokens.css'), ':root{' + Object.entries(tokenCss).map(([key, value]) => `--studio-${key}:${value}`).join(';') + ';--studio-font:' + fontFamily + '}\n');
  if (!(await fs.access(path.join(output, 'learnings.md')).then(() => true).catch(() => false))) await atomicWrite(path.join(output, 'learnings.md'), '# Approved learnings\n\nNo performance learnings have been approved yet.\n');
  return { ...fingerprint, featureCount: catalog.length };
}
export async function readKnowledge(config, db) {
  const folder = path.join(root, 'knowledge');
  const read = async name => JSON.parse(await fs.readFile(path.join(folder, name), 'utf8'));
  const [sources, catalog, facts, offer, conflicts, current, banned] = await Promise.all([read('sources.json'), read('product-catalog.json'), read('facts.json'), read('offer.json'), read('conflicts.json'), sourceFingerprint(), read('banned-phrases.json')]);
  const features = catalog.features.map(feature => {
    const approval = db.prepare('SELECT * FROM approvals WHERE subject=? AND digest=?').get('feature:' + feature.id, feature.digest);
    const stale = feature.evidence.some(source => current.sources.find(row => row.path === source)?.sha256 !== sources.sources.find(row => row.path === source)?.sha256);
    return { ...feature, review: approval?.decision || 'pending', reviewNote: approval?.note || '', stale, eligible: !stale && approval?.decision === 'approved' && feature.availability === 'source_present' };
  });
  const crawl = setting(db, 'crawl', { state: 'not_run', message: 'Public site crawl has not run. Source evidence is available for review.' });
  return { digest: sources.digest, stale: current.digest !== sources.digest || Boolean(crawl.changed), features, facts: facts.facts.filter(fact => features.find(feature => 'feature:' + feature.id === fact.id)?.eligible), offer, banned, conflicts: conflicts.items, sourceCount: sources.sources.length, crawl };
}
export async function initialiseKnowledge() { try { await fs.access(path.join(root, 'knowledge/sources.json')); } catch { await extractKnowledge(); } }
