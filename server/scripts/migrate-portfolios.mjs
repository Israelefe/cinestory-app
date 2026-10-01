import 'dotenv/config';
import mongoose from 'mongoose';
import Portfolio from '../src/models/Portfolio.js';
import PortfolioJob from '../src/models/PortfolioJob.js';
import { normalizeSnapshot, snapshotErrors } from '../src/utils/portfolio.js';
import { auditPortfolioHandles, migratePortfolioHandles } from '../src/services/portfolioLifecycle.service.js';
import { preparePortfolioSet } from '../src/services/portfolioMedia.service.js';

const apply = process.argv.includes('--apply');
if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI before running this migration.');
try {
  await mongoose.connect(process.env.MONGODB_URI);
  const handles = await auditPortfolioHandles();
  const documents = await Portfolio.collection.find({}).toArray();
  const review = documents.map(document => ({ portfolioId: String(document._id), errors: snapshotErrors(normalizeSnapshot(document), { publish: document.status === 'published', existingHandle: document.handle }) })).filter(item => item.errors.length);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'audit', portfolios: documents.length, handleCollisions: handles.collisions, needsReview: review }, null, 2));
  if (handles.collisions.length || review.length) throw new Error('Resolve conflicting addresses or invalid published content before applying. No migration changes were made.');
  if (apply) {
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid') throw new Error('Publishing requires a MongoDB replica set or sharded cluster.');
    // Prepare all media before changing the stored content format.
    for (const document of documents) if (document.status === 'published') await preparePortfolioSet(normalizeSnapshot(document).items);
    await migratePortfolioHandles();
    for (const document of documents) {
      const live = normalizeSnapshot(document); const draft = normalizeSnapshot(document.draft || document);
      const revision = document.draftRevision || 0;
      const result = await Portfolio.collection.updateOne({ _id: document._id, ...(document.draftRevision === undefined ? { draftRevision: { $exists: false } } : { draftRevision: revision }) }, { $set: { ...live, draft, schemaVersion: 2, draftRevision: revision, publishedRevision: document.publishedRevision || 0 } });
      if (!result.matchedCount) throw new Error('A draft changed during migration. Pause editor writes and rerun the migration.');
      const jobs = await PortfolioJob.collection.find({ portfolioId: document._id, status: { $in: ['queued', 'running'] } }).sort({ createdAt: 1 }).toArray();
      for (const [index, job] of jobs.entries()) await PortfolioJob.collection.updateOne({ _id: job._id }, { $set: index ? { active: false, status: 'cancelled', cancelledAt: new Date() } : { active: true, input: job.input || draft, inputRevision: job.inputRevision ?? revision } });
      await PortfolioJob.collection.updateMany({ portfolioId: document._id, status: { $nin: ['queued', 'running'] } }, { $set: { active: false } });
    }
    await PortfolioJob.init();
    console.log('Portfolio migration completed.');
  }
} finally { await mongoose.disconnect(); }
