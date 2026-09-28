import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './src/config/db.js';
import { startDeliveryWorker } from './src/services/deliveryWorker.service.js';

if (!await connectDB()) process.exit(1);

startDeliveryWorker();

async function shutdown() {
  await mongoose.disconnect();
  process.exit(0);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
