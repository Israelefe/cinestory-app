import { z } from 'zod';
import { FORMAT_WRITING_PROFILES } from './deliveryWriting.js';
import { SECTION_BODY_LIMITS } from './deliveryPresentation.js';

export const writingOverridesSchema = z.array(z.string().regex(/^(?:openingLine|closingLine|editorial\.introduction|section:[a-z0-9-]{1,60}:(?:title|body)|frame:[a-z0-9-]{1,60}:(?:headline|caption)|spread:[a-z0-9-]{1,60}:(?:heading|note))$/)).max(120);
export const writingBlocksSchema = z.array(z.object({
  key: z.string().max(100),
  kind: z.enum(['opening', 'closing', 'introduction', 'section-title', 'section-body', 'spread-heading', 'spread-note']),
  assetIds: z.array(z.string().uuid()).min(1).max(24),
  text: z.string().trim().max(700)
}).strict()).min(1).max(32);

export function writingBlockLimit(block, format) {
  const limits = FORMAT_WRITING_PROFILES[format] || FORMAT_WRITING_PROFILES['photo-story'];
  return ({ opening: limits.opening, closing: limits.closing, introduction: format === 'editorial' ? 650 : 0, 'section-title': format === 'editorial' ? 70 : 60, 'section-body': format === 'editorial' ? 700 : SECTION_BODY_LIMITS[format] || 120, 'spread-heading': format === 'album' ? 70 : 0, 'spread-note': format === 'album' ? 180 : 0 })[block.kind] || 0;
}

export function validWritingBlock(block, format) {
  if (!writingBlockLimit(block, format) || block.text.length > writingBlockLimit(block, format)) return false;
  if (block.kind === 'spread-heading' || block.kind === 'spread-note') return format === 'album' && new RegExp(`^spread:[a-z0-9-]{1,60}:${block.kind === 'spread-heading' ? 'heading' : 'note'}$`).test(block.key);
  if (block.kind === 'opening') return block.key === 'openingLine';
  if (block.kind === 'closing') return block.key === 'closingLine';
  if (block.kind === 'introduction') return format === 'editorial' && block.key === 'editorial.introduction';
  return new RegExp(`^section:[a-z0-9-]{1,60}:${block.kind === 'section-title' ? 'title' : 'body'}$`).test(block.key);
}
