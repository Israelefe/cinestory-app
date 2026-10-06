import crypto from 'node:crypto';
import { Transform, Readable } from 'node:stream';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cloudinary, configureCloudinary } from '../src/services/cloudinary.service.js';
import StorageAsset from '../src/models/StorageAsset.js';
import Delivery from '../src/models/Delivery.js';
import PhotoStory from '../src/models/PhotoStory.js';
import User from '../src/models/User.js';
import Portfolio from '../src/models/Portfolio.js';
import PortfolioMedia from '../src/models/PortfolioMedia.js';
import ContentProject from '../src/models/ContentProject.js';
import DeliveryPreviewFile from '../src/models/DeliveryPreviewFile.js';
import { getR2ObjectStream, headR2Object, imageVariantKey, listR2Objects, prepareR2Image, putR2ObjectStream, r2Configured } from '../src/services/r2.service.js';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(serverRoot, '.runtime', 'cloudinary-r2-migration-manifest.json');
dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true });

const flags = new Set(process.argv.slice(2).filter(value => value.startsWith('--')));
const apply = flags.has('--apply');
const deleteCloudinarySource = flags.has('--delete-cloudinary-source');
if (deleteCloudinarySource && !apply) throw new Error('--delete-cloudinary-source requires --apply.');

const TARGET_MAX_BYTES = 5 * 1024 * 1024 * 1024;
const TRANSFER_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const targets = new Map();
const targetKeyOwners = new Map();
const migrated = new Map();
const retiredCloudinarySources = new Map();
const failures = [];
let unresolvedCloudinaryUrls = 0;

function value(value) { return String(value || '').trim(); }
function digest(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function pairKey(resourceType, publicId) { return `${resourceType}\u0000${publicId}`; }
function hasCloudinaryHost(input) {
  try {
    const host = new URL(String(input || '')).hostname.toLowerCase();
    return host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com');
  } catch { return false; }
}
function normalizeResourceType(value) {
  if (value === 'raw' || value === 'image' || value === 'video') return value;
  if (value === 'audio') return 'video';
  return 'image';
}

function cloudinaryReference(input) {
  const raw = value(input);
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return raw.startsWith('/') || raw.startsWith('local:') ? null : { publicId: raw, resourceType: 'image' }; }
  const sourceHost = parsed.hostname.toLowerCase();
  if (sourceHost !== 'res.cloudinary.com' && !sourceHost.endsWith('.res.cloudinary.com')) return null;
  const parts = parsed.pathname.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  const resourceIndex = parts.findIndex(part => ['image', 'video', 'raw'].includes(part));
  if (resourceIndex < 0) return null;
  const resourceType = normalizeResourceType(parts[resourceIndex]);
  const uploadIndex = parts.findIndex((part, index) => index > resourceIndex && ['upload', 'authenticated', 'private'].includes(part));
  if (uploadIndex < 0) return null;
  const afterDelivery = parts.slice(uploadIndex + 1);
  const versionIndex = afterDelivery.findIndex(part => /^v\d+$/.test(part));
  let keyStart = versionIndex >= 0 ? versionIndex + 1 : afterDelivery.findIndex(part => part === 'veylo');
  if (keyStart < 0 && versionIndex < 0) {
    const transformKeys = new Set(['a', 'ac', 'ar', 'b', 'bo', 'br', 'c', 'co', 'cs', 'd', 'dn', 'du', 'e', 'eo', 'f', 'fl', 'g', 'h', 'ki', 'l', 'o', 'p', 'pg', 'q', 'r', 't', 'u', 'vc', 'vs', 'w', 'x', 'y', 'z']);
    keyStart = afterDelivery.findIndex(part => !/^s--[^/]+--$/.test(part) && !part.split(',').some(token => transformKeys.has(token.split('_', 1)[0]) && token.includes('_')));
  }
  if (keyStart < 0 || keyStart >= afterDelivery.length) return null;
  const keyParts = afterDelivery.slice(keyStart);
  if (resourceType !== 'raw' && keyParts.length) keyParts[keyParts.length - 1] = keyParts[keyParts.length - 1].replace(/\.(?:jpe?g|png|webp|gif|avif|mp4|webm|mov|mp3|wav|m4a|ogg|aac|flac)$/i, '');
  const publicId = keyParts.filter(Boolean).join('/');
  return publicId ? { publicId, resourceType } : null;
}

function canonicalRef(input, defaultType = 'image') {
  const fromUrl = cloudinaryReference(input);
  if (fromUrl) return { ...fromUrl, resourceType: normalizeResourceType(defaultType || fromUrl.resourceType) };
  const raw = value(input);
  if (!raw || raw.startsWith('/') || raw.startsWith('local:') || /^https?:\/\//i.test(raw)) return null;
  return { publicId: raw, resourceType: normalizeResourceType(defaultType) };
}

function chooseKey(publicId, resourceType, ownerId, context) {
  const owner = String(ownerId || 'legacy').replace(/[^a-f\d]/gi, '').slice(0, 40) || 'legacy';
  const suffix = digest(`${resourceType}\u0000${publicId}`).slice(0, 40);
  if (context === 'studio-logo') return publicId.startsWith(`veylo/studios/${owner}/`) ? publicId : `veylo/studios/${owner}/profile`;
  if (context === 'avatar') return publicId.startsWith(`veylo/studios/${owner}/`) ? publicId : `veylo/studios/${owner}/profile/avatar`;
  if (publicId.startsWith('veylo/')) return publicId;
  if (context === 'story-photo' || context === 'story-soundtrack') return `veylo/users/${owner}/stories/migrated/${suffix}`;
  if (context === 'content-studio') return `veylo/content-studio/${owner}/migrated/${suffix}`;
  return `veylo/users/${owner}/migrated/${suffix}`;
}

function addTarget(input, resourceType, ownerId, context = '') {
  const ref = canonicalRef(input, resourceType);
  if (!ref) {
    try {
      const parsed = new URL(String(input || ''));
      const host = parsed.hostname.toLowerCase();
      if (host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com')) unresolvedCloudinaryUrls += 1;
    } catch { /* Non-URL references do not need Cloudinary URL parsing. */ }
    return null;
  }
  const pair = pairKey(ref.resourceType, ref.publicId);
  const known = targets.get(pair);
  if (known) {
    if (context === 'studio-logo') known.context = context;
    return pair;
  }
  let key = chooseKey(ref.publicId, ref.resourceType, ownerId, context);
  const keyOwner = targetKeyOwners.get(key);
  if (keyOwner && keyOwner !== pair) key = `veylo/users/${String(ownerId || 'legacy').replace(/[^a-f\d]/gi, '').slice(0, 40) || 'legacy'}/migrated/${digest(pair).slice(0, 40)}`;
  targetKeyOwners.set(key, pair);
  targets.set(pair, { ...ref, key, ownerId: String(ownerId || ''), context });
  return pair;
}

function inferResourceType(node, parentKey = '') {
  const type = normalizeResourceType(node?.resourceType || node?.resource_type || 'image');
  const format = value(node?.format).toLowerCase();
  if (type === 'raw' || node?.resourceType === 'video' || node?.resource_type === 'video') return type;
  if (['soundtrack', 'narration', 'opening', 'closing', 'captions', 'music', 'effect', 'voice', 'audio'].includes(parentKey) || ['music', 'video', 'audio'].includes(node?.kind) || ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'mp4', 'webm', 'mov'].includes(format)) return 'video';
  return 'image';
}

function walk(value, visit, parentKey = '', parent = null) {
  if (Array.isArray(value)) { for (const item of value) walk(item, visit, parentKey, parent); return; }
  if (value instanceof Map) { for (const [key, child] of value) { visit(child, String(key), value, parentKey, parent); walk(child, visit, String(key), value); } return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visit(child, key, value, parentKey, parent);
    walk(child, visit, key, value);
  }
}

function mappedRef(input, resourceType) {
  const ref = canonicalRef(input, resourceType);
  if (!ref) return null;
  return migrated.get(pairKey(ref.resourceType, ref.publicId)) || null;
}

function rewriteTree(node, parentKey = '') {
  if (Array.isArray(node)) return node.map(item => rewriteTree(item, parentKey));
  if (!node || typeof node !== 'object') return node;
  if (node instanceof Map) return new Map([...node.entries()].map(([key, value]) => [key, rewriteTree(value, String(key))]));
  if (node instanceof Date || Buffer.isBuffer(node) || node._bsontype === 'ObjectId') return node;
  const result = {};
  for (const [key, original] of Object.entries(node)) {
    const type = inferResourceType(node, parentKey);
    if (typeof original === 'string' && /(?:publicId|PublicId)$/.test(key)) {
      const changed = mappedRef(original, key === 'rawPublicId' ? 'raw' : type);
      result[key] = changed?.key || original;
      if (changed) {
        if (Number.isFinite(changed.bytes) && Object.hasOwn(node, 'bytes')) result.bytes = changed.bytes;
        if (Number.isFinite(changed.width) && changed.width && Object.hasOwn(node, 'width')) result.width = changed.width;
        if (Number.isFinite(changed.height) && changed.height && Object.hasOwn(node, 'height')) result.height = changed.height;
        if (changed.sha256 && (Object.hasOwn(node, 'contentHash') || Object.hasOwn(node, 'hashAlgorithm'))) {
          result.contentHash = changed.sha256;
          result.hashAlgorithm = 'sha256';
          result.hashVerifiedAt = new Date();
        }
      }
    } else if (typeof original === 'string' && /^https?:\/\//i.test(original) && cloudinaryReference(original)) {
      result[key] = mappedRef(original, type) ? '' : original;
    } else result[key] = rewriteTree(original, key);
  }
  return result;
}

function contentType(resourceType, format) {
  const normalized = value(format).toLowerCase();
  if (resourceType === 'raw') return 'application/octet-stream';
  if (resourceType === 'image') return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' })[normalized] || 'application/octet-stream';
  return ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' })[normalized] || 'application/octet-stream';
}

async function loadRecords() {
  const [storageAssets, deliveries, stories, users, portfolios, portfolioMedia, projects, previewFiles] = await Promise.all([
    StorageAsset.find({}).lean(), Delivery.find({}).lean(), PhotoStory.find({}).lean(), User.find({}).lean(),
    Portfolio.find({}).lean(), PortfolioMedia.find({}).lean(), ContentProject.find({}).lean(), DeliveryPreviewFile.find({}).lean()
  ]);
  return { storageAssets, deliveries, stories, users, portfolios, portfolioMedia, projects, previewFiles };
}

function inventory(records) {
  for (const user of records.users) {
    if (user.studio?.logoPublicId) addTarget(user.studio.logoPublicId, 'image', user._id, 'studio-logo');
    if (user.studio?.logoUrl) addTarget(user.studio.logoUrl, 'image', user._id, 'studio-logo');
    if (user.avatar) addTarget(user.avatar, 'image', user._id, user.avatar === user.studio?.logoUrl ? 'studio-logo' : 'avatar');
  }
  for (const asset of records.storageAssets) {
    addTarget(asset.publicId, 'image', asset.userId, 'library-image');
    if (asset.rawPublicId) addTarget(asset.rawPublicId, 'raw', asset.userId, 'library-raw');
  }
  for (const delivery of records.deliveries) {
    for (const asset of delivery.assets || []) addTarget(asset.publicId, asset.resourceType || 'image', delivery.userId, 'delivery');
    walk(delivery, (child, key, parent, parentKey) => {
      if (key === 'publicId' && typeof child === 'string') addTarget(child, inferResourceType(parent, parentKey), delivery.userId, 'delivery');
      else if (typeof child === 'string' && hasCloudinaryHost(child)) addTarget(child, inferResourceType(parent, parentKey), delivery.userId, 'delivery');
    });
  }
  for (const story of records.stories) {
    for (const photo of story.photos || []) addTarget(photo.url, 'image', story.userId, 'story-photo');
    if (story.soundtrack?.audioUrl) addTarget(story.soundtrack.audioUrl, 'video', story.userId, 'story-soundtrack');
  }
  for (const portfolio of records.portfolios) {
    walk(portfolio, (child, key, parent, parentKey) => {
      if (['publicId', 'heroPublicId'].includes(key) && typeof child === 'string') addTarget(child, 'image', portfolio.userId, 'portfolio');
      else if (typeof child === 'string' && hasCloudinaryHost(child)) addTarget(child, 'image', portfolio.userId, 'portfolio');
    });
  }
  for (const media of records.portfolioMedia) {
    addTarget(media.publicId, 'image', '', 'portfolio');
    const variants = media.variants instanceof Map ? [...media.variants.values()] : Object.values(media.variants || {});
    for (const url of variants) if (typeof url === 'string' && hasCloudinaryHost(url)) addTarget(url, 'image', '', 'portfolio');
  }
  for (const project of records.projects) {
    walk(project, (child, key, parent, parentKey) => {
      if (key === 'publicId' && typeof child === 'string') addTarget(child, inferResourceType(parent, parentKey), project.ownerId, 'content-studio');
      else if (typeof child === 'string' && hasCloudinaryHost(child)) addTarget(child, inferResourceType(parent, parentKey), project.ownerId, 'content-studio');
    });
  }
  for (const preview of records.previewFiles) for (const variant of preview.variants || []) {
    const ref = canonicalRef(variant.publicId, 'image');
    if (ref) retiredCloudinarySources.set(pairKey(ref.resourceType, ref.publicId), { publicId: ref.publicId, resourceType: ref.resourceType, sourceType: 'authenticated', r2Key: '', deleteOnly: true });
    else {
      try {
        const host = new URL(String(variant.publicId || '')).hostname.toLowerCase();
        if (host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com')) unresolvedCloudinaryUrls += 1;
      } catch { /* Empty or non-Cloudinary preview keys need no Cloudinary cleanup. */ }
    }
  }
}

async function findCloudinaryResource(target) {
  const resourceTypes = target.resourceType === 'image' ? ['image'] : target.resourceType === 'video' ? ['video'] : ['raw'];
  const deliveryTypes = ['authenticated', 'private', 'upload'];
  let lastError;
  for (const resource_type of resourceTypes) {
    for (const type of deliveryTypes) {
      try {
        const resource = await cloudinary.api.resource(target.publicId, { resource_type, type });
        return { ...resource, resource_type, type };
      } catch (error) {
        lastError = error;
        const status = Number(error?.http_code || error?.error?.http_code);
        if (status !== 404) break;
      }
    }
  }
  const status = Number(lastError?.http_code || lastError?.error?.http_code) || undefined;
  const label = status === 404 ? 'Cloudinary source was not found' : 'Cloudinary could not read this source';
  throw Object.assign(new Error(`${label} for ${target.publicId} (${target.resourceType}). ${String(lastError?.message || '').slice(0, 160)}`), { status });
}

function signedSourceUrl(target, resource) {
  const options = {
    secure: true,
    resource_type: resource.resource_type,
    type: resource.type,
    sign_url: true,
    ...(resource.version ? { version: resource.version } : {}),
    ...(resource.resource_type !== 'raw' && resource.format ? { format: resource.format } : {})
  };
  const url = cloudinary.url(target.publicId, options);
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname !== 'res.cloudinary.com' && !hostname.endsWith('.res.cloudinary.com')) throw new Error('Cloudinary returned an unexpected media host.');
  return url;
}

async function sha256R2Object(key) {
  const response = await getR2ObjectStream(key, { timeoutMs: TRANSFER_TIMEOUT_MS });
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest('hex') };
}

async function migrateTarget(target) {
  let existing;
  try {
    existing = await headR2Object(target.key);
  } catch (error) { if (error.status !== 404) throw error; }

  let resource;
  try { resource = await findCloudinaryResource(target); }
  catch (error) {
    // This covers a rerun after Cloudinary deletion interrupted partway through.
    // The prior run only deletes a source after its verified R2 copy is present.
    if (!existing || error.status !== 404) throw error;
    const type = target.resourceType;
    const metadata = type === 'image' ? await prepareR2Image(target.key) : null;
    const rawExtension = type === 'raw' ? target.publicId.split('.').at(-1) : '';
    const verification = await sha256R2Object(target.key);
    return { key: target.key, resourceType: type, bytes: existing.bytes, contentType: existing.contentType, etag: existing.etag, sha256: verification.sha256, format: rawExtension || existing.contentType.split('/').at(-1) || '', width: metadata?.width || 0, height: metadata?.height || 0, sourceType: 'authenticated', sourcePresent: false };
  }

  const expectedBytes = Number(resource.bytes || 0);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > TARGET_MAX_BYTES) throw new Error(`Cloudinary reported an unsupported file size for ${target.publicId}.`);
  const type = resource.resource_type;
  const mimeType = contentType(type, resource.format);
  const response = await fetch(signedSourceUrl(target, resource), { redirect: 'follow', signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) });
  const finalHost = new URL(response.url).hostname.toLowerCase();
  if (!response.ok || !response.body || (finalHost !== 'cloudinary.com' && !finalHost.endsWith('.cloudinary.com'))) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Cloudinary could not provide ${target.publicId} for migration.`);
  }
  const sourceHash = crypto.createHash('sha256');
  let sourceBytes = 0;
  const hasher = new Transform({ transform(chunk, _encoding, callback) { sourceBytes += chunk.length; sourceHash.update(chunk); callback(null, chunk); } });
  await putR2ObjectStream(target.key, Readable.fromWeb(response.body).pipe(hasher), { contentType: mimeType, bytes: expectedBytes, timeoutMs: TRANSFER_TIMEOUT_MS });
  if (sourceBytes !== expectedBytes) throw new Error(`The downloaded byte count did not match Cloudinary for ${target.publicId}.`);
  const verifiedSourceHash = sourceHash.digest('hex');
  const copied = await sha256R2Object(target.key);
  if (copied.bytes !== expectedBytes || copied.sha256 !== verifiedSourceHash) throw new Error(`R2 did not match the Cloudinary source for ${target.publicId}.`);

  const metadata = type === 'image' ? await prepareR2Image(target.key) : null;
  const head = await headR2Object(target.key);
  return {
    key: target.key,
    resourceType: type,
    bytes: head.bytes,
    contentType: head.contentType || mimeType,
    etag: head.etag,
    sha256: verifiedSourceHash,
    format: value(resource.format).toLowerCase(),
    width: Number(resource.width || metadata?.width || 0),
    height: Number(resource.height || metadata?.height || 0),
    sourceType: resource.type,
    sourcePresent: true
  };
}

async function withConcurrency(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor++];
      try { migrated.set(current.pair, await worker(current.target)); }
      catch (error) { failures.push({ target: current.target, reason: error.message }); }
    }
  }));
}

function resolveAny(input, resourceType = 'image') {
  const ref = canonicalRef(input, resourceType);
  if (!ref) return null;
  return migrated.get(pairKey(ref.resourceType, ref.publicId)) || null;
}

function storyPublicUrl(story, photo, kind) {
  if (kind === 'soundtrack') return `/api/v1/stories/public/${story.storyId}/soundtrack`;
  return `/api/v1/stories/public/${story.storyId}/photos/${encodeURIComponent(photo.id)}/${kind}`;
}

async function updateRecords(records) {
  let updated = 0;
  for (const asset of records.storageAssets) {
    const image = resolveAny(asset.publicId, 'image');
    const raw = asset.rawPublicId ? resolveAny(asset.rawPublicId, 'raw') : null;
    if (!image && !raw) continue;
    const set = {};
    if (image) Object.assign(set, { publicId: image.key, bytes: image.bytes + Number(raw?.bytes || asset.rawBytes || 0), format: image.format || asset.format, width: image.width || asset.width, height: image.height || asset.height, contentHash: image.sha256 || asset.contentHash, hashAlgorithm: image.sha256 ? 'sha256' : asset.hashAlgorithm, ...(image.sha256 ? { hashVerifiedAt: new Date() } : {}) });
    if (raw) Object.assign(set, { rawPublicId: raw.key, rawFormat: raw.format || asset.rawFormat, rawBytes: raw.bytes });
    await StorageAsset.updateOne({ _id: asset._id }, { $set: set });
    updated += 1;
  }

  for (const delivery of records.deliveries) {
    const next = rewriteTree(delivery);
    let changed = JSON.stringify(next) !== JSON.stringify(delivery);
    for (const [index, asset] of (delivery.assets || []).entries()) {
      const result = resolveAny(asset.publicId, asset.resourceType || 'image');
      if (!result) continue;
      next.assets[index].publicId = result.key;
      if (result.sha256) Object.assign(next.assets[index], { bytes: result.bytes, contentHash: result.sha256, hashAlgorithm: 'sha256', hashVerifiedAt: new Date() });
      changed = true;
    }
    if (!changed) continue;
    await Delivery.updateOne({ _id: delivery._id }, { $set: {
      assets: next.assets, soundtrack: next.soundtrack, narration: next.narration, v3: next.v3,
      creativeDirection: next.creativeDirection, formatConfig: next.formatConfig, photoswap: next.photoswap,
      pinboard: next.pinboard, collectionAnalysis: next.collectionAnalysis,
      formatRecommendations: next.formatRecommendations
    } });
    updated += 1;
  }

  for (const story of records.stories) {
    let changed = false;
    const photos = (story.photos || []).map(photo => {
      const result = resolveAny(photo.url, 'image');
      if (!result) return photo;
      changed = true;
      return { ...photo, storageKey: result.key, url: storyPublicUrl(story, photo, 'media'), thumbnailUrl: storyPublicUrl(story, photo, 'thumbnail') };
    });
    let soundtrack = story.soundtrack;
    const audio = story.soundtrack?.audioUrl ? resolveAny(story.soundtrack.audioUrl, 'video') : null;
    if (audio) { soundtrack = { ...story.soundtrack, storageKey: audio.key, audioUrl: storyPublicUrl(story, null, 'soundtrack') }; changed = true; }
    if (changed) {
      await PhotoStory.updateOne({ _id: story._id }, { $set: { photos, soundtrack } });
      updated += 1;
    }
  }

  for (const user of records.users) {
    const logo = resolveAny(user.studio?.logoPublicId, 'image') || resolveAny(user.studio?.logoUrl, 'image');
    const avatar = user.avatar ? resolveAny(user.avatar, 'image') : null;
    if (!logo && !avatar) continue;
    const publicLogo = `/api/v1/onboarding/public-logo/${user._id}`;
    const publicAvatar = `/api/v1/onboarding/public-avatar/${user._id}`;
    const set = {};
    if (logo) { set['studio.logoPublicId'] = logo.key; set['studio.logoUrl'] = publicLogo; }
    if (avatar) { set.avatarPublicId = avatar.key; set.avatar = publicAvatar; }
    else if (logo && (user.avatar === user.studio?.logoUrl || !user.avatar)) { set.avatarPublicId = logo.key; set.avatar = publicAvatar; }
    await User.updateOne({ _id: user._id }, { $set: set });
    updated += 1;
  }

  for (const portfolio of records.portfolios) {
    const next = rewriteTree(portfolio);
    if (JSON.stringify(next) === JSON.stringify(portfolio)) continue;
    await Portfolio.updateOne({ _id: portfolio._id }, { $set: { heroPublicId: next.heroPublicId, items: next.items, draft: next.draft, profileMedia: next.profileMedia } });
    updated += 1;
  }

  for (const media of records.portfolioMedia) {
    const result = resolveAny(media.publicId, 'image');
    if (!result) continue;
    await PortfolioMedia.updateOne({ _id: media._id }, { $set: {
      publicId: result.key,
      width: result.width || media.width,
      height: result.height || media.height,
      variants: { '400': imageVariantKey(result.key, '400'), '800': imageVariantKey(result.key, '800'), '1600': imageVariantKey(result.key, '1600'), og: imageVariantKey(result.key, 'og') }
    } });
    updated += 1;
  }

  for (const project of records.projects) {
    const next = rewriteTree(project);
    if (JSON.stringify(next) === JSON.stringify(project)) continue;
    await ContentProject.updateOne({ _id: project._id }, { $set: { assets: next.assets, versions: next.versions } });
    updated += 1;
  }

  const retiredPreviews = await DeliveryPreviewFile.deleteMany({});
  return { updated, retiredPreviews: Number(retiredPreviews.deletedCount || 0) };
}

async function saveManifest() {
  let previous = { sources: [] };
  try { previous = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('The saved migration manifest could not be read. It was left unchanged.'); }
  const sources = new Map((previous.sources || []).map(item => [`${item.resourceType}\u0000${item.publicId}`, item]));
  for (const [pair, result] of migrated) {
    if (!result.sourcePresent) continue;
    const target = targets.get(pair);
    sources.set(pair, { publicId: target.publicId, resourceType: result.resourceType, sourceType: result.sourceType, r2Key: result.key });
  }
  for (const [pair, source] of retiredCloudinarySources) if (!sources.has(pair)) sources.set(pair, source);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify({ createdAt: new Date().toISOString(), sources: [...sources.values()] }, null, 2)}\n`, { flag: 'w' });
  await fs.rename(temporaryPath, manifestPath);
}

async function deleteMigratedCloudinarySources() {
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') manifest = null; else throw new Error('The saved migration manifest could not be read. No Cloudinary files were deleted.'); }
  if (!manifest?.sources?.length) throw new Error('No saved migration manifest was found. Run the copy and database update first.');
  const deletionErrors = [];
  for (let offset = 0; offset < manifest.sources.length; offset += 10) {
    await Promise.all(manifest.sources.slice(offset, offset + 10).map(async source => {
      try {
        await cloudinary.uploader.destroy(source.publicId, { resource_type: source.resourceType, type: source.sourceType, invalidate: true });
      } catch (error) {
        deletionErrors.push(`${source.publicId}: ${String(error?.message || 'provider deletion failed').slice(0, 160)}`);
      }
    }));
  }
  if (deletionErrors.length) throw new Error(`Some Cloudinary copies remain. The manifest was kept so deletion can be retried. ${deletionErrors.join('; ')}`);
  await fs.rm(manifestPath, { force: true });
  return manifest.sources.length;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env before running the migration.');
  if (apply && (!configureCloudinary() || !r2Configured())) throw new Error('Set the Cloudinary and R2 credentials in server/.env before applying the migration.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000, autoIndex: false });
  try {
    const records = await loadRecords();
    inventory(records);
    console.log(`Found ${targets.size} media objects referenced by Image Library, deliveries, stories, portfolios, profiles, and Content Studio.`);
    console.log(`Records scanned: ${records.storageAssets.length} library assets, ${records.deliveries.length} deliveries, ${records.stories.length} stories, ${records.users.length} users, ${records.portfolios.length} portfolios, ${records.portfolioMedia.length} portfolio previews, ${records.projects.length} Content Studio projects, ${records.previewFiles.length} retired delivery preview records.`);
    if (unresolvedCloudinaryUrls) console.log(`Cloudinary URLs that could not be parsed (signatures withheld): ${unresolvedCloudinaryUrls}.`);
    if (!apply) {
      console.log('Dry run only. No database or storage changes were made. Review this count, then run npm run storage:migrate-cloudinary -- --apply.');
      return;
    }
    if (unresolvedCloudinaryUrls) throw new Error('Some Cloudinary media links could not be identified. No database references were changed; keep Cloudinary enabled and resolve these links before migration.');

    const queue = [...targets.entries()].map(([pair, target]) => ({ pair, target }));
    await withConcurrency(queue, 3, migrateTarget);
    console.log(`Copied and verified ${migrated.size} of ${targets.size} referenced media objects.`);
    if (failures.length) {
      for (const failure of failures) console.error(`Could not move ${failure.target.publicId}: ${failure.reason}`);
      throw new Error('Some files did not move. No database references were changed. Keep Cloudinary enabled and rerun after fixing the listed files.');
    }

    await saveManifest();
    const result = await updateRecords(records);
    console.log(`Updated ${result.updated} database records and removed ${result.retiredPreviews} retired preview-cache records.`);
    if (deleteCloudinarySource) {
      const removed = await deleteMigratedCloudinarySources();
      console.log(`Deleted ${removed} migrated Cloudinary originals and retired delivery previews after the R2 copies were verified and database references were changed.`);
    } else {
      console.log('Cloudinary originals were kept. The source list is saved in server/.runtime so you can check the site on R2, then rerun with --apply --delete-cloudinary-source.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error.message || 'The media migration did not finish.');
  process.exitCode = 1;
});
