import mongoose from 'mongoose';
import { verifyVideoMediaTools, runVideoJob } from './src/services/videoWorker.service.js';
import { recordWorkerHeartbeat } from './src/services/workerHeartbeat.service.js';
import { createVideoContainerServer } from './src/services/videoContainer.service.js';

try {
  if (!process.env.MONGODB_URI || (process.env.VIDEO_PROCESSING_SECRET || '').length < 32) throw new Error('Missing configuration.');
  mongoose.set('bufferCommands', false);
  mongoose.set('autoIndex', false);
  // Each container runs one media job. Bound its database connections as the
  // pool scales, rather than allowing every encoder a 100-connection pool.
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000, maxPoolSize: 1, minPoolSize: 0, maxIdleTimeMS: 30_000 });
  // The API creates required indexes before serving processing requests. Each
  // cold encoder must not repeat those builds during a large batch startup.
  await verifyVideoMediaTools();
  const terminate = () => process.exit(0); // Hard stop kills FFmpeg with the VM; Mongo leases recover jobs.
  const server = createVideoContainerServer({ runJob: runVideoJob, heartbeat: value => recordWorkerHeartbeat('video', value), terminate });
  server.listen(8080, '0.0.0.0', () => console.log('[video-container] Ready.'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, terminate);
} catch {
  // Connection errors may contain a credential-bearing URL. Never log them.
  console.error('[video-container] Startup checks failed. Check private configuration and database access.');
  process.exit(1);
}
