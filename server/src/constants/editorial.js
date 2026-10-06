import { z } from 'zod';

export const EDITORIAL_LIMITS = Object.freeze({ headline: 80, summary: 300, introduction: 650, sectionTitle: 70, sectionBody: 700, caption: 320, closing: 280, note: 800, pullLine: 220 });
export const EDITORIAL_LAYOUTS = ['auto', 'hero', 'pair', 'triptych', 'feature', 'wide'];
export const EDITORIAL_TREATMENTS = ['classic', 'portrait', 'image'];
export const editorialFrameFields = {
  imageFit: z.enum(['contain', 'cover']).default('contain'),
  focalPoint: z.string().regex(/^\d{1,3}% \d{1,3}%$/).refine(value => value.split(' ').every(part => Number.parseInt(part, 10) <= 100)).default('50% 50%')
};
export const editorialSchema = z.object({
  version: z.literal(1).default(1),
  introduction: z.string().trim().max(EDITORIAL_LIMITS.introduction).default(''),
  note: z.string().trim().max(EDITORIAL_LIMITS.note).default(''),
  issue: z.string().trim().max(32).default(''),
  treatment: z.enum(EDITORIAL_TREATMENTS).default('classic'),
  credits: z.array(z.object({ role: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(100) }).strict()).max(8).default([]),
  sections: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,60}$/),
    title: z.string().trim().max(EDITORIAL_LIMITS.sectionTitle),
    body: z.string().trim().max(EDITORIAL_LIMITS.sectionBody).default(''),
    pullLine: z.string().trim().max(EDITORIAL_LIMITS.pullLine).default(''),
    layout: z.enum(EDITORIAL_LAYOUTS).default('auto'),
    assetIds: z.array(z.string().uuid()).min(1).max(14)
  }).strict()).min(1).max(7)
}).strict();

export const EDITORIAL_POLICY = `Write a private photographic magazine feature in plain human language. Third-person editorial writing is allowed. The selected shoot type and actual brief determine the subject of the feature. A birthday feature centres on the person and birthday; a lookbook can focus on garments. The format provides room for useful context without padding. The cover summary is required and must be 5-300 characters; the closing note is required and must be 5-280 characters. The introduction is optional and has a 650-character limit; section body has a 700-character limit; captions have a 320-character limit. Delivery title maximum 80; photo and section headings maximum 70. Cover, introduction, section text and captions must add different information. Omit optional paragraphs when supplied facts do not support them. A pullLine is an exact excerpt from a section body or approved caption, never an invented attributed quotation. Notes, issue labels and credits are supplied by the studio, never generated.`;

export function validEditorialOrder(editorial, selected) {
  const ids = editorial.sections.flatMap(section => section.assetIds);
  return ids.length === selected.length && ids.every((id, index) => id === selected[index]) && new Set(ids).size === ids.length;
}

export function editorialExcerptMatches(section, frames) {
  if (!section.pullLine) return true;
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const sources = [section.body, ...frames.filter(frame => section.assetIds.includes(frame.assetId)).map(frame => frame.caption)];
  return sources.some(source => normalize(source).includes(normalize(section.pullLine)));
}

// Older clients omit the magazine fields. Keep studio writing while making
// section boundaries follow their new photo order and dropping stale excerpts.
export function reconcileSavedEditorial(editorial, selected, frames) {
  if (!editorial) return undefined;
  const known = new Set(selected), seen = new Set();
  let offset = 0;
  const sections = editorial.sections.map(section => {
    const count = section.assetIds.filter(id => {
      if (!known.has(id) || seen.has(id)) return false;
      seen.add(id); return true;
    }).length;
    const assetIds = selected.slice(offset, offset + count);
    offset += count;
    return { ...section, assetIds };
  }).filter(section => section.assetIds.length);
  if (!sections.length) sections.push({ id: 'feature-1', title: '', body: '', pullLine: '', layout: 'auto', assetIds: [] });
  sections.at(-1).assetIds.push(...selected.slice(offset));
  return { ...editorial, sections: sections.map(section => editorialExcerptMatches(section, frames) ? section : { ...section, pullLine: '' }) };
}

export function scopedEditorial(editorial, visibleAssets) {
  if (!editorial) return editorial;
  return { ...editorial, sections: (editorial.sections || []).map(section => ({ ...section, assetIds: (section.assetIds || []).filter(id => visibleAssets.has(id)) })).filter(section => section.assetIds.length) };
}
