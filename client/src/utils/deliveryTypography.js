export const DELIVERY_FONTS = Object.freeze(['Playfair Display', 'Outfit', 'Plus Jakarta Sans', 'Cormorant Garamond', 'DM Sans', 'Libre Baskerville', 'Manrope']);
export const DELIVERY_UI_FONT = "'Outfit', system-ui, sans-serif";

const aliases = { 'editorial-serif': 'Playfair Display', 'soft-serif': 'Cormorant Garamond', 'condensed-sans': 'Outfit', 'clean-sans': 'Plus Jakarta Sans' };
const serifFonts = new Set(['Playfair Display', 'Cormorant Garamond', 'Libre Baskerville']);

export function deliveryFontFamily(value, fallback = "'Playfair Display', Georgia, serif") {
  const name = typeof value === 'string' ? DELIVERY_FONTS.includes(value) ? value : Object.hasOwn(aliases, value) ? aliases[value] : null : null;
  return name ? `'${name}', ${serifFonts.has(name) ? 'Georgia, serif' : 'system-ui, sans-serif'}` : fallback;
}

export function deliveryFontStyles(typography = {}, defaults = {}) {
  const saved = typography || {};
  return {
    '--delivery-font-heading': deliveryFontFamily(saved.display || saved.displayFont, defaults.display),
    '--delivery-font-caption': deliveryFontFamily(saved.body || saved.bodyFont, defaults.body || DELIVERY_UI_FONT),
    '--delivery-font-ui': DELIVERY_UI_FONT
  };
}
