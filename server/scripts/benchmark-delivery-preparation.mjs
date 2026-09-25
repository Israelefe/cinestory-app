import 'dotenv/config';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Delivery from '../src/models/Delivery.js';
import Run from '../src/models/DeliveryPreparation.js';
import Task from '../src/models/DeliveryTask.js';
import Revision from '../src/models/DeliveryRevision.js';
import Observation from '../src/models/DeliveryObservation.js';
import Slot from '../src/models/DeliveryProviderSlot.js';
import { startPreparation, processTaskBatch, finishPreparations, recoverTasks } from '../src/services/deliveryPreparation.service.js';
import { observePhotographs } from '../src/services/deliveryAI.service.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to send the repository demonstration photographs to the configured AI provider.');
const users = Math.min(10, Math.max(1, Number(process.argv.find(arg => arg.startsWith('--users='))?.split('=')[1]) || 1));
const chosenConcurrency = Number(process.argv.find(arg => arg.startsWith('--concurrency='))?.split('=')[1]);
if (chosenConcurrency) process.env.DELIVERY_PREPARATION_CONCURRENCY = String(chosenConcurrency);
const fixtureDir = resolve('../client/public/veylo/web');
const files = (await readdir(fixtureDir)).filter(file => file.endsWith('-480.webp')).sort();
const images = await Promise.all(files.map(async file => `data:image/jpeg;base64,${(await sharp(await readFile(resolve(fixtureDir, file))).resize({ width: 320, height: 320, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()).toString('base64')}`));
const mongo = await MongoMemoryServer.create({ binary: { downloadDir: resolve('../.runtime/mongodb') } });
// Never connect to the database in .env. Only provider credentials are used.
await mongoose.connect(mongo.getUri(), { dbName: 'delivery_live_benchmark' });
await Promise.all([Delivery, Run, Task, Revision, Observation, Slot].map(model => model.init()));
const active = new Set();
let visionImages = 0, visionCalls = 0;
const observe = async batch => {
  const tasks = await Task.find({ _id: { $in: batch.map(item => item.id) } }).select('+input').lean();
  const byId = new Map(tasks.map(task => [String(task._id), task.input.asset.sortOrder]));
  visionImages += batch.length; visionCalls++;
  return observePhotographs(batch.map(item => ({ id: item.id, url: images[byId.get(item.id) % images.length] })));
};
try {
  const runs = [];
  for (let user = 0; user < users; user++) {
    const userId = new mongoose.Types.ObjectId(), _id = new mongoose.Types.ObjectId();
    const delivery = await Delivery.create({ _id, userId, schemaVersion: 3, sourceVersion: 1, clientName: 'Ada', shootType: 'Birthday', brief: 'Ada 30th Birthday Shoot',
      assets: Array.from({ length: 100 }, (_, index) => ({ assetId: crypto.randomUUID(), publicId: `benchmark/${user}/${index}`, format: 'webp', width: 480, height: 640, bytes: 10000, sortOrder: index })) });
    runs.push(await startPreparation(delivery, 'photo-story'));
  }
  const started = Date.now();
  const concurrency = Math.max(1, Math.min(32, Number(process.env.DELIVERY_PREPARATION_CONCURRENCY) || 6));
  let completed = [];
  while (Date.now() - started < 180000) {
    if (active.size < concurrency) {
      const pending = processTaskBatch({ observe }).finally(() => active.delete(pending)); active.add(pending);
    }
    await finishPreparations(); await recoverTasks();
    completed = await Run.find({ _id: { $in: runs.map(run => run._id) }, state: { $ne: 'working' } }).lean();
    if (completed.length === users) break;
    await delay(100);
  }
  await Promise.allSettled([...active]);
  const results = completed.map(run => ({ state: run.state, durationMs: run.durationMs, ...run.metrics })).sort((a, b) => a.durationMs - b.durationMs);
  const report = { users, photosPerDelivery: 100, fixtureCount: files.length, note: 'Real AI; isolated local MongoDB; repeated repository demo photographs supplied as 480px data URLs. Includes queue, writing, observations and assembly after upload; excludes public upload, production database/network and optional narration.', concurrency, visionImages, visionCalls, completed: results.length, fullSuccess: results.filter(r => r.fullyPrepared).length, under60Seconds: results.filter(r => r.fullyPrepared && r.durationMs <= 60000).length, p95Ms: results[Math.max(0, Math.ceil(results.length * .95) - 1)]?.durationMs, results };
  const folder = resolve('../.runtime/delivery-v3'); await mkdir(folder, { recursive: true });
  report.note = report.note.replace('480px', '320px');
  await writeFile(resolve(folder, `benchmark-${users}-users-c${concurrency}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.under60Seconds !== users) process.exitCode = 1;
} finally { await Promise.allSettled([...active]); await mongoose.disconnect(); await mongo.stop(); }
