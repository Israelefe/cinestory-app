import { CAMPAIGN_DEMO_SETS } from '../constants/campaignDemo.js';

export const campaignPhotoKey = photo => String(photo?.assetId || photo?.name || photo?.url || '');
const designs = ['collection', 'detail', 'lifestyle', 'portrait', 'contact'];

function unique(photos) {
  const seen = new Set();
  return photos.filter(photo => {
    const key = campaignPhotoKey(photo);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ordered(photos, ids = []) {
  const byId = new Map(photos.map(photo => [campaignPhotoKey(photo), photo]));
  return unique([...ids.map(id => byId.get(String(id))).filter(Boolean), ...photos]);
}

// One ownership set covers the opening, saved sets and closing. Gallery-only
// files remain in the gallery, and overlapping set assignments never repeat.
export function campaignPresentation(delivery, photographs = [], collection = photographs) {
  const photos = ordered(photographs, delivery?.presentationOrder), galleryPhotos = ordered(collection, delivery?.galleryOrder);
  const byId = new Map(photos.map(photo => [campaignPhotoKey(photo), photo]));
  const allById = new Map(galleryPhotos.map(photo => [campaignPhotoKey(photo), photo]));
  const settings = delivery?.formatConfig?.campaign || {};
  const highlights = new Set((settings.highlightAssetIds || []).map(String));
  const v3 = delivery?.schemaVersion === 3;
  const openingPhoto = (v3 && allById.get(String(delivery.v3?.openingAssetId))) || photos.find(photo => highlights.has(campaignPhotoKey(photo))) || photos[0];
  const last = !delivery ? photos.at(-1) : v3 && allById.get(String(delivery.v3?.closingAssetId));
  const closingPhoto = last && campaignPhotoKey(last) !== campaignPhotoKey(openingPhoto) ? last : null;
  const used = new Set([campaignPhotoKey(openingPhoto), campaignPhotoKey(closingPhoto)]);
  const take = id => {
    const photo = byId.get(String(id));
    if (!photo || used.has(campaignPhotoKey(photo))) return null;
    used.add(campaignPhotoKey(photo));
    return photo;
  };
  const configured = delivery?.creativeDirection?.sections?.length ? delivery.creativeDirection.sections : delivery?.formatConfig?.sections?.length ? delivery.formatConfig.sections : settings.fileSets || [];
  const source = !delivery ? CAMPAIGN_DEMO_SETS.map(set => ({ ...set, assetIds: set.indexes.map(index => campaignPhotoKey(photos[index])) })) : configured;
  const sets = source.map((set, index) => {
    const assigned = (set.assetIds || set.photoIds || []).map(take).filter(Boolean);
    const preferred = assigned.find(photo => campaignPhotoKey(photo) === String(set.coverAssetId)) || assigned.find(photo => highlights.has(campaignPhotoKey(photo))) || assigned[0];
    return {
      id: set.id || `set-${index + 1}`, index,
      title: set.title || set.name || set.headline || `Photo set ${index + 1}`,
      copy: set.copy || set.subtitle || set.body || set.caption || set.description || '',
      label: set.label || set.eyebrow || '', layout: set.layout || 'grid', accent: set.accent || '',
      design: !delivery ? set.design : designs[index % designs.length],
      photos: preferred ? [preferred, ...assigned.filter(photo => photo !== preferred)] : []
    };
  }).filter(set => set.photos.length);
  const remaining = photos.filter(photo => !used.has(campaignPhotoKey(photo)));
  if (remaining.length) {
    if (sets.length) sets.push({ id: 'unassigned', index: source.length, title: 'More from the campaign', copy: '', layout: 'grid', design: 'contact', photos: remaining });
    else {
      // Contiguous groups retain the photographer's sequence in legacy files.
      const size = Math.ceil(remaining.length / Math.min(3, remaining.length));
      for (let at = 0; at < remaining.length; at += size) {
        const index = sets.length;
        sets.push({ id: `set-${index + 1}`, index, title: `Photo set ${index + 1}`, copy: '', layout: 'grid', design: designs[index % designs.length], photos: remaining.slice(at, at + size) });
      }
    }
  }
  return { openingPhoto, closingPhoto, sets, galleryPhotos, highlights };
}

export function campaignSetAnchor(set) {
  const slug = String(set.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `campaign-set-${slug || 'set'}-${set.index + 1}`;
}
