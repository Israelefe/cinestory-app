import AdminUser from '../models/AdminUser.js';

export async function seedAdminFromEnv() {
  const username = process.env.ADMIN_USERNAME || process.env.ADMIN_INITIAL_USERNAME;
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Veylo Administrator';

  if (!username || !password) {
    return;
  }

  try {
    const normalized = String(username).trim().toLowerCase();
    let admin = await AdminUser.findOne({ username: normalized }).select('+password');

    if (!admin) {
      admin = new AdminUser({
        username: normalized,
        name,
        password,
        role: 'superadmin',
        accountStatus: 'active'
      });
      await admin.save();
      console.info(`[admin] Auto-created administrator "${normalized}" from environment variables.`);
    } else if (process.env.ADMIN_FORCE_SYNC === 'true') {
      admin.password = password;
      admin.name = name;
      admin.accountStatus = 'active';
      await admin.save();
      console.info(`[admin] Synchronized credentials for administrator "${normalized}".`);
    }
  } catch (error) {
    console.error('[admin/seed]', error.message);
  }
}
