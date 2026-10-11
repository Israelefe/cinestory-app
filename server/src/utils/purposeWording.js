// Wording edits may change grammar, not introduce new content. Keep this
// deliberately conservative: an unfamiliar word can be a person's name.
const GRAMMAR = new Set('a an the and or but as because at by for from in into of on to with is are was were be been being has have had it its this these that those'.split(' '));
// These words describe the photography task already established by this form.
// They can frame any supplied purpose without adding facts about the shoot.
const CONTEXT = new Set(['photo', 'shoot', 'taken', 'made', 'purpose', 'document', 'capture', 'cover']);
const ALIASES = new Map([
  ['photos', 'photo'], ['photograph', 'photo'], ['photographs', 'photo'], ['pictures', 'photo'], ['picture', 'photo'], ['images', 'photo'], ['image', 'photo'],
  ['photoshoot', 'shoot'], ['photoshoots', 'shoot'], ['shoots', 'shoot'], ['session', 'shoot'], ['sessions', 'shoot'],
  ['take', 'taken'], ['taking', 'taken'], ['took', 'taken'], ['shot', 'taken'], ['make', 'made'], ['making', 'made'],
  ['photographing', 'photo'], ['photographed', 'photo'],
  ['documenting', 'document'], ['documented', 'document'], ['documents', 'document'],
  ['capturing', 'capture'], ['captured', 'capture'], ['captures', 'capture'],
  ['covering', 'cover'], ['covered', 'cover'], ['coverage', 'cover'],
  ['birthday', 'birthday'], ['birthdays', 'birthday'], ['bday', 'birthday'], ['birthay', 'birthday'], ['birthdy', 'birthday'], ['bithday', 'birthday'],
  ['celebration', 'celebrate'], ['celebrations', 'celebrate'], ['celebrating', 'celebrate'], ['celebrated', 'celebrate'],
  ['marking', 'mark'], ['marks', 'mark'], ['marked', 'mark'],
  ['turning', 'turn'], ['turns', 'turn'], ['turned', 'turn'],
  ['years', 'year'], ['aged', 'age'],
  ['weddings', 'wedding'], ['anniversaries', 'anniversary'], ['portraits', 'portrait'],
  ['launching', 'launch'], ['launched', 'launch'], ['launches', 'launch'],
  ['honouring', 'honour'], ['honoring', 'honour'], ['honor', 'honour'], ['honours', 'honour'], ['honors', 'honour']
]);
const OCCASIONS = new Set(['birthday', 'celebrate', 'wedding', 'anniversary', 'graduation', 'engagement', 'owambe']);
const OTHER_OCCASIONS = new Set(['memorial', 'memory', 'funeral', 'remembrance', 'engagement', 'maternity', 'newborn', 'conference', 'concert', 'launch', 'shower', 'owambe']);

const SMALL_NUMBERS = new Map(Object.entries({
  zero: 0, one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4,
  five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8,
  nine: 9, ninth: 9, ten: 10, tenth: 10, eleven: 11, eleventh: 11, twelve: 12, twelfth: 12,
  thirteen: 13, thirteenth: 13, fourteen: 14, fourteenth: 14, fifteen: 15, fifteenth: 15,
  sixteen: 16, sixteenth: 16, seventeen: 17, seventeenth: 17, eighteen: 18, eighteenth: 18,
  nineteen: 19, nineteenth: 19
}));
const TENS = new Map(Object.entries({
  twenty: 20, twentieth: 20, thirty: 30, thirtieth: 30, forty: 40, fortieth: 40,
  fifty: 50, fiftieth: 50, sixty: 60, sixtieth: 60, seventy: 70, seventieth: 70,
  eighty: 80, eightieth: 80, ninety: 90, ninetieth: 90
}));
const CONTRACTIONS = new Map(Object.entries({
  "can't": 'can not', cannot: 'can not', "won't": 'will not', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "couldn't": 'could not', "wouldn't": 'would not',
  "shouldn't": 'should not', "mustn't": 'must not', "needn't": 'need not',
  "i'm": 'i am', "we're": 'we are', "they're": 'they are', "you're": 'you are',
  "i've": 'i have', "we've": 'we have', "they've": 'they have', "you've": 'you have',
  "i'll": 'i will', "we'll": 'we will', "they'll": 'they will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will'
}));

function tokens(value, preserveCase = false) {
  const text = String(value || '').normalize('NFC').replace(/[\u2018\u2019]/g, "'")
    .replace(/\b[\p{L}]+(?:'[\p{L}]+)?\b/gu, word => CONTRACTIONS.get(word.toLocaleLowerCase()) || word)
    .replace(/'s\b/gi, '');
  return (preserveCase ? text : text.toLocaleLowerCase())
    // An o in an otherwise numeric ordinal is a common zero typo: 2oth -> 20th.
    .replace(/\b(\d+)o(st|nd|rd|th)\b/g, (_match, digits, suffix) => digits + '0' + suffix)
    .match(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)*|\d+(?:st|nd|rd|th)?/gu) || [];
}

function nameAnchors(value) {
  const words = tokens(value, true);
  const anchors = new Set();
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index].toLocaleLowerCase();
    if (!/^\p{Lu}/u.test(words[index]) || GRAMMAR.has(word) || SMALL_NUMBERS.has(word) || TENS.has(word)) continue;
    const next = words[index + 1]?.toLocaleLowerCase();
    const previous = words[index - 1]?.toLocaleLowerCase();
    // A name may also be an ordinary verb, such as Mark or Honour. Do not let
    // optional occasion verbs remove that name from a title or a pair of people.
    if (next === 'and' || next === 'at' || /^\d/.test(next || '') || SMALL_NUMBERS.has(next) || TENS.has(next)
      || OCCASIONS.has(next) || OTHER_OCCASIONS.has(next) || ['and', 'for', 'of', 'with', 'by'].includes(previous)) anchors.add(word);
  }
  for (const match of String(value || '').normalize('NFC').matchAll(/([\p{L}\p{M}]+(?:['\u2019][\p{L}\p{M}]+)*)['\u2019]s\b/giu)) {
    const word = match[1].replace(/\u2019/g, "'").toLocaleLowerCase();
    if (!GRAMMAR.has(word)) anchors.add(word);
  }
  return anchors;
}

function roots(value) {
  const words = tokens(value);
  const result = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (/^\d/.test(word)) { result.push(word.replace(/(?:st|nd|rd|th)$/, '').replace(/^0+(?=\d)/, '')); continue; }
    let number = TENS.get(word) ?? SMALL_NUMBERS.get(word);
    if (number === undefined) { result.push(ALIASES.get(word) || word); continue; }
    if (number > 0 && number < 10 && /^hundred(?:th)?$/.test(words[index + 1] || '')) {
      number *= 100;
      index += 1;
      if (words[index] === 'hundred') {
        const next = words[index + 1] === 'and' ? index + 2 : index + 1;
        const remainder = TENS.get(words[next]) ?? SMALL_NUMBERS.get(words[next]);
        if (remainder !== undefined) { number += remainder; index = next; }
      }
    }
    // A cardinal tens word can combine with a unit, including a hyphenated ordinal.
    if (number >= 20 && number % 10 === 0 && !/(?:ieth|hundredth)$/.test(words[index])) {
      const unit = SMALL_NUMBERS.get(words[index + 1]);
      if (unit > 0 && unit < 10) { number += unit; index += 1; }
    }
    result.push(String(number));
  }
  return result;
}

function ageTitle(words) {
  const text = words.join(' ');
  // Tokenised clock times such as "at 10:30 am" must not become birthday ages.
  return /\b(?:turn|age) \d{1,3}\b|\b\d{1,3} year old\b|\bat \d{1,3}\b(?! (?:\d|am\b|pm\b|o'clock\b|hours?\b))/.test(text);
}

// Use the photographer's selected Birthday type only to resolve an explicit age
// title. A shoot type alone must never supply a missing name, age or occasion.
export function purposeHasBirthdayAge(original, shootType) {
  const words = roots(original);
  return String(shootType || '').trim().toLocaleLowerCase() === 'birthday'
    && ageTitle(words) && !words.some(word => OCCASIONS.has(word) || OTHER_OCCASIONS.has(word));
}

function exclusions(words) {
  const negatives = new Set(['not', 'no', 'never', 'without']);
  const boundaries = new Set(['with', 'but', 'on', 'at', 'in', 'for', 'by']);
  return words.flatMap((word, index) => {
    if (!negatives.has(word)) return [];
    const scope = [];
    for (const next of words.slice(index + 1)) {
      if (negatives.has(next) || (scope.length && boundaries.has(next))) break;
      if (!GRAMMAR.has(next)) scope.push(next);
    }
    return [word + ':' + scope.sort().join(',')];
  });
}

export function purposeWordingIssues(original, suggestion, { shootType = '' } = {}) {
  if (typeof suggestion !== 'string' || !suggestion.trim() || /\n|\r|\bshoot\s+type\s*:/i.test(suggestion)) return ['Return one improved purpose, without field labels.'];
  if (suggestion.length > 3000) return ['Keep the improved purpose within 3000 characters. Shorten the phrasing without removing any facts.'];
  const source = roots(original);
  const edited = roots(suggestion);
  const sourceSet = new Set(source);
  const editedSet = new Set(edited);
  const hasAge = ageTitle(source);
  const birthdayAge = purposeHasBirthdayAge(original, shootType);
  const hasShower = sourceSet.has('shower') && (sourceSet.has('bridal') || sourceSet.has('baby'));
  const hasMemorial = source.some(word => ['memorial', 'memory', 'funeral', 'remembrance'].includes(word));
  const hasOccasion = source.some(word => OCCASIONS.has(word)) || hasShower || (hasAge && !source.some(word => OTHER_OCCASIONS.has(word)));
  const allowed = new Set([...sourceSet, ...GRAMMAR, ...CONTEXT]);
  if (hasOccasion) { allowed.add('celebrate'); allowed.add('mark'); }
  if (hasMemorial) allowed.add('honour');
  if (birthdayAge) allowed.add('birthday');
  if (hasAge) { allowed.add('turn'); allowed.add('age'); allowed.add('year'); allowed.add('old'); }
  const optional = new Set([...GRAMMAR, ...CONTEXT]);
  if (hasOccasion) { optional.add('celebrate'); optional.add('mark'); }
  if (hasMemorial) optional.add('honour');
  if (hasAge) { optional.add('turn'); optional.add('age'); optional.add('year'); optional.add('old'); }
  const issues = [];
  if (edited.some(word => !allowed.has(word))) issues.push('Do not introduce new names, descriptions, places, relationships or other content.');
  const editedWords = new Set(tokens(suggestion));
  if (source.some(word => !optional.has(word) && !editedSet.has(word)) || [...nameAnchors(original)].some(word => !editedWords.has(word))) issues.push('Keep every supplied name, occasion and detail.');
  // Keep numbers in their original order, including ages, dates and times.
  const numbers = words => words.filter(word => /^\d/.test(word)).map(word => word.replace(/(?:st|nd|rd|th)$/, ''));
  if (JSON.stringify(numbers(source)) !== JSON.stringify(numbers(edited))) issues.push('Keep all numbers and their order unchanged.');
  if (JSON.stringify(exclusions(source)) !== JSON.stringify(exclusions(edited))) issues.push('Keep exclusions and negative wording unchanged.');
  return issues;
}
