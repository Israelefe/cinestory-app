import PaidUsage from './PaidUsage.js';

// A delete must retain the date of the service activity, rather than the delete date.
// Query middleware covers owner deletion, admin removal and account/retention cleanup.
export function preservePaidUsageOnDelete(schema, kind) {
  schema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], { query: true, document: false }, async function () {
    const rows = await this.model.find(this.getFilter()).select('_id userId status publishedAt createdAt updatedAt').session(this.getOptions().session || null).lean();
    for (const row of rows) {
      if (kind === 'delivery' && !row.publishedAt && !['published', 'archived'].includes(row.status)) continue;
      const usedAt = kind === 'delivery' ? row.publishedAt || row.createdAt : kind === 'portfolio' ? row.updatedAt || row.createdAt : row.createdAt;
      if (!row.userId || !usedAt) continue;
      const key = `${kind}:${row._id}:${new Date(usedAt).toISOString()}`;
      await PaidUsage.updateOne({ key }, { $setOnInsert: { key, userId: row.userId, kind, usedAt } }, { upsert: true, ...(this.getOptions().session ? { session: this.getOptions().session } : {}) });
    }
  });
}
