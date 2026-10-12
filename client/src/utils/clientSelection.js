export function selectionSnapshot(draft = {}) {
  return { selected: (draft.selectedAssetIds || []).map(String), reviewed: (draft.reviewedAssetIds || []).map(String), cursor: draft.cursor || 0, history: [] };
}
export function decidePhoto(state, id, choose, nextCursor, maximum = Infinity) {
  const chosen = state.selected.includes(id), reviewed = state.reviewed.includes(id);
  if (choose && !chosen && state.selected.length >= maximum) return state;
  return { selected: choose ? [...new Set([...state.selected, id])] : state.selected.filter(value => value !== id),
    reviewed: [...new Set([...state.reviewed, id])], cursor: nextCursor,
    history: [...state.history, { id, chosen, reviewed, cursor: state.cursor }].slice(-30) };
}
export function undoDecision(state) {
  const previous = state.history.at(-1); if (!previous) return state;
  return { selected: previous.chosen ? [...new Set([...state.selected, previous.id])] : state.selected.filter(id => id !== previous.id),
    reviewed: previous.reviewed ? state.reviewed : state.reviewed.filter(id => id !== previous.id), cursor: previous.cursor, history: state.history.slice(0, -1) };
}
export function selectionFingerprint(state) { return JSON.stringify([state.selected, state.reviewed, state.cursor]); }
export function matchEditorReturns(files, assets) {
  const stem = name => String(name).replace(/\.[^.]+$/, '').toLowerCase();
  return [...files].map(file => {
    const name = stem(file.name), plain = name.replace(/[-_ ](?:edit|edited|retouched|final)$/, '');
    const matches = assets.filter(asset => stem(asset.originalFilename) === name || stem(asset.originalFilename) === plain);
    return { id: crypto.randomUUID(), file, sourceAssetId: matches.length === 1 ? matches[0].id : '' };
  });
}
