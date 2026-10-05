import { z } from 'zod';
import { canvasIssues } from './canvas.js';
import { PRESENTATION_KEYS, SECTION_LAYOUTS, SECTION_BODY_LIMITS, SPREAD_COUNTS } from './deliveryPresentationCore.js';
export { PRESENTATION_KEYS, SECTION_LAYOUTS, SECTION_BODY_LIMITS };
const id = z.string().uuid();
const slug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const ids = z.array(id).min(1).max(24);
export const sectionWritingSchema = z.array(z.object({ id: slug, title: z.string().trim().min(2).max(60), subtitle: z.string().trim().max(120).default(''), body: z.string().trim().max(360).optional(), assetIds: ids.optional(), coverAssetId: id.optional(), layout: z.string().max(20).optional() }).strict()).max(5);
const version = z.literal(1);
const highlights = z.array(id).max(6);
export const presentationSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('canvas'), version, arrangement: z.enum(['spatial', 'ordered']), photoMotion: z.enum(['gentle', 'still']).optional(), showGroupNotes: z.boolean(), checkpoints: z.array(z.discriminatedUnion('type', [z.object({ id: slug, type: z.literal('photo'), assetId: id }).strict(), z.object({ id: slug, type: z.literal('group'), sectionId: slug }).strict()])).min(1).max(18).optional() }).strict(),
  z.object({ format: z.literal('chapters'), version, directoryLayout: z.enum(['covers', 'list']), showPhotoCaptions: z.boolean() }).strict(),
  z.object({ format: z.literal('album'), version, paperTone: z.enum(['theme', 'light', 'dark']), spreads: z.array(z.object({ id: slug, layout: z.enum(['single', 'pair', 'wide', 'triptych']), assetIds: ids.max(3), heading: z.string().trim().max(70), note: z.string().trim().max(180) }).strict()).min(1).max(16) }).strict(),
  z.object({ format: z.literal('event-coverage'), version, highlightAssetIds: highlights, showSceneNotes: z.boolean(), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(), venue: z.string().trim().max(120).optional() }).strict(),
  z.object({ format: z.literal('campaign'), version, highlightAssetIds: highlights.max(5), assetLabels: z.array(z.object({ assetId: id, label: z.string().trim().max(100), role: z.enum(['hero', 'detail', 'in-use', 'supporting', 'other']) }).strict()).max(16), fileSets: z.array(z.object({ id: slug, title: z.string().trim().min(2).max(60), assetIds: ids }).strict()).max(5) }).strict()
]);
export function presentationIssues(value, format, selected, sections = []) {
  if (value.format !== format) return 'These presentation settings belong to another format.';
  if (format === 'canvas' && value.checkpoints) return canvasIssues(value.checkpoints, sections, selected);
  const known = new Set(selected);
  const unique = values => new Set(values).size === values.length;
  if (value.highlightAssetIds && (!unique(value.highlightAssetIds) || value.highlightAssetIds.some(id => !known.has(id)))) return 'Choose highlights from the showcase, without duplicates.';
  if (value.spreads) {
    const all = value.spreads.flatMap(spread => spread.assetIds);
    if (!unique(value.spreads.map(spread => spread.id)) || all.length !== selected.length || !unique(all) || all.some(id => !known.has(id)) || value.spreads.some(spread => spread.assetIds.length !== SPREAD_COUNTS[spread.layout])) return 'Keep every showcase photo in one spread, with the right number for its layout.';
  }
  if (value.assetLabels && (!unique(value.assetLabels.map(label => label.assetId)) || value.assetLabels.some(label => !known.has(label.assetId)))) return 'Label only photographs in this showcase.';
  if (value.fileSets && (!unique(value.fileSets.map(set => set.id)) || value.fileSets.some(set => !unique(set.assetIds) || set.assetIds.some(id => !known.has(id))))) return 'Keep each file set within this showcase, without duplicate photographs.';
  if (value.eventDate) { const date = new Date(`${value.eventDate}T12:00:00Z`); if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.eventDate) return 'Choose a valid event date.'; }
  return '';
}
export function sectionIssues(sections, format, selected, checkpoints) {
  if (!sections) return '';
  if (SECTION_LAYOUTS[format] && !sections.length && !(format === 'canvas' && checkpoints)) return 'Keep at least one photo group in this showcase.';
  const ids = sections.flatMap(section => section.assetIds || []);
  if (new Set(sections.map(section => section.id)).size !== sections.length) return 'Use a different ID for each group.';
  if (sections.some(section => section.body !== undefined && section.body.length > (SECTION_BODY_LIMITS[format] || 120) || section.layout && !SECTION_LAYOUTS[format]?.includes(section.layout) || section.coverAssetId && !section.assetIds?.includes(section.coverAssetId))) return 'Check the group layout, introduction and cover photograph.';
  if (sections.some(section => section.assetIds) && (sections.some(section => !section.assetIds?.length) || (!(format === 'canvas' && checkpoints) && ids.length !== selected.length) || new Set(ids).size !== ids.length || ids.some(id => !selected.includes(id)))) return 'Keep every showcase photograph in one nonempty group.';
  return '';
}
export function scopedPresentation(config = {}, visible, sections = []) {
  const next = { ...config };
  for (const key of Object.values(PRESENTATION_KEYS)) {
    const source = config[key];
    if (!source) continue;
    const settings = { ...source };
    if (source.checkpoints) settings.checkpoints = source.checkpoints.filter(point => point.type === 'photo' ? visible.has(point.assetId) : sections.some(section => section.id === point.sectionId && section.assetIds?.some(id => visible.has(id))));
    if (source.highlightAssetIds) settings.highlightAssetIds = source.highlightAssetIds.filter(id => visible.has(id));
    if (source.assetLabels) settings.assetLabels = source.assetLabels.filter(label => visible.has(label.assetId));
    if (source.fileSets) settings.fileSets = source.fileSets.map(set => ({ ...set, assetIds: set.assetIds.filter(id => visible.has(id)) })).filter(set => set.assetIds.length);
    if (source.spreads) settings.spreads = source.spreads.map(spread => { const assetIds = spread.assetIds.filter(id => visible.has(id)); return { ...spread, assetIds, layout: assetIds.length === 1 ? spread.layout === 'wide' ? 'wide' : 'single' : assetIds.length === 2 ? 'pair' : 'triptych' }; }).filter(spread => spread.assetIds.length);
    next[key] = settings;
  }
  return next;
}
