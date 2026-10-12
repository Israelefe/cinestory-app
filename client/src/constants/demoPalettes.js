// Demo art direction only. Published deliveries keep the photographer's palette.
export const DEMO_PALETTES = {
  canvas: { background: '#0a231c', surface: '#16392e', text: '#f3f0dc', accent: '#a8ddba' },
  gridboard: { background: '#2b1713', surface: '#42251e', text: '#fff2df', accent: '#f3c885' }
};

export function demoPaletteVariables(format) {
  if (!Object.hasOwn(DEMO_PALETTES, format)) return {};
  const palette = DEMO_PALETTES[format];
  return {
    '--demo-format': format,
    '--demo-bg': palette.background,
    '--demo-surface': palette.surface,
    '--demo-text': palette.text,
    '--demo-accent': palette.accent
  };
}
