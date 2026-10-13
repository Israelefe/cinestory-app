export function selectionSnapshot(draft = {}) {
  return { selected: (draft.selectedAssetIds || []).map(String), reviewed: (draft.reviewedAssetIds || []).map(String), cursor: draft.cursor || 0, history: [] };
}
export function decidePhoto(state, id, choose, nextCursor, maximum = Infinity, replaceId) {
  const chosen = state.selected.includes(id), reviewed = state.reviewed.includes(id);
  const atLimit = choose && !chosen && state.selected.length >= maximum;
  const replacing = atLimit ? maximum === 1 ? state.selected[0] : replaceId : undefined;
  if (atLimit && !state.selected.includes(replacing)) return state;
  return { selected: choose ? [...new Set([...state.selected.filter(value => value !== replacing), id])] : state.selected.filter(value => value !== id),
    reviewed: [...new Set([...state.reviewed, id])], cursor: nextCursor,
    history: [...state.history, { id, chosen, reviewed, cursor: state.cursor, snapshot: { selected: state.selected, reviewed: state.reviewed, cursor: state.cursor } }].slice(-30) };
}
export function undoDecision(state) {
  const previous = state.history.at(-1); if (!previous) return state;
  if (previous.snapshot) return { ...previous.snapshot, history: state.history.slice(0, -1) };
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
