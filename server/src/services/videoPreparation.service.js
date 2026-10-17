import crypto from 'node:crypto';
import Delivery from '../models/Delivery.js';
import { VideoJob, VideoUpload, VideoPreparationSchedule } from '../models/video.models.js';
import { videoTransaction } from './videoQuota.service.js';

const SCHEDULE = 'platform';
const liveFilter = at => ({ state: 'running', runAfter: { $lte: at }, leaseUntil: { $gt: at } });
const dueFilter = at => ({ runAfter: { $lte: at }, $or: [{ state: 'queued' }, { state: 'running', leaseUntil: { $lte: at } }] });
const groupExpression = { $ifNull: ['$preparationId', { $concat: ['asset:', { $toString: '$assetId' }] }] };
const id = value => String(value);
let backfill;

export async function videoPreparationIdentity(asset) {
  // Upload ownership, and then delivery ownership, are both checked. Reusing
  // an asset in another delivery still reuses its one underlying encode.
  const upload = await VideoUpload.findOne({ assetId: asset._id, userId: asset.userId }).select('deliveryId').lean();
  let delivery = upload && await Delivery.findOne({ _id: upload.deliveryId, userId: asset.userId, kind: 'video',
    $or: [{ 'video.draft.items.assetId': asset._id }, { 'video.published.items.assetId': asset._id }] }).select('_id').lean();
  delivery ||= await Delivery.findOne({ userId: asset.userId, kind: 'video', 'video.draft.items.assetId': asset._id }).sort({ createdAt: 1 }).select('_id').lean();
  return delivery ? { deliveryId: delivery._id, preparationId: 'delivery:' + delivery._id } : { preparationId: 'asset:' + asset._id };
}

export async function backfillVideoPreparations() {
  if (backfill) return backfill;
  backfill = (async () => {
    // Idempotent and bounded: old saved jobs acquire a parent without resetting
    // their state, attempts, file leases or prepared outputs.
    let changed = 0;
    for (;;) {
      const jobs = await VideoJob.find({ state: { $in: ['queued', 'running'] }, type: { $ne: 'delete' }, preparationId: { $exists: false } }).limit(200).select('assetId userId').lean();
      if (!jobs.length) return changed;
      const unique = [...new Map(jobs.map(job => [id(job.assetId) + ':' + id(job.userId), job])).values()];
      const assetIds = unique.map(job => job.assetId);
      const uploads = await VideoUpload.find({ assetId: { $in: assetIds } }).select('assetId userId deliveryId').lean();
      const deliveries = await Delivery.find({ kind: 'video', $or: [{ _id: { $in: uploads.map(upload => upload.deliveryId) } }, { 'video.draft.items.assetId': { $in: assetIds } }] }).sort({ createdAt: 1 }).select('userId video.draft.items.assetId video.published.items.assetId').lean();
      const byDelivery = new Map(deliveries.map(delivery => [id(delivery._id), delivery]));
      const original = new Map(uploads.map(upload => [id(upload.assetId) + ':' + id(upload.userId), upload]));
      await VideoJob.bulkWrite(unique.map(job => {
        const upload = original.get(id(job.assetId) + ':' + id(job.userId));
        let delivery = upload && byDelivery.get(id(upload.deliveryId));
        if (delivery && (id(delivery.userId) !== id(job.userId) || ![...(delivery.video?.draft?.items || []), ...(delivery.video?.published?.items || [])].some(item => id(item.assetId) === id(job.assetId)))) delivery = null;
        delivery ||= deliveries.find(row => id(row.userId) === id(job.userId) && row.video?.draft?.items?.some(item => id(item.assetId) === id(job.assetId)));
        const identity = delivery ? { deliveryId: delivery._id, preparationId: 'delivery:' + delivery._id } : { preparationId: 'asset:' + job.assetId };
        return { updateMany: { filter: { assetId: job.assetId, userId: job.userId, preparationId: { $exists: false } }, update: { $set: identity } } };
      }));
      changed += jobs.length;
    }
  })().finally(() => { backfill = undefined; });
  return backfill;
}

async function queueSnapshot(at, session) {
  const running = await VideoJob.find(liveFilter(at)).select('userId assetId type preparationId deliveryId').session(session || null).lean();
  const busyAssets = running.map(job => job.assetId);
  const available = { $and: [
    { $lte: ['$runAfter', at] },
    { $or: [{ $eq: ['$state', 'queued'] }, { $and: [{ $eq: ['$state', 'running'] }, { $lte: ['$leaseUntil', at] }] }] },
    { $not: [{ $in: ['$assetId', busyAssets] }] }
  ] };
  const live = { $and: [{ $lte: ['$runAfter', at] }, { $eq: ['$state', 'running'] }, { $gt: ['$leaseUntil', at] }] };
  const waiting = { $and: [
    { $or: [{ $eq: ['$state', 'queued'] }, { $and: [{ $eq: ['$state', 'running'] }, { $lte: ['$leaseUntil', at] }] }] },
    { $not: [{ $in: ['$assetId', busyAssets] }] }
  ] };
  const groups = await VideoJob.aggregate([
    { $match: { state: { $in: ['queued', 'running'] } } },
    { $group: { _id: { $cond: [{ $eq: ['$type', 'delete'] }, { $concat: ['cleanup:', { $toString: '$userId' }] }, groupExpression] },
      userId: { $first: '$userId' }, deliveryId: { $first: '$deliveryId' },
      cleanup: { $first: { $eq: ['$type', 'delete'] } },
      active: { $sum: { $cond: [live, 1, 0] } },
      assets: { $addToSet: { $cond: [available, '$assetId', null] } },
      waitingAssets: { $addToSet: { $cond: [waiting, '$assetId', null] } },
      oldest: { $min: '$createdAt' }
    } }
  ]).session(session || null);
  return { running, groups: groups.map(row => ({ key: row._id, userId: row.userId, deliveryId: row.deliveryId,
    cleanup: row.cleanup, active: row.active, readyAssets: row.assets.filter(Boolean), waitingAssets: row.waitingAssets.filter(Boolean), oldest: new Date(row.oldest || 0).getTime() })) };
}

export function planVideoPreparations({ groups, running }, state, settings) {
  const limit = settings.preparationConcurrency ?? 100;
  const accountLimit = Math.min(10, settings.workerConcurrency);
  const owners = new Map();
  for (const job of running) owners.set(id(job.userId), (owners.get(id(job.userId)) || 0) + 1);
  const preparationGroups = groups.filter(group => !group.cleanup);
  const byKey = new Map(preparationGroups.map(group => [group.key, group]));
  const deliveries = (state?.deliveries || []).filter(slot => {
    const group = byKey.get(slot.key);
    return group && id(group.userId) === id(slot.userId) && (group.active || settings.enabled && group.readyAssets.length);
  }).map(slot => ({ key: slot.key, userId: slot.userId, deliveryId: slot.deliveryId, lastServed: slot.lastServed || 0 }));
  const admitted = new Set(deliveries.map(slot => slot.key));
  // Retain in-flight work through rolling deployments and a reduced limit.
  for (const group of preparationGroups) if (group.active && !admitted.has(group.key)) {
    deliveries.push({ key: group.key, userId: group.userId, deliveryId: group.deliveryId, lastServed: 0 });
    admitted.add(group.key);
  }
  const ownerAdmissions = new Map();
  for (const slot of deliveries) ownerAdmissions.set(id(slot.userId), (ownerAdmissions.get(id(slot.userId)) || 0) + 1);
  const waiting = preparationGroups.filter(group => settings.enabled && !admitted.has(group.key) && group.readyAssets.length && (owners.get(id(group.userId)) || 0) < accountLimit);
  while (deliveries.length < limit && waiting.length) {
    waiting.sort((a, b) => (ownerAdmissions.get(id(a.userId)) || 0) - (ownerAdmissions.get(id(b.userId)) || 0) || a.oldest - b.oldest || a.key.localeCompare(b.key));
    const group = waiting.shift();
    deliveries.push({ key: group.key, userId: group.userId, deliveryId: group.deliveryId, lastServed: 0 });
    admitted.add(group.key);
    ownerAdmissions.set(id(group.userId), (ownerAdmissions.get(id(group.userId)) || 0) + 1);
  }
  const turns = new Map(deliveries.map(slot => [slot.key, slot.lastServed]));
  const candidates = groups.filter(group => group.readyAssets.length && (group.cleanup || settings.enabled && admitted.has(group.key)) && (owners.get(id(group.userId)) || 0) < accountLimit);
  candidates.sort((a, b) => Number(b.cleanup) - Number(a.cleanup) || (owners.get(id(a.userId)) || 0) - (owners.get(id(b.userId)) || 0)
    || a.active - b.active || (turns.get(a.key) || 0) - (turns.get(b.key) || 0) || a.oldest - b.oldest || a.key.localeCompare(b.key));
  const queuedByOwner = new Map();
  for (const group of candidates) queuedByOwner.set(id(group.userId), (queuedByOwner.get(id(group.userId)) || 0) + group.readyAssets.length);
  const pending = Math.min(settings.workerConcurrency, [...queuedByOwner].reduce((sum, [owner, count]) => sum + Math.min(count, Math.max(0, accountLimit - (owners.get(owner) || 0))), 0));
  return { deliveries, candidates, pending, activePreparations: deliveries.length,
    activeDeliveries: deliveries.filter(slot => slot.deliveryId).length,
    waitingDeliveries: preparationGroups.filter(group => group.deliveryId && !admitted.has(group.key) && group.readyAssets.length).length,
    processingVideos: running.filter(job => job.type !== 'delete').length,
    queuedVideos: preparationGroups.reduce((sum, group) => sum + group.waitingAssets.length, 0), limit };
}

export async function videoPreparationSummary(settings) {
  const snapshot = await queueSnapshot(new Date());
  const state = await VideoPreparationSchedule.findById(SCHEDULE).lean();
  const plan = planVideoPreparations(snapshot, state, settings);
  // Only persisted admissions count as active in the UI; a status read cannot
  // admit work. Hypothetical admissions are used solely to size the wake-up.
  const active = plan.deliveries.filter(slot => snapshot.groups.some(group => group.key === slot.key && group.active)
    || state?.deliveries?.some(existing => existing.key === slot.key));
  const activeKeys = new Set(active.map(slot => slot.key));
  return { pending: plan.pending, activePreparations: active.length,
    activeDeliveries: active.filter(slot => slot.deliveryId).length,
    waitingDeliveries: snapshot.groups.filter(group => !group.cleanup && group.deliveryId && group.waitingAssets.length && !activeKeys.has(group.key)).length,
    processingVideos: plan.processingVideos, queuedVideos: plan.queuedVideos, preparationLimit: plan.limit };
}

export async function claimVideoPreparationJob(settings) {
  await backfillVideoPreparations();
  try {
    await VideoPreparationSchedule.updateOne({ _id: SCHEDULE }, { $setOnInsert: { turn: 0, deliveries: [] } }, { upsert: true, timestamps: false });
  } catch (error) { if (error.code !== 11000) throw error; }
  return videoTransaction(async session => {
    // Updating the shared document first serializes admission and fair file
    // selection across VMs. No transaction is held while encoding or uploading.
    const state = await VideoPreparationSchedule.findOneAndUpdate({ _id: SCHEDULE }, { $inc: { turn: 1 } }, { session, new: true }).lean();
    const at = new Date();
    const snapshot = await queueSnapshot(at, session);
    const plan = planVideoPreparations(snapshot, state, settings);
    const previous = new Set(state.deliveries.map(slot => slot.key));
    const inFlight = new Set(snapshot.groups.filter(group => group.active).map(group => group.key));
    const admitted = plan.deliveries.filter(slot => previous.has(slot.key) || inFlight.has(slot.key));
    let job = null;
    if (snapshot.running.length < settings.workerConcurrency) {
      const encodingFull = snapshot.running.filter(row => row.type === 'prepare').length >= settings.platformEncodes;
      for (const group of plan.candidates) {
        if (!settings.enabled && !group.cleanup) continue;
        const filter = { ...dueFilter(at), assetId: { $in: group.readyAssets }, userId: group.userId,
          ...(group.cleanup ? { type: 'delete' } : { type: encodingFull ? { $nin: ['delete', 'prepare'] } : { $ne: 'delete' },
            $expr: { $eq: [groupExpression, group.key] } }) };
        job = await VideoJob.findOneAndUpdate(filter, { $set: { state: 'running', leaseToken: crypto.randomUUID(), leaseUntil: new Date(at.getTime() + 120_000) }, $inc: { attempts: 1 } }, { session, new: true, sort: { priority: -1, runAfter: 1, _id: 1 } });
        if (job) {
          const slot = plan.deliveries.find(row => row.key === group.key);
          if (slot) {
            slot.lastServed = state.turn;
            if (!admitted.some(row => row.key === slot.key)) admitted.push(slot);
          }
          break;
        }
      }
    }
    await VideoPreparationSchedule.updateOne({ _id: SCHEDULE }, { $set: { deliveries: admitted } }, { session });
    return job;
  });
}
