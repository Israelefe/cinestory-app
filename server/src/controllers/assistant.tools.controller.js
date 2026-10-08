import { z } from 'zod';
import jwt from 'jsonwebtoken';
import Portfolio from '../models/Portfolio.js';
import Delivery from '../models/Delivery.js';
import { loadAssistantAccount } from './assistant.controller.js';
import { assistantContextSchema, freshAssistantContext, assistantWorkspaceContext, ownedAssistantDelivery, inspectAssistantDelivery } from '../services/assistantWorkspace.service.js';
import { suggestAssistantWriting } from '../services/alibabaAssistant.service.js';

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const writingSchema = z.object({ kind: z.enum(['delivery-title', 'caption', 'client-message', 'portfolio-intro']), deliveryId: id.optional(), assetId: z.string().uuid().optional(), instruction: z.string().trim().min(3).max(800) }).strict();
const invalid = res => res.status(400).json({ success: false, message: 'Check this assistant request and try again.' });
function failure(res, error) { return res.status(error.status || 502).json({ success: false, code: error.code || 'ASSISTANT_TOOL_FAILED', message: error.status ? error.message : 'This assistant task could not finish. Try again.' }); }
function toolError(message, status = 409) { return Object.assign(new Error(message), { status }); }
async function enabledAccount(req) {
  const account = await loadAssistantAccount(req);
  if (!account) throw toolError('Sign in to use your workspace.', 401);
  const { getRuntimeConfig } = await import('../services/runtimeConfig.service.js');
  const runtime = await getRuntimeConfig();
  if (runtime.featureFlags?.veyloAssistant === false) throw toolError('Veylo Assistant is unavailable right now.', 404);
  return account;
}
export async function getAssistantWorkspace(req, res) {
  const parsed = z.object({ context: assistantContextSchema.optional() }).strict().safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    const account = await enabledAccount(req);
    const { facts, delivery } = await assistantWorkspaceContext(account.user, account.entitlements, parsed.data.context);
    const selected = new Set((delivery?.creativeDirection?.frames || []).map(item => item.assetId));
    const photos = delivery ? (delivery.assets || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((asset, index) => ({ assetId: asset.assetId, label: `Photo ${index + 1}`, captionEditable: delivery.kind === 'photoswap' || (delivery.kind === 'showcase' && selected.has(asset.assetId)) })) : [];
    const drafts = await Delivery.find({ userId: account.user._id, kind: { $in: ['showcase', 'pinboard', 'photoswap'] }, status: { $in: ['draft', 'review'] } }).select('_id kind title').sort({ updatedAt: -1 }).limit(5).lean();
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data: { ...facts, photos, drafts, accountSummary: account.safeContext } });
  } catch (error) { return failure(res, error); }
}
export async function checkAssistantDelivery(req, res) {
  const parsed = z.object({ deliveryId: id, context: assistantContextSchema.optional() }).strict().safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    const account = await enabledAccount(req);
    const delivery = await ownedAssistantDelivery(parsed.data.deliveryId, account.user._id);
    if (!delivery) throw toolError('This delivery is not available to your account.', 404);
    const context = freshAssistantContext(parsed.data.context);
    const workflow = context?.page === '/create' && context.workflow.deliveryId === String(delivery._id) ? context.workflow : {};
    return res.json({ success: true, data: await inspectAssistantDelivery(delivery, account.entitlements, workflow) });
  } catch (error) { return failure(res, error); }
}
export async function proposeAssistantWriting(req, res) {
  const parsed = writingSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res);
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', disconnect);
  try {
    const account = await enabledAccount(req);
    const input = parsed.data;
    let source, delivery, portfolio, maxLength = 600;
    if (input.kind === 'portfolio-intro') {
      if (!account.entitlements.features.portfolio || account.entitlements.features.portfolioMode !== 'public') throw toolError('Portfolio editing requires current Pro access.', 403);
      portfolio = await Portfolio.findOne({ userId: account.user._id }).select('bio headline location draft.bio draft.headline draft.location draftRevision').lean();
      if (!portfolio) throw toolError('Open and save your Portfolio draft first.', 404);
      source = { bio: portfolio.draft?.bio ?? portfolio.bio, headline: portfolio.draft?.headline ?? portfolio.headline, location: portfolio.draft?.location ?? portfolio.location };
    } else {
      delivery = await ownedAssistantDelivery(input.deliveryId, account.user._id);
      if (!delivery) throw toolError('Open a delivery belonging to your account first.', 404);
      if (input.kind !== 'client-message' && !['draft', 'review'].includes(delivery.status)) throw toolError('Writing changes require an editable draft.');
      if (input.kind === 'client-message' && delivery.status !== 'published') throw toolError('Publish the delivery before preparing its delivery message.');
      source = { title: delivery.creativeDirection?.title || delivery.pinboard?.title || delivery.title, shootType: delivery.shootType, purpose: String(delivery.brief || '').slice(0, 1600) };
      maxLength = input.kind === 'delivery-title' ? delivery.kind === 'showcase' ? 80 : 120 : input.kind === 'caption' ? delivery.kind === 'showcase' && delivery.format === 'editorial' ? 320 : 180 : 600;
      if (input.kind === 'caption') {
        const asset = delivery.assets?.find(item => item.assetId === input.assetId);
        if (!asset) throw toolError('Choose a photograph from this delivery.', 404);
        if (delivery.kind === 'showcase' && !delivery.creativeDirection?.frames?.some(item => item.assetId === input.assetId)) throw toolError('Choose a photograph in the current Showcase.', 400);
        source.caption = delivery.kind === 'showcase' ? delivery.creativeDirection?.frames?.find(item => item.assetId === input.assetId)?.caption || asset.caption || '' : asset.caption || '';
        // No photograph, media URL, full analysis object or private client name is sent.
        if (!source.caption && input.instruction.length < 15) throw toolError('Describe what this photograph shows so the caption uses real details.', 400);
      }
    }
    const text = await suggestAssistantWriting({ kind: input.kind, source, instruction: input.instruction, maxLength, signal: controller.signal });
    if (text.length < (input.kind === 'delivery-title' ? 2 : input.kind === 'caption' ? 5 : 10)) throw toolError('The suggestion is too short for this field. Try a more specific instruction.', 400);
    if (controller.signal.aborted) return;
    if (!process.env.JWT_SECRET) throw toolError('Writing confirmation is unavailable right now.', 503);
    const proposal = { kind: input.kind, text, ...(delivery ? { deliveryId: String(delivery._id), version: new Date(delivery.updatedAt).toISOString() } : { version: String(portfolio.draftRevision) }), ...(input.kind === 'caption' ? { assetId: input.assetId } : {}) };
    const confirmation = jwt.sign({ ...proposal, userId: String(account.user._id) }, process.env.JWT_SECRET, { expiresIn: '10m', issuer: 'veylo-api', audience: 'veylo-assistant-writing' });
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data: { ...proposal, confirmation, ...(input.kind === 'client-message' ? { clientPath: `/d/${delivery.publicId}` } : {}) } });
  } catch (error) { if (!controller.signal.aborted) return failure(res, error); }
  finally { res.off('close', disconnect); }
}
export async function validateAssistantWriting(req, res) {
  const parsed = z.object({ confirmation: z.string().min(20).max(6000) }).strict().safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    const account = await enabledAccount(req);
    let proposal;
    try { proposal = jwt.verify(parsed.data.confirmation, process.env.JWT_SECRET, { issuer: 'veylo-api', audience: 'veylo-assistant-writing', algorithms: ['HS256'] }); }
    catch { throw toolError('This suggestion expired. Prepare a new suggestion.', 409); }
    if (proposal.userId !== String(account.user._id)) throw toolError('This suggestion is not available to your account.', 404);
    if (proposal.kind === 'client-message') throw toolError('Copy the message and review it before sending.');
    if (proposal.kind === 'portfolio-intro') {
      if (!account.entitlements.features.portfolio || account.entitlements.features.portfolioMode !== 'public') throw toolError('Portfolio editing requires current Pro access.', 403);
      const portfolio = await Portfolio.findOne({ userId: account.user._id }).select('draftRevision').lean();
      if (!portfolio || String(portfolio.draftRevision) !== proposal.version) throw toolError('The saved Portfolio draft changed. Prepare a fresh suggestion.');
    } else {
      const delivery = await ownedAssistantDelivery(proposal.deliveryId, account.user._id);
      if (!delivery) throw toolError('This delivery is unavailable.', 404);
      if (!['draft', 'review'].includes(delivery.status) || new Date(delivery.updatedAt).toISOString() !== proposal.version) throw toolError('The saved draft changed. Prepare a fresh suggestion.');
      if (proposal.kind === 'caption' && !delivery.assets.some(item => item.assetId === proposal.assetId)) throw toolError('This photograph is unavailable.', 404);
    }
    return res.json({ success: true, data: { kind: proposal.kind, text: proposal.text, deliveryId: proposal.deliveryId, assetId: proposal.assetId } });
  } catch (error) { return failure(res, error); }
}
