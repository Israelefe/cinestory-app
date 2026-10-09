import { recordPaidUsage } from '../services/paidUsage.service.js';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import User from '../models/User.js';
import { contrastRatio, V3_FONT_CHOICES, V3_FORMATS, V3_MUSIC_FORMATS, validShowcase } from '../constants/deliveryV3.js';
import { improvePurpose, recommendV3Format, regenerateV3Caption, regenerateV3EditorialBlock, reviewV3WritingBlocks, repickV3Palette } from '../services/deliveryV3AI.service.js';
import { writingOverridesSchema, writingBlocksSchema, validWritingBlock } from '../constants/deliveryWritingBlocks.js';
import { editorialSchema, editorialFrameFields, validEditorialOrder, editorialExcerptMatches, reconcileSavedEditorial } from '../constants/editorial.js';
import { reservePublishSlot, resolveEntitlements } from '../services/entitlement.service.js';
import { removeDeliveryAudio } from '../services/deliveryMedia.service.js';
import { NARRATION_BOOKEND_RENDER_VERSION } from '../services/narration.service.js';
import { NARRATION_VOICES, DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';
import { cleanDeliveryAccess } from '../utils/deliveryAccess.js';
import { revealSchema } from '../constants/photoReveal.js';
import { presentationSchema, sectionWritingSchema, presentationIssues, sectionIssues, PRESENTATION_KEYS } from '../constants/deliveryPresentation.js';
import { photoCaptionLimit } from '../constants/deliveryWritingLimits.js';
import { canvasSettings } from '../constants/canvas.js';

const details = z.object({ kind: z.enum(['showcase', 'pinboard', 'photoswap']).default('showcase'), clientName: z.string().trim().min(2).max(100), shootType: z.string().trim().max(80).default(''), purpose: z.string().trim().max(3000).default(''), title: z.string().trim().max(120).default(''), originalPurpose: z.string().trim().max(3000).default(''), clarificationAnswers: z.array(z.object({ question: z.string().trim().max(180), answer: z.string().trim().min(1).max(300) }).strict()).max(3).default([]) }).strict();
const formatInput = z.object({ format: z.enum(Object.keys(V3_FORMATS)) }).strict();
const idList = z.array(z.string().uuid()).max(24);
const showcaseInput = z.object({ assetIds: idList, frames: z.array(z.object({ assetId: z.string().uuid(), headline: z.string().trim().max(70).default(''), caption: z.string().trim().min(5).max(320), imageFit: editorialFrameFields.imageFit.unwrap().optional(), focalPoint: editorialFrameFields.focalPoint.unwrap().optional() }).strict()).max(24), title: z.string().trim().min(2).max(80), openingLine: z.string().trim().min(5).max(300), closingLine: z.string().trim().min(5).max(280), openingAssetId: z.string().uuid(), closingAssetId: z.string().uuid(), editorial: editorialSchema.optional(), writingOverrides: writingOverridesSchema.optional(), sectionWriting: sectionWritingSchema.optional(), presentation: presentationSchema.optional() }).strict();
const themeInput = z.object({ palette: z.object({ background: z.string().regex(/^#[0-9a-f]{6}$/i), surface: z.string().regex(/^#[0-9a-f]{6}$/i), text: z.string().regex(/^#[0-9a-f]{6}$/i), accent: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(), typography: z.object({ display: z.string(), body: z.string() }).strict(), reveal: revealSchema.optional(), presentation: presentationSchema.optional(), usageTerms: z.string().trim().max(1000).optional() }).strict();
const pinboardInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(240).optional(),
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
const accessInput = z.preprocess(cleanDeliveryAccess, z.object({ pin: z.string().regex(/^\d{6}$/).optional().or(z.literal('')), expiresAt: z.string().datetime().optional().or(z.literal('')), allowIndividualDownloads: z.boolean(), allowDownloadAll: z.boolean(), allowLikes: z.boolean(), usageTerms: z.string().trim().max(1000).default('') }).strict());

function bad(res, parsed) {
  const issue = parsed.error.issues[0];
  const field = issue?.path?.join('.') || '';
  const labels = { clientName: 'client name', shootType: 'shoot type', purpose: 'purpose of the shoot', title: 'delivery title', openingLine: 'opening message', closingLine: 'closing message', pin: 'PIN', expiresAt: 'expiry date', voiceId: 'narration voice', 'palette.background': 'background colour', 'palette.surface': 'panels colour', 'palette.text': 'text colour', 'palette.accent': 'accent colour' };
  const label = /^frames\.\d+\.caption$/.test(field) ? `caption for photo ${Number(field.split('.')[1]) + 1}` : labels[field] || field.replaceAll('.', ' ') || 'this field';
  const isText = issue?.origin === 'string' || typeof issue?.input === 'string' || /^(clientName|shootType|purpose|title|openingLine|closingLine|pin|usageTerms)$/.test(field) || /^frames\.\d+\.caption$/.test(field);
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
    const data = mode === 'improve' ? { improved: await improvePurpose({ purpose }), sourcePurpose: purpose, meaningPreserved: true } : mode === 'clarify' ? { clear: true, questions: [] } : await recommendV3Format(shootType, purpose);
    res.json({ success: true, data });
  } catch (error) { fail(res, error); }
}

export async function v3Create(req, res) {
  try {
    const input = details.safeParse(req.body); if (!input.success) return bad(res, input);
    if (input.data.kind === 'showcase' && (input.data.shootType.length < 2 || !input.data.purpose)) return res.status(400).json({ success: false, code: 'V3_SHOWCASE_DETAILS_REQUIRED', message: 'Add the shoot type and purpose before creating a Showcase delivery.' });
    if (input.data.kind === 'pinboard' && input.data.title.length < 2) return res.status(400).json({ success: false, code: 'V3_PINBOARD_TITLE_REQUIRED', message: 'Give this GridBoard a title before adding photographs.' });
    if (input.data.kind === 'photoswap' && input.data.title.length < 2) return res.status(400).json({ success: false, code: 'V3_PHOTOSWAP_TITLE_REQUIRED', message: 'Give this Photo Swap a title before adding photographs.' });
    const entitlements = await resolveEntitlements(await User.findById(req.user.id));
    if (entitlements.plan === 'free' && entitlements.usage.deliveriesRemaining === 0) return res.status(403).json({ success: false, code: 'MONTHLY_DELIVERY_LIMIT_REACHED', message: `You have published all ${entitlements.limits.deliveriesPerMonth} Free deliveries this month. Start another next month or move to Pro.` });
    const count = await Delivery.countDocuments({ userId: req.user.id, status: { $in: ['draft', 'analyzing', 'directing', 'review'] } });
    if (count >= 20) return res.status(409).json({ success: false, message: 'Finish or remove an existing draft before starting another one.' });
    const briefFallback = input.data.kind === 'pinboard' ? 'GridBoard delivery' : input.data.kind === 'photoswap' ? 'Photo Swap delivery' : '';
    const delivery = await Delivery.create({ userId: req.user.id, schemaVersion: 3, kind: input.data.kind, clientName: input.data.clientName, title: input.data.title || '', shootType: input.data.shootType, brief: input.data.purpose || briefFallback, v3: { step: ['pinboard', 'photoswap'].includes(input.data.kind) ? 'photos' : 'format', revision: 1, originalPurpose: input.data.originalPurpose, clarificationAnswers: input.data.clarificationAnswers, narrationChoice: 'skip', captionNarrationChoice: 'skip', approvedRevision: null } });
    res.status(201).json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Details(req, res) {
  try {
    const input = details.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery)) return res.status(404).json({ success: false, message: 'Draft not found.' });
    if (delivery.kind !== input.data.kind) return res.status(409).json({ success: false, code: 'V3_DELIVERY_KIND_LOCKED', message: 'The delivery type cannot be changed after its draft is created.' });
    if (delivery.kind === 'showcase' && (input.data.shootType.length < 2 || !input.data.purpose)) return res.status(400).json({ success: false, code: 'V3_SHOWCASE_DETAILS_REQUIRED', message: 'Add the shoot type and purpose before continuing.' });
    if (delivery.kind === 'photoswap' && (input.data.shootType.length < 2 || !input.data.purpose)) return res.status(400).json({ success: false, code: 'V3_PHOTOSWAP_DETAILS_REQUIRED', message: 'Add the shoot type and purpose so the photo captions have the right context.' });
    const purpose = input.data.purpose || (delivery.kind === 'pinboard' ? 'GridBoard delivery' : delivery.kind === 'photoswap' ? 'Photo Swap delivery' : '');
    const titleChanged = ['pinboard', 'photoswap'].includes(delivery.kind) && Boolean(input.data.title) && delivery.title !== input.data.title;
    const changed = delivery.clientName !== input.data.clientName || delivery.shootType !== input.data.shootType || delivery.brief !== purpose || JSON.stringify(delivery.v3?.clarificationAnswers || []) !== JSON.stringify(input.data.clarificationAnswers);
    const discardedAudio = changed ? narrationAudioIds(delivery) : [];
    delivery.clientName = input.data.clientName; delivery.shootType = input.data.shootType; delivery.brief = purpose; if (input.data.title) delivery.title = input.data.title;
    if (titleChanged) { if (delivery.kind === 'pinboard') { delivery.pinboard = { ...delivery.pinboard, title: input.data.title }; delivery.markModified('pinboard'); } if (!changed) invalidateApproval(delivery); }
    if (changed) { delivery.collectionAnalysis = undefined; delivery.creativeDirection = undefined; delivery.curatedAssetIds = []; delivery.narration = undefined; if (delivery.kind === 'photoswap') { delivery.assets.forEach(asset => { asset.caption = ''; }); delivery.markModified('assets'); } if (delivery.kind === 'pinboard') delivery.pinboard = { ...delivery.pinboard, layouts: [], moments: [], analysisStatus: 'pending' }; delivery.status = 'draft'; invalidateApproval(delivery); saveV3(delivery, { narrationChoice: 'skip', captionNarrationChoice: 'skip' }); }
    saveV3(delivery, { originalPurpose: input.data.originalPurpose, clarificationAnswers: input.data.clarificationAnswers, step: ['pinboard', 'photoswap'].includes(delivery.kind) ? 'photos' : 'format' });
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
    const delivery = await owned(req); if (!delivery || !['draft', 'review', 'analyzing'].includes(delivery.status) || (!['pinboard', 'photoswap'].includes(delivery.kind) && !delivery.format)) return res.status(409).json({ success: false, message: 'Choose a format first.' });
    if (delivery.kind === 'pinboard' && delivery.assets.length < 1) return res.status(409).json({ success: false, code: 'V3_PINBOARD_PHOTO_REQUIRED', message: 'Add at least one finished photograph to this GridBoard.' });
    if (delivery.kind === 'photoswap' && delivery.assets.length < 1) return res.status(409).json({ success: false, code: 'V3_PHOTOSWAP_PHOTO_REQUIRED', message: 'Add at least one finished photograph to this Photo Swap.' });
    if (!['pinboard', 'photoswap'].includes(delivery.kind) && delivery.assets.length < V3_FORMATS[delivery.format][0]) return res.status(409).json({ success: false, message: `Add at least ${V3_FORMATS[delivery.format][0]} photographs for this format.` });
    const existing = await DeliveryJob.findOne({ deliveryId: delivery._id, type: 'v3-prepare', status: { $in: ['queued', 'running'] } });
    if (existing) return res.status(202).json({ success: true, data: existing });
    const previous = await DeliveryJob.findOne({ deliveryId: delivery._id, userId: req.user.id, type: 'v3-prepare', status: 'failed', 'input.revision': delivery.v3.revision }).sort({ createdAt: -1 }).select('result');
    delivery.status = 'analyzing'; saveV3(delivery, { step: 'preparing' }); await delivery.save();
    let job;
    try { job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'v3-prepare', provider: 'Groq AI / Alibaba Model Studio fallback', promptVersion: 'delivery-v3', input: { revision: delivery.v3.revision }, result: previous?.result }); }
    catch (error) { delivery.status = 'draft'; saveV3(delivery, { step: delivery.kind === 'pinboard' ? 'photos' : 'upload' }); await delivery.save(); throw error; }
    res.status(202).json({ success: true, data: job });
  } catch (error) { fail(res, error); }
}

export async function v3Showcase(req, res) {
  try {
    const input = showcaseInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery) || delivery.kind === 'pinboard' || !delivery.collectionAnalysis || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Analyse the photographs first.' });
    const assetIds = new Set(delivery.assets.map(asset => asset.assetId));
    if (delivery.format !== 'editorial' && (input.data.editorial || input.data.openingLine.length > 140 || input.data.closingLine.length > 160 || input.data.frames.some(frame => frame.caption.length > Math.max(180, photoCaptionLimit(delivery.format)) || frame.imageFit || frame.focalPoint))) return res.status(400).json({ success: false, message: 'Keep the text and design choices within the limits for this format.' });
    if (input.data.editorial && (!validEditorialOrder(input.data.editorial, input.data.assetIds) || new Set(input.data.editorial.sections.map(section => section.id)).size !== input.data.editorial.sections.length)) return res.status(400).json({ success: false, message: 'Keep each showcase photograph in one section, in the selected order.' });
    if (input.data.editorial?.sections.some(section => !editorialExcerptMatches(section, input.data.frames))) return res.status(400).json({ success: false, message: 'Choose a pull line from the section text or one of its captions.' });
    if (!validShowcase(delivery.format, input.data.assetIds, assetIds)) return res.status(400).json({ success: false, message: 'Choose the allowed number of showcase photographs from this delivery.' });
    if (input.data.frames.length !== input.data.assetIds.length || new Set(input.data.frames.map(frame => frame.assetId)).size !== input.data.frames.length || input.data.frames.some(frame => !input.data.assetIds.includes(frame.assetId))) return res.status(400).json({ success: false, message: 'Every showcase photograph needs one caption.' });
    if (!assetIds.has(input.data.openingAssetId) || !assetIds.has(input.data.closingAssetId)) return res.status(400).json({ success: false, message: 'Choose photographs from this delivery for the opening and closing.' });
    if (delivery.format === 'photo-story' && input.data.frames.some(frame => frame.caption.length > 150)) return res.status(400).json({ success: false, message: 'Photo Story captions must fit within 150 characters.' });
    const previous = delivery.creativeDirection;
    const legacyCanvasStill = delivery.format === 'canvas' && !delivery.formatConfig?.canvas?.photoMotion;
    const canvasPoints = delivery.format === 'canvas' ? input.data.presentation?.checkpoints : undefined;
    const structureError = sectionIssues(input.data.sectionWriting, delivery.format, input.data.assetIds, canvasPoints);
    if (structureError) return res.status(400).json({ success: false, message: structureError });
    if (input.data.presentation) { const problem = presentationIssues(input.data.presentation, delivery.format, input.data.assetIds, input.data.sectionWriting || previous.sections || []); if (problem) return res.status(400).json({ success: false, message: problem }); }
    if (input.data.sectionWriting && (delivery.format === 'editorial' || new Set(input.data.sectionWriting.map(section => section.id)).size !== input.data.sectionWriting.length || !['canvas', 'chapters', 'event-coverage', 'campaign'].includes(delivery.format) && input.data.sectionWriting.some(section => !previous.sections?.some(saved => saved.id === section.id)))) return res.status(400).json({ success: false, message: 'Edit headings only for sections in this delivery.' });
    const groupedWriting = input.data.sectionWriting?.some(section => section.assetIds);
    if (groupedWriting && !canvasPoints) {
      const groupedIds = input.data.sectionWriting.flatMap(section => section.assetIds || []);
      if (input.data.sectionWriting.some(section => !section.assetIds) || groupedIds.length !== input.data.assetIds.length || new Set(groupedIds).size !== groupedIds.length || groupedIds.some(id => !input.data.assetIds.includes(id))) return res.status(400).json({ success: false, message: 'Keep each selected photograph in one section.' });
    }
    const selectedSet = new Set(input.data.assetIds);
    const sections = (previous.sections || []).map(section => ({ ...section, assetIds: (section.assetIds || []).filter(id => selectedSet.has(id)) })).filter(section => section.assetIds.length);
    const assigned = new Set(sections.flatMap(section => section.assetIds));
    if (delivery.format !== 'canvas') {
      if (!sections.length) sections.push({ id: 'showcase', title: 'The photographs', subtitle: '', layout: 'grid', assetIds: [] });
      sections[0].assetIds.push(...input.data.assetIds.filter(id => !assigned.has(id)));
    }
    if (groupedWriting || canvasPoints) sections.splice(0, sections.length, ...(input.data.sectionWriting || previous.sections || []).map(writing => ({ ...(previous.sections || []).find(section => section.id === writing.id), ...writing })));
    for (const section of sections) { const writing = input.data.sectionWriting?.find(item => item.id === section.id); if (writing) { section.title = writing.title; section.subtitle = writing.subtitle; if (writing.body !== undefined) section.body = writing.body; if (writing.layout) section.layout = writing.layout; if (writing.coverAssetId) section.coverAssetId = writing.coverAssetId; } }
    if (input.data.presentation) {
      const { format, ...settings } = input.data.presentation;
      delivery.formatConfig = { ...delivery.formatConfig, [PRESENTATION_KEYS[format]]: settings };
      delivery.markModified('formatConfig');
    }
    if (delivery.format === 'canvas' && !input.data.presentation?.checkpoints) {
      delivery.formatConfig = { ...delivery.formatConfig, canvas: canvasSettings({ formatConfig: delivery.formatConfig, curatedAssetIds: input.data.assetIds, creativeDirection: { ...previous, sections } }) };
      delivery.markModified('formatConfig');
    }
    const editorial = delivery.format === 'editorial' ? input.data.editorial || reconcileSavedEditorial(previous.editorial, input.data.assetIds, input.data.frames) : undefined;
    if (input.data.writingOverrides) previous.writingOverrides = input.data.writingOverrides;
    delivery.creativeDirection = { ...previous, title: input.data.title, openingLine: input.data.openingLine, closingLine: input.data.closingLine, frames: input.data.assetIds.map((id, index) => { const frame = input.data.frames.find(frame => frame.assetId === id), savedFrame = previous.frames?.find(item => item.assetId === id); const canvasMotion = savedFrame?.motion && !(legacyCanvasStill && savedFrame.motion === 'still') ? savedFrame.motion : ['slow-push', 'pan-left', 'slow-pull', 'pan-right', 'float'][index % 5]; return { assetId: id, headline: frame.headline, caption: frame.caption, textAnimation: delivery.format === 'photo-story' ? 'typewriter' : 'word_fade_up', ...(delivery.format === 'canvas' ? { focalPoint: savedFrame?.focalPoint || '50% 50%', motion: canvasMotion } : {}), ...(delivery.format === 'editorial' ? { imageFit: frame.imageFit || savedFrame?.imageFit || 'contain', focalPoint: frame.focalPoint || savedFrame?.focalPoint || '50% 50%' } : {}) }; }), assetOrder: input.data.assetIds, sections: editorial?.sections || sections, ...(editorial ? { editorial } : {}) };
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

const photoswapInput = z.object({
  backgroundMode: z.enum(['auto', 'dark']).optional(),
  typography: z.object({ display: z.string(), body: z.string() }).strict().optional(),
  assetOrder: z.array(z.string().uuid()).max(500).optional(),
  captions: z.array(z.object({ assetId: z.string().uuid(), caption: z.string().trim().min(5).max(180) }).strict()).max(500).optional()
}).strict().refine(input => Boolean(input.backgroundMode || input.typography || input.assetOrder || input.captions), { message: 'Choose a Photo Swap setting to save.' });

export async function v3Photoswap(req, res) {
  try {
    const input = photoswapInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req);
    if (!editable(delivery) || delivery.kind !== 'photoswap' || !delivery.assets.length) return res.status(409).json({ success: false, code: 'PHOTOSWAP_PHOTOS_REQUIRED', message: 'Add photographs before styling this Photo Swap.' });
    if (input.data.typography && (!V3_FONT_CHOICES.has(input.data.typography.display) || !V3_FONT_CHOICES.has(input.data.typography.body))) return res.status(400).json({ success: false, code: 'V3_FONT_NOT_ALLOWED', field: 'typography', message: 'Choose a display and body font from the list.' });
    const existingIds = [...delivery.assets].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).map(asset => asset.assetId);
    const ids = input.data.assetOrder || existingIds;
    if (ids.length !== existingIds.length || new Set(ids).size !== existingIds.length || ids.some(id => !existingIds.includes(id))) return res.status(400).json({ success: false, code: 'PHOTOSWAP_ORDER_INVALID', field: 'assetOrder', message: 'Keep every photograph in the delivery order, once each.' });
    const positions = new Map(ids.map((id, index) => [id, index]));
    if (input.data.captions) {
      const captionIds = input.data.captions.map(item => item.assetId);
      if (captionIds.length !== existingIds.length || new Set(captionIds).size !== existingIds.length || captionIds.some(id => !existingIds.includes(id))) return res.status(400).json({ success: false, code: 'PHOTOSWAP_CAPTIONS_INVALID', message: 'Add one caption for each photograph in this Photo Swap.' });
      const captionsById = new Map(input.data.captions.map(item => [item.assetId, item.caption]));
      delivery.assets.forEach(asset => { asset.caption = captionsById.get(asset.assetId); });
    }
    delivery.assets.forEach(asset => { asset.sortOrder = positions.get(asset.assetId); });
    delivery.photoswap = {
      ...delivery.photoswap,
      ...(input.data.backgroundMode ? { backgroundMode: input.data.backgroundMode } : {}),
      ...(input.data.typography ? { typography: input.data.typography } : {})
    };
    delivery.galleryAssetIds = ids;
    delivery.galleryOrder = ids;
    delivery.presentationOrder = ids;
    delivery.markModified('assets');
    invalidateApproval(delivery); saveV3(delivery, { step: 'photoswap' });
    delivery.markModified('photoswap'); await delivery.save();
    res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Caption(req, res) {
  try {
    const input = z.object({ instruction: z.string().trim().max(400).default(''), previous: z.object({ headline: z.string().trim().max(70), caption: z.string().trim().max(320) }).strict().optional(), editorialBlock: z.enum(['summary', 'introduction', 'section', 'closing']).optional(), sectionAssetIds: idList.optional(), previousText: z.string().trim().max(700).optional(), writingBlocks: writingBlocksSchema.optional() }).strict().safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery) || !delivery.collectionAnalysis) return res.status(409).json({ success: false, message: 'Analyse the photographs first.' });
    if (delivery.format !== 'editorial' && (input.data.editorialBlock || input.data.sectionAssetIds || input.data.previousText !== undefined || (input.data.previous?.caption.length || 0) > Math.max(180, photoCaptionLimit(delivery.kind === 'photoswap' ? 'photoswap' : delivery.format)))) return res.status(400).json({ success: false, message: 'Use the caption limits for this format.' });
    const insight = delivery.collectionAnalysis.images?.find(row => row.assetId === req.params.assetId);
    if (!insight || !delivery.assets.some(asset => asset.assetId === req.params.assetId)) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    if (input.data.writingBlocks) {
      if (input.data.editorialBlock || input.data.sectionAssetIds || input.data.previousText !== undefined || input.data.previous) return res.status(400).json({ success: false, message: 'Request one wording review at a time.' });
      const blocks = input.data.writingBlocks;
      const images = new Set((delivery.collectionAnalysis.images || []).map(row => row.assetId));
      const assets = new Set(delivery.assets.map(asset => asset.assetId));
      if (new Set(blocks.map(block => block.key)).size !== blocks.length || blocks.some(block => !validWritingBlock(block, delivery.format) || new Set(block.assetIds).size !== block.assetIds.length || block.assetIds.some(id => !assets.has(id) || !images.has(id)))) return res.status(400).json({ success: false, message: 'Review wording only for photographs in this delivery, within this format’s limits.' });
      return res.json({ success: true, data: await reviewV3WritingBlocks(delivery, blocks) });
    }
    if (input.data.editorialBlock) {
      const ids = input.data.sectionAssetIds || [insight.assetId];
      const images = delivery.collectionAnalysis.images || [];
      if (!ids.length || ids.length > 14 || new Set(ids).size !== ids.length || ids.some(id => !delivery.assets.some(asset => asset.assetId === id) || !images.some(row => row.assetId === id))) return res.status(400).json({ success: false, message: 'Choose photographs from this delivery for the section.' });
      const result = await regenerateV3EditorialBlock(delivery, ids.map(id => images.find(row => row.assetId === id)), input.data.editorialBlock, input.data.previousText || '', input.data.instruction);
      return res.json({ success: true, data: result });
    }
    const caption = await regenerateV3Caption(delivery, insight, input.data.instruction, input.data.previous);
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
    if (input.data.reveal && delivery?.format !== 'photo-reveal') return res.status(400).json({ success: false, message: 'Reveal settings are only available for Photo Reveal.' });
    if (input.data.presentation && input.data.presentation.format !== delivery?.format) return res.status(400).json({ success: false, message: 'These presentation settings belong to another format.' });
    if (input.data.usageTerms !== undefined && delivery?.format !== 'campaign') return res.status(400).json({ success: false, message: 'Usage terms belong to Campaign Delivery.' });
    if (delivery?.kind === 'pinboard') {
      if (!editable(delivery) || !delivery.pinboard) return res.status(409).json({ success: false, message: 'Analyse this GridBoard before choosing its design.' });
      delivery.pinboard = { ...delivery.pinboard, palette: input.data.palette, typography: input.data.typography };
      invalidateApproval(delivery); saveV3(delivery, { step: 'pinboard' }); delivery.markModified('pinboard'); await delivery.save();
      return res.json({ success: true, data: delivery });
    }
    if (!editable(delivery) || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Finish the showcase first.' });
    if (input.data.presentation) { const problem = presentationIssues(input.data.presentation, delivery.format, delivery.curatedAssetIds || [], delivery.creativeDirection?.sections || []); if (problem) return res.status(400).json({ success: false, message: problem }); const { format, ...settings } = input.data.presentation; delivery.formatConfig = { ...delivery.formatConfig, [PRESENTATION_KEYS[format]]: settings }; delivery.markModified('formatConfig'); }
    if (input.data.usageTerms !== undefined) { if (delivery.format !== 'campaign') return res.status(400).json({ success: false, message: 'Usage terms belong to Campaign Delivery.' }); delivery.formatConfig = { ...delivery.formatConfig, usageTerms: input.data.usageTerms }; delivery.markModified('formatConfig'); }
    delivery.creativeDirection = { ...delivery.creativeDirection, palette: input.data.palette, typography: input.data.typography, ...(input.data.reveal ? { reveal: input.data.reveal } : {}) };
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
    Object.assign(delivery.access, { allowIndividualDownloads: data.allowIndividualDownloads, allowDownloadAll: data.allowDownloadAll, allowLikes: data.allowLikes, expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined });
    if (delivery.format === 'campaign') { delivery.formatConfig = { ...delivery.formatConfig, usageTerms: data.usageTerms }; delivery.markModified('formatConfig'); }
    if (data.pin !== undefined) delivery.access.pinDigest = data.pin ? await bcrypt.hash(data.pin, 12) : undefined;
    saveV3(delivery, { step: 'access' }); await delivery.save();
    const access = delivery.access.toObject();
    delete access.pinDigest;
    res.json({ success: true, data: { access, formatConfig: delivery.formatConfig, hasPin: Boolean(delivery.access.pinDigest) } });
  } catch (error) { fail(res, error); }
}

export async function v3Approve(req, res) {
  try {
    const delivery = await owned(req);
    if (!editable(delivery) || (delivery.kind === 'pinboard' ? !delivery.pinboard?.layouts?.length : delivery.kind === 'photoswap' ? !delivery.assets?.length : !delivery.creativeDirection)) return res.status(409).json({ success: false, message: 'Review the delivery design first.' });
    if (await DeliveryJob.exists({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] }, cancelRequestedAt: { $exists: false } })) return res.status(409).json({ success: false, message: 'Wait for the current step to finish.' });
    const ids = new Set(delivery.assets.map(asset => asset.assetId));
    if (delivery.kind === 'pinboard') {
      const order = delivery.pinboard.layouts.find(layout => layout.id === delivery.pinboard.selectedLayoutId)?.assetOrder || [];
      if (!delivery.assets.length || order.length !== ids.size || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) return res.status(409).json({ success: false, code: 'PINBOARD_PHOTO_ORDER_INVALID', message: 'This board no longer includes every finished photograph. Save the board arrangement again.' });
    } else if (delivery.kind === 'photoswap') {
      if (!delivery.assets.length) return res.status(409).json({ success: false, message: 'Add photographs before approving this Photo Swap.' });
      if (delivery.assets.some(asset => String(asset.caption || '').trim().length < 5)) return res.status(409).json({ success: false, code: 'PHOTOSWAP_CAPTIONS_REQUIRED', message: 'Generate and review a caption for each photograph before approving this Photo Swap.' });
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
    } else if (delivery.kind === 'photoswap') {
      if (!delivery.assets.length) return res.status(409).json({ success: false, message: 'Add photographs to publish this Photo Swap.' });
      if (delivery.assets.some(asset => String(asset.caption || '').trim().length < 5)) return res.status(409).json({ success: false, code: 'PHOTOSWAP_CAPTIONS_REQUIRED', message: 'Review a caption for each Photo Swap photograph before publishing.' });
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
    if (reservation.entitlements.plan === 'pro') await recordPaidUsage(req.user.id, 'delivery', delivery._id);
    res.json({ success: true, data: { publicId: delivery.publicId, url: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${delivery.publicId}`, entitlements: reservation.entitlements } });
  } catch (error) { await reservation?.release().catch(() => {}); fail(res, error); }
}
