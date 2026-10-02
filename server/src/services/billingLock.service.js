import crypto from 'node:crypto';
import BillingLock from '../models/BillingLock.js';
export async function withBillingLock(userId, operation) {
  await BillingLock.updateOne({ _id: userId }, { $setOnInsert: { leaseUntil: new Date(0) } }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error; });
  const owner = crypto.randomUUID();
  const lock = await BillingLock.findOneAndUpdate({ _id: userId, leaseUntil: { $lte: new Date() } }, { $set: { owner, leaseUntil: new Date(Date.now() + 120_000) } }, { new: true });
  if (!lock) throw Object.assign(new Error('A billing update is already in progress. Please try again shortly.'), { status: 409 });
  const heartbeat = setInterval(() => {
    void BillingLock.updateOne({ _id: userId, owner }, { $set: { leaseUntil: new Date(Date.now() + 120000) } }).catch(error => console.error('[billing/lease]', error.message));
  }, 30000);
  heartbeat.unref?.();
  try { return await operation(lock); }
  finally { clearInterval(heartbeat); await BillingLock.updateOne({ _id: userId, owner }, { $set: { leaseUntil: new Date(0) } }); }
}
