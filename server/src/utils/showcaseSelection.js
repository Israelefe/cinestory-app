const score = value => Number.isFinite(Number(value)) ? Math.max(1, Math.min(10, Number(value))) : 1;
const tags = row => (row.similarityTags || []).map(tag => String(tag).toLowerCase());
const similarity = (first, second) => {
  const left = new Set(tags(first)), right = new Set(tags(second));
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter(tag => right.has(tag)).length;
  return shared / new Set([...left, ...right]).size;
};

export function showcaseQuality(row) {
  const quality = row.quality;
  if (!quality) return score(row.score);
  return score(quality.sharpness) * .3 + score(quality.exposure) * .2 + score(quality.composition) * .3 + score(row.score) * .2;
}

// Reward strong photographs and useful coverage together. An excellent repeated
// pose should not crowd every different scene out of the shortlist.
export function variedShowcaseCandidates(insights, maximum) {
  const remaining = insights.map((row, index) => ({ row, index }));
  const chosen = [];
  const scenes = new Map();
  while (remaining.length && chosen.length < maximum) {
    let best = 0, bestValue = -Infinity;
    for (const [index, { row }] of remaining.entries()) {
      const repeat = chosen.reduce((value, other) => Math.max(value, similarity(row, other)), 0);
      const represented = (row.momentTags || []).reduce((sum, tag) => sum + (scenes.get(tag) || 0), 0);
      const unseen = (row.momentTags || []).some(tag => !scenes.has(tag));
      const value = showcaseQuality(row) - repeat * 3 - Math.min(2, represented * .3) + (unseen ? 1 : 0) - (row.unusable ? 10 : 0);
      if (value > bestValue) { best = index; bestValue = value; }
    }
    const [{ row }] = remaining.splice(best, 1);
    chosen.push(row);
    for (const tag of row.momentTags || []) scenes.set(tag, (scenes.get(tag) || 0) + 1);
  }
  return chosen;
}

export function showcaseBookends(insights, selected) {
  const extras = insights.filter(row => !selected.includes(row.assetId) && !row.unusable && showcaseQuality(row) >= 6);
  const ordered = extras.length >= 2 ? extras : selected.map(id => insights.find(row => row.assetId === id)).filter(Boolean);
  const ranked = variedShowcaseCandidates(ordered, ordered.length);
  const opening = ranked[0];
  const closing = ranked.find(row => row.assetId !== opening?.assetId && showcaseQuality(row) >= 6 && (!opening || similarity(row, opening) < .75)) || ranked.find(row => row.assetId !== opening?.assetId) || opening;
  return { openingAssetId: opening?.assetId, closingAssetId: closing?.assetId };
}
