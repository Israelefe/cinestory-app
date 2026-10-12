import LibraryShoot from '../models/LibraryShoot.js';

export async function ensureLibraryShoot(userId, name) {
  if (!name || ['All photographs', 'Unfiled'].includes(name)) return null;
  try {
    return await LibraryShoot.findOneAndUpdate({ userId, name }, { $setOnInsert: { userId, name } }, { new: true, upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return LibraryShoot.findOne({ userId, name });
  }
}
