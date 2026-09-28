import { z } from 'zod';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Delivery from '../models/Delivery.js';
import Portfolio from '../models/Portfolio.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import PortfolioJob from '../models/PortfolioJob.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { signedImageUrl } from '../services/deliveryMedia.service.js';
import { CREATIVE_DIRECTOR_PROMPT_VERSION, CREATIVE_DIRECTOR_PROVIDER } from '../services/alibabaCreativeDirector.service.js';
import { PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS, PORTFOLIO_HANDLE_REDIRECT_MS, PORTFOLIO_HANDLE_RESERVATION_MS, STUDIO_NAME_CHANGE_COOLDOWN_MS, isoDate, nextChangeAt } from '../constants/profilePolicy.js';
import { tokenDigest } from '../utils/auth.js';
import { recordAnalyticsEventAsync } from '../services/analytics.service.js';
import { isRuntimeFeatureEnabled } from '../services/runtimeConfig.service.js';

const handleSchema = z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use letters, numbers, and single hyphens.');
const updateSchema = z.object({
  handle: handleSchema,
  studioName: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(600).default(''),
  headline: z.string().trim().max(100).default(''),
  introLine: z.string().trim().max(240).default(''),
  location: z.string().trim().max(120).default(''),
  contactLabel: z.string().trim().min(2).max(50).default('Ask about a shoot'),
  instagram: z.string().trim().max(80).default(''),
  whatsapp: z.string().trim().max(30).default(''),
  heroPublicId: z.string().max(500).default(''),
  items: z.array(z.object({ publicId: z.string().min(5).max(500), title: z.string().trim().max(100).default(''), category: z.string().trim().min(1).max(50).default('Selected work') }).strict()).max(50).default([]),
  direction: z.object({
    background: z.enum(['ink', 'warm-black', 'ivory']).default('ink'),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ff9b8e'),
    typeStyle: z.enum(['editorial', 'modern', 'classic']).default('editorial'),
    rhythm: z.enum(['measured', 'bold', 'quiet']).default('measured'),
    layout: z.enum(['editorial', 'grid', 'masonry']).default('editorial'),
    motion: z.enum(['subtle', 'still']).default('subtle'),
    showBio: z.boolean().default(true),
    showLocation: z.boolean().default(true),
    showCategories: z.boolean().default(true),
    showPhotoTitles: z.boolean().default(true),
    showContact: z.boolean().default(true)
  }).strict().default({})
}).strict();

const RESERVED = new Set(['admin', 'api', 'app', 'billing', 'dashboard', 'delivery', 'formats', 'help', 'home', 'login', 'portfolio', 'pricing', 'settings', 'signup', 'support', 'veylo']);
function safeHandle(value) {
  const slug = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `${slug || 'my'}-studio`.slice(0, 40);
}

function portfolioVisitorDigest(req, res) {
  let id = req.cookies?.veylo_portfolio_client;
  if (!id || !/^[A-Za-z0-9_-]{30,100}$/.test(id)) {
    id = crypto.randomBytes(32).toString('base64url');
    res.cookie('veylo_portfolio_client', id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000, path: '/api/v1/portfolio/public' });
  }
  return tokenDigest(id);
}
function publicOutput(portfolio, studioName = portfolio.studioName) {
  const items = [...portfolio.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const direction = portfolio.direction?.toObject?.() || portfolio.direction || {};
  return {
    handle: portfolio.handle, studioName, bio: portfolio.bio, headline: portfolio.headline, introLine: portfolio.introLine, location: portfolio.location,
    contactLabel: portfolio.contactLabel, instagram: portfolio.instagram, whatsapp: portfolio.whatsapp,
    heroPublicId: portfolio.heroPublicId || items[0]?.publicId || '',
    direction: {
      background: direction.background || 'ink', accent: direction.accent || '#ff9b8e',
      typeStyle: direction.typeStyle || 'editorial', rhythm: direction.rhythm || 'measured',
      layout: direction.layout || 'editorial', motion: direction.motion || 'subtle', showBio: direction.showBio ?? true,
      showLocation: direction.showLocation ?? true, showCategories: direction.showCategories ?? true,
      showPhotoTitles: direction.showPhotoTitles ?? true, showContact: direction.showContact ?? true
    },
    publishedAt: portfolio.publishedAt,
    items: items.map(item => ({ publicId: item.publicId, title: item.title, category: item.category, url: signedImageUrl(item.publicId), thumbnailUrl: signedImageUrl(item.publicId, { thumbnail: true }) }))
  };
}

function editablePortfolio(portfolio) { return portfolio.draft || portfolio; }

function changePolicy(user, portfolio) {
  return {
    studioNameNextChangeAt: isoDate(nextChangeAt(user?.studioNameChangedAt, STUDIO_NAME_CHANGE_COOLDOWN_MS)),
    handleNextChangeAt: isoDate(nextChangeAt(portfolio?.handleChangedAt, PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS))
  };
}

async function initialHandle(user) {
  const root = safeHandle(user.studio?.name || user.name);
  const now = new Date();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt ? `${root.slice(0, 35)}-${attempt + 1}` : root;
    if (!RESERVED.has(candidate) && !await Portfolio.exists({ $or: [{ handle: candidate }, { previousHandles: { $elemMatch: { handle: candidate, reservedUntil: { $gt: now } } } }] })) return candidate;
  }
  return `${root.slice(0, 30)}-${String(user._id).slice(-6)}`;
}

async function ownedPublicIds(userId) {
  const [deliveries, stored] = await Promise.all([
    Delivery.find({ userId, status: 'published' }).select('assets.publicId assets.resourceType').lean(),
    StorageAsset.find({ userId }).select('publicId').lean()
  ]);
  return new Set([...deliveries.flatMap(delivery => delivery.assets.filter(asset => asset.resourceType !== 'video').map(asset => asset.publicId)), ...stored.map(asset => asset.publicId)]);
}

async function resolvePublicPortfolio(rawHandle) {
  const parsed = handleSchema.safeParse(rawHandle);
  if (!parsed.success) return null;
  const now = new Date();
  const portfolio = await Portfolio.findOne({ handle: parsed.data, status: 'published' }) || await Portfolio.findOne({ status: 'published', previousHandles: { $elemMatch: { handle: parsed.data, redirectUntil: { $gt: now } } } });
  if (!portfolio) return null;
  const user = await User.findById(portfolio.userId);
  if (!user) return null;
  const entitlements = await resolveEntitlements(user, { includeUsage: false });
  if (entitlements.features.portfolioMode !== 'public') return null;
  return { portfolio, user, redirectedFrom: portfolio.handle === parsed.data ? null : parsed.data };
}

export async function getMyPortfolio(req, res) {
  try {
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    let portfolio = await Portfolio.findOne({ userId: user._id });
    if (!portfolio) portfolio = await Portfolio.create({ userId: user._id, handle: await initialHandle(user), studioName: user.studio?.name || user.name, location: [user.studio?.city, user.studio?.state].filter(Boolean).join(', '), instagram: user.studio?.instagram || '', whatsapp: user.studio?.whatsapp || '' });
    res.json({ success: true, data: publicOutput(editablePortfolio(portfolio), user.studio?.name || user.name), status: portfolio.status, live: portfolio.status === 'published' ? { handle: portfolio.handle, publishedAt: portfolio.publishedAt } : null, hasUnpublishedChanges: (portfolio.draftRevision || 0) > (portfolio.publishedRevision || 0), access: entitlements.features.portfolioMode, changePolicy: changePolicy(user, portfolio) });
  } catch (error) { res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? 'That portfolio address is already in use.' : 'We could not open your portfolio settings.' }); }
}

export async function checkPortfolioHandle(req, res) {
  try {
    const parsed = handleSchema.safeParse(req.params.handle);
    if (!parsed.success || RESERVED.has(parsed.data)) return res.json({ success: true, available: false, message: 'Choose a different address.' });
    const current = await Portfolio.findOne({ userId: req.user.id }).select('_id previousHandles').lean();
    const now = new Date();
    const ownReserved = current?.previousHandles?.some(entry => entry.handle === parsed.data && new Date(entry.reservedUntil) > now);
    const conflict = await Portfolio.exists({ ...(current ? { _id: { $ne: current._id } } : {}), $or: [{ handle: parsed.data }, { previousHandles: { $elemMatch: { handle: parsed.data, reservedUntil: { $gt: now } } } }] });
    res.json({ success: true, available: !ownReserved && !conflict, message: ownReserved || conflict ? 'That address is already in use or reserved.' : 'This address is available.' });
  } catch { res.status(500).json({ success: false, message: 'We could not check that address.' }); }
}

export async function getPortfolioSources(req, res) {
  try {
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode === 'unavailable') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Veylo Portfolio is included with Pro.' });
    const kind = ['deliveries', 'delivery', 'library'].includes(req.query.kind) ? req.query.kind : 'deliveries';
    const query = String(req.query.query || '').trim().slice(0, 50);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cursor = String(req.query.cursor || '');
    const pageSize = 24;
    if (kind === 'delivery') {
      const sourceId = String(req.query.sourceId || '');
      const delivery = await Delivery.findOne({ userId: user._id, publicId: sourceId, status: 'published' }).select('title shootType assets').lean();
      if (!delivery) return res.status(404).json({ success: false, message: 'That delivery is unavailable.' });
      const matching = delivery.assets.filter(asset => asset.resourceType !== 'video' && (!query || (asset.originalFilename || '').toLowerCase().includes(query.toLowerCase())));
      const offset = /^\d+$/.test(cursor) ? Math.min(Number(cursor), matching.length) : 0;
      const page = matching.slice(offset, offset + pageSize);
      return res.json({ success: true, data: page.map(asset => ({ publicId: asset.publicId, title: asset.originalFilename || delivery.title || delivery.shootType || '', source: 'delivery', sourceId, thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }) })), nextCursor: offset + pageSize < matching.length ? String(offset + pageSize) : null });
    }
    const after = mongoose.Types.ObjectId.isValid(cursor) ? { _id: { $lt: new mongoose.Types.ObjectId(cursor) } } : {};
    if (kind === 'library') {
      const match = { userId: user._id, ...after, ...(query ? { originalFilename: { $regex: escaped, $options: 'i' } } : {}) };
      const rows = await StorageAsset.find(match).sort({ _id: -1 }).limit(pageSize + 1).select('publicId originalFilename _id').lean();
      const page = rows.slice(0, pageSize);
      return res.json({ success: true, data: page.map(asset => ({ publicId: asset.publicId, title: asset.originalFilename || '', source: 'library', sourceId: String(asset._id), thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }) })), nextCursor: rows.length > pageSize ? String(page.at(-1)._id) : null });
    }
    const match = { userId: user._id, status: 'published', assets: { $elemMatch: { resourceType: { $ne: 'video' } } }, ...after, ...(query ? { $or: [{ title: { $regex: escaped, $options: 'i' } }, { shootType: { $regex: escaped, $options: 'i' } }] } : {}) };
    const rows = await Delivery.aggregate([{ $match: match }, { $sort: { _id: -1 } }, { $limit: pageSize + 1 }, { $addFields: { photoAssets: { $filter: { input: '$assets', as: 'asset', cond: { $ne: ['$$asset.resourceType', 'video'] } } } } }, { $project: { publicId: 1, title: 1, shootType: 1, photoCount: { $size: '$photoAssets' }, coverPublicId: { $arrayElemAt: ['$photoAssets.publicId', 0] } } }]);
    const page = rows.slice(0, pageSize);
    res.json({ success: true, data: page.map(delivery => ({ sourceId: delivery.publicId, title: delivery.title || delivery.shootType || 'Finished delivery', photoCount: delivery.photoCount, thumbnailUrl: delivery.coverPublicId ? signedImageUrl(delivery.coverPublicId, { thumbnail: true }) : '' })), nextCursor: rows.length > pageSize ? String(page.at(-1)._id) : null });
  } catch { res.status(500).json({ success: false, message: 'We could not load photographs for your portfolio.' }); }
}

export async function updateMyPortfolio(req, res) {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
    if (RESERVED.has(parsed.data.handle)) return res.status(400).json({ success: false, message: 'Choose a different portfolio address.' });
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode !== 'public') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Renew Pro to edit or publish your portfolio.' });
    const owned = await ownedPublicIds(user._id);
    if (parsed.data.items.some(item => !owned.has(item.publicId))) return res.status(403).json({ success: false, message: 'One of those photographs does not belong to your account.' });
    if (parsed.data.heroPublicId && !parsed.data.items.some(item => item.publicId === parsed.data.heroPublicId)) return res.status(400).json({ success: false, message: 'Choose a cover photograph from your selected work.' });
    let current = await Portfolio.findOne({ userId: user._id });
    if (!current) current = await Portfolio.create({ userId: user._id, handle: await initialHandle(user), studioName: user.studio?.name || user.name });
    const now = new Date();
    const handleChanged = current.handle !== parsed.data.handle;
    if (handleChanged && current.previousHandles.some(entry => entry.handle === parsed.data.handle && new Date(entry.reservedUntil) > now)) return res.status(409).json({ success: false, code: 'PORTFOLIO_HANDLE_RESERVED', message: 'That previous address is still reserved. Choose another address.' });
    const conflict = await Portfolio.findOne({ _id: { $ne: current._id }, $or: [{ handle: parsed.data.handle }, { previousHandles: { $elemMatch: { handle: parsed.data.handle, reservedUntil: { $gt: now } } } }] }).select('_id').lean();
    if (conflict) return res.status(409).json({ success: false, code: 'PORTFOLIO_HANDLE_IN_USE', message: 'That portfolio address is already in use or reserved. Choose another address.' });
    const items = parsed.data.items.map((item, sortOrder) => ({ ...item, sortOrder }));
    current.draft = { ...parsed.data, studioName: user.studio?.name || user.name, heroPublicId: parsed.data.heroPublicId || items[0]?.publicId || '', items };
    current.draftRevision = (current.draftRevision || 0) + 1;
    current.markModified('draft');
    await current.save();
    res.json({ success: true, data: publicOutput(current.draft, user.studio?.name || user.name), status: current.status, live: current.status === 'published' ? { handle: current.handle, publishedAt: current.publishedAt } : null, hasUnpublishedChanges: true, changePolicy: changePolicy(user, current) });
  } catch (error) { res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? 'That portfolio address is already in use.' : 'We could not save those portfolio changes.' }); }
}

export async function publishMyPortfolio(req, res) {
  try {
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode !== 'public') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Veylo Portfolio is included with Pro.' });
    const portfolio = await Portfolio.findOne({ userId: user._id });
    const draft = portfolio && editablePortfolio(portfolio);
    if (!draft || draft.items.length < 4 || !draft.bio?.trim()) return res.status(400).json({ success: false, message: 'Add a short bio and at least four photographs before publishing.' });
    if (RESERVED.has(draft.handle)) return res.status(400).json({ success: false, message: 'Choose a different portfolio address.' });
    const owned = await ownedPublicIds(user._id);
    if (draft.items.some(item => !owned.has(item.publicId))) return res.status(403).json({ success: false, message: 'One of those photographs is no longer available to this account.' });
    if (draft.heroPublicId && !draft.items.some(item => item.publicId === draft.heroPublicId)) return res.status(400).json({ success: false, message: 'Choose a cover photograph from your selected work.' });
    const now = new Date();
    const conflict = await Portfolio.findOne({ _id: { $ne: portfolio._id }, $or: [{ handle: draft.handle }, { previousHandles: { $elemMatch: { handle: draft.handle, reservedUntil: { $gt: now } } } }] }).select('_id').lean();
    if (conflict) return res.status(409).json({ success: false, message: 'That portfolio address is already in use or reserved.' });
    if (portfolio.handle !== draft.handle) {
      const cooldown = portfolio.publishedAt ? nextChangeAt(portfolio.handleChangedAt, PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS) : null;
      if (cooldown) return res.status(429).json({ success: false, code: 'PORTFOLIO_HANDLE_COOLDOWN', nextChangeAt: isoDate(cooldown), message: 'Your portfolio address cannot be changed yet.' });
      if (portfolio.previousHandles.some(entry => entry.handle === draft.handle && new Date(entry.reservedUntil) > now)) return res.status(409).json({ success: false, message: 'That previous address is still reserved.' });
      if (portfolio.publishedAt) {
        portfolio.previousHandles = portfolio.previousHandles.filter(entry => entry.handle !== portfolio.handle && new Date(entry.reservedUntil) > now);
        portfolio.previousHandles.push({ handle: portfolio.handle, redirectUntil: new Date(now.getTime() + PORTFOLIO_HANDLE_REDIRECT_MS), reservedUntil: new Date(now.getTime() + PORTFOLIO_HANDLE_RESERVATION_MS) });
        portfolio.handleChangedAt = now;
      }
    }
    for (const key of ['handle', 'bio', 'headline', 'introLine', 'location', 'contactLabel', 'instagram', 'whatsapp', 'heroPublicId', 'items', 'direction']) portfolio[key] = draft[key];
    portfolio.studioName = user.studio?.name || user.name;
    portfolio.status = 'published';
    portfolio.publishedAt = now;
    portfolio.publishedRevision = portfolio.draftRevision || 0;
    await portfolio.save();
    res.json({ success: true, data: publicOutput(portfolio, portfolio.studioName), status: portfolio.status, hasUnpublishedChanges: false, changePolicy: changePolicy(user, portfolio) });
  } catch (error) { res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? 'That portfolio address is already in use.' : 'We could not publish your portfolio.' }); }
}

export async function unpublishMyPortfolio(req, res) {
  try { await Portfolio.updateOne({ userId: req.user.id }, { status: 'draft' }); res.json({ success: true, message: 'Your portfolio is private.' }); }
  catch { res.status(500).json({ success: false, message: 'We could not make your portfolio private.' }); }
}

export async function directMyPortfolio(req, res) {
  try {
    if (!(await isRuntimeFeatureEnabled('deliveryPipeline', process.env.DELIVERY_PIPELINE_ENABLED === 'true')) || !(await isRuntimeFeatureEnabled('portfolio', true))) return res.status(503).json({ success: false, message: 'The AI Creative Director is not available yet.' });
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode !== 'public') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Veylo Portfolio is included with Pro.' });
    const portfolio = await Portfolio.findOne({ userId: user._id });
    const draft = portfolio && editablePortfolio(portfolio);
    if (!draft || draft.items.length < 4 || !draft.bio) return res.status(400).json({ success: false, message: 'Save a short bio and at least four photographs first.' });
    const running = await PortfolioJob.findOne({ portfolioId: portfolio._id, status: { $in: ['queued', 'running'] } });
    if (running) return res.json({ success: true, data: running });
    const job = await PortfolioJob.create({ portfolioId: portfolio._id, userId: user._id, provider: CREATIVE_DIRECTOR_PROVIDER, promptVersion: CREATIVE_DIRECTOR_PROMPT_VERSION });
    res.status(202).json({ success: true, data: job });
  } catch { res.status(500).json({ success: false, message: 'We could not start your portfolio direction.' }); }
}

export async function getPortfolioJob(req, res) {
  try {
    const job = await PortfolioJob.findOne({ _id: req.params.jobId, userId: req.user.id });
    if (!job) return res.status(404).json({ success: false, message: 'Portfolio direction not found.' });
    res.json({ success: true, data: job });
  } catch { res.status(404).json({ success: false, message: 'Portfolio direction not found.' }); }
}

export async function getPublicPortfolio(req, res) {
  try {
    const resolved = await resolvePublicPortfolio(req.params.handle);
    if (!resolved) return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    recordAnalyticsEventAsync({ name: 'portfolio.viewed', source: 'server', actorType: 'anonymous', userId: resolved.user._id, sessionDigest: portfolioVisitorDigest(req, res), status: 'viewed', route: req.originalUrl, metadata: { handle: resolved.portfolio.handle, redirected: Boolean(resolved.redirectedFrom) } });
    res.json({ success: true, data: publicOutput(resolved.portfolio, resolved.user.studio?.name || resolved.user.name), redirectedFrom: resolved.redirectedFrom });
  } catch { res.status(500).json({ success: false, message: 'We could not open that portfolio.' }); }
}

export async function recordPortfolioEngagement(req, res) {
  try {
    const resolved = await resolvePublicPortfolio(req.params.handle);
    if (!resolved) return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    const parsed = z.object({ action: z.enum(['project.opened', 'filter.used', 'instagram.clicked', 'whatsapp.clicked', 'enquiry.clicked']), itemIndex: z.number().int().min(0).max(50).optional(), category: z.string().trim().max(50).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'That portfolio action is not valid.' });
    recordAnalyticsEventAsync({ name: `portfolio.${parsed.data.action}`, source: 'server', actorType: 'anonymous', userId: resolved.user._id, sessionDigest: portfolioVisitorDigest(req, res), status: 'completed', route: req.originalUrl, metadata: { handle: resolved.portfolio.handle, itemIndex: parsed.data.itemIndex, category: parsed.data.category } });
    res.status(202).json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'We could not record that portfolio action.' }); }
}
