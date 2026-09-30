import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import User from '../models/User.js';
import { contrastRatio, V3_FONT_CHOICES, V3_FORMATS, V3_MUSIC_FORMATS, validShowcase } from '../constants/deliveryV3.js';
import { improvePurpose, recommendV3Format, regenerateV3Caption, repickV3Palette } from '../services/deliveryV3AI.service.js';
import { reservePublishSlot, resolveEntitlements } from '../services/entitlement.service.js';
import { removeDeliveryAudio } from '../services/deliveryMedia.service.js';
import { NARRATION_BOOKEND_RENDER_VERSION } from '../services/narration.service.js';
import { NARRATION_VOICES, DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';
import { warmLockedDeliveryPreviews } from '../services/deliveryPreviewCache.service.js';

const details = z.object({ kind: z.enum(['showcase', 'pinboard']).default('showcase'), clientName: z.string().trim().min(2).max(100), shootType: z.string().trim().max(80).default(''), purpose: z.string().trim().max(3000).default(''), title: z.string().trim().max(120).default(''), originalPurpose: z.string().trim().max(3000).default(''), clarificationAnswers: z.array(z.object({ question: z.string().trim().max(180), answer: z.string().trim().min(1).max(300) }).strict()).max(3).default([]) }).strict();
const formatInput = z.object({ format: z.enum(Object.keys(V3_FORMATS)) }).strict();
const idList = z.array(z.string().uuid()).max(24);
const showcaseInput = z.object({ assetIds: idList, frames: z.array(z.object({ assetId: z.string().uuid(), headline: z.string().trim().max(70).default(''), caption: z.string().trim().min(5).max(180) }).strict()).max(24), title: z.string().trim().min(2).max(80), openingLine: z.string().trim().min(5).max(140), closingLine: z.string().trim().min(5).max(160), openingAssetId: z.string().uuid(), closingAssetId: z.string().uuid() }).strict();
const themeInput = z.object({ palette: z.object({ background: z.string().regex(/^#[0-9a-f]{6}$/i), surface: z.string().regex(/^#[0-9a-f]{6}$/i), text: z.string().regex(/^#[0-9a-f]{6}$/i), accent: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(), typography: z.object({ display: z.string(), body: z.string() }).strict() }).strict();
const pinboardInput = z.object({
  title: z.string().trim().min(2).max(120),
  useStandardBoard: z.boolean().default(false),
  allowClientLayouts: z.boolean().default(false),
  selectedLayoutId: z.enum(['balanced', 'moments', 'colour-flow']),
  layouts: z.array(z.object({ id: z.enum(['balanced', 'moments', 'colour-flow']), title: z.string().trim().min(2).max(36), description: z.string().trim().min(2).max(120), assetOrder: z.array(z.string().uuid()).max(500) }).strict()).length(3),
  moments: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), title: z.string().trim().min(2).max(40), assetIds: z.array(z.string().uuid()).max(500), hidden: z.boolean().default(false) }).strict()).max(12),
  palette: z.object({ background: z.string().regex(/^#[0-9a-f]{6}$/i), surface: z.string().regex(/^#[0-9a-f]{6}$/i), text: z.string().regex(/^#[0-9a-f]{6}$/i), accent: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
  typography: z.object({ display: z.string(), body: z.string() }).strict(),
  grid: z.object({ mobileColumns: z.number().int().min(1).max(2), tabletColumns: z.number().int().min(2).max(3), desktopColumns: z.number().int().min(3).max(5), gap: z.enum(['compact', 'regular', 'spacious']) }).strict(),
  animation: z.enum(['none', 'soft-fade', 'staggered'])
}).strict();
const accessInput = z.object({ pin: z.string().regex(/^\d{6}$/).optional().or(z.literal('')), expiresAt: z.string().datetime().optional().or(z.literal('')), allowIndividualDownloads: z.boolean(), allowDownloadAll: z.boolean(), allowLikes: z.boolean(), downloadsLocked: z.boolean(), downloadLockNote: z.string().trim().max(200), watermarkEnabled: z.boolean(), watermarkText: z.string().trim().max(40), usageTerms: z.string().trim().max(1000).default('') }).strict();

function bad(res, parsed) {
  const issue = parsed.error.issues[0];
  const field = issue?.path?.join('.') || '';
  const labels = { clientName: 'client name', shootType: 'shoot type', purpose: 'purpose of the shoot', title: 'delivery title', openingLine: 'opening message', closingLine: 'closing message', pin: 'PIN', expiresAt: 'expiry date', voiceId: 'narration voice', 'palette.background': 'background colour', 'palette.surface': 'panels colour', 'palette.text': 'text colour', 'palette.accent': 'accent colour' };
  const label = /^frames\.\d+\.caption$/.test(field) ? `caption for photo ${Number(field.split('.')[1]) + 1}` : labels[field] || field.replaceAll('.', ' ') || 'this field';
  const isText = issue?.origin === 'string' || typeof issue?.input === 'string' || /^(clientName|shootType|purpose|title|openingLine|closingLine|pin|downloadLockNote|watermarkText|usageTerms)$/.test(field) || /^frames\.\d+\.caption$/.test(field);
  const message = issue?.code === 'too_small' && typeof issue.minimum === 'number' && isText
    ? `The ${label} needs at least ${issue.minimum} characters.`
    : issue?.code === 'too_big' && typeof issue.maximum === 'number' && isText
      ? `Keep the ${label} under ${issue.maximum} characters.`
      : `Check the ${label} and try again.`;
  return res.status(400).json({ success: false, code: 'V3_INVALID_INPUT', field, message });
}
function fail(res, error) { console.error('[delivery-v3]', error.code || error.name, error.message); return res.status(error.status || 500).json({ success: false, code: error.code || 'V3_STEP_FAILED', message: error.status ? error.message : 'This step could not finish. Please try again.' }); }
async function owned(req, { pin = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  const query = Delivery.findOne({ _id: req.params.id, userId: req.user.id, schemaVersion: 3 });
  if (pin) query.select('+access.pinDigest');
  return query;
}
function editable(delivery) { return delivery && ['draft', 'review'].includes(delivery.status); }
function saveV3(delivery, patch) { delivery.v3 = { ...delivery.v3, ...patch }; delivery.markModified('v3'); }
function invalidateApproval(delivery) { delivery.reviewApprovedAt = undefined; saveV3(delivery, { approvedRevision: null, revision: Number(delivery.v3?.revision || 0) + 1 }); }
function narrationAudioIds(delivery) { return [delivery.narration?.opening?.publicId, delivery.narration?.closing?.publicId, delivery.narration?.captions?.publicId].filter(Boolean); }
async function removeAudioIds(ids) { await Promise.all(ids.filter(Boolean).map(id => removeDeliveryAudio(id).catch(() => {}))); }
function narrationSelectionsReady(delivery) {
  const wantsBookends = delivery.v3?.narrationChoice === 'voice';
  const voiceId = delivery.v3?.narrationVoiceId || DEFAULT_NARRATION_VOICE_ID;
  const narration = delivery.narration;
  return !wantsBookends || ([NARRATION_BOOKEND_RENDER_VERSION, 'flux-hannah-bookends-v3'].includes(narration?.renderVersion) && narration?.opening?.publicId && narration?.closing?.publicId && (narration.voiceId || DEFAULT_NARRATION_VOICE_ID) === voiceId);
}

function pinboardFallback(delivery) {
  const assets = [...delivery.assets].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const portraits = assets.filter(asset => Number(asset.height || 0) >= Number(asset.width || 0));
  const landscapes = assets.filter(asset => Number(asset.width || 0) > Number(asset.height || 0));
  const balanced = [];
  while (portraits.length || landscapes.length) {
    if (portraits.length) balanced.push(portraits.shift());
    if (landscapes.length) balanced.push(landscapes.shift());
  }
  const order = values => values.map(asset => asset.assetId);
  const hue = asset => {
    const hex = String(asset.analysis?.colors?.[0] || '').match(/^#([0-9a-f]{6})$/i)?.[1];
    if (!hex) return null;
    const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
    if (!delta) return null;
    const value = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (value * 60 + 360) % 360;
  };
  const colorOrder = [...assets].sort((a, b) => {
    const first = hue(a); const second = hue(b);
    if (first == null) return second == null ? 0 : 1;
    if (second == null) return -1;
    return first - second;
  });
  const tagGroups = new Map();
  assets.forEach(asset => {
    const tag = asset.analysis?.momentTags?.[0];
    if (!tag) return;
    const key = String(tag).toLowerCase();
    if (!tagGroups.has(key)) tagGroups.set(key, []);
    tagGroups.get(key).push(asset);
  });
  const groupedAssets = [...tagGroups.values()].filter(group => group.length > 1).flat();
  const scenesOrder = [...new Set([...groupedAssets, ...assets.filter(asset => !groupedAssets.includes(asset))])];
  return {
    title: delivery.pinboard?.title || delivery.title || `${delivery.clientName || 'Client'}'s photographs`,
    selectedLayoutId: 'balanced',
    layouts: [
      { id: 'balanced', title: 'Balanced arrangement', description: 'Alternates portrait and landscape photos where the set allows it.', assetOrder: order(balanced) },
      { id: 'moments', title: 'Scenes together', description: 'Groups matching visual tags when available; otherwise keeps upload order.', assetOrder: order(scenesOrder) },
      { id: 'colour-flow', title: 'Colour-led order', description: 'Orders by dominant photo colour when available; otherwise keeps upload order.', assetOrder: order(colorOrder.length ? colorOrder : assets) }
    ],
    moments: [],
    palette: delivery.pinboard?.palette || { background: '#13110f', surface: '#211b18', text: '#fff6ec', accent: '#efa57c' },
    typography: delivery.pinboard?.typography || { display: 'Cormorant Garamond', body: 'Outfit' },
    grid: delivery.pinboard?.grid || { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' },
    animation: delivery.pinboard?.animation || 'soft-fade',
    allowClientLayouts: Boolean(delivery.pinboard?.allowClientLayouts),
    analysisStatus: 'standard'
  };
}

export async function v3Assist(req, res) {
  try {
    const input = z.object({ mode: z.enum(['improve', 'clarify', 'recommend']), purpose: z.string().trim().max(3000).default(''), shootType: z.string().trim().min(2).max(80) }).strict().safeParse(req.body);
    if (!input.success) return bad(res, input);
    const { mode, purpose, shootType } = input.data;
    if (mode === 'improve' && !purpose) return res.status(400).json({ success: false, code: 'V3_PURPOSE_REQUIRED', field: 'purpose', message: 'Write the purpose of the shoot before improving it.' });
    const data = mode === 'improve' ? { improved: await improvePurpose({ purpose, shootType }) } : mode === 'clarify' ? { clear: true, questions: [] } : await recommendV3Format(shootType, purpose);
    res.json({ success: true, data });
  } catch (error) { fail(res, error); }
}

export async function v3Create(req, res) {
  try {
    const input = details.safeParse(req.body); if (!input.success) return bad(res, input);
    if (input.data.kind === 'showcase' && (input.data.shootType.length < 2 || !input.data.purpose)) return res.status(400).json({ success: false, code: 'V3_SHOWCASE_DETAILS_REQUIRED', message: 'Add the shoot type and purpose before creating a Showcase delivery.' });
    if (input.data.kind === 'pinboard' && input.data.title.length < 2) return res.status(400).json({ success: false, code: 'V3_PINBOARD_TITLE_REQUIRED', message: 'Give this GridBoard a title before adding photographs.' });
    const entitlements = await resolveEntitlements(await User.findById(req.user.id));
    if (entitlements.plan === 'free' && entitlements.usage.deliveriesRemaining === 0) return res.status(403).json({ success: false, code: 'MONTHLY_DELIVERY_LIMIT_REACHED', message: `You have published all ${entitlements.limits.deliveriesPerMonth} Free deliveries this month. Start another next month or move to Pro.` });
    const count = await Delivery.countDocuments({ userId: req.user.id, status: { $in: ['draft', 'analyzing', 'directing', 'review'] } });
    if (count >= 20) return res.status(409).json({ success: false, message: 'Finish or remove an existing draft before starting another one.' });
    const delivery = await Delivery.create({ userId: req.user.id, schemaVersion: 3, kind: input.data.kind, clientName: input.data.clientName, title: input.data.title || '', shootType: input.data.shootType, brief: input.data.purpose || (input.data.kind === 'pinboard' ? 'GridBoard delivery' : ''), v3: { step: input.data.kind === 'pinboard' ? 'photos' : 'format', revision: 1, originalPurpose: input.data.originalPurpose, clarificationAnswers: input.data.clarificationAnswers, narrationChoice: 'skip', captionNarrationChoice: 'skip', approvedRevision: null } });
    res.status(201).json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Details(req, res) {
  try {
    const input = details.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery)) return res.status(404).json({ success: false, message: 'Draft not found.' });
    if (delivery.kind !== input.data.kind) return res.status(409).json({ success: false, code: 'V3_DELIVERY_KIND_LOCKED', message: 'The delivery type cannot be changed after its draft is created.' });
    if (delivery.kind === 'showcase' && (input.data.shootType.length < 2 || !input.data.purpose)) return res.status(400).json({ success: false, code: 'V3_SHOWCASE_DETAILS_REQUIRED', message: 'Add the shoot type and purpose before continuing.' });
    const purpose = input.data.purpose || (delivery.kind === 'pinboard' ? 'GridBoard delivery' : '');
    const titleChanged = delivery.kind === 'pinboard' && Boolean(input.data.title) && delivery.title !== input.data.title;
    const changed = delivery.clientName !== input.data.clientName || delivery.shootType !== input.data.shootType || delivery.brief !== purpose || JSON.stringify(delivery.v3?.clarificationAnswers || []) !== JSON.stringify(input.data.clarificationAnswers);
    const discardedAudio = changed ? narrationAudioIds(delivery) : [];
    delivery.clientName = input.data.clientName; delivery.shootType = input.data.shootType; delivery.brief = purpose; if (input.data.title) delivery.title = input.data.title;
    if (titleChanged) { delivery.pinboard = { ...delivery.pinboard, title: input.data.title }; delivery.markModified('pinboard'); if (!changed) invalidateApproval(delivery); }
    if (changed) { delivery.collectionAnalysis = undefined; delivery.creativeDirection = undefined; delivery.curatedAssetIds = []; delivery.narration = undefined; if (delivery.kind === 'pinboard') delivery.pinboard = { ...delivery.pinboard, layouts: [], moments: [], analysisStatus: 'pending' }; delivery.status = 'draft'; invalidateApproval(delivery); saveV3(delivery, { narrationChoice: 'skip', captionNarrationChoice: 'skip' }); }
    saveV3(delivery, { originalPurpose: input.data.originalPurpose, clarificationAnswers: input.data.clarificationAnswers, step: delivery.kind === 'pinboard' ? 'photos' : 'format' });
    await delivery.save(); await removeAudioIds(discardedAudio); res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Format(req, res) {
  try {
    const input = formatInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery) || delivery.kind === 'pinboard') return res.status(404).json({ success: false, message: 'Showcase draft not found.' });
    const changed = delivery.format !== input.data.format;
    const discardedAudio = changed ? narrationAudioIds(delivery) : [];
    if (changed && !V3_MUSIC_FORMATS.has(input.data.format) && delivery.soundtrack?.publicId) discardedAudio.push(delivery.soundtrack.publicId);
    if (changed) { delivery.format = input.data.format; delivery.creativeDirection = undefined; delivery.curatedAssetIds = []; delivery.collectionAnalysis = undefined; delivery.narration = undefined; delivery.soundtrack = V3_MUSIC_FORMATS.has(delivery.format) ? delivery.soundtrack : undefined; delivery.status = 'draft'; invalidateApproval(delivery); saveV3(delivery, { narrationChoice: 'skip', captionNarrationChoice: 'skip' }); }
    saveV3(delivery, { step: 'upload' }); await delivery.save(); await removeAudioIds(discardedAudio); res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Prepare(req, res) {
  try {
    const delivery = await owned(req); if (!delivery || !['draft', 'review', 'analyzing'].includes(delivery.status) || (delivery.kind !== 'pinboard' && !delivery.format)) return res.status(409).json({ success: false, message: 'Choose a format first.' });
    if (delivery.kind === 'pinboard' && delivery.assets.length < 1) return res.status(409).json({ success: false, code: 'V3_PINBOARD_PHOTO_REQUIRED', message: 'Add at least one finished photograph to this GridBoard.' });
    if (delivery.kind !== 'pinboard' && delivery.assets.length < V3_FORMATS[delivery.format][0]) return res.status(409).json({ success: false, message: `Add at least ${V3_FORMATS[delivery.format][0]} photographs for this format.` });
    const existing = await DeliveryJob.findOne({ deliveryId: delivery._id, type: 'v3-prepare', status: { $in: ['queued', 'running'] } });
    if (existing) return res.status(202).json({ success: true, data: existing });
    delivery.status = 'analyzing'; saveV3(delivery, { step: 'preparing' }); await delivery.save();
    let job;
    try { job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'v3-prepare', provider: 'Alibaba Model Studio', promptVersion: 'delivery-v3', input: { revision: delivery.v3.revision } }); }
    catch (error) { delivery.status = 'draft'; saveV3(delivery, { step: delivery.kind === 'pinboard' ? 'photos' : 'upload' }); await delivery.save(); throw error; }
    res.status(202).json({ success: true, data: job });
  } catch (error) { fail(res, error); }
}

export async function v3Showcase(req, res) {
  try {
    const input = showcaseInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery) || delivery.kind === 'pinboard' || !delivery.collectionAnalysis || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Analyse the photographs first.' });
    const assetIds = new Set(delivery.assets.map(asset => asset.assetId));
    if (!validShowcase(delivery.format, input.data.assetIds, assetIds)) return res.status(400).json({ success: false, message: 'Choose the allowed number of showcase photographs from this delivery.' });
    if (input.data.frames.length !== input.data.assetIds.length || new Set(input.data.frames.map(frame => frame.assetId)).size !== input.data.frames.length || input.data.frames.some(frame => !input.data.assetIds.includes(frame.assetId))) return res.status(400).json({ success: false, message: 'Every showcase photograph needs one caption.' });
    if (!assetIds.has(input.data.openingAssetId) || !assetIds.has(input.data.closingAssetId)) return res.status(400).json({ success: false, message: 'Choose photographs from this delivery for the opening and closing.' });
    if (delivery.format === 'photo-story' && input.data.frames.some(frame => frame.caption.length > 150)) return res.status(400).json({ success: false, message: 'Photo Story captions must fit within 150 characters.' });
    const previous = delivery.creativeDirection;
    const selectedSet = new Set(input.data.assetIds);
    const sections = (previous.sections || []).map(section => ({ ...section, assetIds: (section.assetIds || []).filter(id => selectedSet.has(id)) })).filter(section => section.assetIds.length);
    const assigned = new Set(sections.flatMap(section => section.assetIds));
    if (!sections.length) sections.push({ id: 'showcase', title: 'The photographs', subtitle: '', layout: 'grid', assetIds: [] });
    sections[0].assetIds.push(...input.data.assetIds.filter(id => !assigned.has(id)));
    delivery.creativeDirection = { ...previous, title: input.data.title, openingLine: input.data.openingLine, closingLine: input.data.closingLine, frames: input.data.assetIds.map(id => ({ assetId: id, headline: input.data.frames.find(frame => frame.assetId === id).headline, caption: input.data.frames.find(frame => frame.assetId === id).caption, textAnimation: delivery.format === 'photo-story' ? 'typewriter' : 'word_fade_up' })), assetOrder: input.data.assetIds, sections };
    delivery.title = input.data.title; delivery.curatedAssetIds = input.data.assetIds; delivery.presentationOrder = input.data.assetIds;
    delivery.galleryAssetIds = delivery.assets.map(asset => asset.assetId); delivery.galleryOrder = delivery.galleryAssetIds;
    const narrationTextChanged = previous.openingLine !== input.data.openingLine || previous.closingLine !== input.data.closingLine;
    const previousCaptionOrder = (previous.frames || []).map(frame => [String(frame.assetId), String(frame.caption || '')]);
    const nextCaptionOrder = input.data.assetIds.map(assetId => {
      const frame = input.data.frames.find(item => item.assetId === assetId);
      return [String(assetId), String(frame?.caption || '')];
    });
    const captionsChanged = JSON.stringify(previousCaptionOrder) !== JSON.stringify(nextCaptionOrder);
    const discardedAudio = [];
    const remainingNarration = delivery.narration?.toObject ? delivery.narration.toObject() : { ...(delivery.narration || {}) };
    if (narrationTextChanged) {
      discardedAudio.push(remainingNarration.opening?.publicId, remainingNarration.closing?.publicId);
      delete remainingNarration.opening; delete remainingNarration.closing; delete remainingNarration.renderVersion;
    }
    if (captionsChanged) {
      discardedAudio.push(remainingNarration.captions?.publicId);
      delete remainingNarration.captions;
    }
    delivery.narration = remainingNarration.opening || remainingNarration.closing || remainingNarration.captions ? remainingNarration : undefined;
    invalidateApproval(delivery); saveV3(delivery, { openingAssetId: input.data.openingAssetId, closingAssetId: input.data.closingAssetId, step: delivery.format === 'photo-story' ? 'narration' : V3_MUSIC_FORMATS.has(delivery.format) ? 'music' : 'design', ...(narrationTextChanged ? { narrationChoice: 'skip' } : {}), ...(captionsChanged ? { captionNarrationChoice: 'skip' } : {}) });
    delivery.markModified('creativeDirection'); await delivery.save(); await removeAudioIds(discardedAudio); res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Pinboard(req, res) {
  try {
    const input = pinboardInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req);
    if (!editable(delivery) || delivery.kind !== 'pinboard' || !delivery.assets.length) return res.status(409).json({ success: false, code: 'PINBOARD_PHOTOS_REQUIRED', message: 'Add photographs before arranging this GridBoard.' });
    if (!V3_FONT_CHOICES.has(input.data.typography.display) || !V3_FONT_CHOICES.has(input.data.typography.body)) return res.status(400).json({ success: false, code: 'V3_FONT_NOT_ALLOWED', field: 'typography', message: 'Choose a display and body font from the list.' });
    const weak = [contrastRatio(input.data.palette.background, input.data.palette.text) < 4.5 ? 'background' : null, contrastRatio(input.data.palette.surface, input.data.palette.text) < 4.5 ? 'panels' : null].filter(Boolean);
    if (weak.length) return res.status(400).json({ success: false, code: 'V3_THEME_CONTRAST', field: 'palette.text', message: `Text is hard to read on the ${weak.join(' and ')}. Change the text colour.` });
    const ids = delivery.assets.map(asset => asset.assetId);
    const expected = new Set(ids);
    const layoutIds = input.data.layouts.map(layout => layout.id);
    if (new Set(layoutIds).size !== 3 || ['balanced', 'moments', 'colour-flow'].some(id => !layoutIds.includes(id))) return res.status(400).json({ success: false, code: 'PINBOARD_LAYOUTS_INVALID', message: 'Keep all three board arrangements in the preview.' });
    if (input.data.layouts.some(layout => layout.assetOrder.length !== ids.length || new Set(layout.assetOrder).size !== ids.length || layout.assetOrder.some(id => !expected.has(id)))) return res.status(400).json({ success: false, code: 'PINBOARD_PHOTO_ORDER_INVALID', message: 'Each board arrangement must include every photograph once.' });
    if (input.data.moments.some(moment => moment.assetIds.some(id => !expected.has(id)))) return res.status(400).json({ success: false, code: 'PINBOARD_MOMENT_PHOTO_INVALID', message: 'A moment group includes a photograph outside this delivery.' });
    const current = delivery.pinboard || pinboardFallback(delivery);
    const { useStandardBoard, ...settings } = input.data;
    const pinboard = { ...current, ...settings, layouts: input.data.layouts, analysisStatus: useStandardBoard ? 'standard' : current.analysisStatus || 'ready' };
    delivery.pinboard = pinboard;
    delivery.title = input.data.title;
    const activeLayout = pinboard.layouts.find(layout => layout.id === pinboard.selectedLayoutId);
    delivery.galleryAssetIds = ids;
    delivery.galleryOrder = activeLayout.assetOrder;
    delivery.presentationOrder = activeLayout.assetOrder;
    invalidateApproval(delivery); saveV3(delivery, { step: 'pinboard' });
    delivery.markModified('pinboard'); await delivery.save();
    res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Caption(req, res) {
  try {
    const input = z.object({ instruction: z.string().trim().max(400).default('') }).strict().safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery) || !delivery.collectionAnalysis) return res.status(409).json({ success: false, message: 'Analyse the photographs first.' });
    const insight = delivery.collectionAnalysis.images?.find(row => row.assetId === req.params.assetId);
    if (!insight) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    const caption = await regenerateV3Caption(delivery, insight, input.data.instruction);
    res.json({ success: true, data: caption });
  } catch (error) { fail(res, error); }
}

export async function v3Narration(req, res) {
  try {
    const input = z.object({ voiceId: z.enum(NARRATION_VOICES.map(voice => voice.id)).default(DEFAULT_NARRATION_VOICE_ID), bookends: z.boolean().default(true), captions: z.boolean().default(false) }).strict().safeParse(req.body || {});
    if (!input.success) return bad(res, input);
    // Accept the previous request shape from cached clients, but only ever
    // generate the opening and closing messages.
    input.data.bookends = true;
    input.data.captions = false;
    const delivery = await owned(req); if (!editable(delivery) || delivery.format !== 'photo-story' || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Narration is available after Photo Story captions are ready.' });
    const existing = await DeliveryJob.findOne({ deliveryId: delivery._id, type: 'v3-narrate', status: { $in: ['queued', 'running'] }, cancelRequestedAt: { $exists: false } }).select('+input');
    if (existing) {
      if ((existing.input?.voiceId || DEFAULT_NARRATION_VOICE_ID) !== input.data.voiceId) return res.status(409).json({ success: false, code: 'NARRATION_ALREADY_RUNNING', message: 'Narration is already being prepared. Wait for it to finish before changing the voice.' });
      return res.status(202).json({ success: true, data: existing });
    }
    const job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'v3-narrate', provider: 'Deepgram Flux', promptVersion: 'delivery-v3', input: { revision: delivery.v3.revision, ...input.data } });
    res.status(202).json({ success: true, data: job });
  } catch (error) { fail(res, error); }
}

export async function v3SkipNarration(req, res) {
  try {
    const delivery = await owned(req); if (!editable(delivery) || delivery.format !== 'photo-story') return res.status(409).json({ success: false, message: 'Photo Story draft not found.' });
    await DeliveryJob.updateMany({ deliveryId: delivery._id, type: 'v3-narrate', status: 'queued' }, { $set: { status: 'cancelled', cancelledAt: new Date(), completedAt: new Date() } });
    await DeliveryJob.updateMany({ deliveryId: delivery._id, type: 'v3-narrate', status: 'running' }, { $set: { cancelRequestedAt: new Date() } });
    const old = narrationAudioIds(delivery);
    delivery.narration = undefined; invalidateApproval(delivery); saveV3(delivery, { narrationChoice: 'skip', captionNarrationChoice: 'skip', step: 'music' }); await delivery.save();
    await Promise.all(old.map(id => removeDeliveryAudio(id).catch(() => {})));
    res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Theme(req, res) {
  try {
    const input = themeInput.safeParse(req.body); if (!input.success) return bad(res, input);
    if (!V3_FONT_CHOICES.has(input.data.typography.display) || !V3_FONT_CHOICES.has(input.data.typography.body)) return res.status(400).json({ success: false, code: 'V3_FONT_NOT_ALLOWED', field: 'typography', message: 'Choose a display and body font from the list.' });
    const weak = [contrastRatio(input.data.palette.background, input.data.palette.text) < 4.5 ? 'background' : null, contrastRatio(input.data.palette.surface, input.data.palette.text) < 4.5 ? 'panels' : null].filter(Boolean);
    if (weak.length) return res.status(400).json({ success: false, code: 'V3_THEME_CONTRAST', field: 'palette.text', message: `Text is hard to read on the ${weak.join(' and ')}. Change the text colour or use Fix text contrast.` });
    const delivery = await owned(req);
    if (delivery?.kind === 'pinboard') {
      if (!editable(delivery) || !delivery.pinboard) return res.status(409).json({ success: false, message: 'Analyse this GridBoard before choosing its design.' });
      delivery.pinboard = { ...delivery.pinboard, palette: input.data.palette, typography: input.data.typography };
      invalidateApproval(delivery); saveV3(delivery, { step: 'pinboard' }); delivery.markModified('pinboard'); await delivery.save();
      return res.json({ success: true, data: delivery });
    }
    if (!editable(delivery) || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Finish the showcase first.' });
    delivery.creativeDirection = { ...delivery.creativeDirection, palette: input.data.palette, typography: input.data.typography };
    invalidateApproval(delivery); saveV3(delivery, { step: 'design' }); delivery.markModified('creativeDirection'); await delivery.save();
    res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3RepickTheme(req, res) {
  try {
    const delivery = await owned(req);
    const recentPalettes = Array.isArray(delivery?.v3?.paletteHistory) ? delivery.v3.paletteHistory.slice(-12) : [];
    if (delivery?.kind === 'pinboard') {
      if (!editable(delivery) || !delivery.pinboard) return res.status(409).json({ success: false, message: 'Analyse this GridBoard before choosing a colour palette.' });
      const images = delivery.assets.map(asset => ({ assetId: asset.assetId, colors: asset.analysis?.colors || [] })).filter(image => image.colors.length);
      if (!images.length) return res.status(409).json({ success: false, code: 'V3_IMAGE_COLOURS_UNAVAILABLE', message: 'Photograph colour analysis is missing. Retry the analysis or keep the current colours.' });
      const currentPalette = delivery.pinboard.palette;
      const palette = await repickV3Palette({ format: 'pinboard', brief: delivery.brief, shootType: delivery.shootType, imageColors: images, currentPalette, recentPalettes });
      delivery.pinboard = { ...delivery.pinboard, palette }; invalidateApproval(delivery); saveV3(delivery, { step: 'pinboard', paletteHistory: [...recentPalettes, currentPalette].filter(Boolean).slice(-12) }); delivery.markModified('pinboard'); await delivery.save();
      return res.json({ success: true, data: delivery });
    }
    if (!editable(delivery) || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Finish the showcase before choosing a colour palette.' });
    const selected = new Set(delivery.curatedAssetIds || []);
    const images = (delivery.collectionAnalysis?.images || []).filter(image => selected.has(image.assetId));
    if (!images.length) return res.status(409).json({ success: false, code: 'V3_IMAGE_COLOURS_UNAVAILABLE', message: 'The photograph colour analysis is missing. Reopen the showcase step and try again.' });
    const palette = await repickV3Palette({
      format: delivery.format,
      brief: delivery.brief,
      shootType: delivery.shootType,
      imageColors: images.map(({ assetId, colors }) => ({ assetId, colors })),
      currentPalette: delivery.creativeDirection.palette,
      recentPalettes
    });
    const currentPalette = delivery.creativeDirection.palette;
    delivery.creativeDirection = { ...delivery.creativeDirection, palette };
    invalidateApproval(delivery);
    saveV3(delivery, { step: 'design', paletteHistory: [...recentPalettes, currentPalette].filter(Boolean).slice(-12) });
    delivery.markModified('creativeDirection');
    await delivery.save();
    res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Access(req, res) {
  try {
    const input = accessInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req, { pin: true }); if (!editable(delivery)) return res.status(404).json({ success: false, message: 'Draft not found.' });
    const data = input.data;
    if (data.expiresAt && new Date(data.expiresAt) <= new Date()) return res.status(400).json({ success: false, code: 'V3_EXPIRY_IN_PAST', field: 'expiresAt', message: 'Choose a future expiry date, or clear the field for a link that does not expire.' });
    Object.assign(delivery.access, { allowIndividualDownloads: data.allowIndividualDownloads, allowDownloadAll: data.allowDownloadAll, allowLikes: data.allowLikes, downloadsLocked: data.downloadsLocked, downloadLockNote: data.downloadLockNote, watermarkEnabled: data.watermarkEnabled, watermarkText: data.watermarkText, expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined });
    if (delivery.format === 'campaign') { delivery.formatConfig = { ...delivery.formatConfig, usageTerms: data.usageTerms }; delivery.markModified('formatConfig'); }
    if (data.pin !== undefined) delivery.access.pinDigest = data.pin ? await bcrypt.hash(data.pin, 12) : undefined;
    saveV3(delivery, { step: 'access' }); await delivery.save();
    void warmLockedDeliveryPreviews(delivery).catch(() => {});
    const access = delivery.access.toObject();
    delete access.pinDigest;
    res.json({ success: true, data: { access, formatConfig: delivery.formatConfig, hasPin: Boolean(delivery.access.pinDigest) } });
  } catch (error) { fail(res, error); }
}

export async function v3Approve(req, res) {
  try {
    const delivery = await owned(req);
    if (!editable(delivery) || (delivery.kind === 'pinboard' ? !delivery.pinboard?.layouts?.length : !delivery.creativeDirection)) return res.status(409).json({ success: false, message: 'Review the delivery design first.' });
    if (await DeliveryJob.exists({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] }, cancelRequestedAt: { $exists: false } })) return res.status(409).json({ success: false, message: 'Wait for the current step to finish.' });
    const ids = new Set(delivery.assets.map(asset => asset.assetId));
    if (delivery.kind === 'pinboard') {
      const order = delivery.pinboard.layouts.find(layout => layout.id === delivery.pinboard.selectedLayoutId)?.assetOrder || [];
      if (!delivery.assets.length || order.length !== ids.size || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) return res.status(409).json({ success: false, code: 'PINBOARD_PHOTO_ORDER_INVALID', message: 'This board no longer includes every finished photograph. Save the board arrangement again.' });
    } else {
      if (!validShowcase(delivery.format, delivery.curatedAssetIds, ids)) return res.status(409).json({ success: false, message: 'Review the showcase photo count.' });
      if (V3_MUSIC_FORMATS.has(delivery.format) && !delivery.soundtrack) return res.status(409).json({ success: false, message: 'Choose music for this format.' });
      if (delivery.format === 'photo-story' && !narrationSelectionsReady(delivery)) return res.status(409).json({ success: false, message: 'Generate the selected Photo Story voice before approving it.' });
    }
    delivery.reviewApprovedAt = new Date(); saveV3(delivery, { approvedRevision: delivery.v3.revision, step: 'access' }); await delivery.save();
    res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Publish(req, res) {
  let reservation;
  try {
    const delivery = await owned(req, { pin: true });
    // A successful publish may have lost its response on a mobile connection.
    // Returning the existing private link must not reserve another monthly slot.
    if (delivery?.status === 'published') return res.json({ success: true, data: { publicId: delivery.publicId, url: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${delivery.publicId}` } });
    if (!editable(delivery) || !delivery.reviewApprovedAt || delivery.v3?.approvedRevision !== delivery.v3?.revision) return res.status(409).json({ success: false, message: 'Preview and approve this delivery before publishing.' });
    if (delivery.access?.expiresAt && new Date(delivery.access.expiresAt) <= new Date()) return res.status(400).json({ success: false, code: 'V3_EXPIRY_IN_PAST', field: 'expiresAt', message: 'This link expiry has already passed. Choose a future date in access settings, or clear it before publishing.' });
    if (await DeliveryJob.exists({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] }, cancelRequestedAt: { $exists: false } })) return res.status(409).json({ success: false, message: 'Wait for the current step to finish.' });
    const ids = new Set(delivery.assets.map(asset => asset.assetId));
    if (delivery.kind === 'pinboard') {
      const order = delivery.pinboard?.layouts?.find(layout => layout.id === delivery.pinboard.selectedLayoutId)?.assetOrder || [];
      if (!delivery.assets.length || order.length !== ids.size || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) return res.status(409).json({ success: false, code: 'PINBOARD_PHOTO_ORDER_INVALID', message: 'The board photo order changed. Preview it again before publishing.' });
    } else {
      if (!validShowcase(delivery.format, delivery.curatedAssetIds, ids)) return res.status(409).json({ success: false, message: 'The showcase photo count has changed.' });
      if (V3_MUSIC_FORMATS.has(delivery.format) && !delivery.soundtrack) return res.status(409).json({ success: false, message: 'Choose music first.' });
      if (delivery.format === 'photo-story' && !narrationSelectionsReady(delivery)) return res.status(409).json({ success: false, message: 'The selected Photo Story voice is not ready.' });
    }
    reservation = await reservePublishSlot(await User.findById(req.user.id), delivery.assets.length);
    const published = await Delivery.findOneAndUpdate(
      { _id: delivery._id, userId: req.user.id, schemaVersion: 3, status: { $in: ['draft', 'review'] }, reviewApprovedAt: { $ne: null }, 'v3.approvedRevision': delivery.v3.revision, 'v3.revision': delivery.v3.revision },
      { $set: { status: 'published', publishedAt: new Date(), 'v3.step': 'published' } },
      { new: true }
    );
    if (!published) { const error = new Error('This delivery changed. Preview it again before publishing.'); error.status = 409; throw error; }
    void warmLockedDeliveryPreviews(published).catch(() => {});
    res.json({ success: true, data: { publicId: delivery.publicId, url: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${delivery.publicId}`, entitlements: reservation.entitlements } });
  } catch (error) { await reservation?.release().catch(() => {}); fail(res, error); }
}
