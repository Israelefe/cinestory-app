// Wording edits may change grammar, not introduce new content. Keep this
// deliberately conservative: an unfamiliar word can be a person's name.
const GRAMMAR = new Set('a an the and or but as at by for from in into of on to with is are was were be been being has have had it its this these that those'.split(' '));
const CONTEXT = new Set(['photo', 'shoot', 'taken', 'made', 'purpose']);
const ALIASES = new Map([
  ['photos', 'photo'], ['photograph', 'photo'], ['photographs', 'photo'], ['pictures', 'photo'], ['picture', 'photo'], ['images', 'photo'], ['image', 'photo'],
  ['photoshoot', 'shoot'], ['photoshoots', 'shoot'], ['shoots', 'shoot'], ['session', 'shoot'], ['sessions', 'shoot'],
  ['take', 'taken'], ['taking', 'taken'], ['took', 'taken'], ['make', 'made'], ['making', 'made'],
  ['birthday', 'birthday'], ['birthdays', 'birthday'], ['bday', 'birthday'], ['birthay', 'birthday'], ['birthdy', 'birthday'], ['bithday', 'birthday'],
  ['celebration', 'celebrate'], ['celebrations', 'celebrate'], ['celebrating', 'celebrate'], ['celebrated', 'celebrate'],
  ['marking', 'mark'], ['marks', 'mark'], ['marked', 'mark'],
  ['weddings', 'wedding'], ['anniversaries', 'anniversary'], ['portraits', 'portrait'],
  ['launching', 'launch'], ['launched', 'launch'], ['launches', 'launch'],
  ['honouring', 'honour'], ['honoring', 'honour'], ['honor', 'honour'], ['honours', 'honour'], ['honors', 'honour']
]);
const OCCASIONS = new Set(['birthday', 'celebrate', 'wedding', 'anniversary', 'graduation']);

function tokens(value) {
  return String(value || '').normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/'s\b/gi, '').toLocaleLowerCase().match(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)*|\d+(?:st|nd|rd|th)?/gu) || [];
}
function roots(value) { return tokens(value).map(word => ALIASES.get(word) || word); }

export function purposeWordingIssues(original, suggestion) {
  if (typeof suggestion !== 'string' || !suggestion.trim() || suggestion.length > 3000 || /\n|\r|\bshoot\s+type\s*:/i.test(suggestion)) return ['Return one improved purpose, without field labels.'];
  const source = roots(original);
  const edited = roots(suggestion);
  const sourceSet = new Set(source);
  const editedSet = new Set(edited);
  const hasOccasion = source.some(word => OCCASIONS.has(word));
  const allowed = new Set([...sourceSet, ...GRAMMAR]);
  if (hasOccasion) { allowed.add('celebrate'); allowed.add('mark'); }
  const optional = new Set([...GRAMMAR, ...CONTEXT]);
  if (hasOccasion) { optional.add('celebrate'); optional.add('mark'); }
  const issues = [];
  if (edited.some(word => !allowed.has(word))) issues.push('Do not introduce new names, descriptions, places, relationships or other content.');
  if (source.some(word => !optional.has(word) && !editedSet.has(word))) issues.push('Keep every supplied name, occasion and detail.');
  // Keep numbers in their original order, including ages, dates and times.
  const numbers = words => words.filter(word => /^\d/.test(word)).map(word => word.replace(/(?:st|nd|rd|th)$/, ''));
  if (JSON.stringify(numbers(source)) !== JSON.stringify(numbers(edited))) issues.push('Keep all numbers and their order unchanged.');
  const exclusions = words => words.flatMap((word, index) => ['not', 'no', 'never', 'without'].includes(word) ? [word + ':' + (words.slice(index + 1).find(next => !GRAMMAR.has(next)) || '')] : []);
  if (JSON.stringify(exclusions(source)) !== JSON.stringify(exclusions(edited))) issues.push('Keep exclusions and negative wording unchanged.');
  return issues;
}
