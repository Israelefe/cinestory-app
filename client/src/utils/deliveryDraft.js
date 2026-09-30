export function creationPreviewBranding(user, entitlements) {
  const studio = entitlements?.features?.branding === 'studio' || (!entitlements && ['pro', 'studio'].includes(user?.plan));
  return studio ? { type: 'studio', name: user?.studio?.name || user?.name || 'Studio', logoUrl: user?.studio?.logoUrl || user?.avatar || '' }
    : { type: 'veylo', name: 'Veylo', logoUrl: '/veylo/veylo-mark.svg' };
}

function keepMediaUrls(previous, next) {
  if (!next) return next;
  if (!previous) return { ...next };
  const identity = next.publicId || next.catalogId || next.assetId;
  if (!identity || identity !== (previous.publicId || previous.catalogId || previous.assetId)) return { ...next };
  const merged = { ...next };
  for (const field of ['url', 'thumbnailUrl', 'srcSet']) {
    if (!merged[field] && previous[field]) merged[field] = previous[field];
  }
  return merged;
}

// Mutation responses contain stored media IDs; draft reads also include display URLs.
// Keep those URLs only for unchanged media in the same draft, without reviving removed files.
export function mergeDeliveryDraft(previous, next) {
  if (!next || !previous || !next._id || String(previous._id) !== String(next._id)) return next;
  const merged = { ...previous, ...next };
  if (Array.isArray(next.assets)) {
    const existing = new Map((previous.assets || []).map(asset => [String(asset.assetId), asset]));
    merged.assets = next.assets.map(asset => keepMediaUrls(existing.get(String(asset.assetId)), asset));
  }
  if ('soundtrack' in next) merged.soundtrack = keepMediaUrls(previous.soundtrack, next.soundtrack);
  if ('narration' in next && next.narration) {
    merged.narration = keepMediaUrls(previous.narration, next.narration);
    for (const part of ['opening', 'closing', 'captions']) {
      if (part in next.narration) merged.narration[part] = keepMediaUrls(previous.narration?.[part], next.narration[part]);
    }
  }
  return merged;
}
