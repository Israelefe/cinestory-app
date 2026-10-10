import mongoose from 'mongoose';
import User from '../models/User.js';
import { VideoQuota } from '../models/video.models.js';

export function storageCapacityFilter(bytes, limit) {
  return { $expr: { $lte: [{ $add: [{ $ifNull: ['$storageUsedBytes', 0] }, { $ifNull: ['$storageReservedBytes', 0] }, bytes] }, limit] } };
}

export function quotaError(kind = 'storage') {
  return Object.assign(new Error(kind === 'duration' ? 'Your stored video minutes are full. Remove an unused video before adding another.' : 'This upload would exceed your shared storage. Remove an unused original and try again.'), { status: 403, code: kind === 'duration' ? 'VIDEO_DURATION_LIMIT' : 'STORAGE_LIMIT_REACHED' });
}

export async function videoTransaction(work) {
  try { return await mongoose.connection.transaction(work, { readPreference: 'primary' }); }
  catch (error) {
    if (/Transaction numbers|replica set|does not support retryable writes/i.test(error.message || '')) throw Object.assign(new Error('Video storage requires a transaction-capable database. Please contact support.'), { status: 503, code: 'VIDEO_DATABASE_REQUIRED' });
    throw error;
  }
}

export async function reserveVideoBytes({ assetId, userId, bytes, limit }, session) {
  const id = String(assetId);
  const existing = await VideoQuota.findById(id).session(session);
  if (existing) return existing;
  const user = await User.findOneAndUpdate({ _id: userId, ...storageCapacityFilter(bytes, limit) }, { $inc: { storageReservedBytes: bytes } }, { session, new: true });
  if (!user) throw quotaError();
  return (await VideoQuota.create([{ _id: id, assetId, userId, bytes }], { session }))[0];
}

export async function commitVideoBytes(assetId, session) {
  const quota = await VideoQuota.findOneAndUpdate({ _id: String(assetId), byteState: 'reserved' }, { $set: { byteState: 'committed' } }, { session, new: true });
  if (quota) await User.updateOne({ _id: quota.userId }, { $inc: { storageReservedBytes: -quota.bytes, storageUsedBytes: quota.bytes, videoUsedBytes: quota.bytes } }, { session });
}

export async function reserveVideoDuration(assetId, seconds, limit) {
  return videoTransaction(async session => {
    const quota = await VideoQuota.findById(String(assetId)).session(session);
    if (!quota || quota.byteState !== 'committed') throw quotaError();
    if (['reserved', 'committed'].includes(quota.durationState)) return;
    const rounded = Math.ceil(seconds);
    const user = await User.findOneAndUpdate({ _id: quota.userId, $expr: { $lte: [{ $add: [{ $ifNull: ['$videoStoredSeconds', 0] }, { $ifNull: ['$videoReservedSeconds', 0] }, rounded] }, limit] } }, { $inc: { videoReservedSeconds: rounded } }, { session, new: true });
    if (!user) throw quotaError('duration');
    quota.seconds = rounded; quota.durationState = 'reserved'; await quota.save({ session });
  });
}

export async function commitVideoDuration(assetId) {
  return videoTransaction(async session => {
    const quota = await VideoQuota.findOneAndUpdate({ _id: String(assetId), durationState: 'reserved' }, { $set: { durationState: 'committed' } }, { session, new: true });
    if (quota) await User.updateOne({ _id: quota.userId }, { $inc: { videoReservedSeconds: -quota.seconds, videoStoredSeconds: quota.seconds } }, { session });
  });
}

// Call only after both provider cleanup steps succeed. Keeping the ledger row
// makes duplicate cleanup and delayed callbacks safe.
export async function releaseVideoQuota(assetId) {
  return videoTransaction(async session => {
    const quota = await VideoQuota.findById(String(assetId)).session(session);
    if (!quota) return;
    const increments = {};
    if (quota.byteState === 'reserved') increments.storageReservedBytes = -quota.bytes;
    if (quota.byteState === 'committed') { increments.storageUsedBytes = -quota.bytes; increments.videoUsedBytes = -quota.bytes; }
    if (quota.durationState === 'reserved') increments.videoReservedSeconds = -quota.seconds;
    if (quota.durationState === 'committed') increments.videoStoredSeconds = -quota.seconds;
    if (Object.keys(increments).length) await User.updateOne({ _id: quota.userId }, { $inc: increments }, { session });
    quota.byteState = 'released'; quota.durationState = 'released'; await quota.save({ session });
  });
}

// The ledger owns video charges. Repair projections without changing the
// non-video portion of shared storage, and never infer provider deletion.
export async function reconcileVideoQuota(userId) {
  return videoTransaction(async session => {
    const user = await User.findById(userId).session(session);
    const rows = await VideoQuota.find({ userId }).session(session);
    if (!user) return;
    const sum = (field, state, value) => rows.filter(row => row[field] === state).reduce((total, row) => total + Number(row[value] || 0), 0);
    const bytes = sum('byteState', 'committed', 'bytes');
    const reserved = sum('byteState', 'reserved', 'bytes');
    const seconds = sum('durationState', 'committed', 'seconds');
    const reservedSeconds = sum('durationState', 'reserved', 'seconds');
    const delta = bytes - (user.videoUsedBytes || 0);
    if ((user.storageUsedBytes || 0) + delta < 0) throw Object.assign(new Error('Shared video storage needs an account audit.'), { code: 'VIDEO_QUOTA_INCONSISTENT' });
    await User.updateOne({ _id: userId }, { $set: { storageReservedBytes: reserved, videoUsedBytes: bytes, videoStoredSeconds: seconds, videoReservedSeconds: reservedSeconds }, $inc: { storageUsedBytes: delta } }, { session });
  });
}
