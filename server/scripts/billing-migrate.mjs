import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { migrateBillingRecords } from '../src/services/billingMigration.service.js';
import BillingLock from '../src/models/BillingLock.js';
import Refund from '../src/models/Refund.js';
import PaidUsage from '../src/models/PaidUsage.js';
import BillingEvent from '../src/models/BillingEvent.js';
import EmailDelivery from '../src/models/EmailDelivery.js';

export async function main() {
  dotenv.config({ quiet: true });
  try {
    if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI to the intended database.');
    const apply = process.argv.includes('--apply');
    if (apply && process.env.BILLING_ENCRYPTION_KEY?.length < 32 || apply && !process.env.BILLING_ENCRYPTION_KEY) throw new Error('Set the existing BILLING_ENCRYPTION_KEY before applying the migration.');
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const report = await migrateBillingRecords({ apply });
    if (apply) for (const model of [BillingLock, Refund, PaidUsage, BillingEvent, EmailDelivery]) await model.createIndexes();
    console.log(JSON.stringify(report, null, 2));
    console.log(apply ? 'Migration complete. Review every reported issue before enabling checkout.' : 'Read-only audit complete. Back up the database and review issues before using --apply.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
