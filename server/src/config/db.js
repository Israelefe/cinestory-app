import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/story_app';
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000
    });
    console.log(`[db] MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    mongoose.set('bufferCommands', false);
    console.warn(`[db] Warning - MongoDB Connection Error: ${error.message}`);
    console.warn('[db] Warning - Server running without database persistence. Configure MONGODB_URI in server/.env to enable database operations.');
    return null;
  }
}
