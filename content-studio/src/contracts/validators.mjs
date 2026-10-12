import { sections } from './index.mjs';
export const words = text => String(text || '').trim().split(/\s+/).filter(Boolean);
export function sectionBudgets(seconds) { return { hook: 3, problem: 5, demo: seconds - 15, result: 4, cta: 3 }; }
export function copyErrors(text, facts, banned = []) {
  const errors = [], lower = text.toLowerCase();
  for (const phrase of banned) if (lower.includes(phrase)) errors.push('Banned phrase: ' + phrase);
  if (/(?:₦|\bnaira\b|\bpricing\b|\bper month\b|\bmonthly allowance\b|\bfree trial\b)/i.test(text)) errors.push('Prices, allowances and free-trial wording are excluded.');
  if (/\b(?:guarantee[ds]?|double your (?:income|revenue)|best in (?:the world|nigeria)|retouch(?:es|ing)? your|generates? (?:your )?(?:client )?films)\b/i.test(text)) errors.push('Unsupported product or result claim.');
  const numeric = [...text.matchAll(/\b\d+(?:[.,]\d+)*\s*(?:%|seconds?|minutes?|hours?|times)?/gi)].map(match => match[0].trim());
  const allowed = facts.map(fact => fact.allowedWording || fact.statement).join(' ').toLowerCase();
  for (const number of numeric) if (!allowed.includes(number.toLowerCase())) errors.push('Unsourced number: ' + number);
  for (const match of text.matchAll(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million)\s+(?:seconds?|minutes?|hours?|percent|times faster|naira)\b/gi)) if (!allowed.includes(match[0].toLowerCase())) errors.push('Unsourced number: ' + match[0]);
  if (/\b(?:fastest|cheapest|first ever|number one|unlimited)\b/i.test(text) && !facts.some(fact => text.includes(fact.allowedWording))) errors.push('An unsupported superlative or allowance is present.');
  return errors;
}
export function validateScripts(output, { knowledge, captures, seconds, banned }) {
  const errors = [], angles = new Set(), hooks = [], demos = new Set(), ids = new Set();
  const budgets = { hook: 8, problem: 12, demo: Math.floor(sectionBudgets(seconds).demo * 2.3), result: 9, cta: 7 };
  for (const variant of output.variants) {
    if (ids.has(variant.id)) errors.push('Variant IDs must be unique.'); ids.add(variant.id);
    if (demos.has(variant.captureIds[0])) errors.push('Each variant needs a different first demo capture.'); demos.add(variant.captureIds[0]);
    if (angles.has(variant.angle)) errors.push('Each variant needs a different hook angle.'); angles.add(variant.angle);
    if (!knowledge.features.some(feature => feature.id === variant.featureId && feature.eligible)) errors.push('The selected feature is not approved/current.');
    for (const section of sections) if (words(variant.voiceover[section]).length > budgets[section]) errors.push(`${variant.id} ${section} exceeds ${budgets[section]} words.`);
    const cta = knowledge.offer.ctas.find(item => item.id === variant.ctaId);
    if (!cta || variant.voiceover.cta !== cta.text) errors.push('Use exactly one approved CTA in the CTA section.');
    if (sections.filter(section => section !== 'cta').some(section => /link in bio|get started|sign up|visit (?:our|the) site/i.test(variant.voiceover[section]))) errors.push('Do not add another CTA before the ending.');
    if (!variant.captureIds.every(id => captures.some(clip => clip.id === id && !clip.stale && clip.approved))) errors.push('A capture is missing, stale or unapproved.');
    if (!variant.captureIds.every(id => captures.some(clip => clip.id === id && clip.featureId === variant.featureId))) errors.push('The capture must demonstrate the selected feature.');
    if (!variant.factIds.every(id => knowledge.facts.some(fact => fact.id === id))) errors.push('An unknown fact ID was used.');
    const facts = knowledge.facts.filter(fact => variant.factIds.includes(fact.id));
    errors.push(...copyErrors(Object.values(variant.voiceover).join(' ') + ' ' + Object.values(variant.onScreen).join(' '), facts, banned));
    if (!/(photograph|studio|shoot|portrait|wedding|event|film|deliver)/i.test(variant.voiceover.hook)) errors.push('The hook must identify the audience or a recognisable work problem.');
    const tokens = new Set(words(variant.voiceover.hook.toLowerCase().replace(/[^a-z\s]/g, '')));
    for (const previous of hooks) { const overlap = [...tokens].filter(word => previous.has(word)).length / Math.max(1, new Set([...tokens, ...previous]).size); if (overlap > .65) errors.push('Hooks are too similar.'); }
    hooks.push(tokens);
  }
  return [...new Set(errors)];
}
export function validateStoryboard(board, { captures, knowledge, variant }) {
  if (!variant) return ['Choose a validated script before editing scenes.'];
  const errors = [], ids = new Set(); let lastSection = -1;
  for (const scene of board.scenes) {
    const order = sections.indexOf(scene.section); if (order < lastSection) errors.push('Sections must remain in script order.'); lastSection = order;
    if (scene.voLineId !== scene.section) errors.push('Voice line must match its scene section.');
    if (ids.has(scene.id)) errors.push('Scene IDs must be unique.'); ids.add(scene.id);
    if (scene.props.clipId && !captures.some(clip => clip.id === scene.props.clipId && clip.approved && !clip.stale && variant.captureIds.includes(clip.id))) errors.push('Use a current capture selected by the script.');
    const clip = captures.find(item => item.id === scene.props.clipId);
    for (const target of scene.props.zoomTargets || []) if (!clip?.targets?.some(item => item.id === target)) errors.push('Unknown zoom target: ' + target);
    if (scene.props.ctaId && scene.props.ctaId !== variant.ctaId) errors.push('CTA must match the selected script.');
    if (scene.template === 'CTACard' && scene.props.text !== knowledge.offer.ctas.find(cta => cta.id === variant.ctaId)?.text) errors.push('CTA card copy must match the approved CTA exactly.');
    if (scene.props.factId && !knowledge.facts.some(fact => fact.id === scene.props.factId && variant.factIds.includes(fact.id))) errors.push('StatReveal needs an approved script fact.');
    const slots = scene.props.slotIds || (scene.props.slotId ? [scene.props.slotId] : []);
    for (const slot of slots) if (!board.requests.some(request => request.id === slot)) errors.push('Unknown asset slot: ' + slot);
    const sceneCopy = [scene.props.text, scene.props.caption, scene.props.before, scene.props.after].filter(Boolean).join(' ');
    if (scene.section !== 'cta' && /link in bio|get started|sign up|visit (?:our|the) site/i.test(sceneCopy)) errors.push('Keep the single action in the CTA section.');
    errors.push(...copyErrors(sceneCopy, knowledge.facts.filter(fact => variant.factIds.includes(fact.id)), knowledge.banned || []));
  }
  if (!ids.has(board.coverSceneId)) errors.push('The cover must reference a scene in this storyboard.');
  for (const section of sections) if (!board.scenes.some(scene => scene.section === section)) errors.push('Missing section: ' + section);
  if (board.scenes[0]?.section !== 'hook' || board.scenes.at(-1)?.section !== 'cta') errors.push('Start with the hook and finish with the CTA.');
  if (!board.scenes.some(scene => scene.section === 'demo' && scene.props.clipId)) errors.push('The demo must show a current real product capture.');
  if (board.scenes.some(scene => scene.template === 'CTACard' && scene.section !== 'cta')) errors.push('The CTA card belongs only in the final section.');
  if (board.requests.some(request => request.kind === 'video' && !request.sourceSeconds || request.kind === 'image' && request.sourceSeconds !== 0)) errors.push('Image/video source duration is inconsistent.');
  if (new Set(board.requests.map(request => request.id)).size !== board.requests.length) errors.push('Asset slot IDs must be unique.');
  if (board.scenes.some(scene => scene.template === 'VideoScene' && board.requests.find(request => request.id === scene.props.slotId)?.kind !== 'video')) errors.push('VideoScene must use a video slot.');
  return [...new Set(errors)];
}
export const fixedMediaRules = 'Every person shown, including background people, must be a Black adult. Use dignified professional settings appropriate to Nigerian photographers. No children, celebrities or real-person likenesses. No text, logos, visible watermarks, invented app screens or readable private information. Generate context scenes only; do not present generated images as a photographer’s real finished work.';
