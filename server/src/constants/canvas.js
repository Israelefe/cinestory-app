/** Canvas stores relationships and order, never screen coordinates. */
export function canvasCheckpoints(delivery, ids = delivery?.curatedAssetIds || []) {
  const known = new Set(ids.map(String)), used = new Set(), names = new Set();
  const sections = (Array.isArray(delivery?.creativeDirection?.sections) ? delivery.creativeDirection.sections : []).filter(section => section && typeof section.id === 'string' && Array.isArray(section.assetIds));
  const raw = delivery?.formatConfig?.canvas?.checkpoints;
  const source = Array.isArray(raw) ? raw : sections.filter(section => section.id !== 'showcase').map(section => ({ id: `point-${section.id}`.slice(0, 60), type: 'group', sectionId: section.id }));
  const result = [];
  for (const point of source) {
    if (!point || typeof point !== 'object') continue;
    const section = point.type === 'group' ? sections.find(section => section.id === point.sectionId) : null;
    const assetIds = (section ? section.assetIds || [] : point.type === 'photo' ? [point.assetId] : []).map(String).filter(id => known.has(id) && !used.has(id) && used.add(id));
    if (!assetIds.length) continue;
    let id = /^[a-z0-9-]{1,60}$/.test(point.id || '') ? point.id : `point-${result.length + 1}`;
    const base = id; let suffix = 2;
    while (names.has(id)) id = `${base.slice(0, 54)}-${suffix++}`;
    names.add(id);
    const title = typeof section?.title === 'string' ? section.title : '';
    const note = typeof section?.subtitle === 'string' && section.subtitle ? section.subtitle : typeof section?.body === 'string' ? section.body : '';
    result.push(section ? { id, type: 'group', sectionId: section.id, assetIds, title, note } : { id, type: 'photo', assetId: assetIds[0], assetIds });
  }
  for (const assetId of ids.map(String)) if (!used.has(assetId)) {
    let id = `photo-${assetId}`.slice(0, 60);
    let suffix = result.length + 1;
    while (names.has(id)) id = `extra-${suffix++}`;
    names.add(id); used.add(assetId); result.push({ id, type: 'photo', assetId, assetIds: [assetId] });
  }
  return result;
}

export function canvasSettings(delivery, ids = delivery?.curatedAssetIds || []) {
  const raw = delivery?.formatConfig?.canvas || {};
  return { version: 1, arrangement: raw.arrangement === 'ordered' ? 'ordered' : 'spatial', photoMotion: raw.photoMotion === 'still' ? 'still' : 'gentle', showGroupNotes: raw.showGroupNotes !== false, checkpoints: canvasCheckpoints(delivery, ids).map(point => point.type === 'group' ? { id: point.id, type: 'group', sectionId: point.sectionId } : { id: point.id, type: 'photo', assetId: point.assetId }) };
}

export function reconcileCanvas(settings, sections, selected, oldId, newId, groupId) {
  const checkpoints = (settings?.checkpoints || []).map(point => point.type === 'photo' && point.assetId === oldId ? { ...point, assetId: newId } : point);
  const updated = sections.filter(section => section.id !== 'showcase').map(section => ({ ...section, assetIds: (section.assetIds || []).map(id => id === oldId ? newId : id).filter(id => selected.includes(id)) })).filter(section => section.assetIds.length);
  if (groupId && newId && selected.includes(newId)) {
    const group = updated.find(section => section.id === groupId);
    if (group && !group.assetIds.includes(newId)) group.assetIds.push(newId);
  }
  const delivery = { curatedAssetIds: selected, formatConfig: { canvas: { ...settings, checkpoints } }, creativeDirection: { sections: updated } };
  return { canvas: canvasSettings(delivery), sections: updated };
}

export function canvasIssues(checkpoints, sections, selected) {
  if (!Array.isArray(checkpoints) || !checkpoints.length || checkpoints.length > 18 || new Set(checkpoints.map(point => point.id)).size !== checkpoints.length) return 'Give each Canvas checkpoint a different ID.';
  const usedGroups = checkpoints.filter(point => point.type === 'group').map(point => point.sectionId);
  if (new Set(usedGroups).size !== usedGroups.length || usedGroups.some(id => !sections.some(section => section.id === id)) || sections.some(section => !usedGroups.includes(section.id))) return 'Connect each photo group to one Canvas checkpoint.';
  const all = checkpoints.flatMap(point => point.type === 'photo' ? [point.assetId] : sections.find(section => section.id === point.sectionId)?.assetIds || []);
  if (all.length !== selected.length || new Set(all).size !== all.length || all.some(id => !selected.includes(id))) return 'Place every showcase photograph in exactly one Canvas checkpoint.';
  return '';
}
