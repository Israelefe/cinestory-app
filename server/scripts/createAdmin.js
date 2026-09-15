import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import AdminUser from '../src/models/AdminUser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config(); // fallback

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('[Error] MONGODB_URI environment variable is missing.');
  process.exit(1);
}

const args = process.argv.slice(2);
const username = args[0]?.trim();
const password = args[1]?.trim();
const name = args[2]?.trim() || 'Veylo Administrator';

if (!username || !password) {
  console.log('\nUsage: node scripts/createAdmin.js <username> <password> [name]\n');
  console.log('Example: node scripts/createAdmin.js superadmin MySecretPass123 "Main Admin"\n');
  process.exit(1);
}

if (username.length < 3) {
  console.error('[Error] Username must be at least 3 characters long.');
  process.exit(1);
}

if (password.length < 6) {
  console.error('[Error] Password must be at least 6 characters long.');
  process.exit(1);
}

async function run() {
  try {
    console.log('[1/3] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('[2/3] Connected to database.');

    const normalized = username.toLowerCase();
    let admin = await AdminUser.findOne({ username: normalized }).select('+password');

    if (admin) {
      console.log(`[3/3] Admin account "${normalized}" already exists. Updating credentials...`);
      admin.password = password;
      admin.name = name;
      admin.accountStatus = 'active';
      await admin.save();
      console.log(`\nSUCCESS: Password updated for admin "${normalized}".\n`);
    } else {
      console.log(`[3/3] Creating new AdminUser "${normalized}"...`);
      admin = new AdminUser({
        username: normalized,
        name,
        password,
        role: 'superadmin',
        accountStatus: 'active'
      });
      await admin.save();
      console.log(`\nSUCCESS: Admin account "${normalized}" created successfully!\n`);
    }

    console.log(`Username: ${normalized}`);
    console.log(`Role: ${admin.role}`);
    console.log('You can now log in at your Veylo Admin frontend.\n');
  } catch (error) {
    console.error('\n[Error creating admin]', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
