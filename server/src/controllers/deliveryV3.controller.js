import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import User from '../models/User.js';
import { contrastRatio, V3_FONT_CHOICES, V3_FORMATS, V3_MUSIC_FORMATS, validShowcase } from '../constants/deliveryV3.js';
import { clarifyPurpose, improvePurpose, recommendV3Format, regenerateV3Caption } from '../services/deliveryV3AI.service.js';
import { reservePublishSlot, resolveEntitlements } from '../services/entitlement.service.js';
import { removeDeliveryAudio } from '../services/deliveryMedia.service.js';

const details = z.object({ clientName: z.string().trim().min(2).max(100), shootType: z.string().trim().min(2).max(80), purpose: z.string().trim().min(8).max(3000), originalPurpose: z.string().trim().max(3000).default(''), clarificationAnswers: z.array(z.object({ question: z.string().trim().max(180), answer: z.string().trim().min(1).max(300) }).strict()).max(3).default([]) }).strict();
const formatInput = z.object({ format: z.enum(Object.keys(V3_FORMATS)) }).strict();
const idList = z.array(z.string().uuid()).max(24);
const showcaseInput = z.object({ assetIds: idList, frames: z.array(z.object({ assetId: z.string().uuid(), caption: z.string().trim().min(5).max(180) }).strict()).max(24), title: z.string().trim().min(2).max(80), openingLine: z.string().trim().min(5).max(140), closingLine: z.string().trim().min(5).max(160), openingAssetId: z.string().uuid(), closingAssetId: z.string().uuid() }).strict();
const themeInput = z.object({ palette: z.object({ background: z.string().regex(/^#[0-9a-f]{6}$/i), surface: z.string().regex(/^#[0-9a-f]{6}$/i), text: z.string().regex(/^#[0-9a-f]{6}$/i), accent: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(), typography: z.object({ display: z.string(), body: z.string() }).strict() }).strict();
const accessInput = z.object({ pin: z.string().regex(/^\d{6}$/).optional().or(z.literal('')), expiresAt: z.string().datetime().optional().or(z.literal('')), allowIndividualDownloads: z.boolean(), allowDownloadAll: z.boolean(), allowLikes: z.boolean(), downloadsLocked: z.boolean(), downloadLockNote: z.string().trim().max(200), watermarkEnabled: z.boolean(), watermarkText: z.string().trim().max(40), usageTerms: z.string().trim().max(1000).default('') }).strict();

function bad(res, parsed) {
  const issue = parsed.error.issues[0];
  const field = issue?.path?.join('.') || '';
  const labels = { clientName: 'client name', shootType: 'shoot type', purpose: 'purpose of the shoot', title: 'delivery title', openingLine: 'opening message', closingLine: 'closing message', pin: 'PIN', expiresAt: 'expiry date', 'palette.background': 'background colour', 'palette.surface': 'panels colour', 'palette.text': 'text colour', 'palette.accent': 'accent colour' };
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
function narrationAudioIds(delivery) { return [delivery.narration?.opening?.publicId, delivery.narration?.closing?.publicId].filter(Boolean); }
async function removeAudioIds(ids) { await Promise.all(ids.map(id => removeDeliveryAudio(id).catch(() => {}))); }

export async function v3Assist(req, res) {
  try {
    const input = z.object({ mode: z.enum(['improve', 'clarify', 'recommend']), purpose: z.string().trim().max(3000).default(''), shootType: z.string().trim().min(2).max(80) }).strict().safeParse(req.body);
    if (!input.success) return bad(res, input);
    const { mode, purpose, shootType } = input.data;
    if (mode !== 'recommend' && purpose.length < 8) return res.status(400).json({ success: false, message: 'Tell us a little more about why these photographs were taken.' });
    const data = mode === 'improve' ? { improved: await improvePurpose({ purpose, shootType }) } : mode === 'clarify' ? await clarifyPurpose({ purpose, shootType }) : await recommendV3Format(shootType);
    res.json({ success: true, data });
  } catch (error) { fail(res, error); }
}

export async function v3Create(req, res) {
  try {
    const input = details.safeParse(req.body); if (!input.success) return bad(res, input);
    const entitlements = await resolveEntitlements(await User.findById(req.user.id));
    if (entitlements.plan === 'free' && entitlements.usage.deliveriesRemaining === 0) return res.status(403).json({ success: false, code: 'MONTHLY_DELIVERY_LIMIT_REACHED', message: `You have published all ${entitlements.limits.deliveriesPerMonth} Free deliveries this month. Start another next month or move to Pro.` });
    const count = await Delivery.countDocuments({ userId: req.user.id, status: { $in: ['draft', 'analyzing', 'directing', 'review'] } });
    if (count >= 20) return res.status(409).json({ success: false, message: 'Finish or remove an existing draft before starting another one.' });
    const delivery = await Delivery.create({ userId: req.user.id, schemaVersion: 3, clientName: input.data.clientName, shootType: input.data.shootType, brief: input.data.purpose, v3: { step: 'format', revision: 1, originalPurpose: input.data.originalPurpose, clarificationAnswers: input.data.clarificationAnswers, narrationChoice: 'skip', approvedRevision: null } });
    res.status(201).json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Details(req, res) {
  try {
    const input = details.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery)) return res.status(404).json({ success: false, message: 'Draft not found.' });
    const changed = delivery.clientName !== input.data.clientName || delivery.shootType !== input.data.shootType || delivery.brief !== input.data.purpose || JSON.stringify(delivery.v3?.clarificationAnswers || []) !== JSON.stringify(input.data.clarificationAnswers);
    const discardedAudio = changed ? narrationAudioIds(delivery) : [];
    delivery.clientName = input.data.clientName; delivery.shootType = input.data.shootType; delivery.brief = input.data.purpose;
    if (changed) { delivery.collectionAnalysis = undefined; delivery.creativeDirection = undefined; delivery.curatedAssetIds = []; delivery.narration = undefined; delivery.status = 'draft'; invalidateApproval(delivery); saveV3(delivery, { narrationChoice: 'skip' }); }
    saveV3(delivery, { originalPurpose: input.data.originalPurpose, clarificationAnswers: input.data.clarificationAnswers, step: 'format' });
    await delivery.save(); await removeAudioIds(discardedAudio); res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Format(req, res) {
  try {
    const input = formatInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery)) return res.status(404).json({ success: false, message: 'Draft not found.' });
    const changed = delivery.format !== input.data.format;
    const discardedAudio = changed ? narrationAudioIds(delivery) : [];
    if (changed && !V3_MUSIC_FORMATS.has(input.data.format) && delivery.soundtrack?.publicId) discardedAudio.push(delivery.soundtrack.publicId);
    if (changed) { delivery.format = input.data.format; delivery.creativeDirection = undefined; delivery.curatedAssetIds = []; delivery.collectionAnalysis = undefined; delivery.narration = undefined; delivery.soundtrack = V3_MUSIC_FORMATS.has(delivery.format) ? delivery.soundtrack : undefined; delivery.status = 'draft'; invalidateApproval(delivery); saveV3(delivery, { narrationChoice: 'skip' }); }
    saveV3(delivery, { step: 'upload' }); await delivery.save(); await removeAudioIds(discardedAudio); res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Prepare(req, res) {
  try {
    const delivery = await owned(req); if (!editable(delivery) || !delivery.format) return res.status(409).json({ success: false, message: 'Choose a format first.' });
    if (delivery.assets.length < V3_FORMATS[delivery.format][0]) return res.status(409).json({ success: false, message: `Add at least ${V3_FORMATS[delivery.format][0]} photographs for this format.` });
    const existing = await DeliveryJob.findOne({ deliveryId: delivery._id, type: 'v3-prepare', status: { $in: ['queued', 'running'] } });
    if (existing) return res.status(202).json({ success: true, data: existing });
    delivery.status = 'analyzing'; saveV3(delivery, { step: 'preparing' }); await delivery.save();
    let job;
    try { job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'v3-prepare', provider: 'Alibaba Model Studio', promptVersion: 'delivery-v3', input: { revision: delivery.v3.revision } }); }
    catch (error) { delivery.status = 'draft'; saveV3(delivery, { step: 'upload' }); await delivery.save(); throw error; }
    res.status(202).json({ success: true, data: job });
  } catch (error) { fail(res, error); }
}

export async function v3Showcase(req, res) {
  try {
    const input = showcaseInput.safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery) || !delivery.collectionAnalysis || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Analyse the photographs first.' });
    const assetIds = new Set(delivery.assets.map(asset => asset.assetId));
    if (!validShowcase(delivery.format, input.data.assetIds, assetIds)) return res.status(400).json({ success: false, message: 'Choose the allowed number of showcase photographs from this delivery.' });
    if (input.data.frames.length !== input.data.assetIds.length || new Set(input.data.frames.map(frame => frame.assetId)).size !== input.data.frames.length || input.data.frames.some(frame => !input.data.assetIds.includes(frame.assetId))) return res.status(400).json({ success: false, message: 'Every showcase photograph needs one caption.' });
    if (!assetIds.has(input.data.openingAssetId) || !assetIds.has(input.data.closingAssetId)) return res.status(400).json({ success: false, message: 'Choose photographs from this delivery for the opening and closing.' });
    if (delivery.format === 'photo-story' && input.data.frames.some(frame => frame.caption.length > 60)) return res.status(400).json({ success: false, message: 'Photo Story captions must be 60 characters or less.' });
    const previous = delivery.creativeDirection;
    const selectedSet = new Set(input.data.assetIds);
    const sections = (previous.sections || []).map(section => ({ ...section, assetIds: (section.assetIds || []).filter(id => selectedSet.has(id)) })).filter(section => section.assetIds.length);
    const assigned = new Set(sections.flatMap(section => section.assetIds));
    if (!sections.length) sections.push({ id: 'showcase', title: 'The photographs', subtitle: '', layout: 'grid', assetIds: [] });
    sections[0].assetIds.push(...input.data.assetIds.filter(id => !assigned.has(id)));
    delivery.creativeDirection = { ...previous, title: input.data.title, openingLine: input.data.openingLine, closingLine: input.data.closingLine, frames: input.data.assetIds.map(id => ({ assetId: id, caption: input.data.frames.find(frame => frame.assetId === id).caption, headline: '', textAnimation: delivery.format === 'photo-story' ? 'typewriter' : 'word_fade_up' })), assetOrder: input.data.assetIds, sections };
    delivery.title = input.data.title; delivery.curatedAssetIds = input.data.assetIds; delivery.presentationOrder = input.data.assetIds;
    delivery.galleryAssetIds = delivery.assets.map(asset => asset.assetId); delivery.galleryOrder = delivery.galleryAssetIds;
    const narrationTextChanged = previous.openingLine !== input.data.openingLine || previous.closingLine !== input.data.closingLine;
    const discardedAudio = narrationTextChanged ? narrationAudioIds(delivery) : [];
    if (narrationTextChanged) delivery.narration = undefined;
    invalidateApproval(delivery); saveV3(delivery, { openingAssetId: input.data.openingAssetId, closingAssetId: input.data.closingAssetId, step: delivery.format === 'photo-story' ? 'narration' : V3_MUSIC_FORMATS.has(delivery.format) ? 'music' : 'design' });
    delivery.markModified('creativeDirection'); await delivery.save(); await removeAudioIds(discardedAudio); res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Caption(req, res) {
  try {
    const input = z.object({ instruction: z.string().trim().max(400).default('') }).strict().safeParse(req.body); if (!input.success) return bad(res, input);
    const delivery = await owned(req); if (!editable(delivery) || !delivery.collectionAnalysis) return res.status(409).json({ success: false, message: 'Analyse the photographs first.' });
    const insight = delivery.collectionAnalysis.images?.find(row => row.assetId === req.params.assetId);
    if (!insight) return res.status(404).json({ success: false, message: 'Photograph not found.' });
    const caption = await regenerateV3Caption(delivery, insight, input.data.instruction);
    res.json({ success: true, data: { caption } });
  } catch (error) { fail(res, error); }
}

export async function v3Narration(req, res) {
  try {
    const delivery = await owned(req); if (!editable(delivery) || delivery.format !== 'photo-story' || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Narration is available after Photo Story captions are ready.' });
    const existing = await DeliveryJob.findOne({ deliveryId: delivery._id, type: 'v3-narrate', status: { $in: ['queued', 'running'] } });
    if (existing) return res.status(202).json({ success: true, data: existing });
    const job = await DeliveryJob.create({ deliveryId: delivery._id, userId: req.user.id, type: 'v3-narrate', provider: 'Deepgram Flux', promptVersion: 'delivery-v3', input: { revision: delivery.v3.revision } });
    res.status(202).json({ success: true, data: job });
  } catch (error) { fail(res, error); }
}

export async function v3SkipNarration(req, res) {
  try {
    const delivery = await owned(req); if (!editable(delivery) || delivery.format !== 'photo-story') return res.status(409).json({ success: false, message: 'Photo Story draft not found.' });
    await DeliveryJob.updateMany({ deliveryId: delivery._id, type: 'v3-narrate', status: 'queued' }, { $set: { status: 'cancelled', cancelledAt: new Date(), completedAt: new Date() } });
    await DeliveryJob.updateMany({ deliveryId: delivery._id, type: 'v3-narrate', status: 'running' }, { $set: { cancelRequestedAt: new Date() } });
    const old = [delivery.narration?.opening?.publicId, delivery.narration?.closing?.publicId].filter(Boolean);
    delivery.narration = undefined; invalidateApproval(delivery); saveV3(delivery, { narrationChoice: 'skip', step: 'music' }); await delivery.save();
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
    const delivery = await owned(req); if (!editable(delivery) || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Finish the showcase first.' });
    delivery.creativeDirection = { ...delivery.creativeDirection, palette: input.data.palette, typography: input.data.typography };
    invalidateApproval(delivery); saveV3(delivery, { step: 'preview' }); delivery.markModified('creativeDirection'); await delivery.save();
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
    const access = delivery.access.toObject();
    delete access.pinDigest;
    res.json({ success: true, data: { access, formatConfig: delivery.formatConfig, hasPin: Boolean(delivery.access.pinDigest) } });
  } catch (error) { fail(res, error); }
}

export async function v3Approve(req, res) {
  try {
    const delivery = await owned(req); if (!editable(delivery) || !delivery.creativeDirection) return res.status(409).json({ success: false, message: 'Preview the delivery first.' });
    if (await DeliveryJob.exists({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] } })) return res.status(409).json({ success: false, message: 'Wait for the current step to finish.' });
    const ids = new Set(delivery.assets.map(asset => asset.assetId));
    if (!validShowcase(delivery.format, delivery.curatedAssetIds, ids)) return res.status(409).json({ success: false, message: 'Review the showcase photo count.' });
    if (V3_MUSIC_FORMATS.has(delivery.format) && !delivery.soundtrack) return res.status(409).json({ success: false, message: 'Choose music for this format.' });
    if (delivery.format === 'photo-story' && delivery.v3?.narrationChoice === 'voice' && delivery.narration?.renderVersion !== 'flux-hannah-bookends-v3') return res.status(409).json({ success: false, message: 'Generate the opening and closing narration first.' });
    delivery.reviewApprovedAt = new Date(); saveV3(delivery, { approvedRevision: delivery.v3.revision, step: 'access' }); await delivery.save();
    res.json({ success: true, data: delivery });
  } catch (error) { fail(res, error); }
}

export async function v3Publish(req, res) {
  let reservation;
  try {
    const delivery = await owned(req, { pin: true });
    if (!editable(delivery) || !delivery.reviewApprovedAt || delivery.v3?.approvedRevision !== delivery.v3?.revision) return res.status(409).json({ success: false, message: 'Preview and approve this delivery before publishing.' });
    if (await DeliveryJob.exists({ deliveryId: delivery._id, status: { $in: ['queued', 'running'] } })) return res.status(409).json({ success: false, message: 'Wait for the current step to finish.' });
    const ids = new Set(delivery.assets.map(asset => asset.assetId));
    if (!validShowcase(delivery.format, delivery.curatedAssetIds, ids)) return res.status(409).json({ success: false, message: 'The showcase photo count has changed.' });
    if (V3_MUSIC_FORMATS.has(delivery.format) && !delivery.soundtrack) return res.status(409).json({ success: false, message: 'Choose music first.' });
    if (delivery.format === 'photo-story' && delivery.v3?.narrationChoice === 'voice' && delivery.narration?.renderVersion !== 'flux-hannah-bookends-v3') return res.status(409).json({ success: false, message: 'Narration is not ready.' });
    reservation = await reservePublishSlot(await User.findById(req.user.id), delivery.assets.length);
    const published = await Delivery.findOneAndUpdate(
      { _id: delivery._id, userId: req.user.id, schemaVersion: 3, status: { $in: ['draft', 'review'] }, reviewApprovedAt: { $ne: null }, 'v3.approvedRevision': delivery.v3.revision, 'v3.revision': delivery.v3.revision },
      { $set: { status: 'published', publishedAt: new Date(), 'v3.step': 'published' } },
      { new: true }
    );
    if (!published) { const error = new Error('This delivery changed. Preview it again before publishing.'); error.status = 409; throw error; }
    res.json({ success: true, data: { publicId: delivery.publicId, url: `${String(process.env.CLIENT_URL || 'https://veylo.com.ng').replace(/\/$/, '')}/d/${delivery.publicId}`, entitlements: reservation.entitlements } });
  } catch (error) { await reservation?.release().catch(() => {}); fail(res, error); }
}
