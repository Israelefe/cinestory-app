import { deliveryFontStyles } from './deliveryTypography.js';

export const EDITORIAL_LIMITS = Object.freeze({ headline: 80, summary: 300, introduction: 650, sectionTitle: 70, sectionBody: 700, caption: 320, closing: 280, note: 800, pullLine: 220 });
export const EDITORIAL_LAYOUTS = ['auto', 'hero', 'pair', 'triptych', 'feature', 'wide'];
export const EDITORIAL_TREATMENTS = ['classic', 'portrait', 'image'];
export const editorialLayoutLabel = { auto: 'Suggested layout', hero: 'Large photographs', pair: 'Balanced pair', triptych: 'Three photographs', feature: 'Photo and text', wide: 'Landscape spread' };
export const editorialTreatmentLabel = { classic: 'Classic feature', portrait: 'Portrait issue', image: 'Photo led' };

export function reconcileEditorial(value, selected, frames = []) {
  const source = value || {};
  const known = new Set(selected);
  const seen = new Set();
  const groups = (source.sections || []).map(section => ({ ...section, assetIds: (section.assetIds || []).filter(id => {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id); return true;
  }) })).filter(section => section.assetIds.length);
  // Section boundaries keep their text and size while photo arrows change order.
  let offset = 0;
  const sections = groups.map((section, index) => {
    const assetIds = selected.slice(offset, offset + section.assetIds.length);
    offset += assetIds.length;
    return { id: section.id || `feature-${index + 1}`, title: section.title || '', body: section.body || '', pullLine: section.pullLine || '', layout: EDITORIAL_LAYOUTS.includes(section.layout) ? section.layout : 'auto', assetIds };
  });
  const byId = new Map(frames.map(frame => [frame.assetId, frame]));
  if (offset < selected.length && sections.length) sections.at(-1).assetIds.push(...selected.slice(offset));
  if (!sections.length) {
    for (let index = 0; index < selected.length; index += 2) {
      const assetIds = selected.slice(index, index + 2);
      sections.push({ id: `feature-${index / 2 + 1}`, title: byId.get(assetIds[0])?.headline || '', body: '', pullLine: '', layout: 'auto', assetIds });
    }
  }
  for (const section of sections) {
    const sources = [section.body, ...section.assetIds.map(id => byId.get(id)?.caption || '')];
    if (section.pullLine && !sources.some(text => text.replace(/\s+/g, ' ').includes(section.pullLine.replace(/\s+/g, ' ')))) section.pullLine = '';
  }
  return { version: 1, introduction: source.introduction || '', note: source.note || '', issue: source.issue || '', treatment: EDITORIAL_TREATMENTS.includes(source.treatment) ? source.treatment : 'classic', credits: source.credits || [], sections };
}

export function editorialFromDelivery(delivery) {
  const direction = delivery?.creativeDirection || {};
  const selected = delivery?.curatedAssetIds?.length ? delivery.curatedAssetIds : (direction.frames || []).map(frame => frame.assetId);
  const legacySections = direction.sections?.filter(section => section.id !== 'showcase' && section.title !== 'The photographs');
  return reconcileEditorial(direction.editorial || { sections: legacySections }, selected, direction.frames || []);
}

// Reserve bookend photographs without changing the studio's saved sections or wording.
export function editorialReadingSections(sections, availableIds, bookendIds = []) {
  const available = new Set(availableIds);
  const seen = new Set(bookendIds);
  const result = [];
  const leadingCopy = [];
  for (const section of sections) {
    const assetIds = section.assetIds.filter(id => {
      if (!available.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (assetIds.length) {
      result.push({ ...section, assetIds, mergedCopy: leadingCopy.splice(0) });
    } else if (section.body) {
      // Keep paragraphs from a photo section that has moved to the cover or ending.
      const target = result.at(-1)?.mergedCopy || leadingCopy;
      target.push({ id: section.id, title: section.title, body: section.body });
    }
  }
  // Very small legacy collections can consist entirely of bookend photographs.
  if (!result.length && leadingCopy.length) {
    const [first, ...rest] = leadingCopy;
    result.push({ ...first, assetIds: [], pullLine: '', layout: 'auto', mergedCopy: rest });
  }
  return result;
}

export function editorialPhotos(delivery, all = false) {
  const frames = new Map((delivery.creativeDirection?.frames || []).map(frame => [frame.assetId, frame]));
  const assets = (delivery.assets || []).map((asset, index) => ({ ...asset, ...frames.get(asset.assetId), assetId: asset.assetId, url: asset.url, thumbnailUrl: asset.thumbnailUrl || asset.url, alt: asset.alt || `Photograph ${index + 1}`, name: asset.assetId }));
  if (all) return assets;
  const byId = new Map(assets.map(asset => [asset.assetId, asset]));
  const selected = delivery.curatedAssetIds?.length ? delivery.curatedAssetIds : assets.map(asset => asset.assetId);
  return selected.map(id => byId.get(id)).filter(Boolean);
}

export function colourContrast(first, second) {
  const luminance = hex => {
    const [r, g, b] = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return r * .2126 + g * .7152 + b * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function editorialTheme(delivery) {
  const supplied = delivery.creativeDirection?.palette || {};
  const defaults = { background: '#e7dfd1', surface: '#ded4c4', text: '#17130f', accent: '#a82f25' };
  const palette = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, /^#[0-9a-f]{6}$/i.test(supplied[key]) ? supplied[key] : fallback]));
  if (colourContrast(palette.background, palette.text) < 4.5) palette.text = colourContrast(palette.background, '#17130f') >= 4.5 ? '#17130f' : '#fffaf6';
  if (colourContrast(palette.surface, palette.text) < 4.5) palette.surface = palette.background;
  const accent = colourContrast(palette.background, palette.accent) >= 4.5 && colourContrast(palette.surface, palette.accent) >= 4.5 ? palette.accent : palette.text;
  return { ...deliveryFontStyles(delivery.creativeDirection?.typography), '--ed-bg': palette.background, '--ed-surface': palette.surface, '--ed-ink': palette.text, '--ed-accent': accent, '--ed-original-accent': palette.accent, '--fd-bg': palette.background, '--fd-text': palette.text };
}
