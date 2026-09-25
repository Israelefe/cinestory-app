import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { connectDB } from './src/config/db.js';
import authRoutes from './src/routes/auth.routes.js';
import onboardingRoutes from './src/routes/onboarding.routes.js';
import storyRoutes from './src/routes/story.routes.js';
import adminRoutes, { adminAuthMiddleware, requireAdminRoles } from './src/routes/admin.routes.js';
import contentStudioRoutes from './src/routes/contentStudio.routes.js';
import billingRoutes from './src/routes/billing.routes.js';
import deliveryRoutes from './src/routes/delivery.routes.js';
import storageRoutes from './src/routes/storage.routes.js';
import portfolioRoutes from './src/routes/portfolio.routes.js';
import supportRoutes from './src/routes/support.routes.js';
import volumeRoutes from './src/routes/volume.routes.js';
import analyticsRoutes from './src/routes/analytics.routes.js';
import assistantRoutes from './src/routes/assistant.routes.js';
import { paystackWebhook } from './src/controllers/billing.controller.js';
import { resolveEdgeClientIp } from './src/middleware/clientIp.middleware.js';
import { checkCloudinaryConnection } from './src/services/cloudinary.service.js';
import { startDeliveryWorker } from './src/services/deliveryWorker.service.js';
import { startPreparationWorker } from './src/services/deliveryPreparation.service.js';
import { creationPipelineVersion } from './src/services/deliveryPresentation.js';
import { startRetentionWorker } from './src/services/retention.service.js';
import { startPortfolioWorker } from './src/services/portfolioWorker.service.js';
import { seedAdminFromEnv } from './src/utils/seedAdmin.js';
import { maintenanceMiddleware } from './src/middleware/maintenance.middleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
let stopPreparationWorker;
if (process.env.NODE_ENV === 'production') {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'OTP_SECRET', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLIENT_URL'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET.length < 32 || process.env.OTP_SECRET.length < 32) throw new Error('JWT_SECRET and OTP_SECRET must each contain at least 32 characters.');
  if (process.env.BILLING_ENABLED === 'true') {
    const billingMissing = ['PAYSTACK_SECRET_KEY', 'PAYSTACK_PRO_PLAN_CODE', 'BILLING_ENCRYPTION_KEY'].filter(name => !process.env[name]);
    if (billingMissing.length) throw new Error(`Missing billing configuration: ${billingMissing.join(', ')}`);
  }
  if (process.env.DELIVERY_PIPELINE_ENABLED === 'true') {
    const deliveryMissing = ['ALIBABA_MODEL_STUDIO_API_KEY', 'ALIBABA_WORKSPACE_ID', 'DEEPGRAM_API_KEY'].filter(name => !process.env[name]);
    if (deliveryMissing.length) throw new Error(`Missing delivery pipeline configuration: ${deliveryMissing.join(', ')}`);
  }
}
const allowedOrigins = new Set([
  process.env.CLIENT_URL,
  process.env.ADMIN_URL,
  ...(process.env.ALLOWED_ORIGINS || '').split(',')
].filter(Boolean).map(value => value.trim().replace(/\/$/, '')));

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:5173');
  allowedOrigins.add('http://127.0.0.1:5173');
  allowedOrigins.add('http://127.0.0.1:4173');
  allowedOrigins.add('http://localhost:4173');
  allowedOrigins.add('http://localhost:5174');
  allowedOrigins.add('http://127.0.0.1:5174');
}

app.set('trust proxy', 1);
// Must run before anything that reads `req.ip` — the rate limiters, the
// Turnstile check and the session audit trail all depend on it.
app.use(resolveEdgeClientIp);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Paystack signs the exact request bytes. This route must stay above express.json().
app.post('/api/v1/webhooks/paystack', express.raw({ type: 'application/json', limit: '256kb' }), paystackWebhook);
function isAllowedOrigin(origin) {
  if (!origin) return true;
  const clean = origin.replace(/\/$/, '');
  if (allowedOrigins.has(clean)) return true;
  // Only explicitly configured origins may send credentialed requests.
  return false;
}

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed.`));
  }
}));
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (isAllowedOrigin(origin)) return next();
  res.status(403).json({ success: false, message: `This request origin (${origin}) is not allowed.` });
});
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(maintenanceMiddleware);

app.get('/health', (req, res) => res.json({
  status: 'healthy', app: 'Veylo API Server', revision: process.env.RENDER_GIT_COMMIT || null,
  delivery: {
    pipelineVersion: creationPipelineVersion(),
    workerMode: process.env.DELIVERY_PIPELINE_ENABLED !== 'true' ? 'disabled' : process.env.DELIVERY_WORKER_EMBEDDED === 'false' ? 'external' : 'embedded',
    embeddedWorkerStarted: Boolean(stopPreparationWorker)
  }
}));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/deliveries', deliveryRoutes);
app.use('/api/v1/storage', storageRoutes);
app.use('/api/v1/portfolios', portfolioRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/volume-jobs', volumeRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/assistant', assistantRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/content-studio', adminAuthMiddleware, requireAdminRoles('superadmin', 'operations', 'admin'), contentStudioRoutes);

app.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'The image must be 5 MB or smaller.' });
  if (error?.message === 'Origin is not allowed.' || /^Origin .+ is not allowed\.$/.test(error?.message || '')) return res.status(403).json({ success: false, message: 'This request origin is not allowed.' });
  console.error('[server]', error.message);
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

connectDB().then(async connection => {
  if (!connection && process.env.NODE_ENV === 'production') process.exit(1);
  await seedAdminFromEnv();
  const server = app.listen(PORT, () => {
    console.log(`[Veylo] Server running at http://localhost:${server.address().port}`);
    checkCloudinaryConnection().then(result => {
      if (result.ok) console.info('[cloudinary] Connection verified.');
      else console.error(`[cloudinary] Configuration rejected: ${result.reason}`);
    });
    if (process.env.DELIVERY_PIPELINE_ENABLED === 'true') {
      startPortfolioWorker();
      // Existing services need no new environment variables or extra process.
      // Both queues remain available for old drafts and rebuilt deliveries.
      if (process.env.DELIVERY_WORKER_EMBEDDED !== 'false') {
        startDeliveryWorker();
        stopPreparationWorker = startPreparationWorker();
      }
    }
    startRetentionWorker();
  });
  const shutdown = async () => {
    server.close();
    await stopPreparationWorker?.();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
});
