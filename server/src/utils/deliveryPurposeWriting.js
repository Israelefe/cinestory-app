import { deliveryWritingContext, supportsVisualWriting, writingFallback } from '../constants/deliveryWriting.js';

const wordCount = value => String(value || '').trim().split(/\s+/).filter(Boolean).length;
const fitText = (value, limit) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1);
  const boundary = clipped.lastIndexOf(' ');
  return (boundary > 0 ? clipped.slice(0, boundary) : clipped).replace(/[\s,;:]+$/, '').replace(/[.!?]+$/, '') + '.';
};

const BIRTHDAY_FALLBACKS = [
  ['A Birthday on Your Terms', 'may the year ahead bring you more time for what you love and more reasons to smile.'],
  ['One for Your Album', 'these portraits are yours to keep and revisit whenever you want to remember this birthday.'],
  ['A Birthday Worth Keeping', 'you have a collection to return to, long after this birthday has passed.'],
  ['Just for You', 'take your time with these portraits. You do not need another occasion to enjoy them.'],
  ['Your Birthday Collection', 'these photographs mark this birthday, with a full gallery for you to explore in your own time.'],
  ['Celebrate Your Own Way', 'take this day for yourself, with space to do what you enjoy and mark it your own way.'],
  ['Keep What Matters Close', 'may you keep close to what matters, try something you want, and give yourself room to enjoy it.'],
  ['A Pace of Your Own', 'may you find a pace that suits you, with time to grow and time to enjoy being here.'],
  ['Wishing You a Good Year', 'here is a wish for good health, good company, and a year you can make your own.'],
  ['More Reasons to Laugh', 'may the year ahead bring laughter, room to rest, and good things for you to look forward to.']
];

export function purposeHeadline(delivery, index = 0) {
  if (deliveryWritingContext(delivery).shoot !== 'birthday' || deliveryWritingContext(delivery).separateSubject || ['event-coverage', 'campaign'].includes(delivery.format)) return writingFallback(delivery, index).headline;
  const purpose = String(delivery.brief || '').replace(/\s+/g, ' ').trim();
  if (index > 0 || delivery.format === 'editorial') {
    const heading = BIRTHDAY_FALLBACKS[index % BIRTHDAY_FALLBACKS.length][0];
    return (index >= 20 ? 'Your Birthday: ' : index >= 10 ? 'For You: ' : '') + heading;
  }
  const fallback = purpose && wordCount(purpose) === 1 && delivery.clientName
    ? String(delivery.clientName).trim() + "'s " + purpose
    : purpose || [delivery.clientName, delivery.shootType, 'Photographs'].filter(Boolean).join(' ');
  const bounded = fallback.split(/\s+/).slice(0, 7).join(' ');
  return fitText(bounded.charAt(0).toLocaleUpperCase() + bounded.slice(1), 70);
}

export function purposeCaption(delivery, limit, index = 0) {
  const { shoot, separateSubject } = deliveryWritingContext(delivery);
  if (shoot !== 'birthday' || separateSubject || ['event-coverage', 'campaign'].includes(delivery.format)) return writingFallback(delivery, index, limit).caption;
  const purpose = String(delivery.brief || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeOccasionNumbers(purpose);
  const age = Number(normalized.match(/\b(\d{1,3})(?:st|nd|rd|th)?\s+birthday\b/)?.[1] || normalized.match(/\b(?:turning|turns|turned)\s+(\d{1,3})\b/)?.[1] || 0);
  const suffix = age % 100 >= 11 && age % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[age % 10] || 'th');
  const birthday = 'your ' + (age ? age + suffix + ' ' : '') + 'birthday';
  const prefix = limit === 150 && index >= 10
    ? (index >= 20 ? 'To mark ' : 'For ') + birthday + ', '
    : index >= 20 ? 'For the year ' + birthday + ' begins, ' : index >= 10 ? 'As you celebrate ' + birthday + ', ' : 'On ' + birthday + ', ';
  return prefix + BIRTHDAY_FALLBACKS[index % BIRTHDAY_FALLBACKS.length][1];
}

export function normalizeOccasionNumbers(value) {
  const units = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9 };
  const tens = { twenty: 20, twentieth: 20, thirty: 30, thirtieth: 30, forty: 40, fortieth: 40, fifty: 50, fiftieth: 50, sixty: 60, sixtieth: 60, seventy: 70, seventieth: 70, eighty: 80, eightieth: 80, ninety: 90, ninetieth: 90 };
  const teens = { ten: 10, tenth: 10, eleven: 11, eleventh: 11, twelve: 12, twelfth: 12, thirteen: 13, thirteenth: 13, fourteen: 14, fourteenth: 14, fifteen: 15, fifteenth: 15, sixteen: 16, sixteenth: 16, seventeen: 17, seventeenth: 17, eighteen: 18, eighteenth: 18, nineteen: 19, nineteenth: 19 };
  const pattern = new RegExp('\\b(' + Object.keys(tens).join('|') + ')(?:[-\\s]+(' + Object.keys(units).join('|') + '))?\\b|\\b(' + Object.keys(teens).join('|') + ')\\b', 'g');
  return String(value || '').toLocaleLowerCase().replace(pattern, (_match, ten, unit, teen) => String(teen ? teens[teen] : tens[ten] + (units[unit] || 0)));
}

function purposeTokens(delivery) {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'our', 'their', 'was', 'were', 'are', 'into', 'over', 'under', 'through', 'about', 'photograph', 'photographs', 'photo', 'photos', 'image', 'images', 'gallery', 'collection', 'delivery', 'shoot', 'session']);
  const normalize = value => normalizeOccasionNumbers(value)
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[’']s\b/gi, '')
    .replace(/[’']/g, '')
    .match(/[a-z0-9]+/g) || [];
  const clientTokens = normalize(delivery.clientName);
  const briefTokens = normalize(`${delivery.brief || ''} ${delivery.shootType || ''}`);
  return new Set([...clientTokens, ...briefTokens].filter(token => clientTokens.includes(token) || (/^\d+$/.test(token) || token.length > 2) && !stopWords.has(token)));
}

export function headlineHasPurposeAnchor(value, delivery, caption = '') {
  // The headline and caption form one message. Requiring a name or birthday in
  // both fields discards natural direct addresses and repeats the same heading.
  return textHasPurposeAnchor(value + ' ' + caption, delivery);
}

export function textHasPurposeAnchor(value, delivery) {
  if (supportsVisualWriting(delivery)) return true;
  const anchors = purposeTokens(delivery);
  if (!anchors.size) return true;
  const tokens = normalizeOccasionNumbers(value)
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[’']s\b/gi, '')
    .replace(/[’']/g, '')
    .match(/[a-z0-9]+/g) || [];
  return tokens.some(token => anchors.has(token));
}
