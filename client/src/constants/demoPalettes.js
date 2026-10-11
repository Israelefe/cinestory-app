// Demo art direction only. Published deliveries keep the photographer's palette.
export const DEMO_PALETTES = {
  'photo-story': { background: '#190f0d', surface: '#2c1a16', text: '#fff2e5', accent: '#f0b18b' },
  editorial: { background: '#211021', surface: '#351c32', text: '#fbf0e4', accent: '#e9c49a' },
  'photo-reveal': { background: '#09172c', surface: '#122744', text: '#f1f6ff', accent: '#acd9ff' },
  canvas: { background: '#0a231c', surface: '#16392e', text: '#f3f0dc', accent: '#a8ddba' },
  chapters: { background: '#17191c', surface: '#25282d', text: '#faf1df', accent: '#e4c183' },
  album: { background: '#1e1020', surface: '#342036', text: '#fbefdf', accent: '#e2b18a', paper: '#f6eee1' },
  'event-coverage': { background: '#071d2a', surface: '#103343', text: '#f0f8f7', accent: '#89e0d0' },
  campaign: { background: '#121b3b', surface: '#222e51', text: '#fff2e5', accent: '#ffc298' },
  gridboard: { background: '#2b1713', surface: '#42251e', text: '#fff2df', accent: '#f3c885' },
  photoswap: { background: '#09162d', surface: '#142b4d', text: '#f0f4ff', accent: '#a8caff' },
  video: { background: '#101014', surface: '#202027', text: '#faf2eb', accent: '#ffac9d' }
};

export function demoPaletteVariables(format) {
  if (!Object.hasOwn(DEMO_PALETTES, format)) return {};
  const palette = DEMO_PALETTES[format];
  return {
    '--demo-format': format,
    '--demo-bg': palette.background,
    '--demo-surface': palette.surface,
    '--demo-text': palette.text,
    '--demo-accent': palette.accent,
    '--demo-paper': palette.paper || palette.text
  };
}

export function demoFormatTheme(format) {
  const palette = DEMO_PALETTES[format];
  return {
    bg: palette.background,
    surface: palette.paper || palette.surface,
    text: palette.text,
    accent: palette.accent,
    demoStyles: demoPaletteVariables(format)
  };
}
