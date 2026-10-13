import { sections } from './index.mjs';
export const words = text => String(text || '').trim().split(/\s+/).filter(Boolean);
export function sectionBudgets(seconds) { return { hook: 3, problem: 5, demo: seconds - 15, result: 4, cta: 3 }; }
export function measuredVoiceBudgets(measured, seconds) {
  const totalFrames = Math.round(seconds * 30), defaults = sectionBudgets(seconds);
  const minimum = Object.fromEntries(sections.map(section => {
    if (!Number.isFinite(measured[section]) || measured[section] <= 0) throw new Error('Voice duration is invalid for ' + section + '.');
    return [section, Math.ceil(measured[section] * 30) + 2];
  }));
  if (Object.values(minimum).reduce((sum, frames) => sum + frames, 0) > totalFrames) throw new Error('The voice needs more time than this video. Choose a longer video length in Preview.');
  const frames = Object.fromEntries(sections.map(section => [section, section === 'demo' ? minimum.demo : Math.max(Math.round(defaults[section] * 30), minimum[section])]));
  let excess = Object.values(frames).reduce((sum, count) => sum + count, 0) - totalFrames;
  for (const section of ['problem', 'result', 'cta', 'hook']) { const trim = Math.max(0, Math.min(excess, frames[section] - minimum[section])); frames[section] -= trim; excess -= trim; }
  frames.demo += totalFrames - Object.values(frames).reduce((sum, count) => sum + count, 0);
  return Object.fromEntries(sections.map(section => [section, frames[section] / 30]));
}
export function scriptWordLimits(seconds) { return { hook: 8, problem: 12, demo: Math.floor(sectionBudgets(seconds).demo * 2.3), result: 9, cta: 7 }; }
export const scriptLengthRules = 'Voiceover wordLimits are hard maximums, not targets. Count whitespace-separated words in each line before returning it. Hook at most 8 words, problem at most 12, result at most 9, CTA at most 7; demo uses the supplied limit. Keep hooks short and complete. Never combine the hook and problem into one line. On repair, rewrite only failing lines to fit their limits without inventing a claim.';
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
  const budgets = scriptWordLimits(seconds);
  for (const variant of output.variants) {
    if (ids.has(variant.id)) errors.push('Variant IDs must be unique.'); ids.add(variant.id);
    if (demos.has(variant.captureIds[0])) errors.push('Each variant needs a different first demo capture.'); demos.add(variant.captureIds[0]);
    if (angles.has(variant.angle)) errors.push('Each variant needs a different hook angle.'); angles.add(variant.angle);
    if (!knowledge.features.some(feature => feature.id === variant.featureId && feature.eligible)) errors.push('The selected feature is not approved/current.');
    for (const section of sections) { const count = words(variant.voiceover[section]).length; if (count > budgets[section]) errors.push(`${variant.id} ${section} has ${count} words; maximum ${budgets[section]}. Rewrite this line at least ${count - budgets[section]} words shorter.`); }
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
export function validateMediaRequests(requests) {
  const errors = [];
  for (const request of requests) {
    if (request.kind === 'video' && ![4, 6, 8, 10].includes(request.sourceSeconds)) errors.push(`Asset slot ${request.id}: video sourceSeconds must be 4, 6, 8 or 10; received ${request.sourceSeconds}. Zero is only for images.`);
    if (request.kind === 'image' && request.sourceSeconds !== 0) errors.push(`Asset slot ${request.id}: image sourceSeconds must be 0; received ${request.sourceSeconds}.`);
  }
  if (new Set(requests.map(request => request.id)).size !== requests.length) errors.push('Asset slot IDs must be unique.');
  return errors;
}
export function validateStoryboardPlan(plan, { realFinishedAssets, assetIds } = {}) {
  const errors = validateMediaRequests(plan.requests);
  if (new Set(plan.scenes.map(scene => scene.id)).size !== plan.scenes.length) errors.push('Scene IDs must be unique.');
  if (!plan.scenes.some(scene => scene.id === plan.coverSceneId)) errors.push('Unknown cover scene.');
  for (const section of sections) if (!plan.scenes.some(scene => scene.section === section)) errors.push('Missing section: ' + section);
  const order = plan.scenes.map(scene => sections.indexOf(scene.section));
  if (order.some((n, i) => i && n < order[i - 1])) errors.push('Keep script sections ordered.');
  if (plan.scenes[0]?.template !== 'HookKinetic' || plan.scenes.at(-1)?.template !== 'CTACard') errors.push('Use HookKinetic first and CTACard last.');
  if (!plan.scenes.some(scene => scene.section === 'demo' && ['PhoneDemo', 'UIZoom'].includes(scene.template))) errors.push('The demo needs a real product capture template: PhoneDemo or UIZoom.');
  for (const scene of plan.scenes) {
    if (['MotionImage', 'BeforeAfterSplit', 'PainMontage'].includes(scene.template) && !plan.requests.length) errors.push(`${scene.id}: ${scene.template} needs a media request.`);
    if (scene.template === 'VideoScene' && !plan.requests.some(slot => slot.kind === 'video')) errors.push(`${scene.id}: VideoScene needs a video request.`);
    if (realFinishedAssets === 0 && scene.section === 'result' && !['PhoneDemo', 'UIZoom', 'BigCaptions'].includes(scene.template)) errors.push(`${scene.id}: show the real product recording for the result; no real finished photographs are available.`);
  }
  for (const request of plan.requests) {
    if (realFinishedAssets === 0 && request.use === 'finished_work') errors.push(`${request.id}: no real finished-work assets are available; use product recordings for the result instead.`);
    if (assetIds && request.references.some(id => !assetIds.includes(id))) errors.push(`${request.id}: reference images must be library asset IDs, never capture or scene IDs. Real UI uses PhoneDemo/UIZoom and needs no generated media request.`);
  }
  return errors;
}
export function validateStoryboard(board, { captures, knowledge, variant }, { partial = false } = {}) {
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
  if (!partial) {
    for (const section of sections) if (!board.scenes.some(scene => scene.section === section)) errors.push('Missing section: ' + section);
    if (board.scenes[0]?.section !== 'hook' || board.scenes.at(-1)?.section !== 'cta') errors.push('Start with the hook and finish with the CTA.');
    if (!board.scenes.some(scene => scene.section === 'demo' && scene.props.clipId)) errors.push('The demo must show a current real product capture.');
    errors.push(...validateMediaRequests(board.requests));
  }
  if (board.scenes.some(scene => scene.template === 'CTACard' && scene.section !== 'cta')) errors.push('The CTA card belongs only in the final section.');
  if (board.scenes.some(scene => scene.template === 'VideoScene' && board.requests.find(request => request.id === scene.props.slotId)?.kind !== 'video')) errors.push('VideoScene must use a video slot.');
  return [...new Set(errors)];
}
export const fixedMediaRules = 'Every person shown, including background people, must be a Black adult. Use dignified professional settings appropriate to Nigerian photographers. No children, celebrities or real-person likenesses. No text, logos, visible watermarks, invented app screens or readable private information. Generate context scenes only; do not present generated images as a photographer’s real finished work.';
