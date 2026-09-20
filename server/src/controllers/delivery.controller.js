import crypto from 'crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import PhotoLike from '../models/PhotoLike.js';
import DeliveryView from '../models/DeliveryView.js';
import DeliveryShareGrant from '../models/DeliveryShareGrant.js';
import Portfolio from '../models/Portfolio.js';
import User from '../models/User.js';
import StorageAsset from '../models/StorageAsset.js';
import { creativeDirectorAllowlist } from '../services/alibabaCreativeDirector.service.js';
import { confirmUploadedAsset, copyStorageImageToDelivery, createUploadSignature, deliveryFolder, removeDeliveryAudio, removeDeliveryImage, removeDeliveryMedia, signedArchiveUrl, signedImageUrl, signedOgImageUrl } from '../services/deliveryMedia.service.js';
import { reservePublishSlot, resolveEntitlements } from '../services/entitlement.service.js';
import { tokenDigest } from '../utils/auth.js';
import { sendStoryReadyEmail } from '../services/email.service.js';
import QRCode from 'qrcode';
import { DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';
import { DELIVERY_SOUNDTRACKS, deliverySoundtrack, deliverySoundtrackFile } from '../constants/deliverySoundtracks.js';
import { getNarrationVoiceCatalogue } from '../services/narration.service.js';

const createSchema = z.object({ clientName: z.string().trim().min(2).max(100), shootType: z.string().trim().min(2).max(80), brief: z.string().trim().min(20).max(2000) }).strict();
const confirmSchema = z.object({ publicId: z.string().min(5).max(500), version: z.union([z.string(), z.number()]), signature: z.string().min(20).max(200), resourceType: z.enum(['image']).default('image'), originalFilename: z.string().trim().max(180).default('photograph') }).strict();
const soundtrackSchema = z.object({ publicId: z.string().min(5).max(500), version: z.union([z.string(), z.number()]), signature: z.string().min(20).max(200), originalFilename: z.string().trim().max(180), title: z.string().trim().min(1).max(100), rightsConfirmed: z.literal(true) }).strict();
const formatSchema = z.object({ format: z.enum(creativeDirectorAllowlist.formats) }).strict();
const narrationSchema = z.object({
  voiceId: z.literal(DEFAULT_NARRATION_VOICE_ID).optional().default(DEFAULT_NARRATION_VOICE_ID)
}).strict();
const revisionSchema = z.object({ scope: z.enum(['selected', 'full']), instruction: z.string().trim().min(8).max(600), assetIds: z.array(z.string().min(1).max(100)).max(100).default([]) }).strict();
const libraryAssetsSchema = z.object({ assetIds: z.array(z.string().min(8).max(100)).min(1).max(20) }).strict();
const accessSchema = z.object({ pin: z.string().regex(/^\d{6}$/).optional().or(z.literal('')), expiresAt: z.string().datetime().optional().or(z.literal('')), allowIndividualDownloads: z.boolean().default(true), allowDownloadAll: z.boolean().default(true), allowLikes: z.boolean().default(true) }).strict();
const reviewSchema = z.object({
  title: z.string().trim().min(2).max(80),
  openingLine: z.string().trim().min(2).max(140),
  closingLine: z.string().trim().min(2).max(160),
  palette: z.object({ background: z.string().regex(/^#[0-9a-f]{6}$/i), surface: z.string().regex(/^#[0-9a-f]{6}$/i), text: z.string().regex(/^#[0-9a-f]{6}$/i), accent: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
  typography: z.object({ display: z.enum(['editorial-serif', 'clean-sans', 'condensed-sans', 'soft-serif']), body: z.enum(['clean-sans', 'editorial-serif']) }).strict(),
  pace: z.enum(['measured', 'warm', 'energetic']),
  variation: z.object({
    composition: z.enum(['quiet', 'split', 'layered', 'grid', 'portrait-led', 'wide-led']),
    density: z.enum(['spacious', 'balanced', 'layered']),
    imageTreatment: z.enum(['natural', 'warm', 'contrast', 'monochrome']),
    captionTreatment: z.enum(['quiet', 'editorial', 'bold']),
    accentPlacement: z.enum(['corners', 'rules', 'labels', 'type'])
  }).strict().default({ composition: 'quiet', density: 'balanced', imageTreatment: 'natural', captionTreatment: 'editorial', accentPlacement: 'rules' }),
  sections: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,32}$/), title: z.string().trim().min(1).max(60), subtitle: z.string().trim().max(120), layout: z.enum(['hero', 'single', 'pair', 'triptych', 'grid', 'strip', 'spread', 'cluster', 'chapter-cover']) }).strict()).min(1).max(12),
  frames: z.array(z.object({ assetId: z.string().min(1).max(100), headline: z.string().trim().max(70), caption: z.string().trim().min(8).max(180) }).strict()).min(1).max(500),
  assetOrder: z.array(z.string().min(1).max(100)).min(1).max(500)
}).strict();
const shareGrantSchema = z.object({
  role: z.enum(['organizer', 'vendor', 'guest']),
  label: z.string().trim().min(2).max(100),
  assetIds: z.array(z.string().min(1).max(100)).max(500).default([]),
  sectionIds: z.array(z.string().regex(/^[a-z0-9-]{1,32}$/)).max(12).default([]),
  allowIndividualDownloads: z.boolean().default(false),
  allowDownloadAll: z.boolean().default(false),
  usageTerms: z.string().trim().max(1000).default(''),
  expiresAt: z.string().datetime().optional().or(z.literal(''))
}).strict();

async function ownedDelivery(id, userId, selectPin = false) {
  const query = Delivery.findOne({ _id: id, userId });
  if (selectPin) query.select('+access.pinDigest');
  return query;
}

function failValidation(res, parsed) {
  return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Check the information you entered.' });
}

function ownerAsset(asset) {
  return { ...asset.toObject(), url: signedImageUrl(asset.publicId), thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }), srcSet: [480, 960, 1600].map(width => `${signedImageUrl(asset.publicId, { width })} ${width}w`).join(', ') };
}

function curatedPreviewUrl(trackId) {
  return `/api/v1/deliveries/soundtracks/${encodeURIComponent(trackId)}/audio`;
}

async function streamAudioFile(req, res, filePath) {
  const details = await stat(filePath);
  const range = String(req.get('range') || '');
  res.set({
    'Accept-Ranges': 'bytes',
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  });
  if (!range) {
    res.set('Content-Length', String(details.size));
    return createReadStream(filePath).pipe(res);
  }
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return res.status(416).set('Content-Range', `bytes */${details.size}`).end();
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), details.size - 1) : details.size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= details.size) {
    return res.status(416).set('Content-Range', `bytes */${details.size}`).end();
  }
  res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${details.size}`, 'Content-Length': String(end - start + 1) });
  return createReadStream(filePath, { start, end }).pipe(res);
}

export function listDeliverySoundtracks(req, res) {
  const previewToken = jwt.sign(
    { userId: String(req.user.id), scope: 'soundtrack-preview' },
    process.env.JWT_SECRET,
    { expiresIn: '2h', issuer: 'veylo-api', audience: 'veylo-catalog-media' }
  );
  const data = DELIVERY_SOUNDTRACKS.map(({ filename, sha256, bytes, ...track }) => ({
    ...track,
    previewUrl: `${curatedPreviewUrl(track.id)}?token=${encodeURIComponent(previewToken)}`
  }));
  res.set('Cache-Control', 'private, max-age=300');
  res.json({ success: true, data });
}

export async function listNarrationVoices(req, res) {
  try {
    const data = await getNarrationVoiceCatalogue();
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ success: true, data });
  } catch {
    res.status(503).json({ success: false, message: 'Narrator previews are temporarily unavailable.' });
  }
}

export async function streamDeliverySoundtrack(req, res) {
  try {
    try {
      const payload = jwt.verify(String(req.query.token || ''), process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-catalog-media' });
      if (payload.scope !== 'soundtrack-preview' || !payload.userId) throw new Error('Invalid preview token.');
    } catch {
      return res.status(403).json({ success: false, message: 'This soundtrack preview has expired.' });
    }
    const filePath = deliverySoundtrackFile(req.params.trackId);
    if (!filePath) return res.status(404).json({ success: false, message: 'Soundtrack not found.' });
    return await streamAudioFile(req, res, filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ success: false, message: 'Soundtrack file not found.' });
    console.error('[deliveries/soundtrack-stream]', error.message);
    return res.status(500).json({ success: false, message: 'We could not play that soundtrack.' });
  }
}

export async function createDelivery(req, res) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const openDrafts = await Delivery.countDocuments({ userId: req.user.id, status: { $in: ['draft', 'analyzing', 'directing', 'review'] } });
    if (openDrafts >= 20) return res.status(409).json({ success: false, code: 'DRAFT_LIMIT_REACHED', message: 'Finish or remove an existing draft before starting another one.' });
    const delivery = await Delivery.create({ userId: req.user.id, ...parsed.data });
    res.status(201).json({ success: true, data: delivery });
  } catch (error) {
    console.error('[deliveries/create]', error.message);
    res.status(500).json({ success: false, message: 'We could not start this delivery.' });
  }
}

export async function updateDeliveryDetails(req, res) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This draft is not available for editing.' });
    delivery.clientName = parsed.data.clientName;
    delivery.shootType = parsed.data.shootType;
    delivery.brief = parsed.data.brief;
    delivery.collectionAnalysis = undefined;
    delivery.formatRecommendations = [];
    delivery.creativeDirection = undefined;
    delivery.reviewApprovedAt = undefined;
    delivery.status = 'draft';
    await delivery.save();
    const data = delivery.toObject();
    data.assets = delivery.assets.map(ownerAsset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[deliveries/details]', error.message);
    res.status(500).json({ success: false, message: 'We could not update those shoot details.' });
  }
}

export async function listDeliveries(req, res) {
  try {
    const includeArchived = req.query.scope === 'archived';
    const deliveries = await Delivery.find({ userId: req.user.id, status: includeArchived ? 'archived' : { $ne: 'archived' } }).sort({ updatedAt: -1 }).lean();
    const data = deliveries.map(delivery => ({ ...delivery, assets: delivery.assets?.slice(0, 1).map(asset => ({ ...asset, thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }) })) }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[deliveries/list]', error.message);
    res.status(500).json({ success: false, message: 'We could not open your deliveries.' });
  }
}

export async function archiveDelivery(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    if (delivery.status === 'archived') return res.json({ success: true, data: delivery });
    if (['analyzing', 'directing'].includes(delivery.status)) return res.status(409).json({ success: false, message: 'Wait for the current delivery task to finish before archiving it.' });
    delivery.archivedFromStatus = delivery.status;
    delivery.status = 'archived';
    delivery.archivedAt = new Date();
    await delivery.save();
    res.json({ success: true, data: delivery, message: 'Delivery archived. Its client link is now closed.' });
  } catch (error) {
    console.error('[deliveries/archive]', error.message);
    res.status(500).json({ success: false, message: 'We could not archive this delivery.' });
  }
}

export async function restoreDelivery(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || delivery.status !== 'archived') return res.status(404).json({ success: false, message: 'Archived delivery not found.' });
    const restoreStatus = ['draft', 'review', 'published'].includes(delivery.archivedFromStatus) ? delivery.archivedFromStatus : 'draft';
    delivery.status = restoreStatus;
    delivery.archivedAt = undefined;
    delivery.archivedFromStatus = undefined;
    await delivery.save();
    res.json({ success: true, data: delivery, message: restoreStatus === 'published' ? 'Delivery restored. Its client link works again.' : 'Delivery restored to your drafts.' });
  } catch (error) {
    console.error('[deliveries/restore]', error.message);
    res.status(500).json({ success: false, message: 'We could not restore this delivery.' });
  }
}

export async function listShareGrants(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    const grants = await DeliveryShareGrant.find({ deliveryId: delivery._id, userId: req.user.id, revokedAt: null }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: grants });
  } catch {
    res.status(500).json({ success: false, message: 'We could not open the sharing links.' });
  }
}

export async function createShareGrant(req, res) {
  try {
    const parsed = shareGrantSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || delivery.status !== 'published' || !['event-coverage', 'campaign'].includes(delivery.format)) return res.status(404).json({ success: false, message: 'Publish an Event Coverage or Campaign delivery before creating role links.' });
    const allowedAssets = new Set(delivery.assets.map(asset => asset.assetId));
    if (parsed.data.assetIds.some(assetId => !allowedAssets.has(assetId))) return res.status(400).json({ success: false, message: 'One or more selected photographs are not in this delivery.' });
    const sections = delivery.creativeDirection?.sections || [];
    const knownSections = new Map(sections.map(section => [section.id, section]));
    if (parsed.data.sectionIds.some(sectionId => !knownSections.has(sectionId))) return res.status(400).json({ success: false, message: 'One or more selected scenes are not in this delivery.' });
    const scopedAssetIds = [...new Set([...parsed.data.assetIds, ...parsed.data.sectionIds.flatMap(sectionId => knownSections.get(sectionId)?.assetIds || [])])];
    const token = crypto.randomBytes(32).toString('base64url');
    const grant = await DeliveryShareGrant.create({ deliveryId: delivery._id, userId: req.user.id, ...parsed.data, assetIds: scopedAssetIds, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined, tokenDigest: tokenDigest(token) });
    const url = `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${delivery.publicId}?share=${encodeURIComponent(token)}`;
    res.status(201).json({ success: true, data: { ...grant.toObject(), url } });
  } catch (error) {
    console.error('[deliveries/share-grant]', error.message);
    res.status(500).json({ success: false, message: 'We could not create that sharing link.' });
  }
}

export async function revokeShareGrant(req, res) {
  try {
    const grant = await DeliveryShareGrant.findOneAndUpdate({ _id: req.params.grantId, deliveryId: req.params.id, userId: req.user.id, revokedAt: null }, { revokedAt: new Date() }, { new: true });
    if (!grant) return res.status(404).json({ success: false, message: 'Sharing link not found.' });
    res.json({ success: true, message: 'Sharing link closed.' });
  } catch {
    res.status(500).json({ success: false, message: 'We could not close that sharing link.' });
  }
}

export async function getDelivery(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    const data = delivery.toObject();
    data.assets = delivery.assets.map(ownerAsset);
    if (data.soundtrack?.catalogId && data.soundtrack?.source === 'curated') {
      data.soundtrack.url = curatedPreviewUrl(data.soundtrack.catalogId);
    }
    if (data.soundtrack?.publicId && !data.soundtrack.url) {
      data.soundtrack.url = signedImageUrl(data.soundtrack.publicId, { resourceType: 'video' });
    }
    if (data.narration?.publicId && !data.narration.url) {
      data.narration.url = signedImageUrl(data.narration.publicId, { resourceType: 'video' });
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error('[deliveries/get]', error.message);
    res.status(500).json({ success: false, message: 'We could not open this delivery.' });
  }
}

export async function deleteDelivery(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    const removedIds = new Set(delivery.assets.map(asset => asset.publicId));
    const portfolio = await Portfolio.findOne({ userId: req.user.id, 'items.publicId': { $in: [...removedIds] } });
    if (portfolio) {
      portfolio.items = portfolio.items.filter(item => !removedIds.has(item.publicId));
      if (portfolio.status === 'published' && portfolio.items.length < 4) { portfolio.status = 'draft'; portfolio.publishedAt = undefined; }
      await portfolio.save();
    }
    await removeDeliveryMedia(req.user.id, delivery._id);
    await Promise.all([DeliveryJob.deleteMany({ deliveryId: delivery._id }), DeliveryShareGrant.deleteMany({ deliveryId: delivery._id }), PhotoLike.deleteMany({ deliveryId: delivery._id }), DeliveryView.deleteMany({ deliveryId: delivery._id }), Delivery.deleteOne({ _id: delivery._id, userId: req.user.id })]);
    res.json({ success: true, message: 'Delivery deleted and its client link disabled.' });
  } catch (error) {
    console.error('[deliveries/delete]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not delete this delivery.' });
  }
}

export async function signDeliveryUpload(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This delivery is not available for uploads.' });
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (delivery.assets.length >= entitlements.limits.photosPerDelivery) return res.status(403).json({ success: false, code: 'PHOTO_LIMIT_REACHED', message: `${entitlements.planName} allows up to ${entitlements.limits.photosPerDelivery} photographs in one delivery.` });
    res.json({ success: true, data: createUploadSignature({ userId: req.user.id, deliveryId: delivery._id, resourceType: 'image' }) });
  } catch (error) {
    console.error('[deliveries/upload-signature]', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare this upload.' });
  }
}

export async function confirmDeliveryUpload(req, res) {
  let uploadedPublicId = '';
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This delivery is not available for uploads.' });
    if (delivery.assets.some(asset => asset.publicId === parsed.data.publicId)) return res.status(409).json({ success: false, message: 'That photograph is already in this delivery.' });
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    const resource = await confirmUploadedAsset({ userId: req.user.id, deliveryId: delivery._id, ...parsed.data });
    uploadedPublicId = resource.public_id;
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(String(resource.format).toLowerCase()) || resource.bytes > 50 * 1024 * 1024) {
      const error = new Error('Use a JPEG, PNG, or WebP photograph no larger than 50 MB.');
      error.status = 400;
      throw error;
    }
    const asset = { assetId: crypto.randomUUID(), publicId: resource.public_id, resourceType: 'image', format: resource.format, width: resource.width, height: resource.height, bytes: resource.bytes, originalFilename: parsed.data.originalFilename, sortOrder: delivery.assets.length };
    const updated = await Delivery.findOneAndUpdate({
      _id: delivery._id,
      userId: req.user.id,
      status: { $in: ['draft', 'review'] },
      'assets.publicId': { $ne: resource.public_id },
      $expr: { $lt: [{ $size: '$assets' }, entitlements.limits.photosPerDelivery] }
    }, {
      $push: { assets: asset },
      $set: { status: 'draft', formatRecommendations: [] },
      $unset: { collectionAnalysis: 1, creativeDirection: 1, reviewApprovedAt: 1 }
    }, { new: true, runValidators: true });
    if (!updated) {
      const error = new Error(`That photograph could not be added. ${entitlements.planName} allows up to ${entitlements.limits.photosPerDelivery} photographs in one delivery.`);
      error.status = 409;
      throw error;
    }
    const saved = updated.assets.find(item => item.assetId === asset.assetId);
    uploadedPublicId = '';
    res.status(201).json({ success: true, data: ownerAsset(saved), limits: entitlements.limits });
  } catch (error) {
    if (uploadedPublicId) await removeDeliveryImage(uploadedPublicId).catch(() => {});
    console.error('[deliveries/upload-confirm]', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not verify this photograph.' });
  }
}

export async function addLibraryAssets(req, res) {
  const copied = [];
  try {
    const parsed = libraryAssetsSchema.safeParse(req.body);
    if (!parsed.success || new Set(parsed.data.assetIds).size !== parsed.data.assetIds.length) return res.status(400).json({ success: false, message: 'Choose between one and twenty different library photographs.' });
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This delivery is not available for photographs.' });
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.storageMode !== 'read-write') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Renew Pro to reuse photographs from your personal library.' });
    if (delivery.assets.length + parsed.data.assetIds.length > entitlements.limits.photosPerDelivery) return res.status(403).json({ success: false, code: 'PHOTO_LIMIT_REACHED', message: `${entitlements.planName} allows up to ${entitlements.limits.photosPerDelivery} photographs in one delivery.` });
    const stored = await StorageAsset.find({ _id: { $in: parsed.data.assetIds }, userId: user._id });
    const byId = new Map(stored.map(asset => [String(asset._id), asset]));
    if (stored.length !== parsed.data.assetIds.length) return res.status(403).json({ success: false, message: 'One of those library photographs does not belong to your account.' });
    const newAssets = [];
    for (const id of parsed.data.assetIds) {
      const source = byId.get(id);
      const resource = await copyStorageImageToDelivery({ sourceUrl: signedImageUrl(source.publicId, { width: 8000 }), userId: user._id, deliveryId: delivery._id });
      copied.push(resource.public_id);
      newAssets.push({ assetId: crypto.randomUUID(), publicId: resource.public_id, resourceType: 'image', format: resource.format, width: resource.width, height: resource.height, bytes: resource.bytes, originalFilename: source.originalFilename, sortOrder: delivery.assets.length + newAssets.length });
    }
    const updated = await Delivery.findOneAndUpdate({
      _id: delivery._id,
      userId: user._id,
      status: { $in: ['draft', 'review'] },
      $expr: { $lte: [{ $add: [{ $size: '$assets' }, newAssets.length] }, entitlements.limits.photosPerDelivery] }
    }, {
      $push: { assets: { $each: newAssets } },
      $set: { status: 'draft', formatRecommendations: [] },
      $unset: { collectionAnalysis: 1, creativeDirection: 1, reviewApprovedAt: 1 }
    }, { new: true, runValidators: true });
    if (!updated) {
      const error = new Error(`Those photographs could not be added. ${entitlements.planName} allows up to ${entitlements.limits.photosPerDelivery} photographs in one delivery.`);
      error.status = 409;
      throw error;
    }
    const addedIds = new Set(newAssets.map(item => item.assetId));
    const data = updated.assets.filter(item => addedIds.has(item.assetId)).map(ownerAsset);
    res.status(201).json({ success: true, data });
  } catch (error) {
    await Promise.all(copied.map(publicId => removeDeliveryImage(publicId).catch(() => {})));
    console.error('[deliveries/library]', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not add those library photographs.' });
  }
}

export async function deleteDeliveryAsset(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This draft is not available for editing.' });
    const asset = delivery.assets.find(item => item.assetId === req.params.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    await removeDeliveryImage(asset.publicId);
    delivery.assets = delivery.assets.filter(item => item.assetId !== asset.assetId).map((item, sortOrder) => ({ ...item.toObject(), sortOrder }));
    delivery.collectionAnalysis = undefined;
    delivery.formatRecommendations = [];
    delivery.creativeDirection = undefined;
    delivery.reviewApprovedAt = undefined;
    delivery.status = 'draft';
    await delivery.save();
    res.json({ success: true, message: 'Photograph removed.', data: delivery });
  } catch (error) {
    console.error('[deliveries/photo-delete]', error.message);
    res.status(error.status || 500).json({ success: false, message: 'We could not remove that photograph.' });
  }
}

export async function signSoundtrackUpload(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This delivery is not available for audio uploads.' });
    res.json({ success: true, data: createUploadSignature({ userId: req.user.id, deliveryId: delivery._id, resourceType: 'video' }) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.message || 'We could not prepare this audio upload.' }); }
}

export async function confirmSoundtrackUpload(req, res) {
  let uploadedPublicId = '';
  try {
    const parsed = soundtrackSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This delivery is not available for audio uploads.' });
    const resource = await confirmUploadedAsset({ userId: req.user.id, deliveryId: delivery._id, publicId: parsed.data.publicId, version: parsed.data.version, signature: parsed.data.signature, resourceType: 'video' });
    uploadedPublicId = resource.public_id;
    if (!['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(String(resource.format).toLowerCase()) || resource.bytes > 20 * 1024 * 1024 || Number(resource.duration || 0) > 20 * 60) throw Object.assign(new Error('Use an MP3, WAV, M4A, OGG, or AAC track no larger than 20 MB and no longer than 20 minutes.'), { status: 400 });
    if (delivery.soundtrack?.publicId && delivery.soundtrack.publicId !== resource.public_id) await removeDeliveryAudio(delivery.soundtrack.publicId).catch(() => {});
    delivery.soundtrack = { publicId: resource.public_id, title: parsed.data.title, originalFilename: parsed.data.originalFilename, format: resource.format, bytes: resource.bytes, duration: resource.duration, source: 'photographer', rightsConfirmedAt: new Date() };
    delivery.markModified('soundtrack');
    await delivery.save();
    res.status(201).json({ success: true, data: { ...delivery.soundtrack, url: signedImageUrl(resource.public_id, { resourceType: 'video' }) } });
  } catch (error) {
    if (uploadedPublicId) await removeDeliveryAudio(uploadedPublicId).catch(() => {});
    res.status(error.status || 500).json({ success: false, message: error.message || 'We could not save that soundtrack.' });
  }
}

export async function deleteSoundtrack(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    if (delivery.soundtrack?.publicId) await removeDeliveryAudio(delivery.soundtrack.publicId);
    delivery.soundtrack = undefined;
    delivery.markModified('soundtrack');
    await delivery.save();
    res.json({ success: true, message: 'Soundtrack removed.' });
  } catch { res.status(500).json({ success: false, message: 'We could not remove that soundtrack.' }); }
}

export async function selectCuratedSoundtrack(req, res) {
  try {
    const parsed = z.object({ trackId: z.string().trim().min(3).max(80) }).strict().safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const track = deliverySoundtrack(parsed.data.trackId);
    if (!track) return res.status(404).json({ success: false, message: 'That soundtrack is not in Veylo’s approved library.' });
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || !['draft', 'review'].includes(delivery.status)) return res.status(404).json({ success: false, message: 'This delivery is not available for audio selection.' });
    if (delivery.soundtrack?.publicId) await removeDeliveryAudio(delivery.soundtrack.publicId).catch(() => {});
    delivery.soundtrack = {
      catalogId: track.id,
      title: track.title,
      creator: track.creator,
      genre: track.genre,
      mood: track.mood,
      tempo: track.tempo,
      energy: track.energy,
      narrationFit: track.narrationFit,
      tags: track.tags,
      storyFunction: track.storyFunction,
      bestFor: track.bestFor,
      avoidFor: track.avoidFor,
      editingPace: track.editingPace,
      instrumentationCue: track.instrumentationCue,
      contentIdGuidance: track.contentIdGuidance,
      duration: track.durationSec,
      source: 'curated',
      sourceProvider: 'Pixabay',
      sourcePageUrl: track.sourcePageUrl,
      contentIdRegistered: track.contentIdRegistered,
      license: track.license,
      licenseUrl: track.licenseUrl,
      rightsConfirmedAt: new Date()
    };
    delivery.markModified('soundtrack');
    await delivery.save();
    res.status(200).json({ success: true, data: { ...delivery.soundtrack, url: curatedPreviewUrl(track.id) } });
  } catch (error) {
    console.error('[deliveries/soundtrack-select]', error.message);
    res.status(500).json({ success: false, message: 'We could not attach that soundtrack.' });
  }
}

export async function queueAnalysis(req, res) {
  try {
    if (process.env.DELIVERY_PIPELINE_ENABLED !== 'true') return res.status(503).json({ success: false, message: 'The AI Creative Director is not available yet.' });
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    if (!delivery.assets.length) return res.status(400).json({ success: false, message: 'Upload at least one finished photograph first.' });
    const running = await DeliveryJob.findOne({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] } });
    if (running) return res.json({ success: true, data: running });
    const job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'analyze', stage: 'queued' });
    delivery.status = 'analyzing';
    await delivery.save();
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    console.error('[deliveries/analyze]', error.message);
    res.status(500).json({ success: false, message: 'We could not start the shoot analysis.' });
  }
}

export async function queueDirection(req, res) {
  try {
    if (process.env.DELIVERY_PIPELINE_ENABLED !== 'true') return res.status(503).json({ success: false, message: 'The AI Creative Director is not available yet.' });
    const parsed = formatSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery?.formatRecommendations?.length) return res.status(409).json({ success: false, message: 'Let Veylo read the complete shoot before choosing a format.' });
    const running = await DeliveryJob.findOne({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] } });
    if (running) return res.status(409).json({ success: false, message: 'Veylo is already working on this delivery.' });
    const job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'direct', stage: 'queued', input: parsed.data });
    delivery.status = 'directing';
    delivery.format = parsed.data.format;
    await delivery.save();
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    console.error('[deliveries/direct]', error.message);
    res.status(500).json({ success: false, message: 'We could not start the creative direction.' });
  }
}

export async function queueNarration(req, res) {
  try {
    if (process.env.DELIVERY_PIPELINE_ENABLED !== 'true') return res.status(503).json({ success: false, message: 'Narration is not available yet.' });
    const parsed = narrationSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery?.creativeDirection) return res.status(409).json({ success: false, message: 'Narration is available after the delivery has been directed.' });
    const running = await DeliveryJob.findOne({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] } });
    if (running) return res.status(409).json({ success: false, message: 'Veylo is already working on this delivery.' });
    const job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'narrate', stage: 'queued', input: parsed.data });
    res.status(202).json({ success: true, data: job });
  } catch (error) {
    console.error('[deliveries/narrate]', error.message);
    res.status(500).json({ success: false, message: 'We could not start the narration.' });
  }
}

export async function queueRevision(req, res) {
  try {
    if (process.env.DELIVERY_PIPELINE_ENABLED !== 'true') return res.status(503).json({ success: false, message: 'The AI Creative Director is not available yet.' });
    const parsed = revisionSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery?.creativeDirection || delivery.status !== 'review') return res.status(409).json({ success: false, message: 'This delivery is not ready for revisions.' });
    const known = new Set(delivery.assets.map(asset => asset.assetId));
    if (parsed.data.scope === 'selected' && (!parsed.data.assetIds.length || parsed.data.assetIds.some(id => !known.has(id)))) return res.status(400).json({ success: false, message: 'Choose at least one photograph from this delivery.' });
    const running = await DeliveryJob.findOne({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] } });
    if (running) return res.status(409).json({ success: false, message: 'Veylo is already working on this delivery.' });
    const job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'revise', stage: 'queued', input: { ...parsed.data, format: delivery.format } });
    delivery.status = 'directing'; delivery.reviewApprovedAt = undefined; await delivery.save();
    res.status(202).json({ success: true, data: job });
  } catch (error) { console.error('[deliveries/revise]', error.message); res.status(500).json({ success: false, message: 'We could not start that revision.' }); }
}

export async function getDeliveryJob(req, res) {
  try {
    const job = await DeliveryJob.findOne({ _id: req.params.jobId, userId: req.user.id });
    if (!job) return res.status(404).json({ success: false, message: 'Generation job not found.' });
    res.json({ success: true, data: job });
  } catch { res.status(404).json({ success: false, message: 'Generation job not found.' }); }
}

export async function updateDeliveryReview(req, res) {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || delivery.status !== 'review' || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'This delivery is not ready for edits.' });
    const known = new Set(delivery.assets.map(asset => asset.assetId));
    if (parsed.data.assetOrder.length !== known.size || new Set(parsed.data.assetOrder).size !== known.size || parsed.data.assetOrder.some(id => !known.has(id))) return res.status(400).json({ success: false, message: 'The photograph order is incomplete.' });
    const frameEdits = new Map(parsed.data.frames.map(frame => [frame.assetId, frame]));
    if (frameEdits.size !== known.size || [...known].some(id => !frameEdits.has(id))) return res.status(400).json({ success: false, message: 'Every photograph must remain in the delivery.' });
    delivery.title = parsed.data.title;
    delivery.creativeDirection.title = parsed.data.title;
    delivery.creativeDirection.openingLine = parsed.data.openingLine;
    delivery.creativeDirection.closingLine = parsed.data.closingLine;
    delivery.creativeDirection.palette = parsed.data.palette;
    delivery.creativeDirection.typography = parsed.data.typography;
    delivery.creativeDirection.pace = parsed.data.pace;
    delivery.creativeDirection.sections = parsed.data.sections.map(section => ({ ...section, assetIds: delivery.creativeDirection.sections.find(current => current.id === section.id)?.assetIds || [] }));
    delivery.creativeDirection.frames = delivery.creativeDirection.frames.map(frame => ({ ...frame, headline: frameEdits.get(frame.assetId).headline, caption: frameEdits.get(frame.assetId).caption }));
    const positions = new Map(parsed.data.assetOrder.map((id, index) => [id, index]));
    delivery.assets.forEach(asset => { asset.sortOrder = positions.get(asset.assetId); });
    delivery.markModified('creativeDirection');
    delivery.reviewApprovedAt = new Date();
    delivery.markModified('assets');
    await delivery.save();
    const data = delivery.toObject();
    data.assets = delivery.assets.sort((a, b) => a.sortOrder - b.sortOrder).map(ownerAsset);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[deliveries/review]', error.message);
    res.status(500).json({ success: false, message: 'We could not save those delivery edits.' });
  }
}

export async function retryDeliveryJob(req, res) {
  try {
    const job = await DeliveryJob.findOne({ _id: req.params.jobId, userId: req.user.id }).select('+input');
    if (!job || job.status !== 'failed') return res.status(409).json({ success: false, message: 'This job is not waiting to be retried.' });
    job.status = 'queued'; job.stage = 'queued'; job.errorCode = undefined; job.errorMessage = undefined; job.completedAt = undefined;
    if (job.attempts >= 3) { job.attempts = 0; job.cursor = 0; job.result = undefined; }
    await job.save();
    res.status(202).json({ success: true, data: job });
  } catch { res.status(404).json({ success: false, message: 'Generation job not found.' }); }
}

export async function publishDelivery(req, res) {
  let reservation;
  try {
    const parsed = accessSchema.safeParse(req.body);
    if (!parsed.success) return failValidation(res, parsed);
    const delivery = await ownedDelivery(req.params.id, req.user.id, true);
    if (!delivery || delivery.status !== 'review' || !delivery.creativeDirection || !delivery.reviewApprovedAt) return res.status(409).json({ success: false, message: 'Review and approve the complete delivery before publishing it.' });
    const user = await User.findById(req.user.id);
    reservation = await reservePublishSlot(user, delivery.assets.length);
    delivery.access.allowIndividualDownloads = parsed.data.allowIndividualDownloads;
    delivery.access.allowDownloadAll = parsed.data.allowDownloadAll;
    delivery.access.allowLikes = parsed.data.allowLikes;
    delivery.access.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined;
    delivery.access.pinDigest = parsed.data.pin ? await bcrypt.hash(parsed.data.pin, 12) : undefined;
    delivery.status = 'published';
    delivery.publishedAt = new Date();
    await delivery.save();
    res.json({ success: true, data: { publicId: delivery.publicId, url: `${String(process.env.CLIENT_URL).replace(/\/$/, '')}/d/${delivery.publicId}`, entitlements: reservation.entitlements } });
  } catch (error) {
    await reservation?.release().catch(() => {});
    console.error('[deliveries/publish]', error.message);
    res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || 'We could not publish this delivery.' });
  }
}

function accessTokenValid(token, deliveryId) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-delivery' });
    return payload.deliveryId === String(deliveryId);
  } catch { return false; }
}

async function publicDelivery(id) {
  return Delivery.findOne({ publicId: id, status: 'published' }).select('+access.pinDigest').populate('userId', 'name plan planOverride studio avatar');
}

function expired(delivery) { return delivery.access?.expiresAt && delivery.access.expiresAt <= new Date(); }

export async function unlockDelivery(req, res) {
  try {
    const parsed = z.object({ pin: z.string().regex(/^\d{6}$/) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Enter the six-digit PIN.' });
    const delivery = await publicDelivery(req.params.publicId);
    if (!delivery || expired(delivery)) return res.status(404).json({ success: false, message: 'This delivery is no longer available.' });
    if (!delivery.access?.pinDigest || !(await bcrypt.compare(parsed.data.pin, delivery.access.pinDigest))) return res.status(403).json({ success: false, message: 'That PIN is not correct.' });
    const token = jwt.sign({ deliveryId: String(delivery._id) }, process.env.JWT_SECRET, { expiresIn: '12h', issuer: 'veylo-api', audience: 'veylo-delivery' });
    res.json({ success: true, data: { accessToken: token } });
  } catch (error) {
    console.error('[deliveries/unlock]', error.message);
    res.status(500).json({ success: false, message: 'We could not open this delivery.' });
  }
}

function hasPublicAccess(req, delivery) {
  if (!delivery.access?.pinDigest) return true;
  return accessTokenValid(req.get('x-delivery-access'), delivery._id);
}

async function shareGrant(req, delivery) {
  const token = String(req.get('x-delivery-grant') || '');
  if (!token) return null;
  return DeliveryShareGrant.findOne({ deliveryId: delivery._id, tokenDigest: tokenDigest(token), revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
}

function grantAssets(delivery, grant) {
  if (!grant?.assetIds?.length) return delivery.assets;
  const allowed = new Set(grant.assetIds);
  return delivery.assets.filter(asset => allowed.has(asset.assetId));
}

async function publicPayload(delivery, grant = null) {
  const owner = delivery.userId;
  const entitlements = await resolveEntitlements(owner, { includeUsage: false });
  const studioBrand = entitlements.features.branding === 'studio';
  const object = delivery.toObject();
  delete object.userId;
  delete object.access?.pinDigest;
  object.assets = grantAssets(delivery, grant).map(ownerAsset);
  if (grant) {
    const visibleAssets = new Set(object.assets.map(asset => asset.assetId));
    if (object.creativeDirection?.sections) object.creativeDirection.sections = object.creativeDirection.sections.map(section => ({ ...section, assetIds: (section.assetIds || []).filter(assetId => visibleAssets.has(assetId)) })).filter(section => section.assetIds.length);
    object.access.allowIndividualDownloads = Boolean(grant.allowIndividualDownloads);
    object.access.allowDownloadAll = Boolean(grant.allowDownloadAll);
    object.access.allowLikes = false;
    object.viewer = { role: grant.role, label: grant.label, usageTerms: grant.usageTerms || '' };
  }
  if (object.narration?.publicId) object.narration.url = signedImageUrl(object.narration.publicId, { resourceType: 'video' });
  if (object.soundtrack?.publicId) object.soundtrack.url = signedImageUrl(object.soundtrack.publicId, { resourceType: 'video' });
  if (object.soundtrack?.catalogId && object.soundtrack?.source === 'curated') {
    const mediaToken = jwt.sign(
      { deliveryId: String(delivery._id), catalogId: object.soundtrack.catalogId, scope: 'soundtrack' },
      process.env.JWT_SECRET,
      { expiresIn: '12h', issuer: 'veylo-api', audience: 'veylo-delivery-media' }
    );
    object.soundtrack.url = `/api/v1/deliveries/public/${encodeURIComponent(delivery.publicId)}/soundtrack?token=${encodeURIComponent(mediaToken)}`;
  }
  object.branding = studioBrand ? { type: 'studio', name: owner.studio?.name || owner.name, logoUrl: owner.studio?.logoUrl || owner.avatar || '' } : { type: 'veylo', name: 'Veylo', logoUrl: '/veylo/veylo-mark.svg' };
  return object;
}

export async function getPublicSoundtrack(req, res) {
  try {
    const delivery = await publicDelivery(req.params.publicId);
    if (!delivery || expired(delivery) || delivery.soundtrack?.source !== 'curated' || !delivery.soundtrack?.catalogId) {
      return res.status(404).json({ success: false, message: 'Soundtrack not found.' });
    }
    let payload;
    try {
      payload = jwt.verify(String(req.query.token || ''), process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-delivery-media' });
    } catch {
      return res.status(403).json({ success: false, message: 'This soundtrack link has expired.' });
    }
    if (payload.scope !== 'soundtrack' || payload.deliveryId !== String(delivery._id) || payload.catalogId !== delivery.soundtrack.catalogId) {
      return res.status(403).json({ success: false, message: 'This soundtrack link is not valid.' });
    }
    const filePath = deliverySoundtrackFile(delivery.soundtrack.catalogId);
    if (!filePath) return res.status(404).json({ success: false, message: 'Soundtrack not found.' });
    return await streamAudioFile(req, res, filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ success: false, message: 'Soundtrack file not found.' });
    console.error('[deliveries/public-soundtrack]', error.message);
    return res.status(500).json({ success: false, message: 'We could not play that soundtrack.' });
  }
}

export async function getPublicDelivery(req, res) {
  try {
    const delivery = await publicDelivery(req.params.publicId);
    if (!delivery || expired(delivery)) return res.status(404).json({ success: false, message: 'This delivery is no longer available.' });
    const grant = await shareGrant(req, delivery);
    if (!grant && !hasPublicAccess(req, delivery)) {
      const owner = delivery.userId;
      const entitlements = await resolveEntitlements(owner, { includeUsage: false });
      const branding = entitlements.features.branding === 'studio' ? { type: 'studio', name: owner.studio?.name || owner.name, logoUrl: owner.studio?.logoUrl || owner.avatar || '' } : { type: 'veylo', name: 'Veylo', logoUrl: '/veylo/veylo-mark.svg' };
      return res.json({ success: true, data: { locked: true, publicId: delivery.publicId, branding } });
    }
    try {
      await DeliveryView.create({ deliveryId: delivery._id, visitorDigest: tokenDigest(visitorId(req, res)) });
      await Delivery.updateOne({ _id: delivery._id }, { $inc: { viewsCount: 1 } });
    } catch (error) { if (error.code !== 11000) throw error; }
    res.json({ success: true, data: await publicPayload(delivery, grant) });
  } catch (error) {
    console.error('[deliveries/public]', error.message);
    res.status(500).json({ success: false, message: 'We could not open this delivery.' });
  }
}

export async function getDeliveryShareMeta(req, res) {
  try {
    const delivery = await publicDelivery(req.params.publicId);
    if (!delivery || expired(delivery)) return res.status(404).json({ success: false, message: 'This delivery is no longer available.' });
    const entitlements = await resolveEntitlements(delivery.userId, { includeUsage: false });
    const studioBrand = entitlements.features.branding === 'studio';
    const brandName = studioBrand ? delivery.userId.studio?.name || delivery.userId.name : 'Veylo';
    const locked = Boolean(delivery.access?.pinDigest);
    const app = String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '');
    const logo = studioBrand ? delivery.userId.studio?.logoUrl || delivery.userId.avatar : `${app}/veylo/veylo-logo.jpg`;
    res.set('Cache-Control', 'public, max-age=120, s-maxage=300');
    res.json({ success: true, data: locked ? {
      title: `A private photo delivery from ${brandName}`,
      description: 'Open the private link and enter the six-digit PIN from your photographer.',
      image: logo || `${app}/veylo/veylo-logo.jpg`, brandName, locked: true
    } : {
      title: `${delivery.title || `${delivery.clientName}'s photographs`} — ${brandName}`,
      description: `${delivery.clientName}, your finished photographs are ready to experience and download.`,
      image: delivery.assets[0]?.publicId ? signedOgImageUrl(delivery.assets[0].publicId) : logo,
      brandName, locked: false
    } });
  } catch { res.status(500).json({ success: false, message: 'We could not prepare that link preview.' }); }
}

function visitorId(req, res) {
  let id = req.cookies?.veylo_client;
  if (!id || !/^[A-Za-z0-9_-]{30,100}$/.test(id)) {
    id = crypto.randomBytes(32).toString('base64url');
    res.cookie('veylo_client', id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000, path: '/api/v1/deliveries/public' });
  }
  return id;
}

export async function togglePhotoLike(req, res) {
  try {
    const delivery = await publicDelivery(req.params.publicId);
    const grant = delivery ? await shareGrant(req, delivery) : null;
    if (!delivery || expired(delivery) || (!grant && !hasPublicAccess(req, delivery))) return res.status(404).json({ success: false, message: 'This delivery is not available.' });
    if (grant) return res.status(403).json({ success: false, message: 'Likes are not available on this role link.' });
    if (!delivery.access?.allowLikes) return res.status(403).json({ success: false, message: 'Photo likes are turned off for this delivery.' });
    if (!delivery.assets.some(asset => asset.assetId === req.params.assetId)) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    const query = { deliveryId: delivery._id, assetId: req.params.assetId, visitorDigest: tokenDigest(visitorId(req, res)) };
    const existing = await PhotoLike.findOneAndDelete(query);
    if (!existing) await PhotoLike.create(query);
    const likesCount = await PhotoLike.countDocuments({ deliveryId: delivery._id });
    await Delivery.updateOne({ _id: delivery._id }, { likesCount });
    res.json({ success: true, data: { liked: !existing, likesCount } });
  } catch (error) {
    if (error.code === 11000) return res.json({ success: true, data: { liked: true } });
    res.status(500).json({ success: false, message: 'We could not update that photograph.' });
  }
}

export async function getPhotoDownload(req, res) {
  try {
    const delivery = await publicDelivery(req.params.publicId);
    const grant = delivery ? await shareGrant(req, delivery) : null;
    if (!delivery || expired(delivery) || (!grant && !hasPublicAccess(req, delivery))) return res.status(404).json({ success: false, message: 'This delivery is not available.' });
    if (grant ? !grant.allowIndividualDownloads : !delivery.access?.allowIndividualDownloads) return res.status(403).json({ success: false, message: 'Individual downloads are turned off for this link.' });
    const asset = grantAssets(delivery, grant).find(item => item.assetId === req.params.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    await Delivery.updateOne({ _id: delivery._id }, { $inc: { downloadsCount: 1 } });
    res.json({ success: true, data: { url: signedImageUrl(asset.publicId, { original: true, attachment: true }) } });
  } catch (error) { res.status(500).json({ success: false, message: 'We could not prepare that download.' }); }
}

export async function getGalleryDownload(req, res) {
  try {
    const delivery = await publicDelivery(req.params.publicId);
    const grant = delivery ? await shareGrant(req, delivery) : null;
    if (!delivery || expired(delivery) || (!grant && !hasPublicAccess(req, delivery))) return res.status(404).json({ success: false, message: 'This delivery is not available.' });
    if (grant ? !grant.allowDownloadAll : !delivery.access?.allowDownloadAll) return res.status(403).json({ success: false, message: 'Full gallery download is turned off for this link.' });
    const selectedAssets = grantAssets(delivery, grant);
    const url = signedArchiveUrl(selectedAssets.map(asset => asset.publicId), `${delivery.clientName || 'client'}-photographs`, grant?.assetIds?.length ? '' : deliveryFolder(delivery.userId._id, delivery._id));
    await Delivery.updateOne({ _id: delivery._id }, { $inc: { downloadsCount: 1 } });
    res.json({ success: true, data: { url } });
  } catch (error) {
    console.error('[deliveries/gallery-download]', error.message);
    res.status(500).json({ success: false, message: 'We could not prepare the full gallery.' });
  }
}

export async function emailClientDelivery(req, res) {
  try {
    const parsed = z.object({ email: z.string().trim().email().max(254) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Enter a valid client email address.' });
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || delivery.status !== 'published') return res.status(404).json({ success: false, message: 'Publish this delivery before emailing it.' });
    const url = `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${delivery.publicId}`;
    await sendStoryReadyEmail({ to: parsed.data.email, clientName: delivery.clientName, storyTitle: delivery.title, storyUrl: url });
    res.json({ success: true, message: `Delivery email sent to ${parsed.data.email}.` });
  } catch (error) { console.error('[deliveries/email]', error.message); res.status(502).json({ success: false, message: 'The delivery email could not be sent. Copy the link and send it directly instead.' }); }
}

export async function getDeliveryQr(req, res) {
  try {
    const delivery = await ownedDelivery(req.params.id, req.user.id);
    if (!delivery || delivery.status !== 'published') return res.status(404).json({ success: false, message: 'Publish this delivery before creating its QR code.' });
    const url = `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${delivery.publicId}`;
    const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 2, width: 1200, color: { dark: '#070709', light: '#ffffff' } });
    res.json({ success: true, data: { dataUrl, filename: `${String(delivery.title || 'veylo-delivery').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60)}-qr.png` } });
  } catch { res.status(500).json({ success: false, message: 'We could not create that QR code.' }); }
}
