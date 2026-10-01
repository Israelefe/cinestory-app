export const V3_FORMATS = Object.freeze({
  'photo-story': [5, 10], editorial: [5, 14], 'photo-reveal': [5, 12],
  canvas: [8, 18], chapters: [8, 20], album: [6, 16],
  'event-coverage': [10, 24], campaign: [6, 16]
});
export const V3_MUSIC_FORMATS = new Set(['photo-story', 'photo-reveal', 'album']);
export const V3_FONT_CHOICES = new Set(['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope']);
export const V3_DEFAULT_PALETTE = Object.freeze({ background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: '#ff5a47' });

export function contrastRatio(left, right) {
  const luminance = value => {
    const channels = value.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const a = luminance(left); const b = luminance(right);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function validShowcase(format, ids, assetIds) {
  const bounds = V3_FORMATS[format];
  if (!bounds || !Array.isArray(ids)) return false;
  if (ids.length < bounds[0] || ids.length > bounds[1]) return false;
  const unique = new Set(ids);
  return unique.size === ids.length && ids.every(id => assetIds.has(id));
}
