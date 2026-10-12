// Never borrow a neighbouring photograph's words when a model omits an ID.
export function orderWritingFrames(value, selected) {
  const frames = Array.isArray(value) ? value.filter(frame => frame && typeof frame === 'object' && !Array.isArray(frame)) : [];
  const byId = new Map();
  const duplicates = new Set();
  for (const frame of frames) {
    const id = String(frame.assetId || '');
    if (byId.has(id)) duplicates.add(id);
    else byId.set(id, frame);
  }
  return selected.map(assetId => duplicates.has(assetId) || !byId.has(assetId) ? { assetId } : { ...byId.get(assetId), assetId });
}

export function unsupportedWritingAddress(value, delivery) {
  const known = new Set(String([delivery.clientName, delivery.brief].filter(Boolean).join(' ')).toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) || []);
  const ordinary = new Set(('you your he she they we our these those this a an the it that what here there let life today tomorrow yesterday everyone someone anyone nobody nothing everything something now together still finally first next sometimes often attendee attendees audience speaker participant participants guests guest family people couple person man woman staff model portraits portrait photographs photograph photos photo collection series session outfit jacket dress garment product details detail scene chapter registration coverage campaign birthday wedding graduation lookbook colour color front back some each both all another one two room venue conference programme program stage panel speech speeches arrival arrivals break breaks refreshment refreshments queue badge microphone lectern hand hands face hair sleeve collar pocket clasp label logo fabric stitching seam light camera framing image images set sets view views opening closing welcome applause conversation conversations celebration photograph collection').split(' '));
  const text = String(value || '');
  const candidates = [...text.matchAll(/(?:^|[.!?]\s+)([\p{Lu}][\p{L}\p{M}-]+),\s+(?:you|your|this|turning|may|take|here|today|on)\b/gu), ...text.matchAll(/\b([\p{Lu}][\p{L}\p{M}-]+)['’]s\b/gu)];
  for (const match of text.matchAll(/\b([\p{Lu}][\p{L}\p{M}-]+)(?:\s+and\s+([\p{Lu}][\p{L}\p{M}-]+))?\s+(?:is|are|stands?|sits?|wears?|holds?|walks?|poses?)\b/gu)) {
    candidates.push([match[0], match[1]]);
    if (match[2]) candidates.push([match[0], match[2]]);
  }
  return candidates.some(match => {
    const word = match[1].toLocaleLowerCase();
    return !ordinary.has(word) && !(word.match(/[\p{L}\p{M}]+/gu) || []).every(part => known.has(part));
  });
}
