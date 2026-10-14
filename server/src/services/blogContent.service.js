import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

export const blogError = (message, status = 400) => Object.assign(new Error(message), { status, safe: true });
export const slugify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110).replace(/-$/, '');
const text = max => z.string().trim().max(max);
export const draftSchema = z.object({
  title: text(180), excerpt: text(400), markdown: text(80000), seoTitle: text(100),
  metaDescription: text(250), keyword: text(150), coverId: z.string().regex(/^[a-f\d]{24}$/i).nullable(),
  coverAlt: text(300), coverCredit: text(180)
}).strict();
export const saveSchema = z.object({ revision: z.number().int().positive(), slug: text(120).min(1), notes: text(12000), draft: draftSchema }).strict();
export const generatedArticleSchema = draftSchema.omit({ coverId: true, coverAlt: true, coverCredit: true }).extend({ slug: text(120).min(1), title: text(180).min(1), excerpt: text(400).min(1), markdown: text(80000).min(1), seoTitle: text(100).min(1), metaDescription: text(250).min(1) });
export const topicSchema = z.object({ topics: z.array(z.object({ title: text(180).min(5), keyword: text(150).min(2), angle: text(500).min(10) }).strict()).min(1).max(8) }).strict();

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
export function renderBlogMarkdown(source) {
  const tokens = markdown.parse(String(source || ''), {});
  const toc = [], ids = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open') {
      const level = Math.max(2, Math.min(3, Number(token.tag.slice(1))));
      token.tag = `h${level}`;
      if (tokens[i + 2]?.type === 'heading_close') tokens[i + 2].tag = token.tag;
      const label = (tokens[i + 1]?.children || []).filter(t => ['text', 'code_inline'].includes(t.type)).map(t => t.content).join('');
      const base = slugify(label) || 'section', count = (ids.get(base) || 0) + 1;
      ids.set(base, count);
      const id = `section-${base}${count > 1 ? `-${count}` : ''}`;
      token.attrSet('id', id);
      toc.push({ id, text: label, level });
    }
  }
  const bodyHtml = sanitizeHtml(markdown.renderer.render(tokens, markdown.options, {}), {
    allowedTags: ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'a', 'hr', 'br', 'code', 'pre', 's', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { h2: ['id'], h3: ['id'], a: ['href', 'title', 'rel'] },
    allowedSchemes: ['https', 'http', 'mailto'], allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) }
  });
  const plain = sanitizeHtml(bodyHtml, { allowedTags: [], allowedAttributes: {} });
  return { bodyHtml, toc, readingMinutes: Math.max(1, Math.ceil(plain.trim().split(/\s+/).filter(Boolean).length / 220)) };
}
export const prepareDraft = draft => ({ ...draft, ...renderBlogMarkdown(draft.markdown) });
export function blogChecks(draft) {
  const errors = [], warnings = [];
  for (const [key, label] of [['title', 'Article title'], ['excerpt', 'Excerpt'], ['markdown', 'Article text'], ['seoTitle', 'SEO title'], ['metaDescription', 'Meta description']]) if (!draft[key]?.trim()) errors.push(`${label} is missing.`);
  if (draft.coverId && !draft.coverAlt?.trim()) errors.push('Add alt text for the cover photo.');
  if (draft.seoTitle && (draft.seoTitle.length < 35 || draft.seoTitle.length > 65)) warnings.push('An SEO title around 35–65 characters is easier to preview. Google may display a different length.');
  if (draft.metaDescription && (draft.metaDescription.length < 100 || draft.metaDescription.length > 170)) warnings.push('Consider a concise meta description around 100–170 characters.');
  if (!draft.toc?.length) warnings.push('Add descriptive section headings to help readers find answers.');
  if (!/href="(?:\/(?!\/)|https:\/\/veylo\.com\.ng\/)/i.test(draft.bodyHtml || '')) warnings.push('Consider linking to a relevant Veylo page or published article.');
  if (!draft.coverId) warnings.push('A cover photo can make the article easier to recognise.');
  return { errors, warnings };
}
