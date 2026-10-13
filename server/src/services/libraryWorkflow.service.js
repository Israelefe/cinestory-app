import { z } from 'zod';

export const libraryId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a photograph from your library.');
export const photoIds = z.array(libraryId).max(500).refine(ids => new Set(ids).size === ids.length, 'Remove duplicate photographs.');
export const selectionRuleSchema = z.object({ mode: z.enum(['exactly', 'up-to', 'unlimited']), count: z.number().int().min(1).max(500).optional() }).strict().refine(rule => rule.mode === 'unlimited' || Boolean(rule.count), 'Set the number the client can choose.');
export const collaborationSchema = z.object({
  kind: z.enum(['preselection', 'editor-handoff']), title: z.string().trim().min(1).max(100),
  clientName: z.string().trim().max(100).default(''), note: z.string().trim().max(500).default(''),
  recipientEmail: z.string().trim().toLowerCase().max(254).email().or(z.literal('')).default(''),
  coverAssetId: libraryId.optional(),
  assetIds: photoIds, status: z.enum(['draft', 'active']).default('active'),
  selectionRule: selectionRuleSchema.optional(), dueAt: z.string().datetime().nullable().optional(),
  expiresInDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]).default(30),
  pin: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72).optional(),
  creationKey: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/).optional()
}).strict().superRefine((value, ctx) => {
  if (value.coverAssetId && !value.assetIds.includes(value.coverAssetId)) ctx.addIssue({ code: 'custom', message: 'Choose a link preview from the shared photographs.' });
  if (value.status === 'active' && !value.assetIds.length) ctx.addIssue({ code: 'custom', message: 'Choose at least one photograph.' });
  if (value.kind === 'preselection' && value.selectionRule?.mode !== 'unlimited' && value.selectionRule?.count > value.assetIds.length) ctx.addIssue({ code: 'custom', message: 'The selection allowance cannot exceed the photographs shared.' });
});

export function selectionRule(value) {
  return value?.mode && value.mode !== 'unlimited' ? { mode: value.mode, count: Number(value.count) } : { mode: 'unlimited' };
}

export function validateChoices(collaboration, ids, { final = false } = {}) {
  const parsed = photoIds.safeParse(ids);
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0].message), { status: 400 });
  const permitted = new Set(collaboration.assetIds.map(String));
  if (parsed.data.some(id => !permitted.has(id))) throw Object.assign(new Error('That photograph is outside this link.'), { status: 400 });
  const rule = selectionRule(collaboration.selectionRule);
  if (rule.mode !== 'unlimited' && ids.length > rule.count) throw Object.assign(new Error(`Choose no more than ${rule.count} photographs.`), { status: 400 });
  if (final && !ids.length) throw Object.assign(new Error('Choose at least one photograph.'), { status: 400 });
  if (final && rule.mode === 'exactly' && ids.length !== rule.count) throw Object.assign(new Error(`Choose exactly ${rule.count} photographs before sending.`), { status: 400 });
  return parsed.data;
}

export function revisionFilter(revision = 1) {
  return revision === 1 ? { $or: [{ revision: 1 }, { revision: { $exists: false } }] } : { revision };
}

export function latestAcceptedReturns(collaboration) {
  if (Array.isArray(collaboration.approvedReturns)) return collaboration.approvedReturns.map(item => String(item.assetId));
  const bySource = new Map();
  for (const item of collaboration.returnedAssets || []) bySource.set(String(item.sourceAssetId) + ':' + (item.variationId || 'main'), item);
  return [...bySource.values()].filter(item => item.reviewStatus === 'accepted').map(item => String(item.assetId));
}
