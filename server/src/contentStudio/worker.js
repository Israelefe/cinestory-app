import crypto from 'node:crypto';
import ContentProject from '../models/ContentProject.js';
import { analyzeImage, directCampaign, generateImage, narrate, wordTimings } from './providers.js';
import { mediaUrl, uploadMedia, studioError } from './media.js';
import { makeScore, makeTransitionSound, MUSIC } from './audio.js';
import { planSchema, briefSchema } from './schema.js';
import { exportCampaign, prepareRenderer } from './render.js';
import { recordWorkerHeartbeat, workerInstance } from '../services/workerHeartbeat.service.js';
import { timeline } from '../../../admin/src/content-studio/timing.js';

export async function processProject(project, parentSignal) {
  const controller = new AbortController();
  const { signal } = controller;
  const stop = () => controller.abort(studioError('The local worker stopped. Retry to resume this campaign.', 503));
  parentSignal?.addEventListener('abort', stop, { once: true });
  if (parentSignal?.aborted) stop();
  const lease = { _id: project._id, 'job.id': project.job.id, 'job.lockedBy': project.job.lockedBy, 'job.status': 'running' };
  let stage = 'Reading campaign', progress = 2, heartbeatRunning = false;
  const beat = async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      const updated = await ContentProject.findOneAndUpdate({ ...lease, 'job.cancelRequested': { $ne: true } }, { $set: { 'job.heartbeatAt': new Date(), 'job.stage': stage, 'job.progress': progress } }, { new: true }).select('_id').lean();
      if (!updated) controller.abort(studioError('This job was cancelled or its worker lease expired.', 409));
      await recordWorkerHeartbeat('content-studio', { status: 'busy', stage });
    } catch { controller.abort(studioError('The worker lost its database connection. Retry when it reconnects.', 503)); }
    finally { heartbeatRunning = false; }
  };
  const heartbeat = setInterval(beat, 5000);
  const update = (label, value) => { stage = label; progress = Math.round(value); };
  const checkpoint = async () => {
    signal.throwIfAborted();
    const result = await ContentProject.updateOne({ ...lease, 'job.cancelRequested': { $ne: true } }, { $set: { assets: project.assets, versions: project.versions, activeVersionId: project.activeVersionId, title: project.title, 'job.stage': stage, 'job.progress': progress } });
    if (!result.matchedCount) { controller.abort(); signal.throwIfAborted(); }
  };
  try {
    await beat();
    signal.throwIfAborted();
    briefSchema.parse(project.brief);
    let version = project.versions.find(value => value.id === project.job.versionId);
    if (!version) {
      for (let i = 0; i < project.assets.length; i++) {
        signal.throwIfAborted();
        const asset = project.assets[i];
        if (asset.analysis) continue;
        update(`Reading image ${i + 1} of ${project.assets.length}`, 3 + i / Math.max(1, project.assets.length) * 15);
        asset.analysis = await analyzeImage(asset, signal);
        await checkpoint();
      }
      update('Writing the concept, script and visual direction', 22);
      const recent = await ContentProject.find({ ownerId: project.ownerId, _id: { $ne: project._id } }).sort({ updatedAt: -1 }).limit(12).select('title versions.plan.angle').lean();
      const previous = project.versions.find(value => value.id === project.activeVersionId);
      const plan = await directCampaign({ project, previous, history: recent.map(value => ({ title: value.title, angle: value.versions.at(-1)?.plan?.angle })), instruction: project.job.instruction, sceneId: project.job.sceneId, signal });
      version = { id: project.job.versionId, createdAt: new Date().toISOString(), instruction: project.job.instruction || 'First direction', brief: { ...project.brief }, plan, generatedAssets: [], voice: {}, outputs: [] };
      if (previous && project.job.kind === 'revise') {
        version.generatedAssets = structuredClone(previous.generatedAssets || []);
        for (const scene of plan.scenes) {
          const old = previous.plan.scenes.find(value => value.id === scene.id);
          if (old?.narration === scene.narration && previous.voice?.[scene.id]) version.voice[scene.id] = structuredClone(previous.voice[scene.id]);
        }
      }
      project.versions.push(version);
      project.activeVersionId = version.id;
      project.title = plan.title;
      await checkpoint();
    }
    planSchema.parse(version.plan);
    if (version.plan.requiredAssets.length) {
      const settled = await ContentProject.updateOne({ ...lease, 'job.cancelRequested': { $ne: true } }, { $set: { 'job.status': 'needs_assets', 'job.stage': 'A few images are needed', 'job.progress': 25, 'job.completedAt': new Date() } });
      if (!settled.matchedCount) throw studioError('The job was cancelled.', 409);
      return;
    }
    for (let i = 0; i < version.plan.scenes.length; i++) {
      signal.throwIfAborted();
      const scene = version.plan.scenes[i];
      if (!scene.generatedImagePrompt) continue;
      const cached = version.generatedAssets.find(asset => asset.prompt === scene.generatedImagePrompt);
      if (cached) { scene.assetIds = [cached.id]; continue; }
      update(`Creating supporting image for scene ${i + 1}`, 28 + i / version.plan.scenes.length * 15);
      const image = await generateImage(scene.generatedImagePrompt, signal);
      const id = `generated-${crypto.randomUUID()}`;
      const uploaded = await uploadMedia(image.buffer, { projectId: project._id, key: `${version.id}/images/${scene.id}` });
      version.generatedAssets.push({ id, publicId: uploaded.public_id, width: image.width, height: image.height, kind: 'generated', prompt: scene.generatedImagePrompt });
      scene.assetIds = [id];
      await checkpoint();
    }
    if (version.brief.formats.includes('video')) {
      if (version.brief.narration) {
        for (let i = 0; i < version.plan.scenes.length; i++) {
          signal.throwIfAborted();
          const scene = version.plan.scenes[i];
          if (!scene.narration) continue;
          update(`Recording voice-over ${i + 1} of ${version.plan.scenes.length}`, 44 + i / version.plan.scenes.length * 13);
          let record = version.voice[scene.id];
          let audio;
          if (!record) {
            audio = await narrate(scene.narration, signal);
            const uploaded = await uploadMedia(audio, { projectId: project._id, key: `${version.id}/voice/${scene.id}`, resourceType: 'video', format: 'mp3' });
            if (!uploaded.duration || uploaded.duration > 30) throw studioError('A narration segment is too long. Shorten this scene and regenerate.');
            record = { publicId: uploaded.public_id, duration: uploaded.duration, words: [] };
            version.voice[scene.id] = record;
            await checkpoint();
          }
          if (!record.words?.length) {
            if (!audio) {
              const response = await fetch(mediaUrl(record.publicId, { resourceType: 'video', format: 'mp3' }), { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
              if (!response.ok) throw studioError('Saved narration could not be loaded. Please retry.', 502);
              audio = Buffer.from(await response.arrayBuffer());
            }
            record.words = await wordTimings(audio, signal);
            await checkpoint();
          }
        }
      }
      update('Arranging the score and scene timing', 59);
      const duration = timeline(version.plan, version.voice, version.brief.music ? MUSIC[version.plan.musicMood] : null).reduce((sum, entry) => sum + entry.frames / 30, 0);
      if (duration > 150) throw studioError('This script is too long for the content engine. Request a shorter version.');
      if (version.brief.music && !version.music) {
        const score = makeScore(version.plan.musicMood, duration + 1);
        const uploaded = await uploadMedia(score.buffer, { projectId: project._id, key: `${version.id}/audio/score`, resourceType: 'video', format: 'wav' });
        version.music = { publicId: uploaded.public_id, bpm: score.bpm };
        await checkpoint();
      }
      if (version.brief.soundDesign && !version.effect) {
        const uploaded = await uploadMedia(makeTransitionSound(), { projectId: project._id, key: `${version.id}/audio/transition`, resourceType: 'video', format: 'wav' });
        version.effect = { publicId: uploaded.public_id };
        await checkpoint();
      }
    }
    update('Preparing final exports', 65);
    await exportCampaign({ project, version, signal, checkpoint, progress: update });
    await checkpoint();
    const settled = await ContentProject.updateOne({ ...lease, 'job.cancelRequested': { $ne: true } }, { $set: { 'job.status': 'ready', 'job.progress': 100, 'job.stage': 'Ready to post', 'job.error': '', 'job.completedAt': new Date() } });
    if (!settled.matchedCount) throw studioError('The job was cancelled.', 409);
  } catch (error) {
    const current = await ContentProject.findOne(lease).select('job.cancelRequested').lean().catch(() => null);
    const cancelled = current?.job.cancelRequested;
    await ContentProject.updateOne(lease, { $set: { 'job.status': cancelled ? 'cancelled' : 'failed', 'job.error': cancelled ? '' : error.safe ? error.message : 'This content job stopped before completion. Retry to resume from the last saved step.', 'job.stage': cancelled ? 'Cancelled' : 'Needs a retry', 'job.completedAt': new Date() } }).catch(() => {});
    if (!cancelled) console.error('[content-studio/worker]', error.name || 'Error', error.safe ? error.message : 'Job failed; provider output withheld.');
  } finally { clearInterval(heartbeat); parentSignal?.removeEventListener('abort', stop); }
}

export async function runContentWorker({ signal }) {
  await prepareRenderer();
  while (!signal.aborted) {
    await recordWorkerHeartbeat('content-studio');
    await ContentProject.updateMany({ 'job.status': 'running', 'job.heartbeatAt': { $lt: new Date(Date.now() - 180_000) } }, { $set: { 'job.status': 'failed', 'job.stage': 'Worker interrupted', 'job.error': 'The worker stopped. Retry to resume from the last saved step.' } });
    const project = await ContentProject.findOneAndUpdate({ 'job.status': 'queued', 'job.cancelRequested': { $ne: true } }, { $set: { 'job.status': 'running', 'job.lockedBy': `${workerInstance()}:${crypto.randomUUID()}`, 'job.heartbeatAt': new Date() }, $inc: { 'job.attempts': 1 } }, { sort: { 'job.queuedAt': 1 }, new: true }).lean();
    if (project) await processProject(project, signal);
    else await new Promise(resolve => setTimeout(resolve, 2500));
  }
}
