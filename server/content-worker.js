import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { runContentWorker } from './src/contentStudio/worker.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
const stop = new AbortController();
process.on('SIGINT', () => stop.abort());
process.on('SIGTERM', () => stop.abort());
try {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for the content worker.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.info('[content-studio] Worker starting.');
  await runContentWorker({ signal: stop.signal });
} catch (error) {
  console.error('[content-studio] Worker stopped:', error.name || 'Error');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
