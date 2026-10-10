import crypto from 'node:crypto';
import { VideoLease } from '../models/video.models.js';

export async function acquireVideoLease(scope, capacity, { ownerId, resourceId, ttlSeconds = 900 } = {}) {
  const now = new Date();
  const existing = await VideoLease.findOneAndUpdate({ ownerId: String(ownerId), resourceId: String(resourceId), _id: { $regex: '^' + scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':' }, expiresAt: { $gt: now } }, { $set: { expiresAt: new Date(Date.now() + ttlSeconds * 1000) } }, { new: true });
  if (existing) return existing._id;
  const start = crypto.randomInt(capacity);
  for (let offset = 0; offset < capacity; offset++) {
    const id = scope + ':' + ((start + offset) % capacity);
    try {
      const lease = await VideoLease.findOneAndUpdate({ _id: id, expiresAt: { $lte: now } }, { $set: { ownerId: String(ownerId), resourceId: String(resourceId), expiresAt: new Date(Date.now() + ttlSeconds * 1000) } }, { new: true, upsert: true });
      if (lease) return lease._id;
    } catch (error) { if (error.code !== 11000) throw error; }
  }
  throw Object.assign(new Error('All available slots are busy. Your work is saved; try again shortly.'), { status: 429, code: 'VIDEO_CAPACITY_BUSY' });
}

export async function releaseVideoLease(id, resourceId) {
  if (id) await VideoLease.updateOne({ _id: id, resourceId: String(resourceId) }, { $set: { expiresAt: new Date(0) } });
}
