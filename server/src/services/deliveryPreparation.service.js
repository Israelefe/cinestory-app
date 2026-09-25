import crypto from 'node:crypto';
import Delivery from '../models/Delivery.js';
import Run from '../models/DeliveryPreparation.js';
import Task from '../models/DeliveryTask.js';
import Revision from '../models/DeliveryRevision.js';
import Observation from '../models/DeliveryObservation.js';
import Slot from '../models/DeliveryProviderSlot.js';
import { assemblePresentation, observationKey, LIMITS, publicPreparation } from './deliveryPresentation.js';
import { observePhotographs, writePresentation, regenerateCaption } from './deliveryAI.service.js';
import { signedImageUrl } from './deliveryMedia.service.js';
import { generateNarration } from './narration.service.js';
import { recordWorkerHeartbeat } from './workerHeartbeat.service.js';

const terminal = state => ['done', 'unavailable', 'cancelled'].includes(state);
const plain = value => value.toObject ? value.toObject() : value;
const conflict = () => Object.assign(new Error('This delivery has newer changes. Reload it to continue with those changes.'), { status: 409 });
export async function observeUploads(delivery, retryUnavailable = false) {
  const assets = delivery.assets.map(plain);
  const keys = assets.map(asset => observationKey(delivery.userId, asset));
  const cached = new Set((await Observation.find({ userId: delivery.userId, key: { $in: keys } }).select('key').lean()).map(item => item.key));
  const operations = assets.filter((_, i) => !cached.has(keys[i])).map(asset => {
    const key = observationKey(delivery.userId, asset);
    return { updateOne: { filter: { key: `observe:${key}` }, update: { $setOnInsert: { key: `observe:${key}`, kind: 'observe', deliveryId: delivery._id, userId: delivery.userId, state: 'queued', attempts: 0, availableAt: new Date(), input: { key, asset } } }, upsert: true } };
  });
  if (operations.length) await Task.bulkWrite(operations, { ordered: false }).catch(error => { if (error.code !== 11000) throw error; });
  if (retryUnavailable) await Task.updateMany({ key: { $in: keys.map(key => `observe:${key}`) }, userId: delivery.userId, state: 'unavailable' }, { $set: { state: 'queued', attempts: 0, availableAt: new Date(), deliveryId: delivery._id } });
}
export async function createRevision(delivery, snapshot, origin, expected = {}) {
  const revision = await Revision.create({ deliveryId: delivery._id, userId: delivery.userId, sourceVersion: delivery.sourceVersion, parentRevisionId: delivery.draftRevisionId, origin, snapshot });
  const mirror = { ...snapshot }; delete mirror.assets; delete mirror.schemaVersion;
  if (snapshot.narration === undefined) delete mirror.narration;
  const updated = await Delivery.findOneAndUpdate({ _id: delivery._id, userId: delivery.userId, sourceVersion: delivery.sourceVersion, publishedRevisionId: delivery.publishedRevisionId || null,
    $or: [{ publishingUntil: null }, { publishingUntil: { $lte: new Date() } }], status: { $ne: 'archived' }, ...expected }, {
    $set: { ...mirror, draftRevisionId: revision._id, status: delivery.publishedRevisionId ? 'published' : 'review', reviewApprovedAt: null },
    ...(snapshot.narration === undefined ? { $unset: { narration: 1 } } : {})
  }, { new: true });
  if (!updated) { await Revision.deleteOne({ _id: revision._id }); throw conflict(); }
  return { delivery: updated, revision };
}
async function enqueueRun(run) {
  const kind = run.kind === 'prepare' ? 'writing' : run.kind;
  await Task.updateOne({ key: `${kind}:${run._id}` }, { $setOnInsert: { kind, priority: 10, deliveryId: run.deliveryId, userId: run.userId, runId: run._id, input: run.taskInput, state: 'queued', attempts: 0, availableAt: new Date() } }, { upsert: true });
}
export async function startPreparation(delivery, format, expectedRevisionId) {
  if (String(delivery.draftRevisionId || '') !== String(expectedRevisionId || '')) throw conflict();
  if (!delivery.assets.length) throw Object.assign(new Error('Add finished photographs first.'), { status: 400 });
  await observeUploads(delivery, true);
  const base = await createRevision(delivery, assemblePresentation({ ...plain(delivery), format }), 'supplied', { draftRevisionId: delivery.draftRevisionId || null });
  const run = await Run.create({ deliveryId: delivery._id, userId: delivery.userId, sourceVersion: delivery.sourceVersion, baseRevisionId: base.revision._id,
    input: { ...plain(delivery), format }, kind: 'prepare',
    taskInput: { clientName: delivery.clientName, shootType: delivery.shootType, brief: delivery.brief, format, photoCount: Math.min(LIMITS[format], delivery.assets.length) } });
  const attached = await Delivery.updateOne({ _id: delivery._id, draftRevisionId: base.revision._id, sourceVersion: delivery.sourceVersion }, { $set: { activePreparationId: run._id } });
  if (!attached.modifiedCount) { await Run.updateOne({ _id: run._id }, { state: 'superseded' }); throw conflict(); }
  await enqueueRun(run);
  return run;
}
export async function startRevisionTask(delivery, kind, input) {
  if (String(delivery.draftRevisionId) !== input.revisionId) throw conflict();
  const revision = await Revision.findOne({ _id: input.revisionId, deliveryId: delivery._id, userId: delivery.userId }).lean();
  if (!revision || revision.sourceVersion !== delivery.sourceVersion) throw conflict();
  const frames = revision.snapshot.creativeDirection.frames;
  const frame = frames.find(item => item.assetId === input.assetId);
  if (kind === 'caption' && !frame) throw Object.assign(new Error('Choose a photograph in this presentation.'), { status: 400 });
  await cancelPreparation(delivery);
  const run = await Run.create({ deliveryId: delivery._id, userId: delivery.userId, sourceVersion: delivery.sourceVersion, baseRevisionId: revision._id, kind,
    input: { ...input, snapshot: revision.snapshot },
    taskInput: kind === 'caption' ? { clientName: delivery.clientName, shootType: delivery.shootType, brief: delivery.brief, caption: frame.caption, surroundingCaptions: frames.filter(f => f.assetId !== input.assetId).map(f => f.caption).filter(Boolean), instruction: input.instruction || '' }
      : { ...revision.snapshot, _id: delivery._id, userId: delivery.userId } });
  const attached = await Delivery.updateOne({ _id: delivery._id, draftRevisionId: revision._id, sourceVersion: delivery.sourceVersion, activePreparationId: null }, { $set: { activePreparationId: run._id } });
  if (!attached.modifiedCount) { await Run.updateOne({ _id: run._id }, { state: 'superseded' }); throw conflict(); }
  await enqueueRun(run);
  return run;
}
export async function preparationStatus(delivery) {
  await observeUploads(delivery);
  const keys = delivery.assets.map(asset => observationKey(delivery.userId, asset));
  const cachedKeys = new Set((await Observation.find({ userId: delivery.userId, key: { $in: keys } }).select('key').lean()).map(item => item.key));
  const completed = keys.filter(key => cachedKeys.has(key)).length;
  if (!delivery.activePreparationId) return { state: 'uploading', photographs: { completed, total: keys.length }, tasks: [] };
  const run = await Run.findOne({ _id: delivery.activePreparationId, userId: delivery.userId }).lean();
  if (!run) return { state: 'uploading', photographs: { completed, total: keys.length }, tasks: [] };
  const tasks = await Task.find({ runId: run._id }).select('kind state').lean();
  return publicPreparation(run, tasks, completed, keys.length);
}
export async function cancelPreparation(delivery) {
  if (!delivery.activePreparationId) return;
  // Clear the attachment first: a worker holding an old run can no longer commit.
  await Delivery.updateOne({ _id: delivery._id, userId: delivery.userId, activePreparationId: delivery.activePreparationId }, { $unset: { activePreparationId: 1 } });
  await Run.updateOne({ _id: delivery.activePreparationId, userId: delivery.userId, state: 'working' }, { state: 'cancelled', completedAt: new Date() });
  await Task.updateMany({ runId: delivery.activePreparationId, state: { $in: ['queued', 'running'] } }, { state: 'cancelled', leaseToken: null });
}

// All workers share leases and request-start spacing; adding a worker does not multiply provider limits.
async function acquireProviderSlot() {
  const limit = Math.max(1, Math.min(32, Number(process.env.DELIVERY_PREPARATION_CONCURRENCY) || 6));
  await Slot.bulkWrite(Array.from({ length: limit }, (_, i) => ({ updateOne: { filter: { _id: `delivery-ai-${i}` }, update: { $setOnInsert: { leaseUntil: new Date(0), nextStartAt: new Date(0) } }, upsert: true } })), { ordered: false }).catch(e => { if (e.code !== 11000) throw e; });
  const token = crypto.randomUUID();
  const slot = await Slot.findOneAndUpdate({ _id: { $in: Array.from({ length: limit }, (_, i) => `delivery-ai-${i}`) }, leaseUntil: { $lte: new Date() } }, { $set: { token, leaseUntil: new Date(Date.now() + 90000) } }, { new: true });
  return slot;
}
async function permitStart() {
  const id = 'delivery-request-rate';
  await Slot.updateOne({ _id: id }, { $setOnInsert: { nextStartAt: new Date(0) } }, { upsert: true }).catch(e => { if (e.code !== 11000) throw e; });
  return Slot.findOneAndUpdate({ _id: id, nextStartAt: { $lte: new Date() } }, { $set: { nextStartAt: new Date(Date.now() + Math.max(100, Number(process.env.DELIVERY_AI_START_INTERVAL_MS) || 100)) } }, { new: true });
}
export async function withDeliveryProviderSlot(task) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const slot = await acquireProviderSlot();
    if (slot) {
      try { if (await permitStart()) return await task(); }
      finally { await Slot.updateOne({ _id: slot._id, token: slot.token }, { leaseUntil: new Date(0), token: null }); }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('AI_CAPACITY_BUSY');
}
async function settle(task, token, output, error) {
  const retry = error && task.attempts < 2;
  await Task.updateOne({ _id: task._id, state: 'running', leaseToken: token }, { $set: {
    state: error ? retry ? 'queued' : 'unavailable' : 'done', output: output || null,
    availableAt: new Date(Date.now() + (retry ? Math.min(30000, Math.max(2000, (error.retryAfter || 0) * 1000)) : 0)),
    completedAt: retry ? null : new Date(), leaseToken: null, leaseUntil: null,
    diagnostic: error ? String(error.message).slice(0, 500) : null
  } });
}
export async function processTaskBatch({ observe = observePhotographs } = {}) {
  if (!await Task.exists({ state: 'queued', availableAt: { $lte: new Date() }, attempts: { $lt: 2 } })) return;
  const slot = await acquireProviderSlot();
  if (!slot) return;
  const token = crypto.randomUUID();
  const claimed = [];
  let heartbeat;
  try {
    if (!await permitStart()) return;
    const filter = { state: 'queued', availableAt: { $lte: new Date() }, attempts: { $lt: 2 } };
    const claim = extra => Task.findOneAndUpdate({ ...filter, ...extra }, { $set: { state: 'running', leaseToken: token, leaseUntil: new Date(Date.now() + 90000), startedAt: new Date() }, $inc: { attempts: 1 } }, { new: true, sort: { priority: -1, availableAt: 1, createdAt: 1 } }).select('+input');
    const first = await claim({});
    if (!first) return;
    claimed.push(first);
    if (first.kind === 'observe') {
      for (let i = 1; i < 8; i++) {
        const next = await claim({ kind: 'observe', userId: first.userId, deliveryId: first.deliveryId });
        if (!next) break;
        claimed.push(next);
      }
      await Task.updateMany({ kind: 'observe', userId: first.userId, state: 'queued', availableAt: { $lte: new Date() } }, { availableAt: new Date(Date.now() + 250) });
    }
    heartbeat = setInterval(() => {
      Promise.all([Task.updateMany({ leaseToken: token, state: 'running' }, { leaseUntil: new Date(Date.now() + 90000) }), Slot.updateOne({ _id: slot._id, token: slot.token }, { leaseUntil: new Date(Date.now() + 90000) })]).catch(error => console.error('[delivery/heartbeat]', error.name));
    }, 20000);
    if (first.kind === 'observe') {
      const live = [];
      for (const task of claimed) {
        const cached = await Observation.findOne({ key: task.input.key, userId: task.userId }).lean();
        if (cached) await settle(task, token, cached.observation);
        else if (!await Delivery.exists({ _id: task.deliveryId, userId: task.userId })) await settle(task, token, null, new Error('DELIVERY_REMOVED'));
        else live.push(task);
      }
      if (live.length) {
        const result = await observe(live.map(task => ({ id: String(task._id), url: signedImageUrl(task.input.asset.publicId, { width: 320, height: 320 }) })));
        for (const task of live) {
          const value = result.photographs.find(photo => photo.id === String(task._id));
          if (!value) { await settle(task, token, null, new Error('OBSERVATION_MISSING')); continue; }
          const { id, ...observation } = value;
          await Observation.updateOne({ key: task.input.key, userId: task.userId }, { $setOnInsert: { observation } }, { upsert: true });
          await settle(task, token, observation);
        }
      }
    } else {
      const run = await Run.findOne({ _id: first.runId, state: 'working' }).lean();
      const current = run && await Delivery.exists({ _id: first.deliveryId, activePreparationId: first.runId, sourceVersion: run.sourceVersion, draftRevisionId: run.baseRevisionId, status: { $ne: 'archived' } });
      if (!current) { await Task.updateOne({ _id: first._id, leaseToken: token }, { state: 'cancelled' }); return; }
      const output = first.kind === 'writing' ? await writePresentation(first.input) : first.kind === 'caption' ? await regenerateCaption(first.input) : await generateNarration(first.input);
      await settle(first, token, output);
    }
  } catch (error) {
    console.error('[delivery/task]', claimed[0]?.kind, error.name, error.message);
    await Promise.all(claimed.map(task => settle(task, token, null, error)));
  } finally {
    clearInterval(heartbeat);
    await Slot.updateOne({ _id: slot._id, token: slot.token }, { leaseUntil: new Date(0), token: null });
  }
}
export async function finishPreparations() {
  const lockId = 'delivery-finalization';
  await Slot.updateOne({ _id: lockId }, { $setOnInsert: { leaseUntil: new Date(0) } }, { upsert: true }).catch(e => { if (e.code !== 11000) throw e; });
  const lockToken = crypto.randomUUID();
  const lock = await Slot.findOneAndUpdate({ _id: lockId, leaseUntil: { $lte: new Date() } }, { $set: { token: lockToken, leaseUntil: new Date(Date.now() + 90000) } });
  if (!lock) return;
  try {
  const runs = await Run.find({ state: 'working' }).sort({ createdAt: 1 }).limit(100).select('+input');
  for (const run of runs) {
    const delivery = await Delivery.findById(run.deliveryId);
    if (delivery && String(delivery.draftRevisionId) === String(run.baseRevisionId) && String(delivery.activePreparationId) !== String(run._id) && Date.now() - run.createdAt.getTime() < 5000) continue;
    if (!delivery || delivery.status === 'archived' || delivery.sourceVersion !== run.sourceVersion || String(delivery.activePreparationId) !== String(run._id) || String(delivery.draftRevisionId) !== String(run.baseRevisionId)) {
      await Run.updateOne({ _id: run._id, state: 'working' }, { state: 'superseded', completedAt: new Date() }); continue;
    }
    const tasks = await Task.find({ runId: run._id }).lean();
    const expired = run.kind === 'prepare' && Date.now() - run.createdAt.getTime() >= 55000;
    if ((!tasks.length || tasks.some(task => !terminal(task.state))) && !expired) continue;
    if (expired) await Task.updateMany({ runId: run._id, state: { $in: ['queued', 'running'] } }, { state: 'cancelled', leaseToken: null, completedAt: new Date() });
    let snapshot;
    let origin = 'ai';
    let metrics = {};
    if (run.kind === 'prepare') {
      const keys = run.input.assets.map(asset => observationKey(delivery.userId, asset));
      const cached = await Observation.find({ userId: delivery.userId, key: { $in: keys } }).lean();
      const pending = await Task.countDocuments({ key: { $in: keys.map(key => `observe:${key}`) }, state: { $in: ['queued', 'running'] } });
      if (pending && Date.now() - run.createdAt.getTime() < 55000) continue;
      const byKey = new Map(cached.map(item => [item.key, item.observation]));
      const observations = Object.fromEntries(run.input.assets.map(asset => [asset.assetId, byKey.get(observationKey(delivery.userId, asset))]).filter(([, value]) => value));
      const writing = tasks.find(task => task.kind === 'writing' && task.state === 'done')?.output;
      metrics = { photos: keys.length, observed: keys.filter(key => byKey.has(key)).length, writingReady: Boolean(writing), fullyPrepared: Boolean(writing) && keys.every(key => byKey.has(key)) };
      origin = writing ? 'ai' : 'supplied';
      snapshot = assemblePresentation(run.input, { observations, writing });
    } else {
      if (tasks[0].state !== 'done') { await Run.updateOne({ _id: run._id }, { state: 'available', completedAt: new Date() }); continue; }
      snapshot = structuredClone(run.input.snapshot);
      if (run.kind === 'caption') {
        snapshot.creativeDirection.frames = snapshot.creativeDirection.frames.map(frame => frame.assetId === run.input.assetId ? { ...frame, caption: tasks[0].output.caption } : frame);
        snapshot.narration = undefined;
      } else snapshot.narration = tasks[0].output;
    }
    try {
      await createRevision(delivery, snapshot, origin, { activePreparationId: run._id, draftRevisionId: run.baseRevisionId });
      await Run.updateOne({ _id: run._id, state: 'working' }, { state: origin === 'ai' && (run.kind !== 'prepare' || metrics.fullyPrepared) ? 'ready' : 'available', completedAt: new Date(), durationMs: Date.now() - run.createdAt.getTime(), metrics });
    } catch (error) { if (error.status !== 409) throw error; }
  }
  } finally { await Slot.updateOne({ _id: lockId, token: lockToken }, { $set: { leaseUntil: new Date(0), token: null } }); }
}
export async function recoverTasks() {
  await Task.updateMany({ state: 'running', leaseUntil: { $lt: new Date() }, attempts: { $lt: 2 } }, { $set: { state: 'queued', leaseToken: null, availableAt: new Date() } });
  await Task.updateMany({ state: 'running', leaseUntil: { $lt: new Date() }, attempts: { $gte: 2 } }, { $set: { state: 'unavailable', leaseToken: null, completedAt: new Date() } });
  // The run is the durable outbox: recover a process exit between attachment and enqueue.
  const runs = await Run.find({ state: 'working', createdAt: { $lt: new Date(Date.now() - 5000) } }).select('+taskInput').limit(100);
  for (const run of runs) {
    if (run.taskInput && await Delivery.exists({ _id: run.deliveryId, activePreparationId: run._id, sourceVersion: run.sourceVersion, draftRevisionId: run.baseRevisionId })) await enqueueRun(run);
  }
}
export function startPreparationWorker() {
  let stopping = false;
  const active = new Set();
  let ticking = false;
  let maintainedAt = 0;
  const tick = async () => {
    if (stopping || ticking) return;
    ticking = true;
    try {
      if (Date.now() - maintainedAt >= 1000) {
        maintainedAt = Date.now();
        await recoverTasks(); await finishPreparations();
        await recordWorkerHeartbeat('delivery-preparation', { status: active.size ? 'busy' : 'idle', details: { activeBatches: active.size } });
      }
      const limit = Math.max(1, Math.min(32, Number(process.env.DELIVERY_PREPARATION_CONCURRENCY) || 6));
      if (active.size < limit) {
        const promise = processTaskBatch().catch(error => console.error('[delivery/worker]', error.name)).finally(() => active.delete(promise));
        active.add(promise);
      }
    } catch (error) { console.error('[delivery/scheduler]', error.name, error.message); }
    finally { ticking = false; }
  };
  const timer = setInterval(tick, 100); tick();
  return async () => { stopping = true; clearInterval(timer); await Promise.allSettled([...active]); };
}
