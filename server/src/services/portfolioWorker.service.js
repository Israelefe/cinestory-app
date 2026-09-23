import Portfolio from '../models/Portfolio.js';
import PortfolioJob from '../models/PortfolioJob.js';
import { CREATIVE_DIRECTOR_PROVIDER, CREATIVE_DIRECTOR_PROMPT_VERSION, analyzeImageBatch, createPortfolioDirection } from './alibabaCreativeDirector.service.js';
import { signedImageUrl } from './deliveryMedia.service.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';
import { recordWorkerHeartbeat } from './workerHeartbeat.service.js';

let busy = false;
let timer;

async function work(job) {
  const startedAt = Date.now();
  try {
    const portfolio = await Portfolio.findOne({ _id: job.portfolioId, userId: job.userId });
    if (!portfolio) throw new Error('This portfolio no longer exists.');
    const insights = Array.isArray(job.result?.insights) ? job.result.insights : [];
    for (let offset = job.cursor || 0; offset < portfolio.items.length; offset += 20) {
      const batch = portfolio.items.slice(offset, offset + 20).map(item => ({ assetId: item.publicId, analysisUrl: signedImageUrl(item.publicId, { width: 1024 }) }));
      const next = await analyzeImageBatch({ brief: portfolio.bio, shootType: 'Selected portfolio work', clientName: portfolio.studioName, assets: batch });
      insights.push(...next);
      job.cursor = offset + batch.length; job.progress = Math.min(75, Math.round((job.cursor / portfolio.items.length) * 75)); job.stage = 'reading-selected-work'; job.result = { insights }; job.markModified('result'); await job.save();
    }
    const direction = await createPortfolioDirection({ studioName: portfolio.studioName, bio: portfolio.bio, location: portfolio.location, items: portfolio.items.map(item => ({ publicId: item.publicId, title: item.title, category: item.category })), imageInsights: insights });
    const latest = await PortfolioJob.findById(job._id).select('cancelRequestedAt status').lean();
    if (latest?.cancelRequestedAt || latest?.status === 'cancelled') {
      await PortfolioJob.updateOne({ _id: job._id }, { $set: { status: 'cancelled', stage: 'cancelled', cancelledAt: new Date(), completedAt: new Date(), providerLatencyMs: Date.now() - startedAt } });
      return;
    }
    job.status = 'review'; job.stage = 'ready-to-review'; job.progress = 100; job.completedAt = new Date(); job.result = { insights, direction }; job.providerLatencyMs = Date.now() - startedAt; job.provider = job.provider || CREATIVE_DIRECTOR_PROVIDER; job.promptVersion = job.promptVersion || CREATIVE_DIRECTOR_PROMPT_VERSION; job.markModified('result'); await job.save();
    recordAnalyticsEventAsync({ name: 'ai.job.completed', source: 'system', actorType: 'system', userId: job.userId, status: 'completed', durationMs: Date.now() - startedAt, metadata: { jobType: 'portfolio', worker: 'portfolio', provider: job.provider, promptVersion: job.promptVersion } });
  } catch (error) {
    const latest = await PortfolioJob.findById(job._id).select('cancelRequestedAt').lean();
    if (latest?.cancelRequestedAt) {
      await PortfolioJob.updateOne({ _id: job._id }, { $set: { status: 'cancelled', stage: 'cancelled', cancelledAt: new Date(), completedAt: new Date(), providerLatencyMs: Date.now() - startedAt } });
      return;
    }
    job.status = 'failed'; job.stage = 'failed'; job.errorCode = error.code || 'PORTFOLIO_DIRECTION_FAILED'; job.errorMessage = String(error.message || 'Portfolio direction failed.').slice(0, 500); job.completedAt = new Date(); job.providerLatencyMs = Date.now() - startedAt; job.provider = job.provider || CREATIVE_DIRECTOR_PROVIDER; job.promptVersion = job.promptVersion || CREATIVE_DIRECTOR_PROMPT_VERSION; await job.save();
    recordAnalyticsEventAsync({ name: 'ai.job.failed', source: 'server', actorType: 'system', userId: job.userId, status: 'failed', durationMs: Date.now() - startedAt, errorCode: error.code || 'PORTFOLIO_DIRECTION_FAILED', metadata: { jobType: 'portfolio', worker: 'portfolio', provider: job.provider, promptVersion: job.promptVersion } });
    console.error('[portfolio-worker]', error.message);
  }
}

async function tick() {
  if (busy) {
    recordWorkerHeartbeat('portfolio', { status: 'busy', stage: 'running' });
    return;
  }
  busy = true;
  try {
    await recordWorkerHeartbeat('portfolio', { status: 'busy', stage: 'polling' });
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    await PortfolioJob.updateMany({ status: 'running', lockedAt: { $lt: stale }, attempts: { $lt: 3 } }, { status: 'queued' });
    await PortfolioJob.updateMany({ status: 'running', lockedAt: { $lt: stale }, attempts: { $gte: 3 } }, { status: 'failed', stage: 'failed', errorMessage: 'The server stopped before this portfolio was finished. Run the direction again.', completedAt: new Date() });
    const job = await PortfolioJob.findOneAndUpdate({ status: 'queued', attempts: { $lt: 3 }, cancelRequestedAt: null }, { $set: { status: 'running', stage: 'starting', lockedAt: new Date() }, $inc: { attempts: 1 } }, { new: true, sort: { createdAt: 1 } });
    if (job) {
      await recordWorkerHeartbeat('portfolio', { status: 'busy', stage: 'portfolio-direction', details: { jobId: String(job._id) } });
      await work(job);
    }
  } catch (error) { console.error('[portfolio-worker/tick]', error.message); }
  finally {
    busy = false;
    await recordWorkerHeartbeat('portfolio', { status: 'idle', stage: 'polling' });
  }
}

export function startPortfolioWorker() {
  if (timer) return;
  timer = setInterval(tick, 5000); timer.unref?.(); tick();
}
