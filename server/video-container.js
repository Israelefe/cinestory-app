import mongoose from 'mongoose';
import { ensureVideoIndexes } from './src/models/video.models.js';
import { verifyVideoMediaTools, runVideoJob } from './src/services/videoWorker.service.js';
import { recordWorkerHeartbeat } from './src/services/workerHeartbeat.service.js';
import { createVideoContainerServer } from './src/services/videoContainer.service.js';

try {
  if (!process.env.MONGODB_URI || (process.env.VIDEO_PROCESSING_SECRET || '').length < 32) throw new Error('Missing configuration.');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  await ensureVideoIndexes();
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
