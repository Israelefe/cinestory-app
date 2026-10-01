import { deliveryFontStyles } from './deliveryTypography.js';
import { colourContrast } from './editorial.js';

export const REVEAL_DEFAULTS = Object.freeze({ style: 'curtain', movement: true, ending: 'triptych' });
export const REVEAL_STYLES = { curtain: 'Curtain', fade: 'Soft fade', lift: 'Lift' };
export function revealSettings(delivery) {
  const saved = delivery?.creativeDirection?.reveal || {};
  return { style: Object.hasOwn(REVEAL_STYLES, saved.style) ? saved.style : 'curtain', movement: typeof saved.movement === 'boolean' ? saved.movement : true, ending: saved.ending === 'single' ? 'single' : 'triptych' };
}
export function revealPhotos(delivery, all = false) {
  const direction = delivery?.creativeDirection || {};
  const frames = new Map((direction.frames || []).map(frame => [String(frame.assetId), frame]));
  const photos = (delivery?.assets || []).map((asset, index) => ({ ...asset, ...frames.get(String(asset.assetId)), assetId: String(asset.assetId), url: asset.url, srcSet: asset.srcSet, thumbnailUrl: asset.thumbnailUrl, alt: asset.alt || `Photograph ${index + 1}` }));
  if (all) return photos;
  const ids = delivery?.curatedAssetIds?.length ? delivery.curatedAssetIds : direction.frames?.length ? direction.frames.map(frame => frame.assetId) : photos.map(photo => photo.assetId);
  const byId = new Map(photos.map(photo => [photo.assetId, photo]));
  return ids.map(id => byId.get(String(id))).filter(Boolean);
}
export function revealTheme(delivery) {
  const supplied = delivery?.creativeDirection?.palette || {};
  const defaults = { background: '#09090c', surface: '#141419', text: '#fffaf6', accent: '#ff9b8e' };
  const palette = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, /^#[0-9a-f]{6}$/i.test(supplied[key]) ? supplied[key] : fallback]));
  if (colourContrast(palette.background, palette.text) < 4.5) palette.text = colourContrast(palette.background, '#17130f') >= 4.5 ? '#17130f' : '#fffaf6';
  if (colourContrast(palette.surface, palette.text) < 4.5) palette.surface = palette.background;
  const accent = colourContrast(palette.background, palette.accent) >= 4.5 && colourContrast(palette.surface, palette.accent) >= 4.5 ? palette.accent : palette.text;
  return { ...deliveryFontStyles(delivery?.creativeDirection?.typography), '--rv-bg': palette.background, '--rv-surface': palette.surface, '--rv-ink': palette.text, '--rv-accent': accent, '--rv-colour': palette.accent, '--fd-accent': accent };
}
export function revealEndingPhotos(photos, closing, mode = 'triptych') {
  if (!closing) return photos.slice(-3);
  if (mode === 'single') return [closing];
  const supporting = photos.filter(photo => photo.assetId !== closing.assetId).slice(-2);
  return [supporting[0], closing, supporting[1]].filter(Boolean);
}
