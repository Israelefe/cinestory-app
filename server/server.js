import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { connectDB } from './src/config/db.js';
import authRoutes from './src/routes/auth.routes.js';
import onboardingRoutes from './src/routes/onboarding.routes.js';
import storyRoutes from './src/routes/story.routes.js';
import adminRoutes from './src/routes/admin.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV === 'production') {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'OTP_SECRET', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLIENT_URL'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET.length < 32 || process.env.OTP_SECRET.length < 32) throw new Error('JWT_SECRET and OTP_SECRET must each contain at least 32 characters.');
}
const allowedOrigins = new Set([
  process.env.CLIENT_URL,
  ...(process.env.ALLOWED_ORIGINS || '').split(',')
].filter(Boolean).map(value => value.trim().replace(/\/$/, '')));

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:5173');
  allowedOrigins.add('http://127.0.0.1:5173');
  allowedOrigins.add('http://127.0.0.1:4173');
  allowedOrigins.add('http://localhost:4173');
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) return callback(null, true);
    callback(new Error('Origin is not allowed.'));
  }
}));
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) return next();
  res.status(403).json({ success: false, message: 'This request origin is not allowed.' });
});
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/health', (req, res) => res.json({ status: 'healthy', app: 'Veylo API Server' }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'The image must be 5 MB or smaller.' });
  if (error?.message === 'Origin is not allowed.') return res.status(403).json({ success: false, message: 'This request origin is not allowed.' });
  console.error('[server]', error.message);
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

connectDB().then(connection => {
  if (!connection && process.env.NODE_ENV === 'production') process.exit(1);
  app.listen(PORT, () => console.log(`[Veylo] Server running at http://localhost:${PORT}`));
});
