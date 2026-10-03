import { reconcileEditorial } from './editorial.js';
import { reconcilePresentation } from './deliveryPresentation.js';

export function initialWritingOverrides(delivery) {
  const direction = delivery?.creativeDirection || {};
  if (Array.isArray(direction.writingOverrides)) return new Set(direction.writingOverrides);
  // Saved deliveries from before provenance tracking may contain studio edits.
  // Treat their existing writing as manual rather than silently replacing it.
  return new Set(['openingLine', 'closingLine', 'editorial.introduction', ...(direction.sections || []).flatMap(section => [`section:${section.id}:title`, `section:${section.id}:body`]), ...(delivery?.formatConfig?.album?.spreads || []).flatMap(spread => [`spread:${spread.id}:heading`, `spread:${spread.id}:note`]), ...(direction.frames || []).flatMap(frame => [`frame:${frame.assetId}:headline`, `frame:${frame.assetId}:caption`])]);
}

export function writingText(state, key) {
  if (key === 'openingLine' || key === 'closingLine') return state[key] || '';
  if (key === 'editorial.introduction') return state.editorial?.introduction || '';
  const [kind, id, field] = key.split(':');
  if (kind === 'spread') return state.presentation?.spreads.find(spread => spread.id === id)?.[field] || '';
  const section = state.format === 'editorial' ? state.editorial.sections.find(section => section.id === id) : state.sections.find(section => section.id === id);
  return (field === 'body' ? section?.body ?? section?.subtitle : section?.title) || '';
}

export function setWritingText(state, key, text) {
  if (key === 'openingLine' || key === 'closingLine') return { ...state, [key]: text };
  if (key === 'editorial.introduction') return { ...state, editorial: { ...state.editorial, introduction: text } };
  const [kind, id, field] = key.split(':');
  if (kind === 'spread') return { ...state, presentation: { ...state.presentation, spreads: state.presentation.spreads.map(spread => spread.id === id ? { ...spread, [field]: text } : spread) } };
  if (state.format === 'editorial') return { ...state, editorial: { ...state.editorial, sections: state.editorial.sections.map(section => section.id === id ? { ...section, [field]: text } : section) } };
  return { ...state, sections: state.sections.map(section => section.id === id ? { ...section, [field === 'body' && section.body === undefined ? 'subtitle' : field]: text } : section) };
}

export function planPhotoWritingChange(state, { mode, assetId, index, order, editorial: editorialOverride, sections: sectionsOverride, presentation: presentationOverride }) {
  const selected = order || (mode === 'replace' ? state.selected.map((id, at) => at === index ? assetId : id) : mode === 'add' ? [...state.selected, assetId] : state.selected);
  const oldId = mode === 'replace' ? state.selected[index] : null;
  const source = oldId ? { ...state.editorial, sections: state.editorial.sections.map(section => ({ ...section, assetIds: section.assetIds.map(id => id === oldId ? assetId : id) })) } : state.editorial;
  // A section move changes membership only. Keep writing, framing and credits
  // edited while the review was in flight.
  const moved = editorialOverride ? { ...source, sections: editorialOverride.sections.map(section => ({ ...(source.sections.find(item => item.id === section.id) || section), assetIds: section.assetIds })) } : source;
  const editorial = reconcileEditorial(moved, selected, selected.map(id => ({ assetId: id, caption: state.captions[id] || '' })));
  const selectedSet = new Set(selected);
  const sectionSource = sectionsOverride ? sectionsOverride.map(section => ({ ...(state.sections.find(item => item.id === section.id) || section), ...section, title: state.sections.find(item => item.id === section.id)?.title ?? section.title, body: state.sections.find(item => item.id === section.id)?.body ?? section.body })) : state.sections;
  const sections = sectionSource.map(section => { const assetIds = (section.assetIds || []).map(id => id === oldId ? assetId : id).filter(id => selectedSet.has(id)); return { ...section, assetIds, ...(section.coverAssetId ? { coverAssetId: assetIds.includes(section.coverAssetId === oldId ? assetId : section.coverAssetId) ? section.coverAssetId === oldId ? assetId : section.coverAssetId : assetIds[0] } : {}) }; }).filter(section => section.assetIds.length);
  if (sections.length) { const assigned = new Set(sections.flatMap(section => section.assetIds)); sections[0].assetIds.push(...selected.filter(id => !assigned.has(id))); }
  let presentation = presentationOverride || state.presentation;
  if (presentationOverride?.spreads) presentation = { ...presentationOverride, spreads: presentationOverride.spreads.map(spread => { const latest = state.presentation?.spreads.find(item => item.id === spread.id); return latest ? { ...spread, heading: latest.heading, note: latest.note } : spread; }) };
  if (oldId && presentation) presentation = { ...presentation, ...(presentation.spreads ? { spreads: presentation.spreads.map(spread => ({ ...spread, assetIds: spread.assetIds.map(id => id === oldId ? assetId : id) })) } : {}), ...(presentation.highlightAssetIds ? { highlightAssetIds: presentation.highlightAssetIds.map(id => id === oldId ? assetId : id) } : {}), ...(presentation.assetLabels ? { assetLabels: presentation.assetLabels.map(label => label.assetId === oldId ? { ...label, assetId } : label) } : {}), ...(presentation.fileSets ? { fileSets: presentation.fileSets.map(set => ({ ...set, assetIds: set.assetIds.map(id => id === oldId ? assetId : id) })) } : {}) };
  presentation = reconcilePresentation(presentation, selected);
  const next = { ...state, selected, editorial, sections, presentation, ...(mode === 'opening' ? { openingAssetId: assetId } : mode === 'closing' ? { closingAssetId: assetId } : {}) };
  const blocks = [];
  if (mode === 'opening' || mode === 'closing') blocks.push({ key: mode === 'opening' ? 'openingLine' : 'closingLine', kind: mode, assetIds: [assetId], text: mode === 'opening' ? state.openingLine : state.closingLine });
  if (!['opening', 'closing'].includes(mode)) {
    if (state.format === 'editorial' && editorial.introduction && (oldId || selected.length !== state.selected.length)) blocks.push({ key: 'editorial.introduction', kind: 'introduction', assetIds: selected, text: editorial.introduction });
    const before = state.format === 'editorial' ? state.editorial.sections : state.sections;
    const after = state.format === 'editorial' ? editorial.sections : sections;
    for (const section of after) {
      if (JSON.stringify(before.find(item => item.id === section.id)?.assetIds) === JSON.stringify(section.assetIds)) continue;
      const body = section.body ?? section.subtitle;
      if (section.title && section.id !== 'showcase') blocks.push({ key: `section:${section.id}:title`, kind: 'section-title', assetIds: section.assetIds, text: section.title });
      if (body) blocks.push({ key: `section:${section.id}:body`, kind: 'section-body', assetIds: section.assetIds, text: body });
    }
    if (state.format === 'album') for (const spread of presentation?.spreads || []) {
      if (JSON.stringify(state.presentation?.spreads.find(item => item.id === spread.id)?.assetIds) === JSON.stringify(spread.assetIds)) continue;
      for (const field of ['heading', 'note']) if (spread[field]) blocks.push({ key: `spread:${spread.id}:${field}`, kind: `spread-${field}`, assetIds: spread.assetIds, text: spread[field] });
    }
  }
  return { next, blocks };
}

export function applyWritingReview(state, blocks, reviewed, overrides) {
  const expected = new Map(blocks.map(block => [block.key, block]));
  if (!Array.isArray(reviewed) || reviewed.length !== blocks.length || new Set(reviewed.map(item => item.key)).size !== blocks.length || reviewed.some(item => !expected.has(item.key) || typeof item.text !== 'string')) throw new Error('The wording review was incomplete. Try this photograph again.');
  let next = state;
  const suggestions = [];
  for (const item of reviewed) {
    const previous = writingText(next, item.key);
    if (previous === item.text) continue;
    if (overrides.has(item.key) || previous !== expected.get(item.key).text) {
      const sections = state.format === 'editorial' ? state.editorial.sections : state.sections;
      const sectionIndex = sections.findIndex(section => item.key.startsWith(`section:${section.id}:`));
      const spreadIndex = state.presentation?.spreads?.findIndex(spread => item.key.startsWith(`spread:${spread.id}:`)) ?? -1;
      const label = spreadIndex >= 0 ? `Spread ${String(spreadIndex + 1).padStart(2, '0')} ${item.key.endsWith(':heading') ? 'heading' : 'note'}` : sectionIndex >= 0 ? `Section ${String(sectionIndex + 1).padStart(2, '0')} ${item.key.endsWith(':title') ? 'heading' : 'paragraph'}` : state.format === 'editorial' && item.key === 'openingLine' ? 'Cover summary' : state.format === 'editorial' && item.key === 'closingLine' ? 'Closing note' : undefined;
      suggestions.push({ ...item, previous, label });
    }
    else next = setWritingText(next, item.key, item.text);
  }
  return { next, suggestions };
}

export function undoWritingChange(current, before, after) {
  let next = { ...current };
  if (JSON.stringify(current.selected) === JSON.stringify(after.selected)) next.selected = before.selected;
  for (const field of ['openingAssetId', 'closingAssetId', 'openingLine', 'closingLine']) if (current[field] === after[field]) next[field] = before[field];
  next.headlines = { ...current.headlines }; next.captions = { ...current.captions };
  for (const field of ['headlines', 'captions']) for (const id of new Set([...Object.keys(before[field]), ...Object.keys(after[field])])) if (current[field][id] === after[field][id]) { if (before[field][id] === undefined) delete next[field][id]; else next[field][id] = before[field][id]; }
  const previousSections = before.format === 'editorial' ? before.editorial.sections : before.sections;
  const afterSections = after.format === 'editorial' ? after.editorial.sections : after.sections;
  const currentSections = current.format === 'editorial' ? current.editorial.sections : current.sections;
  const restored = currentSections.map(section => {
    const old = previousSections.find(item => item.id === section.id), changed = afterSections.find(item => item.id === section.id);
    if (!old || !changed) return section;
    const result = { ...section };
    for (const field of ['title', 'body', 'subtitle', 'pullLine', 'assetIds', 'coverAssetId', 'layout']) if (JSON.stringify(section[field]) === JSON.stringify(changed[field])) result[field] = old[field];
    return result;
  });
  if (JSON.stringify(current.selected) === JSON.stringify(after.selected)) {
    for (const section of previousSections) if (!afterSections.some(item => item.id === section.id) && !restored.some(item => item.id === section.id)) restored.push(section);
    restored.sort((a, b) => next.selected.indexOf(a.assetIds[0]) - next.selected.indexOf(b.assetIds[0]));
  }
  if (current.format === 'editorial') next.editorial = { ...current.editorial, sections: restored }; else next.sections = restored;
  if (current.presentation && JSON.stringify(current.presentation) === JSON.stringify(after.presentation)) next.presentation = before.presentation;
  else if (current.presentation?.spreads && before.presentation?.spreads && after.presentation?.spreads) {
    next.presentation = { ...current.presentation, spreads: current.presentation.spreads.map(spread => { const old = before.presentation.spreads.find(item => item.id === spread.id), changed = after.presentation.spreads.find(item => item.id === spread.id); if (!old || !changed) return spread; const result = { ...spread }; for (const field of ['heading', 'note', 'assetIds', 'layout']) if (JSON.stringify(spread[field]) === JSON.stringify(changed[field])) result[field] = old[field]; return result; }) };
  }
  if (next.presentation) next.presentation = reconcilePresentation(next.presentation, next.selected);
  return next;
}
