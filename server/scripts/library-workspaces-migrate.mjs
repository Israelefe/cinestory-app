import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { migrateLibraryWorkspaces } from '../src/services/libraryMigration.service.js';

dotenv.config();
try {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI before auditing Library records.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  const report = await migrateLibraryWorkspaces({ apply: process.argv.includes('--apply') });
  console.log(JSON.stringify(report, null, 2));
  if (!report.applied) console.log('Read-only audit. Use --apply to create shoot relationships and preserve legacy unlimited selections. Original files and link IDs stay unchanged.');
} catch (error) { console.error(error.name + ': Library migration could not finish. Check database access and retry.'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
