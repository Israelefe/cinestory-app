const demoScenes = [
  { title: 'Arrivals', copy: 'At the entrance, before the programme begins.', indexes: [0, 5, 13], layout: 'pair' },
  { title: 'The programme', copy: 'Speakers, performances, and the room listening.', indexes: [1, 6, 7, 11, 3, 15], layout: 'hero' },
  { title: 'Between sessions', copy: 'Conversations away from the stage.', indexes: [2, 9, 12], layout: 'triptych' },
  { title: 'The room', copy: 'The people and details around the gathering.', indexes: [4, 8, 10, 14], layout: 'cluster' }
];

export const eventPhotoKey = photo => String(photo?.assetId || photo?.name || photo?.url || '');

export function uniqueEventPhotos(photos = []) {
  const seen = new Set();
  return photos.filter(photo => {
    const key = eventPhotoKey(photo);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Bookends and scene assignments share one ownership set. A photograph can be
// shown only once in the presentation; the separate gallery retains every file.
export function eventCoveragePresentation(delivery, photographs, collection = photographs) {
  const photos = uniqueEventPhotos(photographs);
  const allPhotos = uniqueEventPhotos(collection);
  const isV3 = delivery?.schemaVersion === 3;
  const openingPhoto = (isV3 && allPhotos.find(photo => photo.assetId === delivery.v3?.openingAssetId)) || photos[0] || allPhotos[0];
  const requestedClosing = isV3 && allPhotos.find(photo => photo.assetId === delivery.v3?.closingAssetId);
  const closingPhoto = requestedClosing && eventPhotoKey(requestedClosing) !== eventPhotoKey(openingPhoto) ? requestedClosing : null;
  const seen = new Set([eventPhotoKey(openingPhoto), eventPhotoKey(closingPhoto)]);
  const byId = new Map(photos.map(photo => [eventPhotoKey(photo), photo]));
  const configured = delivery?.creativeDirection?.sections?.length
    ? delivery.creativeDirection.sections
    : delivery?.formatConfig?.sections || [];
  const source = !delivery
    ? demoScenes.map(scene => ({ ...scene, assetIds: scene.indexes.map(index => eventPhotoKey(photos[index])) }))
    : configured;
  const take = key => {
    const photo = byId.get(String(key));
    if (!photo || seen.has(eventPhotoKey(photo))) return null;
    seen.add(eventPhotoKey(photo));
    return photo;
  };
  const sections = source.map((section, index) => ({
    id: section.id || `section-${index + 1}`,
    title: section.title || section.name || section.headline || `Scene ${index + 1}`,
    copy: section.copy || section.subtitle || section.body || section.caption || section.description || '',
    layout: section.layout || ['pair', 'hero', 'triptych', 'cluster'][index % 4],
    accent: section.accent || '',
    sceneIndex: index,
    photos: (section.assetIds || section.photoIds || []).map(take).filter(Boolean)
  })).filter(section => section.photos.length);

  const remaining = photos.filter(photo => !seen.has(eventPhotoKey(photo)));
  if (remaining.length) {
    if (sections.length) {
      sections.push({ id: 'unassigned', title: 'More from the event', copy: '', layout: 'grid', sceneIndex: source.length, photos: remaining });
    } else {
      const size = Math.ceil(remaining.length / Math.min(4, remaining.length));
      for (let index = 0; index < remaining.length; index += size) {
        const at = sections.length;
        sections.push({ id: `section-${at + 1}`, title: `Scene ${at + 1}`, copy: '', layout: ['hero', 'pair', 'triptych', 'cluster'][at % 4], sceneIndex: at, photos: remaining.slice(index, index + size) });
      }
    }
  }
  return { openingPhoto, closingPhoto, sections, galleryPhotos: allPhotos };
}

export function eventSceneAnchor(section) {
  const slug = String(section.id || section.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `event-scene-${slug || 'scene'}-${section.sceneIndex + 1}`;
}
