import crypto from 'node:crypto';
import Portfolio from '../models/Portfolio.js';
import PortfolioJob from '../models/PortfolioJob.js';
import PortfolioMedia from '../models/PortfolioMedia.js';
import { normalizeSnapshot } from '../utils/portfolio.js';
import { analyzeImageBatch, createPortfolioDirection } from './alibabaCreativeDirector.service.js';
import { preparePortfolioSet } from './portfolioMedia.service.js';
import { processPortfolioRemovals } from './portfolioLifecycle.service.js';
import { recordAnalyticsEventAsync } from './analytics.service.js';
import { recordWorkerHeartbeat } from './workerHeartbeat.service.js';
import { processPortfolioEnquiryNotifications } from './portfolioEnquiry.service.js';
let busy = false;
let timer;
async function work(job) {
  const startedAt = Date.now();
  const lease = {
    _id: job._id,
    status: 'running',
    leaseId: job.leaseId,
    cancelRequestedAt: null
  };
  const heartbeat = setInterval(() => {
    void PortfolioJob.updateOne(lease, {
      $set: {
        lockedAt: new Date()
      }
    }).catch(() => {});
  }, 30000);
  heartbeat.unref?.();
  try {
    const portfolio = await Portfolio.findOne({
      _id: job.portfolioId,
      userId: job.userId
    }).lean();
    if (!portfolio) throw new Error('This portfolio no longer exists.');
    const draft = job.input || normalizeSnapshot(portfolio.draft || portfolio);
    if (!job.input) await PortfolioJob.updateOne(lease, {
      $set: {
        input: draft,
        inputRevision: portfolio.draftRevision || 0
      }
    });
    await preparePortfolioSet(draft.items);
    const media = await PortfolioMedia.find({
      publicId: {
        $in: draft.items.map(item => item.publicId)
      }
    }).lean();
    const urls = new Map(media.map(item => [item.publicId, item.variants['800']]));
    const insights = Array.isArray(job.result?.insights) ? [...job.result.insights] : [];
    for (let offset = job.cursor || 0; offset < draft.items.length; offset += 20) {
      if (!(await PortfolioJob.exists(lease))) return;
      const batch = draft.items.slice(offset, offset + 20).map(item => ({
        assetId: item.publicId,
        analysisUrl: urls.get(item.publicId)
      }));
      insights.push(...(await analyzeImageBatch({
        brief: draft.bio,
        shootType: 'Selected portfolio work',
        clientName: draft.studioName,
        assets: batch
      })));
      const result = await PortfolioJob.updateOne(lease, {
        $set: {
          cursor: offset + batch.length,
          progress: Math.min(75, Math.round((offset + batch.length) / draft.items.length * 75)),
          stage: 'reading-selected-work',
          result: {
            insights
          },
          lockedAt: new Date()
        }
      });
      if (!result.matchedCount) return;
    }
    if (!(await PortfolioJob.exists(lease))) return;
    const direction = await createPortfolioDirection({
      studioName: draft.studioName,
      bio: draft.bio,
      location: draft.location,
      items: draft.items,
      imageInsights: insights
    });
    direction.orderedPublicIds = [...new Set(direction.orderedPublicIds)].filter(id => draft.items.some(item => item.publicId === id));
    direction.orderedPublicIds.push(...draft.items.filter(item => !direction.orderedPublicIds.includes(item.publicId)).map(item => item.publicId));
    const completed = await PortfolioJob.updateOne(lease, {
      $set: {
        active: false,
        status: 'review',
        stage: 'ready-to-review',
        progress: 100,
        result: {
          insights,
          direction
        },
        completedAt: new Date(),
        providerLatencyMs: Date.now() - startedAt
      }
    });
    if (completed.modifiedCount) recordAnalyticsEventAsync({
      name: 'portfolio.direction.completed',
      source: 'system',
      actorType: 'system',
      userId: job.userId,
      status: 'completed',
      durationMs: Date.now() - startedAt,
      metadata: {
        portfolioId: String(job.portfolioId),
        jobType: 'portfolio',
        worker: 'portfolio'
      }
    });
  } catch (error) {
    const failed = await PortfolioJob.updateOne(lease, {
      $set: {
        active: false,
        status: 'failed',
        stage: 'failed',
        errorCode: 'PORTFOLIO_DIRECTION_FAILED',
        errorMessage: 'We could not finish this suggestion. Your photographs and draft are saved. Try again.',
        completedAt: new Date(),
        providerLatencyMs: Date.now() - startedAt
      }
    });
    if (failed.modifiedCount) recordAnalyticsEventAsync({
      name: 'portfolio.direction.failed',
      source: 'system',
      actorType: 'system',
      userId: job.userId,
      status: 'failed',
      metadata: {
        portfolioId: String(job.portfolioId),
        jobType: 'portfolio'
      }
    });
  } finally {
    clearInterval(heartbeat);
  }
}
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await recordWorkerHeartbeat('portfolio', {
      status: 'busy',
      stage: 'polling'
    });
    await processPortfolioRemovals();
    await processPortfolioEnquiryNotifications();
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    await PortfolioJob.updateMany({
      status: 'running',
      cancelRequestedAt: {
        $ne: null
      }
    }, {
      $set: {
        active: false,
        status: 'cancelled',
        stage: 'cancelled',
        cancelledAt: new Date()
      }
    });
    await PortfolioJob.updateMany({
      status: 'running',
      lockedAt: {
        $lt: stale
      },
      attempts: {
        $lt: 3
      }
    }, {
      $set: {
        status: 'queued'
      }
    });
    await PortfolioJob.updateMany({
      status: 'running',
      lockedAt: {
        $lt: stale
      },
      attempts: {
        $gte: 3
      }
    }, {
      $set: {
        active: false,
        status: 'failed',
        stage: 'failed',
        errorMessage: 'This suggestion stopped before finishing. Try again.',
        completedAt: new Date()
      }
    });
    const job = await PortfolioJob.findOneAndUpdate({
      status: 'queued',
      attempts: {
        $lt: 3
      },
      cancelRequestedAt: null
    }, {
      $set: {
        status: 'running',
        stage: 'starting',
        lockedAt: new Date(),
        leaseId: crypto.randomUUID()
      },
      $inc: {
        attempts: 1
      }
    }, {
      new: true,
      sort: {
        createdAt: 1
      }
    });
    if (job) await work(job);
  } catch (error) {
    console.error('[portfolio-worker]', error.code || 'PORTFOLIO_WORKER_FAILED');
  } finally {
    busy = false;
    await recordWorkerHeartbeat('portfolio', {
      status: 'idle',
      stage: 'polling'
    });
  }
}
export function startPortfolioWorker() {
  if (timer) return;
  timer = setInterval(tick, 5000);
  timer.unref?.();
  void tick();
}
