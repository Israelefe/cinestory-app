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
  if (photos.length > 1) return Math.max(1.25, Math.min(2.2, ratio(photos[0]) * 2 + .12));
  return Math.max(.65, Math.min(2.3, ratio(photos[0]) + .1));
}
