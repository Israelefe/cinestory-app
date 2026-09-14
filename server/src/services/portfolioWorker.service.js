import Portfolio from '../models/Portfolio.js';
import PortfolioJob from '../models/PortfolioJob.js';
import { analyzeImageBatch, createPortfolioDirection } from './alibabaCreativeDirector.service.js';
import { signedImageUrl } from './deliveryMedia.service.js';

let busy = false;
let timer;

async function work(job) {
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
    const positions = new Map(direction.orderedPublicIds.map((id, index) => [id, index]));
    portfolio.items.forEach(item => { item.sortOrder = positions.get(item.publicId); });
    portfolio.headline = direction.headline; portfolio.introLine = direction.introLine; portfolio.direction = { background: direction.background, accent: direction.accent, typeStyle: direction.typeStyle, rhythm: direction.rhythm }; portfolio.markModified('items'); await portfolio.save();
    job.status = 'review'; job.stage = 'ready-to-review'; job.progress = 100; job.completedAt = new Date(); job.result = { insights, direction }; job.markModified('result'); await job.save();
  } catch (error) {
    job.status = 'failed'; job.stage = 'failed'; job.errorMessage = String(error.message || 'Portfolio direction failed.').slice(0, 500); job.completedAt = new Date(); await job.save();
    console.error('[portfolio-worker]', error.message);
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    await PortfolioJob.updateMany({ status: 'running', lockedAt: { $lt: stale }, attempts: { $lt: 3 } }, { status: 'queued' });
    await PortfolioJob.updateMany({ status: 'running', lockedAt: { $lt: stale }, attempts: { $gte: 3 } }, { status: 'failed', stage: 'failed', errorMessage: 'The server stopped before this portfolio was finished. Run the direction again.', completedAt: new Date() });
    const job = await PortfolioJob.findOneAndUpdate({ status: 'queued', attempts: { $lt: 3 } }, { $set: { status: 'running', stage: 'starting', lockedAt: new Date() }, $inc: { attempts: 1 } }, { new: true, sort: { createdAt: 1 } });
    if (job) await work(job);
  } catch (error) { console.error('[portfolio-worker/tick]', error.message); }
  finally { busy = false; }
}

export function startPortfolioWorker() {
  if (timer) return;
  timer = setInterval(tick, 5000); timer.unref?.(); tick();
}
