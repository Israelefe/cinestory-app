import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { getRuntimeConfig } from '../src/services/runtimeConfig.service.js';
import { getVideoProcessingCapacity } from '../src/services/videoProcessingCapacity.service.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
try {
  if (!process.env.MONGODB_URI) throw new Error('Missing configuration.');
  mongoose.set('autoIndex', false);
  mongoose.set('bufferCommands', false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000, maxPoolSize: 1 });
  const settings = (await getRuntimeConfig()).videoDelivery;
  const capacity = await getVideoProcessingCapacity(settings, { fresh: true });
  console.log(JSON.stringify(capacity, null, 2));
  if (capacity.limitedBy) process.exitCode = 2;
} catch {
  console.error('Video capacity could not be checked. Check private database configuration and access.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
