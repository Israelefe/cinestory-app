import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_ANALYTICS_EVENT_NAMES, CLIENT_ANALYTICS_EVENT_SET } from '../src/constants/analyticsEvents.js';
import { sanitizeAnalyticsMetadata } from '../src/services/analytics.service.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const projectRoot = resolve(serverRoot, '..');
const read = path => readFile(resolve(path), 'utf8');

const analyticsController = await read(resolve(serverRoot, 'src/controllers/analytics.controller.js'));
const analyticsRoutes = await read(resolve(serverRoot, 'src/routes/analytics.routes.js'));
const analyticsService = await read(resolve(serverRoot, 'src/services/analytics.service.js'));
const retentionService = await read(resolve(serverRoot, 'src/services/retention.service.js'));
const runtimeConfig = await read(resolve(serverRoot, 'src/services/runtimeConfig.service.js'));
const adminController = await read(resolve(serverRoot, 'src/controllers/admin.controller.js'));
const serverEntry = await read(resolve(serverRoot, 'server.js'));
const adminRoutes = await read(resolve(serverRoot, 'src/routes/admin.routes.js'));
const adminPage = await read(resolve(projectRoot, 'admin/src/pages/AdminDashboardPage.jsx'));
const clientAnalytics = await read(resolve(projectRoot, 'client/src/services/analytics.js'));
const cookiePreferences = await read(resolve(projectRoot, 'client/src/components/CookiePreferences.jsx'));
const privacyPolicy = await read(resolve(projectRoot, 'client/src/pages/PrivacyPolicy.jsx'));

assert.equal(CLIENT_ANALYTICS_EVENT_SET.size, CLIENT_ANALYTICS_EVENT_NAMES.length, 'Client event names must be unique.');
assert.ok(CLIENT_ANALYTICS_EVENT_NAMES.length >= 150, 'The client event contract must cover the approved product journey.');
assert.match(serverEntry, /analyticsRoutes/);
assert.match(serverEntry, /app\.use\('\/api\/v1\/analytics', analyticsRoutes\)/);
assert.match(analyticsRoutes, /clientAnalyticsLimit/);
assert.match(analyticsRoutes, /optionalAuthMiddleware/);
assert.match(analyticsController, /CLIENT_ANALYTICS_EVENT_SET\.has/);
assert.match(analyticsController, /sessionDigest: digestIdentity/);
assert.match(analyticsController, /visitorDigest: digestIdentity/);
assert.match(analyticsService, /sanitizeAnalyticsMetadata/);
assert.match(analyticsService, /photo\|pixel\|audio\|keystroke/);
assert.match(retentionService, /AnalyticsEvent\.deleteMany/);
assert.match(runtimeConfig, /analyticsRetentionDays: 365/);
assert.match(adminController, /analyticsRetentionDays/);
assert.match(clientAnalytics, /sessionStorage/);
assert.match(clientAnalytics, /visitorId/);
assert.match(clientAnalytics, /utmSource/);
assert.match(clientAnalytics, /utmMedium/);
assert.match(clientAnalytics, /referrerHost/);
assert.match(clientAnalytics, /page\.scrolled/);
assert.match(cookiePreferences, /saved\?\.version === 3/);
assert.match(cookiePreferences, /First-party service analytics/);
assert.match(cookiePreferences, /Got it/);
assert.match(privacyPolicy, /first-party service analytics/);
assert.match(privacyPolicy, /photograph pixels/);
assert.match(privacyPolicy, /365 days by default/);
assert.match(adminRoutes, /product-analytics.*requireAdminRoles\('superadmin', 'operations', 'analyst', 'read-only'\)/);
assert.match(adminRoutes, /visitor-traffic.*requireAdminRoles\('superadmin', 'operations', 'analyst', 'read-only'\)/);
assert.match(adminPage, /Product analytics/);
assert.match(adminPage, /Journey checkpoints/);
assert.match(adminPage, /Visitors &amp; traffic/);

const sanitized = sanitizeAnalyticsMetadata({
  password: 'never store this',
  clientName: 'Ada',
  caption: 'private caption',
  photographPixels: 'binary data',
  audioFile: 'bytes',
  safeCount: 4,
  nested: { email: 'person@example.com', format: 'photo-story' }
});
assert.deepEqual(sanitized, { safeCount: 4, nested: { format: 'photo-story' } }, 'Analytics metadata must remove private content recursively.');

console.log(`Analytics privacy contract passed: ${CLIENT_ANALYTICS_EVENT_NAMES.length} allowed client events, always-on first-party collection, anonymised visitors and sessions, metadata filtering, traffic reporting, and updated privacy copy.`);
