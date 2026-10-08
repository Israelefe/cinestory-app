import crypto from 'node:crypto';
import Delivery from '../models/Delivery.js';
import DeliveryShareGrant from '../models/DeliveryShareGrant.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import { allPortfolioMedia, normalizeSnapshot, visiblePortfolioPhotoIds } from '../utils/portfolio.js';
import { sectionVisible } from '../shared/portfolioContent.mjs';
import { resolveEntitlements } from './entitlement.service.js';
import { deliverySoundtrack } from '../constants/deliverySoundtracks.js';

const validId = value => /^[a-f0-9]{24}$/i.test(String(value || ''));
export const mediaPinVersion = digest => crypto.createHash('sha256').update(String(digest || '')).digest('hex');

export function deliveryMediaAccess(delivery, grant, mode = 'view') {
  return { type: 'delivery', deliveryId: String(delivery._id), ...(grant ? { grantId: String(grant._id) } : {}), pinVersion: mediaPinVersion(delivery.access?.pinDigest), mode };
}

export async function authorizedMediaClaims(claims, files = []) {
  const access = claims.access;
  if (!access || !['file', 'image', 'archive'].includes(claims.action)) return false;
  if (access.type === 'portfolio') {
    if (!validId(access.portfolioId) || claims.action !== 'image') return false;
    const portfolio = await Portfolio.findOne({ _id: access.portfolioId, status: 'published' }).lean();
    if (!portfolio) return false;
    const user = await User.findById(portfolio.userId);
    if (!user || user.accountStatus !== 'active' || (await resolveEntitlements(user, { includeUsage: false })).features.portfolioMode !== 'public') return false;
    const snapshot = normalizeSnapshot(portfolio);
    const item = allPortfolioMedia(snapshot).find(item => item.publicId === claims.key);
    if (!item) return false;
    const profileVisible = snapshot.content.profile.logoId === item.id || snapshot.direction.showBio && sectionVisible(snapshot.content, 'about') && snapshot.content.profile.portraitId === item.id;
    if (!profileVisible && !visiblePortfolioPhotoIds(snapshot).has(item.id)) return false;
    return Boolean(await StorageAsset.exists({ userId: user._id, publicId: claims.key }) || await Delivery.exists({ userId: user._id, 'assets.publicId': claims.key }));
  }
  if (access.type === 'library') {
    if (!validId(access.collaborationId) || !validId(access.assetId)) return false;
    const collaboration = await LibraryCollaboration.findOne({ _id: access.collaborationId, status: { $ne: 'revoked' }, expiresAt: { $gt: new Date() } }).lean();
    if (!collaboration || !collaboration.assetIds.some(id => String(id) === access.assetId)) return false;
    const user = await User.findById(collaboration.userId);
    if (!user || (await resolveEntitlements(user, { includeUsage: false })).features.storageMode !== 'read-write') return false;
    const asset = await StorageAsset.findOne({ _id: access.assetId, userId: collaboration.userId }).lean();
    if (!asset) return false;
    if (access.mode === 'download') return collaboration.kind === 'editor-handoff' && claims.action === 'file' && claims.key === (asset.rawPublicId || asset.publicId);
    return access.mode === 'view' && claims.action === 'image' && claims.key === asset.publicId;
  }
  if (access.type !== 'delivery' || !validId(access.deliveryId) || !['view', 'download', 'archive', 'audio'].includes(access.mode)) return false;
  const delivery = await Delivery.findOne({ _id: access.deliveryId, status: 'published' }).select('+access.pinDigest').lean();
  if (!delivery || delivery.access?.revokedAt || delivery.access?.expiresAt && new Date(delivery.access.expiresAt) <= new Date() || mediaPinVersion(delivery.access?.pinDigest) !== access.pinVersion) return false;
  let grant;
  if (access.grantId) {
    if (!validId(access.grantId)) return false;
    grant = await DeliveryShareGrant.findOne({ _id: access.grantId, deliveryId: delivery._id, revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).lean();
    if (!grant) return false;
  }
  const assets = grant && (grant.assetIds?.length || grant.sectionIds?.length) ? delivery.assets.filter(asset => grant.assetIds.includes(asset.assetId)) : delivery.assets;
  const keys = new Set(assets.map(asset => asset.publicId));
  if (access.mode === 'archive') return claims.action === 'archive' && Boolean(grant ? grant.allowDownloadAll : delivery.access?.allowDownloadAll) && Array.isArray(files) && files.length > 0 && files.length <= 1000 && files.every(file => keys.has(file?.key));
  if (access.mode === 'download') return claims.action === 'file' && Boolean(grant ? grant.allowIndividualDownloads : delivery.access?.allowIndividualDownloads) && keys.has(claims.key);
  if (access.mode === 'view') return claims.action === 'image' && keys.has(claims.key);
  if (access.mode === 'audio') {
    const soundtrackKey = delivery.soundtrack?.source === 'curated' ? catalogueAudioKey(deliverySoundtrack(delivery.soundtrack.catalogId)) : delivery.soundtrack?.publicId;
    if (claims.key === soundtrackKey) return claims.action === 'file';
    if (assets.length !== delivery.assets.length) return false;
    const narrationKeys = [delivery.narration?.publicId, delivery.narration?.opening?.publicId, delivery.narration?.closing?.publicId].filter(Boolean);
    return claims.action === 'file' && narrationKeys.includes(claims.key);
  }
  return false;
}

export function catalogueAudioKey(track) {
  if (!track || !/^[a-f0-9]{64}$/i.test(track.sha256 || '')) throw Object.assign(new Error('Soundtrack not found.'), { status: 404 });
  return `veylo/catalog/music/${track.sha256}.mp3`;
}
