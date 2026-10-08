import { z } from 'zod';
import mongoose from 'mongoose';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import Portfolio from '../models/Portfolio.js';
import { ASSISTANT_PAGES, ASSISTANT_STEPS, ASSISTANT_EVENTS, ASSISTANT_KINDS, trimActivity } from '../constants/assistantContext.mjs';
import { validShowcase, V3_MUSIC_FORMATS } from '../constants/deliveryV3.js';
import { NARRATION_BOOKEND_RENDER_VERSION } from './narration.service.js';
import { DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
export const assistantContextSchema = z.object({
  page: z.enum(Object.keys(ASSISTANT_PAGES)), capturedAt: z.number().int().nonnegative(),
  workflow: z.object({
    deliveryId: objectId.optional(), kind: z.enum(ASSISTANT_KINDS).optional(), step: z.enum(ASSISTANT_STEPS).optional(),
    photoCount: z.number().int().min(0).max(500).optional(), failedUploads: z.number().int().min(0).max(500).optional(),
    uploadPercent: z.number().int().min(0).max(100).optional(), uploading: z.boolean().optional(),
    unsaved: z.boolean().optional(), hasError: z.boolean().optional(), previewOpen: z.boolean().optional(), busy: z.boolean().optional()
  }).strict().default({}),
  recent: z.array(z.object({ event: z.enum(ASSISTANT_EVENTS), page: z.enum(Object.keys(ASSISTANT_PAGES)), step: z.enum(ASSISTANT_STEPS).optional(), at: z.number().int().nonnegative() }).strict()).max(20).default([])
}).strict();

export function freshAssistantContext(context, now = Date.now()) {
  if (!context || context.capturedAt > now + 5000 || now - context.capturedAt > 5 * 60 * 1000) return null;
  return { ...context, recent: trimActivity(context.recent, now) };
}
export async function ownedAssistantDelivery(id, userId) {
  if (!userId || !mongoose.isValidObjectId(id)) return null;
  return Delivery.findOne({ _id: id, userId, kind: { $in: ['showcase', 'pinboard', 'photoswap'] } })
    .select('userId schemaVersion kind format status title clientName shootType brief assets v3 creativeDirection curatedAssetIds pinboard photoswap soundtrack narration access.expiresAt reviewApprovedAt updatedAt publicId').lean();
}
export function deliveryCheck(delivery, { entitlements, pendingJob = false, workflow = {} } = {}) {
  const checks = [];
  const add = (severity, text, step) => checks.push({ severity, text, step });
  const assets = delivery.assets || [], ids = new Set(assets.map(asset => asset.assetId));
  if (delivery.status === 'published') return { status: 'published', checks: [{ severity: 'info', text: 'This delivery is already published.', step: 'publish' }], photoCount: assets.length };
  if (delivery.status === 'archived') add('blocker', 'Restore this delivery from Dashboard before editing it.', 'details');
  if (delivery.schemaVersion !== 3) add('info', 'Use this delivery’s existing review and publishing flow.', 'publish');
  if (pendingJob || ['analyzing', 'directing'].includes(delivery.status)) add('blocker', 'Wait for the current processing job to finish.', 'preparing');
  if (workflow.uploading) add('blocker', 'Your page reports an upload still in progress.', 'photos');
  if (workflow.failedUploads) add('blocker', `Your page reports ${workflow.failedUploads} failed photo upload${workflow.failedUploads === 1 ? '' : 's'}. Retry them before continuing.`, 'photos');
  if (workflow.unsaved) add('blocker', 'Save the changes in your open form before relying on this check.', workflow.step || 'details');
  if (!assets.length) add('blocker', 'Add photographs to this delivery.', 'photos');
  if (assets.some(asset => !asset.publicId || !asset.width || !asset.height)) add('blocker', 'Some saved photographs have incomplete upload information. Review Photos.', 'photos');
  if (!String(delivery.clientName || '').trim()) add('blocker', 'Add the client name in Details.', 'details');
  if (entitlements?.limits?.photosPerDelivery < assets.length) add('blocker', 'This delivery exceeds your current plan’s photo limit.', 'photos');
  if (entitlements?.usage?.deliveriesRemaining === 0) add('blocker', 'Your monthly published delivery allowance has been used.', 'publish');
  if (delivery.access?.expiresAt && new Date(delivery.access.expiresAt) <= new Date()) add('blocker', 'Choose a future link expiry or clear it in Access.', 'access');
  if (delivery.schemaVersion === 3 && delivery.kind === 'photoswap') {
    const missing = assets.filter(asset => String(asset.caption || '').trim().length < 5).length;
    if (missing) add('blocker', `Review a caption for ${missing} photograph${missing === 1 ? '' : 's'}. PhotoSwap requires a caption for every photo.`, 'captions');
  } else if (delivery.schemaVersion === 3 && delivery.kind === 'pinboard') {
    const order = delivery.pinboard?.layouts?.find(item => item.id === delivery.pinboard.selectedLayoutId)?.assetOrder || [];
    if (!assets.length || order.length !== ids.size || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) add('blocker', 'Save a board arrangement that includes every photograph once.', 'design');
  } else if (delivery.schemaVersion === 3) {
    if (!delivery.creativeDirection || !validShowcase(delivery.format, delivery.curatedAssetIds, ids)) add('blocker', 'Review the Showcase selection and design for this format.', 'showcase');
    if (V3_MUSIC_FORMATS.has(delivery.format) && !delivery.soundtrack) add('blocker', 'Choose music for this Showcase format.', 'music');
    if (delivery.format === 'photo-story' && delivery.v3?.narrationChoice === 'voice') {
      const narration = delivery.narration;
      if (![NARRATION_BOOKEND_RENDER_VERSION, 'flux-hannah-bookends-v3'].includes(narration?.renderVersion) || !narration?.opening?.publicId || !narration?.closing?.publicId || (narration.voiceId || DEFAULT_NARRATION_VOICE_ID) !== (delivery.v3.narrationVoiceId || DEFAULT_NARRATION_VOICE_ID)) add('blocker', 'Generate the selected Photo Story narration.', 'narration');
    }
    const missing = (delivery.creativeDirection?.frames || []).filter(frame => !String(frame.caption || '').trim()).length;
    if (missing) add('suggestion', `Review ${missing} empty Showcase caption${missing === 1 ? '' : 's'}.`, 'showcase');
  }
  if (delivery.schemaVersion === 3 && (!delivery.reviewApprovedAt || delivery.v3?.approvedRevision !== delivery.v3?.revision)) add('blocker', 'Preview and approve the current saved version before publishing.', 'publish');
  if (!checks.length) add('info', 'Saved publishing requirements are met. Review the client preview before publishing.', 'publish');
  return { status: checks.some(item => item.severity === 'blocker') ? 'needs-attention' : 'ready-to-review', checks, photoCount: assets.length, checkedAt: new Date().toISOString() };
}
export async function inspectAssistantDelivery(delivery, entitlements, workflow) {
  const pendingJob = Boolean(await DeliveryJob.exists({ deliveryId: delivery._id, userId: delivery.userId, status: { $in: ['queued', 'running'] }, cancelRequestedAt: { $exists: false } }));
  return deliveryCheck(delivery, { entitlements, pendingJob, workflow });
}
export async function assistantWorkspaceContext(user, entitlements, context) {
  const page = freshAssistantContext(context);
  const facts = { account: {
    deliveriesThisMonth: entitlements.usage?.deliveriesThisMonth, deliveriesRemaining: entitlements.usage?.deliveriesRemaining,
    monthlyDeliveryLimit: entitlements.limits.deliveriesPerMonth, photoLimit: entitlements.limits.photosPerDelivery,
    storageUsedBytes: Math.max(0, Number(user.storageUsedBytes) || 0), storageLimitBytes: entitlements.limits.personalStorageBytes,
    storageMode: entitlements.features.storageMode
  } };
  if (!page) return { facts, delivery: null };
  facts.browserReported = { page: page.page, label: ASSISTANT_PAGES[page.page], workflow: page.workflow, recent: page.recent };
  let delivery = null;
  if (page.workflow.deliveryId && ['/create', '/sharing'].includes(page.page)) {
    delivery = await ownedAssistantDelivery(page.workflow.deliveryId, user._id);
    if (delivery) facts.delivery = { kind: delivery.kind, format: delivery.format, status: delivery.status, photoCount: delivery.assets?.length || 0, step: delivery.v3?.step, check: await inspectAssistantDelivery(delivery, entitlements, page.workflow) };
    else facts.delivery = { available: false };
  }
  if (page.page.startsWith('/portfolio')) {
    const portfolio = await Portfolio.findOne({ userId: user._id }).select('status draftRevision publishedRevision').lean();
    facts.portfolio = portfolio ? { status: portfolio.status, unpublishedChanges: portfolio.draftRevision !== portfolio.publishedRevision, access: entitlements.features.portfolioMode } : { exists: false, access: entitlements.features.portfolioMode };
  }
  return { facts, delivery };
}
