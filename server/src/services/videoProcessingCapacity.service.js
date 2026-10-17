import mongoose from 'mongoose';

// One application connection plus up to two driver monitoring connections to
// the primary per encoder. Leave 100 for the API pool and 100 for other services
// and headroom. This checks connections, not database throughput qualification.
export const VIDEO_CONNECTIONS_PER_WORKER = 3;
export const VIDEO_DATABASE_CONNECTION_RESERVE = 200;
const EXISTING_WORKER_LIMIT = 100;

export function videoProcessingCapacity(settings, databaseConnections) {
  const verified = Number.isSafeInteger(databaseConnections) && databaseConnections > 0;
  const databaseLimit = verified
    ? Math.max(0, Math.floor((databaseConnections - VIDEO_DATABASE_CONNECTION_RESERVE) / VIDEO_CONNECTIONS_PER_WORKER))
    : EXISTING_WORKER_LIMIT;
  const concurrency = Math.min(settings.workerConcurrency, databaseLimit);
  return {
    configuredConcurrency: settings.workerConcurrency, concurrency,
    databaseConnections: verified ? databaseConnections : null,
    connectionsPerWorker: VIDEO_CONNECTIONS_PER_WORKER,
    reservedConnections: VIDEO_DATABASE_CONNECTION_RESERVE,
    requiredConnections: settings.workerConcurrency * VIDEO_CONNECTIONS_PER_WORKER + VIDEO_DATABASE_CONNECTION_RESERVE,
    limitedBy: concurrency < settings.workerConcurrency ? (verified ? 'database-connections' : 'database-capacity-unverified') : null
  };
}

export function createVideoConnectionReader(read, { now = Date.now, ttlMs = 30_000 } = {}) {
  let cached; let expiresAt = 0; let pending;
  return async ({ fresh = false } = {}) => {
    if (!fresh && expiresAt > now()) return cached;
    if (!pending) pending = (async () => {
      let value = null;
      try {
        const { current, available } = (await read())?.connections || {};
        if (Number.isSafeInteger(current) && current >= 0 && Number.isSafeInteger(available) && available >= 0
          && Number.isSafeInteger(current + available) && current + available > 0) value = current + available;
      } catch { /* Never log provider errors or permit expansion without proof. */ }
      cached = value; expiresAt = now() + ttlMs;
      return value;
    })().finally(() => { pending = null; });
    return pending;
  };
}

const readConnections = createVideoConnectionReader(() => mongoose.connection.db.admin().serverStatus({ maxTimeMS: 3000 }));
export async function getVideoProcessingCapacity(settings, options) {
  return videoProcessingCapacity(settings, await readConnections(options));
}
