import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './src/config/db.js';
import authRoutes from './src/routes/auth.routes.js';
import storyRoutes from './src/routes/story.routes.js';
import adminRoutes from './src/routes/admin.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/health', (req, res) => res.json({ status: 'healthy', app: 'CineStory AI Server' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/admin', adminRoutes);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🎬 CineStory Server running at http://localhost:${PORT}`);
  });
});
