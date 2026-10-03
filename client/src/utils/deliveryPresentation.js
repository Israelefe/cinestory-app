export const PRESENTATION_KEYS = Object.freeze({ canvas: 'canvas', chapters: 'chapters', album: 'album', 'event-coverage': 'eventCoverage', campaign: 'campaign' });
export const SECTION_LAYOUTS = Object.freeze({ canvas: ['cluster', 'grid', 'pair', 'triptych', 'strip'], chapters: ['single', 'pair', 'triptych', 'grid'], 'event-coverage': ['hero', 'grid', 'strip'], campaign: ['hero', 'grid', 'strip', 'spread'] });
export const SECTION_BODY_LIMITS = Object.freeze({ canvas: 180, chapters: 320, 'event-coverage': 360, campaign: 320 });
export const SPREAD_COUNTS = Object.freeze({ single: 1, wide: 1, pair: 2, triptych: 3 });
export const numberLabel = value => String(value).padStart(2, '0');
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
function uniqueIds(items, prefix) {
  const used = new Set();
  return items.map((item, index) => { const base = /^[a-z0-9-]{1,60}$/.test(item.id || '') ? item.id : prefix + '-' + (index + 1); let id = base, suffix = 2; while (used.has(id)) id = base.slice(0, 54) + '-' + suffix++; used.add(id); return { ...item, id }; });
}

/** Normalize older records without changing their wording or omitting approved photos. */
export function presentationSections(delivery, ids = delivery?.curatedAssetIds || []) {
  const known = new Set(ids.map(String)), used = new Set();
  const source = Array.isArray(delivery?.creativeDirection?.sections) ? delivery.creativeDirection.sections : [];
  const result = source.map((section, index) => {
    const assetIds = (section.assetIds || []).map(String).filter(id => known.has(id) && !used.has(id) && used.add(id));
    const layout = SECTION_LAYOUTS[delivery?.format]?.includes(section.layout) ? section.layout : SECTION_LAYOUTS[delivery?.format]?.[0] || 'grid';
    return { ...section, id: /^[a-z0-9-]{1,60}$/.test(section.id || '') ? section.id : `section-${index + 1}`, title: text(section.title, 60) || `Group ${numberLabel(index + 1)}`, subtitle: text(section.subtitle, 120), body: text(section.body ?? section.subtitle, SECTION_BODY_LIMITS[delivery?.format] || 120), assetIds, coverAssetId: assetIds.includes(section.coverAssetId) ? section.coverAssetId : assetIds[0], layout };
  }).filter(section => section.assetIds.length);
  const remaining = ids.map(String).filter(id => !used.has(id));
  if (!result.length && remaining.length && delivery?.format === 'event-coverage') {
    for (let at = 0; at < remaining.length; at += 6) { const assetIds = remaining.slice(at, at + 6), n = result.length + 1; result.push({ id: `scene-${n}`, title: `Scene ${numberLabel(n)}`, subtitle: '', body: '', assetIds, coverAssetId: assetIds[0], layout: 'grid' }); }
  } else if (!result.length && remaining.length) result.push({ id: 'showcase', title: 'The photographs', subtitle: '', body: '', assetIds: remaining, coverAssetId: remaining[0], layout: SECTION_LAYOUTS[delivery?.format]?.[0] || 'grid' });
  else if (remaining.length) result[0].assetIds.push(...remaining);
  return uniqueIds(result, 'section');
}

export function suggestedSpreads(ids = [], assets = [], frames = []) {
  const byId = new Map(assets.map(asset => [String(asset.assetId), asset]));
  const words = new Map(frames.map(frame => [String(frame.assetId), frame]));
  const wide = id => { const asset = byId.get(String(id)); return asset?.width && asset?.height && asset.width / asset.height >= 1.25; };
  const spreads = [];
  for (let index = 0; index < ids.length;) {
    const paired = !wide(ids[index]) && index + 1 < ids.length && !wide(ids[index + 1]);
    const assetIds = ids.slice(index, index + (paired ? 2 : 1)).map(String);
    const frame = words.get(assetIds[0]) || {};
    spreads.push({ id: `spread-${spreads.length + 1}`, layout: wide(ids[index]) ? 'wide' : paired ? 'pair' : 'single', assetIds, heading: text(frame.headline, 70), note: text(frame.caption, 180) });
    index += assetIds.length;
  }
  return spreads;
}

export function albumSpreads(delivery, ids = delivery?.curatedAssetIds || []) {
  const source = delivery?.formatConfig?.album?.spreads;
  if (!Array.isArray(source) || !source.length) return suggestedSpreads(ids, delivery?.assets, delivery?.creativeDirection?.frames);
  const known = new Set(ids.map(String)), used = new Set();
  const spreads = source.flatMap((spread, index) => {
    const assetIds = (spread.assetIds || []).map(String).filter(id => known.has(id) && !used.has(id) && used.add(id));
    if (!assetIds.length) return [];
    return { ...spread, id: /^[a-z0-9-]{1,60}$/.test(spread.id || '') ? spread.id : `spread-${index + 1}`, layout: SPREAD_COUNTS[spread.layout] === assetIds.length ? spread.layout : assetIds.length === 2 ? 'pair' : assetIds.length === 3 ? 'triptych' : 'single', assetIds, heading: text(spread.heading, 70), note: text(spread.note, 180) };
  });
  // Corrupt older spreads with unsupported counts degrade into singles, never hidden photos.
  const repaired = spreads.flatMap(spread => spread.assetIds.length > 3 ? spread.assetIds.map((id, index) => ({ ...spread, id: `${spread.id}-${index + 1}`, layout: 'single', assetIds: [id] })) : [spread]);
  const rest = ids.map(String).filter(id => !used.has(id));
  return uniqueIds([...repaired, ...rest.map((id, index) => ({ id: `extra-${index + 1}`, layout: 'single', assetIds: [id], heading: '', note: '' }))], 'spread');
}

export function presentationSettings(delivery, ids = delivery?.curatedAssetIds || []) {
  const key = PRESENTATION_KEYS[delivery?.format], raw = delivery?.formatConfig?.[key] || {};
  if (key === 'canvas') return { version: 1, arrangement: raw.arrangement === 'ordered' ? 'ordered' : 'spatial', showGroupNotes: raw.showGroupNotes !== false };
  if (key === 'chapters') return { version: 1, directoryLayout: raw.directoryLayout === 'list' ? 'list' : 'covers', showPhotoCaptions: raw.showPhotoCaptions !== false };
  if (key === 'album') return { version: 1, paperTone: ['light', 'dark'].includes(raw.paperTone) ? raw.paperTone : 'theme', spreads: albumSpreads(delivery, ids) };
  if (key === 'eventCoverage') return { version: 1, highlightAssetIds: (raw.highlightAssetIds || ids.filter((_, index) => index % Math.max(1, Math.floor(ids.length / 4)) === 0).slice(0, 4)).filter(id => ids.includes(id)), showSceneNotes: raw.showSceneNotes !== false, eventDate: text(raw.eventDate, 10), venue: text(raw.venue, 120) };
  if (key === 'campaign') return { version: 1, highlightAssetIds: (raw.highlightAssetIds || []).filter(id => ids.includes(id)), assetLabels: (raw.assetLabels || []).filter(label => ids.includes(label.assetId)), fileSets: (raw.fileSets || []).map(set => ({ ...set, assetIds: (set.assetIds || []).filter(id => ids.includes(id)) })).filter(set => set.assetIds.length) };
  return null;
}

export function reconcilePresentation(presentation, ids, assets = [], frames = []) {
  if (!presentation) return presentation;
  const next = { ...presentation };
  if (next.spreads) next.spreads = albumSpreads({ formatConfig: { album: next }, assets, creativeDirection: { frames } }, ids);
  if (next.highlightAssetIds) next.highlightAssetIds = next.highlightAssetIds.filter(id => ids.includes(id));
  if (next.assetLabels) next.assetLabels = next.assetLabels.filter(label => ids.includes(label.assetId));
  if (next.fileSets) next.fileSets = next.fileSets.map(set => ({ ...set, assetIds: set.assetIds.filter(id => ids.includes(id)) })).filter(set => set.assetIds.length);
  return next;
}
