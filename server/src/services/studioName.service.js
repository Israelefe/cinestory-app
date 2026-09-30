import User from '../models/User.js';
import { studioNameKey } from '../utils/studioName.js';

export const STUDIO_NAME_INDEX = 'studio_name_unique';
let readyConnection;
let preparing;

// Used both by the read-only audit command and startup migration. Only account
// IDs are reported; email addresses and other private profile data stay out.
export async function auditStudioNames() {
  const groups = new Map();
  const updates = [];
  for await (const user of User.collection.find({}, { projection: { 'studio.name': 1, studioNameKey: 1 } })) {
    const key = studioNameKey(user.studio?.name);
    if (key) {
      const ids = groups.get(key) || [];
      ids.push(String(user._id));
      groups.set(key, ids);
    }
    if ((key && user.studioNameKey !== key) || (!key && Object.hasOwn(user, 'studioNameKey'))) {
      updates.push({ updateOne: { filter: { _id: user._id, 'studio.name': user.studio?.name ?? null }, update: key ? { $set: { studioNameKey: key } } : { $unset: { studioNameKey: '' } } } });
    }
  }
  return { duplicates: [...groups].filter(([, ids]) => ids.length > 1).map(([key, accountIds]) => ({ name: key, accountIds })), updates, namedAccounts: [...groups.values()].reduce((total, ids) => total + ids.length, 0) };
}

export async function prepareStudioNames() {
  if (User.db.readyState !== 1) throw new Error('Studio name checks require a database connection.');
  if (readyConnection === User.db.db) return;
  preparing ||= (async () => {
    const audit = await auditStudioNames();
    if (audit.duplicates.length) throw new Error(`Studio name migration found ${audit.duplicates.length} duplicate groups. Run npm run studio-names:audit and resolve those names before enabling name changes.`);
    // Never pick a winner or rename an existing account automatically.
    for (let index = 0; index < audit.updates.length; index += 500) {
      await User.collection.bulkWrite(audit.updates.slice(index, index + 500), { ordered: true });
    }
    await User.collection.createIndex({ studioNameKey: 1 }, { name: STUDIO_NAME_INDEX, unique: true, partialFilterExpression: { studioNameKey: { $type: 'string' } } });
    readyConnection = User.db.db;
  })().finally(() => { preparing = null; });
  await preparing;
}

export async function studioNameAvailable(name, accountId) {
  await prepareStudioNames();
  return !(await User.exists({ studioNameKey: studioNameKey(name), _id: { $ne: accountId } }));
}

export function studioNameUnavailable(res) {
  return res.status(503).json({ success: false, code: 'STUDIO_NAME_CHECK_UNAVAILABLE', field: 'studioName', message: 'We could not check this Studio or Brand name right now. Please try again shortly.' });
}
