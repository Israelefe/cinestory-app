export const albumPhotoKey = photo => String(photo?.assetId || photo?.name || photo?.url || '');
export const albumSpreadPhotos = spread => spread?.photos || [spread?.photo1, spread?.photo2].filter(Boolean);

// A saved pair remains a pair on a spread, and becomes two complete phone pages.
// Source arrangements are never edited when the reading viewport changes.
export function albumReaderPages(spreads, compact) {
  return spreads.flatMap((spread, sourceIndex) => {
    const photos = albumSpreadPhotos(spread);
    if (!compact) return [{ ...spread, photos, sourceIndex }];
    return photos.map((photo, photoIndex) => ({
      ...spread, id: `${spread.id}-${photoIndex}`, photos: [photo], photo1: photo, photo2: undefined,
      sourceIndex, sourceLayout: spread.layout, layout: 'single',
      title: photoIndex === 0 ? spread.title : photo.headline || '',
      copy: photoIndex === 0 ? spread.copy : photo.caption || ''
    }));
  });
}

export function albumBookRatio(spread) {
  const photos = albumSpreadPhotos(spread);
  const ratio = photo => photo?.width > 0 && photo?.height > 0 ? photo.width / photo.height : .75;
  if (spread?.layout === 'wide') return Math.max(1.5, Math.min(2.3, ratio(photos[0]) + .12));
  if (photos.length > 1) {
    // The left page can be a portrait while the right contains landscapes.
    // Match both page shapes instead of sizing the whole book from photo one.
    const left = ratio(photos[0]);
    const right = photos.slice(1).reduce((sum, photo) => sum + 1 / ratio(photo), 0);
    return Math.max(1.1, Math.min(3.2, left + 1 / right + .14));
  }
  return Math.max(.45, Math.min(2.5, ratio(photos[0]) + .08));
}

export function albumPageProportions(photos) {
  const ratio = photo => photo?.width > 0 && photo?.height > 0 ? photo.width / photo.height : .75;
  if (photos.length < 2) return undefined;
  return `${ratio(photos[0])}fr ${1 / photos.slice(1).reduce((sum, photo) => sum + 1 / ratio(photo), 0)}fr`;
}

export function albumCoverRatio(photo) {
  if (!(photo?.width > 0 && photo?.height > 0)) return .74;
  return Math.max(.74, Math.min(1.32, (photo.width / photo.height) * .72 + .14));
}

export function albumCoverShape(photo) {
  return photo?.width > 0 && photo?.height > 0 && photo.width / photo.height >= 1.25
    ? 'landscape'
    : 'portrait';
}
