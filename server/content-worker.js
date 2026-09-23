import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runContentWorker } from './src/contentStudio/worker.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
const stop = new AbortController();
process.on('SIGINT', () => stop.abort());
process.on('SIGTERM', () => stop.abort());

const root = fileURLToPath(new URL('../', import.meta.url));
const exportsPath = path.resolve(root, 'exports');

try {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in server/.env');
  }

  console.info('\n[Veylo PC Render Engine] Connecting to database…');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  console.info('================================================================================');
  console.info('  [Veylo PC Render Engine Active]');
  console.info('  Connected to database. Listening for Content Studio render jobs…');
  console.info(`  Rendered MP4 videos & graphics will save directly to your PC:`);
  console.info(`  -> ${exportsPath}`);
  console.info('  (Zero Cloudinary storage is used for exported files)');
  console.info('  Keep this window open while rendering. Press Ctrl+C to stop.');
  console.info('================================================================================\n');

  await runContentWorker({ signal: stop.signal });
} catch (error) {
  console.error('\n================================================================================');
  console.error('  [Veylo PC Render Engine] Could not start:');
  console.error(`  ${error.message}`);
  console.error('--------------------------------------------------------------------------------');
  console.error('  Tip: Copy your live MONGODB_URI from your Render environment variables');
  console.error('  into your local server/.env file so your PC can pick up queued jobs.');
  console.error('================================================================================\n');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
