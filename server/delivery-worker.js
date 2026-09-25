import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './src/config/db.js';
import { startPreparationWorker } from './src/services/deliveryPreparation.service.js';
import { startDeliveryWorker } from './src/services/deliveryWorker.service.js';
if (!await connectDB()) process.exit(1);
const stop = startPreparationWorker();
// Existing drafts finish on their original pipeline during the transition.
startDeliveryWorker();
async function shutdown() { await stop(); await mongoose.disconnect(); process.exit(0); }
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
