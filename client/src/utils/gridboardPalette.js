const DEFAULT_PALETTE = { background: '#13110f', surface: '#211b18', text: '#fff6ec', accent: '#efa57c' };

function colorProfile(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null;
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  let hue = 0;
  if (delta) hue = 60 * (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return { hue: (hue + 360) % 360, saturation, lightness };
}

function hsl(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const [r, g, b] = hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] : hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma] : hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return '#' + [r, g, b].map(value => Math.round((value + offset) * 255).toString(16).padStart(2, '0')).join('');
}

function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return 0;
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

function contrast(first, second) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

function blend(first, second, secondShare) {
  return '#' + [1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * (1 - secondShare) + parseInt(second.slice(index, index + 2), 16) * secondShare).toString(16).padStart(2, '0')).join('');
}

export function gridboardPaletteContrast(palette) {
  return {
    background: contrast(palette?.background, palette?.text),
    surface: contrast(palette?.surface, palette?.text),
    accent: Math.min(contrast(palette?.background, palette?.accent), contrast(palette?.surface, palette?.accent))
  };
}

export function gridboardAccentInk(accent) {
  return contrast(accent, '#111115') >= contrast(accent, '#fffaf5') ? '#111115' : '#fffaf5';
}

export function readableGridboardPalette(input, changedKey = '') {
  const palette = Object.fromEntries(Object.keys(DEFAULT_PALETTE).map(key => [key, /^#[0-9a-f]{6}$/i.test(input?.[key] || '') ? input[key].toLowerCase() : DEFAULT_PALETTE[key]]));
  const textChoices = [palette.text, '#fffaf5', '#111115', '#ffffff', '#000000'];
  let text = textChoices.find(candidate => contrast(palette.background, candidate) >= 4.5 && contrast(palette.surface, candidate) >= 4.5);
  if (!text) {
    if (changedKey === 'surface') palette.background = blend(palette.background, palette.surface, .8);
    else palette.surface = blend(palette.surface, palette.background, .8);
    text = textChoices.find(candidate => contrast(palette.background, candidate) >= 4.5 && contrast(palette.surface, candidate) >= 4.5);
  }
  palette.text = text || (luminance(palette.background) > .18 ? '#111115' : '#fffaf5');
  const accentReadable = color => contrast(palette.background, color) >= 3 && contrast(palette.surface, color) >= 3;
  if (!accentReadable(palette.accent)) {
    const hue = colorProfile(palette.accent)?.hue ?? colorProfile(palette.background)?.hue ?? 20;
    const candidates = [hsl(hue, .52, .7), hsl(hue, .6, .28), '#fffaf5', '#111115'];
    palette.accent = candidates.find(accentReadable) || palette.text;
  }
  return palette;
}

export function photoLedPalette(assets = []) {
  const buckets = Array.from({ length: 18 }, () => ({ weight: 0, hue: 0, saturation: 0 }));
  let brightness = 0, brightnessWeight = 0;
  for (const asset of assets) {
    const colors = asset.photoColors?.length ? asset.photoColors : asset.dominantColor ? [asset.dominantColor] : asset.analysis?.colors || [];
    colors.slice(0, 3).forEach((hex, index) => {
      const color = colorProfile(hex);
      if (!color) return;
      const weight = [3, 1.5, 1][index];
      brightness += color.lightness * weight;
      brightnessWeight += weight;
      if (color.saturation < .11 || color.lightness < .08 || color.lightness > .92) return;
      const bucket = buckets[Math.floor(color.hue / 20) % buckets.length];
      const influence = weight * Math.max(.2, color.saturation);
      bucket.weight += influence;
      bucket.hue += color.hue * influence;
      bucket.saturation += color.saturation * influence;
    });
  }
  const leading = buckets.reduce((best, bucket) => bucket.weight > best.weight ? bucket : best, buckets[0]);
  if (!leading.weight) return DEFAULT_PALETTE;
  const hue = leading.hue / leading.weight;
  const saturation = leading.saturation / leading.weight;
  const base = Math.max(.24, Math.min(.46, .2 + saturation * .34));
  const accent = Math.max(.38, Math.min(.58, .34 + saturation * .3));
  return brightnessWeight && brightness / brightnessWeight > .64
    ? { background: hsl(hue, base * .78, .945), surface: hsl(hue, base * .52, .985), text: hsl(hue, .2, .12), accent: hsl(hue, accent, .32) }
    : { background: hsl(hue, base, .095), surface: hsl(hue, base * .85, .155), text: hsl(hue, .18, .94), accent: hsl(hue, accent, .7) };
}

export function resolvedGridboardPalette(palette, assets = []) {
  const isDefault = !palette || Object.keys(DEFAULT_PALETTE).every(key => String(palette[key] || '').toLowerCase() === DEFAULT_PALETTE[key]);
  return readableGridboardPalette(isDefault ? photoLedPalette(assets) : palette);
}
