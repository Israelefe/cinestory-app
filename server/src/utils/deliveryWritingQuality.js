import { hasDetailedWriting } from '../constants/deliveryWritingLimits.js';

const normalize = value => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function detailedWritingFactsIssues(text, delivery, observation = '') {
  if (!hasDetailedWriting(delivery.format)) return [];
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
