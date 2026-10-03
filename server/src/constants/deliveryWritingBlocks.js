import { z } from 'zod';
import { FORMAT_WRITING_PROFILES } from './deliveryWriting.js';

export const writingOverridesSchema = z.array(z.string().regex(/^(?:openingLine|closingLine|editorial\.introduction|section:[a-z0-9-]{1,60}:(?:title|body)|frame:[a-z0-9-]{1,60}:(?:headline|caption))$/)).max(80);
export const writingBlocksSchema = z.array(z.object({
  key: z.string().max(100),
  kind: z.enum(['opening', 'closing', 'introduction', 'section-title', 'section-body']),
  assetIds: z.array(z.string().uuid()).min(1).max(24),
  text: z.string().trim().max(700)
}).strict()).min(1).max(15);

export function writingBlockLimit(block, format) {
  const limits = FORMAT_WRITING_PROFILES[format] || FORMAT_WRITING_PROFILES['photo-story'];
  return ({ opening: limits.opening, closing: limits.closing, introduction: format === 'editorial' ? 650 : 0, 'section-title': format === 'editorial' ? 70 : 60, 'section-body': format === 'editorial' ? 700 : 120 })[block.kind] || 0;
}

export function validWritingBlock(block, format) {
  // Older Canvas records may have 180-character body notes. Accept them as
  // review input; generated group notes still use the existing 120 limit.
  const inputLimit = format === 'canvas' && block.kind === 'section-body' ? 180 : writingBlockLimit(block, format);
  if (block.text.length > inputLimit) return false;
  if (block.kind === 'opening') return block.key === 'openingLine';
  if (block.kind === 'closing') return block.key === 'closingLine';
  if (block.kind === 'introduction') return format === 'editorial' && block.key === 'editorial.introduction';
  return new RegExp(`^section:[a-z0-9-]{1,60}:${block.kind === 'section-title' ? 'title' : 'body'}$`).test(block.key);
}
