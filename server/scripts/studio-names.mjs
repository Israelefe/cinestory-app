import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { auditStudioNames, prepareStudioNames } from '../src/services/studioName.service.js';

dotenv.config();
try {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI before running the studio name audit.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  const audit = await auditStudioNames();
  console.log(JSON.stringify({ namedAccounts: audit.namedAccounts, keysToBackfill: audit.updates.length, duplicates: audit.duplicates }, null, 2));
  if (audit.duplicates.length) process.exitCode = 1;
  else if (process.argv.includes('--apply')) {
    await prepareStudioNames();
    console.log('Studio name keys and the unique index are ready.');
  } else console.log('Read-only audit complete. Use --apply to backfill keys and create the unique index.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
