import { EDITORIAL_LIMITS as L, EDITORIAL_LAYOUTS, EDITORIAL_POLICY } from '../constants/editorial.js';
import { deliveryWritingContext, deliveryWritingPolicy, shootWritingIssues } from '../constants/deliveryWriting.js';
import { detailedFrameIssues, repeatsWriting } from '../utils/deliveryWritingQuality.js';

const clean = value => typeof value === 'string' ? value.trim() : '';
const incomplete = () => Object.assign(new Error('The Editorial wording needs another pass. Your current text is unchanged; please retry.'), { code: 'V3_EDITORIAL_WRITING_INCOMPLETE', status: 502 });
const within = (value, max, min = 0) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const context = (delivery, rows) => JSON.stringify({ ...deliveryWritingContext(delivery), photographs: rows.map(row => ({ assetId: row.assetId, observation: row.summary || '', width: row.width, height: row.height })) });
const policy = delivery => EDITORIAL_POLICY + '\n' + deliveryWritingPolicy(delivery);

export function editorialDraftIssues(draft, selected, factsIssue = () => false, delivery = {}, rows = []) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return ['invalid magazine draft'];
  if (Array.isArray(draft.frames) && draft.frames.some(frame => !frame || typeof frame !== 'object' || Array.isArray(frame))) return ['invalid photograph wording'];
  if (Array.isArray(draft.sections) && draft.sections.some(section => !section || typeof section !== 'object' || Array.isArray(section))) return ['invalid section wording'];
  const issues = [];
  if (!within(draft.title, L.headline, 2)) issues.push('cover headline');
  if (!within(draft.openingLine, L.summary, 5)) issues.push('cover summary');
  if (!within(draft.closingLine, L.closing, 5)) issues.push('closing note');
  if (draft.introduction !== undefined && !within(draft.introduction, L.introduction)) issues.push('introduction');
  const frames = Array.isArray(draft.frames) ? draft.frames : [];
  if (frames.length !== selected.length || frames.some((frame, index) => frame.assetId !== selected[index])) issues.push('photograph order');
  for (const frame of frames) {
    if (!within(frame.headline, L.sectionTitle, 2) || !within(frame.caption, L.caption, 5)) issues.push('photograph wording');
    issues.push(...shootWritingIssues(frame.headline + '. ' + frame.caption, delivery, { caption: true, observation: rows.find(row => row.assetId === frame.assetId)?.summary || '' }));
    issues.push(...detailedFrameIssues(frame, 'editorial', [draft.openingLine, draft.introduction, ...(draft.sections || []).map(section => section.body)]));
  }
  const sections = Array.isArray(draft.sections) ? draft.sections : [];
  const order = sections.flatMap(section => Array.isArray(section.assetIds) ? section.assetIds : []);
  if (!sections.length || sections.length > 7 || sections.some(section => !section.assetIds?.length) || order.length !== selected.length || order.some((id, index) => id !== selected[index])) issues.push('section order');
  for (const section of sections) {
    if (!within(section.title, L.sectionTitle, 2) || !within(section.body || '', L.sectionBody, section.body ? 5 : 0)) issues.push('section wording');
    if (section.body && repeatsWriting(section.body, [draft.openingLine, draft.introduction, ...sections.filter(other => other !== section).map(other => other.body)])) issues.push('section paragraph repeats other context');
  }
  const text = [draft.title, draft.openingLine, draft.closingLine, draft.introduction, ...frames.flatMap(frame => [frame.headline, frame.caption]), ...sections.flatMap(section => [section.title, section.body])].filter(Boolean).join('. ');
  if (factsIssue(text)) issues.push('unsupported names or occasion facts');
  issues.push(...shootWritingIssues(text, delivery, { observation: rows.map(row => row.summary || '').join(' ') }));
  const captions = frames.map(frame => clean(frame.caption).toLowerCase());
  if (new Set(captions).size !== captions.length) issues.push('repeated captions');
  if (new Set(frames.map(frame => clean(frame.headline).toLowerCase())).size !== frames.length) issues.push('repeated headlines');
  return [...new Set(issues)];
}

function editorialCaptionIssues(result, existing, factsIssue, delivery, insight) {
  const issues = [];
  if (!within(result?.headline, 70, 2)) issues.push('headline length');
  if (!within(result?.caption, L.caption, 5)) issues.push('caption length');
  if (result && factsIssue(`${result.headline || ''}. ${result.caption || ''}`)) issues.push('unsupported names or occasion facts');
  issues.push(...shootWritingIssues(result?.caption, delivery, { caption: true, observation: insight.summary }));
  issues.push(...detailedFrameIssues(result, 'editorial', [delivery.creativeDirection?.openingLine, delivery.creativeDirection?.editorial?.introduction, ...(delivery.creativeDirection?.sections || []).map(section => section.body)]));
  if (result && existing.some(frame => clean(frame.caption).toLowerCase() === clean(result.caption).toLowerCase() || clean(frame.headline).toLowerCase() === clean(result.headline).toLowerCase())) issues.push('repeated wording');
  return [...new Set(issues)];
}

function editorialBlockIssues(result, limit, factsIssue, delivery, surrounding = [], rows = []) {
  const issues = [];
  if (!within(result?.text, limit, 5)) issues.push('text length');
  if (factsIssue(String(result?.text || ''))) issues.push('unsupported names or occasion facts');
  issues.push(...shootWritingIssues(result?.text, delivery, { observation: rows.map(row => row.summary || '').join(' ') }));
  if (repeatsWriting(result?.text, surrounding)) issues.push('paragraph repeats other approved writing');
  return [...new Set(issues)];
}

function logRejectedEditorial(flow, issues) {
  console.warn(`[editorial-writing/${flow}] draft failed validation after retries: ${issues.join(', ')}`);
}

export async function writeEditorialDirection(request, delivery, rows, selected, factsIssue) {
  const shape = 'Return JSON {"title":"...","openingLine":"...","introduction":"...","closingLine":"...","frames":[{"assetId":"...","headline":"...","caption":"..."}],"sections":[{"title":"...","body":"...","layout":"auto","assetIds":["..."]}]}. Include every supplied asset ID once in frames in the exact supplied order. Group the same order into 1-4 consecutive sections; no duplicates or missing photographs. Use useful section headings, not generic photo group names. Layout is auto, hero, pair, triptych, feature or wide. The cover summary (openingLine) must contain 5-300 characters and the closing note must contain 5-280 characters. Develop a useful section paragraph from the shared shoot context when it is supplied, and use photo captions to add distinct details. Only omit an introduction or section body when it adds no supported information. Never output placeholder dots. Keep the writing grounded in the supplied context; if details are limited, use restrained factual wording. Do not generate a photographer note, issue number, credits or attributed quotes.';
  const prompt = context(delivery, selected.map(id => rows.find(row => row.assetId === id)));
  let draft = await request(shape + policy(delivery), prompt, { maxTokens: 1800 + selected.length * 220 });
  let issues = editorialDraftIssues(draft, selected, factsIssue, delivery, rows);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!issues.length) break;
    draft = await request(shape + policy(delivery), prompt + '\nRevise these problems: ' + issues.join(', ') + '. Section assetIds, concatenated in section order, must equal ' + JSON.stringify(selected) + ' exactly. Group consecutive photographs only; do not regroup similar views across non-adjacent positions. The cover summary and closing note are required; only the introduction and section body may be empty.\nUntrusted draft (not a source of facts): ' + JSON.stringify(draft), { maxTokens: 1800 + selected.length * 220 });
    issues = editorialDraftIssues(draft, selected, factsIssue, delivery, rows);
  }
  if (issues.length) {
    logRejectedEditorial('direction', issues);
    throw incomplete();
  }
  const frames = draft.frames.map(frame => ({ assetId: frame.assetId, headline: clean(frame.headline), caption: clean(frame.caption), textAnimation: 'word_fade_up', imageFit: 'contain', focalPoint: '50% 50%' }));
  const sections = draft.sections.map((section, index) => ({ id: `feature-${index + 1}`, title: clean(section.title), body: clean(section.body), pullLine: '', layout: EDITORIAL_LAYOUTS.includes(section.layout) ? section.layout : 'auto', assetIds: [...section.assetIds] }));
  return { title: clean(draft.title), openingLine: clean(draft.openingLine), closingLine: clean(draft.closingLine), writingOverrides: [], frames, sections, editorial: { version: 1, introduction: clean(draft.introduction), note: '', issue: '', treatment: 'classic', credits: [], sections } };
}

export async function rewriteEditorialCaption(request, delivery, insight, instruction, previous, factsIssue) {
  const deadline = Date.now() + 45000;
  const existing = (delivery.creativeDirection?.frames || []).filter(frame => frame.assetId !== insight.assetId).map(frame => ({ headline: frame.headline, caption: frame.caption }));
  const prompt = context(delivery, [insight]) + '\nInstruction: ' + JSON.stringify(instruction) + '\nExisting text to avoid repeating, never a source of facts: ' + JSON.stringify({ frames: existing, sections: delivery.creativeDirection?.sections, introduction: delivery.creativeDirection?.editorial?.introduction }) + '\nCurrent untrusted text: ' + JSON.stringify(previous);
  let issues = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryPrompt = attempt ? '\nThe previous suggestion failed these checks: ' + issues.join(', ') + '. Correct each one, keep the wording grounded in the supplied shoot details, and return the requested JSON.' : '';
    const result = await request('Return JSON {"headline":"...","caption":"..."}. The headline must be 2-70 characters and the caption 5-320 characters. Write only this photograph\'s words. Review shoot emphasis, repetition and grounding, and repair the current text when needed. ' + policy(delivery), prompt + retryPrompt, { maxTokens: 700, deadline });
    issues = editorialCaptionIssues(result, existing, factsIssue, delivery, insight);
    if (!issues.length) return { headline: clean(result.headline), caption: clean(result.caption) };
  }
  logRejectedEditorial('caption', issues);
  throw incomplete();
}

export async function rewriteEditorialBlock(request, delivery, rows, block, previousText, instruction, factsIssue) {
  const limits = { summary: L.summary, introduction: L.introduction, section: L.sectionBody, closing: L.closing };
  const limit = limits[block];
  if (!limit) throw incomplete();
  const deadline = Date.now() + 45000;
  const captions = (delivery.creativeDirection?.frames || []).filter(frame => rows.some(row => row.assetId === frame.assetId)).map(frame => frame.caption);
  const surrounding = [delivery.creativeDirection?.title, delivery.creativeDirection?.openingLine, delivery.creativeDirection?.closingLine, ...captions].filter(text => text !== previousText);
  const prompt = context(delivery, rows) + '\nRequested block: ' + block + '\nInstruction: ' + JSON.stringify(instruction) + '\nCurrent untrusted text: ' + JSON.stringify(previousText) + '\nOther approved text, for avoiding repetition only: ' + JSON.stringify(surrounding);
  let issues = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryPrompt = attempt ? '\nThe previous suggestion failed these checks: ' + issues.join(', ') + '. Correct each one, preserve the supplied facts, and return the requested JSON.' : '';
    const result = await request(`Return JSON {"text":"..."}. Rewrite only the requested ${block} block, 5-${limit} characters. No headings, credits or invented facts. ` + policy(delivery), prompt + retryPrompt, { maxTokens: 700, deadline });
    issues = editorialBlockIssues(result, limit, factsIssue, delivery, surrounding, rows);
    if (!issues.length) return { text: clean(result.text) };
  }
  logRejectedEditorial('block-' + block, issues);
  throw incomplete();
}
