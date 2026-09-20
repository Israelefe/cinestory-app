import os from 'os';
import Delivery from '../models/Delivery.js';
import DeliveryJob from '../models/DeliveryJob.js';
import { analyzeImageBatch, createFrameBatch, createGlobalDirection, recommendFormats } from './alibabaCreativeDirector.service.js';
import { signedImageUrl } from './deliveryMedia.service.js';
import { generateNarration } from './narration.service.js';
import { deliverySoundtrack } from '../constants/deliverySoundtracks.js';

const workerId = `${os.hostname()}:${process.pid}`;
let timer;
let busy = false;

async function saveJob(job, update) {
  Object.assign(job, update, { heartbeatAt: new Date() });
  job.markModified('result');
  await job.save();
}

async function analyze(job, delivery) {
  delivery.status = 'analyzing';
  await delivery.save();
  const assets = delivery.assets.sort((a, b) => a.sortOrder - b.sortOrder);
  const startOffset = job.cursor || 0;
  const insights = startOffset > 0 && Array.isArray(job.result?.insights) ? [...job.result.insights] : [];
  for (let offset = startOffset; offset < assets.length; offset += 20) {
    const batch = assets.slice(offset, offset + 20).map(asset => ({ assetId: asset.assetId, analysisUrl: signedImageUrl(asset.publicId, { width: 1024 }) }));
    const batchInsights = await analyzeImageBatch({ brief: delivery.brief, shootType: delivery.shootType, clientName: delivery.clientName, assets: batch });
    insights.push(...batchInsights);
    await saveJob(job, { stage: 'reading-photographs', cursor: offset + batch.length, progress: Math.min(80, Math.round(((offset + batch.length) / assets.length) * 80)), result: { insights } });
  }
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
  await saveJob(job, { status: 'review', stage: 'format-ready', progress: 100, result: { insights, recommendation }, completedAt: new Date() });
}

async function direct(job, delivery) {
  const format = job.input?.format;
  delivery.status = 'directing';
  delivery.format = format;
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
  for (let offset = job.cursor || 0; offset < insights.length; offset += 20) {
    const batch = insights.slice(offset, offset + 20);
    const result = await createFrameBatch({ format, brief: delivery.brief, shootType: delivery.shootType, clientName: delivery.clientName, direction, imageInsights: batch, revisionInstruction: job.input?.instruction || '', currentFrames: job.type === 'revise' ? (delivery.creativeDirection?.frames || []).filter(frame => batch.some(item => item.assetId === frame.assetId)) : [] });
    const frameMap = new Map((result.frames || []).map(frame => [frame.assetId, frame]));
    const alignedFrames = batch.map((item, index) => {
      const frame = frameMap.get(item.assetId);
      if (!frame) throw Object.assign(new Error(`No approved caption was returned for photograph ${item.assetId}.`), { code: 'CAPTIONS_REQUIRED' });
      if (!sectionIds.has(frame.sectionId)) frame.sectionId = defaultSectionId;
      frame.assetId = item.assetId;
      if (typeof frame.caption !== 'string' || frame.caption.trim().length < 18) throw Object.assign(new Error(`Caption is missing for photograph ${item.assetId}.`), { code: 'CAPTIONS_REQUIRED' });
      return frame;
    });
    frames.push(...alignedFrames);
    await saveJob(job, { stage: 'directing-photographs', cursor: offset + batch.length, progress: 18 + Math.round(((offset + batch.length) / insights.length) * 78), result: { direction, frames } });
  }
  const sections = direction.sections.map(section => ({ ...section, assetIds: frames.filter(frame => frame.sectionId === section.id).map(frame => frame.assetId) })).filter(section => section.assetIds.length);
  delivery.title = direction.title;
  delivery.creativeDirection = { ...direction, sections, frames };
  if (!delivery.soundtrack && direction.music?.trackId) {
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
  try {
    const delivery = await Delivery.findOne({ _id: job.deliveryId, userId: job.userId });
    if (!delivery) throw Object.assign(new Error('This delivery no longer exists.'), { code: 'DELIVERY_NOT_FOUND' });
    if (job.type === 'analyze') await analyze(job, delivery);
    else if (job.type === 'direct') await direct(job, delivery);
    else if (job.type === 'revise') await revise(job, delivery);
    else if (job.type === 'narrate') await narrate(job, delivery);
  } catch (error) {
    await saveJob(job, { status: 'failed', stage: 'failed', errorCode: error.code || 'GENERATION_FAILED', errorMessage: String(error.message || 'Generation failed.').slice(0, 500), completedAt: new Date() });
    await Delivery.updateOne({ _id: job.deliveryId }, { status: ['narrate', 'revise'].includes(job.type) ? 'review' : 'draft' });
    console.error(`[delivery-worker/${job.type}]`, error.code || error.name, error.message);
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    await DeliveryJob.updateMany({ status: 'running', $or: [{ heartbeatAt: { $lt: stale } }, { heartbeatAt: { $exists: false } }], attempts: { $lt: 3 } }, { status: 'queued', lockedBy: null });
    await DeliveryJob.updateMany({ status: 'running', $or: [{ heartbeatAt: { $lt: stale } }, { heartbeatAt: { $exists: false } }], attempts: { $gte: 3 } }, { status: 'failed', stage: 'failed', errorCode: 'WORKER_INTERRUPTED', errorMessage: 'The server stopped before this job finished. Retry it from the delivery review.', completedAt: new Date(), lockedBy: null });
    const job = await DeliveryJob.findOneAndUpdate({ status: 'queued', attempts: { $lt: 3 } }, { $set: { status: 'running', stage: 'starting', lockedAt: new Date(), heartbeatAt: new Date(), lockedBy: workerId }, $inc: { attempts: 1 } }, { new: true, sort: { createdAt: 1 } }).select('+input');
    if (job) await run(job);
  } catch (error) { console.error('[delivery-worker]', error.message); }
  finally { busy = false; }
}

export function startDeliveryWorker() {
  if (timer) return;
  timer = setInterval(tick, 5000);
  timer.unref?.();
  tick();
}
