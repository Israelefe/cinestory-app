import { hasDetailedWriting } from '../constants/deliveryWritingLimits.js';

const normalize = value => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function personalCaptionMeaningIssues(text, purpose = '') {
  const value = String(text || '');
  const issues = [];
  if (/\b(?:your|this|the|a|that)\s+(?:(?:gentle|soft|broad|warm|sincere|bright|visible|playful|quiet|small|subtle)\s+){0,2}(?:smile|grin|laughter)\b/i.test(value) || /\b(?:smile|grin|laughter)\s+(?:reflects?|reveals?|suggests?|express(?:es)?|hints?|captures?|shows?|says?|proves?|means?|adds?|keeps?|opens?)\b/i.test(value)) issues.push('write about the shoot purpose, not a report or interpretation of a facial expression');
  if (/\b(?:inner glow|quiet confidence|timeless joy|enduring light|radiates? joy|vibrant energy|opens? the door|quiet reminder|visual bookmark|captures? the (?:spirit|essence))\b/i.test(value)) issues.push('replace stock praise or decorative metaphors with a plain personal message');
  if (/\b(?:records?|captures?|express(?:es)?|reflects?|reveals?|shows?)\s+(?:the|your|their|his|her)\s+(?:feelings?|calm|joy|gratitude|love|confidence)\b|\bplaceholder\b/i.test(value)) issues.push('do not claim the photograph records private feelings or describe a finished photograph as a placeholder');
  for (const sentence of value.split(/[.!?]+/)) {
    if (/\b(?:may|wish|hope)\b/i.test(sentence)) continue;
    const claims = [...sentence.matchAll(/\b(?:your|their|his|her)\s+(curiosity|confidence|courage|resilience|determination|strength|ambition|happiness|joy|love|gratitude)\b|\b(small victories|achievements|successes|journey so far|paths you(?:['’]ve| have) walked)\b/gi)].map(match => match[1] || match[2]);
    if (claims.some(claim => !normalize(purpose).includes(normalize(claim)))) issues.push('do not invent personal traits, feelings, achievements or history');
  }
  return issues;
}

export function detailedWritingFactsIssues(text, delivery, observation = '') {
  const facts = normalize(`${delivery.brief || ''} ${observation}`);
  const details = String(text || '').match(/\b(?:emerald|ivory|burgundy|plum|velvet|linen|silk|leather|cotton|waterproof|sustainable|handmade|organic|tailored|oversized|sleeveless|lightweight|breathable|weave|texture|earrings?|cuffs?|telephones?|plinths?|balloons?|champagne|cakes?|gowns?|blazers?|suits?|dresses?|jackets?|pockets?|backdrops?|lecterns?|microphones?|badges?|coffee|business cards?|queues?|staff|traditional attire|hands linked|hands joined|holding hands|clasped|start of the day)\b/gi) || [];
  return [...new Set(details.filter(detail => {
    const term = normalize(detail);
    return !new RegExp(`\\b${term}(?:s)?\\b`).test(facts) && !(term.endsWith('s') && new RegExp(`\\b${term.slice(0, -1)}(?:s)?\\b`).test(facts));
  }))].map(detail => `unsupported photo detail: ${detail}`);
}
export function repeatsWriting(value, sources = []) {
  const text = normalize(value);
  if (!text) return false;
  const sentences = String(value).match(/[^.!?]+[.!?]?/g) || [];
  return sources.some(source => normalize(source) === text || sentences.some(sentence => {
    const fragment = normalize(sentence);
    return fragment.length >= 40 && (String(source).match(/[^.!?]+[.!?]?/g) || []).some(other => normalize(other) === fragment);
  }));
}

export function detailedFrameIssues(frame, format, surrounding = []) {
  if (!hasDetailedWriting(format)) return [];
  const issues = [];
  const headline = normalize(frame?.headline);
  if (/^(?:(?:chapter|scene|section|asset|photo|photograph) (?:\d+|one|two|three|four|five)|(?:the )?(?:photographs|photos|collection|event scene|campaign assets|selected work))$/.test(headline)) issues.push('headline needs a specific subject');
  if (repeatsWriting(frame?.caption, [frame?.headline, ...surrounding])) issues.push('caption repeats other writing instead of adding information');
  const sentences = String(frame?.caption || '').match(/[^.!?]+[.!?]?/g) || [];
  if (sentences.some((sentence, index) => repeatsWriting(sentence, sentences.slice(0, index)))) issues.push('caption repeats its own sentence');
  return issues;
}
