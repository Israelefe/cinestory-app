import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import { CREATIVE_DIRECTOR_PROVIDER, CREATIVE_DIRECTOR_PROMPT_VERSION, analyzeImageBatch, createFrameBatch, createGlobalDirection, recommendFormats } from './alibabaCreativeDirector.service.js';
import { removeDeliveryAudio, signedImageUrl } from './deliveryMedia.service.js';
import { generateNarration } from './narration.service.js';
import { deliverySoundtrack } from '../constants/deliverySoundtracks.js';
import { supportsDeliveryMusic, supportsDeliveryNarration } from '../constants/deliveryCapabilities.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';
import { recordWorkerHeartbeat, workerInstance } from './workerHeartbeat.service.js';
import { fetchAlibabaQuotas } from './alibabaQuota.service.js';

const workerId = workerInstance();
let timer;
let polling = false;
const activeJobs = new Map();
const activeDeliveryIds = new Set();

function positiveInt(value, fallback, { min = 1, max = 32 } = {}) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

const workerSettings = {
  maxJobConcurrency: 4,
  aiBatchConcurrency: 6,
  visionBatchSize: 12,
  captionBatchSize: 8
};
let effectiveJobConcurrency = workerSettings.maxJobConcurrency;
let effectiveAiBatchConcurrency = workerSettings.aiBatchConcurrency;
let quotaSnapshot = {};
let quotaFetchedAt = 0;

function readWorkerSettings() {
  workerSettings.maxJobConcurrency = positiveInt(process.env.DELIVERY_WORKER_CONCURRENCY, 4, { min: 1, max: 16 });
  workerSettings.aiBatchConcurrency = positiveInt(process.env.DELIVERY_AI_CONCURRENCY, 6, { min: 1, max: 16 });
  workerSettings.visionBatchSize = positiveInt(process.env.DELIVERY_VISION_BATCH_SIZE, 12, { min: 4, max: 24 });
  workerSettings.captionBatchSize = positiveInt(process.env.DELIVERY_CAPTION_BATCH_SIZE, 8, { min: 4, max: 16 });
  effectiveJobConcurrency = workerSettings.maxJobConcurrency;
  effectiveAiBatchConcurrency = workerSettings.aiBatchConcurrency;
}

async function refreshProviderQuotas() {
  if (Date.now() - quotaFetchedAt < 5 * 60 * 1000) return;
  quotaFetchedAt = Date.now();
  const creativeModel = process.env.ALIBABA_CREATIVE_MODEL || 'deepseek-v4.1-flash';
  const visionModel = process.env.ALIBABA_VISION_MODEL || 'qwen3-vl-flash';
  const quotas = await fetchAlibabaQuotas([creativeModel, visionModel]);
  if (!Object.keys(quotas).length) return;
  quotaSnapshot = quotas;
  effectiveJobConcurrency = workerSettings.maxJobConcurrency;
  effectiveAiBatchConcurrency = workerSettings.aiBatchConcurrency;
  const requestsPerSecond = Object.values(quotas)
    .map(quota => quota.requestLimit && quota.requestPeriodSeconds ? quota.requestLimit / quota.requestPeriodSeconds : null)
    .filter(value => Number.isFinite(value) && value > 0);
  const providerConcurrency = Object.values(quotas)
    .map(quota => quota.concurrencyLimit)
    .filter(value => Number.isFinite(value) && value > 0);
  // Leave most of the provider quota available for other workspaces and
  // retries. The normal defaults are already small; this only lowers them
  // when the account reports a genuinely smaller request window.
  if (requestsPerSecond.length) {
    const safeRequests = Math.max(1, Math.floor(Math.min(...requestsPerSecond) * 0.5));
    effectiveAiBatchConcurrency = Math.min(workerSettings.aiBatchConcurrency, safeRequests);
    effectiveJobConcurrency = Math.min(workerSettings.maxJobConcurrency, Math.max(1, Math.floor(safeRequests / 2)));
  }
  if (providerConcurrency.length) {
    effectiveAiBatchConcurrency = Math.min(effectiveAiBatchConcurrency, Math.min(...providerConcurrency));
  }
}

async function mapConcurrent(items, limit, handler) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  let firstError = null;
  const worker = async () => {
    while (!firstError) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await handler(items[index], index);
      } catch (error) {
        firstError = error;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (firstError) throw firstError;
  return results;
}

function serialSaveJob(job) {
  let chain = Promise.resolve(true);
  return update => {
    chain = chain.then(async () => {
      const saved = await saveJob(job, update);
      if (!saved) throw Object.assign(new Error('This delivery job was cancelled.'), { code: 'JOB_CANCELLED' });
      return saved;
    });
    return chain;
  };
}

async function saveJob(job, update) {
  const latest = await DeliveryJob.findById(job._id).select('cancelRequestedAt status').lean();
  if (latest?.cancelRequestedAt && update.status !== 'failed') {
    Object.assign(job, { status: 'cancelled', stage: 'cancelled', cancelledAt: new Date(), completedAt: new Date(), heartbeatAt: new Date() });
    await job.save();
    return false;
  }
  Object.assign(job, update, { heartbeatAt: new Date(), provider: job.provider || CREATIVE_DIRECTOR_PROVIDER, promptVersion: job.promptVersion || CREATIVE_DIRECTOR_PROMPT_VERSION });
  job.markModified('result');
  await job.save();
  return true;
}

async function analyze(job, delivery) {
  delivery.status = 'analyzing';
  await delivery.save();
  const assets = [...delivery.assets].sort((a, b) => a.sortOrder - b.sortOrder);
  const persistedInsights = Array.isArray(job.result?.insights) ? job.result.insights : [];
  const insightsById = new Map(persistedInsights.map(insight => [String(insight.assetId), insight]));
  const batches = [];
  for (let offset = 0; offset < assets.length; offset += workerSettings.visionBatchSize) {
    batches.push(assets.slice(offset, offset + workerSettings.visionBatchSize).map(asset => ({
      assetId: asset.assetId,
      analysisUrl: signedImageUrl(asset.publicId, { width: 1024 }),
      photographerCaption: asset.libraryCaption || '',
      photographerTags: asset.libraryTags || []
    })));
  }
  const pending = batches.filter(batch => batch.some(asset => !insightsById.has(String(asset.assetId))));
  const saveProgress = serialSaveJob(job);
  let completed = assets.filter(asset => insightsById.has(String(asset.assetId))).length;
  await mapConcurrent(pending, effectiveAiBatchConcurrency, async batch => {
    const batchInsights = await analyzeImageBatch({ brief: delivery.brief, shootType: delivery.shootType, clientName: delivery.clientName, assets: batch });
    const contextByAsset = new Map(batch.map(asset => [String(asset.assetId), asset]));
    for (const insight of batchInsights) {
      const context = contextByAsset.get(String(insight.assetId));
      if (!context) throw Object.assign(new Error(`The vision model returned an unknown photograph ${insight.assetId}.`), { code: 'INVALID_VISION_SEQUENCE' });
      insightsById.set(String(insight.assetId), { ...insight, assetId: context.assetId, photographerCaption: context.photographerCaption, photographerTags: context.photographerTags });
    }
    if (batchInsights.length !== batch.length || batch.some(asset => !insightsById.has(String(asset.assetId)))) {
      throw Object.assign(new Error('The vision model did not return one analysis for every photograph in the batch.'), { code: 'INVALID_VISION_SEQUENCE' });
    }
    completed = assets.filter(asset => insightsById.has(String(asset.assetId))).length;
    const insights = assets.map(asset => insightsById.get(String(asset.assetId))).filter(Boolean);
    await saveProgress({ stage: 'reading-photographs', cursor: completed, progress: Math.min(78, Math.round((completed / assets.length) * 78)), result: { insights } });
  });
  const insights = assets.map(asset => insightsById.get(String(asset.assetId))).filter(Boolean);
  if (insights.length !== assets.length) throw Object.assign(new Error('The complete shoot could not be analysed.'), { code: 'INVALID_VISION_SEQUENCE' });
  await saveProgress({ stage: 'understanding-the-shoot', cursor: assets.length, progress: 82, result: { insights } });
  const recommendation = await recommendFormats({ brief: delivery.brief, shootType: delivery.shootType, clientName: delivery.clientName, imageInsights: insights });
  const byId = new Map(insights.map(item => [item.assetId, item]));
  delivery.assets.forEach(asset => { asset.analysis = byId.get(asset.assetId); });
  delivery.collectionAnalysis = { summary: recommendation.collectionSummary, clientThroughline: recommendation.clientThroughline };
  delivery.formatRecommendations = recommendation.formatRecommendations.sort((a, b) => b.score - a.score);
  delivery.status = 'review';
  delivery.markModified('assets');
  delivery.markModified('collectionAnalysis');
  delivery.markModified('formatRecommendations');
  await delivery.save();
  await saveProgress({ status: 'review', stage: 'format-ready', progress: 100, result: { insights, recommendation }, completedAt: new Date() });
}

async function direct(job, delivery) {
  const format = job.input?.format;
  if (!format || (!supportsDeliveryMusic(format) && delivery.soundtrack)) {
    if (delivery.soundtrack?.publicId) await removeDeliveryAudio(delivery.soundtrack.publicId).catch(() => {});
    delivery.soundtrack = undefined;
    delivery.markModified('soundtrack');
  }
  delivery.status = 'directing';
  delivery.format = format;
  delivery.narration = undefined;
  delivery.markModified('narration');
  delivery.reviewApprovedAt = undefined;
  await delivery.save();
  const insights = delivery.assets.sort((a, b) => a.sortOrder - b.sortOrder).map(asset => asset.analysis).filter(Boolean);
  if (insights.length !== delivery.assets.length) {
    const error = new Error('Analyze the complete shoot before choosing a format.');
    error.code = 'ANALYSIS_REQUIRED';
    throw error;
  }
  let direction = job.result?.direction;
  let frames = Array.isArray(job.result?.frames) ? job.result.frames : [];
  if (!direction) {
    direction = await createGlobalDirection({ format, brief: delivery.brief, shootType: delivery.shootType, clientName: delivery.clientName, collectionAnalysis: delivery.collectionAnalysis, imageInsights: insights, revisionInstruction: job.input?.instruction || '', currentDirection: job.type === 'revise' ? delivery.creativeDirection : null });
    if (direction.format !== format) {
      direction.format = format;
    }
    await saveJob(job, { stage: 'setting-direction', cursor: 0, progress: 18, result: { direction, frames } });
  }
  const sectionIds = new Set(direction.sections.map(section => section.id));
  const defaultSectionId = direction.sections[0]?.id || 'section-1';
  // Keep caption requests small enough that every frame fits in a response,
  // but run independent batches together. A previous worker made every
  // batch wait for the one before it, which turned ten photographs into a
  // twenty-minute serial pipeline.
  const frameById = new Map(frames.map(frame => [String(frame.assetId), frame]));
  const batches = [];
  for (let offset = 0; offset < insights.length; offset += workerSettings.captionBatchSize) batches.push(insights.slice(offset, offset + workerSettings.captionBatchSize));
  const pending = batches.filter(batch => batch.some(item => !frameById.has(String(item.assetId))));
  const saveProgress = serialSaveJob(job);
  let completed = insights.filter(item => frameById.has(String(item.assetId))).length;
  await mapConcurrent(pending, effectiveAiBatchConcurrency, async batch => {
    const result = await createFrameBatch({ format, brief: delivery.brief, shootType: delivery.shootType, clientName: delivery.clientName, direction, imageInsights: batch, revisionInstruction: job.input?.instruction || '', currentFrames: job.type === 'revise' ? (delivery.creativeDirection?.frames || []).filter(frame => batch.some(item => item.assetId === frame.assetId)) : [] });
    const frameMap = new Map((result.frames || []).map(frame => [String(frame.assetId), frame]));
    for (const item of batch) {
      const frame = frameMap.get(String(item.assetId));
      if (!frame) throw Object.assign(new Error(`No approved caption was returned for photograph ${item.assetId}.`), { code: 'CAPTIONS_REQUIRED' });
      if (!sectionIds.has(frame.sectionId)) frame.sectionId = defaultSectionId;
      frame.assetId = item.assetId;
      if (typeof frame.caption !== 'string' || frame.caption.trim().length < 18) throw Object.assign(new Error(`Caption is missing for photograph ${item.assetId}.`), { code: 'CAPTIONS_REQUIRED' });
      frameById.set(String(item.assetId), frame);
    }
    completed = insights.filter(item => frameById.has(String(item.assetId))).length;
    const orderedFrames = insights.map(item => frameById.get(String(item.assetId))).filter(Boolean);
    await saveProgress({ stage: 'directing-photographs', cursor: completed, progress: 18 + Math.round((completed / insights.length) * 78), result: { direction, frames: orderedFrames } });
  });
  frames = insights.map(item => frameById.get(String(item.assetId))).filter(Boolean);
  if (frames.length !== insights.length) throw Object.assign(new Error('The creative director did not return a caption for every photograph.'), { code: 'CAPTIONS_REQUIRED' });
  const captionKeys = new Set();
  for (const frame of frames) {
    const key = String(frame.caption || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || captionKeys.has(key)) throw Object.assign(new Error(`The creative director repeated a caption for photograph ${frame.assetId}.`), { code: 'CAPTIONS_REQUIRED' });
    captionKeys.add(key);
  }
  const sections = direction.sections.map(section => ({ ...section, assetIds: frames.filter(frame => frame.sectionId === section.id).map(frame => frame.assetId) })).filter(section => section.assetIds.length);
  delivery.title = direction.title;
  delivery.creativeDirection = { ...direction, sections, frames };
  if (supportsDeliveryMusic(format) && !delivery.soundtrack && direction.music?.trackId) {
    const track = deliverySoundtrack(direction.music.trackId);
    if (track) delivery.soundtrack = {
      catalogId: track.id,
      title: track.title,
      creator: track.creator,
      genre: track.genre,
      mood: track.mood,
      tempo: track.tempo,
      energy: track.energy,
      narrationFit: track.narrationFit,
      tags: track.tags,
      sourceTags: track.sourceTags,
      sourceDescription: track.sourceDescription,
      isAiGenerated: track.isAiGenerated,
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
      selectedBy: 'creative-director'
    };
  }
  delivery.status = 'review';
  delivery.markModified('creativeDirection');
  delivery.markModified('soundtrack');
  await delivery.save();
  await saveJob(job, { status: 'review', stage: 'ready-to-review', progress: 100, result: { direction, frames }, completedAt: new Date() });
}

async function narrate(job, delivery) {
  if (!supportsDeliveryNarration(delivery.format)) {
    throw Object.assign(new Error('Narration is only available for Photo Story deliveries.'), { code: 'NARRATION_FORMAT_UNSUPPORTED' });
  }
  await saveJob(job, { stage: 'recording-narration', progress: 20 });
  delivery.narration = await generateNarration(delivery, job.input || {});
  delivery.markModified('narration');
  await delivery.save();
  await saveJob(job, { status: 'review', stage: 'narration-ready', progress: 100, result: { narration: delivery.narration }, completedAt: new Date() });
}

async function revise(job, delivery) {
  const { scope, instruction, assetIds = [] } = job.input || {};
  if (scope === 'full') return direct(job, delivery);
  const selected = new Set(assetIds);
  const insights = delivery.assets.filter(asset => selected.has(asset.assetId)).map(asset => asset.analysis).filter(Boolean);
  if (insights.length !== selected.size) throw Object.assign(new Error('One of the selected photographs has no analysis.'), { code: 'ANALYSIS_REQUIRED' });
  const currentFrames = delivery.creativeDirection.frames.filter(frame => selected.has(frame.assetId));
  await saveJob(job, { stage: 'revising-selected-photographs', progress: 20 });
  const result = await createFrameBatch({ format: delivery.format, brief: delivery.brief, shootType: delivery.shootType, clientName: delivery.clientName, direction: delivery.creativeDirection, imageInsights: insights, revisionInstruction: instruction, currentFrames });
  if (result.frames.some((frame, index) => frame.assetId !== insights[index]?.assetId)) throw Object.assign(new Error('The creative model changed the selected photograph order.'), { code: 'INVALID_FRAME_SEQUENCE' });
  const sectionIds = new Set(delivery.creativeDirection.sections.map(section => section.id));
  if (result.frames.some(frame => !sectionIds.has(frame.sectionId))) throw Object.assign(new Error('The creative model returned an unknown section.'), { code: 'INVALID_FRAME_SECTION' });
  const replacements = new Map(result.frames.map(frame => [frame.assetId, frame]));
  delivery.creativeDirection.frames = delivery.creativeDirection.frames.map(frame => replacements.get(frame.assetId) || frame);
  delivery.creativeDirection.sections = delivery.creativeDirection.sections.map(section => ({ ...section, assetIds: delivery.creativeDirection.frames.filter(frame => frame.sectionId === section.id).map(frame => frame.assetId) })).filter(section => section.assetIds.length);
  delivery.narration = undefined;
  delivery.status = 'review'; delivery.reviewApprovedAt = undefined; delivery.markModified('creativeDirection'); await delivery.save();
  await saveJob(job, { status: 'review', stage: 'revision-ready', progress: 100, result: { frames: result.frames }, completedAt: new Date() });
}

async function run(job) {
  const startedAt = Date.now();
  try {
    const delivery = await Delivery.findOne({ _id: job.deliveryId, userId: job.userId });
    if (!delivery) throw Object.assign(new Error('This delivery no longer exists.'), { code: 'DELIVERY_NOT_FOUND' });
    if (job.type === 'analyze') await analyze(job, delivery);
    else if (job.type === 'direct') await direct(job, delivery);
    else if (job.type === 'revise') await revise(job, delivery);
    else if (job.type === 'narrate') await narrate(job, delivery);
    if (job.type === 'direct' && delivery.soundtrack?.catalogId) recordAnalyticsEventAsync({ name: 'soundtrack.selected', source: 'system', actorType: 'system', userId: job.userId, deliveryId: job.deliveryId, format: delivery.format, status: 'selected', metadata: { trackId: delivery.soundtrack.catalogId, selectionType: 'creative-director' } });
    if (job.type === 'narrate') recordAnalyticsEventAsync({ name: 'narration.generated', source: 'system', actorType: 'system', userId: job.userId, deliveryId: job.deliveryId, format: delivery.format, status: 'completed', durationMs: Date.now() - startedAt, metadata: { voiceId: delivery.narration?.voiceId || 'flux-hannah-en', provider: 'Deepgram Flux', renderVersion: delivery.narration?.renderVersion || null } });
    const latest = await DeliveryJob.findById(job._id).select('cancelRequestedAt status').lean();
    if (latest?.cancelRequestedAt || latest?.status === 'cancelled') {
      await DeliveryJob.updateOne({ _id: job._id }, { $set: { status: 'cancelled', stage: 'cancelled', cancelledAt: new Date(), completedAt: new Date(), providerLatencyMs: Date.now() - startedAt } });
      recordAnalyticsEventAsync({ name: 'ai.job.cancelled', source: 'system', actorType: 'system', userId: job.userId, deliveryId: job.deliveryId, status: 'cancelled', durationMs: Date.now() - startedAt, metadata: { jobType: job.type, provider: job.provider || CREATIVE_DIRECTOR_PROVIDER } });
      return;
    }
    await DeliveryJob.updateOne({ _id: job._id }, { $set: { providerLatencyMs: Date.now() - startedAt } });
    recordAnalyticsEventAsync({ name: 'ai.job.completed', source: 'system', actorType: 'system', userId: job.userId, deliveryId: job.deliveryId, status: 'completed', durationMs: Date.now() - startedAt, metadata: { jobType: job.type, provider: job.provider || (job.type === 'narrate' ? 'Deepgram Flux' : CREATIVE_DIRECTOR_PROVIDER), promptVersion: job.promptVersion || CREATIVE_DIRECTOR_PROMPT_VERSION, renderVersion: job.renderVersion || null } });
  } catch (error) {
    const latest = await DeliveryJob.findById(job._id).select('cancelRequestedAt').lean();
    if (latest?.cancelRequestedAt) {
      await DeliveryJob.updateOne({ _id: job._id }, { $set: { status: 'cancelled', stage: 'cancelled', cancelledAt: new Date(), completedAt: new Date(), providerLatencyMs: Date.now() - startedAt } });
      return;
    }
    const failureUpdate = { status: 'failed', stage: 'failed', errorCode: error.code || 'GENERATION_FAILED', errorMessage: String(error.message || 'Generation failed.').slice(0, 500), completedAt: new Date(), providerLatencyMs: Date.now() - startedAt };
    if (error.code === 'CAPTIONS_REQUIRED' || error.code === 'INVALID_MODEL_OUTPUT') failureUpdate.captionFailures = 1;
    if (error.code === 'NARRATION_TIMING_FAILED') failureUpdate.timingFailures = 1;
    await saveJob(job, failureUpdate);
    await Delivery.updateOne({ _id: job.deliveryId }, { status: ['narrate', 'revise'].includes(job.type) ? 'review' : 'draft' });
    recordAnalyticsEventAsync({
      name: 'ai.job.failed',
      source: 'server',
      actorType: 'system',
      userId: job.userId,
      deliveryId: job.deliveryId,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      errorCode: error.code || 'GENERATION_FAILED',
      metadata: { jobType: job.type, worker: 'delivery', provider: job.provider || (job.type === 'narrate' ? 'Deepgram Flux' : CREATIVE_DIRECTOR_PROVIDER), promptVersion: job.promptVersion || CREATIVE_DIRECTOR_PROMPT_VERSION, renderVersion: job.renderVersion || null }
    });
    if (job.type === 'narrate') recordAnalyticsEventAsync({ name: error.code === 'NARRATION_TIMING_FAILED' ? 'narration.timing.failed' : 'narration.failed', source: 'system', actorType: 'system', userId: job.userId, deliveryId: job.deliveryId, status: 'failed', durationMs: Date.now() - startedAt, errorCode: error.code || 'NARRATION_FAILED', metadata: { provider: 'Deepgram Flux', renderVersion: job.renderVersion || null } });
    console.error(`[delivery-worker/${job.type}]`, error.code || error.name, error.message);
  }
}

async function tick() {
  if (polling) return;
  polling = true;
  try {
    await refreshProviderQuotas();
    await recordWorkerHeartbeat('delivery', { status: activeJobs.size ? 'busy' : 'idle', stage: 'polling', details: { activeJobs: activeJobs.size, maxJobs: effectiveJobConcurrency, aiConcurrency: effectiveAiBatchConcurrency, quotaModels: Object.keys(quotaSnapshot) } });
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    await DeliveryJob.updateMany({ status: 'running', $or: [{ heartbeatAt: { $lt: stale } }, { heartbeatAt: { $exists: false } }], attempts: { $lt: 3 } }, { status: 'queued', lockedBy: null });
    await DeliveryJob.updateMany({ status: 'running', $or: [{ heartbeatAt: { $lt: stale } }, { heartbeatAt: { $exists: false } }], attempts: { $gte: 3 } }, { status: 'failed', stage: 'failed', errorCode: 'WORKER_INTERRUPTED', errorMessage: 'The server stopped before this job finished. Retry it from the delivery review.', completedAt: new Date(), lockedBy: null });

    while (activeJobs.size < effectiveJobConcurrency) {
      const filter = { status: 'queued', attempts: { $lt: 3 }, cancelRequestedAt: null };
      if (activeDeliveryIds.size) filter.deliveryId = { $nin: [...activeDeliveryIds] };
      const job = await DeliveryJob.findOneAndUpdate(filter, { $set: { status: 'running', stage: 'starting', lockedAt: new Date(), heartbeatAt: new Date(), lockedBy: workerId }, $inc: { attempts: 1 } }, { new: true, sort: { createdAt: 1 } }).select('+input');
      if (!job) break;
      const jobId = String(job._id);
      const deliveryId = String(job.deliveryId);
      activeDeliveryIds.add(deliveryId);
      const promise = (async () => {
        await recordWorkerHeartbeat('delivery', { status: 'busy', stage: job.type, details: { jobId, activeJobs: activeJobs.size, maxJobs: effectiveJobConcurrency, aiConcurrency: effectiveAiBatchConcurrency } });
        await run(job);
      })().catch(error => {
        console.error(`[delivery-worker/${job.type}]`, error.message);
      }).finally(async () => {
        activeJobs.delete(jobId);
        activeDeliveryIds.delete(deliveryId);
        await recordWorkerHeartbeat('delivery', { status: activeJobs.size ? 'busy' : 'idle', stage: 'polling', details: { activeJobs: activeJobs.size, maxJobs: effectiveJobConcurrency, aiConcurrency: effectiveAiBatchConcurrency, quotaModels: Object.keys(quotaSnapshot) } });
      });
      activeJobs.set(jobId, promise);
    }
  } catch (error) {
    console.error('[delivery-worker]', error.message);
  } finally {
    polling = false;
  }
}

export function startDeliveryWorker() {
  if (timer) return;
  // server.js loads dotenv before calling this function. Reading settings here
  // keeps local `.env` values effective even though ES module imports are
  // evaluated before dotenv.config().
  readWorkerSettings();
  timer = setInterval(tick, 5000);
  timer.unref?.();
  tick();
}
