import { z } from 'zod';
import Delivery from '../models/Delivery.js';
import Portfolio from '../models/Portfolio.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import PortfolioJob from '../models/PortfolioJob.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { signedImageUrl } from '../services/deliveryMedia.service.js';
import { PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS, PORTFOLIO_HANDLE_REDIRECT_MS, PORTFOLIO_HANDLE_RESERVATION_MS, STUDIO_NAME_CHANGE_COOLDOWN_MS, isoDate, nextChangeAt } from '../constants/profilePolicy.js';

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
  items: z.array(z.object({ publicId: z.string().min(5).max(500), title: z.string().trim().max(100).default(''), category: z.string().trim().min(1).max(50).default('Selected work') }).strict()).max(50).default([]),
  direction: z.object({ background: z.enum(['ink', 'warm-black', 'ivory']), accent: z.string().regex(/^#[0-9a-f]{6}$/i), typeStyle: z.enum(['editorial', 'modern', 'classic']), rhythm: z.enum(['measured', 'bold', 'quiet']) }).strict()
}).strict();

const RESERVED = new Set(['admin', 'api', 'app', 'billing', 'dashboard', 'delivery', 'formats', 'help', 'home', 'login', 'portfolio', 'pricing', 'settings', 'signup', 'support', 'veylo']);
function safeHandle(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'studio'; }
function publicOutput(portfolio) {
  return {
    handle: portfolio.handle, studioName: portfolio.studioName, bio: portfolio.bio, headline: portfolio.headline, introLine: portfolio.introLine, location: portfolio.location,
    contactLabel: portfolio.contactLabel, instagram: portfolio.instagram, whatsapp: portfolio.whatsapp,
    direction: portfolio.direction, publishedAt: portfolio.publishedAt,
    items: [...portfolio.items].sort((a, b) => a.sortOrder - b.sortOrder).map(item => ({ publicId: item.publicId, title: item.title, category: item.category, url: signedImageUrl(item.publicId), thumbnailUrl: signedImageUrl(item.publicId, { thumbnail: true }) }))
  };
}

function changePolicy(user, portfolio) {
  return {
    studioNameNextChangeAt: isoDate(nextChangeAt(user?.studioNameChangedAt, STUDIO_NAME_CHANGE_COOLDOWN_MS)),
    handleNextChangeAt: isoDate(nextChangeAt(portfolio?.handleChangedAt, PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS))
  };
}

async function initialHandle(user) {
  const root = safeHandle(user.studio?.name || user.name);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt ? `${root.slice(0, 35)}-${attempt + 1}` : root;
    if (!RESERVED.has(candidate) && !await Portfolio.exists({ handle: candidate })) return candidate;
  }
  return `${root.slice(0, 30)}-${String(user._id).slice(-6)}`;
}

async function ownedPublicIds(userId) {
  const [deliveries, stored] = await Promise.all([
    Delivery.find({ userId, status: 'published' }).select('assets.publicId').lean(),
    StorageAsset.find({ userId }).select('publicId').lean()
  ]);
  return new Set([...deliveries.flatMap(delivery => delivery.assets.map(asset => asset.publicId)), ...stored.map(asset => asset.publicId)]);
}

export async function getMyPortfolio(req, res) {
  try {
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    let portfolio = await Portfolio.findOne({ userId: user._id });
    if (!portfolio) portfolio = await Portfolio.create({ userId: user._id, handle: await initialHandle(user), studioName: user.studio?.name || user.name, location: [user.studio?.city, user.studio?.state].filter(Boolean).join(', '), instagram: user.studio?.instagram || '', whatsapp: user.studio?.whatsapp || '' });
    res.json({ success: true, data: publicOutput(portfolio), status: portfolio.status, access: entitlements.features.portfolioMode, changePolicy: changePolicy(user, portfolio) });
  } catch (error) { res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? 'That portfolio address is already in use.' : 'We could not open your portfolio settings.' }); }
}

export async function getPortfolioSources(req, res) {
  try {
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode === 'unavailable') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Veylo Portfolio is included with Pro.' });
    const [deliveries, stored] = await Promise.all([
      Delivery.find({ userId: user._id, status: 'published' }).sort({ publishedAt: -1 }).select('title shootType assets publicId').lean(),
      StorageAsset.find({ userId: user._id }).sort({ createdAt: -1 }).limit(200).lean()
    ]);
    const sources = [
      ...deliveries.flatMap(delivery => delivery.assets.map(asset => ({ publicId: asset.publicId, title: delivery.title || delivery.shootType || asset.originalFilename || '', source: 'delivery', sourceId: delivery.publicId, thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }) }))),
      ...stored.map(asset => ({ publicId: asset.publicId, title: asset.originalFilename || '', source: 'library', sourceId: String(asset._id), thumbnailUrl: signedImageUrl(asset.publicId, { thumbnail: true }) }))
    ];
    res.json({ success: true, data: sources, access: entitlements.features.portfolioMode });
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
    const current = await Portfolio.findOne({ userId: user._id });
    const now = new Date();
    const studioNameChanged = Boolean(current?.studioName) && current.studioName.trim() !== parsed.data.studioName.trim();
    const studioNameNextChangeAt = nextChangeAt(user.studioNameChangedAt, STUDIO_NAME_CHANGE_COOLDOWN_MS);
    if (studioNameChanged && studioNameNextChangeAt) return res.status(429).json({ success: false, code: 'STUDIO_NAME_COOLDOWN', nextChangeAt: isoDate(studioNameNextChangeAt), message: `Your studio name can be changed again on ${studioNameNextChangeAt.toLocaleDateString('en-NG', { dateStyle: 'medium' })}.` });
    const handleChanged = Boolean(current) && current.handle !== parsed.data.handle;
    const handleNextChangeAt = nextChangeAt(current?.handleChangedAt, PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS);
    if (handleChanged && handleNextChangeAt) return res.status(429).json({ success: false, code: 'PORTFOLIO_HANDLE_COOLDOWN', nextChangeAt: isoDate(handleNextChangeAt), message: `Your portfolio address can be changed again on ${handleNextChangeAt.toLocaleDateString('en-NG', { dateStyle: 'medium' })}.` });
    const items = parsed.data.items.map((item, sortOrder) => ({ ...item, sortOrder }));
    const update = { ...parsed.data, items };
    if (handleChanged) {
      const previousHandles = Array.isArray(current.previousHandles) ? current.previousHandles.filter(entry => entry.handle !== current.handle && new Date(entry.reservedUntil) > now) : [];
      const ownReservedHandle = previousHandles.some(entry => entry.handle === parsed.data.handle && new Date(entry.reservedUntil) > now);
      if (ownReservedHandle) return res.status(409).json({ success: false, code: 'PORTFOLIO_HANDLE_RESERVED', message: 'That portfolio address is still reserved after a previous change. Choose another address.' });
      const conflict = await Portfolio.findOne({ _id: { $ne: current._id }, $or: [{ handle: parsed.data.handle }, { previousHandles: { $elemMatch: { handle: parsed.data.handle, reservedUntil: { $gt: now } } } }] }).select('_id').lean();
      if (conflict) return res.status(409).json({ success: false, code: 'PORTFOLIO_HANDLE_IN_USE', message: 'That portfolio address is already in use or reserved. Choose another address.' });
      previousHandles.push({ handle: current.handle, redirectUntil: new Date(now.getTime() + PORTFOLIO_HANDLE_REDIRECT_MS), reservedUntil: new Date(now.getTime() + PORTFOLIO_HANDLE_RESERVATION_MS) });
      update.handleChangedAt = now;
      update.previousHandles = previousHandles;
    }
    if (studioNameChanged) user.studioNameChangedAt = now;
    const portfolio = current
      ? await Portfolio.findOneAndUpdate({ _id: current._id }, { $set: update }, { new: true, runValidators: true })
      : await Portfolio.create({ userId: user._id, ...update });
    if (studioNameChanged) await user.save();
    res.json({ success: true, data: publicOutput(portfolio), status: portfolio.status, changePolicy: changePolicy(user, portfolio) });
  } catch (error) { res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? 'That portfolio address is already in use.' : 'We could not save those portfolio changes.' }); }
}

export async function publishMyPortfolio(req, res) {
  try {
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode !== 'public') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Veylo Portfolio is included with Pro.' });
    const portfolio = await Portfolio.findOne({ userId: user._id });
    if (!portfolio || portfolio.items.length < 4 || !portfolio.bio) return res.status(400).json({ success: false, message: 'Add a short bio and at least four photographs before publishing.' });
    portfolio.status = 'published'; portfolio.publishedAt = new Date(); await portfolio.save();
    res.json({ success: true, data: publicOutput(portfolio), status: portfolio.status });
  } catch { res.status(500).json({ success: false, message: 'We could not publish your portfolio.' }); }
}

export async function unpublishMyPortfolio(req, res) {
  try { await Portfolio.updateOne({ userId: req.user.id }, { status: 'draft', $unset: { publishedAt: 1 } }); res.json({ success: true, message: 'Your portfolio is private.' }); }
  catch { res.status(500).json({ success: false, message: 'We could not make your portfolio private.' }); }
}

export async function directMyPortfolio(req, res) {
  try {
    if (process.env.DELIVERY_PIPELINE_ENABLED !== 'true') return res.status(503).json({ success: false, message: 'The AI Creative Director is not available yet.' });
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode !== 'public') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Veylo Portfolio is included with Pro.' });
    const portfolio = await Portfolio.findOne({ userId: user._id });
    if (!portfolio || portfolio.items.length < 4 || !portfolio.bio) return res.status(400).json({ success: false, message: 'Save a short bio and at least four photographs first.' });
    const running = await PortfolioJob.findOne({ portfolioId: portfolio._id, status: { $in: ['queued', 'running'] } });
    if (running) return res.json({ success: true, data: running });
    const job = await PortfolioJob.create({ portfolioId: portfolio._id, userId: user._id });
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
    const handle = handleSchema.safeParse(req.params.handle);
    if (!handle.success) return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    const now = new Date();
    const portfolio = await Portfolio.findOne({ handle: handle.data, status: 'published' }) || await Portfolio.findOne({ status: 'published', previousHandles: { $elemMatch: { handle: handle.data, redirectUntil: { $gt: now } } } });
    if (!portfolio) return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    const user = await User.findById(portfolio.userId);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode !== 'public') return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    res.json({ success: true, data: publicOutput(portfolio), redirectedFrom: portfolio.handle === handle.data ? null : handle.data });
  } catch { res.status(500).json({ success: false, message: 'We could not open that portfolio.' }); }
}
