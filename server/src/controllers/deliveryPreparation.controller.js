import bcrypt from 'bcryptjs';
import { z } from 'zod';
import Delivery from '../models/Delivery.js';
import Revision from '../models/DeliveryRevision.js';
import User from '../models/User.js';
import { FORMATS, creationPipelineVersion } from '../services/deliveryPresentation.js';
import { startPreparation, startRevisionTask, preparationStatus, cancelPreparation, createRevision, withDeliveryProviderSlot } from '../services/deliveryPreparation.service.js';
import { assistBrief } from '../services/deliveryAI.service.js';
import { reservePublishSlot } from '../services/entitlement.service.js';
import { deliverySoundtrack } from '../constants/deliverySoundtracks.js';
import { supportsDeliveryMusic, supportsDeliveryNarration } from '../constants/deliveryCapabilities.js';

const revisionId = z.string().regex(/^[a-f\d]{24}$/i);
const optionalRevision = revisionId.nullable().optional();
const id = z.string().min(1).max(100);
async function owned(req) {
  const delivery = await Delivery.findOne({ _id: req.params.id, userId: req.user.id, schemaVersion: 3, status: { $ne: 'archived' } });
  if (!delivery) throw Object.assign(new Error('This delivery is not available.'), { status: 404 });
  return delivery;
}
function replyError(res, error) {
  if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: 'Check the information you entered.' });
  console.error('[delivery/preparation]', error.name, error.message);
  return res.status(error.status || 503).json({ success: false, message: error.status ? error.message : 'Your saved work is unchanged. We could not complete this request right now.' });
}
export function deliveryConfiguration(req, res) { res.json({ success: true, data: { pipelineVersion: creationPipelineVersion() } }); }
export async function assistPreparationBrief(req, res) {
  try {
    const input = z.object({ clientName: z.string().trim().max(100), shootType: z.string().trim().min(1).max(80), brief: z.string().trim().min(1).max(3000), mode: z.enum(['assess', 'enhance']) }).strict().parse(req.body);
    let result;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { result = await withDeliveryProviderSlot(() => assistBrief(input)); break; } catch (error) { if (attempt) throw error; }
    }
    res.json({ success: true, data: result });
  } catch (error) { replyError(res, error); }
}
export async function prepareDelivery(req, res) {
  try {
    const input = z.object({ format: z.enum(FORMATS), revisionId: optionalRevision }).strict().parse(req.body);
    const delivery = await owned(req);
    await startPreparation(delivery, input.format, input.revisionId);
    res.status(202).json({ success: true, data: await preparationStatus(await Delivery.findById(delivery._id)) });
  } catch (error) { replyError(res, error); }
}
export async function getPreparation(req, res) {
  try { res.json({ success: true, data: await preparationStatus(await owned(req)) }); }
  catch (error) { replyError(res, error); }
}
export async function cancelDeliveryPreparation(req, res) {
  try { await cancelPreparation(await owned(req)); res.json({ success: true }); }
  catch (error) { replyError(res, error); }
}
export async function regenerateDeliveryCaption(req, res) {
  try {
    const input = z.object({ revisionId, assetId: id, instruction: z.string().trim().max(600).default('') }).strict().parse(req.body);
    const run = await startRevisionTask(await owned(req), 'caption', input);
    res.status(202).json({ success: true, data: { id: run._id } });
  } catch (error) { replyError(res, error); }
}
export async function prepareNarration(req, res) {
  try {
    const input = z.object({ revisionId }).strict().parse(req.body);
    const delivery = await owned(req);
    if (!supportsDeliveryNarration(delivery.format)) throw Object.assign(new Error('Narration is available for Photo Story.'), { status: 400 });
    if (![delivery.creativeDirection?.openingLine, delivery.creativeDirection?.closingLine, ...(delivery.creativeDirection?.frames || []).map(frame => frame.caption)].some(text => text?.trim().length >= 8)) throw Object.assign(new Error('Add the story text you want read aloud before recording narration.'), { status: 400 });
    const run = await startRevisionTask(delivery, 'narration', input);
    res.status(202).json({ success: true, data: { id: run._id } });
  } catch (error) { replyError(res, error); }
}
const editSchema = z.object({
  revisionId, title: z.string().trim().min(1).max(120), openingLine: z.string().trim().max(180), closingLine: z.string().trim().max(180),
  frames: z.array(z.object({ assetId: id, caption: z.string().trim().max(180), durationSec: z.number().min(3.5).max(5).default(4.2) }).strict()).min(1).max(30),
  soundtrackId: z.string().max(100).nullable().optional(),
  usageTerms: z.string().trim().max(1000).default('')
}).strict();
export async function editPresentation(req, res) {
  try {
    const input = editSchema.parse(req.body);
    let delivery = await owned(req);
    await cancelPreparation(delivery);
    delivery = await owned(req);
    // A background result must never force the photographer to discard an edit.
    // Only cross AI revisions; another person's saved edit still needs review.
    let latest = String(delivery.draftRevisionId);
    for (let depth = 0; latest !== input.revisionId && depth < 10; depth++) {
      const newer = await Revision.findOne({ _id: latest, deliveryId: delivery._id, userId: delivery.userId }).lean();
      if (!newer || newer.origin !== 'ai' || !newer.parentRevisionId) break;
      latest = String(newer.parentRevisionId);
    }
    if (latest !== input.revisionId) throw Object.assign(new Error('This presentation was edited in another tab. Your changes are still here; open the saved version in a new tab before continuing.'), { status: 409 });
    const revision = await Revision.findOne({ _id: input.revisionId, deliveryId: delivery._id, sourceVersion: delivery.sourceVersion }).lean();
    if (!revision) throw Object.assign(new Error('Prepare a presentation for the current photographs first.'), { status: 409 });
    const assetIds = new Set(delivery.assets.map(a => a.assetId));
    if (new Set(input.frames.map(f => f.assetId)).size !== input.frames.length || input.frames.some(frame => !assetIds.has(frame.assetId))) throw Object.assign(new Error('Choose each presentation photograph once from this delivery.'), { status: 400 });
    const snapshot = structuredClone(revision.snapshot);
    snapshot.title = input.title;
    snapshot.formatConfig = { ...snapshot.formatConfig, usageTerms: input.usageTerms };
    const original = new Map(snapshot.creativeDirection.frames.map(frame => [frame.assetId, frame]));
    const changedText = input.openingLine !== snapshot.creativeDirection.openingLine || input.closingLine !== snapshot.creativeDirection.closingLine || input.frames.some(frame => original.get(frame.assetId)?.caption !== frame.caption) || input.frames.map(f => f.assetId).join() !== snapshot.presentationOrder.join();
    snapshot.creativeDirection = { ...snapshot.creativeDirection, title: input.title, openingLine: input.openingLine, closingLine: input.closingLine,
      frames: input.frames.map((frame, index) => ({ ...original.get(frame.assetId), ...frame, sectionId: original.get(frame.assetId)?.sectionId || 'photographs', duration: frame.durationSec, motion: index % 2 ? 'pan_left' : 'zoom_in', transition: 'fade' })) };
    snapshot.presentationOrder = input.frames.map(f => f.assetId); snapshot.curatedAssetIds = snapshot.presentationOrder;
    if (changedText) snapshot.narration = undefined;
    if (input.soundtrackId !== undefined) {
      if (!input.soundtrackId) snapshot.soundtrack = null;
      else {
        const track = deliverySoundtrack(input.soundtrackId);
        if (!track || !supportsDeliveryMusic(delivery.format)) throw Object.assign(new Error('Choose a soundtrack available for this format.'), { status: 400 });
        snapshot.soundtrack = { catalogId: track.id, title: track.title, creator: track.creator, source: 'curated' };
      }
    }
    const result = await createRevision(delivery, snapshot, 'edited', { draftRevisionId: delivery.draftRevisionId });
    res.json({ success: true, data: { revisionId: result.revision._id } });
  } catch (error) { replyError(res, error); }
}
const publishSchema = z.object({ revisionId, pin: z.string().regex(/^\d{6}$/).or(z.literal('')).optional(),
  expiresAt: z.string().datetime().or(z.literal('')).default(''), allowIndividualDownloads: z.boolean().default(true),
  allowDownloadAll: z.boolean().default(true), allowLikes: z.boolean().default(true), downloadsLocked: z.boolean().default(false),
  downloadLockNote: z.string().trim().max(200).default(''), watermarkEnabled: z.boolean().default(false), watermarkText: z.string().trim().max(40).default(''),
  narration: z.boolean().default(false)
}).strict();
export async function publishPresentation(req, res) {
  let reservation;
  let locked;
  try {
    const input = publishSchema.parse(req.body);
    const delivery = await owned(req);
    const revision = await Revision.findOne({ _id: input.revisionId, deliveryId: delivery._id, userId: req.user.id, sourceVersion: delivery.sourceVersion }).lean();
    if (!revision) throw Object.assign(new Error('The shoot details or photographs changed. Prepare and review those changes before publishing.'), { status: 409 });
    if (input.narration && !revision.snapshot.narration?.publicId) throw Object.assign(new Error('The narration is still being prepared. You can publish with music alone.'), { status: 409 });
    locked = await Delivery.findOneAndUpdate({ _id: delivery._id, draftRevisionId: delivery.draftRevisionId, publishedRevisionId: delivery.publishedRevisionId || null, sourceVersion: delivery.sourceVersion, $or: [{ publishingUntil: null }, { publishingUntil: { $lt: new Date() } }] }, { publishingUntil: new Date(Date.now() + 60000) }, { new: true });
    if (!locked) throw Object.assign(new Error('This delivery is already being published. Your link will be ready shortly.'), { status: 409 });
    await cancelPreparation(delivery);
    if (!delivery.publishedRevisionId) reservation = await reservePublishSlot(await User.findById(req.user.id), revision.snapshot.assets.length);
    const { revisionId: requested, pin, expiresAt, narration, ...access } = input;
    if (expiresAt && new Date(expiresAt) <= new Date()) throw Object.assign(new Error('Choose an expiry date in the future.'), { status: 400 });
    const savedAccess = pin === undefined ? await Delivery.findById(delivery._id).select('+access.pinDigest') : null;
    const pinDigest = pin === undefined ? savedAccess?.access?.pinDigest || null : pin ? await bcrypt.hash(pin, 12) : null;
    let publishedId = revision._id;
    if (!narration && revision.snapshot.narration) {
      const snapshot = { ...revision.snapshot, narration: null };
      const published = await Revision.create({ deliveryId: delivery._id, userId: delivery.userId, sourceVersion: delivery.sourceVersion, origin: revision.origin, snapshot });
      publishedId = published._id;
    }
    const result = await Delivery.updateOne({ _id: delivery._id, sourceVersion: delivery.sourceVersion, draftRevisionId: locked.draftRevisionId, publishingUntil: locked.publishingUntil }, { $set: { publishedRevisionId: publishedId, status: 'published', publishedAt: new Date(), access: { ...access, pinDigest, expiresAt: expiresAt ? new Date(expiresAt) : null } } });
    if (!result.modifiedCount) throw Object.assign(new Error('The presentation changed while publishing. Review the latest version first.'), { status: 409 });
    res.json({ success: true, data: { publicId: delivery.publicId, url: `${String(process.env.CLIENT_URL).replace(/\/$/, '')}/d/${delivery.publicId}` } });
  } catch (error) { await reservation?.release().catch(() => {}); replyError(res, error); }
  finally { if (locked) await Delivery.updateOne({ _id: locked._id, publishingUntil: locked.publishingUntil }, { $unset: { publishingUntil: 1 } }); }
}
