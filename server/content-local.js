import dotenv from 'dotenv';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import adminRoutes, { adminAuthMiddleware, requireAdminRoles } from './src/routes/admin.routes.js';
import contentRoutes from './src/routes/contentStudio.routes.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
// This service binds only to loopback. Rendering and image processing stay on this PC.
const port = 5055;
const root = fileURLToPath(new URL('../', import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
  mediaSrc: ["'self'", 'blob:', 'https://res.cloudinary.com'],
  connectSrc: ["'self'", 'https://res.cloudinary.com'], fontSrc: ["'self'", 'data:'],
  upgradeInsecureRequests: null
} }, crossOriginEmbedderPolicy: false }));
// Prevent cross-site requests and DNS rebinding against the local administrative API.
app.use((req, res, next) => {
  const host = req.get('host');
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) return res.status(403).json({ message: 'Open Content Studio through localhost.' });
  const origin = req.get('origin');
  const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://localhost:5174', 'http://127.0.0.1:5174']);
  if (origin && !allowed.has(origin)) return res.status(403).json({ message: 'Open Content Studio on this computer to continue.' });
  if (origin) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); res.set('Access-Control-Allow-Credentials', 'true'); }
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); return res.sendStatus(204); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('sec-fetch-site') === 'cross-site' && !origin) return res.sendStatus(403);
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1/admin/content-studio', adminAuthMiddleware, requireAdminRoles('superadmin', 'operations'), contentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'This route is not available in the local studio.' }));
app.use(express.static(path.join(root, 'admin/dist')));
app.get('*', (req, res) => res.sendFile(path.join(root, 'admin/dist/index.html')));
app.use((error, req, res, next) => { console.error('[content-local]', error.name); res.status(500).json({ message: 'The local studio could not complete this request.' }); });

let worker, server;
async function shutdown() {
  if (worker && !worker.killed) worker.kill('SIGTERM');
  if (server) server.close();
  await mongoose.disconnect();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) throw new Error('Configure the Veylo database and authentication settings in server/.env.');
  await fs.access(path.join(root, 'admin/dist/index.html'));
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  server = app.listen(port, '127.0.0.1', () => console.info(`[content-local] Open http://127.0.0.1:${port}/content-studio`));
  worker = fork(fileURLToPath(new URL('./content-worker.js', import.meta.url)), [], { stdio: 'inherit', windowsHide: true });
  worker.on('exit', code => { if (code) console.error('[content-local] The renderer stopped. Restart the local studio to resume processing.'); });
  server.on('error', async () => { console.error('[content-local] Port 5055 is unavailable. Close the other local studio process and restart.'); await shutdown(); process.exitCode = 1; });
} catch (error) {
  console.error('[content-local] Could not start. Check server/.env, database access, and that admin/npm run build has completed.');
  await shutdown();
  process.exitCode = 1;
}
