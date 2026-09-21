import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const projectRoot = resolve(serverRoot, '..');
const read = path => readFile(resolve(path), 'utf8');

const service = await read('src/services/accountDeletion.service.js');
const authController = await read('src/controllers/auth.controller.js');
const adminController = await read('src/controllers/admin.controller.js');
const adminRoutes = await read('src/routes/admin.routes.js');
const adminPage = await read(resolve(projectRoot, 'admin/src/pages/AdminDashboardPage.jsx'));

assert.match(adminRoutes, /router\.delete\('\/users\/:id', requireAdminRoles\('superadmin'\), adminDeleteAccount\)/, 'Account deletion must be restricted to superadmins.');
assert.match(adminController, /confirmation !== 'DELETE'/, 'The server must require an explicit deletion confirmation.');
assert.match(adminController, /account\.deletion_started/, 'Deletion attempts must be recorded before destructive work begins.');
assert.match(adminController, /account\.deleted_by_admin/, 'Successful admin deletions must be audited.');
assert.match(service, /cloudinary\.api\.delete_resources_by_prefix/, 'Account deletion must remove stored media.');
assert.match(service, /transactionUnsupported/, 'Account deletion must handle MongoDB deployments without replica-set transactions.');
assert.match(service, /ACCOUNT_RECORD_CLEANUP_FAILED/, 'Account deletion must identify a failed cleanup stage safely.');
assert.match(service, /DeliveryShareGrant\.js/, 'Account deletion must remove share grants.');
assert.match(service, /VolumeAccessCode\.js/, 'Account deletion must remove volume access codes.');
assert.match(service, /SupportTicket\.js/, 'Account deletion must remove account-linked support records.');
assert.match(service, /AnalyticsEvent\.js/, 'Account deletion must remove account-linked analytics records.');
assert.match(service, /Admin audit rows are deliberately not touched/, 'The service must document that admin audit rows are retained.');
assert.match(authController, /deleteUserAccount\(\{ userId: user\._id/, 'Self-service deletion must use the shared deletion service.');
assert.match(adminPage, /Type DELETE to confirm/, 'The admin UI must require an explicit confirmation phrase.');
assert.match(adminPage, /Delete this account permanently/, 'The admin UI must present a deliberate destructive action.');
assert.match(adminPage, /api\.delete\(`\/v1\/admin\/users\//, 'The admin UI must call the protected account deletion route.');

console.log('Admin account deletion contract passed: superadmin guard, explicit confirmation, media/data cleanup, shared self-delete path, and audit coverage are present.');
