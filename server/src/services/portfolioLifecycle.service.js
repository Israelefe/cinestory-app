import Portfolio from '../models/Portfolio.js';
import PortfolioHandle from '../models/PortfolioHandle.js';
import PortfolioJob from '../models/PortfolioJob.js';
import PortfolioMedia from '../models/PortfolioMedia.js';
import PortfolioCleanup from '../models/PortfolioCleanup.js';
import Delivery from '../models/Delivery.js';
import StorageAsset from '../models/StorageAsset.js';
import { normalizeSnapshot, removeSnapshotPhotos } from '../utils/portfolio.js';

// Persist before deleting the source, so a process restart cannot lose cleanup.
export async function schedulePortfolioRemoval(userId, publicIds) {
  return PortfolioCleanup.create({
    userId,
    publicIds: [...new Set(publicIds)]
  });
}
export async function finishPortfolioRemoval(cleanup) {
  await removePortfolioReferences(cleanup.userId, cleanup.publicIds);
  await PortfolioCleanup.deleteOne({
    _id: cleanup._id
  });
}
export async function processPortfolioRemovals() {
  for (const cleanup of await PortfolioCleanup.find({}).sort({
    createdAt: 1
  }).limit(50).lean()) {
    try {
      const [deliveries, stored] = await Promise.all([Delivery.find({
        userId: cleanup.userId,
        'assets.publicId': {
          $in: cleanup.publicIds
        }
      }).select('assets.publicId').lean(), StorageAsset.find({
        userId: cleanup.userId,
        publicId: {
          $in: cleanup.publicIds
        }
      }).select('publicId').lean()]);
      const present = new Set([...stored.map(item => item.publicId), ...deliveries.flatMap(item => item.assets.map(photo => photo.publicId))]);
      const removed = cleanup.publicIds.filter(id => !present.has(id));
      if (removed.length) await removePortfolioReferences(cleanup.userId, removed);
      // A source can still exist while its deletion is in flight. Keep the
      // record until it disappears; discard failed deletion intents after a day.
      if (!present.size || Date.now() - new Date(cleanup.createdAt).getTime() > 86400000) await PortfolioCleanup.deleteOne({
        _id: cleanup._id
      });
    } catch {/* Retry on the next worker tick. */}
  }
}
export async function removePortfolioReferences(userId, publicIds) {
  const removed = new Set(publicIds);
  await PortfolioMedia.deleteMany({
    publicId: {
      $in: [...removed]
    }
  });
  // Revision compare-and-swap also protects an editor saving during deletion.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const portfolio = await Portfolio.findOne({
      userId
    }).lean();
    if (!portfolio) return;
    const live = normalizeSnapshot(portfolio);
    const draft = normalizeSnapshot(portfolio.draft || portfolio);
    if (![...live.items, ...draft.items].some(item => removed.has(item.publicId))) return;
    const nextLive = removeSnapshotPhotos(live, removed);
    const nextDraft = removeSnapshotPhotos(draft, removed);
    const visible = new Set([...nextLive.items.filter(item => item.featured).map(item => item.id), ...nextLive.projects.flatMap(project => project.photoIds)]);
    const result = await Portfolio.updateOne({
      _id: portfolio._id,
      draftRevision: portfolio.draftRevision || 0,
      publishedRevision: portfolio.publishedRevision || 0
    }, {
      $set: {
        items: nextLive.items,
        projects: nextLive.projects,
        heroPublicId: nextLive.heroPublicId,
        draft: nextDraft,
        status: portfolio.status === 'published' && (visible.size < 4 || !nextLive.heroPublicId) ? 'draft' : portfolio.status,
        mediaNotice: 'Deleted source photographs were removed from this portfolio. Check your cover and projects before publishing.'
      },
      $inc: {
        draftRevision: 1,
        publishedRevision: 1
      }
    });
    if (result.modifiedCount) {
      await Promise.all([PortfolioJob.updateMany({
        portfolioId: portfolio._id,
        active: true
      }, {
        $set: {
          active: false,
          status: 'cancelled',
          cancelRequestedAt: new Date(),
          cancelledAt: new Date()
        }
      }), PortfolioMedia.deleteMany({
        publicId: {
          $in: [...removed]
        }
      })]);
      return;
    }
  }
  throw new Error('Portfolio changed while source photographs were being removed. Retry cleanup.');
}
export async function auditPortfolioHandles() {
  const portfolios = await Portfolio.find({}).select('handle previousHandles').lean();
  const claims = new Map();
  const collisions = [];
  const now = new Date();
  for (const portfolio of portfolios) for (const entry of [{
    handle: portfolio.handle
  }, ...(portfolio.previousHandles || []).filter(entry => new Date(entry.reservedUntil) > now)]) {
    const prior = claims.get(entry.handle);
    if (prior && String(prior.portfolioId) !== String(portfolio._id)) collisions.push({
      handle: entry.handle,
      portfolioIds: [String(prior.portfolioId), String(portfolio._id)]
    });else claims.set(entry.handle, {
      handle: entry.handle,
      portfolioId: portfolio._id,
      ...(entry.reservedUntil ? {
        reservedUntil: entry.reservedUntil
      } : {})
    });
  }
  return {
    claims: [...claims.values()],
    collisions
  };
}
export async function migratePortfolioHandles() {
  const audit = await auditPortfolioHandles();
  if (audit.collisions.length) throw new Error('Portfolio addresses have conflicting reservations. Resolve the audit before migration.');
  await PortfolioHandle.init();
  for (const claim of audit.claims) {
    await PortfolioHandle.updateOne({
      handle: claim.handle,
      portfolioId: claim.portfolioId
    }, {
      $set: claim
    }, {
      upsert: true
    });
  }
  return audit;
}
