import api from '../services/api.js';

export async function selectAllLibraryItems(endpoint, params, { signal, onProgress = () => {} } = {}) {
  const ids = new Set(); let after, before;
  do {
    const { data } = await api.get(endpoint, { params: { ...params, ...(after ? { after } : {}), ...(before ? { before } : {}) }, signal });
    for (const id of data.data) ids.add(id);
    onProgress(ids.size); before = data.before;
    if (!data.hasMore) break;
    if (!data.nextCursor || data.nextCursor === after) throw new Error('The complete selection could not be loaded. Try again.');
    after = data.nextCursor;
  } while (!signal?.aborted);
  signal?.throwIfAborted(); return [...ids];
}

export async function deleteLibraryItems(endpoint, ids, { batchSize = 20, extra = {}, onProgress = () => {}, stopped = () => false } = {}) {
  const removedIds = [], failed = [];
  try {
    for (let offset = 0; offset < ids.length && !stopped(); offset += batchSize) {
      const { data } = await api.post(endpoint, { ...extra, assetIds: ids.slice(offset, offset + batchSize) });
      removedIds.push(...data.data.removedIds); failed.push(...data.data.failed);
      onProgress(Math.min(offset + batchSize, ids.length), ids.length);
    }
    return { removedIds, failed, stopped: stopped() };
  } catch (error) { error.removedIds = removedIds; throw error; }
}
