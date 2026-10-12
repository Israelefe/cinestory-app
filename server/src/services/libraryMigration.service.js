import StorageAsset from '../models/StorageAsset.js';
import LibraryShoot from '../models/LibraryShoot.js';
import LibraryCollaboration from '../models/LibraryCollaboration.js';
import { ensureLibraryShoot } from './libraryShoot.service.js';

export async function migrateLibraryWorkspaces({ apply = false } = {}) {
  const groups = await StorageAsset.aggregate([{ $group: { _id: { userId: '$userId', folder: '$folder' }, count: { $sum: 1 } } }]);
  const legacyLinks = { selectionRule: { $exists: false }, kind: 'preselection' };
  const report = { photographs: groups.reduce((total, group) => total + group.count, 0), namedShoots: groups.filter(group => group._id.folder && !['All photographs', 'Unfiled'].includes(group._id.folder)).length, legacySelections: await LibraryCollaboration.countDocuments(legacyLinks), applied: apply };
  if (!apply) return report;
  await Promise.all([LibraryShoot.createIndexes(), LibraryCollaboration.createIndexes()]);
  for (const group of groups) {
    const folder = !group._id.folder || group._id.folder === 'All photographs' ? 'Unfiled' : group._id.folder;
    const shoot = await ensureLibraryShoot(group._id.userId, folder);
    const query = { userId: group._id.userId, folder: group._id.folder ?? null };
    await StorageAsset.updateMany(query, { $set: { folder, ...(shoot ? { shootId: shoot._id } : {}) } });
  }
  await LibraryCollaboration.updateMany(legacyLinks, { $set: { selectionRule: { mode: 'unlimited' } } });
  await LibraryCollaboration.updateMany({ revision: { $exists: false } }, { $set: { revision: 1 } });
  return report;
}
