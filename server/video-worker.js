import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './src/config/db.js';
import { ensureVideoIndexes } from './src/models/video.models.js';
import { startVideoWorker } from './src/services/videoWorker.service.js';

await connectDB();
if (mongoose.connection.readyState !== 1) throw new Error('Video worker requires a database connection.');
await ensureVideoIndexes();
const stop = await startVideoWorker();
let closing = false;
async function shutdown() { if (closing) return; closing = true; await stop(); await mongoose.disconnect(); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
